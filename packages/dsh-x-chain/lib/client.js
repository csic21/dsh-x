window.__ModuleLoader__.load({ id: "dsh-x-chain", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
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

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  ChainSettings: () => ChainSettings,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = __toESM(require("react"), 1);

// src/client/locales.ts
var NS = "dsh-x-chain";
var zh = {
  "nav": "\u52A8\u4F5C\u94FE",
  "title": "\u52A8\u4F5C\u94FE\u6536\u76CA",
  "lead": "\u6309\u4F1A\u8BDD\u7EDF\u8BA1 chain_run \u6267\u884C\u4E86\u591A\u5C11\u6B65\u3001\u7701\u4E0B\u591A\u5C11\u6B21\u6A21\u578B\u5F80\u8FD4\u3002\u53E3\u5F84\u662F\u53CD\u4E8B\u5B9E\uFF1A\u7B2C\u4E00\u6B65\u4E4B\u540E\u7684\u6BCF\u4E00\u6B65\uFF0C\u5047\u8BBE\u6CA1\u6709\u94F6\u884C\u65F6\u9700\u8981\u4E00\u6B21\u65B0\u7684\u6A21\u578B\u8C03\u7528\u3002",
  "refresh": "\u5237\u65B0",
  "loading": "\u6B63\u5728\u8BFB\u53D6\u7EDF\u8BA1\u2026",
  "failed": "\u7EDF\u8BA1\u8BFB\u53D6\u5931\u8D25",
  "empty": "\u8FD8\u6CA1\u6709\u6267\u884C\u8FC7 chain_run\u3002\u8BA9\u6A21\u578B\u628A\u5DF2\u7ECF\u60F3\u6E05\u695A\u7684\u4E00\u4E32\u52A8\u4F5C\u4EA4\u7ED9\u5B83\uFF0C\u8FD9\u91CC\u5C31\u4F1A\u51FA\u73B0\u8BB0\u5F55\u3002",
  "chains": "\u94FE\u8C03\u7528",
  "steps": "\u6267\u884C\u6B65\u6570",
  "saved": "\u7701\u4E0B\u5F80\u8FD4",
  "stopped": "\u63D0\u524D\u505C\u4E0B",
  "session": "\u4F1A\u8BDD",
  "last": "\u6700\u8FD1\u4E00\u6B21",
  "na": "\u2014"
};
var en = {
  "nav": "Chain",
  "title": "Chain savings",
  "lead": "Per-session counts of chain_run steps and avoided model round trips. The counterfactual is explicit: every step after the first would have needed its own model call without the bank.",
  "refresh": "Refresh",
  "loading": "Reading statistics\u2026",
  "failed": "Could not read the statistics",
  "empty": "No chain_run call yet. Hand the model a bank of already-decided actions and the record appears here.",
  "chains": "Chains",
  "steps": "Steps",
  "saved": "Round trips saved",
  "stopped": "Stopped early",
  "session": "Session",
  "last": "Last run",
  "na": "\u2014"
};

// src/client/index.tsx
var inject = ["slots", "connection", "locale"];
var ENDPOINT = "dsh-x-chain/stats";
var CSS = `
.dxc-page { display: flex; flex-direction: column; gap: 18px; padding: 4px 2px 24px; }
.dxc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.dxc-head h2 { margin: 0 0 6px; font-size: 17px; font-weight: 600; }
.dxc-head p { margin: 0; max-width: 62ch; font-size: 12.5px; line-height: 1.6; opacity: .68; }
.dxc-refresh { flex: none; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); background: transparent; color: inherit; border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
.dxc-refresh:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
.dxc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 10px; }
.dxc-stat { border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 10px; padding: 12px 14px; }
.dxc-stat span { display: block; font-size: 11.5px; opacity: .62; margin-bottom: 6px; }
.dxc-stat strong { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
.dxc-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.dxc-table th, .dxc-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid color-mix(in srgb, currentColor 9%, transparent); }
.dxc-table th { font-weight: 500; opacity: .6; font-size: 11.5px; }
.dxc-table td.num { font-variant-numeric: tabular-nums; }
.dxc-muted { opacity: .55; font-size: 12.5px; line-height: 1.6; }
.dxc-error { color: #d9534f; font-size: 12.5px; }
`;
function unwrap(value) {
  const result = value;
  if (!result?.ok || result.value === void 0) throw new Error(String(result?.error?.code ?? "CHAIN_STATS_UNAVAILABLE"));
  return result.value;
}
function ChainSettings(props) {
  const { t, load } = props;
  const [data, setData] = (0, import_react.useState)(null);
  const [failed, setFailed] = (0, import_react.useState)(false);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const refresh = (0, import_react.useCallback)(async () => {
    setBusy(true);
    try {
      setData(await load());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [load]);
  (0, import_react.useEffect)(() => {
    void refresh();
  }, [refresh]);
  const totals = data?.totals;
  const sessions = data?.sessions ?? [];
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxc-page" }, /* @__PURE__ */ import_react.default.createElement("header", { className: "dxc-head" }, /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("h2", null, t("title")), /* @__PURE__ */ import_react.default.createElement("p", null, t("lead"))), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxc-refresh", onClick: () => void refresh(), disabled: busy }, t("refresh"))), failed ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dxc-error" }, t("failed")) : null, data === null && !failed ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dxc-muted" }, t("loading")) : null, totals !== void 0 ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-grid" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-stat" }, /* @__PURE__ */ import_react.default.createElement("span", null, t("chains")), /* @__PURE__ */ import_react.default.createElement("strong", null, totals.chains)), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-stat" }, /* @__PURE__ */ import_react.default.createElement("span", null, t("steps")), /* @__PURE__ */ import_react.default.createElement("strong", null, totals.steps)), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-stat" }, /* @__PURE__ */ import_react.default.createElement("span", null, t("saved")), /* @__PURE__ */ import_react.default.createElement("strong", null, totals.saved)), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-stat" }, /* @__PURE__ */ import_react.default.createElement("span", null, t("stopped")), /* @__PURE__ */ import_react.default.createElement("strong", null, totals.stopped))) : null, totals !== void 0 && totals.chains === 0 ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dxc-muted" }, t("empty")) : null, sessions.length > 0 ? /* @__PURE__ */ import_react.default.createElement("table", { className: "dxc-table" }, /* @__PURE__ */ import_react.default.createElement("thead", null, /* @__PURE__ */ import_react.default.createElement("tr", null, /* @__PURE__ */ import_react.default.createElement("th", null, t("session")), /* @__PURE__ */ import_react.default.createElement("th", null, t("chains")), /* @__PURE__ */ import_react.default.createElement("th", null, t("steps")), /* @__PURE__ */ import_react.default.createElement("th", null, t("saved")), /* @__PURE__ */ import_react.default.createElement("th", null, t("stopped")), /* @__PURE__ */ import_react.default.createElement("th", null, t("last")))), /* @__PURE__ */ import_react.default.createElement("tbody", null, sessions.slice(0, 20).map((session) => /* @__PURE__ */ import_react.default.createElement("tr", { key: session.sessionId }, /* @__PURE__ */ import_react.default.createElement("td", { title: session.sessionId }, session.sessionId.length > 18 ? `${session.sessionId.slice(0, 8)}\u2026${session.sessionId.slice(-6)}` : session.sessionId), /* @__PURE__ */ import_react.default.createElement("td", { className: "num" }, session.chains), /* @__PURE__ */ import_react.default.createElement("td", { className: "num" }, session.steps), /* @__PURE__ */ import_react.default.createElement("td", { className: "num" }, session.saved), /* @__PURE__ */ import_react.default.createElement("td", { className: "num" }, session.stopped), /* @__PURE__ */ import_react.default.createElement("td", null, session.lastAt > 0 ? new Date(session.lastAt).toLocaleString() : t("na")))))) : null);
}
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "chain: dictionaries");
  const t = ctx.locale.bind(NS);
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = NS;
    style.textContent = CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, "chain: styles");
  const load = async () => unwrap(await ctx.connection.rpc.call("/api", ENDPOINT, {}));
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: NS,
    order: 13,
    locale: NS,
    label: () => t("nav"),
    inject: () => ({ t, load })
  }, ChainSettings));
}
return module.exports; } });
