window.__ModuleLoader__.load({ id: "dsh-x-stock", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/watchlist.js
var watchlistError = (code) => Object.assign(new Error(code), { code });
var MAX_PINS = 8;
var STORAGE_KEY = "dsh-x-stock:watchlist:v1";
var QUOTE_CHANNEL = "/api";
var QUOTE_ENDPOINT = "dsh-x-stock.quotes";
function normalizeAShare(exchange, code) {
  const market = String(exchange).trim().toUpperCase();
  const digits = String(code).trim();
  if (!["SH", "SZ", "BJ"].includes(market) || !/^\d{6}$/.test(digits)) throw watchlistError("invalid-code");
  return `${market}.${digits}`;
}
function validateSymbol(symbol) {
  if (typeof symbol !== "string" || !/^(SH|SZ|BJ)\.\d{6}$/.test(symbol)) throw watchlistError("invalid-symbol");
  return symbol;
}
function normalizePin(pin) {
  if (!pin || typeof pin !== "object") throw watchlistError("invalid-pin");
  const symbol = validateSymbol(pin.symbol);
  const alias = typeof pin.alias === "string" ? pin.alias.trim().slice(0, 24) : "";
  return { symbol, alias };
}
function parseSaved(raw) {
  if (!raw) return { pins: [], collapsed: false };
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !Array.isArray(value.pins) || value.pins.length > MAX_PINS) throw watchlistError("invalid-saved");
  const pins = value.pins.map(normalizePin);
  if (new Set(pins.map((p) => p.symbol)).size !== pins.length) throw watchlistError("duplicate-saved");
  return { pins, collapsed: value.collapsed === true };
}
function quoteStatus(quote, now = Date.now()) {
  if (!quote || quote.status === "unconfigured") return "unconfigured";
  if (quote.status === "unavailable") return "unavailable";
  if (!quote.quotedAt || !Number.isFinite(Date.parse(quote.quotedAt))) return "unknown-time";
  if (now - Date.parse(quote.quotedAt) > 18e4) return "stale";
  return quote.marketStatus === "closed" ? "closed" : "recent";
}
var SCOPE_ENDPOINT = "dsh-x-stock.scope";
function validateScope(scope) {
  if (typeof scope !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scope)) throw watchlistError("invalid-scope");
  return scope.toLowerCase();
}
var scopedStorageKey = (scope) => `${STORAGE_KEY}:${validateScope(scope)}`;

// src/client/controller.js
function createWatchlistController(storage, eventTarget) {
  const listeners = /* @__PURE__ */ new Set();
  let storageKey = null;
  let state = { pins: [], collapsed: false, storageError: "", scopeStatus: "loading", placement: "waiting", selectedSymbol: null };
  const publish = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const persist = (patch) => {
    if (!storageKey || state.scopeStatus !== "ready") throw watchlistError("scope-loading");
    publish(patch);
    try {
      if (!storage) throw new Error();
      storage.setItem(storageKey, JSON.stringify({ version: 1, pins: state.pins, collapsed: state.collapsed }));
      publish({ storageError: "" });
    } catch {
      publish({ storageError: "storage-save" });
    }
  };
  const storageChanged = (event) => {
    if (!storageKey || state.scopeStatus !== "ready" || event.key !== storageKey) return;
    try {
      publish({ ...parseSaved(event.newValue), storageError: "" });
    } catch {
      publish({ storageError: "storage-sync" });
    }
  };
  eventTarget?.addEventListener("storage", storageChanged);
  return {
    source: { getSnapshot: () => state, subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    } },
    setScope(scope) {
      const key = scopedStorageKey(scope);
      if (key === storageKey && state.scopeStatus === "ready") return;
      storageKey = key;
      let saved = { pins: [], collapsed: false }, storageError = "";
      try {
        saved = parseSaved(storage?.getItem(storageKey));
      } catch {
        storageError = "storage-read";
      }
      publish({ ...saved, selectedSymbol: saved.pins[0]?.symbol ?? null, storageError, scopeStatus: "ready" });
    },
    scopeLoading: () => {
      storageKey = null;
      publish({ scopeStatus: "loading", pins: [], selectedSymbol: null, collapsed: false });
    },
    scopeFailed: () => {
      storageKey = null;
      publish({ pins: [], selectedSymbol: null, scopeStatus: "failed", storageError: "scope-unavailable" });
    },
    select: (symbol) => publish({ selectedSymbol: symbol }),
    setPlacement: (placement) => {
      if (state.placement !== placement) publish({ placement });
    },
    add(pin) {
      const item = normalizePin(pin);
      if (state.pins.some((p) => p.symbol === item.symbol)) throw watchlistError("duplicate");
      if (state.pins.length >= MAX_PINS) throw watchlistError("limit");
      persist({ pins: [...state.pins, item] });
    },
    remove(symbol) {
      const pins = state.pins.filter((p) => p.symbol !== symbol);
      persist({ pins, selectedSymbol: state.selectedSymbol === symbol ? pins[0]?.symbol ?? null : state.selectedSymbol });
    },
    move(symbol, offset) {
      const pins = [...state.pins], index = pins.findIndex((p) => p.symbol === symbol), target = index + offset;
      if (index < 0 || ![-1, 1].includes(offset) || target < 0 || target >= pins.length) return;
      [pins[index], pins[target]] = [pins[target], pins[index]];
      persist({ pins });
    },
    collapse: (collapsed) => persist({ collapsed: Boolean(collapsed) }),
    dispose() {
      eventTarget?.removeEventListener("storage", storageChanged);
      listeners.clear();
    }
  };
}

// src/client/placement.js
function mountWhenVacant(slots, options, Component, onPlacement) {
  return slots.inject("shell.bottom", () => {
    let disposeEntry, stopped = false;
    const occupied = () => slots.entries("shell.bottom").some((entry) => entry.component !== Component);
    const reconcile = () => {
      if (stopped) return;
      if (occupied()) {
        const dispose = disposeEntry;
        disposeEntry = void 0;
        dispose?.();
        onPlacement("occupied");
      } else if (!disposeEntry) {
        disposeEntry = slots.register({ ...options, name: "shell.bottom", priority: Number.MAX_SAFE_INTEGER }, Component);
        onPlacement("mounted");
      }
    };
    const unsubscribe = slots.subscribe("shell.bottom", reconcile);
    reconcile();
    return () => {
      stopped = true;
      unsubscribe();
      disposeEntry?.();
      onPlacement("waiting");
    };
  });
}

// src/client/resource.js
var PROTOCOL = "dsh-x-stock";
var addressFor = (symbol) => `dsh-resource://${PROTOCOL}/${symbol}`;
function wait(ms, signal, target) {
  return new Promise((resolve) => {
    let timer;
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      target?.removeEventListener("visibilitychange", done);
      globalThis.removeEventListener?.("online", done);
      resolve();
    };
    if (signal.aborted) return resolve();
    signal.addEventListener("abort", done, { once: true });
    target?.addEventListener("visibilitychange", done, { once: true });
    globalThis.addEventListener?.("online", done, { once: true });
    if (Number.isFinite(ms)) timer = setTimeout(done, ms);
  });
}
function quoteResource(rpc, documentObject = globalThis.document, navigatorObject = globalThis.navigator) {
  return {
    protocol: PROTOCOL,
    async *open(address, { signal }) {
      const symbol = validateSymbol(new URL(address).pathname.slice(1));
      while (!signal.aborted) {
        if (documentObject?.hidden || navigatorObject?.onLine === false) {
          yield { ok: false, error: { code: navigatorObject?.onLine === false ? "stock/offline" : "stock/hidden", message: "Updates paused", details: {} } };
          await wait(Infinity, signal, documentObject);
          continue;
        }
        let result;
        try {
          result = await rpc.call(QUOTE_CHANNEL, QUOTE_ENDPOINT, { symbols: [symbol] }, signal);
        } catch {
          result = { ok: false, error: { code: "stock/connection", message: "Connection lost", details: {} } };
        }
        if (signal.aborted) return;
        if (result.ok) {
          const quote = result.value?.quotes?.find((item) => item.symbol === symbol);
          if (!quote) result = { ok: false, error: { code: "stock/invalid", message: "Invalid quote response", details: {} } };
          else result = { ok: true, value: { ...quote, source: result.value.source } };
        }
        yield result;
        await wait(result.ok && result.value.status === "unconfigured" ? Infinity : 6e4, signal, documentObject);
      }
    }
  };
}

// src/client/components.jsx
var import_react = __toESM(require("react"), 1);

// src/quote-messages.js
var quoteZh = {
  "quote.title": "\u67E5\u8BE2\u80A1\u7968\u62A5\u4EF7",
  "quote.preparing": "\u6B63\u5728\u51C6\u5907\u67E5\u8BE2",
  "quote.running": "\u6B63\u5728\u67E5\u8BE2",
  "quote.done": "\u67E5\u8BE2\u5B8C\u6210",
  "quote.failed": "\u67E5\u8BE2\u5931\u8D25",
  "quote.inspect": "\u67E5\u770B\u8C03\u7528\u8BB0\u5F55",
  "quote.price": "\u4EF7\u683C",
  "quote.open": "\u5F00\u76D8\u4EF7",
  "quote.high": "\u6700\u9AD8\u4EF7",
  "quote.low": "\u6700\u4F4E\u4EF7",
  "quote.previousClose": "\u524D\u6536\u76D8\u4EF7",
  "quote.change": "\u6DA8\u8DCC\u989D",
  "quote.changePercent": "\u6DA8\u8DCC\u5E45",
  "quote.notice": "\u62A5\u4EF7\u53EF\u80FD\u5EF6\u8FDF\u6216\u6765\u81EA\u6700\u8FD1\u4EA4\u6613\u65F6\u6BB5\uFF1B\u83B7\u53D6\u65F6\u95F4\u4E0D\u662F\u62A5\u4EF7\u65F6\u95F4\u3002\u63A5\u53E3\u672A\u63D0\u4F9B\u5E01\u79CD\uFF0C\u4E0D\u80FD\u636E\u6B64\u63A8\u65AD\u5E01\u79CD\u3002\u4E0D\u6784\u6210\u6295\u8D44\u5EFA\u8BAE\u3002",
  "quote.legacy": "\u6B64\u5386\u53F2\u7ED3\u679C\u672A\u5305\u542B\u7ED3\u6784\u5316\u5C55\u793A\u4FE1\u606F\u3002\u4EE5\u4E0B\u4FDD\u7559\u539F\u59CB\u8BB0\u5F55\u3002",
  "quote.error.SYMBOL_LENGTH": "\u80A1\u7968\u4EE3\u7801\u5FC5\u987B\u662F 1\u201332 \u4E2A\u5B57\u7B26\u3002",
  "quote.error.SYMBOL_FORMAT": "\u80A1\u7968\u4EE3\u7801\u53EA\u5141\u8BB8\u82F1\u6587\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u70B9\u548C\u8FDE\u5B57\u7B26\uFF0C\u4F8B\u5982 AAPL \u6216 BRK.B\u3002",
  "quote.error.INVALID_RESPONSE": "\u884C\u60C5\u54CD\u5E94\u683C\u5F0F\u65E0\u6548\u3002",
  "quote.error.PROVIDER_REJECTED": "Finnhub \u62D2\u7EDD\u4E86\u884C\u60C5\u8BF7\u6C42\uFF0C\u8BF7\u68C0\u67E5 API \u5BC6\u94A5\u3001\u8BA2\u9605\u6743\u9650\u548C\u4EE3\u7801\u3002",
  "quote.error.NO_QUOTE": "\u6CA1\u6709\u6709\u6548\u62A5\u4EF7\uFF0C\u8BF7\u68C0\u67E5\u4EE3\u7801\u3001\u5E02\u573A\u8986\u76D6\u8303\u56F4\u548C\u8BA2\u9605\u6743\u9650\u3002",
  "quote.error.INVALID_NUMBER": "\u884C\u60C5\u54CD\u5E94\u5305\u542B\u65E0\u6548\u6570\u503C\u3002",
  "quote.error.INVALID_TIME": "\u884C\u60C5\u54CD\u5E94\u5305\u542B\u65E0\u6548\u62A5\u4EF7\u65F6\u95F4\u3002",
  "quote.error.INVALID_RANGE": "\u884C\u60C5\u6700\u9AD8\u4EF7\u4F4E\u4E8E\u6700\u4F4E\u4EF7\u3002",
  "quote.error.TOO_LARGE": "\u884C\u60C5\u54CD\u5E94\u8D85\u8FC7\u5927\u5C0F\u9650\u5236\u3002",
  "quote.error.NOT_JSON": "\u884C\u60C5\u670D\u52A1\u6CA1\u6709\u8FD4\u56DE JSON\u3002",
  "quote.error.EMPTY": "\u884C\u60C5\u54CD\u5E94\u4E3A\u7A7A\u3002",
  "quote.error.INVALID_JSON": "\u884C\u60C5\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6548 JSON\u3002",
  "quote.error.CANCELLED": "\u884C\u60C5\u67E5\u8BE2\u5DF2\u53D6\u6D88\u3002",
  "quote.error.MISSING_KEY": "\u8BF7\u5728\u8FD0\u884C\u73AF\u5883\u8BBE\u7F6E FINNHUB_API_KEY\uFF1B\u4E0D\u8981\u628A\u5BC6\u94A5\u53D1\u7ED9\u6A21\u578B\u6216\u5199\u8FDB\u4ED3\u5E93\u3002",
  "quote.error.TIMEOUT_CONFIG": "\u884C\u60C5\u8D85\u65F6\u5FC5\u987B\u4E3A 1\u201330000 \u6BEB\u79D2\u3002",
  "quote.error.TIMEOUT": "\u884C\u60C5\u67E5\u8BE2\u8D85\u65F6\u3002",
  "quote.error.RATE_LIMIT": "Finnhub \u8BF7\u6C42\u9650\u6D41\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  "quote.error.AUTH": "Finnhub \u8BA4\u8BC1\u5931\u8D25\u6216\u8BA2\u9605\u65E0\u6743\u8BBF\u95EE\u8BE5\u884C\u60C5\u3002",
  "quote.error.HTTP": "\u884C\u60C5\u670D\u52A1\u8FD4\u56DE\u4E86 HTTP \u9519\u8BEF\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  "quote.error.CONNECTION": "\u884C\u60C5\u67E5\u8BE2\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u6216\u7A0D\u540E\u91CD\u8BD5\u3002",
  "quote.error.UNKNOWN": "\u67E5\u8BE2\u672A\u5B8C\u6210\u3002\u8BF7\u68C0\u67E5\u5DE5\u5177\u53C2\u6570\u3001\u6743\u9650\u6216\u8FDE\u63A5\u72B6\u6001\u540E\u91CD\u8BD5\u3002"
};
var quoteEn = {
  "quote.title": "Look up a stock quote",
  "quote.preparing": "Preparing quote request",
  "quote.running": "Looking up quote",
  "quote.done": "Quote retrieved",
  "quote.failed": "Quote failed",
  "quote.inspect": "Inspect call",
  "quote.price": "Price",
  "quote.open": "Open",
  "quote.high": "High",
  "quote.low": "Low",
  "quote.previousClose": "Previous close",
  "quote.change": "Change",
  "quote.changePercent": "Change (%)",
  "quote.notice": "Quotes may be delayed or from the most recent trading session. Retrieval time is not quote time. The API does not provide a currency, so none is inferred. This is not investment advice.",
  "quote.legacy": "This historical result has no structured display information. Its original record is preserved below.",
  "quote.error.SYMBOL_LENGTH": "Stock symbols must contain 1\u201332 characters.",
  "quote.error.SYMBOL_FORMAT": "Use only English letters, digits, dots, and hyphens, such as AAPL or BRK.B.",
  "quote.error.INVALID_RESPONSE": "The quote response has an invalid format.",
  "quote.error.PROVIDER_REJECTED": "Finnhub rejected the request. Check the API key, subscription access, and symbol.",
  "quote.error.NO_QUOTE": "No valid quote. Check the symbol, market coverage, and subscription access.",
  "quote.error.INVALID_NUMBER": "The quote response contains an invalid number.",
  "quote.error.INVALID_TIME": "The quote response contains an invalid quote time.",
  "quote.error.INVALID_RANGE": "The quoted high is below the low.",
  "quote.error.TOO_LARGE": "The quote response exceeds the size limit.",
  "quote.error.NOT_JSON": "The quote service did not return JSON.",
  "quote.error.EMPTY": "The quote response is empty.",
  "quote.error.INVALID_JSON": "The quote service returned invalid JSON.",
  "quote.error.CANCELLED": "Quote lookup cancelled.",
  "quote.error.MISSING_KEY": "Set FINNHUB_API_KEY in the runtime environment. Do not send the key to a model or save it in the repository.",
  "quote.error.TIMEOUT_CONFIG": "The quote timeout must be an integer from 1 to 30000 milliseconds.",
  "quote.error.TIMEOUT": "Quote lookup timed out.",
  "quote.error.RATE_LIMIT": "Finnhub rate limit reached. Please try again later.",
  "quote.error.AUTH": "Finnhub authentication failed or the subscription cannot access this quote.",
  "quote.error.HTTP": "The quote service returned an HTTP error. Please try again later.",
  "quote.error.CONNECTION": "Quote lookup failed. Check the network or try again later.",
  "quote.error.UNKNOWN": "The lookup did not complete. Check the arguments, permissions, or connection and try again."
};
function quoteErrorKey(error) {
  if (error?.name !== "DshXStockError" || !error.code?.startsWith("DSH_X_STOCK_")) return "quote.error.UNKNOWN";
  const key = `quote.error.${error.code.slice("DSH_X_STOCK_".length)}`;
  return Object.hasOwn(quoteEn, key) ? key : "quote.error.UNKNOWN";
}

// src/client/locales.js
var NS = "dsh-x-stock";
var zh = {
  ...quoteZh,
  "title": "\u80A1\u7968",
  "watchlist": "\u81EA\u9009 {count}",
  "watchlist.aria": "\u56FA\u5B9A\u80A1\u7968",
  "watchlist.expand": "\u5C55\u5F00\u81EA\u9009\u80A1\u7968",
  "watchlist.collapse": "\u6536\u8D77\u81EA\u9009\u80A1\u7968",
  "watchlist.order": "\u6309\u624B\u52A8\u987A\u5E8F\u6392\u5217\u7684\u81EA\u9009\u80A1\u7968",
  "watchlist.hint": "\u56FA\u5B9A\u5E38\u770B\u7684 A \u80A1\uFF0C\u5DE5\u4F5C\u65F6\u4E00\u773C\u67E5\u770B",
  "watchlist.add": "\u80A1\u7968 \xB7 \u6DFB\u52A0",
  "chip.title": "{symbol} \xB7 {status} \xB7 \u70B9\u51FB\u67E5\u770B\u8BE6\u60C5",
  "stale": "\u65E7",
  "status.loading": "\u83B7\u53D6\u4E2D",
  "status.failed": "\u66F4\u65B0\u5931\u8D25 \xB7 \u65E7\u62A5\u4EF7",
  "status.unconfigured": "\u672A\u914D\u7F6E\u884C\u60C5",
  "status.unavailable": "\u6682\u65E0\u62A5\u4EF7",
  "status.unknown-time": "\u62A5\u4EF7\u65F6\u95F4\u672A\u77E5",
  "status.stale": "\u65E7\u62A5\u4EF7 \xB7 \u53EF\u80FD\u5EF6\u8FDF/\u4F11\u5E02",
  "status.closed": "\u4F11\u5E02 \xB7 \u6700\u8FD1\u62A5\u4EF7",
  "status.recent": "\u6700\u8FD1\u62A5\u4EF7 \xB7 \u53EF\u80FD\u5EF6\u8FDF",
  "add.title": "\u56FA\u5B9A\u80A1\u7968",
  "add.exchange": "\u4EA4\u6613\u6240",
  "exchange.SH": "\u4E0A\u6D77 \xB7 SH",
  "exchange.SZ": "\u6DF1\u5733 \xB7 SZ",
  "exchange.BJ": "\u5317\u4EAC \xB7 BJ",
  "add.code": "\u516D\u4F4D\u80A1\u7968\u4EE3\u7801",
  "add.alias": "\u663E\u793A\u522B\u540D\uFF08\u9009\u586B\uFF09",
  "add.alias.placeholder": "\u81EA\u5DF1\u719F\u6089\u7684\u540D\u79F0",
  "add.submit": "\u6DFB\u52A0\u5230\u81EA\u9009 \xB7 {count}/{max}",
  "add.notice": "\u4EE3\u7801\u4EC5\u505A\u683C\u5F0F\u6821\u9A8C\uFF1B\u5F53\u524D\u672A\u9A8C\u8BC1\u8BC1\u5238\u540D\u79F0\u6216\u4E0A\u5E02\u72B6\u6001\u3002\u6E05\u5355\u4EC5\u4FDD\u5B58\u5728\u6B64\u6D4F\u89C8\u5668\uFF0C\u4E0D\u8DE8\u8BBE\u5907\u540C\u6B65\u3002",
  "detail.aria": "{symbol} \u80A1\u7968\u8BE6\u60C5",
  "detail.alias": " \xB7 \u81EA\u5B9A\u4E49\u522B\u540D",
  "detail.source": "\u6570\u636E\u6765\u6E90",
  "detail.no-source": "\u5C1A\u672A\u63A5\u5165\u83B7\u6388\u6743\u7684 A \u80A1\u6570\u636E\u6E90",
  "detail.quoted-at": "\u62A5\u4EF7\u65F6\u95F4",
  "detail.fetched-at": "\u83B7\u53D6\u65F6\u95F4",
  "time.missing": "\u672A\u63D0\u4F9B",
  "time.shanghai": "{time}\uFF08\u4E0A\u6D77\uFF09",
  "detail.time-notice": "\u83B7\u53D6\u65F6\u95F4\u4E0D\u4EE3\u8868\u62A5\u4EF7\u65F6\u95F4\u3002\u4E0D\u4F1A\u6839\u636E\u5F53\u524D\u65F6\u949F\u731C\u6D4B\u4F11\u5E02\u3001\u8282\u5047\u65E5\u6216\u505C\u724C\u3002",
  "detail.chart": "\u8D70\u52BF\u4E0E\u6210\u4EA4",
  "detail.no-history": "\u6682\u65E0\u5386\u53F2\u884C\u60C5",
  "detail.chart-notice": "\u63A5\u5165\u652F\u6301\u5206\u65F6\u3001K \u7EBF\u4E0E\u6210\u4EA4\u91CF\u7684\u6570\u636E\u6E90\u540E\u5C55\u793A\u3002\u5F53\u524D\u6CA1\u6709\u53EF\u9A8C\u8BC1\u7684\u6570\u636E\uFF0C\u4E0D\u7ED8\u5236\u793A\u610F\u8D70\u52BF\u3002",
  "detail.fundamentals": "\u57FA\u672C\u9762",
  "detail.no-fundamentals": "\u6682\u65E0\u5DF2\u9A8C\u8BC1\u7684\u8D22\u62A5\u4E0E\u4F30\u503C\u6570\u636E",
  "detail.fundamentals-notice": "\u63A5\u5165\u540E\u5C06\u6807\u660E\u62A5\u544A\u671F\u3001\u62AB\u9732\u65E5\u671F\u53CA\u6765\u6E90\u3002",
  "detail.analysis": "\u5206\u6790",
  "detail.no-analysis": "\u6570\u636E\u4E0D\u8DB3\uFF0C\u6682\u4E0D\u751F\u6210\u5206\u6790\u7ED3\u8BBA",
  "detail.analysis-notice": "\u9700\u8981\u53EF\u9760\u7684\u884C\u60C5\u3001\u8D22\u52A1\u4E0E\u516C\u544A\u4F9D\u636E\uFF1B\u5206\u6790\u5E94\u533A\u5206\u4E8B\u5B9E\u3001\u63A8\u65AD\u548C\u98CE\u9669\u3002\u4E0D\u63D0\u4F9B\u4EA4\u6613\u6267\u884C\u3002",
  "page.subtitle": "\u624B\u52A8\u81EA\u9009 \xB7 A \u80A1\u8BE6\u60C5\u4E0E\u5206\u6790",
  "page.back": "\u8FD4\u56DE\u5BF9\u8BDD",
  "page.notice": "\u884C\u60C5\u672A\u914D\u7F6E\uFF1A\u5148\u6574\u7406\u4F60\u7684\u81EA\u9009\u6E05\u5355\u3002\u5F53\u524D\u6CA1\u6709\u63A5\u5165\u83B7\u6388\u6743\u7684 A \u80A1\u884C\u60C5\uFF0C\u4EF7\u683C\u548C\u6DA8\u8DCC\u5E45\u4E0D\u4F1A\u663E\u793A\u4E3A\u5B9E\u65F6\u6570\u636E\u3002",
  "page.occupied": "\u5E95\u90E8\u63D2\u69FD\u5DF2\u6709\u5176\u4ED6\u63D2\u4EF6\u5360\u7528\uFF0C\u81EA\u9009\u6761\u5DF2\u8BA9\u51FA\u4F4D\u7F6E\u3002\u4F60\u4ECD\u53EF\u5728\u6B64\u7BA1\u7406\u548C\u67E5\u770B\u80A1\u7968\u3002",
  "page.scope-loading": "\u6B63\u5728\u786E\u8BA4\u6B64 profile \u7684\u81EA\u9009\u5B58\u50A8\u2026",
  "page.scope-retry": "\u91CD\u8BD5\u8FDE\u63A5\u81EA\u9009\u5B58\u50A8",
  "page.manage": "\u81EA\u9009\u7BA1\u7406",
  "page.my-watchlist": "\u6211\u7684\u81EA\u9009",
  "page.empty": "\u8FD8\u6CA1\u6709\u56FA\u5B9A\u80A1\u7968\u3002\u6DFB\u52A0\u4E00\u53EA\u5F00\u59CB\u3002",
  "page.move-up": "\u4E0A\u79FB {symbol}",
  "page.move-down": "\u4E0B\u79FB {symbol}",
  "page.remove-aria": "\u79FB\u9664 {symbol}",
  "page.remove": "\u79FB\u9664",
  "page.select": "\u9009\u4E00\u53EA\u80A1\u7968\uFF0C\u770B\u6E05\u5B83\u7684\u60C5\u51B5",
  "page.select-hint": "\u8FD9\u91CC\u5C06\u5C55\u793A\u62A5\u4EF7\u3001\u8D70\u52BF\u3001\u57FA\u672C\u9762\u548C\u6709\u4F9D\u636E\u7684\u5206\u6790\u3002\u5E95\u90E8\u81EA\u9009\u6761\u53EA\u8D1F\u8D23\u5DE5\u4F5C\u65F6\u7684\u5FEB\u6377\u67E5\u770B\u3002",
  "error.invalid-code": "\u8BF7\u9009\u62E9\u4EA4\u6613\u6240\u5E76\u8F93\u5165\u516D\u4F4D\u80A1\u7968\u4EE3\u7801\u3002",
  "error.invalid-symbol": "A \u80A1\u4EE3\u7801\u987B\u5305\u542B\u4EA4\u6613\u6240\u548C\u516D\u4F4D\u6570\u5B57\u3002",
  "error.invalid-pin": "\u65E0\u6548\u81EA\u9009\u9879\u3002",
  "error.invalid-saved": "\u4FDD\u5B58\u7684\u81EA\u9009\u6E05\u5355\u683C\u5F0F\u4E0D\u517C\u5BB9\u3002",
  "error.duplicate-saved": "\u4FDD\u5B58\u7684\u81EA\u9009\u6E05\u5355\u542B\u91CD\u590D\u4EE3\u7801\u3002",
  "error.invalid-scope": "\u5BBF\u4E3B\u81EA\u9009\u5B58\u50A8\u6807\u8BC6\u65E0\u6548\u3002",
  "error.scope-loading": "\u6B63\u5728\u786E\u8BA4\u6B64 profile \u7684\u5B58\u50A8\u4F4D\u7F6E\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  "error.storage-save": "\u65E0\u6CD5\u4FDD\u5B58\u5230\u6B64\u6D4F\u89C8\u5668\uFF1B\u5F53\u524D\u4FEE\u6539\u4EC5\u5728\u672C\u6B21\u4F7F\u7528\u6709\u6548\u3002",
  "error.storage-sync": "\u53E6\u4E00\u7A97\u53E3\u7684\u6E05\u5355\u683C\u5F0F\u65E0\u6548\uFF0C\u5DF2\u4FDD\u7559\u5F53\u524D\u6E05\u5355\u3002",
  "error.storage-read": "\u65E0\u6CD5\u8BFB\u53D6\u6B64 profile \u7684\u672C\u5730\u6E05\u5355\uFF1B\u672C\u6B21\u4FEE\u6539\u524D\u4E0D\u4F1A\u8986\u76D6\u539F\u8BB0\u5F55\u3002",
  "error.scope-unavailable": "\u65E0\u6CD5\u786E\u8BA4\u6B64 profile \u7684\u5B58\u50A8\u4F4D\u7F6E\uFF1B\u5DF2\u6682\u505C\u8BFB\u53D6\u548C\u4FDD\u5B58\u6E05\u5355\u3002",
  "error.duplicate": "\u8FD9\u53EA\u80A1\u7968\u5DF2\u7ECF\u56FA\u5B9A\u3002",
  "error.limit": "\u6700\u591A\u56FA\u5B9A {max} \u53EA\u80A1\u7968\uFF0C\u8BF7\u5148\u79FB\u9664\u4E00\u53EA\u3002",
  "error.offline": "\u79BB\u7EBF \xB7 \u5DF2\u6682\u505C\u66F4\u65B0",
  "error.hidden": "\u7A97\u53E3\u9690\u85CF \xB7 \u5DF2\u6682\u505C\u66F4\u65B0",
  "error.connection": "\u8FDE\u63A5\u4E2D\u65AD \xB7 \u4FDD\u7559\u6700\u8FD1\u62A5\u4EF7",
  "error.invalid": "\u884C\u60C5\u54CD\u5E94\u65E0\u6548",
  "error.forbidden": "\u53EA\u5141\u8BB8\u5BBF\u4E3B\u6240\u6709\u8005\u8BFB\u53D6\u81EA\u9009\u884C\u60C5\u3002",
  "error.not-found": "\u672A\u77E5\u80A1\u7968\u63A5\u53E3\u3002",
  "error.invalid-input": "\u8BF7\u8F93\u5165\u6700\u591A {max} \u4E2A\u4E0D\u91CD\u590D\u7684 A \u80A1\u4EE3\u7801\u3002",
  "error.cancelled": "\u884C\u60C5\u8BF7\u6C42\u5DF2\u53D6\u6D88\u3002",
  "error.unavailable": "\u884C\u60C5\u6682\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  "error.unknown": "\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002"
};
var en = {
  ...quoteEn,
  "title": "Stocks",
  "watchlist": "Watchlist {count}",
  "watchlist.aria": "Pinned stocks",
  "watchlist.expand": "Expand watchlist",
  "watchlist.collapse": "Collapse watchlist",
  "watchlist.order": "Watchlist in manual order",
  "watchlist.hint": "Pin frequently viewed A-shares for a quick glance while you work",
  "watchlist.add": "Stocks \xB7 Add",
  "chip.title": "{symbol} \xB7 {status} \xB7 View details",
  "stale": "Stale",
  "status.loading": "Loading",
  "status.failed": "Update failed \xB7 Previous quote",
  "status.unconfigured": "Quotes not configured",
  "status.unavailable": "No quote available",
  "status.unknown-time": "Quote time unknown",
  "status.stale": "Previous quote \xB7 Possibly delayed / market closed",
  "status.closed": "Market closed \xB7 Latest quote",
  "status.recent": "Latest quote \xB7 Possibly delayed",
  "add.title": "Pin a stock",
  "add.exchange": "Exchange",
  "exchange.SH": "Shanghai \xB7 SH",
  "exchange.SZ": "Shenzhen \xB7 SZ",
  "exchange.BJ": "Beijing \xB7 BJ",
  "add.code": "Six-digit stock code",
  "add.alias": "Display alias (optional)",
  "add.alias.placeholder": "A name you recognize",
  "add.submit": "Add to watchlist \xB7 {count}/{max}",
  "add.notice": "Only the code format is checked; security names and listing status have not been verified. This list is saved in this browser only and does not sync across devices.",
  "detail.aria": "{symbol} stock details",
  "detail.alias": " \xB7 Custom alias",
  "detail.source": "Data source",
  "detail.no-source": "No licensed A-share data source connected",
  "detail.quoted-at": "Quote time",
  "detail.fetched-at": "Retrieved at",
  "time.missing": "Not provided",
  "time.shanghai": "{time} (Shanghai)",
  "detail.time-notice": "Retrieval time is not quote time. Market closures, holidays, and suspensions are not inferred from the current clock.",
  "detail.chart": "Price and volume",
  "detail.no-history": "No historical market data",
  "detail.chart-notice": "Intraday charts, candlesticks, and volume will appear when a supporting data source is connected. No illustrative chart is drawn without verifiable data.",
  "detail.fundamentals": "Fundamentals",
  "detail.no-fundamentals": "No verified financial statements or valuation data",
  "detail.fundamentals-notice": "Reporting periods, disclosure dates, and sources will be shown when connected.",
  "detail.analysis": "Analysis",
  "detail.no-analysis": "Insufficient data for analysis",
  "detail.analysis-notice": "Reliable prices, financials, and announcements are required. Analysis should distinguish facts, inferences, and risks. Trading is not supported.",
  "page.subtitle": "Manual watchlist \xB7 A-share details and analysis",
  "page.back": "Back to conversation",
  "page.notice": "Quotes are not configured. You can organize your watchlist now. No licensed A-share feed is connected, so prices and changes are not presented as live data.",
  "page.occupied": "Another plugin occupies the bottom slot, so the watchlist bar has yielded its place. You can still manage and view stocks here.",
  "page.scope-loading": "Checking watchlist storage for this profile\u2026",
  "page.scope-retry": "Retry connecting to watchlist storage",
  "page.manage": "Manage watchlist",
  "page.my-watchlist": "My watchlist",
  "page.empty": "No stocks pinned yet. Add one to get started.",
  "page.move-up": "Move {symbol} up",
  "page.move-down": "Move {symbol} down",
  "page.remove-aria": "Remove {symbol}",
  "page.remove": "Remove",
  "page.select": "Select a stock to explore",
  "page.select-hint": "Quotes, charts, fundamentals, and evidence-based analysis will appear here. The bottom watchlist bar provides a quick glance while you work.",
  "error.invalid-code": "Choose an exchange and enter a six-digit stock code.",
  "error.invalid-symbol": "An A-share code must include an exchange and six digits.",
  "error.invalid-pin": "Invalid watchlist item.",
  "error.invalid-saved": "The saved watchlist format is incompatible.",
  "error.duplicate-saved": "The saved watchlist contains duplicate codes.",
  "error.invalid-scope": "Invalid host watchlist storage identifier.",
  "error.scope-loading": "Checking storage for this profile. Please try again shortly.",
  "error.storage-save": "Could not save to this browser. Changes are available only for this session.",
  "error.storage-sync": "The list from another window is invalid. The current list has been kept.",
  "error.storage-read": "Could not read this profile\u2019s local list. The saved record will remain untouched until you make a change.",
  "error.scope-unavailable": "Could not identify storage for this profile. Reading and saving the list are paused.",
  "error.duplicate": "This stock is already pinned.",
  "error.limit": "You can pin up to {max} stocks. Remove one first.",
  "error.offline": "Offline \xB7 Updates paused",
  "error.hidden": "Window hidden \xB7 Updates paused",
  "error.connection": "Connection lost \xB7 Keeping the latest quote",
  "error.invalid": "Invalid quote response",
  "error.forbidden": "Only the host owner can read watchlist quotes.",
  "error.not-found": "Unknown stock endpoint.",
  "error.invalid-input": "Enter up to {max} unique A-share codes.",
  "error.cancelled": "Quote request cancelled.",
  "error.unavailable": "Quotes are temporarily unavailable. Please try again later.",
  "error.unknown": "The action could not be completed. Please try again."
};
function errorKey(code) {
  const key = typeof code === "string" ? `error.${code.replace(/^stock\//, "")}` : "error.unknown";
  return Object.hasOwn(en, key) ? key : "error.unknown";
}

// src/client/components.jsx
var tone = (value) => value > 0 ? "dxs-up" : value < 0 ? "dxs-down" : "";
function Status({ snapshot, t, format }) {
  if (snapshot.status === "loading") return /* @__PURE__ */ import_react.default.createElement("span", { className: "dxs-muted" }, t("status.loading"));
  if (snapshot.status === "failed") return /* @__PURE__ */ import_react.default.createElement("span", { className: "dxs-muted" }, snapshot.failure?.code ? t(errorKey(snapshot.failure.code), { max: format.count(MAX_PINS) }) : t("status.failed"));
  return /* @__PURE__ */ import_react.default.createElement("span", { className: "dxs-muted" }, t(`status.${quoteStatus(snapshot.value)}`));
}
function StockChip({ pin, useResource, open, t, format }) {
  const snapshot = useResource(addressFor(pin.symbol)), quote = snapshot.value;
  const status = quoteStatus(quote);
  return /* @__PURE__ */ import_react.default.createElement("button", { className: "dxs-chip", onClick: () => open(pin.symbol), title: t("chip.title", { symbol: pin.symbol, status: t(`status.${status}`) }) }, /* @__PURE__ */ import_react.default.createElement("strong", null, pin.alias || quote?.name || pin.symbol), /* @__PURE__ */ import_react.default.createElement("span", null, format.price(quote?.price)), quote?.price != null ? /* @__PURE__ */ import_react.default.createElement("span", { className: tone(quote.changePercent) }, format.change(quote.changePercent)) : /* @__PURE__ */ import_react.default.createElement(Status, { snapshot, t, format }), quote?.price != null && (snapshot.status === "failed" || status === "stale") ? /* @__PURE__ */ import_react.default.createElement("span", { className: "dxs-muted" }, t("stale")) : null);
}
function StockBar({ useWatchlist, useResource, collapse, open, t, format }) {
  const state = useWatchlist((value) => value);
  if (!state.pins.length) return null;
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxs dxs-bar", "aria-label": t("watchlist.aria") }, /* @__PURE__ */ import_react.default.createElement("button", { onClick: () => collapse(!state.collapsed), "aria-expanded": !state.collapsed, "aria-label": t(state.collapsed ? "watchlist.expand" : "watchlist.collapse") }, state.collapsed ? "\u25B8" : "\u25BE", " ", t("watchlist", { count: format.count(state.pins.length) })), !state.collapsed && /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-strip", "aria-label": t("watchlist.order") }, state.pins.map((pin) => /* @__PURE__ */ import_react.default.createElement(StockChip, { key: pin.symbol, pin, useResource, open, t, format }))), /* @__PURE__ */ import_react.default.createElement("button", { onClick: () => open(state.selectedSymbol) }, t("title")));
}
function StockIcon({ size = 20 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M4 4v16h16M7 15l4-5 4 3 5-7", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }));
}
function AddStock({ add, count, ready, t, format }) {
  const [exchange, setExchange] = (0, import_react.useState)("SH"), [code, setCode] = (0, import_react.useState)(""), [alias, setAlias] = (0, import_react.useState)(""), [error, setError] = (0, import_react.useState)("");
  const submit = (event) => {
    event.preventDefault();
    try {
      add({ symbol: normalizeAShare(exchange, code), alias });
      setCode("");
      setAlias("");
      setError("");
    } catch (failure) {
      setError(errorKey(failure.code));
    }
  };
  return /* @__PURE__ */ import_react.default.createElement("form", { className: "dxs-form", onSubmit: submit, noValidate: true }, /* @__PURE__ */ import_react.default.createElement("h2", null, t("add.title")), /* @__PURE__ */ import_react.default.createElement("label", null, t("add.exchange"), /* @__PURE__ */ import_react.default.createElement("select", { value: exchange, onChange: (event) => setExchange(event.target.value) }, ["SH", "SZ", "BJ"].map((value) => /* @__PURE__ */ import_react.default.createElement("option", { key: value, value }, t(`exchange.${value}`))))), /* @__PURE__ */ import_react.default.createElement("label", null, t("add.code"), /* @__PURE__ */ import_react.default.createElement("input", { value: code, onChange: (event) => setCode(event.target.value), inputMode: "numeric", maxLength: 6, placeholder: "600519", required: true, pattern: "[0-9]{6}" })), /* @__PURE__ */ import_react.default.createElement("label", null, t("add.alias"), /* @__PURE__ */ import_react.default.createElement("input", { value: alias, onChange: (event) => setAlias(event.target.value), maxLength: 24, placeholder: t("add.alias.placeholder") })), /* @__PURE__ */ import_react.default.createElement("button", { type: "submit", disabled: !ready || count >= MAX_PINS }, t("add.submit", { count: format.count(count), max: format.count(MAX_PINS) })), error && /* @__PURE__ */ import_react.default.createElement("p", { role: "alert", className: "dxs-error" }, t(error, { max: format.count(MAX_PINS) })), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, t("add.notice")));
}
function Detail({ pin, useResource, t, format }) {
  const snapshot = useResource(addressFor(pin.symbol)), quote = snapshot.value;
  return /* @__PURE__ */ import_react.default.createElement("article", { "aria-label": t("detail.aria", { symbol: pin.symbol }) }, /* @__PURE__ */ import_react.default.createElement("section", { className: "dxs-section" }, /* @__PURE__ */ import_react.default.createElement("h2", null, pin.alias || quote?.name || pin.symbol), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, pin.symbol, pin.alias ? t("detail.alias") : ""), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-price" }, format.price(quote?.price), " ", /* @__PURE__ */ import_react.default.createElement("span", { className: tone(quote?.changePercent), style: { fontSize: 18 } }, format.change(quote?.changePercent))), /* @__PURE__ */ import_react.default.createElement("p", null, /* @__PURE__ */ import_react.default.createElement(Status, { snapshot, t, format })), /* @__PURE__ */ import_react.default.createElement("dl", null, /* @__PURE__ */ import_react.default.createElement("dt", null, t("detail.source")), /* @__PURE__ */ import_react.default.createElement("dd", null, quote?.source || t("detail.no-source")), /* @__PURE__ */ import_react.default.createElement("dt", null, t("detail.quoted-at")), /* @__PURE__ */ import_react.default.createElement("dd", null, format.time(quote?.quotedAt, t)), /* @__PURE__ */ import_react.default.createElement("dt", null, t("detail.fetched-at")), /* @__PURE__ */ import_react.default.createElement("dd", null, format.time(quote?.fetchedAt, t))), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, t("detail.time-notice"))), /* @__PURE__ */ import_react.default.createElement("section", { className: "dxs-section" }, /* @__PURE__ */ import_react.default.createElement("h2", null, t("detail.chart")), /* @__PURE__ */ import_react.default.createElement("p", null, t("detail.no-history")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, t("detail.chart-notice"))), /* @__PURE__ */ import_react.default.createElement("section", { className: "dxs-section" }, /* @__PURE__ */ import_react.default.createElement("h2", null, t("detail.fundamentals")), /* @__PURE__ */ import_react.default.createElement("p", null, t("detail.no-fundamentals")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, t("detail.fundamentals-notice"))), /* @__PURE__ */ import_react.default.createElement("section", { className: "dxs-section" }, /* @__PURE__ */ import_react.default.createElement("h2", null, t("detail.analysis")), /* @__PURE__ */ import_react.default.createElement("p", null, t("detail.no-analysis")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, t("detail.analysis-notice"))));
}
function StockPage({ useWatchlist, useResource, add, remove, move, select, back, retryScope, t, format }) {
  const state = useWatchlist((value) => value);
  const pin = state.pins.find((item) => item.symbol === state.selectedSymbol) ?? state.pins[0];
  return /* @__PURE__ */ import_react.default.createElement("main", { className: "dxs dxs-page" }, /* @__PURE__ */ import_react.default.createElement("header", { className: "dxs-heading" }, /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("h1", null, t("title")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, t("page.subtitle"))), /* @__PURE__ */ import_react.default.createElement("button", { onClick: back }, t("page.back"))), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-notice" }, t("page.notice")), state.placement === "occupied" && /* @__PURE__ */ import_react.default.createElement("p", { role: "status", className: "dxs-notice" }, t("page.occupied")), state.scopeStatus === "loading" && /* @__PURE__ */ import_react.default.createElement("p", { role: "status" }, t("page.scope-loading")), state.scopeStatus === "failed" && /* @__PURE__ */ import_react.default.createElement("button", { onClick: retryScope }, t("page.scope-retry")), state.storageError && /* @__PURE__ */ import_react.default.createElement("p", { role: "alert", className: "dxs-error" }, t(errorKey(state.storageError), { max: format.count(MAX_PINS) })), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-layout" }, /* @__PURE__ */ import_react.default.createElement("aside", { "aria-label": t("page.manage") }, /* @__PURE__ */ import_react.default.createElement("h2", null, t("page.my-watchlist")), !state.pins.length && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, t("page.empty")), /* @__PURE__ */ import_react.default.createElement("ol", { className: "dxs-list" }, state.pins.map((item, index) => /* @__PURE__ */ import_react.default.createElement("li", { key: item.symbol }, /* @__PURE__ */ import_react.default.createElement("button", { className: "dxs-select", "aria-pressed": pin?.symbol === item.symbol, onClick: () => select(item.symbol) }, /* @__PURE__ */ import_react.default.createElement("strong", null, item.alias || item.symbol), item.alias && /* @__PURE__ */ import_react.default.createElement("span", { className: "dxs-muted" }, " \xB7 ", item.symbol)), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-controls" }, /* @__PURE__ */ import_react.default.createElement("button", { disabled: index === 0, "aria-label": t("page.move-up", { symbol: item.symbol }), onClick: () => move(item.symbol, -1) }, "\u2191"), /* @__PURE__ */ import_react.default.createElement("button", { disabled: index === state.pins.length - 1, "aria-label": t("page.move-down", { symbol: item.symbol }), onClick: () => move(item.symbol, 1) }, "\u2193"), /* @__PURE__ */ import_react.default.createElement("button", { "aria-label": t("page.remove-aria", { symbol: item.symbol }), onClick: () => remove(item.symbol) }, t("page.remove")))))), /* @__PURE__ */ import_react.default.createElement(AddStock, { add, count: state.pins.length, ready: state.scopeStatus === "ready", t, format })), pin ? /* @__PURE__ */ import_react.default.createElement(Detail, { key: pin.symbol, pin, useResource, t, format }) : /* @__PURE__ */ import_react.default.createElement("section", { className: "dxs-section" }, /* @__PURE__ */ import_react.default.createElement("h2", null, t("page.select")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, t("page.select-hint")))));
}

// src/client/styles.js
var CSS = `
.dxs{color:var(--dsw-alias-label-primary,#202124);font:13px/1.5 system-ui,sans-serif;box-sizing:border-box}.dxs *{box-sizing:border-box}.dxs button,.dxs input,.dxs select{font:inherit;color:inherit}.dxs button{cursor:pointer;border:1px solid var(--dsw-alias-border-main,#bbb);border-radius:7px;background:var(--dsw-alias-bg-layer-1,#fff);padding:5px 9px;white-space:nowrap}.dxs button:hover{background:var(--dsw-alias-bg-layer-2,#eee)}.dxs button:focus-visible,.dxs input:focus-visible,.dxs select:focus-visible{outline:2px solid var(--dsw-alias-primary,#4169e1);outline-offset:2px}.dxs button:disabled{opacity:.4;cursor:default}.dxs-bar{display:flex;align-items:center;gap:8px;width:100%;max-width:100vw;padding:5px 12px;border-top:1px solid var(--dsw-alias-border-main,#ddd);background:var(--dsw-alias-bg-layer-1,#fff);min-height:40px}.dxs-strip{display:flex;align-items:center;gap:8px;min-width:0;flex:1;overflow-x:auto;padding:2px}.dxs-chip{display:flex;align-items:center;gap:8px;flex:none}.dxs-muted{color:var(--dsw-alias-label-secondary,#666);font-size:12px}.dxs-up{color:var(--dsw-alias-error,#bc2737)}.dxs-down{color:var(--dsw-alias-success,#16784e)}.dxs-page{height:100%;overflow:auto;padding:28px;max-width:1200px;margin:auto}.dxs-heading{display:flex;justify-content:space-between;gap:12px;align-items:start}.dxs h1{font-size:23px;margin:0}.dxs h2{font-size:16px;margin:0 0 12px}.dxs p{margin:8px 0}.dxs-notice{padding:10px 12px;background:var(--dsw-alias-bg-layer-2,#f4f4f5);border-radius:8px;margin:12px 0}.dxs-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:22px;margin-top:20px}.dxs-list{padding:0;list-style:none}.dxs-list li{margin:8px 0}.dxs-list .dxs-select{width:100%;text-align:left;white-space:normal}.dxs-controls{display:flex;gap:5px;margin-top:4px}.dxs-form{display:grid;gap:8px;margin-top:16px}.dxs input,.dxs select{min-width:0;width:100%;padding:7px 9px;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-main,#bbb);border-radius:6px}.dxs-section{padding:18px;border:1px solid var(--dsw-alias-border-main,#ddd);border-radius:10px;margin-bottom:16px}.dxs-price{font-size:30px;font-variant-numeric:tabular-nums}.dxs dl{display:grid;grid-template-columns:auto 1fr;gap:5px 16px}.dxs dd{margin:0;overflow-wrap:anywhere}.dxs-error{color:var(--dsw-alias-error,#bc2737)}@media(max-width:650px){.dxs-page{padding:16px}.dxs-layout{grid-template-columns:1fr}.dxs-bar{padding:4px 6px;gap:4px}.dxs-heading{flex-wrap:wrap}}`;

// src/client/format.js
function formatLocale(locale) {
  const tag = locale === "zh" ? "zh-CN" : locale;
  try {
    return Intl.NumberFormat.supportedLocalesOf([tag])[0] ?? "en";
  } catch {
    return "en";
  }
}
function createFormatters(getLocale) {
  const number = (value, options) => new Intl.NumberFormat(formatLocale(getLocale()), options).format(value);
  return {
    count: (value) => number(value, { maximumFractionDigits: 0 }),
    price: (value) => Number.isFinite(value) ? number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "\u2014",
    change: (value) => Number.isFinite(value) ? number(value / 100, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }) : "\u2014",
    time(value, t) {
      const date = value ? new Date(value) : null;
      if (!date || !Number.isFinite(date.getTime())) return t("time.missing");
      return t("time.shanghai", { time: new Intl.DateTimeFormat(formatLocale(getLocale()), { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date) });
    }
  };
}

// src/client/tool-view.jsx
var import_react2 = __toESM(require("react"), 1);

// src/client/quote-presentation.js
function readQuotePresentation(meta) {
  if (!meta || meta.kind !== "dsh-x-stock.quote" || meta.version !== 1) return null;
  const quote = meta.quote;
  if (!quote || typeof quote.symbol !== "string" || typeof quote.provider !== "string" || !Number.isFinite(quote.price) || quote.price <= 0 || ["open", "high", "low", "previousClose", "change", "changePercent"].some((key) => quote[key] !== null && !Number.isFinite(quote[key])) || ["quotedAt", "fetchedAt"].some((key) => quote[key] !== null && (typeof quote[key] !== "string" || !Number.isFinite(Date.parse(quote[key]))))) return null;
  return quote;
}

// src/client/tool-view.jsx
function StockToolView({ phase, block, t, format, inspect }) {
  const settled = phase === "result";
  const quote = settled ? readQuotePresentation(block.meta) : null;
  const state = !settled ? phase === "preparing" ? "preparing" : "running" : block.isError ? "failed" : "done";
  const symbol = quote?.symbol ?? block.args?.text("symbol");
  return /* @__PURE__ */ import_react2.default.createElement("section", { className: "dxs dxs-section", "aria-label": t("quote.title") }, /* @__PURE__ */ import_react2.default.createElement("strong", null, t("quote.title"), symbol ? ` \xB7 ${symbol}` : ""), /* @__PURE__ */ import_react2.default.createElement("p", { role: "status" }, t(`quote.${state}`)), settled && block.isError && /* @__PURE__ */ import_react2.default.createElement("p", { role: "alert" }, t(quoteErrorKey(block.error))), quote && !block.isError && /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("dl", null, ["price", "open", "high", "low", "previousClose", "change", "changePercent"].map((key) => /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, { key }, /* @__PURE__ */ import_react2.default.createElement("dt", null, t(`quote.${key}`)), /* @__PURE__ */ import_react2.default.createElement("dd", null, key === "changePercent" ? format.change(quote[key]) : format.price(quote[key])))), /* @__PURE__ */ import_react2.default.createElement("dt", null, t("detail.source")), /* @__PURE__ */ import_react2.default.createElement("dd", null, quote.provider), /* @__PURE__ */ import_react2.default.createElement("dt", null, t("detail.quoted-at")), /* @__PURE__ */ import_react2.default.createElement("dd", null, format.time(quote.quotedAt, t)), /* @__PURE__ */ import_react2.default.createElement("dt", null, t("detail.fetched-at")), /* @__PURE__ */ import_react2.default.createElement("dd", null, format.time(quote.fetchedAt, t))), /* @__PURE__ */ import_react2.default.createElement("p", null, t("quote.notice"))), settled && !block.isError && !quote && /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("p", null, t("quote.legacy")), /* @__PURE__ */ import_react2.default.createElement("pre", { style: { whiteSpace: "pre-wrap" } }, (block.content ?? []).filter((item) => item.type === "text").map((item) => item.text).join("\n"))), inspect && /* @__PURE__ */ import_react2.default.createElement("button", { onClick: inspect }, t("quote.inspect")));
}

// src/client/index.js
var inject = ["slots", "connection", "resources", "layout", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "stock: dictionaries");
  const t = ctx.locale.bind(NS);
  const format = createFormatters(() => ctx.locale.getLocale().active);
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({ name: "tool.call.toolview", key: "dsh_x_stock_quote", locale: NS, inject: () => ({ format }) }, StockToolView));
  let storage;
  try {
    storage = globalThis.localStorage;
  } catch {
  }
  const controller = createWatchlistController(storage, globalThis.window);
  let scopeRequest;
  let disposed = false;
  const loadScope = async () => {
    scopeRequest?.abort();
    const request = new AbortController();
    scopeRequest = request;
    controller.scopeLoading();
    const timeout = setTimeout(() => {
      if (!disposed && scopeRequest === request) {
        controller.scopeFailed();
        request.abort();
      }
    }, 1e4);
    try {
      const result = await ctx.connection.rpc.call("/api", SCOPE_ENDPOINT, {}, request.signal);
      if (disposed || request.signal.aborted) return;
      if (!result.ok) throw new Error();
      controller.setScope(result.value.scope);
    } catch {
      if (!disposed && !request.signal.aborted) controller.scopeFailed();
    } finally {
      clearTimeout(timeout);
    }
  };
  ctx.effect(() => () => {
    disposed = true;
    scopeRequest?.abort();
    controller.dispose();
  }, "stock: watchlist");
  ctx.on("connection/reset", () => {
    void loadScope();
  });
  void loadScope();
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = "dsh-x-stock";
    style.textContent = CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, "stock: styles");
  ctx.effect(() => ctx.resources.register(quoteResource(ctx.connection.rpc)), "stock: quote resources");
  const face = () => ({
    format,
    hooks: { watchlist: controller.source },
    retryScope: () => {
      void loadScope();
    },
    add: (pin) => {
      controller.add(pin);
      controller.select(pin.symbol);
    },
    remove: controller.remove,
    move: controller.move,
    select: controller.select,
    collapse: controller.collapse,
    open: (symbol) => {
      if (symbol) controller.select(symbol);
      ctx.layout.selectPanel("dsh-x-stock");
    },
    back: () => ctx.layout.selectPanel(null)
  });
  mountWhenVacant(ctx.slots, { inject: face, locale: NS }, StockBar, controller.setPlacement);
  ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: "dsh-x-stock", inject: face, locale: NS }, StockPage));
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: "dsh-x-stock", order: 80, label: () => t("title") }, StockIcon));
}
return module.exports; } });
