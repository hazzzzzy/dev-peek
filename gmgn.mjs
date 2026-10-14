import "./shared.js";

const { number, addressKind, normalizeAddress } = globalThis.DevPeek;
let queue = Promise.resolve();
let gate;
let publicKeyTask;

export class GmgnError extends Error {
  constructor(message, stop = false, requiresKey = false) {
    super(message);
    this.stop = stop;
    this.requiresKey = requiresKey;
  }
}

// 本地存储只允许扩展后台访问，内容脚本通过消息读取非敏感设置。
const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).then(
  () => null,
  () => new GmgnError("无法初始化本地密钥存储，请重新加载扩展", true),
);

export async function getApiKey() {
  const error = await storageReady;
  if (error) throw error;
  try {
    const { gmgnApiKey } = await chrome.storage.local.get("gmgnApiKey");
    return typeof gmgnApiKey === "string" ? gmgnApiKey.trim() : "";
  } catch {
    throw new GmgnError("无法读取本地 GMGN 密钥，请刷新页面重试", true);
  }
}

function keyPem(label, buffer) {
  const encoded = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return `-----BEGIN ${label}-----\n${encoded.match(/.{1,64}/g).join("\n")}\n-----END ${label}-----\n`;
}

export function getPublicKey() {
  publicKeyTask ??= (async () => {
    const error = await storageReady;
    if (error) throw error;
    const { gmgnKeyPair: saved } = await chrome.storage.local.get("gmgnKeyPair");
    if (saved) {
      if (!["Ed25519", "RSA-2048"].includes(saved.algorithm)
        || typeof saved.publicKey !== "string" || !saved.publicKey
        || typeof saved.privateKey !== "string" || !saved.privateKey) {
        throw new GmgnError("本地公钥记录不完整，无法读取；请勿使用不完整的公钥申请 API Key");
      }
      return { publicKey: saved.publicKey, algorithm: saved.algorithm };
    }
    let pair;
    let algorithm = "Ed25519";
    try {
      pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    } catch (error) {
      if (error.name !== "NotSupportedError") throw error;
      // 保持 Chrome 114 起的兼容性：不支持 Ed25519 时生成 GMGN 同样接受的 RSA 公钥。
      algorithm = "RSA-2048";
      pair = await crypto.subtle.generateKey({
        name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256",
      }, true, ["sign", "verify"]);
    }
    const [publicBytes, privateBytes] = await Promise.all([
      crypto.subtle.exportKey("spki", pair.publicKey),
      crypto.subtle.exportKey("pkcs8", pair.privateKey),
    ]);
    const publicKey = keyPem("PUBLIC KEY", publicBytes);
    await chrome.storage.local.set({ gmgnKeyPair: {
      algorithm, publicKey, privateKey: keyPem("PRIVATE KEY", privateBytes),
    } });
    return { publicKey, algorithm };
  })().catch((error) => {
    publicKeyTask = null;
    throw error;
  });
  return publicKeyTask;
}

function sleep(ms, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

function cooldownMessage(until) {
  return `GMGN 限频，${new Date(until).toLocaleTimeString("zh-CN", { hour12: false })} 后可重试`;
}

async function request(path, params, signal) {
  const run = async () => {
    signal.throwIfAborted();
    const apiKey = await getApiKey();
    signal.throwIfAborted();
    if (!apiKey) throw new GmgnError("请先输入 GMGN API Key", true, true);
    gate ??= (await chrome.storage.session.get("gmgnGate")).gmgnGate || { recent: [], until: 0 };
    if (gate.until > Date.now()) throw new GmgnError(cooldownMessage(gate.until), true);
    gate.recent = gate.recent.filter((at) => Date.now() - at < 60000);
    // 沿用源项目实测的免费额度：所有标签页共用一个请求队列。
    if (gate.recent.length >= 40) throw new GmgnError("本分钟请求已达上限，请稍后重试", true);
    const wait = Math.max(0, (gate.recent.at(-1) || 0) + 1200 - Date.now());
    if (wait) await sleep(wait, signal);
    signal.throwIfAborted();
    gate.recent.push(Date.now());
    await chrome.storage.session.set({ gmgnGate: gate });

    const url = new URL(path, "https://openapi.gmgn.ai");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("timestamp", Math.floor(Date.now() / 1000));
    url.searchParams.set("client_id", crypto.randomUUID());
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      signal.throwIfAborted();
      const response = await fetch(url, {
        headers: { "X-APIKEY": apiKey, "Content-Type": "application/json" },
        credentials: "omit", cache: "no-store", signal: controller.signal,
      });
      const text = await response.text();
      let payload = null;
      try { payload = JSON.parse(text); } catch { /* 先处理 HTTP 429，即使响应内容不是 JSON。 */ }
      if (response.status === 429 || ["RATE_LIMIT_EXCEEDED", "RATE_LIMIT_BANNED", "ERROR_RATE_LIMIT_BLOCKED"].includes(payload?.error)) {
        const reset = Number(payload?.reset_at || response.headers.get("x-ratelimit-reset")) * 1000;
        gate.until = Number.isFinite(reset) && reset > Date.now() ? reset : Date.now() + 300000;
        await chrome.storage.session.set({ gmgnGate: gate });
        throw new GmgnError(cooldownMessage(gate.until), true);
      }
      if (!payload || typeof payload !== "object") {
        throw new GmgnError(`GMGN 返回非 JSON 对象（HTTP ${response.status}）`, [401, 403].includes(response.status), [401, 403].includes(response.status));
      }
      if (!response.ok || payload?.code !== 0) {
        const detail = String(payload?.message || payload?.error || `HTTP ${response.status}`).replaceAll(apiKey, "[已隐藏]").slice(0, 180);
        throw new GmgnError(`GMGN 查询失败：${detail}`, [401, 403].includes(response.status), [401, 403].includes(response.status));
      }
      return payload.data;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof GmgnError) throw error;
      throw new GmgnError(controller.signal.aborted ? "GMGN 请求超时" : "无法连接 GMGN，请检查浏览器网络或代理");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
    }
  };
  const result = queue.then(run);
  queue = result.catch(() => {}); // 队列继续运行，原始错误由 result 返回给调用方。
  return result;
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function fetchWallet(chain, address, signal) {
  const data = await request("/v1/user/wallet_stats", { chain, wallet_address: address, period: "30d" }, signal);
  const row = Array.isArray(data) ? data[0] : Array.isArray(data?.list) ? data.list[0] : data;
  if (!row || typeof row !== "object") throw new GmgnError("钱包资料格式不正确");
  const common = row.common || {};
  const tags = Array.isArray(common.tags) ? common.tags.filter((tag) => typeof tag === "string") : [];
  if (text(common.tag) && !tags.includes(common.tag)) tags.push(common.tag);
  const result = {
    chain, balance: number(row.native_balance), name: text(common.name) || text(common.ens),
    createdAt: number(common.created_at), tags, fundFrom: text(common.fund_from),
    fundAddress: addressKind(common.fund_from_address) ? normalizeAddress(common.fund_from_address) : null,
  };
  if (result.balance === null && !result.name && !result.createdAt && !tags.length && !result.fundFrom && !result.fundAddress) {
    throw new GmgnError("GMGN 未返回该链的钱包资料");
  }
  return result;
}

export async function fetchLaunches(chain, address, signal) {
  const data = await request("/v1/user/created_tokens", {
    chain, wallet_address: address, order_by: "token_ath_mc", direction: "desc",
  }, signal);
  if (!Array.isArray(data?.tokens)) throw new GmgnError("发币记录格式不正确");
  const tokens = data.tokens.filter((row) => addressKind(row.token_address)).map((row) => ({
    chain, address: normalizeAddress(row.token_address), symbol: text(row.symbol),
    launchpadPlatform: text(row.launchpad_platform),
    createdAt: number(row.create_timestamp), marketCap: number(row.market_cap),
    peak: number(row.token_ath_mc), summaryOnly: false,
  }));
  const ath = data.creator_ath_info;
  if (ath && addressKind(ath.ath_token) && number(ath.ath_mc) !== null) {
    const bestAddress = normalizeAddress(ath.ath_token);
    const listed = tokens.find((token) => token.address === bestAddress);
    if (listed) listed.peak = Math.max(listed.peak ?? 0, number(ath.ath_mc));
    else tokens.push({
      chain, address: bestAddress, symbol: text(ath.token_symbol) || text(ath.token_name),
      launchpadPlatform: null,
      createdAt: null, marketCap: null, peak: number(ath.ath_mc), summaryOnly: true,
    });
  }
  const openCount = number(data.open_count);
  let innerCount = number(data.inner_count);
  const useListedCount = openCount === 0;
  // 已毕业为零时，未毕业按返回明细条数显示；明细可能被接口截断。
  if (useListedCount) innerCount = data.tokens.length;
  const total = Number.isSafeInteger(openCount) && Number.isSafeInteger(innerCount) ? openCount + innerCount : null;
  const countError = total === null ? "GMGN 未提供有效的已毕业／未毕业数量" : null;
  return { chain, tokens, openCount, innerCount, countError, truncated: total === null || useListedCount ? data.tokens.length >= 100 : total > data.tokens.length };
}

export async function fetchToken(chain, address, signal) {
  const data = await request("/v1/token/info", { chain, address }, signal);
  if (!data || typeof data !== "object") throw new GmgnError("代币资料格式不正确");
  const price = number(data.price?.price);
  const supply = number(data.circulating_supply);
  const creator = data.dev?.creator_address;
  return {
    dev: addressKind(creator) ? normalizeAddress(creator) : null,
    symbol: text(data.symbol) || text(data.name),
    launchpadPlatform: text(data.launchpad_platform),
    createdAt: number(data.creation_timestamp),
    marketCap: price !== null && supply !== null ? price * supply : null,
  };
}
