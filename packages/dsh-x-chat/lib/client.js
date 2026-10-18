window.__ModuleLoader__.load({ id: "dsh-x-chat", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
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

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/ChatToolRow.tsx
var import_react = __toESM(require("react"), 1);

// src/client/locales.ts
var NS = "dsh-x-chat";
var en = Object.freeze({
  "title": "Read-only Q&A",
  "status.preparing": "Preparing question",
  "status.running": "Generating answer",
  "status.complete": "Answer ready",
  "status.failed": "Question failed",
  "status.cancelled": "Question cancelled",
  "details.show": "Show question details",
  "details.hide": "Hide question details",
  "inspect": "Inspect call",
  "prompt": "Question",
  "context": "Reference material",
  "provider": "Provider",
  "model": "Model",
  "answer": "Answer",
  "empty": "No recorded answer is available.",
  "truncated": "The answer reached the output token limit and may be incomplete.",
  "error.unknown": "The question could not be completed. Inspect the call for details.",
  "error.DSH_X_CHAT_ROUTE": "Set both provider and model to non-empty strings of at most 256 characters.",
  "error.DSH_X_CHAT_CONFIG": "Plugin configuration must be an object.",
  "error.DSH_X_CHAT_CONFIG_KEY": "The plugin configuration contains an unsupported option.",
  "error.DSH_X_CHAT_TIMEOUT_CONFIG": "timeoutMs must be an integer between 1 and 120000.",
  "error.DSH_X_CHAT_TOKENS_CONFIG": "maxOutputTokens must be an integer between 1 and 8192.",
  "error.DSH_X_CHAT_PROMPT_TYPE": "prompt must be a non-empty string.",
  "error.DSH_X_CHAT_CONTEXT_TYPE": "context must be a string.",
  "error.DSH_X_CHAT_PROMPT_LIMIT": "prompt exceeds the 16384-byte UTF-8 limit. Shorten it and try again.",
  "error.DSH_X_CHAT_CONTEXT_LIMIT": "context exceeds the 49152-byte UTF-8 limit. Shorten it and try again.",
  "error.DSH_X_CHAT_CANCELLED": "The question was cancelled.",
  "error.DSH_X_CHAT_TIMEOUT": "The question timed out.",
  "error.DSH_X_CHAT_AFTER_FINISH": "The model returned more data after its finish marker.",
  "error.DSH_X_CHAT_RESPONSE_LIMIT": "The model response exceeded the safety size limit and was stopped.",
  "error.DSH_X_CHAT_TOOL_CALL": "Read-only Q&A does not allow model tool calls.",
  "error.DSH_X_CHAT_FINISH": "The model did not finish normally because of an error, cancellation, or tool request.",
  "error.DSH_X_CHAT_INCOMPLETE": "The model response has no finish marker and cannot be treated as a complete answer.",
  "error.DSH_X_CHAT_CONTENT": "The model returned an unsupported content type.",
  "error.DSH_X_CHAT_EMPTY": "The model returned no visible text.",
  "error.DSH_X_CHAT_PROVIDER": "The question failed. Check the configured provider, model, and connection."
});
var zh = Object.freeze({
  "title": "\u53EA\u8BFB\u95EE\u7B54",
  "status.preparing": "\u6B63\u5728\u51C6\u5907\u95EE\u9898",
  "status.running": "\u6B63\u5728\u751F\u6210\u56DE\u7B54",
  "status.complete": "\u56DE\u7B54\u5DF2\u5B8C\u6210",
  "status.failed": "\u95EE\u7B54\u5931\u8D25",
  "status.cancelled": "\u95EE\u7B54\u5DF2\u53D6\u6D88",
  "details.show": "\u5C55\u5F00\u95EE\u7B54\u8BE6\u60C5",
  "details.hide": "\u6536\u8D77\u95EE\u7B54\u8BE6\u60C5",
  "inspect": "\u68C0\u67E5\u8C03\u7528",
  "prompt": "\u95EE\u9898",
  "context": "\u53C2\u8003\u6750\u6599",
  "provider": "\u63D0\u4F9B\u65B9",
  "model": "\u6A21\u578B",
  "answer": "\u56DE\u7B54",
  "empty": "\u6CA1\u6709\u53EF\u663E\u793A\u7684\u5DF2\u8BB0\u5F55\u56DE\u7B54\u3002",
  "truncated": "\u56DE\u7B54\u8FBE\u5230\u8F93\u51FA token \u4E0A\u9650\uFF0C\u5185\u5BB9\u53EF\u80FD\u4E0D\u5B8C\u6574\u3002",
  "error.unknown": "\u65E0\u6CD5\u5B8C\u6210\u95EE\u7B54\uFF0C\u8BF7\u68C0\u67E5\u8C03\u7528\u8BE6\u60C5\u3002",
  "error.DSH_X_CHAT_ROUTE": "provider \u548C model \u5FC5\u987B\u540C\u65F6\u8BBE\u7F6E\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32\uFF08\u6700\u591A 256 \u5B57\u7B26\uFF09\u3002",
  "error.DSH_X_CHAT_CONFIG": "\u63D2\u4EF6\u914D\u7F6E\u5FC5\u987B\u662F\u5BF9\u8C61\u3002",
  "error.DSH_X_CHAT_CONFIG_KEY": "\u4E0D\u652F\u6301\u7684\u63D2\u4EF6\u914D\u7F6E\u9879\u3002",
  "error.DSH_X_CHAT_TIMEOUT_CONFIG": "timeoutMs \u5FC5\u987B\u4E3A 1\u2013120000 \u7684\u6574\u6570\u3002",
  "error.DSH_X_CHAT_TOKENS_CONFIG": "maxOutputTokens \u5FC5\u987B\u4E3A 1\u20138192 \u7684\u6574\u6570\u3002",
  "error.DSH_X_CHAT_PROMPT_TYPE": "prompt \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\u3002",
  "error.DSH_X_CHAT_CONTEXT_TYPE": "context \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u3002",
  "error.DSH_X_CHAT_PROMPT_LIMIT": "prompt \u8D85\u8FC7 16384 UTF-8 \u5B57\u8282\u9650\u5236\uFF0C\u8BF7\u7F29\u77ED\u540E\u91CD\u8BD5\u3002",
  "error.DSH_X_CHAT_CONTEXT_LIMIT": "context \u8D85\u8FC7 49152 UTF-8 \u5B57\u8282\u9650\u5236\uFF0C\u8BF7\u7F29\u77ED\u540E\u91CD\u8BD5\u3002",
  "error.DSH_X_CHAT_CANCELLED": "\u95EE\u7B54\u5DF2\u53D6\u6D88\u3002",
  "error.DSH_X_CHAT_TIMEOUT": "\u95EE\u7B54\u8D85\u65F6\u3002",
  "error.DSH_X_CHAT_AFTER_FINISH": "\u6A21\u578B\u5728\u7ED3\u675F\u6807\u8BB0\u540E\u7EE7\u7EED\u8FD4\u56DE\u6570\u636E\u3002",
  "error.DSH_X_CHAT_RESPONSE_LIMIT": "\u6A21\u578B\u54CD\u5E94\u8D85\u8FC7\u5B89\u5168\u5927\u5C0F\u9650\u5236\uFF0C\u5DF2\u4E2D\u6B62\u3002",
  "error.DSH_X_CHAT_TOOL_CALL": "\u53EA\u8BFB\u95EE\u7B54\u62D2\u7EDD\u6A21\u578B\u5DE5\u5177\u8C03\u7528\u3002",
  "error.DSH_X_CHAT_FINISH": "\u6A21\u578B\u672A\u6B63\u5E38\u5B8C\u6210\u95EE\u7B54\uFF08\u9519\u8BEF\u3001\u53D6\u6D88\u6216\u5DE5\u5177\u8BF7\u6C42\uFF09\u3002",
  "error.DSH_X_CHAT_INCOMPLETE": "\u6A21\u578B\u54CD\u5E94\u7F3A\u5C11\u7ED3\u675F\u6807\u8BB0\uFF0C\u4E0D\u80FD\u4F5C\u4E3A\u5B8C\u6574\u56DE\u7B54\u3002",
  "error.DSH_X_CHAT_CONTENT": "\u6A21\u578B\u8FD4\u56DE\u4E86\u4E0D\u652F\u6301\u7684\u5185\u5BB9\u7C7B\u578B\u3002",
  "error.DSH_X_CHAT_EMPTY": "\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u53EF\u89C1\u6587\u5B57\u3002",
  "error.DSH_X_CHAT_PROVIDER": "\u95EE\u7B54\u8C03\u7528\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u5DF2\u914D\u7F6E\u7684\u63D0\u4F9B\u65B9\u3001\u6A21\u578B\u53CA\u5176\u8FDE\u63A5\u72B6\u6001\u3002"
});

// src/client/model.ts
var CANCELLED = /* @__PURE__ */ new Set(["interrupted", "ABORTED", "ABORTED_BEFORE_DISPATCH", "DSH_X_CHAT_CANCELLED"]);
function resultMetadata(meta, content) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const value = meta;
  if (value.kind !== "dsh-x-chat" || value.version !== 1 || value.answerBlocks !== 1 || typeof value.provider !== "string" || typeof value.model !== "string" || typeof value.truncated !== "boolean" || !Array.isArray(content) || content.length !== (value.truncated ? 2 : 1) || content.some((item) => !item || typeof item !== "object" || item.type !== "text" || typeof item.text !== "string")) return null;
  return { answerBlocks: value.answerBlocks, provider: value.provider, model: value.model, truncated: value.truncated };
}
function argument(block, key) {
  const value = block?.args?.text?.(key);
  return typeof value === "string" ? value : "";
}
function visibleText(block, settled, failed, meta) {
  if (!settled || failed) return "";
  const content = block?.content;
  if (!Array.isArray(content)) return "";
  const shown = meta ? content.slice(0, meta.answerBlocks) : content;
  return shown.map((item) => item && typeof item === "object" && item.type === "text" ? String(item.text) : JSON.stringify(item, null, 2)).join("\n");
}
function chatViewModel(phase, block) {
  const settled = phase === "result";
  const failed = settled && block?.isError === true;
  const code = block?.error?.code;
  const cancelled = failed && typeof code === "string" && CANCELLED.has(code);
  const meta = settled && !failed ? resultMetadata(block?.meta, block?.content) : null;
  const ownError = block?.error?.name === "DshXChatError" && typeof code === "string" && Object.hasOwn(en, `error.${code}`);
  const errorKey = !failed ? null : ownError ? `error.${code}` : cancelled ? "error.DSH_X_CHAT_CANCELLED" : "error.unknown";
  return {
    state: !settled ? phase === "preparing" ? "preparing" : "running" : cancelled ? "cancelled" : failed ? "failed" : "complete",
    errorKey,
    prompt: argument(block, "prompt"),
    context: argument(block, "context"),
    provider: meta?.provider ?? argument(block, "provider"),
    model: meta?.model ?? argument(block, "model"),
    // A locale change must never translate or rewrite recorded model content.
    text: visibleText(block, settled, failed, meta),
    truncated: meta?.truncated === true
  };
}

// src/client/ChatToolRow.tsx
var FIELDS = ["provider", "model", "prompt", "context"];
function ChatToolRow({ phase, block, inspect, useDisclosure, t }) {
  const { expanded, toggle } = useDisclosure();
  const view = chatViewModel(phase, block);
  const busy = phase !== "result";
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxc-card", "aria-label": t("title"), "data-state": view.state, "aria-busy": busy }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-heading" }, /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      type: "button",
      className: "dxc-disclosure",
      onClick: toggle,
      "aria-expanded": expanded,
      "aria-label": t(expanded ? "details.hide" : "details.show")
    },
    /* @__PURE__ */ import_react.default.createElement("span", { "aria-hidden": "true" }, expanded ? "\u25BE" : "\u25B8"),
    /* @__PURE__ */ import_react.default.createElement("strong", null, t("title")),
    /* @__PURE__ */ import_react.default.createElement("span", { role: "status" }, t(`status.${view.state}`))
  ), inspect && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxc-inspect", onClick: inspect, title: t("inspect") }, t("inspect"))), view.errorKey && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxc-error", role: "alert" }, t(view.errorKey)), view.truncated && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxc-warning", role: "status" }, t("truncated")), expanded && /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-details" }, /* @__PURE__ */ import_react.default.createElement("dl", null, FIELDS.filter((key) => view[key] !== "").map((key) => /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, { key }, /* @__PURE__ */ import_react.default.createElement("dt", null, t(key)), /* @__PURE__ */ import_react.default.createElement("dd", { "data-chat-field": key }, view[key])))), phase === "result" && !view.errorKey && /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("strong", null, t("answer")), view.text !== "" ? /* @__PURE__ */ import_react.default.createElement("pre", { className: "dxc-answer" }, view.text) : /* @__PURE__ */ import_react.default.createElement("p", null, t("empty")))));
}

// src/client/styles.ts
var CSS = `
.dxc-card { color: var(--dsw-alias-label-primary); margin-block: 8px; font: inherit; }
.dxc-heading { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dxc-disclosure, .dxc-inspect { color: var(--dsw-alias-label-secondary); background: transparent; border: 0; border-radius: 4px; padding: 4px; font: inherit; cursor: pointer; }
.dxc-disclosure { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; text-align: start; }
.dxc-disclosure:focus-visible, .dxc-inspect:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.dxc-details { margin-inline-start: 18px; }
.dxc-details dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 12px; }
.dxc-details dt { color: var(--dsw-alias-label-secondary); }
.dxc-details dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.dxc-answer { font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; }
.dxc-error, .dxc-warning { margin-block: 8px; padding-inline-start: 18px; }
`;

// src/client/index.ts
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "chat: dictionaries");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = "dsh-x-chat";
    style.textContent = CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, "chat: styles");
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
    name: "tool.call.toolview",
    key: "dsh_x_chat",
    locale: NS
  }, ChatToolRow));
}
return module.exports; } });
