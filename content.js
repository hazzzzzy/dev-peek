(() => {
  if (globalThis.__devPeekMounted) return;
  globalThis.__devPeekMounted = true;
  const D = globalThis.DevPeek;
  const DEV_AREA = '[data-sentry-component="DevInfo"]';
  const host = document.createElement("div");
  host.id = "dev-peek-extension";
  host.dataset.theme = "light";
  host.style.cssText = "position:fixed;z-index:2147483646;visibility:hidden;display:none";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("link");
  let styleLoaded = false;
  style.rel = "stylesheet";
  style.href = chrome.runtime.getURL("panel.css");
  style.onload = () => { styleLoaded = true; host.style.visibility = keyLoading ? "hidden" : "visible"; clampPosition(); };
  style.onerror = () => { console.error("DEV Peek：浮窗样式加载失败，请刷新页面或重新加载扩展。"); };
  shadow.append(style);
  const panel = document.createElement("section");
  panel.id = "dev-peek-panel";
  panel.setAttribute("aria-label", "开发者资料与发币记录");
  panel.innerHTML = `
    <header tabindex="0" data-tooltip="长按顶栏非按钮区域拖动，方向键可移动">
      <a class="author-link" href="https://x.com/200uperday" target="_blank" rel="noopener noreferrer" draggable="false">By <img class="author-avatar" src="${chrome.runtime.getURL("assets/6lnt50An_400x400.jpg")}" width="16" height="16" alt="" draggable="false"><span>Bro9</span></a>
      <div class="actions">
        <button class="search-dev" type="button" data-tooltip="在 X 搜索 DEV" aria-label="在新标签页的 X 搜索 DEV 地址" disabled></button>
        <button class="copy-dev" data-tooltip="复制 DEV 地址" aria-label="复制 DEV 地址" disabled></button>
        <button class="theme-toggle" data-tooltip="切换为黑夜模式" aria-label="切换为黑夜模式"></button>
        <button class="collapse" data-tooltip="收起" aria-label="收起" aria-expanded="true"></button>
      </div>
    </header>
    <form class="key-setup">
      <div class="key-step">1. 复制 Public Key</div>
      <div class="key-actions">
        <button class="public-key-copy" type="button" disabled>复制公钥</button>
        <a class="key-create" href="https://gmgn.ai/ai" target="_blank" rel="noopener noreferrer">前往 GMGN 创建 Key</a>
      </div>
      <p class="public-key-message failed" role="status" hidden></p>
      <label for="gmgn-api-key">2. 填入 GMGN API Key</label>
      <p class="key-hint">将完整公钥粘贴到 GMGN 创建页面，再把获得的 API Key 填在下方。密钥仅保存在当前浏览器。</p>
      <input id="gmgn-api-key" type="password" placeholder="输入 GMGN API Key" autocomplete="off" spellcheck="false" maxlength="4096" required disabled>
      <div class="key-actions">
        <button class="key-save" type="submit" disabled>保存并查询</button>
      </div>
      <p class="key-message" role="status">正在读取本地密钥…</p>
    </form>
    <div class="body" hidden>
      <div class="identity"></div>
      <div class="balances"></div>
      <div class="table-wrap">
        <table aria-label="峰值最高的十个代币">
          <colgroup><col><col class="col-age"><col class="col-cap"><col class="col-peak"></colgroup>
          <thead><tr><th class="name-cell">代币</th><th data-tooltip="创建至今">创建</th><th data-tooltip="当前市值，美元">市值</th><th data-tooltip="历史峰值，美元；按峰值降序，当前市值为次序">峰值</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="issues" hidden></div>
      <footer><span class="status" role="status"></span></footer>
    </div>`;
  shadow.append(panel);
  const dock = document.createElement("button");
  dock.className = "edge-tab";
  dock.type = "button";
  dock.hidden = true;
  dock.dataset.tooltip = "点击展开 DEV 分析，按住上下拖动";
  dock.setAttribute("aria-label", "展开 DEV 分析");
  dock.setAttribute("aria-controls", panel.id);
  dock.innerHTML = '<span>DEV分析</span>';
  shadow.append(dock);
  const walletTooltip = document.createElement("div");
  walletTooltip.id = "dev-peek-wallet-tags";
  walletTooltip.className = "wallet-tooltip";
  walletTooltip.setAttribute("role", "tooltip");
  walletTooltip.hidden = true;
  shadow.append(walletTooltip);
  const tokenPopover = document.createElement("div");
  tokenPopover.id = "dev-peek-token-platforms";
  tokenPopover.className = "token-popover";
  tokenPopover.setAttribute("role", "group");
  tokenPopover.hidden = true;
  shadow.append(tokenPopover);
  const textTooltip = document.createElement("div");
  textTooltip.id = "dev-peek-tooltip";
  textTooltip.className = "text-tooltip";
  textTooltip.setAttribute("role", "tooltip");
  textTooltip.hidden = true;
  shadow.append(textTooltip);
  const $ = (selector) => panel.querySelector(selector);
  const icons = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    copy: '<rect x="8" y="8" width="11" height="12" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    external: '<path d="M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
    moon: '<path d="M20.8 13.1A9 9 0 0 1 10.9 3.2a9 9 0 1 0 9.9 9.9Z"/>',
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  $(".search-dev").innerHTML = icon("search");
  $(".copy-dev").innerHTML = icon("copy");
  $(".collapse").innerHTML = icon("close");
  $(".theme-toggle").innerHTML = icon("moon");

  let route = null;
  let previousDev = null;
  let routeChangedAt = 0;
  let candidate = null;
  let candidateSince = 0;
  let scanTimer;
  let port;
  let heartbeat;
  let sequence = 0;
  let collapsed = false;
  let collapseTouched = false;
  let themeTouched = false;
  let fontError = null;
  let dragging;
  let position;
  let dockTop;
  let suppressDockClick = false;
  let walletTooltipTarget;
  let walletTooltipTimer;
  let tokenPopoverTarget;
  let tokenPopoverTimer;
  let textTooltipTarget;
  let textTooltipTimer;
  let keyLoading = true;
  let keySaving = false;
  let hasApiKey = false;
  let keyError = "";
  let publicKey = "";
  let publicKeyLoading = false;
  let publicKeyCopying = false;
  let publicKeyCopied = false;
  let publicKeyError = "";
  let settingsSequence = 0;
  let state = emptyState();
  const tagLabels = { kol: "KOL", renowned: "KOL", smart_degen: "聪明钱", smart_money: "聪明钱", fresh_wallet: "新钱包", whale: "巨鲸", creator: "创建者", dev_team: "项目方", sniper: "狙击", rat_trader: "老鼠仓", bundler: "捆绑", top_holder: "头部持仓", wash_trader: "刷量" };

  function emptyState() {
    return { address: null, requested: false, busy: false, queryChains: [], launchFailed: false, wallets: new Map(), launches: new Map(), tokens: new Map(), errors: [], walletErrors: new Map(), status: "等待开发者信息" };
  }

  async function settingsMessage(message) {
    const result = await chrome.runtime.sendMessage(message);
    if (!result?.ok) throw new Error(result?.error || "扩展后台未返回设置，请刷新页面重试");
    return result;
  }

  async function loadSettings() {
    const current = ++settingsSequence;
    keyLoading = true;
    keyError = "";
    render();
    try {
      const result = await settingsMessage({ type: "get-settings" });
      if (current !== settingsSequence) return;
      hasApiKey = result.hasApiKey;
      const saved = result.panelPosition;
      if (!dragging && Number.isFinite(result.dockTop)) dockTop = result.dockTop;
      if (!dragging && Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) position = saved;
      if (!themeTouched && ["dark", "light"].includes(result.panelTheme)) applyTheme(result.panelTheme);
      if (!collapseTouched && typeof result.panelCollapsed === "boolean") applyCollapsed(result.panelCollapsed);
    } catch (error) {
      if (current !== settingsSequence) return;
      hasApiKey = false;
      keyError = `无法读取本地设置：${error.message}`;
    } finally {
      if (current === settingsSequence) {
        keyLoading = false;
        if (styleLoaded) host.style.visibility = "visible";
        render();
        if (!hasApiKey) void loadPublicKey();
        scheduleScan();
      }
    }
  }

  async function loadPublicKey() {
    if (publicKey || publicKeyLoading) return;
    publicKeyLoading = true;
    publicKeyError = "";
    render();
    try {
      const result = await settingsMessage({ type: "get-public-key" });
      publicKey = result.publicKey;
    } catch (error) {
      publicKeyError = `公钥生成或读取失败：${error.message}`;
    } finally {
      publicKeyLoading = false;
      render();
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function chainIcon(chain) {
    const img = element("img", "chain-icon");
    img.src = chrome.runtime.getURL(`assets/${chain}.svg`);
    img.alt = D.chains[chain].label;
    img.dataset.tooltip = D.chains[chain].label;
    img.draggable = false;
    img.width = img.height = 14;
    return img;
  }

  async function copy(value, button) {
    if (!value) return;
    const original = icon("copy");
    try {
      await navigator.clipboard.writeText(value);
      button.innerHTML = icon("check");
      button.classList.add("copied");
      setTimeout(() => { button.innerHTML = original; button.classList.remove("copied"); }, 1200);
    } catch {
      state.errors.push("复制失败，请检查剪贴板权限");
      render();
    }
  }

  function renderIdentity() {
    const area = $(".identity");
    area.replaceChildren();
    const names = new Map();
    for (const wallet of state.wallets.values()) {
      if (!wallet.name) continue;
      if (!names.has(wallet.name)) names.set(wallet.name, []);
      names.get(wallet.name).push(D.chains[wallet.chain].label);
    }
    for (const [name, labels] of names) {
      const item = element("span", "identity-item", name);
      item.dataset.tooltip = `${labels.join(" / ")}：${name}`;
      area.append(item);
    }
    area.hidden = !area.childElementCount;
  }

  function renderBalances() {
    hideWalletTooltip();
    const area = $(".balances");
    area.replaceChildren();
    const kind = D.addressKind(state.address) || (route?.chain === "sol" ? "sol" : "evm");
    for (const chain of D.balanceChains) {
      const applicable = (chain === "sol") === (kind === "sol");
      const wallet = state.wallets.get(chain);
      const failed = state.walletErrors.get(chain);
      const pending = applicable && !wallet && !failed && state.busy;
      const cell = element("div", "wallet-cell");
      cell.setAttribute("aria-label", `${D.chains[chain].label} 钱包资料`);
      const fields = element("div", "wallet-fields");
      const summary = element("div", "wallet-summary");
      const balanceRow = element("div", "wallet-balance");
      balanceRow.append(chainIcon(chain));
      const value = element("span", "balance-value");
      if (!applicable) {
        value.textContent = "无";
        balanceRow.dataset.tooltip = "当前 DEV 地址不适用于该链";
      } else if (failed) {
        value.textContent = "失败";
        value.classList.add("failed");
        balanceRow.dataset.tooltip = failed;
      } else if (pending) {
        value.classList.add("skeleton");
      } else if (wallet?.balance != null) {
        const balance = wallet.balance;
        value.textContent = balance === 0 ? "0" : balance > 0 && balance < 0.01 ? "<0.01" : balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        balanceRow.dataset.tooltip = `${balance.toLocaleString("en-US", { maximumSignificantDigits: 15 })} ${D.chains[chain].unit}`;
      } else {
        value.textContent = "无";
        balanceRow.dataset.tooltip = wallet ? "GMGN 未提供余额" : "尚未取得余额";
      }
      balanceRow.append(value);
      const ageRow = element("div", "wallet-age");
      ageRow.dataset.tooltip = "钱包年龄：d 天，h 小时，m 分钟，s 秒";
      ageRow.setAttribute("aria-label", "钱包年龄");
      ageRow.innerHTML = icon("clock");
      const age = element("span", pending ? "wallet-age-value skeleton age-skeleton" : "wallet-age-value", pending ? "" : failed ? "失败" : D.age(wallet?.createdAt).replace(/天$/, "d").replace(/小时$/, "h").replace(/分钟$/, "m").replace(/秒$/, "s"));
      ageRow.hidden = !pending && !failed && age.textContent === "无";
      if (failed) age.classList.add("failed");
      if (wallet?.createdAt) {
        age.dataset.timestamp = wallet.createdAt;
        age.dataset.tooltip = new Date(wallet.createdAt * 1000).toLocaleString("zh-CN");
      }
      ageRow.append(age);
      summary.append(balanceRow, ageRow);
      const meta = element("div", "wallet-meta");
      meta.hidden = !pending && !failed && !wallet?.fundAddress;
      const sourceRow = element("div", "wallet-source");
      const sourceLabel = element("span", "muted", "来源钱包");
      if (wallet?.fundFrom) sourceLabel.dataset.tooltip = wallet.fundFrom;
      sourceRow.append(sourceLabel);
      const sourceValue = element("div", "wallet-source-value");
      if (wallet?.fundAddress) {
        const copySource = element("button", "source-action");
        copySource.type = "button";
        copySource.dataset.tooltip = "复制来源钱包地址";
        copySource.setAttribute("aria-label", copySource.dataset.tooltip);
        copySource.innerHTML = icon("copy");
        copySource.addEventListener("click", () => copy(wallet.fundAddress, copySource));
        const gmgn = element("a", "source-action");
        gmgn.href = `https://gmgn.ai/${chain}/address/${wallet.fundAddress}`;
        gmgn.target = "_blank";
        gmgn.rel = "noopener noreferrer";
        gmgn.dataset.tooltip = "在 GMGN 查看来源钱包";
        gmgn.setAttribute("aria-label", gmgn.dataset.tooltip);
        gmgn.innerHTML = icon("external");
        sourceValue.append(copySource, gmgn);
      } else if (pending) {
        sourceValue.append(element("span", "skeleton source-skeleton"));
      } else if (failed) {
        sourceValue.append(element("span", "failed", "失败"));
      } else {
        sourceValue.append(element("span", "muted", "无"));
      }
      sourceRow.append(sourceValue);
      meta.append(sourceRow);
      fields.append(summary, meta);
      const tags = [...new Set((wallet?.tags || []).map((tag) => tagLabels[tag] || tag))];
      if (tags.length) {
        // 字段说明与标签共用提示层，避免重复提示。
        for (const node of fields.querySelectorAll("[data-tooltip]")) {
          node.dataset.walletHint = node.dataset.tooltip;
          node.removeAttribute("data-tooltip");
        }
        cell.tabIndex = 0;
        cell.addEventListener("pointerover", (event) => showWalletTooltip(cell, tags, event.target));
        cell.addEventListener("pointerleave", () => {
          if (!cell.contains(shadow.activeElement)) scheduleHideWalletTooltip();
        });
        cell.addEventListener("focusin", (event) => showWalletTooltip(cell, tags, event.target));
        cell.addEventListener("focusout", (event) => {
          if (!cell.contains(event.relatedTarget) && !cell.matches(":hover")) scheduleHideWalletTooltip();
        });
      }
      cell.append(fields);
      area.append(cell);
    }
    const graduation = element("div", "wallet-cell graduation-cell");
    const label = element("div", "graduation-label");
    label.append(element("span", "market-green", "已毕业"), element("span", "muted", "/"), element("span", "market-red", "未毕业"));
    const values = element("div", "graduation-values");
    const complete = state.queryChains.length > 0 && state.queryChains.every((chain) => state.launches.has(chain));
    if (state.launchFailed || (state.requested && !state.busy && !complete)) {
      values.append(element("span", "failed graduation-message", "统计失败"));
    } else if (state.busy && !complete) {
      values.append(element("span", "skeleton graduation-skeleton"));
    } else {
      const launches = state.queryChains.map((chain) => state.launches.get(chain));
      const opened = complete ? launches.reduce((sum, item) => sum + item.openCount, 0) : null;
      const inner = complete ? launches.reduce((sum, item) => sum + item.innerCount, 0) : null;
      values.append(element("span", "market-green", opened ?? "无"), element("span", "muted", "/"), element("span", "market-red", inner ?? "无"));
    }
    graduation.append(label, values);
    area.append(graduation);
  }

  function positionAbove(popup, target) {
    const anchor = target.getBoundingClientRect();
    const availableHeight = anchor.top - 14;
    // 顶部空间不足时不翻转到下方，也不遮住触发元素。
    if (availableHeight < 24) return false;
    popup.style.maxHeight = `${availableHeight}px`;
    popup.style.left = "0px";
    popup.style.top = "0px";
    popup.hidden = false;
    const rect = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - rect.width - 8))}px`;
    popup.style.top = `${anchor.top - rect.height - 6}px`;
    return true;
  }

  function hideTextTooltip() {
    clearTimeout(textTooltipTimer);
    if (textTooltipTarget) {
      const ids = (textTooltipTarget.getAttribute("aria-describedby") || "").split(/\s+/).filter((id) => id && id !== textTooltip.id);
      if (ids.length) textTooltipTarget.setAttribute("aria-describedby", ids.join(" "));
      else textTooltipTarget.removeAttribute("aria-describedby");
    }
    textTooltipTarget = null;
    textTooltip.hidden = true;
  }

  function scheduleHideTextTooltip() {
    clearTimeout(textTooltipTimer);
    textTooltipTimer = setTimeout(hideTextTooltip, 120);
  }

  function showTextTooltip(event) {
    if (textTooltip.contains(event.target)) return;
    const target = event.target.closest("[data-tooltip]");
    if (target === textTooltipTarget) {
      clearTimeout(textTooltipTimer);
      return;
    }
    hideTextTooltip();
    if (!target?.dataset.tooltip || dragging || target.closest(".token-link") || (collapsed && target !== dock)) return;
    hideWalletTooltip();
    hideTokenPopover();
    textTooltipTarget = target;
    textTooltip.textContent = target.dataset.tooltip;
    target.setAttribute("aria-describedby", [target.getAttribute("aria-describedby"), textTooltip.id].filter(Boolean).join(" "));
    if (!positionAbove(textTooltip, target)) hideTextTooltip();
  }

  function hideTooltips() {
    hideTextTooltip();
    hideWalletTooltip();
    hideTokenPopover();
  }

  shadow.addEventListener("pointerover", showTextTooltip);
  shadow.addEventListener("focusin", showTextTooltip);
  for (const type of ["pointerout", "focusout"]) {
    shadow.addEventListener(type, (event) => {
      if (textTooltipTarget?.contains(event.target) && !textTooltipTarget.contains(event.relatedTarget) && !textTooltip.contains(event.relatedTarget)) scheduleHideTextTooltip();
    });
  }
  textTooltip.addEventListener("pointerenter", () => clearTimeout(textTooltipTimer));
  textTooltip.addEventListener("pointerleave", scheduleHideTextTooltip);
  shadow.addEventListener("click", hideTextTooltip);

  function hideWalletTooltip() {
    clearTimeout(walletTooltipTimer);
    walletTooltipTarget?.removeAttribute("aria-describedby");
    walletTooltipTarget = null;
    walletTooltip.hidden = true;
  }

  function scheduleHideWalletTooltip() {
    clearTimeout(walletTooltipTimer);
    walletTooltipTimer = setTimeout(hideWalletTooltip, 120);
  }

  function showWalletTooltip(cell, tags, target) {
    hideTextTooltip();
    hideWalletTooltip();
    hideTokenPopover();
    if (collapsed || dragging) return;
    walletTooltipTarget = cell;
    cell.setAttribute("aria-describedby", walletTooltip.id);
    walletTooltip.replaceChildren(...tags.map((tag) => element("span", "tag", tag)));
    const hint = target.closest("[data-wallet-hint]")?.dataset.walletHint;
    if (hint) walletTooltip.append(element("div", "wallet-tooltip-hint", hint));
    if (!positionAbove(walletTooltip, cell)) hideWalletTooltip();
  }

  walletTooltip.addEventListener("pointerenter", () => clearTimeout(walletTooltipTimer));
  walletTooltip.addEventListener("pointerleave", scheduleHideWalletTooltip);
  shadow.addEventListener("scroll", (event) => {
    if (![textTooltip, walletTooltip, tokenPopover].some((popup) => popup.contains(event.target))) hideTooltips();
  }, { capture: true, passive: true });
  window.addEventListener("scroll", hideTooltips, { capture: true, passive: true });
  shadow.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !textTooltip.hidden) {
      event.preventDefault();
      event.stopPropagation();
      hideTextTooltip();
    }
    if (event.key === "Escape" && !tokenPopover.hidden) {
      event.preventDefault();
      event.stopPropagation();
      tokenPopoverTarget?.focus({ preventScroll: true });
      hideTokenPopover();
    }
    if (event.key === "Escape" && !walletTooltip.hidden) {
      event.preventDefault();
      event.stopPropagation();
      hideWalletTooltip();
    }
  });

  function hideTokenPopover() {
    clearTimeout(tokenPopoverTimer);
    tokenPopoverTarget?.setAttribute("aria-expanded", "false");
    tokenPopoverTarget = null;
    tokenPopover.hidden = true;
  }

  function scheduleHideTokenPopover() {
    clearTimeout(tokenPopoverTimer);
    tokenPopoverTimer = setTimeout(hideTokenPopover, 160);
  }

  function showTokenPopover(anchor, token) {
    clearTimeout(tokenPopoverTimer);
    if (collapsed || dragging || tokenPopoverTarget === anchor) return;
    hideTextTooltip();
    hideTokenPopover();
    hideWalletTooltip();
    tokenPopoverTarget = anchor;
    anchor.setAttribute("aria-expanded", "true");
    tokenPopover.replaceChildren();
    const axiomChain = token.chain === "bsc" ? "bnb" : token.chain;
    for (const [label, asset, href] of [
      ["GMGN", "gmgn.png", `https://gmgn.ai/${token.chain}/token/${D.referral}_${token.address}`],
      ["Axiom", "axiom.svg", `https://axiom.trade/t/${token.address}/@bro9?chain=${axiomChain}`],
    ]) {
      const link = element("a", "token-platform");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const logo = element("img");
      logo.src = chrome.runtime.getURL(`assets/${asset}`);
      logo.alt = "";
      logo.width = logo.height = 16;
      logo.draggable = false;
      link.append(logo, element("span", "", label));
      tokenPopover.append(link);
    }
    if (!positionAbove(tokenPopover, anchor)) hideTokenPopover();
  }

  tokenPopover.addEventListener("pointerenter", () => clearTimeout(tokenPopoverTimer));
  tokenPopover.addEventListener("pointerleave", () => {
    if (!tokenPopover.matches(":focus-within")) scheduleHideTokenPopover();
  });
  tokenPopover.addEventListener("focusin", () => clearTimeout(tokenPopoverTimer));
  tokenPopover.addEventListener("focusout", (event) => {
    if (!tokenPopover.contains(event.relatedTarget) && event.relatedTarget !== tokenPopoverTarget) scheduleHideTokenPopover();
  });
  tokenPopover.addEventListener("click", hideTokenPopover);
  shadow.addEventListener("pointerdown", (event) => {
    if (!tokenPopover.contains(event.target) && !tokenPopoverTarget?.contains(event.target)) hideTokenPopover();
  });

  function renderTokens() {
    hideTokenPopover();
    const body = $("tbody");
    body.replaceChildren();
    const tokens = [...state.tokens.values()].sort(D.compareTokens).slice(0, 10);
    if (!tokens.length) {
      if (state.busy) {
        for (let i = 0; i < 3; i++) {
          const row = element("tr");
          for (let col = 0; col < 4; col++) {
            const td = element("td");
            td.append(element("span", "skeleton row-skeleton"));
            row.append(td);
          }
          body.append(row);
        }
      } else {
        const row = element("tr");
        const cell = element("td", "empty", state.launches.size ? (state.errors.length ? "已返回的链暂无发币记录" : "暂无发币记录") : state.requested ? "未取得发币记录" : "等待开发者信息");
        cell.colSpan = 4;
        row.append(cell);
        body.append(row);
      }
      return;
    }
    tokens.forEach((token) => {
      const row = element("tr");
      const name = element("td", "name-cell");
      const link = element("span", "token-link");
      link.append(chainIcon(token.chain), element("span", "token-name", token.symbol || "无"));
      link.tabIndex = 0;
      link.setAttribute("aria-controls", tokenPopover.id);
      link.setAttribute("aria-expanded", "false");
      link.addEventListener("pointerenter", () => showTokenPopover(link, token));
      link.addEventListener("pointerleave", () => {
        if (!tokenPopover.matches(":focus-within")) scheduleHideTokenPopover();
      });
      link.addEventListener("focus", () => showTokenPopover(link, token));
      link.addEventListener("focusout", (event) => {
        if (!tokenPopover.contains(event.relatedTarget)) scheduleHideTokenPopover();
      });
      link.addEventListener("keydown", (event) => {
        if (!["ArrowUp", "ArrowDown", "Tab"].includes(event.key) || (event.key === "Tab" && event.shiftKey)) return;
        showTokenPopover(link, token);
        if (tokenPopover.hidden) return;
        event.preventDefault();
        tokenPopover.querySelector("a")?.focus({ preventScroll: true });
      });
      name.append(link);
      const created = element("td", "age-cell", D.age(token.createdAt));
      if (token.createdAt) {
        created.dataset.timestamp = token.createdAt;
        created.dataset.tooltip = new Date(token.createdAt * 1000).toLocaleString("zh-CN");
      } else created.dataset.tooltip = "GMGN 未提供创建时间";
      const cap = element("td", "cap-cell", D.marketCap(token.marketCap));
      const peak = element("td", "peak-cell", D.marketCap(token.peak));
      for (const [cell, value] of [[cap, token.marketCap], [peak, token.peak]]) {
        if (value > 1e9) cell.classList.add("market-red");
        else if (value > 1e6) cell.classList.add("market-purple");
        else if (value > 1e5) cell.classList.add("market-green");
        cell.dataset.tooltip = value == null ? "GMGN 未提供该字段" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
      }
      row.append(name, created, cap, peak);
      body.append(row);
    });
  }

  function render() {
    const setup = keyLoading || !hasApiKey || keySaving;
    $(".key-setup").hidden = !setup;
    $(".body").hidden = setup;
    $("#gmgn-api-key").disabled = keyLoading || keySaving;
    $(".key-save").disabled = keyLoading || keySaving;
    $(".key-save").textContent = keySaving ? "保存中…" : "保存并查询";
    const publicCopy = $(".public-key-copy");
    publicCopy.disabled = keyLoading || publicKeyLoading || publicKeyCopying;
    publicCopy.textContent = keyLoading ? "正在读取配置…" : publicKeyLoading ? "正在准备公钥…"
      : publicKeyCopying ? "复制中…" : publicKeyCopied ? "已复制" : publicKey ? "复制公钥" : "重试生成";
    const publicMessage = $(".public-key-message");
    publicMessage.textContent = publicKeyError;
    publicMessage.hidden = !publicKeyError;
    const message = $(".key-message");
    message.textContent = keyLoading ? "正在读取本地密钥…" : keyError;
    message.hidden = !message.textContent;
    message.classList.toggle("failed", Boolean(keyError));
    $(".copy-dev").disabled = setup || !state.address;
    $(".search-dev").disabled = setup || !state.address;
    if (setup) { clampPosition(); return; }
    renderIdentity();
    renderBalances();
    renderTokens();
    const notes = [...new Set(state.errors)];
    if (fontError) notes.push(fontError);
    const issues = $(".issues");
    issues.hidden = !notes.length;
    issues.replaceChildren(...notes.map((note) => element("p", "", note)));
    const status = $(".status");
    status.textContent = state.status;
    status.dataset.tooltip = state.status;
    $("footer").hidden = !state.status;
    status.classList.toggle("failed", !state.busy && state.errors.length > 0);
    updateAges();
    clampPosition();
  }

  function updateAges() {
    for (const cell of panel.querySelectorAll("[data-timestamp]")) {
      const age = D.age(cell.dataset.timestamp);
      cell.textContent = cell.classList.contains("wallet-age-value") ? age.replace(/天$/, "d").replace(/小时$/, "h").replace(/分钟$/, "m").replace(/秒$/, "s") : age;
    }
  }

  function stopConnection() {
    clearInterval(heartbeat);
    const previous = port;
    port = null;
    if (previous) {
      try { previous.postMessage({ type: "cancel" }); previous.disconnect(); } catch { /* 已断开的通道无需再次取消。 */ }
    }
  }

  function startQuery(found, verify) {
    if (!route || state.requested || keyLoading || keySaving || !hasApiKey) return;
    stopConnection();
    state = emptyState();
    state.requested = true;
    state.address = verify ? null : found.address;
    state.busy = true;
    state.status = "";
    previousDev = found;
    const requestId = ++sequence;
    const routeKey = route.key;
    render();
    try {
      const connection = chrome.runtime.connect({ name: "dev-peek" });
      port = connection;
      connection.onMessage.addListener((event) => {
        if (D.tokenRoute(location.href)?.key !== routeKey) { checkRoute(); return; }
        if (event.requestId !== requestId || port !== connection) return;
        if (event.type === "start") {
          state.address = event.address;
          state.queryChains = event.chains;
        } else if (event.type === "progress") {
          return;
        } else if (event.type === "launches") {
          state.launches.set(event.payload.chain, event.payload);
          if (event.payload.countError) {
            state.launchFailed = true;
            state.errors.push(`${D.chains[event.payload.chain].label} 毕业统计：${event.payload.countError}`);
          }
          for (const token of event.payload.tokens) state.tokens.set(`${token.chain}:${token.address}`, token);
        } else if (event.type === "token") {
          state.tokens.set(`${event.payload.chain}:${event.payload.address}`, event.payload);
        } else if (event.type === "wallet") {
          state.wallets.set(event.payload.chain, event.payload);
        } else if (event.type === "partial-error") {
          state.errors.push(event.detail);
          if (event.kind === "wallet") state.walletErrors.set(event.chain, event.detail);
          if (event.kind === "launches") state.launchFailed = true;
        } else if (event.type === "done" || event.type === "error") {
          state.busy = false;
          if (event.type === "error") state.errors.push(event.detail);
          if (event.requiresKey) {
            hasApiKey = false;
            keyError = `${event.detail}。请检查密钥及其查询权限后重新保存。`;
            void loadPublicKey();
          }
          state.status = event.type === "error" ? event.detail : "";
          stopConnection();
        }
        render();
      });
      connection.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        if (port !== connection) return;
        port = null;
        clearInterval(heartbeat);
        if (state.busy) {
          state.busy = false;
          state.status = "查询连接中断，请重新查询";
          state.errors.push(error ? "扩展后台连接中断，请刷新页面重新查询。" : state.status);
          render();
        }
      });
      heartbeat = setInterval(() => {
        try { connection.postMessage({ type: "ping" }); } catch { clearInterval(heartbeat); }
      }, 20000);
      connection.postMessage({ type: "query", requestId, url: location.href, address: found.address, chain: found.chain, verify });
    } catch {
      state.busy = false;
      state.status = "扩展已更新或不可用，请刷新页面";
      state.errors.push(state.status);
      render();
    }
  }

  function findDev() {
    if (route?.site === "axiom") {
      const explorers = { "robin.etherscan.io": "robinhood", "bscscan.com": "bsc", "etherscan.io": "eth", "basescan.org": "base", "solscan.io": "sol" };
      for (const icon of document.querySelectorAll("button .icon-chef-hat")) {
        const button = icon.closest("button");
        if (!button.getClientRects().length) continue;
        const label = /^(?:开发者|開發者|developer|dev|creator)(?:\s*(?:地址|address))?\s*[:：]?\s*/i;
        if (!label.test(button.textContent.trim())) continue;
        // 只读取开发者按钮所在行，不向外层卡片查找，以免取到下一行的资金来源。
        const row = button.closest("div");
        if (!row) continue;
        const links = [...row.querySelectorAll("a[href]")];
        for (const link of links) {
          const url = new URL(link.href, location.origin);
          const chain = explorers[url.hostname];
          const match = url.pathname.match(/^\/(?:address|account)\/([^/]+)\/?$/);
          if (url.protocol !== "https:" || !chain || !match || !D.addressKind(match[1])) continue;
          if ((chain === "sol") !== (D.addressKind(match[1]) === "sol")) continue;
          return { address: D.normalizeAddress(match[1]), chain, link, area: row };
        }
        for (const link of links) {
          const url = new URL(link.href, location.origin);
          if (url.protocol !== "https:" || !["x.com", "twitter.com"].includes(url.hostname) || url.pathname !== "/search") continue;
          const address = url.searchParams.get("q");
          if (!D.addressKind(address)) continue;
          return { address: D.normalizeAddress(address), chain: D.addressKind(address) === "sol" ? "sol" : null, link, area: row };
        }
      }
      return null;
    }
    for (const area of document.querySelectorAll(DEV_AREA)) {
      if (!area.getClientRects().length) continue;
      for (const row of area.querySelectorAll('[data-sentry-component="PoolItem"]')) {
        const label = row.firstElementChild?.textContent.trim();
        if (!/^(开发者|開發者|dev|developer|creator)$/i.test(label || "")) continue;
        for (const link of row.querySelectorAll('a[href*="/address/"]')) {
          const url = new URL(link.href, location.origin);
          const match = url.pathname.match(/^\/([^/]+)\/address\/([^/]+)\/?$/);
          if (url.origin !== location.origin || !match || !D.addressKind(match[2])) continue;
          const chain = { solana: "sol", ethereum: "eth" }[match[1]] || match[1];
          if (chain !== route?.chain || (chain === "sol") !== (D.addressKind(match[2]) === "sol")) continue;
          return { address: D.normalizeAddress(match[2]), link, area };
        }
      }
    }
    return null;
  }

  function scheduleScan(delay = 160) {
    if (scanTimer) return;
    scanTimer = setTimeout(() => { scanTimer = null; scan(); }, delay);
  }

  function scan() {
    checkRoute();
    if (!route || keyLoading || keySaving || !hasApiKey) return;
    const found = findDev();
    if (state.requested) {
      if (!found || found.address === state.address || found.address === previousDev?.address) return;
      // 页面晚于 URL 更新开发者时，释放旧查询并等新地址稳定。
      stopConnection();
      state = emptyState();
      candidate = null;
      render();
    }
    if (!found) {
      candidate = null;
      if (Date.now() - routeChangedAt > 10000) {
        state.status = "未找到 DEV，请展开页面的开发者信息";
        render();
      }
      return;
    }
    if (!candidate || candidate.address !== found.address || candidate.link !== found.link) {
      candidate = found;
      candidateSince = Date.now();
      scheduleScan(220);
      return;
    }
    if (Date.now() - candidateSince < 200) { scheduleScan(220); return; }
    // 跨页仍出现相同地址时，无法仅凭 DOM 区分同一 DEV 与旧内容残留。
    const stale = previousDev && previousDev.address === found.address;
    startQuery(found, Boolean(stale));
  }

  function checkRoute() {
    const next = D.tokenRoute(location.href);
    if (next?.key === route?.key) return;
    endDrag();
    hideTooltips();
    stopConnection();
    ++sequence;
    route = next;
    routeChangedAt = Date.now();
    candidate = null;
    state = emptyState();
    host.style.display = next ? "block" : "none";
    if (next) {
      if (!host.isConnected) document.documentElement.append(host);
      render();
      scheduleScan();
    } else {
      host.remove();
    }
  }

  function clampPosition() {
    hideTooltips();
    if (!route) return;
    const width = Math.min(344, Math.max(240, window.innerWidth - 16));
    if (!position) position = { x: window.innerWidth - width - 16, y: 76 };
    if (collapsed) {
      dockTop = Math.max(8, Math.min(dockTop ?? position.y, window.innerHeight - 100));
      host.style.width = "28px";
      host.style.left = `${Math.max(0, window.innerWidth - 28)}px`;
      host.style.top = `${dockTop}px`;
      return;
    }
    host.style.width = `${width}px`;
    position.x = Math.max(8, Math.min(position.x, window.innerWidth - width - 8));
    position.y = Math.max(8, Math.min(position.y, window.innerHeight - Math.min(panel.offsetHeight || 40, window.innerHeight - 16) - 8));
    host.style.left = `${position.x}px`;
    host.style.top = `${position.y}px`;
  }

  function savePosition() {
    settingsMessage({ type: "save-preferences", preferences: collapsed ? { dockTop } : { panelPosition: position } }).catch(() => {
      state.errors.push("浮窗位置未能保存");
      render();
    });
  }

  function applyCollapsed(value) {
    collapsed = value;
    panel.hidden = collapsed;
    dock.hidden = !collapsed;
    $(".collapse").setAttribute("aria-expanded", String(!collapsed));
    clampPosition();
  }

  function collapse() {
    endDrag();
    collapseTouched = true;
    applyCollapsed(!collapsed);
    (collapsed ? dock : $("header")).focus({ preventScroll: true });
    settingsMessage({ type: "save-preferences", preferences: { panelCollapsed: collapsed } }).catch(() => {
      state.errors.push("浮窗折叠状态未能保存");
      render();
    });
  }

  function applyTheme(theme) {
    host.dataset.theme = theme;
    const button = $(".theme-toggle");
    button.innerHTML = icon(theme === "dark" ? "sun" : "moon");
    button.dataset.tooltip = theme === "dark" ? "切换为白天模式" : "切换为黑夜模式";
    button.setAttribute("aria-label", button.dataset.tooltip);
  }

  $(".copy-dev").addEventListener("click", () => copy(state.address, $(".copy-dev")));
  $(".public-key-copy").addEventListener("click", async () => {
    if (!publicKey) { void loadPublicKey(); return; }
    if (publicKeyCopying) return;
    publicKeyCopying = true;
    publicKeyCopied = false;
    publicKeyError = "";
    render();
    try {
      await navigator.clipboard.writeText(publicKey);
      publicKeyCopied = true;
      setTimeout(() => { publicKeyCopied = false; render(); }, 1200);
    } catch {
      publicKeyError = "复制失败，请检查剪贴板权限后重试";
    } finally {
      publicKeyCopying = false;
      render();
    }
  });
  $(".key-setup").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (keyLoading || keySaving) return;
    const input = $("#gmgn-api-key");
    const key = input.value.trim();
    if (!key) { keyError = "请输入 GMGN API Key"; render(); input.focus(); return; }
    keySaving = true;
    keyError = "";
    render();
    try {
      await settingsMessage({ type: "save-api-key", key });
      hasApiKey = true;
      input.value = "";
      stopConnection();
      state = emptyState();
      candidate = null;
    } catch (error) {
      keyError = `密钥保存失败：${error.message}`;
    } finally {
      keySaving = false;
      render();
    }
    if (!keyError) scheduleScan();
  });
  $(".search-dev").addEventListener("click", () => {
    if (state.address) window.open(`https://x.com/search?q=${encodeURIComponent(state.address)}`, "_blank", "noopener,noreferrer");
  });
  $(".collapse").addEventListener("click", collapse);
  dock.addEventListener("click", (event) => {
    if (suppressDockClick && event.detail !== 0) {
      suppressDockClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    collapse();
  });
  $(".theme-toggle").addEventListener("click", () => {
    themeTouched = true;
    const theme = host.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    settingsMessage({ type: "save-preferences", preferences: { panelTheme: theme } }).catch(() => {
      state.errors.push("主题偏好未能保存");
      render();
    });
  });
  const header = $("header");
  header.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary || event.target.closest("button, a") || dragging) return;
    event.preventDefault();
    hideTooltips();
    dragging = { target: header, pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: position.x, top: position.y, active: false };
    header.setPointerCapture(event.pointerId);
    dragging.timer = setTimeout(() => {
      dragging.active = true;
      panel.classList.add("dragging");
    }, 100);
  });
  header.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    if (!dragging.active) {
      dragging.x = event.clientX;
      dragging.y = event.clientY;
      return;
    }
    position = { x: dragging.left + event.clientX - dragging.x, y: dragging.top + event.clientY - dragging.y };
    clampPosition();
  });
  const endDrag = (event) => {
    if (!dragging || (event?.pointerId !== undefined && event.pointerId !== dragging.pointerId)) return;
    const { timer, active, pointerId, target } = dragging;
    clearTimeout(timer);
    dragging = null;
    panel.classList.remove("dragging");
    dock.classList.remove("dragging");
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    if (active) savePosition();
  };
  header.addEventListener("pointerup", endDrag);
  header.addEventListener("pointercancel", endDrag);
  header.addEventListener("lostpointercapture", endDrag);
  dock.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary || dragging) return;
    event.preventDefault();
    hideTooltips();
    dock.focus({ preventScroll: true });
    suppressDockClick = false;
    dragging = { target: dock, pointerId: event.pointerId, y: event.clientY, top: dockTop, active: false };
    dock.setPointerCapture(event.pointerId);
  });
  dock.addEventListener("pointermove", (event) => {
    if (!dragging || dragging.target !== dock || event.pointerId !== dragging.pointerId) return;
    const offset = event.clientY - dragging.y;
    if (!dragging.active && Math.abs(offset) < 4) return;
    dragging.active = true;
    suppressDockClick = true;
    dock.classList.add("dragging");
    dockTop = dragging.top + offset;
    clampPosition();
  });
  dock.addEventListener("pointerup", endDrag);
  dock.addEventListener("pointercancel", endDrag);
  dock.addEventListener("lostpointercapture", endDrag);
  dock.addEventListener("keydown", (event) => {
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    dockTop += event.key === "ArrowUp" ? -8 : 8;
    clampPosition();
    savePosition();
  });
  window.addEventListener("blur", (event) => { endDrag(event); hideTooltips(); });
  header.addEventListener("keydown", (event) => {
    if (event.target !== header) return;
    const moves = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] };
    if (!moves[event.key]) return;
    event.preventDefault();
    position.x += moves[event.key][0];
    position.y += moves[event.key][1];
    clampPosition();
    savePosition();
  });
  window.addEventListener("resize", clampPosition);
  window.addEventListener("popstate", () => { checkRoute(); scheduleScan(); });
  window.addEventListener("pageshow", () => { checkRoute(); scheduleScan(); });
  window.addEventListener("pagehide", () => {
    endDrag();
    hideTooltips();
    stopConnection();
    if (state.busy) { state.requested = false; state.busy = false; }
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "route") { checkRoute(); scheduleScan(); }
    if (message.type === "toggle" && route) collapse();
    if (message.type === "key-updated" && !keySaving) {
      stopConnection();
      state = emptyState();
      candidate = null;
      void loadSettings();
    }
  });
  const observer = new MutationObserver(() => {
    checkRoute();
    if (route && !state.requested) scheduleScan();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
  setInterval(() => {
    if (document.hidden) return;
    checkRoute();
    if (route) {
      scan();
      updateAges();
      if (!host.isConnected) document.documentElement.append(host);
    }
  }, 1000);
  void loadSettings();
  // 在文档字体集中注册，保证 Shadow DOM 内也使用本地完整字库。
  const font = new FontFace("DEV Peek Noto Sans SC Variable", `url("${chrome.runtime.getURL("assets/fonts/NotoSansSC-Variable.ttf")}") format("truetype")`, { weight: "100 900", style: "normal", display: "swap" });
  document.fonts.add(font);
  font.load().then(clampPosition).catch(() => {
    fontError = "本地字体加载失败，请重新加载扩展并刷新页面";
    render();
  });
  checkRoute();
})();
