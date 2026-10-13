import "./shared.js";
import { fetchWallet, fetchLaunches, fetchToken, getApiKey, getPublicKey, GmgnError } from "./gmgn.mjs";

const { chains, addressKind, normalizeAddress, tokenRoute, compareTokens } = globalThis.DevPeek;
const jobs = new Map();
const connections = new Set();

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!["get-settings", "get-public-key", "save-api-key", "save-preferences"].includes(message?.type)) return;
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.tab
    || !["https://gmgn.ai", "https://axiom.trade"].includes(sender.origin)) return;
  const handle = async () => {
    const apiKey = await getApiKey();
    if (message.type === "get-public-key") return getPublicKey();
    if (message.type === "get-settings") {
      const preferences = await chrome.storage.local.get(["panelPosition", "panelTheme", "dockTop", "panelCollapsed"]);
      return { ...preferences, hasApiKey: Boolean(apiKey) };
    }
    if (message.type === "save-api-key") {
      const key = typeof message.key === "string" ? message.key.trim() : "";
      if (!key || key.length > 4096 || !/^[\x21-\x7e]+$/.test(key)) throw new Error("请输入完整的 GMGN API Key，不要包含空格或换行");
      const tabs = await chrome.tabs.query({});
      await chrome.storage.local.set({ gmgnApiKey: key });
      for (const leave of connections) leave();
      // 只广播设置变更，不向标签页发送密钥；未注入扩展的标签页无需处理。
      await Promise.allSettled(tabs.filter((tab) => tab.id != null).map((tab) =>
        chrome.tabs.sendMessage(tab.id, { type: "key-updated" }, { frameId: 0 })));
      return {};
    }
    const preferences = {};
    const value = message.preferences;
    if (["dark", "light"].includes(value?.panelTheme)) preferences.panelTheme = value.panelTheme;
    if (typeof value?.panelCollapsed === "boolean") preferences.panelCollapsed = value.panelCollapsed;
    if (Number.isFinite(value?.panelPosition?.x) && Number.isFinite(value?.panelPosition?.y)) {
      preferences.panelPosition = { x: value.panelPosition.x, y: value.panelPosition.y };
    }
    if (Number.isFinite(value?.dockTop)) preferences.dockTop = value.dockTop;
    await chrome.storage.local.set(preferences);
    return {};
  };
  handle().then((result) => respond({ ok: true, ...result }), (error) => respond({ ok: false, error: error.message }));
  return true;
});

function send(port, message) {
  try { port.postMessage(message); } catch { /* 标签页已关闭，断开事件负责取消查询。 */ }
}

async function runProfile(job, preferredChain) {
  const { address, controller } = job;
  const signal = controller.signal;
  const scan = addressKind(address) === "sol" ? ["sol"] : ["robinhood", "bsc", "eth", "base", "arc"];
  scan.sort((a, b) => Number(b === preferredChain) - Number(a === preferredChain));
  const emit = (event) => {
    job.events.push(event);
    for (const [port, requestId] of job.listeners) send(port, { ...event, requestId });
  };
  const tokens = new Map();
  const errors = [];
  let completed = 0;
  let total = scan.length * 2;
  emit({ type: "start", address, chains: scan, total });

  const phase = async (kind, chain, fetch) => {
    emit({ type: "progress", detail: `${chains[chain].label} · ${kind === "wallet" ? "钱包" : "发币"}`, completed, total });
    try {
      const payload = await fetch(chain, address, signal);
      signal.throwIfAborted();
      if (kind === "launches") for (const token of payload.tokens) tokens.set(`${chain}:${token.address}`, token);
      emit({ type: kind, payload });
    } catch (error) {
      signal.throwIfAborted();
      if (error.stop) throw error;
      const detail = `${chains[chain].label} ${kind === "wallet" ? "钱包" : "发币"}：${error.message}`;
      errors.push(detail);
      emit({ type: "partial-error", kind, chain, detail });
    }
    completed++;
  };

  try {
    // 一次发币返回已经包含列表各列；先出峰值排名，再补钱包资料与余额。
    for (const chain of scan) await phase("launches", chain, fetchLaunches);
    const missing = [...tokens.values()].sort(compareTokens).slice(0, 10).filter((token) => token.summaryOnly);
    total += missing.length;
    for (const token of missing) {
      emit({ type: "progress", detail: "补全历史峰值代币", completed, total });
      try {
        const detail = await fetchToken(token.chain, token.address, signal);
        signal.throwIfAborted();
        emit({ type: "token", payload: { ...token, symbol: detail.symbol || token.symbol, createdAt: detail.createdAt, marketCap: detail.marketCap } });
      } catch (error) {
        signal.throwIfAborted();
        if (error.stop) throw error;
        const detail = `${chains[token.chain].label} 峰值代币补全失败：${error.message}`;
        errors.push(detail);
        emit({ type: "partial-error", kind: "token", chain: token.chain, detail });
      }
      completed++;
    }
    for (const chain of scan) await phase("wallet", chain, fetchWallet);
    emit({ type: "done", errors, completed, total, elapsed: Date.now() - job.started });
  } catch (error) {
    if (!signal.aborted) emit({ type: "error", detail: error.message, requiresKey: error.requiresKey === true, completed, total });
  } finally {
    if (jobs.get(address) === job) jobs.delete(address);
    job.finished = true;
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "dev-peek" || port.sender?.frameId !== 0 || !port.sender?.tab
    || !["https://gmgn.ai", "https://axiom.trade"].includes(new URL(port.sender.url).origin)) {
    port.disconnect();
    return;
  }
  let job;
  let verifying;
  let generation = 0;
  const leave = () => {
    generation++;
    verifying?.abort();
    verifying = null;
    if (job) {
      job.listeners.delete(port);
      if (!job.listeners.size && !job.finished) {
        job.controller.abort();
        if (jobs.get(job.address) === job) jobs.delete(job.address);
      }
    }
    job = null;
  };
  connections.add(leave);

  port.onMessage.addListener(async (message) => {
    if (message.type === "ping") return;
    if (message.type === "cancel") { leave(); return; }
    if (message.type !== "query") return;
    leave();
    const current = generation;
    const requestId = message.requestId;
    try {
      const route = tokenRoute(message.url);
      let address = normalizeAddress(message.address);
      if (!route) throw new GmgnError("页面地址无效");
      const preferredChain = route.chain || (route.site === "axiom"
        ? (Object.hasOwn(chains, message.chain) ? message.chain : addressKind(address) === "sol" ? "sol" : null) : null);
      const isSolPage = route.site === "axiom" ? addressKind(address) === "sol" : route.chain === "sol";
      if (!addressKind(address) || (addressKind(address) === "sol") !== isSolPage
        || (preferredChain && (preferredChain === "sol") !== isSolPage)) {
        throw new GmgnError("开发者地址或页面地址无效");
      }
      if (!await getApiKey()) throw new GmgnError("请先输入 GMGN API Key", true, true);
      if (current !== generation) return;
      if (message.verify) {
        if (!addressKind(route.address)) throw new GmgnError("当前代币地址不完整，无法确认切页后的 DEV，请打开完整代币链接");
        if (!preferredChain) throw new GmgnError("页面未提供链信息，无法确认切页后的 DEV，请刷新页面");
        verifying = new AbortController();
        send(port, { type: "progress", detail: "确认切页后的开发者", requestId });
        const token = await fetchToken(preferredChain, route.address, verifying.signal);
        if (current !== generation) return;
        if (!token.dev) throw new GmgnError("GMGN 未返回当前代币的开发者，无法确认页面是否已更新");
        if (route.site === "axiom" && token.dev !== address) throw new GmgnError("GMGN 与 Axiom 的 DEV 不一致，无法确认切页后的数据，请刷新页面");
        address = token.dev;
      }
      if (current !== generation) return;
      let existing = jobs.get(address);
      if (existing) {
        job = existing;
        job.listeners.set(port, requestId);
        for (const event of job.events) send(port, { ...event, requestId });
      } else {
        job = { address, controller: new AbortController(), listeners: new Map([[port, requestId]]), events: [], started: Date.now(), finished: false };
        jobs.set(address, job);
        void runProfile(job, preferredChain);
      }
    } catch (error) {
      if (current === generation) send(port, { type: "error", detail: error.message, requiresKey: error.requiresKey === true, requestId });
    }
  });
  port.onDisconnect.addListener(() => { leave(); connections.delete(leave); });
});

chrome.webNavigation.onHistoryStateUpdated.addListener((event) => {
  if (event.frameId === 0) chrome.tabs.sendMessage(event.tabId, { type: "route" }, { frameId: 0 }).catch(() => {});
}, { url: [{ hostEquals: "gmgn.ai" }, { hostEquals: "axiom.trade" }] });

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: "toggle" }, { frameId: 0 }).catch(() => {});
  }
});
