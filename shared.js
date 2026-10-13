(() => {
  const chains = {
    sol: { label: "Solana", unit: "SOL" },
    bsc: { label: "BSC", unit: "BNB" },
    robinhood: { label: "RH", unit: "ETH" },
    base: { label: "Base", unit: "ETH" },
    eth: { label: "Ethereum", unit: "ETH" },
    arc: { label: "Arc", unit: "USDC" },
  };

  function addressKind(value) {
    if (typeof value !== "string") return null;
    if (/^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value)) return "evm";
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return "sol";
    return null;
  }

  function normalizeAddress(value) {
    return addressKind(value) === "evm" ? value.toLowerCase() : value;
  }

  function tokenRoute(value) {
    try {
      const url = new URL(value);
      if (url.origin === "https://axiom.trade") {
        const match = url.pathname.match(/^\/(?:token|meme)\/([^/]+)\/?$/);
        if (!match || !/^[A-Za-z0-9]{1,128}$/.test(match[1])) return null;
        const address = normalizeAddress(match[1]);
        return { site: "axiom", chain: null, address, key: `axiom:${address}` };
      }
      if (url.origin !== "https://gmgn.ai") return null;
      const match = url.pathname.match(/^\/([^/]+)\/token\/([^/]+)\/?$/);
      if (!match) return null;
      const chain = { ethereum: "eth", solana: "sol" }[match[1]] || match[1];
      const address = match[2].split("_").pop();
      // 页面识别只匹配路径；真正用于查询的 DEV 地址另行严格校验。
      if (!chains[chain] || !/^[A-Za-z0-9]{1,128}$/.test(address)) return null;
      return { site: "gmgn", chain, address: normalizeAddress(address), key: `${chain}:${normalizeAddress(address)}` };
    } catch {
      return null;
    }
  }

  function number(value) {
    if (!["number", "string"].includes(typeof value) || (typeof value === "string" && !value.trim())) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function marketCap(value) {
    const parsed = number(value);
    if (parsed === null) return "无";
    const amount = Math.round(parsed);
    const units = [[1e9, "B"], [1e6, "M"], [1e3, "K"], [1, ""]];
    for (const [divisor, suffix] of units) {
      if (amount >= divisor || divisor === 1) {
        const rounded = Math.round(amount / divisor);
        if (rounded === 1000 && suffix === "K") return "1M";
        if (rounded === 1000 && suffix === "M") return "1B";
        return `${rounded}${suffix}`;
      }
    }
  }

  function age(timestamp) {
    const seconds = number(timestamp);
    if (!seconds) return "无";
    const elapsed = Math.floor(Date.now() / 1000 - seconds);
    if (elapsed < 0) return "无";
    for (const [unit, suffix] of [[86400, "天"], [3600, "小时"], [60, "分钟"], [1, "秒"]]) {
      if (elapsed >= unit || unit === 1) return `${Math.floor(elapsed / unit)}${suffix}`;
    }
  }

  function compareTokens(a, b) {
    return (number(b.peak) ?? -1) - (number(a.peak) ?? -1)
      || (number(b.marketCap) ?? -1) - (number(a.marketCap) ?? -1)
      || a.chain.localeCompare(b.chain) || a.address.localeCompare(b.address);
  }

  globalThis.DevPeek = Object.freeze({
    chains, addressKind, normalizeAddress, tokenRoute, number, marketCap, age, compareTokens,
    balanceChains: ["sol", "bsc", "robinhood", "base", "eth"],
    referral: "SG9UPFAz",
  });
})();
