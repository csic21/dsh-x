window.__ModuleLoader__.load({ id: "dsh-x-update", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
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

// src/client/components.tsx
var import_react = __toESM(require("react"), 1);

// src/client/model.ts
function keyFor(reason) {
  return `reason.${reason}`;
}
function updateViewModel(status) {
  const repository = status?.config.repository ?? "csic21/dsh-x";
  const releaseUrl = `https://github.com/${repository}/releases`;
  if (!status) {
    return {
      state: "idle",
      tone: "neutral",
      statusKey: "status.idle",
      reasonKey: "reason.not-checked",
      kind: "unknown",
      appVersion: null,
      kernelVersion: null,
      pluginVersion: null,
      availableAppVersion: null,
      availableKernelVersion: null,
      availablePluginVersion: null,
      pending: null,
      pendingKey: null,
      pendingParams: {},
      progress: null,
      error: null,
      canCheck: true,
      canDownload: false,
      releaseUrl,
      repository,
      desktop: false,
      pluginCount: 0
    };
  }
  const plan = status.plan;
  const base = {
    kind: plan?.kind ?? "unknown",
    appVersion: status.local.appVersion,
    kernelVersion: status.local.kernelVersion,
    pluginVersion: plan?.current.pluginVersion ?? null,
    availableAppVersion: plan?.available.appVersion ?? null,
    availableKernelVersion: plan?.available.kernelVersion ?? null,
    availablePluginVersion: plan?.available.pluginVersion ?? null,
    pending: status.pending,
    pendingKey: null,
    pendingParams: {},
    progress: status.progress,
    error: status.error,
    canCheck: true,
    canDownload: false,
    releaseUrl,
    repository,
    desktop: status.local.desktop,
    pluginCount: status.local.plugins.length
  };
  if (status.phase === "checking") {
    return { ...base, state: "checking", tone: "neutral", statusKey: "status.checking", reasonKey: keyFor(plan?.reason ?? "not-checked"), canCheck: false };
  }
  if (status.phase === "downloading") {
    return { ...base, state: "downloading", tone: "info", statusKey: "status.downloading", reasonKey: keyFor(plan?.reason ?? "not-checked"), canCheck: false };
  }
  if (status.phase === "error") {
    return { ...base, state: "error", tone: "danger", statusKey: "status.error", reasonKey: keyFor(plan?.reason ?? "not-checked"), canCheck: true };
  }
  if (status.pending) {
    const app = status.pending.kind === "app";
    return {
      ...base,
      state: "ready",
      tone: "info",
      statusKey: app ? "status.app" : "status.plugin",
      reasonKey: keyFor(app ? "kernel-changed" : "plugin-newer"),
      pendingKey: app ? "pending.app" : "pending.plugins",
      pendingParams: app ? { version: status.pending.version, kernel: plan?.available.kernelVersion ?? "" } : { version: status.pending.version },
      canCheck: false,
      canDownload: false
    };
  }
  if (!plan) {
    return { ...base, state: "idle", tone: "neutral", statusKey: "status.idle", reasonKey: "reason.not-checked", canCheck: true };
  }
  if (plan.kind === "none") {
    return { ...base, state: "idle", tone: "neutral", statusKey: "status.up-to-date", reasonKey: keyFor(plan.reason), canCheck: true };
  }
  if (plan.kind === "plugin") {
    return { ...base, state: "idle", tone: "info", statusKey: "status.plugin", reasonKey: keyFor(plan.reason), canDownload: true, canCheck: true };
  }
  if (plan.kind === "app") {
    return { ...base, state: "idle", tone: "warning", statusKey: "status.app", reasonKey: keyFor(plan.reason), canDownload: true, canCheck: true };
  }
  return { ...base, state: "blocked", tone: "warning", statusKey: "status.blocked", reasonKey: keyFor(plan.reason), canCheck: true };
}

// src/client/components.tsx
function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
function fileName(value) {
  return value.split(/[\\/]/).pop() || value;
}
function UpdateSection({ rpc, t = (key) => key, close: _close }) {
  const [status, setStatus] = (0, import_react.useState)(null);
  const [failure, setFailure] = (0, import_react.useState)(null);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const alive = (0, import_react.useRef)(true);
  const view = updateViewModel(status);
  (0, import_react.useEffect)(() => {
    alive.current = true;
    const controller = new AbortController();
    const tick = async () => {
      try {
        const result = await rpc.call("/api", "dsh-x-update/status", {}, controller.signal);
        if (!alive.current) return;
        if (result?.ok) setStatus(result.value);
      } catch {
      }
    };
    void tick();
    const timer = setInterval(tick, 2500);
    return () => {
      alive.current = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [rpc]);
  async function action(endpoint) {
    setBusy(true);
    setFailure(null);
    try {
      const result = await rpc.call("/api", endpoint, {});
      if (!result?.ok) throw new Error(result?.error?.message ?? "Update request failed");
      if (result.value) setStatus(result.value);
    } catch (error) {
      if (alive.current) setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const total = view.progress?.total ?? null;
  const received = view.progress?.received ?? 0;
  const progressText = total ? t("progress.bytes", { received: formatBytes(received), total: formatBytes(total) }) : t("progress.total-unknown", { received: formatBytes(received) });
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxu", "aria-labelledby": "dxu-title", "data-state": view.state, "data-tone": view.tone }, /* @__PURE__ */ import_react.default.createElement("header", { className: "dxu-head" }, /* @__PURE__ */ import_react.default.createElement("h1", { id: "dxu-title" }, t("title")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxu-muted" }, t("description"))), /* @__PURE__ */ import_react.default.createElement("div", { className: `dxu-status dxu-tone-${view.tone}`, role: "status", "aria-live": "polite" }, /* @__PURE__ */ import_react.default.createElement("strong", null, t(view.statusKey)), /* @__PURE__ */ import_react.default.createElement("span", null, t(view.reasonKey))), failure && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxu-error", role: "alert" }, failure), view.error && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxu-error", role: "alert" }, t("error.prefix"), view.error), view.pendingKey && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxu-callout" }, t(view.pendingKey, view.pendingParams)), view.progress && /* @__PURE__ */ import_react.default.createElement("div", { className: "dxu-progress", "aria-live": "polite" }, /* @__PURE__ */ import_react.default.createElement("p", null, t("progress.file", { file: fileName(view.progress.file) }), " ", /* @__PURE__ */ import_react.default.createElement("span", { className: "dxu-muted" }, progressText)), /* @__PURE__ */ import_react.default.createElement("progress", { value: received, max: total ?? void 0 })), /* @__PURE__ */ import_react.default.createElement("dl", { className: "dxu-versions" }, /* @__PURE__ */ import_react.default.createElement("dt", null, t("current.app")), /* @__PURE__ */ import_react.default.createElement("dd", null, view.appVersion ?? t("current.unknown"), " ", /* @__PURE__ */ import_react.default.createElement("span", { className: "dxu-arrow", "aria-hidden": "true" }, "\u2192"), " ", view.availableAppVersion ?? t("latest.none")), /* @__PURE__ */ import_react.default.createElement("dt", null, t("current.kernel")), /* @__PURE__ */ import_react.default.createElement("dd", null, view.kernelVersion ?? t("current.unknown"), " ", /* @__PURE__ */ import_react.default.createElement("span", { className: "dxu-arrow", "aria-hidden": "true" }, "\u2192"), " ", view.availableKernelVersion ?? t("latest.none")), /* @__PURE__ */ import_react.default.createElement("dt", null, t("current.plugins")), /* @__PURE__ */ import_react.default.createElement("dd", null, view.pluginVersion ?? t("current.unknown"), " ", /* @__PURE__ */ import_react.default.createElement("span", { className: "dxu-muted" }, "(", view.pluginCount, ")"), " ", /* @__PURE__ */ import_react.default.createElement("span", { className: "dxu-arrow", "aria-hidden": "true" }, "\u2192"), " ", view.availablePluginVersion ?? t("latest.none"))), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxu-actions" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => void action("dsh-x-update/check"), disabled: !view.canCheck || busy }, t("action.check")), view.canDownload && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxu-primary", onClick: () => void action("dsh-x-update/stage"), disabled: busy }, t("action.download")), view.state === "error" && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => void action("dsh-x-update/check"), disabled: busy }, t("action.retry")), /* @__PURE__ */ import_react.default.createElement("a", { className: "dxu-link", href: view.releaseUrl, target: "_blank", rel: "noreferrer" }, t("action.release"))), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxu-note" }, t("note")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxu-muted" }, t("source", { repository: view.repository })));
}

// src/client/locales.ts
var NS = "dsh-x-update";
var zh = {
  title: "\u66F4\u65B0",
  description: "\u68C0\u67E5 DSH-X \u63D2\u4EF6\u4E0E\u684C\u9762\u5E94\u7528\u66F4\u65B0\u3002\u63D2\u4EF6\u66F4\u65B0\u5728\u4E0B\u6B21\u542F\u52A8\u65F6\u81EA\u52A8\u5E94\u7528\uFF1B\u5E94\u7528\u66F4\u65B0\u5305\u542B\u5185\u6838\uFF0C\u9000\u51FA\u5E94\u7528\u540E\u81EA\u52A8\u5B89\u88C5\u3002",
  "current.title": "\u5F53\u524D\u7248\u672C",
  "current.app": "\u5E94\u7528",
  "current.kernel": "\u5185\u6838",
  "current.plugins": "\u63D2\u4EF6",
  "current.unknown": "\u672A\u77E5",
  "latest.title": "\u53EF\u66F4\u65B0\u7248\u672C",
  "latest.none": "\u6CA1\u6709\u8BFB\u53D6\u5230\u53D1\u5E03\u4FE1\u606F",
  "status.idle": "\u5C1A\u672A\u68C0\u67E5",
  "status.checking": "\u6B63\u5728\u68C0\u67E5\u66F4\u65B0\u2026",
  "status.downloading": "\u6B63\u5728\u4E0B\u8F7D\u5E76\u6821\u9A8C\u2026",
  "status.ready": "\u66F4\u65B0\u5DF2\u5C31\u7EEA",
  "status.error": "\u66F4\u65B0\u5931\u8D25",
  "status.up-to-date": "\u5DF2\u662F\u6700\u65B0",
  "status.plugin": "\u63D2\u4EF6\u66F4\u65B0\u53EF\u7528",
  "status.app": "\u9700\u8981\u5E94\u7528\u66F4\u65B0",
  "status.blocked": "\u65E0\u6CD5\u81EA\u52A8\u66F4\u65B0",
  "action.check": "\u68C0\u67E5\u66F4\u65B0",
  "action.download": "\u4E0B\u8F7D\u66F4\u65B0",
  "action.retry": "\u91CD\u8BD5",
  "action.release": "\u6253\u5F00 Releases",
  "pending.plugins": "\u63D2\u4EF6 {version} \u5DF2\u4E0B\u8F7D\uFF0C\u91CD\u542F\u5E94\u7528\u540E\u7531\u5B89\u88C5\u5668\u81EA\u52A8\u5E94\u7528\u3002",
  "pending.app": "\u5E94\u7528 {version}\uFF08\u5185\u6838 {kernel}\uFF09\u5DF2\u4E0B\u8F7D\uFF0C\u9000\u51FA\u5E94\u7528\u540E\u81EA\u52A8\u5B89\u88C5\u5E76\u91CD\u542F\u3002",
  "progress.file": "\u6B63\u5728\u4E0B\u8F7D {file}",
  "progress.bytes": "{received} / {total}",
  "progress.total-unknown": "\u5DF2\u4E0B\u8F7D {received}",
  "note": "\u5E94\u7528\u66F4\u65B0\u4F1A\u66FF\u6362\u6574\u4E2A DSH-X \u5E94\u7528\u5E76\u66F4\u65B0\u5185\u6838\uFF0C\u4F46\u4FDD\u7559 ~/.dsh-x \u4E2D\u7684\u7528\u6237\u6570\u636E\u3002\u63D2\u4EF6\u66F4\u65B0\u53EA\u66FF\u6362\u63D2\u4EF6\u5305\u3002",
  "source": "\u66F4\u65B0\u6E90\uFF1A{repository}",
  "error.prefix": "\u9519\u8BEF\uFF1A",
  "reason.up-to-date": "\u5F53\u524D\u5DF2\u662F\u6700\u65B0\u7248\u672C\u3002",
  "reason.plugin-newer": "\u65B0\u63D2\u4EF6\u4E0E\u5F53\u524D\u5185\u6838\u517C\u5BB9\uFF0C\u53EF\u4EE5\u53EA\u66F4\u65B0\u63D2\u4EF6\u3002",
  "reason.app-newer": "\u65B0\u7684\u684C\u9762\u5E94\u7528\u7248\u672C\u53EF\u7528\u3002",
  "reason.kernel-changed": "\u65B0\u7684\u684C\u9762\u5E94\u7528\u7248\u672C\u5305\u542B\u65B0\u7684\u5185\u6838\u3002",
  "reason.plugin-requires-other-kernel": "\u65B0\u63D2\u4EF6\u8981\u6C42\u4E0D\u540C\u7684\u5185\u6838\uFF0C\u5FC5\u987B\u5148\u66F4\u65B0\u684C\u9762\u5E94\u7528\u3002",
  "reason.no-compatible-app-release": "\u65B0\u63D2\u4EF6\u8981\u6C42\u7684\u5185\u6838\u8FD8\u6CA1\u6709\u5BF9\u5E94\u7684\u684C\u9762\u5E94\u7528\u7248\u672C\u3002",
  "reason.no-matching-plugin-artifacts": "\u53D1\u5E03\u4E2D\u6CA1\u6709\u8986\u76D6\u5DF2\u5B89\u88C5\u63D2\u4EF6\u7684\u5B89\u88C5\u5305\u3002",
  "reason.local-runtime-unknown": "\u65E0\u6CD5\u786E\u5B9A\u5F53\u524D\u5185\u6838\u7248\u672C\u3002",
  "reason.not-desktop": "\u5F53\u524D\u4E0D\u662F DSH-X Desktop\uFF0C\u4E0D\u80FD\u81EA\u52A8\u5B89\u88C5\u5E94\u7528\u6216\u5185\u6838\u66F4\u65B0\u3002",
  "reason.unsupported-platform": "\u5F53\u524D\u5E73\u53F0\u6CA1\u6709\u53EF\u7528\u7684\u684C\u9762\u66F4\u65B0\u5305\u3002",
  "reason.no-release": "\u6CA1\u6709\u4ECE\u53D1\u5E03\u6E90\u8BFB\u53D6\u5230\u53EF\u7528\u7684\u66F4\u65B0\u4FE1\u606F\u3002",
  "reason.not-checked": "\u5C1A\u672A\u68C0\u67E5\u66F4\u65B0\u3002"
};
var en = {
  title: "Updates",
  description: "Check DSH-X plugin and desktop updates. Plugin updates apply on the next start; app updates include the kernel and install after you quit.",
  "current.title": "Current versions",
  "current.app": "App",
  "current.kernel": "Kernel",
  "current.plugins": "Plugins",
  "current.unknown": "Unknown",
  "latest.title": "Available versions",
  "latest.none": "No release information is available",
  "status.idle": "Not checked yet",
  "status.checking": "Checking for updates\u2026",
  "status.downloading": "Downloading and verifying\u2026",
  "status.ready": "Update ready",
  "status.error": "Update failed",
  "status.up-to-date": "Up to date",
  "status.plugin": "Plugin update available",
  "status.app": "App update required",
  "status.blocked": "Cannot update automatically",
  "action.check": "Check now",
  "action.download": "Download update",
  "action.retry": "Retry",
  "action.release": "Open Releases",
  "pending.plugins": "Plugins {version} are downloaded and will be applied by the installer on the next start.",
  "pending.app": "App {version} (kernel {kernel}) is downloaded and will install and restart after you quit.",
  "progress.file": "Downloading {file}",
  "progress.bytes": "{received} / {total}",
  "progress.total-unknown": "{received} downloaded",
  "note": "App updates replace the whole DSH-X app and update the kernel while keeping user data under ~/.dsh-x. Plugin updates only replace plugin packages.",
  "source": "Update source: {repository}",
  "error.prefix": "Error: ",
  "reason.up-to-date": "This installation is up to date.",
  "reason.plugin-newer": "A new plugin release is compatible with the running kernel, so only plugins need updating.",
  "reason.app-newer": "A newer desktop app release is available.",
  "reason.kernel-changed": "The newer desktop app release carries a different kernel.",
  "reason.plugin-requires-other-kernel": "The new plugins require a different kernel, so the desktop app must be updated first.",
  "reason.no-compatible-app-release": "No desktop app release provides the kernel required by the new plugins yet.",
  "reason.no-matching-plugin-artifacts": "The release has no package for the plugins installed here.",
  "reason.local-runtime-unknown": "The running kernel version could not be determined.",
  "reason.not-desktop": "This is not DSH-X Desktop, so app and kernel updates cannot be installed automatically.",
  "reason.unsupported-platform": "No desktop update package is available for this platform.",
  "reason.no-release": "No usable release information was read from the update source.",
  "reason.not-checked": "Updates have not been checked yet."
};

// src/client/styles.ts
var CSS = `
.dxu { color: var(--dsw-alias-label-primary); font: inherit; max-width: 760px; }
.dxu * { box-sizing: border-box; }
.dxu-head h1 { font-size: 20px; margin: 0 0 6px; }
.dxu-muted { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dxu-status { display: grid; gap: 4px; margin: 16px 0; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-main); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.dxu-status strong { font-size: 14px; }
.dxu-status span { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dxu-tone-info { border-color: var(--dsw-alias-primary); }
.dxu-tone-warning { border-color: var(--dsw-alias-warning, #b26a00); }
.dxu-tone-danger { border-color: var(--dsw-alias-error, #bc2737); }
.dxu-error { color: var(--dsw-alias-error, #bc2737); font-size: 12px; overflow-wrap: anywhere; }
.dxu-callout { margin: 12px 0; padding: 10px 12px; border: 1px solid var(--dsw-alias-primary); border-radius: 8px; background: var(--dsw-alias-bg-layer-2); font-size: 13px; }
.dxu-progress { margin: 12px 0; }
.dxu-progress p { margin: 0 0 6px; font-size: 12px; overflow-wrap: anywhere; }
.dxu-progress progress { width: 100%; height: 8px; accent-color: var(--dsw-alias-primary); }
.dxu-versions { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 18px; margin: 18px 0; padding: 14px; border: 1px solid var(--dsw-alias-border-main); border-radius: 10px; }
.dxu-versions dt { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dxu-versions dd { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
.dxu-arrow { color: var(--dsw-alias-label-secondary); margin: 0 6px; }
.dxu-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 16px 0; }
.dxu button, .dxu-link { font: inherit; color: inherit; border: 1px solid var(--dsw-alias-border-main); border-radius: 7px; background: var(--dsw-alias-bg-layer-1); padding: 6px 12px; cursor: pointer; text-decoration: none; }
.dxu button:hover, .dxu-link:hover { background: var(--dsw-alias-bg-layer-2); }
.dxu button:focus-visible, .dxu-link:focus-visible { outline: 2px solid var(--dsw-alias-primary); outline-offset: 2px; }
.dxu button:disabled { opacity: .45; cursor: default; }
.dxu button.dxu-primary { border-color: var(--dsw-alias-primary); background: var(--dsw-alias-primary); color: var(--dsw-alias-label-on-primary, #fff); }
.dxu-note { margin: 18px 0 6px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; }
@media (max-width: 560px) { .dxu-versions { grid-template-columns: 1fr; } .dxu-versions dt { margin-top: 6px; } }
`;

// src/client/index.ts
var inject = ["slots", "connection", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-x-update: dictionaries");
  const t = ctx.locale.bind(NS);
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = "dsh-x-update";
    style.textContent = CSS;
    document.head.append(style);
    return () => style.remove();
  }, "dsh-x-update: styles");
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "dsh-x-update",
    order: 30,
    label: () => t("title"),
    locale: NS,
    inject: () => ({ rpc: ctx.connection.rpc })
  }, UpdateSection));
}
return module.exports; } });
