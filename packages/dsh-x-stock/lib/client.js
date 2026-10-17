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
var MAX_PINS = 8;
var STORAGE_KEY = "dsh-x-stock:watchlist:v1";
var QUOTE_CHANNEL = "/api";
var QUOTE_ENDPOINT = "dsh-x-stock.quotes";
function normalizeAShare(exchange, code) {
  const market = String(exchange).trim().toUpperCase();
  const digits = String(code).trim();
  if (!["SH", "SZ", "BJ"].includes(market) || !/^\d{6}$/.test(digits)) throw new Error("\u8BF7\u9009\u62E9\u4EA4\u6613\u6240\u5E76\u8F93\u5165\u516D\u4F4D\u80A1\u7968\u4EE3\u7801\u3002");
  return `${market}.${digits}`;
}
function validateSymbol(symbol) {
  if (typeof symbol !== "string" || !/^(SH|SZ|BJ)\.\d{6}$/.test(symbol)) throw new Error("A \u80A1\u4EE3\u7801\u987B\u5305\u542B\u4EA4\u6613\u6240\u548C\u516D\u4F4D\u6570\u5B57\u3002");
  return symbol;
}
function normalizePin(pin) {
  if (!pin || typeof pin !== "object") throw new Error("\u65E0\u6548\u81EA\u9009\u9879\u3002");
  const symbol = validateSymbol(pin.symbol);
  const alias = typeof pin.alias === "string" ? pin.alias.trim().slice(0, 24) : "";
  return { symbol, alias };
}
function parseSaved(raw) {
  if (!raw) return { pins: [], collapsed: false };
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !Array.isArray(value.pins) || value.pins.length > MAX_PINS) throw new Error("\u4FDD\u5B58\u7684\u81EA\u9009\u6E05\u5355\u683C\u5F0F\u4E0D\u517C\u5BB9\u3002");
  const pins = value.pins.map(normalizePin);
  if (new Set(pins.map((p) => p.symbol)).size !== pins.length) throw new Error("\u4FDD\u5B58\u7684\u81EA\u9009\u6E05\u5355\u542B\u91CD\u590D\u4EE3\u7801\u3002");
  return { pins, collapsed: value.collapsed === true };
}
function quoteLabel(quote, now = Date.now()) {
  if (!quote || quote.status === "unconfigured") return "\u672A\u914D\u7F6E\u884C\u60C5";
  if (quote.status === "unavailable") return "\u6682\u65E0\u62A5\u4EF7";
  if (!quote.quotedAt) return "\u62A5\u4EF7\u65F6\u95F4\u672A\u77E5";
  if (now - Date.parse(quote.quotedAt) > 18e4) return "\u65E7\u62A5\u4EF7 \xB7 \u53EF\u80FD\u5EF6\u8FDF/\u4F11\u5E02";
  return quote.marketStatus === "closed" ? "\u4F11\u5E02 \xB7 \u6700\u8FD1\u62A5\u4EF7" : "\u6700\u8FD1\u62A5\u4EF7 \xB7 \u53EF\u80FD\u5EF6\u8FDF";
}
var SCOPE_ENDPOINT = "dsh-x-stock.scope";
function validateScope(scope) {
  if (typeof scope !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scope)) throw new Error("\u5BBF\u4E3B\u81EA\u9009\u5B58\u50A8\u6807\u8BC6\u65E0\u6548\u3002");
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
    if (!storageKey || state.scopeStatus !== "ready") throw new Error("\u6B63\u5728\u786E\u8BA4\u6B64 profile \u7684\u5B58\u50A8\u4F4D\u7F6E\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
    publish(patch);
    try {
      if (!storage) throw new Error();
      storage.setItem(storageKey, JSON.stringify({ version: 1, pins: state.pins, collapsed: state.collapsed }));
      publish({ storageError: "" });
    } catch {
      publish({ storageError: "\u65E0\u6CD5\u4FDD\u5B58\u5230\u6B64\u6D4F\u89C8\u5668\uFF1B\u5F53\u524D\u4FEE\u6539\u4EC5\u5728\u672C\u6B21\u4F7F\u7528\u6709\u6548\u3002" });
    }
  };
  const storageChanged = (event) => {
    if (!storageKey || state.scopeStatus !== "ready" || event.key !== storageKey) return;
    try {
      publish({ ...parseSaved(event.newValue), storageError: "" });
    } catch {
      publish({ storageError: "\u53E6\u4E00\u7A97\u53E3\u7684\u6E05\u5355\u683C\u5F0F\u65E0\u6548\uFF0C\u5DF2\u4FDD\u7559\u5F53\u524D\u6E05\u5355\u3002" });
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
        storageError = "\u65E0\u6CD5\u8BFB\u53D6\u6B64 profile \u7684\u672C\u5730\u6E05\u5355\uFF1B\u672C\u6B21\u4FEE\u6539\u524D\u4E0D\u4F1A\u8986\u76D6\u539F\u8BB0\u5F55\u3002";
      }
      publish({ ...saved, selectedSymbol: saved.pins[0]?.symbol ?? null, storageError, scopeStatus: "ready" });
    },
    scopeLoading: () => {
      storageKey = null;
      publish({ scopeStatus: "loading", pins: [], selectedSymbol: null, collapsed: false });
    },
    scopeFailed: () => {
      storageKey = null;
      publish({ pins: [], selectedSymbol: null, scopeStatus: "failed", storageError: "\u65E0\u6CD5\u786E\u8BA4\u6B64 profile \u7684\u5B58\u50A8\u4F4D\u7F6E\uFF1B\u5DF2\u6682\u505C\u8BFB\u53D6\u548C\u4FDD\u5B58\u6E05\u5355\u3002" });
    },
    select: (symbol) => publish({ selectedSymbol: symbol }),
    setPlacement: (placement) => {
      if (state.placement !== placement) publish({ placement });
    },
    add(pin) {
      const item = normalizePin(pin);
      if (state.pins.some((p) => p.symbol === item.symbol)) throw new Error("\u8FD9\u53EA\u80A1\u7968\u5DF2\u7ECF\u56FA\u5B9A\u3002");
      if (state.pins.length >= MAX_PINS) throw new Error("\u6700\u591A\u56FA\u5B9A\u516B\u53EA\u80A1\u7968\uFF0C\u8BF7\u5148\u79FB\u9664\u4E00\u53EA\u3002");
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
          yield { ok: false, error: { code: "stock/paused", message: navigatorObject?.onLine === false ? "\u79BB\u7EBF \xB7 \u5DF2\u6682\u505C\u66F4\u65B0" : "\u7A97\u53E3\u9690\u85CF \xB7 \u5DF2\u6682\u505C\u66F4\u65B0", details: {} } };
          await wait(Infinity, signal, documentObject);
          continue;
        }
        let result;
        try {
          result = await rpc.call(QUOTE_CHANNEL, QUOTE_ENDPOINT, { symbols: [symbol] }, signal);
        } catch {
          result = { ok: false, error: { code: "stock/connection", message: "\u8FDE\u63A5\u4E2D\u65AD \xB7 \u4FDD\u7559\u6700\u8FD1\u62A5\u4EF7", details: {} } };
        }
        if (signal.aborted) return;
        if (result.ok) {
          const quote = result.value?.quotes?.find((item) => item.symbol === symbol);
          if (!quote) result = { ok: false, error: { code: "stock/invalid", message: "\u884C\u60C5\u54CD\u5E94\u65E0\u6548", details: {} } };
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
var price = (value) => Number.isFinite(value) ? value.toFixed(2) : "\u2014";
var change = (value) => Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}%` : "\u2014";
var tone = (value) => value > 0 ? "dxs-up" : value < 0 ? "dxs-down" : "";
var time = (value) => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) + "\uFF08\u4E0A\u6D77\uFF09" : "\u672A\u63D0\u4F9B";
function Status({ snapshot }) {
  if (snapshot.status === "loading") return /* @__PURE__ */ import_react.default.createElement("span", { className: "dxs-muted" }, "\u83B7\u53D6\u4E2D");
  if (snapshot.status === "failed") return /* @__PURE__ */ import_react.default.createElement("span", { className: "dxs-muted" }, snapshot.failure?.message ?? "\u66F4\u65B0\u5931\u8D25 \xB7 \u65E7\u62A5\u4EF7");
  return /* @__PURE__ */ import_react.default.createElement("span", { className: "dxs-muted" }, quoteLabel(snapshot.value));
}
function StockChip({ pin, useResource, open }) {
  const snapshot = useResource(addressFor(pin.symbol)), quote = snapshot.value;
  return /* @__PURE__ */ import_react.default.createElement("button", { className: "dxs-chip", onClick: () => open(pin.symbol), title: `${pin.symbol} \xB7 ${quoteLabel(quote)} \xB7 \u70B9\u51FB\u67E5\u770B\u8BE6\u60C5` }, /* @__PURE__ */ import_react.default.createElement("strong", null, pin.alias || quote?.name || pin.symbol), /* @__PURE__ */ import_react.default.createElement("span", null, price(quote?.price)), quote?.price != null ? /* @__PURE__ */ import_react.default.createElement("span", { className: tone(quote.changePercent) }, change(quote.changePercent)) : /* @__PURE__ */ import_react.default.createElement(Status, { snapshot }), quote?.price != null && (snapshot.status === "failed" || quoteLabel(quote).startsWith("\u65E7")) ? /* @__PURE__ */ import_react.default.createElement("span", { className: "dxs-muted" }, "\u65E7") : null);
}
function StockBar({ useWatchlist, useResource, collapse, open }) {
  const state = useWatchlist((value) => value);
  if (!state.pins.length) return null;
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxs dxs-bar", "aria-label": "\u56FA\u5B9A\u80A1\u7968" }, /* @__PURE__ */ import_react.default.createElement("button", { onClick: () => collapse(!state.collapsed), "aria-expanded": !state.collapsed, "aria-label": state.collapsed ? "\u5C55\u5F00\u81EA\u9009\u80A1\u7968" : "\u6536\u8D77\u81EA\u9009\u80A1\u7968" }, state.collapsed ? "\u25B8" : "\u25BE", " \u81EA\u9009 ", state.pins.length), !state.collapsed && /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-strip", "aria-label": "\u6309\u624B\u52A8\u987A\u5E8F\u6392\u5217\u7684\u81EA\u9009\u80A1\u7968" }, state.pins.length ? state.pins.map((pin) => /* @__PURE__ */ import_react.default.createElement(StockChip, { key: pin.symbol, pin, useResource, open })) : /* @__PURE__ */ import_react.default.createElement("span", { className: "dxs-muted" }, "\u56FA\u5B9A\u5E38\u770B\u7684 A \u80A1\uFF0C\u5DE5\u4F5C\u65F6\u4E00\u773C\u67E5\u770B")), /* @__PURE__ */ import_react.default.createElement("button", { onClick: () => open(state.selectedSymbol) }, "\u80A1\u7968", state.pins.length ? "" : " \xB7 \u6DFB\u52A0"));
}
function StockIcon({ size = 20 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M4 4v16h16M7 15l4-5 4 3 5-7", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }));
}
function AddStock({ add, count, ready }) {
  const [exchange, setExchange] = (0, import_react.useState)("SH"), [code, setCode] = (0, import_react.useState)(""), [alias, setAlias] = (0, import_react.useState)(""), [error, setError] = (0, import_react.useState)("");
  const submit = (event) => {
    event.preventDefault();
    try {
      add({ symbol: normalizeAShare(exchange, code), alias });
      setCode("");
      setAlias("");
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  };
  return /* @__PURE__ */ import_react.default.createElement("form", { className: "dxs-form", onSubmit: submit }, /* @__PURE__ */ import_react.default.createElement("h2", null, "\u56FA\u5B9A\u80A1\u7968"), /* @__PURE__ */ import_react.default.createElement("label", null, "\u4EA4\u6613\u6240", /* @__PURE__ */ import_react.default.createElement("select", { value: exchange, onChange: (event) => setExchange(event.target.value) }, /* @__PURE__ */ import_react.default.createElement("option", { value: "SH" }, "\u4E0A\u6D77 \xB7 SH"), /* @__PURE__ */ import_react.default.createElement("option", { value: "SZ" }, "\u6DF1\u5733 \xB7 SZ"), /* @__PURE__ */ import_react.default.createElement("option", { value: "BJ" }, "\u5317\u4EAC \xB7 BJ"))), /* @__PURE__ */ import_react.default.createElement("label", null, "\u516D\u4F4D\u80A1\u7968\u4EE3\u7801", /* @__PURE__ */ import_react.default.createElement("input", { value: code, onChange: (event) => setCode(event.target.value), inputMode: "numeric", maxLength: 6, placeholder: "600519", required: true, pattern: "[0-9]{6}" })), /* @__PURE__ */ import_react.default.createElement("label", null, "\u663E\u793A\u522B\u540D\uFF08\u9009\u586B\uFF09", /* @__PURE__ */ import_react.default.createElement("input", { value: alias, onChange: (event) => setAlias(event.target.value), maxLength: 24, placeholder: "\u81EA\u5DF1\u719F\u6089\u7684\u540D\u79F0" })), /* @__PURE__ */ import_react.default.createElement("button", { type: "submit", disabled: !ready || count >= MAX_PINS }, "\u6DFB\u52A0\u5230\u81EA\u9009 \xB7 ", count, "/", MAX_PINS), error && /* @__PURE__ */ import_react.default.createElement("p", { role: "alert", className: "dxs-error" }, error), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, "\u4EE3\u7801\u4EC5\u505A\u683C\u5F0F\u6821\u9A8C\uFF1B\u5F53\u524D\u672A\u9A8C\u8BC1\u8BC1\u5238\u540D\u79F0\u6216\u4E0A\u5E02\u72B6\u6001\u3002\u6E05\u5355\u4EC5\u4FDD\u5B58\u5728\u6B64\u6D4F\u89C8\u5668\uFF0C\u4E0D\u8DE8\u8BBE\u5907\u540C\u6B65\u3002"));
}
function Detail({ pin, useResource }) {
  const snapshot = useResource(addressFor(pin.symbol)), quote = snapshot.value;
  return /* @__PURE__ */ import_react.default.createElement("article", { "aria-label": `${pin.symbol} \u80A1\u7968\u8BE6\u60C5` }, /* @__PURE__ */ import_react.default.createElement("section", { className: "dxs-section" }, /* @__PURE__ */ import_react.default.createElement("h2", null, pin.alias || quote?.name || pin.symbol), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, pin.symbol, pin.alias ? " \xB7 \u81EA\u5B9A\u4E49\u522B\u540D" : ""), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-price" }, price(quote?.price), " ", /* @__PURE__ */ import_react.default.createElement("span", { className: tone(quote?.changePercent), style: { fontSize: 18 } }, change(quote?.changePercent))), /* @__PURE__ */ import_react.default.createElement("p", null, /* @__PURE__ */ import_react.default.createElement(Status, { snapshot })), /* @__PURE__ */ import_react.default.createElement("dl", null, /* @__PURE__ */ import_react.default.createElement("dt", null, "\u6570\u636E\u6765\u6E90"), /* @__PURE__ */ import_react.default.createElement("dd", null, quote?.source || "\u5C1A\u672A\u63A5\u5165\u83B7\u6388\u6743\u7684 A \u80A1\u6570\u636E\u6E90"), /* @__PURE__ */ import_react.default.createElement("dt", null, "\u62A5\u4EF7\u65F6\u95F4"), /* @__PURE__ */ import_react.default.createElement("dd", null, time(quote?.quotedAt)), /* @__PURE__ */ import_react.default.createElement("dt", null, "\u83B7\u53D6\u65F6\u95F4"), /* @__PURE__ */ import_react.default.createElement("dd", null, time(quote?.fetchedAt))), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, "\u83B7\u53D6\u65F6\u95F4\u4E0D\u4EE3\u8868\u62A5\u4EF7\u65F6\u95F4\u3002\u4E0D\u4F1A\u6839\u636E\u5F53\u524D\u65F6\u949F\u731C\u6D4B\u4F11\u5E02\u3001\u8282\u5047\u65E5\u6216\u505C\u724C\u3002")), /* @__PURE__ */ import_react.default.createElement("section", { className: "dxs-section" }, /* @__PURE__ */ import_react.default.createElement("h2", null, "\u8D70\u52BF\u4E0E\u6210\u4EA4"), /* @__PURE__ */ import_react.default.createElement("p", null, "\u6682\u65E0\u5386\u53F2\u884C\u60C5"), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, "\u63A5\u5165\u652F\u6301\u5206\u65F6\u3001K \u7EBF\u4E0E\u6210\u4EA4\u91CF\u7684\u6570\u636E\u6E90\u540E\u5C55\u793A\u3002\u5F53\u524D\u6CA1\u6709\u53EF\u9A8C\u8BC1\u7684\u6570\u636E\uFF0C\u4E0D\u7ED8\u5236\u793A\u610F\u8D70\u52BF\u3002")), /* @__PURE__ */ import_react.default.createElement("section", { className: "dxs-section" }, /* @__PURE__ */ import_react.default.createElement("h2", null, "\u57FA\u672C\u9762"), /* @__PURE__ */ import_react.default.createElement("p", null, "\u6682\u65E0\u5DF2\u9A8C\u8BC1\u7684\u8D22\u62A5\u4E0E\u4F30\u503C\u6570\u636E"), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, "\u63A5\u5165\u540E\u5C06\u6807\u660E\u62A5\u544A\u671F\u3001\u62AB\u9732\u65E5\u671F\u53CA\u6765\u6E90\u3002")), /* @__PURE__ */ import_react.default.createElement("section", { className: "dxs-section" }, /* @__PURE__ */ import_react.default.createElement("h2", null, "\u5206\u6790"), /* @__PURE__ */ import_react.default.createElement("p", null, "\u6570\u636E\u4E0D\u8DB3\uFF0C\u6682\u4E0D\u751F\u6210\u5206\u6790\u7ED3\u8BBA"), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, "\u9700\u8981\u53EF\u9760\u7684\u884C\u60C5\u3001\u8D22\u52A1\u4E0E\u516C\u544A\u4F9D\u636E\uFF1B\u5206\u6790\u5E94\u533A\u5206\u4E8B\u5B9E\u3001\u63A8\u65AD\u548C\u98CE\u9669\u3002\u4E0D\u63D0\u4F9B\u4EA4\u6613\u6267\u884C\u3002")));
}
function StockPage({ useWatchlist, useResource, add, remove, move, select, back, retryScope }) {
  const state = useWatchlist((value) => value);
  const pin = state.pins.find((item) => item.symbol === state.selectedSymbol) ?? state.pins[0];
  return /* @__PURE__ */ import_react.default.createElement("main", { className: "dxs dxs-page" }, /* @__PURE__ */ import_react.default.createElement("header", { className: "dxs-heading" }, /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("h1", null, "\u80A1\u7968"), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, "\u624B\u52A8\u81EA\u9009 \xB7 A \u80A1\u8BE6\u60C5\u4E0E\u5206\u6790")), /* @__PURE__ */ import_react.default.createElement("button", { onClick: back }, "\u8FD4\u56DE\u5BF9\u8BDD")), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-notice" }, "\u884C\u60C5\u672A\u914D\u7F6E\uFF1A\u5148\u6574\u7406\u4F60\u7684\u81EA\u9009\u6E05\u5355\u3002\u5F53\u524D\u6CA1\u6709\u63A5\u5165\u83B7\u6388\u6743\u7684 A \u80A1\u884C\u60C5\uFF0C\u4EF7\u683C\u548C\u6DA8\u8DCC\u5E45\u4E0D\u4F1A\u663E\u793A\u4E3A\u5B9E\u65F6\u6570\u636E\u3002"), state.placement === "occupied" && /* @__PURE__ */ import_react.default.createElement("p", { role: "status", className: "dxs-notice" }, "\u5E95\u90E8\u63D2\u69FD\u5DF2\u6709\u5176\u4ED6\u63D2\u4EF6\u5360\u7528\uFF0C\u81EA\u9009\u6761\u5DF2\u8BA9\u51FA\u4F4D\u7F6E\u3002\u4F60\u4ECD\u53EF\u5728\u6B64\u7BA1\u7406\u548C\u67E5\u770B\u80A1\u7968\u3002"), state.scopeStatus === "loading" && /* @__PURE__ */ import_react.default.createElement("p", { role: "status" }, "\u6B63\u5728\u786E\u8BA4\u6B64 profile \u7684\u81EA\u9009\u5B58\u50A8\u2026"), state.scopeStatus === "failed" && /* @__PURE__ */ import_react.default.createElement("button", { onClick: retryScope }, "\u91CD\u8BD5\u8FDE\u63A5\u81EA\u9009\u5B58\u50A8"), state.storageError && /* @__PURE__ */ import_react.default.createElement("p", { role: "alert", className: "dxs-error" }, state.storageError), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-layout" }, /* @__PURE__ */ import_react.default.createElement("aside", { "aria-label": "\u81EA\u9009\u7BA1\u7406" }, /* @__PURE__ */ import_react.default.createElement("h2", null, "\u6211\u7684\u81EA\u9009"), !state.pins.length && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, "\u8FD8\u6CA1\u6709\u56FA\u5B9A\u80A1\u7968\u3002\u6DFB\u52A0\u4E00\u53EA\u5F00\u59CB\u3002"), /* @__PURE__ */ import_react.default.createElement("ol", { className: "dxs-list" }, state.pins.map((item, index) => /* @__PURE__ */ import_react.default.createElement("li", { key: item.symbol }, /* @__PURE__ */ import_react.default.createElement("button", { className: "dxs-select", "aria-pressed": pin?.symbol === item.symbol, onClick: () => select(item.symbol) }, /* @__PURE__ */ import_react.default.createElement("strong", null, item.alias || item.symbol), item.alias && /* @__PURE__ */ import_react.default.createElement("span", { className: "dxs-muted" }, " \xB7 ", item.symbol)), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-controls" }, /* @__PURE__ */ import_react.default.createElement("button", { disabled: index === 0, "aria-label": `\u4E0A\u79FB ${item.symbol}`, onClick: () => move(item.symbol, -1) }, "\u2191"), /* @__PURE__ */ import_react.default.createElement("button", { disabled: index === state.pins.length - 1, "aria-label": `\u4E0B\u79FB ${item.symbol}`, onClick: () => move(item.symbol, 1) }, "\u2193"), /* @__PURE__ */ import_react.default.createElement("button", { "aria-label": `\u79FB\u9664 ${item.symbol}`, onClick: () => remove(item.symbol) }, "\u79FB\u9664"))))), /* @__PURE__ */ import_react.default.createElement(AddStock, { add, count: state.pins.length, ready: state.scopeStatus === "ready" })), pin ? /* @__PURE__ */ import_react.default.createElement(Detail, { key: pin.symbol, pin, useResource }) : /* @__PURE__ */ import_react.default.createElement("section", { className: "dxs-section" }, /* @__PURE__ */ import_react.default.createElement("h2", null, "\u9009\u4E00\u53EA\u80A1\u7968\uFF0C\u770B\u6E05\u5B83\u7684\u60C5\u51B5"), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-muted" }, "\u8FD9\u91CC\u5C06\u5C55\u793A\u62A5\u4EF7\u3001\u8D70\u52BF\u3001\u57FA\u672C\u9762\u548C\u6709\u4F9D\u636E\u7684\u5206\u6790\u3002\u5E95\u90E8\u81EA\u9009\u6761\u53EA\u8D1F\u8D23\u5DE5\u4F5C\u65F6\u7684\u5FEB\u6377\u67E5\u770B\u3002"))));
}

// src/client/styles.js
var CSS = `
.dxs{color:var(--dsw-alias-label-primary,#202124);font:13px/1.5 system-ui,sans-serif;box-sizing:border-box}.dxs *{box-sizing:border-box}.dxs button,.dxs input,.dxs select{font:inherit;color:inherit}.dxs button{cursor:pointer;border:1px solid var(--dsw-alias-border-main,#bbb);border-radius:7px;background:var(--dsw-alias-bg-layer-1,#fff);padding:5px 9px;white-space:nowrap}.dxs button:hover{background:var(--dsw-alias-bg-layer-2,#eee)}.dxs button:focus-visible,.dxs input:focus-visible,.dxs select:focus-visible{outline:2px solid var(--dsw-alias-primary,#4169e1);outline-offset:2px}.dxs button:disabled{opacity:.4;cursor:default}.dxs-bar{display:flex;align-items:center;gap:8px;width:100%;max-width:100vw;padding:5px 12px;border-top:1px solid var(--dsw-alias-border-main,#ddd);background:var(--dsw-alias-bg-layer-1,#fff);min-height:40px}.dxs-strip{display:flex;align-items:center;gap:8px;min-width:0;flex:1;overflow-x:auto;padding:2px}.dxs-chip{display:flex;align-items:center;gap:8px;flex:none}.dxs-muted{color:var(--dsw-alias-label-secondary,#666);font-size:12px}.dxs-up{color:var(--dsw-alias-error,#bc2737)}.dxs-down{color:var(--dsw-alias-success,#16784e)}.dxs-page{height:100%;overflow:auto;padding:28px;max-width:1200px;margin:auto}.dxs-heading{display:flex;justify-content:space-between;gap:12px;align-items:start}.dxs h1{font-size:23px;margin:0}.dxs h2{font-size:16px;margin:0 0 12px}.dxs p{margin:8px 0}.dxs-notice{padding:10px 12px;background:var(--dsw-alias-bg-layer-2,#f4f4f5);border-radius:8px;margin:12px 0}.dxs-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:22px;margin-top:20px}.dxs-list{padding:0;list-style:none}.dxs-list li{margin:8px 0}.dxs-list .dxs-select{width:100%;text-align:left;white-space:normal}.dxs-controls{display:flex;gap:5px;margin-top:4px}.dxs-form{display:grid;gap:8px;margin-top:16px}.dxs input,.dxs select{min-width:0;width:100%;padding:7px 9px;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-main,#bbb);border-radius:6px}.dxs-section{padding:18px;border:1px solid var(--dsw-alias-border-main,#ddd);border-radius:10px;margin-bottom:16px}.dxs-price{font-size:30px;font-variant-numeric:tabular-nums}.dxs dl{display:grid;grid-template-columns:auto 1fr;gap:5px 16px}.dxs dd{margin:0;overflow-wrap:anywhere}.dxs-error{color:var(--dsw-alias-error,#bc2737)}@media(max-width:650px){.dxs-page{padding:16px}.dxs-layout{grid-template-columns:1fr}.dxs-bar{padding:4px 6px;gap:4px}.dxs-heading{flex-wrap:wrap}}`;

// src/client/index.js
var inject = ["slots", "connection", "resources", "layout"];
function apply(ctx) {
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
  mountWhenVacant(ctx.slots, { inject: face }, StockBar, controller.setPlacement);
  ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: "dsh-x-stock", inject: face }, StockPage));
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: "dsh-x-stock", order: 80, label: "\u80A1\u7968" }, StockIcon));
}
return module.exports; } });
