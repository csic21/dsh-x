window.__ModuleLoader__.load({ id: "dsh-x-plan", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
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

// src/client/PlanToolRow.jsx
var import_react = __toESM(require("react"), 1);

// src/client/locales.js
var NS = "dsh-x-plan";
var zh = {
  "tool.dsh_x_plan": "\u751F\u6210\u8BA1\u5212",
  "tool.dsh_x_approve_plan": "\u6279\u51C6\u8BA1\u5212",
  "tool.dsh_x_discard_plan": "\u653E\u5F03\u8BA1\u5212",
  "tool.dsh_x_review": "\u9A8C\u6536\u8BA1\u5212",
  "state.preparing": "\u6B63\u5728\u51C6\u5907",
  "state.running": "\u8FDB\u884C\u4E2D",
  "state.done": "\u5DF2\u5B8C\u6210",
  "state.failed": "\u672A\u5B8C\u6210",
  "result.plan": "\u7B2C {round} \u8F6E\u8BA1\u5212\u5DF2\u4FDD\u5B58\uFF0C\u7B49\u5F85\u6279\u51C6\u3002",
  "result.approve": "\u7B2C {round} \u8F6E\u8BA1\u5212\u5DF2\u6279\u51C6\u3002",
  "result.discard": "\u7B2C {round} \u8F6E\u8BA1\u5212\u5DF2\u653E\u5F03\u3002",
  "result.pass": "\u7B2C {round} \u8F6E\u8BA1\u5212\u9A8C\u6536\u901A\u8FC7\u3002",
  "result.fail": "\u7B2C {round} \u8F6E\u8BA1\u5212\u9A8C\u6536\u672A\u901A\u8FC7\u3002",
  "result.stopped": "\u7B2C {round} \u8F6E\u8BA1\u5212\u9A8C\u6536\u5DF2\u5931\u8D25 {count} \u6B21\uFF0C\u5DF2\u505C\u6B62\u7EE7\u7EED\u9A8C\u6536\u3002",
  "plan.notice": "\u8BF7\u5148\u67E5\u770B\u8BA1\u5212\u3002\u6279\u51C6\u524D\u4E0D\u4F1A\u5141\u8BB8\u6309\u8BA1\u5212\u6539\u52A8\u6587\u4EF6\uFF1B\u6279\u51C6\u65F6\u4EE5\u8BA1\u5212\u6587\u4EF6\u5F53\u65F6\u7684\u5185\u5BB9\u4E3A\u51C6\u3002",
  "approve.notice": "\u53EA\u6267\u884C\u5DF2\u6279\u51C6\u6587\u4EF6\u91CC\u7684\u6B65\u9AA4\u3002",
  "review.stopped": "\u8BF7\u67E5\u770B\u5DF2\u6709\u7F3A\u53E3\u5E76\u4E0E\u7528\u6237\u786E\u8BA4\u4E0B\u4E00\u6B65\uFF0C\u518D\u5F00\u59CB\u65B0\u4E00\u8F6E\u89C4\u5212\u3002",
  "review.missing-verdict": "\u9A8C\u6536\u7ED3\u8BBA\u7F3A\u5C11\u53EA\u542B pass \u6216 fail \u7684 dsh-x-verdict \u4EE3\u7801\u5757\u3002",
  "file.open": "\u6253\u5F00\u7ED3\u679C\u6587\u4EF6",
  "file.path": "\u7ED3\u679C\u6587\u4EF6",
  "inspect": "\u67E5\u770B\u8C03\u7528\u8BB0\u5F55",
  "legacy": "\u6B64\u5386\u53F2\u7ED3\u679C\u672A\u5305\u542B\u7ED3\u6784\u5316\u5C55\u793A\u4FE1\u606F\u3002\u4EE5\u4E0B\u4FDD\u7559\u539F\u59CB\u8BB0\u5F55\u3002",
  "error.SESSION_KEY": "\u4F1A\u8BDD\u6807\u8BC6\u65E0\u6548\uFF0C\u4E0D\u80FD\u5B89\u5168\u5730\u5B9A\u4F4D\u8BA1\u5212\u76EE\u5F55\u3002",
  "error.DRAFT_EXISTS": "\u5DF2\u6709\u672A\u6279\u51C6\u7684\u8BA1\u5212\u3002\u8BF7\u5148\u6279\u51C6\u6216\u653E\u5F03\u5F53\u524D\u8BA1\u5212\u3002",
  "error.DISCARDED": "\u8FD9\u8F6E\u8BA1\u5212\u5DF2\u7ECF\u653E\u5F03\u3002",
  "error.NOT_APPROVED": "\u8FD9\u8F6E\u8BA1\u5212\u8FD8\u6CA1\u6279\u51C6\u3002",
  "error.META_MISSING": "\u8BA1\u5212\u7684\u5143\u6570\u636E\u7F3A\u5931\u3002",
  "error.META_INVALID": "\u8BA1\u5212\u7684\u5143\u6570\u636E\u4E0D\u5B8C\u6574\u3002",
  "error.PLAN_MISSING": "\u627E\u4E0D\u5230\u6307\u5B9A\u8F6E\u6B21\u7684\u8BA1\u5212\u3002",
  "error.FAMILY": "\u89C4\u5212\u8005\u548C\u9A8C\u6536\u8005\u5FC5\u987B\u662F codex\u3001claude \u6216 grok\u3002",
  "error.LAUNCH": "\u627E\u4E0D\u5230\u5BF9\u5E94\u7684 ACP \u547D\u4EE4\uFF0C\u4E5F\u627E\u4E0D\u5230 npx\u3002\u8BF7\u68C0\u67E5 CLI \u5B89\u88C5\u548C PATH\u3002",
  "error.ACP_STREAM": "ACP \u5B50\u8FDB\u7A0B\u6CA1\u6709\u63D0\u4F9B stdin/stdout\u3002",
  "error.ACP_SIZE": "ACP \u54CD\u5E94\u8D85\u8FC7\u5B89\u5168\u5927\u5C0F\u9650\u5236\u3002",
  "error.ACP_SESSION": "ACP \u5B50\u8FDB\u7A0B\u6CA1\u6709\u8FD4\u56DE\u4F1A\u8BDD\u6807\u8BC6\u3002",
  "error.ACP_AUTH": "ACP \u4EE3\u7406\u8981\u6C42\u767B\u5F55\u3002\u8BF7\u5148\u5728\u5BF9\u5E94 CLI \u4E2D\u767B\u5F55\uFF1B\u6B64\u63D2\u4EF6\u4E0D\u4F1A\u4FDD\u5B58 API key\u3002",
  "error.ACP_CLOSED": "ACP \u8FDE\u63A5\u5DF2\u5173\u95ED\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  "error.ACP_INVALID": "ACP \u54CD\u5E94\u4E0D\u662F\u6709\u6548\u7684 JSON-RPC \u6D88\u606F\u3002",
  "error.ACP_REQUEST": "ACP \u8BF7\u6C42\u672A\u5B8C\u6210\uFF0C\u8BF7\u68C0\u67E5\u4EE3\u7406\u8FDE\u63A5\u72B6\u6001\u3002",
  "error.CANCELLED": "\u8BA1\u5212\u64CD\u4F5C\u5DF2\u53D6\u6D88\u3002",
  "error.GOAL_EMPTY": "\u76EE\u6807\u4E0D\u80FD\u4E3A\u7A7A\u3002",
  "error.CONTEXT_SIZE": "\u53C2\u8003\u6750\u6599\u8D85\u8FC7\u5927\u5C0F\u9650\u5236\uFF0C\u8BF7\u53EA\u4FDD\u7559\u76F8\u5173\u6458\u5F55\u3002",
  "error.PLAN_FAILED": "\u89C4\u5212\u6CA1\u6709\u6B63\u5E38\u5B8C\u6210\u3002\u8BF7\u68C0\u67E5\u4EE3\u7406\u72B6\u6001\u540E\u91CD\u8BD5\u3002",
  "error.REVIEW_FAILED": "\u9A8C\u6536\u6CA1\u6709\u6B63\u5E38\u5B8C\u6210\u3002\u8BF7\u68C0\u67E5\u4EE3\u7406\u72B6\u6001\u540E\u91CD\u8BD5\u3002",
  "error.ACCEPTANCE_LENGTH": "\u9A8C\u6536\u547D\u4EE4\u8D85\u8FC7\u5B57\u7B26\u6570\u9650\u5236\u3002",
  "error.ACCEPTANCE_COUNT": "\u9A8C\u6536\u547D\u4EE4\u8D85\u8FC7\u6761\u6570\u9650\u5236\u3002",
  "error.NO_DRAFT": "\u6CA1\u6709\u672A\u6279\u51C6\u7684\u8BA1\u5212\u3002",
  "error.WRONG_ROUND": "\u6307\u5B9A\u7684\u8F6E\u6B21\u4E0D\u662F\u5F53\u524D\u672A\u6279\u51C6\u7684\u8BA1\u5212\u3002",
  "error.NO_DISCARD": "\u6CA1\u6709\u53EF\u4EE5\u653E\u5F03\u7684\u8BA1\u5212\u3002",
  "error.NO_APPROVED": "\u6CA1\u6709\u5DF2\u6279\u51C6\u7684\u8BA1\u5212\u3002",
  "error.SAME_FAMILY": "\u9A8C\u6536\u8005\u4E0D\u80FD\u4E0E\u89C4\u5212\u8005\u4F7F\u7528\u76F8\u540C\u7684\u6A21\u578B\u5BB6\u65CF\u3002",
  "error.NO_SESSION": "\u6B64\u5DE5\u5177\u9700\u8981\u5F53\u524D\u4F1A\u8BDD\uFF0C\u4F46\u8FD9\u6B21\u8C03\u7528\u6CA1\u6709\u4F1A\u8BDD\u6807\u8BC6\u3002",
  "error.STATE_READ": "\u65E0\u6CD5\u8BFB\u53D6\u5F53\u524D\u4F1A\u8BDD\u7684\u8BA1\u5212\u72B6\u6001\uFF0C\u5DF2\u505C\u6B62\u5DE5\u5177\u6267\u884C\u3002\u8BF7\u68C0\u67E5\u8BA1\u5212\u76EE\u5F55\u540E\u91CD\u8BD5\u3002",
  "error.DRAFT_UNAPPROVED": "\u5F53\u524D\u8BA1\u5212\u8FD8\u6CA1\u6279\u51C6\u3002\u8BF7\u7528\u6237\u786E\u8BA4\u540E\u6279\u51C6\uFF0C\u6216\u653E\u5F03\u8FD9\u4EFD\u8BA1\u5212\u3002",
  "error.UNKNOWN": "\u64CD\u4F5C\u672A\u5B8C\u6210\u3002\u8BF7\u68C0\u67E5\u53C2\u6570\u3001\u6587\u4EF6\u6743\u9650\u6216\u4EE3\u7406\u8FDE\u63A5\u72B6\u6001\uFF1B\u8C03\u7528\u8BB0\u5F55\u4FDD\u7559\u4E86\u539F\u59CB\u8BCA\u65AD\u3002"
};
var en = {
  "tool.dsh_x_plan": "Create a plan",
  "tool.dsh_x_approve_plan": "Approve a plan",
  "tool.dsh_x_discard_plan": "Discard a plan",
  "tool.dsh_x_review": "Review a plan",
  "state.preparing": "Preparing",
  "state.running": "In progress",
  "state.done": "Completed",
  "state.failed": "Not completed",
  "result.plan": "Plan round {round} is saved and awaiting approval.",
  "result.approve": "Plan round {round} is approved.",
  "result.discard": "Plan round {round} is discarded.",
  "result.pass": "Plan round {round} passed review.",
  "result.fail": "Plan round {round} did not pass review.",
  "result.stopped": "Plan round {round} has failed review {count} times. Further reviews have stopped.",
  "plan.notice": "Review the plan first. File changes under the plan remain blocked until approval. Approval uses the plan file\u2019s content at that time.",
  "approve.notice": "Execute only the steps in the approved file.",
  "review.stopped": "Review the existing gaps and agree on next steps with the user before starting a new planning round.",
  "review.missing-verdict": "The review is missing a dsh-x-verdict code block containing only pass or fail.",
  "file.open": "Open result file",
  "file.path": "Result file",
  "inspect": "Inspect call",
  "legacy": "This historical result has no structured display information. Its original record is preserved below.",
  "error.SESSION_KEY": "The session identifier cannot safely locate a plan directory.",
  "error.DRAFT_EXISTS": "A plan is awaiting approval. Approve or discard it first.",
  "error.DISCARDED": "This plan round has already been discarded.",
  "error.NOT_APPROVED": "This plan round has not been approved.",
  "error.META_MISSING": "The plan metadata is missing.",
  "error.META_INVALID": "The plan metadata is incomplete.",
  "error.PLAN_MISSING": "The requested plan round was not found.",
  "error.FAMILY": "The planner and reviewer must be codex, claude, or grok.",
  "error.LAUNCH": "Neither the ACP command nor npx could be found. Check the CLI installation and PATH.",
  "error.ACP_STREAM": "The ACP process did not provide stdin/stdout.",
  "error.ACP_SIZE": "The ACP response exceeds the safe size limit.",
  "error.ACP_SESSION": "The ACP process did not return a session identifier.",
  "error.ACP_AUTH": "The ACP agent requires sign-in. Sign in through its CLI first. This plugin does not save API keys.",
  "error.ACP_CLOSED": "The ACP connection closed. Please try again.",
  "error.ACP_INVALID": "The ACP response is not a valid JSON-RPC message.",
  "error.ACP_REQUEST": "The ACP request did not complete. Check the agent connection.",
  "error.CANCELLED": "Plan operation cancelled.",
  "error.GOAL_EMPTY": "The goal cannot be empty.",
  "error.CONTEXT_SIZE": "Reference material exceeds the size limit. Keep only relevant excerpts.",
  "error.PLAN_FAILED": "Planning did not complete normally. Check the agent and try again.",
  "error.REVIEW_FAILED": "Review did not complete normally. Check the agent and try again.",
  "error.ACCEPTANCE_LENGTH": "An acceptance command exceeds the character limit.",
  "error.ACCEPTANCE_COUNT": "The acceptance command count exceeds the limit.",
  "error.NO_DRAFT": "No plan is awaiting approval.",
  "error.WRONG_ROUND": "The requested round is not the plan currently awaiting approval.",
  "error.NO_DISCARD": "There is no plan to discard.",
  "error.NO_APPROVED": "There is no approved plan.",
  "error.SAME_FAMILY": "The reviewer must use a different model family from the planner.",
  "error.NO_SESSION": "This tool requires a current session, but the call has no session identifier.",
  "error.STATE_READ": "The current plan state could not be read, so tool execution stopped. Check the plan directory and try again.",
  "error.DRAFT_UNAPPROVED": "The current plan is not approved. Ask the user to approve it or discard it first.",
  "error.UNKNOWN": "The operation did not complete. Check the arguments, file permissions, or agent connection. The call record preserves the original diagnostic."
};
function planErrorKey(error) {
  if (["ABORTED", "ABORTED_BEFORE_DISPATCH", "DSH_X_PLAN_CANCELLED"].includes(error?.code)) return "error.CANCELLED";
  if (error?.name !== "DshXPlanError" || !error.code?.startsWith("DSH_X_PLAN_")) return "error.UNKNOWN";
  const key = `error.${error.code.slice("DSH_X_PLAN_".length)}`;
  return Object.hasOwn(en, key) ? key : "error.UNKNOWN";
}

// src/client/presentation.js
function readPresentation(meta) {
  if (!meta || meta.kind !== "dsh-x-plan.result" || meta.version !== 1 || !["plan", "approve", "discard", "review"].includes(meta.operation) || !Number.isSafeInteger(meta.round) || meta.round < 1 || typeof meta.path !== "string" || typeof meta.body !== "string" || !Number.isSafeInteger(meta.attempt) || meta.attempt < 0 || typeof meta.missingVerdict !== "boolean" || (meta.operation === "review" ? !["pass", "fail", "stopped"].includes(meta.verdict) : meta.verdict !== null)) return null;
  return meta;
}

// src/client/PlanToolRow.jsx
function PlanToolRow({ toolName, phase, block, t, formatCount, openFile, inspect }) {
  const settled = phase === "result";
  const meta = settled ? readPresentation(block.meta) : null;
  const state = !settled ? phase === "preparing" ? "preparing" : "running" : block.isError ? "failed" : "done";
  const resultKey = meta?.operation === "review" ? meta.verdict : meta?.operation;
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxp-tool", "aria-label": t(`tool.${toolName}`) }, /* @__PURE__ */ import_react.default.createElement("strong", null, t(`tool.${toolName}`)), /* @__PURE__ */ import_react.default.createElement("p", { role: "status" }, t(`state.${state}`)), settled && block.isError && /* @__PURE__ */ import_react.default.createElement("p", { role: "alert" }, t(planErrorKey(block.error))), meta && !block.isError && /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("p", null, t(`result.${resultKey}`, { round: formatCount(meta.round), count: formatCount(meta.attempt) })), meta.operation === "plan" && /* @__PURE__ */ import_react.default.createElement("p", null, t("plan.notice")), meta.operation === "approve" && /* @__PURE__ */ import_react.default.createElement("p", null, t("approve.notice")), meta.verdict === "stopped" && /* @__PURE__ */ import_react.default.createElement("p", null, t("review.stopped")), meta.missingVerdict && /* @__PURE__ */ import_react.default.createElement("p", { role: "alert" }, t("review.missing-verdict")), meta.path && /* @__PURE__ */ import_react.default.createElement("p", null, /* @__PURE__ */ import_react.default.createElement("span", null, t("file.path"), ": "), /* @__PURE__ */ import_react.default.createElement("span", null, meta.path), openFile && /* @__PURE__ */ import_react.default.createElement("button", { onClick: () => openFile(meta.path) }, t("file.open"))), meta.body && /* @__PURE__ */ import_react.default.createElement("pre", { className: "dxp-body" }, meta.body)), settled && !block.isError && !meta && /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("p", null, t("legacy")), /* @__PURE__ */ import_react.default.createElement("pre", { className: "dxp-body" }, (block.content ?? []).filter((item) => item.type === "text").map((item) => item.text).join("\n"))), inspect && /* @__PURE__ */ import_react.default.createElement("button", { onClick: inspect }, t("inspect")));
}

// src/client/index.js
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "plan: dictionaries");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = "dsh-x-plan";
    style.textContent = ".dxp-tool { padding: 12px; color: var(--dsw-alias-label-primary); } .dxp-tool p { margin: 8px 0; } .dxp-body { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; } .dxp-tool button { margin-inline-start: 8px; color: inherit; font: inherit; }";
    document.head.appendChild(style);
    return () => style.remove();
  }, "plan: styles");
  const formatCount = (value) => {
    const locale = ctx.locale.getLocale().active;
    const tag = locale === "zh" ? "zh-CN" : locale;
    return new Intl.NumberFormat(Intl.NumberFormat.supportedLocalesOf([tag])[0] ?? "en", { maximumFractionDigits: 0 }).format(value);
  };
  for (const key of ["dsh_x_plan", "dsh_x_approve_plan", "dsh_x_discard_plan", "dsh_x_review"]) {
    ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({ name: "tool.call.toolview", key, locale: NS, inject: () => ({ formatCount }) }, PlanToolRow));
  }
}
return module.exports; } });
