window.__ModuleLoader__.load({ id: "dsh-x-agents", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
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

// src/client/model.ts
var STATES = ["idle", "running", "waiting_permission", "waiting_input", "completed", "cancelled", "blocked", "failed", "interrupted"];
var CAPABILITIES = ["nativeSessions", "resume", "streaming", "tools", "plans", "permissions", "input", "usage", "cancel", "models", "authDiscovery"];
var EVENT_TYPES = ["session", "assistant", "tool", "plan", "permission", "input", "usage", "status", "diagnostic"];
var ACTIONS = ["request-start", "request-continue", "cancel", "inspect"];
var PROTOCOL = "dsh-x-agents";
var MODEL_CATALOG_STATES = ["not-loaded", "fresh", "stale", "failed"];
var isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var string = (value, max = 12e3) => typeof value === "string" && value.length <= max;
var id = (value) => string(value, 512) && value.length > 0;
var revision = (value) => Number.isSafeInteger(value) && value >= 0;
var timestamp = (value) => value === null || typeof value === "string" && value.length <= 100 && Number.isFinite(Date.parse(value));
function readSnapshot(value, sessionId) {
  if (!isRecord(value) || !id(value.scope) || value.sessionId !== sessionId || !revision(value.revision) || !Array.isArray(value.catalog)) return null;
  const ids = /* @__PURE__ */ new Set();
  for (const agent of value.catalog) {
    if (!isRecord(agent) || !id(agent.id) || ids.has(agent.id) || !string(agent.label, 200) || !string(agent.transport, 200) || ![true, false, null].includes(agent.available) || ![true, false, null].includes(agent.authenticated) || !Array.isArray(agent.models) || !isRecord(agent.capabilities)) return null;
    if (agent.version != null && !string(agent.version, 200)) return null;
    if (agent.reason != null && !string(agent.reason, 2e3)) return null;
    if (agent.modelCatalog != null) {
      const catalog = agent.modelCatalog;
      if (!isRecord(catalog) || !MODEL_CATALOG_STATES.includes(catalog.status) || !timestamp(catalog.fetchedAt) || !timestamp(catalog.expiresAt) || !string(catalog.source, 200) || typeof catalog.truncated !== "boolean" || catalog.error != null && !string(catalog.error, 2e3)) return null;
      if (catalog.accessVerified !== void 0 && typeof catalog.accessVerified !== "boolean") return null;
    }
    if (CAPABILITIES.some((key) => agent.capabilities[key] !== void 0 && typeof agent.capabilities[key] !== "boolean")) return null;
    const models = /* @__PURE__ */ new Set();
    for (const model of agent.models) {
      if (!isRecord(model) || !id(model.id) || !string(model.label, 200) || models.has(model.id)) return null;
      models.add(model.id);
    }
    ids.add(agent.id);
  }
  if (value.operation != null && (!isRecord(value.operation) || value.operation.kind !== "models" || !ids.has(value.operation.runtime) || !["waiting_permission", "discovering", "blocked"].includes(value.operation.state) || value.operation.reason != null && !string(value.operation.reason, 2e3))) return null;
  const task = value.task;
  if (task !== null) {
    if (!isRecord(task) || !id(task.id) || !revision(task.revision) || !string(task.title) || !id(task.runtime) || !STATES.includes(task.state) || !Array.isArray(task.events) || !Array.isArray(task.allowedActions) || task.allowedActions.some((action) => !ACTIONS.includes(action))) return null;
    if (task.cancellationRequested !== void 0 && typeof task.cancellationRequested !== "boolean") return null;
    for (const key of ["runId", "model", "cwd", "nativeSessionId", "summary", "reason", "updatedAt"]) if (task[key] != null && !string(task[key], key === "summary" ? 1e5 : 12e3)) return null;
    let previous = -1;
    for (const event of task.events) {
      if (!isRecord(event) || !revision(event.seq) || event.seq <= previous || !EVENT_TYPES.includes(event.type) || event.text != null && !string(event.text, 1e5) || event.data != null && !isRecord(event.data) && !string(event.data, 12e3)) return null;
      previous = event.seq;
    }
  }
  return value;
}
var addressFor = (scope, sessionId) => `dsh-resource://${PROTOCOL}/${encodeURIComponent(scope)}/${encodeURIComponent(sessionId)}`;
function parseAddress(address) {
  try {
    const url = new URL(address);
    if (url.protocol !== "dsh-resource:" || url.hostname !== PROTOCOL || url.search || url.hash || url.username || url.password) return null;
    const parts = url.pathname.slice(1).split("/").map(decodeURIComponent);
    if (parts.length !== 2 || !parts.every(id)) return null;
    return { scope: parts[0], sessionId: parts[1] };
  } catch {
    return null;
  }
}
function canPrepare(agent) {
  return Boolean(agent && ["codex", "opencode", "claude", "grok"].includes(agent.id) && agent.reason !== "not-integrated" && agent.available !== false && agent.capabilities?.nativeSessions === true);
}
function prepareModels(snapshot, runtime) {
  const agent = snapshot?.catalog.find((item) => item.id === runtime);
  if (!canPrepare(agent)) throw new Error("runtime-unavailable");
  if (snapshot.operation || snapshot.task && !snapshot.task.allowedActions.some((action) => ["request-start", "request-continue"].includes(action))) throw new Error("action-unavailable");
  return { runtime, scope: snapshot.scope };
}
function presentationEvents(events) {
  const rows = [], messages = /* @__PURE__ */ new Map();
  for (const event of events) {
    const messageId = event.type === "assistant" && typeof event.data?.messageId === "string" && typeof event.data?.delta === "boolean" ? event.data.messageId : null;
    if (!messageId) {
      rows.push({ ...event, key: `event:${event.seq}` });
      continue;
    }
    const identity = JSON.stringify([typeof event.data.nativeSessionId === "string" ? event.data.nativeSessionId : "", messageId, typeof event.data.partId === "string" ? event.data.partId : ""]);
    let row = messages.get(identity);
    if (!row) {
      row = { ...event, key: `message:${identity}`, text: "" };
      rows.push(row);
      messages.set(identity, row);
    }
    if (typeof event.text === "string") row.text = event.data.delta ? row.text + event.text : event.text;
  }
  return rows;
}
function eventDataPreview(event) {
  if (!["tool", "plan", "usage", "session", "status", "diagnostic"].includes(event.type) || event.data == null) return null;
  if (event.data?.name === "AskUserQuestion" || event.data?.toolName === "AskUserQuestion") return null;
  try {
    const body = JSON.stringify(event.data, (key, value) => {
      if (/password|secret|authorization|cookie|credential|api.?key|^(?:env|answers?|selected|custom|annotations|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token)$/i.test(key)) return "[redacted]";
      if (typeof value === "string" && /(?:\b(?:sk-|xai-)[a-zA-Z0-9_-]{16,}|Bearer\s+[a-zA-Z0-9._-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(value)) return "[Potential credential content withheld]";
      return value;
    }, 2);
    return typeof body === "string" ? { body: body.slice(0, 12e3), truncated: body.length > 12e3 } : null;
  } catch {
    return null;
  }
}
function prepareRun(snapshot, { runtime, model = "", prompt, continueTask = false }) {
  const agent = snapshot?.catalog.find((item) => item.id === runtime);
  if (!canPrepare(agent)) throw new Error("runtime-unavailable");
  if (snapshot.operation) throw new Error("action-unavailable");
  if (typeof prompt !== "string" || !prompt.trim() || prompt.trim().length > 12e3) throw new Error("goal-required");
  const task = snapshot.task;
  if (task && !task.allowedActions.includes(continueTask ? "request-continue" : "request-start")) throw new Error("action-unavailable");
  if (continueTask && task && model !== (task.model ?? "")) throw new Error("action-unavailable");
  if (model && (agent.capabilities.models !== true || !agent.models.some((item) => item.id === model))) throw new Error("model-unavailable");
  const args = { runtime, ...model ? { model } : {}, prompt: prompt.trim(), scope: snapshot.scope };
  if (continueTask) {
    if (!task || task.runtime !== runtime || agent.capabilities.resume !== true) throw new Error("action-unavailable");
    Object.assign(args, { taskId: task.id, expectedRevision: task.revision });
  }
  return args;
}
function insertRequest(inputActions, text) {
  if (!inputActions?.captureInsertion || !inputActions?.insertText) return false;
  const span = inputActions.captureInsertion();
  const safeSpan = { ...span, start: span.end };
  const inserted = inputActions.insertText(`

${text}
`, safeSpan);
  if (inserted) {
    try {
      inputActions.persistDraft?.();
    } catch {
    }
  }
  return inserted;
}

// src/client/controller.ts
var empty = () => ({ status: "loading", snapshot: null, error: null, pending: false });
var errorOf = (code, message = "") => ({ code: typeof code === "string" && /^[A-Za-z0-9/_-]{1,160}$/.test(code) ? code : "agents/unavailable", message: typeof message === "string" ? message.slice(0, 2e3) : "" });
function abortable(call, signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => {
      signal.removeEventListener("abort", aborted);
      reject(errorOf("agents/connection"));
    };
    if (signal.aborted) {
      aborted();
      return;
    }
    signal.addEventListener("abort", aborted, { once: true });
    try {
      Promise.resolve(call()).then((value) => {
        signal.removeEventListener("abort", aborted);
        resolve(value);
      }, (error) => {
        signal.removeEventListener("abort", aborted);
        reject(error);
      });
    } catch (error) {
      signal.removeEventListener("abort", aborted);
      reject(error);
    }
  });
}
function createAgentsController(rpc, { documentObject = globalThis.document, pollMs = 1e3, hiddenMs = 1e4, timeoutMs = 12e3 } = {}) {
  const entries = /* @__PURE__ */ new Map();
  let disposed = false, generation = 0, scope = null;
  const publish = (entry, patch) => {
    entry.state = { ...entry.state, ...patch };
    for (const listener of [...entry.listeners]) listener();
  };
  const cancelRead = (entry) => {
    clearTimeout(entry.timer);
    entry.timer = null;
    entry.request?.abort();
    entry.request = null;
  };
  const schedule = (entry, delay = documentObject?.hidden ? hiddenMs : pollMs) => {
    if (!disposed && entry.listeners.size) {
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        void read(entry);
      }, delay);
    }
  };
  const reset = () => {
    generation++;
    scope = null;
    for (const entry of entries.values()) {
      cancelRead(entry);
      entry.action?.abort();
      entry.action = null;
      publish(entry, empty());
      schedule(entry, 0);
    }
  };
  const adopt = (entry, raw) => {
    const snapshot = readSnapshot(raw, entry.sessionId);
    if (!snapshot) throw errorOf("agents/invalid-snapshot");
    if (scope !== null && snapshot.scope !== scope) {
      reset();
      return false;
    }
    scope = snapshot.scope;
    if (entry.state.snapshot && snapshot.revision < entry.state.snapshot.revision) return false;
    publish(entry, { status: "live", snapshot, error: null });
    return true;
  };
  async function read(entry) {
    if (disposed || !entry.listeners.size || entry.request) return;
    const request = new AbortController(), epoch = generation;
    entry.request = request;
    const timeout = setTimeout(() => {
      if (!disposed && epoch === generation && entry.request === request) publish(entry, { status: "failed", error: errorOf("agents/connection") });
      request.abort();
    }, timeoutMs);
    try {
      const result = await abortable(() => rpc.call("/api", "agents/snapshot", { sessionId: entry.sessionId }, request.signal), request.signal);
      if (disposed || request.signal.aborted || epoch !== generation || entry.request !== request) return;
      if (!result?.ok) throw result?.error ?? errorOf("agents/unavailable");
      adopt(entry, result.value);
    } catch (error) {
      if (!disposed && epoch === generation && entry.request === request) publish(entry, { status: "failed", error: errorOf(error?.code ?? "agents/connection", error?.message ?? "") });
    } finally {
      clearTimeout(timeout);
      if (entry.request === request) {
        entry.request = null;
        schedule(entry);
      }
    }
  }
  const entryFor = (sessionId) => {
    if (!entries.has(sessionId)) {
      const entry = { sessionId, state: empty(), listeners: /* @__PURE__ */ new Set(), request: null, timer: null, action: null };
      entry.source = {
        getSnapshot: () => entry.state,
        subscribe(listener) {
          entry.listeners.add(listener);
          if (entry.listeners.size === 1) {
            publish(entry, empty());
            void read(entry);
          }
          return () => {
            entry.listeners.delete(listener);
            if (!entry.listeners.size) {
              cancelRead(entry);
              entry.state = empty();
            }
          };
        }
      };
      entries.set(sessionId, entry);
    }
    return entries.get(sessionId);
  };
  const refresh = (sessionId) => {
    const entry = entryFor(sessionId);
    cancelRead(entry);
    void read(entry);
  };
  async function cancel(sessionId, target) {
    const entry = entryFor(sessionId), current = entry.state.snapshot;
    if (disposed || entry.action || entry.state.status !== "live" || !current || current.scope !== target.scope || current.task?.id !== target.taskId || !target.runId || current.task?.runId !== target.runId || !current.task.allowedActions.includes("cancel")) return { ok: false, error: errorOf("agents/stale-action") };
    const action = new AbortController(), epoch = generation;
    entry.action = action;
    publish(entry, { pending: true, error: null });
    const timeout = setTimeout(() => action.abort(), timeoutMs);
    try {
      const result = await abortable(() => rpc.call("/api", "agents/cancel", { ...target, sessionId }, action.signal), action.signal);
      if (disposed || epoch !== generation || action.signal.aborted) return { ok: false, error: errorOf("agents/cancel-unconfirmed") };
      if (!result?.ok) throw result?.error ?? errorOf("agents/cancel-unconfirmed");
      adopt(entry, result.value);
      return { ok: true };
    } catch (error) {
      const failure = errorOf(action.signal.aborted ? "agents/cancel-unconfirmed" : error?.code ?? "agents/cancel-unconfirmed", error?.message ?? "");
      if (!disposed && epoch === generation) publish(entry, { error: failure });
      return { ok: false, error: failure };
    } finally {
      clearTimeout(timeout);
      if (entry.action === action) {
        entry.action = null;
        publish(entry, { pending: false });
        refresh(sessionId);
      }
    }
  }
  function visibilityChanged() {
    for (const entry of entries.values()) if (entry.listeners.size) {
      clearTimeout(entry.timer);
      if (!entry.request) schedule(entry, 0);
    }
  }
  documentObject?.addEventListener("visibilitychange", visibilityChanged);
  return {
    source: (sessionId) => entryFor(sessionId).source,
    refresh,
    reset,
    cancel,
    resource: {
      protocol: PROTOCOL,
      async *open(address, { signal }) {
        const target = parseAddress(address);
        if (!target) {
          yield { ok: true, value: { status: "invalid-address", snapshot: null, error: null, pending: false } };
          return;
        }
        const source = entryFor(target.sessionId).source;
        let wake, changed = true;
        const notify = () => {
          changed = true;
          wake?.();
          wake = null;
        };
        const unsubscribe = source.subscribe(notify);
        signal.addEventListener("abort", notify, { once: true });
        try {
          while (!signal.aborted && !disposed) {
            if (!changed) await new Promise((resolve) => {
              wake = resolve;
              if (changed || signal.aborted) resolve();
            });
            if (signal.aborted || disposed) return;
            changed = false;
            const state = source.getSnapshot();
            yield { ok: true, value: state.snapshot && state.snapshot.scope !== target.scope ? { ...empty(), status: "scope-changed" } : state };
          }
        } finally {
          unsubscribe();
          signal.removeEventListener("abort", notify);
        }
      }
    },
    dispose() {
      disposed = true;
      generation++;
      documentObject?.removeEventListener("visibilitychange", visibilityChanged);
      for (const entry of entries.values()) {
        cancelRead(entry);
        entry.action?.abort();
        publish(entry, empty());
        entry.listeners.clear();
      }
      entries.clear();
    }
  };
}

// src/client/components.tsx
var import_react = __toESM(require("react"), 1);

// src/client/locales.ts
var NS = "dshXAgents";
var en = {
  title: "Agents",
  open: "Open Agents",
  loading: "Checking this session\u2026",
  unavailable: "Current state is unavailable",
  retry: "Refresh state",
  snapshotRefresh: "Refresh panel",
  snapshotRefreshHint: "Read the current state. This does not fetch models or start a native runtime.",
  scopeChanged: "The connection or profile changed. Reopen Agents from this conversation.",
  invalidAddress: "This workspace does not belong to the current conversation.",
  host: "DSH coordinates \xB7 the selected Agent executes",
  hostHint: "Preparing a request does not change the normal Send button. Review and send it in this conversation.",
  delegation: "Prepare a delegation",
  agent: "Agent",
  chooseAgent: "Choose an Agent",
  model: "Model",
  nativeDefault: "Agent default",
  goal: "Goal for this turn",
  goalPlaceholder: "What should this Agent do? Include any boundaries or checks.",
  insert: "Write to conversation, then review and send",
  inserted: "The request was added without sending. Review it in the conversation input.",
  draftChanged: "The draft changed or is locked. Nothing was inserted; try again when the input is ready.",
  insertionUnconfirmed: "The insertion could not be confirmed. Check the conversation input before trying again.",
  request: "Please call dsh_x_agents_run with these exact arguments. This is a delegation request; use the official permission prompts for any required approval:",
  inspectRequest: "Please call dsh_x_agents_inspect with {} to check the configured Agent runtimes and their available models. Do not install software or change authentication settings.",
  inspect: "Prepare connection check",
  inspectHint: "A check request is added to the conversation for you to send. No login or installation is performed here.",
  modelsGet: "Get model catalog",
  modelsUpdate: "Update model catalog",
  modelCatalogTitle: "Model catalog",
  modelsRequest: "Please call dsh_x_agents_models with these exact arguments to fetch the runtime model catalog only. Do not start or replace a task. If native initialization requires approval, use the official permission prompt:",
  modelsRequestHint: "Adds a request for you to send. Native initialization may then require official approval; nothing initializes in the background.",
  modelsNotVerified: "A listed model is not proof of account access, available credit or quota.",
  modelsDetails: "Catalog details",
  modelsFetched: "Fetched",
  modelsExpires: "Expires",
  modelsSource: "Source",
  modelsPartial: "Only part of the catalog was returned.",
  modelsCount: "{count} models returned",
  modelsEmpty: "The runtime returned no selectable models. The selector retains the Agent default option.",
  modelsUntimed: "Existing model list; freshness is not recorded.",
  "modelCatalog.not-loaded": "Model catalog not fetched",
  "modelCatalog.fresh": "Catalog updated",
  "modelCatalog.stale": "Cached catalog may be out of date",
  "modelCatalog.failed": "Catalog update failed",
  "modelsOperation.waiting_permission": "Model catalog: waiting for approval",
  "modelsOperation.discovering": "Fetching model catalog",
  "modelsOperation.blocked": "Model catalog operation blocked",
  modelsOperationRunning: "Model catalog operation in progress",
  modelsApprovalHint: "Approve or reject native initialization in the conversation. This panel cannot grant permission.",
  modelsDiscoveringHint: "Reading the native model catalog without starting or replacing a task. Use the conversation Stop button to cancel.",
  modelsBlockedHint: "Native cleanup is not confirmed. Verify that the native process stopped before manual recovery. No automatic retry or unlock is performed.",
  first: "No Agent task in this conversation yet.",
  task: "Current task",
  nextTurn: "Continue this task",
  newTask: "Prepare a new task",
  currentAgent: "Executing Agent",
  continueHint: "Continue the recorded native session. Changing the Agent requires a new task.",
  newHint: "The existing task record is kept. This request starts a separate task.",
  waiting_permission: "Approve or reject the real permission request in the conversation. This panel cannot grant permission.",
  waiting_input: "The Agent needs an answer. Respond to the question shown in the conversation.",
  running: "Activity below comes from the running Agent. No step completion or progress percentage is inferred.",
  completed: "This Agent turn ended. Completion does not by itself mean that tests or acceptance checks passed.",
  cancelled: "The turn stopped. Existing file changes are not rolled back.",
  stopping: "The stop request was received. Waiting for the native process to stop; existing changes are not rolled back.",
  blocked: "The turn could not proceed. Review the reason before starting another request.",
  failed: "The Agent reported a failed turn. Review its output and the reason.",
  interrupted: "Execution was interrupted. Verify that the previous process stopped before taking further action; automatic resume is disabled.",
  idle: "No Agent turn is running.",
  stale: "Connection unavailable. This is the last received state; actions are disabled until refreshed.",
  cancel: "Stop this turn",
  cancelling: "Requesting stop\u2026",
  stopHint: "Stopping does not undo changes.",
  cancelUnconfirmed: "The stop request could not be confirmed. Check the refreshed state; it has not been retried.",
  summary: "Result",
  reason: "Details",
  events: "Activity",
  noEvents: "No Agent events have been recorded.",
  allEvents: "Show all recorded events",
  recentEvents: "Most recent activity",
  eventData: "Show event data",
  eventDataHint: "Structured runtime data, with host filtering. Filtering does not guarantee that all sensitive content was removed.",
  eventDataTruncated: "This preview reached its display limit.",
  technical: "Session and connection details",
  taskId: "Task",
  revision: "Revision",
  nativeSession: "Native session",
  cwd: "Working directory",
  updated: "Updated",
  noSession: "Not recorded",
  connections: "Agent connections",
  connectionHint: "Capabilities are declared by the adapter. Availability and authentication are shown separately; unverified states are not a successful connection.",
  transport: "Connection",
  version: "Version",
  capabilities: "Declared capabilities",
  unknownVersion: "Not checked",
  "availability.not-integrated": "Not integrated yet",
  "availability.unavailable": "Unavailable",
  "availability.unknown": "Not checked",
  "availability.available": "Runtime available",
  "auth.yes": "Runtime authentication verified",
  "auth.no": "Runtime sign-in required",
  "auth.unknown": "Runtime authentication not verified",
  unknownBeforeRun: "Availability or sign-in is not verified. The runtime must check it before executing; this selection does not prove it is ready.",
  noRuntime: "No selectable runtime is configured. Prepare a connection check or review the setup details.",
  noModel: "No model list is available. The native Agent chooses its configured default.",
  limitations: "Current limitations",
  sandbox: "Execution boundary",
  providerAuth: "Model-provider authentication",
  providerUnverified: "Not verified",
  permissionScopes: "Native permission choices",
  setupFirst: "Check the configured runtimes first. This does not install software or sign in.",
  historyResult: "Historical operation result",
  inspectRecord: "Inspect operation",
  openCurrent: "Open current Agents workspace",
  operationRunning: "Agent operation in progress",
  operationFailed: "Agent operation could not complete",
  unsupportedResult: "This result cannot be presented as a verified Agent state. Inspect the operation for details.",
  "error.goal-required": "Enter a goal of 1\u201312,000 characters.",
  "error.runtime-unavailable": "This Agent cannot currently accept a task.",
  "error.model-unavailable": "This model is no longer available for the selected Agent. Choose again.",
  "error.action-unavailable": "This task state no longer allows that action. Refresh and try the available action.",
  "error.generic": "The operation could not be completed. Refresh the state before trying again.",
  "error.agents/stale-action": "The task changed. Refresh before requesting an action.",
  "error.agents/cancel-unconfirmed": "The stop request could not be confirmed. It has not been retried.",
  "error.agents/invalid-snapshot": "The host returned an unsupported state. Actions are disabled.",
  "error.agents/connection": "The host connection is unavailable.",
  "state.idle": "Ready for a request",
  "state.running": "Running",
  "state.waiting_permission": "Waiting for permission",
  "state.waiting_input": "Waiting for your answer",
  "state.completed": "Turn ended",
  "state.cancelled": "Stopped",
  "state.blocked": "Blocked",
  "state.failed": "Turn failed",
  "state.interrupted": "Interrupted",
  "state.stopping": "Waiting for stop",
  "event.session": "Native session",
  "event.assistant": "Agent",
  "event.tool": "Tool",
  "event.plan": "Plan",
  "event.permission": "Permission request",
  "event.input": "Question",
  "event.usage": "Usage",
  "event.status": "Status",
  "event.diagnostic": "Diagnostic",
  "cap.nativeSessions": "Native sessions",
  "cap.resume": "Resume",
  "cap.streaming": "Streaming",
  "cap.tools": "Tool events",
  "cap.plans": "Plan events",
  "cap.permissions": "Permission requests",
  "cap.input": "Interactive questions",
  "cap.usage": "Usage events",
  "cap.cancel": "Cancellation",
  "cap.models": "Model selection",
  "cap.authDiscovery": "Authentication discovery"
};
var zh = {
  title: "Agents",
  open: "\u6253\u5F00 Agents",
  loading: "\u6B63\u5728\u8BFB\u53D6\u5F53\u524D\u4F1A\u8BDD\u2026",
  unavailable: "\u5F53\u524D\u72B6\u6001\u4E0D\u53EF\u7528",
  retry: "\u5237\u65B0\u72B6\u6001",
  snapshotRefresh: "\u5237\u65B0\u9762\u677F",
  snapshotRefreshHint: "\u4EC5\u8BFB\u53D6\u5F53\u524D\u72B6\u6001\uFF0C\u4E0D\u83B7\u53D6\u6A21\u578B\u76EE\u5F55\uFF0C\u4E5F\u4E0D\u542F\u52A8\u539F\u751F\u8FD0\u884C\u65F6\u3002",
  scopeChanged: "\u8FDE\u63A5\u6216 profile \u5DF2\u66F4\u6539\u3002\u8BF7\u4ECE\u5F53\u524D\u4F1A\u8BDD\u91CD\u65B0\u6253\u5F00 Agents\u3002",
  invalidAddress: "\u8FD9\u4E2A\u5DE5\u4F5C\u533A\u4E0D\u5C5E\u4E8E\u5F53\u524D\u4F1A\u8BDD\u3002",
  host: "DSH \u534F\u8C03 \xB7 \u6240\u9009 Agent \u6267\u884C",
  hostHint: "\u51C6\u5907\u8BF7\u6C42\u4E0D\u4F1A\u6539\u53D8\u666E\u901A\u53D1\u9001\u6309\u94AE\u7684\u8DEF\u7531\u3002\u8BF7\u5728\u5F53\u524D\u4F1A\u8BDD\u68C0\u67E5\u5E76\u53D1\u9001\u3002",
  delegation: "\u51C6\u5907\u59D4\u6D3E",
  agent: "Agent",
  chooseAgent: "\u9009\u62E9 Agent",
  model: "\u6A21\u578B",
  nativeDefault: "Agent \u9ED8\u8BA4\u6A21\u578B",
  goal: "\u672C\u6B21\u76EE\u6807",
  goalPlaceholder: "\u5E0C\u671B\u8FD9\u4E2A Agent \u5B8C\u6210\u4EC0\u4E48\uFF1F\u53EF\u8865\u5145\u8303\u56F4\u4E0E\u68C0\u67E5\u8981\u6C42\u3002",
  insert: "\u5199\u5165\u4F1A\u8BDD\uFF0C\u786E\u8BA4\u540E\u53D1\u9001",
  inserted: "\u8BF7\u6C42\u5DF2\u52A0\u5165\u8F93\u5165\u6846\uFF0C\u5C1A\u672A\u53D1\u9001\u3002\u8BF7\u5728\u4F1A\u8BDD\u4E2D\u68C0\u67E5\u540E\u53D1\u9001\u3002",
  draftChanged: "\u8349\u7A3F\u5DF2\u6539\u53D8\u6216\u8F93\u5165\u6846\u88AB\u9501\u5B9A\u3002\u672C\u6B21\u672A\u5199\u5165\uFF0C\u8BF7\u7B49\u8F93\u5165\u6846\u53EF\u7528\u540E\u91CD\u8BD5\u3002",
  insertionUnconfirmed: "\u6682\u672A\u786E\u8BA4\u5199\u5165\u7ED3\u679C\uFF0C\u8BF7\u5148\u68C0\u67E5\u4F1A\u8BDD\u8F93\u5165\u6846\uFF0C\u518D\u51B3\u5B9A\u662F\u5426\u91CD\u8BD5\u3002",
  request: "\u8BF7\u4F7F\u7528\u4EE5\u4E0B\u51C6\u786E\u53C2\u6570\u8C03\u7528 dsh_x_agents_run\u3002\u8FD9\u662F\u4E00\u9879\u59D4\u6D3E\u8BF7\u6C42\uFF0C\u9700\u8981\u6388\u6743\u65F6\u8BF7\u4F7F\u7528\u5B98\u65B9\u6743\u9650\u5BA1\u6279\uFF1A",
  inspectRequest: "\u8BF7\u4EE5 {} \u8C03\u7528 dsh_x_agents_inspect\uFF0C\u68C0\u67E5\u5DF2\u914D\u7F6E\u7684 Agent \u8FD0\u884C\u65F6\u4E0E\u53EF\u7528\u6A21\u578B\u3002\u4E0D\u8981\u5B89\u88C5\u8F6F\u4EF6\u6216\u66F4\u6539\u8BA4\u8BC1\u8BBE\u7F6E\u3002",
  inspect: "\u51C6\u5907\u68C0\u67E5\u8FDE\u63A5",
  inspectHint: "\u68C0\u67E5\u8BF7\u6C42\u4F1A\u52A0\u5165\u5F53\u524D\u4F1A\u8BDD\uFF0C\u7531\u4F60\u786E\u8BA4\u540E\u53D1\u9001\u3002\u8FD9\u91CC\u4E0D\u4F1A\u6267\u884C\u767B\u5F55\u6216\u5B89\u88C5\u3002",
  modelsGet: "\u83B7\u53D6\u6A21\u578B\u76EE\u5F55",
  modelsUpdate: "\u66F4\u65B0\u6A21\u578B\u76EE\u5F55",
  modelCatalogTitle: "\u6A21\u578B\u76EE\u5F55",
  modelsRequest: "\u8BF7\u4F7F\u7528\u4EE5\u4E0B\u51C6\u786E\u53C2\u6570\u8C03\u7528 dsh_x_agents_models\uFF0C\u4EC5\u83B7\u53D6\u8FD0\u884C\u65F6\u7684\u6A21\u578B\u76EE\u5F55\u3002\u4E0D\u8981\u542F\u52A8\u6216\u66FF\u6362\u4EFB\u52A1\uFF1B\u539F\u751F\u521D\u59CB\u5316\u9700\u8981\u6279\u51C6\u65F6\uFF0C\u8BF7\u4F7F\u7528\u5B98\u65B9\u6743\u9650\u5BA1\u6279\uFF1A",
  modelsRequestHint: "\u8BF7\u6C42\u4F1A\u52A0\u5165\u4F1A\u8BDD\uFF0C\u7531\u4F60\u53D1\u9001\uFF1B\u968F\u540E\u53EF\u80FD\u9700\u8981\u5B98\u65B9\u542F\u52A8\u6279\u51C6\u3002\u8FD9\u91CC\u4E0D\u4F1A\u540E\u53F0\u521D\u59CB\u5316\u3002",
  modelsNotVerified: "\u5217\u51FA\u6A21\u578B\u4E0D\u4EE3\u8868\u5DF2\u9A8C\u8BC1\u8D26\u6237\u53EF\u8C03\u7528\u3001\u4F59\u989D\u6216\u989D\u5EA6\u3002",
  modelsDetails: "\u76EE\u5F55\u4FE1\u606F",
  modelsFetched: "\u83B7\u53D6\u65F6\u95F4",
  modelsExpires: "\u8FC7\u671F\u65F6\u95F4",
  modelsSource: "\u6765\u6E90",
  modelsPartial: "\u4EC5\u8FD4\u56DE\u4E86\u90E8\u5206\u6A21\u578B\u76EE\u5F55\u3002",
  modelsCount: "\u5DF2\u8FD4\u56DE {count} \u4E2A\u6A21\u578B",
  modelsEmpty: "\u8FD0\u884C\u65F6\u6CA1\u6709\u8FD4\u56DE\u53EF\u9009\u6A21\u578B\uFF0C\u9009\u62E9\u5668\u4FDD\u7559 Agent \u9ED8\u8BA4\u6A21\u578B\u9009\u9879\u3002",
  modelsUntimed: "\u5DF2\u6709\u6A21\u578B\u5217\u8868\uFF0C\u5C1A\u65E0\u66F4\u65B0\u65F6\u95F4\u8BB0\u5F55\u3002",
  "modelCatalog.not-loaded": "\u5C1A\u672A\u83B7\u53D6\u6A21\u578B\u76EE\u5F55",
  "modelCatalog.fresh": "\u6A21\u578B\u76EE\u5F55\u5DF2\u66F4\u65B0",
  "modelCatalog.stale": "\u7F13\u5B58\u76EE\u5F55\u53EF\u80FD\u5DF2\u8FC7\u671F",
  "modelCatalog.failed": "\u6A21\u578B\u76EE\u5F55\u66F4\u65B0\u5931\u8D25",
  "modelsOperation.waiting_permission": "\u6A21\u578B\u76EE\u5F55\uFF1A\u7B49\u5F85\u6388\u6743",
  "modelsOperation.discovering": "\u6B63\u5728\u83B7\u53D6\u6A21\u578B\u76EE\u5F55",
  "modelsOperation.blocked": "\u6A21\u578B\u76EE\u5F55\u64CD\u4F5C\u53D7\u963B",
  modelsOperationRunning: "\u6A21\u578B\u76EE\u5F55\u64CD\u4F5C\u8FDB\u884C\u4E2D",
  modelsApprovalHint: "\u8BF7\u5728\u4F1A\u8BDD\u4E2D\u6279\u51C6\u6216\u62D2\u7EDD\u539F\u751F\u521D\u59CB\u5316\uFF0C\u8FD9\u4E2A\u9762\u677F\u4E0D\u80FD\u6388\u4E88\u6743\u9650\u3002",
  modelsDiscoveringHint: "\u6B63\u5728\u8BFB\u53D6\u539F\u751F\u6A21\u578B\u76EE\u5F55\uFF0C\u4E0D\u4F1A\u5F00\u59CB\u4EFB\u52A1\u6216\u66FF\u6362\u5DF2\u6709\u4EFB\u52A1\u3002\u53EF\u7528\u4F1A\u8BDD\u4E2D\u7684\u505C\u6B62\u6309\u94AE\u53D6\u6D88\u3002",
  modelsBlockedHint: "\u539F\u751F\u8FDB\u7A0B\u6E05\u7406\u5C1A\u672A\u786E\u8BA4\u3002\u8BF7\u5148\u68C0\u67E5\u539F\u751F\u8FDB\u7A0B\u5DF2\u505C\u6B62\uFF0C\u518D\u4EBA\u5DE5\u5904\u7406\u3002\u7CFB\u7EDF\u4E0D\u4F1A\u81EA\u52A8\u91CD\u8BD5\u6216\u89E3\u9501\u3002",
  first: "\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709 Agent \u4EFB\u52A1\u3002",
  task: "\u5F53\u524D\u4EFB\u52A1",
  nextTurn: "\u7EE7\u7EED\u5F53\u524D\u4EFB\u52A1",
  newTask: "\u51C6\u5907\u65B0\u4EFB\u52A1",
  currentAgent: "\u6267\u884C Agent",
  continueHint: "\u7EE7\u7EED\u8BB0\u5F55\u4E2D\u7684\u539F\u751F\u4F1A\u8BDD\u3002\u5982\u9700\u66F4\u6362 Agent\uFF0C\u8BF7\u51C6\u5907\u65B0\u4EFB\u52A1\u3002",
  newHint: "\u5DF2\u6709\u4EFB\u52A1\u8BB0\u5F55\u4F1A\u4FDD\u7559\u3002\u672C\u6B21\u8BF7\u6C42\u5C06\u542F\u52A8\u53E6\u4E00\u4E2A\u4EFB\u52A1\u3002",
  waiting_permission: "\u8BF7\u5728\u4F1A\u8BDD\u4E2D\u7684\u771F\u5B9E\u6743\u9650\u8BF7\u6C42\u4E0A\u5141\u8BB8\u6216\u62D2\u7EDD\u3002\u8FD9\u4E2A\u9762\u677F\u4E0D\u80FD\u6388\u4E88\u6743\u9650\u3002",
  waiting_input: "Agent \u6B63\u7B49\u5F85\u4F60\u7684\u56DE\u7B54\uFF0C\u8BF7\u56DE\u590D\u4F1A\u8BDD\u4E2D\u663E\u793A\u7684\u95EE\u9898\u3002",
  running: "\u4E0B\u9762\u5C55\u793A\u771F\u5B9E Agent \u6D3B\u52A8\uFF0C\u4E0D\u63A8\u6D4B\u6B65\u9AA4\u5B8C\u6210\u60C5\u51B5\u6216\u8FDB\u5EA6\u767E\u5206\u6BD4\u3002",
  completed: "\u672C\u8F6E Agent \u5DF2\u7ED3\u675F\u3002\u8FD9\u672C\u8EAB\u4E0D\u4EE3\u8868\u6D4B\u8BD5\u6216\u9A8C\u6536\u901A\u8FC7\u3002",
  cancelled: "\u672C\u8F6E\u5DF2\u505C\u6B62\uFF0C\u5DF2\u6709\u6587\u4EF6\u6539\u52A8\u4E0D\u4F1A\u81EA\u52A8\u64A4\u9500\u3002",
  stopping: "\u505C\u6B62\u8BF7\u6C42\u5DF2\u6536\u5230\uFF0C\u6B63\u5728\u7B49\u5F85\u539F\u751F\u8FDB\u7A0B\u505C\u6B62\u3002\u5DF2\u6709\u6539\u52A8\u4E0D\u4F1A\u81EA\u52A8\u64A4\u9500\u3002",
  blocked: "\u672C\u8F6E\u672A\u80FD\u7EE7\u7EED\u3002\u8BF7\u5148\u67E5\u770B\u539F\u56E0\uFF0C\u518D\u51C6\u5907\u4E0B\u4E00\u6B21\u8BF7\u6C42\u3002",
  failed: "Agent \u62A5\u544A\u672C\u8F6E\u5931\u8D25\u3002\u8BF7\u68C0\u67E5\u8F93\u51FA\u4E0E\u539F\u56E0\u3002",
  interrupted: "\u6267\u884C\u66FE\u4E2D\u65AD\u3002\u7EE7\u7EED\u64CD\u4F5C\u524D\u9700\u786E\u8BA4\u65E7\u8FDB\u7A0B\u5DF2\u505C\u6B62\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u6062\u590D\u3002",
  idle: "\u5F53\u524D\u6CA1\u6709\u6B63\u5728\u8FD0\u884C\u7684 Agent \u56DE\u5408\u3002",
  stale: "\u8FDE\u63A5\u6682\u4E0D\u53EF\u7528\uFF0C\u4E0B\u9762\u662F\u6700\u540E\u6536\u5230\u7684\u72B6\u6001\u3002\u5237\u65B0\u6210\u529F\u524D\u4E0D\u80FD\u6267\u884C\u52A8\u4F5C\u3002",
  cancel: "\u505C\u6B62\u672C\u8F6E",
  cancelling: "\u6B63\u5728\u8BF7\u6C42\u505C\u6B62\u2026",
  stopHint: "\u505C\u6B62\u4E0D\u4F1A\u64A4\u9500\u6539\u52A8\u3002",
  cancelUnconfirmed: "\u6682\u672A\u786E\u8BA4\u505C\u6B62\u7ED3\u679C\u3002\u8BF7\u67E5\u770B\u5237\u65B0\u540E\u7684\u72B6\u6001\uFF0C\u7CFB\u7EDF\u6CA1\u6709\u81EA\u52A8\u91CD\u8BD5\u3002",
  summary: "\u7ED3\u679C",
  reason: "\u8BE6\u7EC6\u4FE1\u606F",
  events: "\u6D3B\u52A8",
  noEvents: "\u5C1A\u672A\u8BB0\u5F55 Agent \u4E8B\u4EF6\u3002",
  allEvents: "\u5C55\u5F00\u5168\u90E8\u5DF2\u8BB0\u5F55\u4E8B\u4EF6",
  recentEvents: "\u6700\u8FD1\u6D3B\u52A8",
  eventData: "\u67E5\u770B\u4E8B\u4EF6\u6570\u636E",
  eventDataHint: "\u4EE5\u4E0B\u662F\u7ECF\u8FC7\u5BBF\u4E3B\u8FC7\u6EE4\u7684\u8FD0\u884C\u65F6\u7ED3\u6784\u5316\u6570\u636E\u3002\u8FC7\u6EE4\u4E0D\u80FD\u4FDD\u8BC1\u79FB\u9664\u6240\u6709\u654F\u611F\u5185\u5BB9\u3002",
  eventDataTruncated: "\u9884\u89C8\u5DF2\u8FBE\u5230\u663E\u793A\u4E0A\u9650\u3002",
  technical: "\u4F1A\u8BDD\u4E0E\u8FDE\u63A5\u8BE6\u60C5",
  taskId: "\u4EFB\u52A1",
  revision: "\u4FEE\u8BA2",
  nativeSession: "\u539F\u751F\u4F1A\u8BDD",
  cwd: "\u5DE5\u4F5C\u76EE\u5F55",
  updated: "\u66F4\u65B0\u65F6\u95F4",
  noSession: "\u5C1A\u672A\u8BB0\u5F55",
  connections: "Agent \u8FDE\u63A5",
  connectionHint: "\u80FD\u529B\u7531\u9002\u914D\u5668\u58F0\u660E\uFF1B\u53EF\u7528\u6027\u548C\u8BA4\u8BC1\u72B6\u6001\u5355\u72EC\u663E\u793A\u3002\u5C1A\u672A\u68C0\u67E5\u4E0D\u4EE3\u8868\u8FDE\u63A5\u6210\u529F\u3002",
  transport: "\u63A5\u5165\u65B9\u5F0F",
  version: "\u7248\u672C",
  capabilities: "\u58F0\u660E\u652F\u6301\u7684\u80FD\u529B",
  unknownVersion: "\u5C1A\u672A\u68C0\u67E5",
  "availability.not-integrated": "\u5C1A\u672A\u63A5\u5165",
  "availability.unavailable": "\u4E0D\u53EF\u7528",
  "availability.unknown": "\u5C1A\u672A\u68C0\u67E5",
  "availability.available": "\u8FD0\u884C\u65F6\u53EF\u7528",
  "auth.yes": "\u8FD0\u884C\u65F6\u8BA4\u8BC1\u5DF2\u9A8C\u8BC1",
  "auth.no": "\u8FD0\u884C\u65F6\u9700\u8981\u767B\u5F55",
  "auth.unknown": "\u8FD0\u884C\u65F6\u8BA4\u8BC1\u5C1A\u672A\u9A8C\u8BC1",
  unknownBeforeRun: "\u53EF\u7528\u6027\u6216\u767B\u5F55\u72B6\u6001\u5C1A\u672A\u9A8C\u8BC1\uFF0C\u6267\u884C\u524D\u9700\u8981\u7531\u8FD0\u884C\u65F6\u68C0\u67E5\u3002\u5F53\u524D\u9009\u62E9\u4E0D\u4EE3\u8868\u5DF2\u5C31\u7EEA\u3002",
  noRuntime: "\u6CA1\u6709\u53EF\u9009\u62E9\u7684\u8FD0\u884C\u65F6\u3002\u53EF\u4EE5\u51C6\u5907\u8FDE\u63A5\u68C0\u67E5\uFF0C\u6216\u67E5\u770B\u8FDE\u63A5\u8BE6\u60C5\u3002",
  noModel: "\u5C1A\u65E0\u53EF\u9009\u6A21\u578B\u5217\u8868\uFF0C\u5C06\u4F7F\u7528\u539F\u751F Agent \u914D\u7F6E\u7684\u9ED8\u8BA4\u6A21\u578B\u3002",
  limitations: "\u5F53\u524D\u9650\u5236",
  sandbox: "\u6267\u884C\u8FB9\u754C",
  providerAuth: "\u6A21\u578B\u4F9B\u5E94\u65B9\u8BA4\u8BC1",
  providerUnverified: "\u5C1A\u672A\u9A8C\u8BC1",
  permissionScopes: "\u539F\u751F\u6743\u9650\u9009\u9879",
  setupFirst: "\u8BF7\u5148\u68C0\u67E5\u5DF2\u914D\u7F6E\u7684\u8FD0\u884C\u65F6\u3002\u68C0\u67E5\u4E0D\u4F1A\u5B89\u88C5\u8F6F\u4EF6\u6216\u6267\u884C\u767B\u5F55\u3002",
  historyResult: "\u672C\u6B21\u64CD\u4F5C\u7684\u5386\u53F2\u7ED3\u679C",
  inspectRecord: "\u67E5\u770B\u8C03\u7528\u8BB0\u5F55",
  openCurrent: "\u6253\u5F00\u5F53\u524D Agents \u5DE5\u4F5C\u533A",
  operationRunning: "Agent \u64CD\u4F5C\u8FDB\u884C\u4E2D",
  operationFailed: "Agent \u64CD\u4F5C\u672A\u80FD\u5B8C\u6210",
  unsupportedResult: "\u8FD9\u4E2A\u7ED3\u679C\u4E0D\u80FD\u4F5C\u4E3A\u5DF2\u9A8C\u8BC1\u7684 Agent \u72B6\u6001\u5C55\u793A\uFF0C\u8BF7\u67E5\u770B\u8C03\u7528\u8BB0\u5F55\u3002",
  "error.goal-required": "\u8BF7\u586B\u5199 1\u201312,000 \u5B57\u7B26\u7684\u76EE\u6807\u3002",
  "error.runtime-unavailable": "\u8FD9\u4E2A Agent \u5F53\u524D\u4E0D\u80FD\u63A5\u6536\u4EFB\u52A1\u3002",
  "error.model-unavailable": "\u8FD9\u4E2A\u6A21\u578B\u5DF2\u4E0D\u5728\u6240\u9009 Agent \u7684\u53EF\u7528\u5217\u8868\u4E2D\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002",
  "error.action-unavailable": "\u4EFB\u52A1\u72B6\u6001\u5DF2\u4E0D\u5141\u8BB8\u8FD9\u4E2A\u52A8\u4F5C\uFF0C\u8BF7\u5237\u65B0\u5E76\u9009\u62E9\u5F53\u524D\u53EF\u7528\u52A8\u4F5C\u3002",
  "error.generic": "\u64CD\u4F5C\u672A\u80FD\u5B8C\u6210\uFF0C\u8BF7\u5237\u65B0\u72B6\u6001\u540E\u518D\u5C1D\u8BD5\u3002",
  "error.agents/stale-action": "\u4EFB\u52A1\u5DF2\u6539\u53D8\uFF0C\u8BF7\u5237\u65B0\u540E\u518D\u64CD\u4F5C\u3002",
  "error.agents/cancel-unconfirmed": "\u6682\u672A\u786E\u8BA4\u505C\u6B62\u7ED3\u679C\uFF0C\u7CFB\u7EDF\u6CA1\u6709\u81EA\u52A8\u91CD\u8BD5\u3002",
  "error.agents/invalid-snapshot": "\u5BBF\u4E3B\u8FD4\u56DE\u4E86\u4E0D\u652F\u6301\u7684\u72B6\u6001\uFF0C\u5DF2\u7981\u7528\u52A8\u4F5C\u3002",
  "error.agents/connection": "\u6682\u65F6\u65E0\u6CD5\u8FDE\u63A5\u5BBF\u4E3B\u3002",
  "state.idle": "\u7B49\u5F85\u8BF7\u6C42",
  "state.running": "\u6267\u884C\u4E2D",
  "state.waiting_permission": "\u7B49\u5F85\u6388\u6743",
  "state.waiting_input": "\u7B49\u5F85\u4F60\u56DE\u7B54",
  "state.completed": "\u672C\u8F6E\u5DF2\u7ED3\u675F",
  "state.cancelled": "\u5DF2\u505C\u6B62",
  "state.blocked": "\u53D7\u963B",
  "state.failed": "\u672C\u8F6E\u5931\u8D25",
  "state.interrupted": "\u66FE\u4E2D\u65AD",
  "state.stopping": "\u7B49\u5F85\u8FDB\u7A0B\u505C\u6B62",
  "event.session": "\u539F\u751F\u4F1A\u8BDD",
  "event.assistant": "Agent",
  "event.tool": "\u5DE5\u5177",
  "event.plan": "\u8BA1\u5212",
  "event.permission": "\u6743\u9650\u8BF7\u6C42",
  "event.input": "\u95EE\u9898",
  "event.usage": "\u7528\u91CF",
  "event.status": "\u72B6\u6001",
  "event.diagnostic": "\u8BCA\u65AD",
  "cap.nativeSessions": "\u539F\u751F\u4F1A\u8BDD",
  "cap.resume": "\u7EE7\u7EED\u4F1A\u8BDD",
  "cap.streaming": "\u6D41\u5F0F\u8F93\u51FA",
  "cap.tools": "\u5DE5\u5177\u4E8B\u4EF6",
  "cap.plans": "\u8BA1\u5212\u4E8B\u4EF6",
  "cap.permissions": "\u6743\u9650\u8BF7\u6C42",
  "cap.input": "\u4EA4\u4E92\u95EE\u9898",
  "cap.usage": "\u7528\u91CF\u4E8B\u4EF6",
  "cap.cancel": "\u53D6\u6D88\u6267\u884C",
  "cap.models": "\u6A21\u578B\u9009\u62E9",
  "cap.authDiscovery": "\u8BA4\u8BC1\u68C0\u67E5"
};
var errorKey = (code) => Object.hasOwn(en, `error.${code}`) ? `error.${code}` : "error.generic";

// src/client/components.tsx
function AgentsIcon() {
  return /* @__PURE__ */ import_react.default.createElement("svg", { viewBox: "0 0 24 24", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M12 3.5l1.9 5.1L19 10.5l-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5Z" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M18.5 17.5v3M17 19h3" }));
}
function AgentsEntry({ useAgents, openAgents, t }) {
  const state = useAgents((state2) => state2);
  const task = state.snapshot?.task, operation = state.snapshot?.operation;
  const meta = state.status === "failed" ? t("retry") : state.status === "live" && (operation || task) ? operation ? t(`modelsOperation.${operation.state}`) : t(`state.${task.cancellationRequested ? "stopping" : task.state}`) : null;
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dxa-dock" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxa-entry", onClick: openAgents, disabled: state.status === "loading", title: state.status === "loading" ? t("loading") : state.status === "live" ? t("open") : t("retry") }, /* @__PURE__ */ import_react.default.createElement("span", { "aria-hidden": "true", className: "dxa-entry-icon" }, /* @__PURE__ */ import_react.default.createElement(AgentsIcon, null)), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxa-entry-label" }, t("title")), meta && /* @__PURE__ */ import_react.default.createElement("span", { className: "dxa-entry-state" }, meta), /* @__PURE__ */ import_react.default.createElement("span", { "aria-hidden": "true", className: "dxa-entry-go" }, /* @__PURE__ */ import_react.default.createElement("svg", { viewBox: "0 0 24 24", width: "14", height: "14", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "m9 6 6 6-6 6", strokeLinecap: "round", strokeLinejoin: "round" })))));
}
function Availability({ agent, t }) {
  const availability = agent.reason === "not-integrated" ? "not-integrated" : agent.available === true ? "available" : agent.available === false ? "unavailable" : "unknown";
  return /* @__PURE__ */ import_react.default.createElement("span", { className: "dxa-availability" }, t(`availability.${availability}`), availability !== "not-integrated" && /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, " \xB7 ", t(agent.authenticated === true ? "auth.yes" : agent.authenticated === false ? "auth.no" : "auth.unknown")));
}
function ModelCatalog({ agent, t, formatTime, action }) {
  const catalog = agent.modelCatalog;
  const status = catalog ? `modelCatalog.${catalog.status}` : agent.models.length ? "modelsUntimed" : "modelCatalog.not-loaded";
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dxa-model-catalog", "data-catalog-state": catalog?.status ?? "legacy" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxa-catalog-heading" }, /* @__PURE__ */ import_react.default.createElement("p", { className: ["stale", "failed"].includes(catalog?.status) ? "dxa-warning" : "dxa-muted", role: "status" }, t(status), (catalog?.fetchedAt || agent.models.length > 0) && /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, " \xB7 ", t("modelsCount", { count: agent.models.length }))), action), catalog?.truncated && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-warning" }, t("modelsPartial")), catalog?.status === "fresh" && agent.models.length === 0 && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t("modelsEmpty")), catalog?.error && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-raw dxa-warning" }, catalog.error), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t("modelsNotVerified")), catalog && /* @__PURE__ */ import_react.default.createElement("details", null, /* @__PURE__ */ import_react.default.createElement("summary", null, t("modelsDetails")), /* @__PURE__ */ import_react.default.createElement("dl", { className: "dxa-record" }, /* @__PURE__ */ import_react.default.createElement("dt", null, t("modelsFetched")), /* @__PURE__ */ import_react.default.createElement("dd", null, catalog.fetchedAt ? formatTime(catalog.fetchedAt) : t("noSession")), /* @__PURE__ */ import_react.default.createElement("dt", null, t("modelsExpires")), /* @__PURE__ */ import_react.default.createElement("dd", null, catalog.expiresAt ? formatTime(catalog.expiresAt) : t("noSession")), /* @__PURE__ */ import_react.default.createElement("dt", null, t("modelsSource")), /* @__PURE__ */ import_react.default.createElement("dd", null, catalog.source || t("noSession")))));
}
function Connections({ catalog, t, prepareInspect, enabled }) {
  return /* @__PURE__ */ import_react.default.createElement("details", { className: "dxa-details dxa-connections" }, /* @__PURE__ */ import_react.default.createElement("summary", null, t("connections")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t("connectionHint")), catalog.map((agent) => /* @__PURE__ */ import_react.default.createElement("section", { key: agent.id, className: "dxa-connection", "data-agent": agent.id }, /* @__PURE__ */ import_react.default.createElement("strong", null, agent.label), /* @__PURE__ */ import_react.default.createElement(Availability, { agent, t }), /* @__PURE__ */ import_react.default.createElement("dl", { className: "dxa-record" }, /* @__PURE__ */ import_react.default.createElement("dt", null, t("transport")), /* @__PURE__ */ import_react.default.createElement("dd", null, agent.transport), /* @__PURE__ */ import_react.default.createElement("dt", null, t("version")), /* @__PURE__ */ import_react.default.createElement("dd", null, agent.version || t("unknownVersion"))), agent.reason && agent.reason !== "not-integrated" && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-raw" }, agent.reason), agent.providerAuthentication && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t("providerAuth"), ": ", agent.providerAuthentication === "unverified" ? t("providerUnverified") : agent.providerAuthentication), Array.isArray(agent.limitations) && agent.limitations.length > 0 && /* @__PURE__ */ import_react.default.createElement("div", { className: "dxa-limitations" }, /* @__PURE__ */ import_react.default.createElement("strong", null, t("limitations")), /* @__PURE__ */ import_react.default.createElement("ul", null, agent.limitations.filter((item) => typeof item === "string").map((item, index) => /* @__PURE__ */ import_react.default.createElement("li", { key: index }, item)))), agent.sandbox != null && /* @__PURE__ */ import_react.default.createElement("details", null, /* @__PURE__ */ import_react.default.createElement("summary", null, t("sandbox")), /* @__PURE__ */ import_react.default.createElement("pre", { className: "dxa-raw" }, typeof agent.sandbox === "string" ? agent.sandbox : JSON.stringify(agent.sandbox, null, 2))), Array.isArray(agent.capabilities.permissionScopes) && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t("permissionScopes"), ": ", agent.capabilities.permissionScopes.filter((item) => typeof item === "string").join(", ")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t("capabilities")), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxa-capabilities" }, CAPABILITIES.filter((key) => agent.capabilities[key] === true).map((key) => /* @__PURE__ */ import_react.default.createElement("span", { key }, t(`cap.${key}`)))))), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: prepareInspect, disabled: !enabled }, t("inspect")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t("inspectHint")));
}
function Events({ events, t }) {
  const [all, setAll] = (0, import_react.useState)(false);
  const rows = presentationEvents(events), visible = all ? rows : rows.slice(-20);
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxa-events" }, /* @__PURE__ */ import_react.default.createElement("h3", null, t("events")), events.length === 0 ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t("noEvents")) : /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, rows.length > 20 && !all && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => setAll(true) }, t("allEvents"), " (", rows.length, ")"), /* @__PURE__ */ import_react.default.createElement("ol", null, visible.map((event) => {
    const data = eventDataPreview(event);
    return /* @__PURE__ */ import_react.default.createElement("li", { key: event.key, "data-event": event.type }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dxa-event-label" }, t(`event.${event.type}`)), event.text && /* @__PURE__ */ import_react.default.createElement("pre", { className: "dxa-raw" }, event.text), data && /* @__PURE__ */ import_react.default.createElement("details", { className: "dxa-event-data" }, /* @__PURE__ */ import_react.default.createElement("summary", null, t("eventData")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t("eventDataHint")), /* @__PURE__ */ import_react.default.createElement("pre", { className: "dxa-raw" }, data.body), data.truncated && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t("eventDataTruncated"))));
  }))));
}
function Workspace({ state, sessionId, inputActions, cancel, refresh, t, formatTime }) {
  const snapshot = state.snapshot, task = snapshot.task, operation = snapshot.operation;
  const defaultContinue = task?.allowedActions.includes("request-continue") ?? false;
  const [continueTask, setContinueTask] = (0, import_react.useState)(defaultContinue);
  const [choice, setChoice] = (0, import_react.useState)(snapshot.catalog.find(canPrepare)?.id ?? "");
  const [chosenModel, setModel] = (0, import_react.useState)("");
  const [goal, setGoal] = (0, import_react.useState)("");
  const [notice, setNotice] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    setNotice((current) => current?.key === "inserted" ? null : current);
  }, [task?.id, task?.runId, task?.state, operation?.runtime, operation?.state]);
  const alive = (0, import_react.useRef)(true);
  (0, import_react.useEffect)(() => () => {
    alive.current = false;
  }, []);
  const runtime = continueTask && task ? task.runtime : choice;
  const model = continueTask && task ? task.model ?? "" : chosenModel;
  const agent = snapshot.catalog.find((item) => item.id === runtime);
  const live = state.status === "live" && !state.pending;
  const canStart = live && !operation && (!task || task.allowedActions.includes("request-start"));
  const canContinue = live && !operation && Boolean(task?.allowedActions.includes("request-continue"));
  const models = agent?.capabilities.models === true ? agent.models : [];
  const modelValid = !model || models.some((item) => item.id === model);
  const canInsert = (continueTask ? canContinue : canStart) && canPrepare(agent) && modelValid;
  const needsSetup = !snapshot.catalog.some(canPrepare);
  const hasRequestAction = !task || task.allowedActions.some((action) => ["request-start", "request-continue"].includes(action));
  const canGetModels = live && !operation && canPrepare(agent) && hasRequestAction;
  const put = (text) => {
    try {
      const inserted = insertRequest(inputActions, text);
      setNotice({ key: inserted ? "inserted" : "draftChanged", error: !inserted });
    } catch {
      setNotice({ key: "insertionUnconfirmed", error: true });
    }
  };
  const prepare = () => {
    try {
      const args = prepareRun(snapshot, { runtime, model, prompt: goal, continueTask });
      put(`${t("request")}
${JSON.stringify(args, null, 2)}`);
    } catch (error) {
      setNotice({ key: errorKey(error.message), error: true });
    }
  };
  const getModels = () => {
    try {
      put(`${t("modelsRequest")}
${JSON.stringify(prepareModels(snapshot, runtime), null, 2)}`);
    } catch (error) {
      setNotice({ key: errorKey(error.message), error: true });
    }
  };
  const stop = async () => {
    const result = await cancel({ scope: snapshot.scope, taskId: task.id, runId: task.runId });
    if (alive.current && !result.ok) setNotice({ key: errorKey(result.error?.code), error: true });
  };
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxa-workspace", "aria-label": t("title"), "data-agents-session": sessionId, "data-state": task?.state ?? "none" }, /* @__PURE__ */ import_react.default.createElement("header", { className: "dxa-header" }, /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("h2", null, t("title")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t("host"))), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: refresh, disabled: state.pending, title: t("snapshotRefreshHint") }, t("snapshotRefresh"))), state.status !== "live" && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-notice dxa-warning", role: "alert" }, t("stale")), state.error && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-notice dxa-warning", role: "alert" }, t(errorKey(state.error.code)), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxa-muted" }, " ", state.error.code)), operation && /* @__PURE__ */ import_react.default.createElement("section", { className: `dxa-notice dxa-model-operation${operation.state === "blocked" ? " dxa-warning" : ""}`, role: "status" }, /* @__PURE__ */ import_react.default.createElement("strong", null, snapshot.catalog.find((item) => item.id === operation.runtime)?.label ?? operation.runtime, " \xB7 ", t(`modelsOperation.${operation.state}`)), /* @__PURE__ */ import_react.default.createElement("p", null, t(operation.state === "waiting_permission" ? "modelsApprovalHint" : operation.state === "blocked" ? "modelsBlockedHint" : "modelsDiscoveringHint")), operation.reason && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-raw" }, operation.reason)), task ? /* @__PURE__ */ import_react.default.createElement("section", { className: "dxa-current" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxa-task-heading" }, /* @__PURE__ */ import_react.default.createElement("h3", null, task.title || t("task")), /* @__PURE__ */ import_react.default.createElement("span", { className: `dxa-status dxa-state-${task.state}`, role: "status" }, t(`state.${task.cancellationRequested ? "stopping" : task.state}`))), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-task-agent" }, snapshot.catalog.find((item) => item.id === task.runtime)?.label ?? task.runtime, task.model ? ` \xB7 ${task.model}` : ""), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-next" }, t(task.cancellationRequested ? "stopping" : task.state)), task.summary && /* @__PURE__ */ import_react.default.createElement("section", null, /* @__PURE__ */ import_react.default.createElement("h3", null, t("summary")), /* @__PURE__ */ import_react.default.createElement("pre", { className: "dxa-raw dxa-summary" }, task.summary)), task.reason && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-raw dxa-warning" }, task.reason), task.allowedActions.includes("cancel") && task.runId && /* @__PURE__ */ import_react.default.createElement("div", { className: "dxa-stop" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", disabled: !live, onClick: stop }, t(state.pending ? "cancelling" : "cancel")), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxa-muted" }, t("stopHint")))) : /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-empty" }, t("first")), hasRequestAction && /* @__PURE__ */ import_react.default.createElement("section", { className: "dxa-prepare" }, /* @__PURE__ */ import_react.default.createElement("h3", null, t("delegation")), needsSetup && /* @__PURE__ */ import_react.default.createElement("div", { className: "dxa-notice" }, /* @__PURE__ */ import_react.default.createElement("p", null, t("setupFirst")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxa-primary", disabled: !live || Boolean(operation), onClick: () => put(t("inspectRequest")) }, t("inspect"))), task && /* @__PURE__ */ import_react.default.createElement("div", { className: "dxa-modes" }, task.allowedActions.includes("request-continue") && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", "aria-pressed": continueTask, onClick: () => {
    setContinueTask(true);
    setModel("");
    setNotice(null);
  } }, t("nextTurn")), task.allowedActions.includes("request-start") && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", "aria-pressed": !continueTask, onClick: () => {
    setContinueTask(false);
    setModel("");
    setNotice(null);
  } }, t("newTask"))), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxa-selectors" }, /* @__PURE__ */ import_react.default.createElement("label", null, t("agent"), /* @__PURE__ */ import_react.default.createElement("select", { value: runtime, onChange: (event) => {
    setChoice(event.target.value);
    setModel("");
    setNotice(null);
  }, disabled: !live || continueTask }, !runtime && /* @__PURE__ */ import_react.default.createElement("option", { value: "" }, t("chooseAgent")), snapshot.catalog.map((item) => /* @__PURE__ */ import_react.default.createElement("option", { key: item.id, value: item.id, disabled: !canPrepare(item) }, item.label, item.reason === "not-integrated" ? ` \xB7 ${t("availability.not-integrated")}` : item.available === false ? ` \xB7 ${t("availability.unavailable")}` : "")))), /* @__PURE__ */ import_react.default.createElement("label", null, t("model"), /* @__PURE__ */ import_react.default.createElement("select", { value: model, disabled: !live || continueTask || models.length === 0 && !model, onChange: (event) => setModel(event.target.value) }, /* @__PURE__ */ import_react.default.createElement("option", { value: "" }, t("nativeDefault")), !modelValid && /* @__PURE__ */ import_react.default.createElement("option", { value: model, disabled: true }, model, " \xB7 ", t("availability.unavailable")), models.map((item) => /* @__PURE__ */ import_react.default.createElement("option", { key: item.id, value: item.id }, item.label))))), agent && /* @__PURE__ */ import_react.default.createElement(ModelCatalog, { agent, t, formatTime, action: /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxa-model-request", onClick: getModels, disabled: !canGetModels, title: t("modelsRequestHint") }, t(agent?.modelCatalog?.fetchedAt || models.length ? "modelsUpdate" : "modelsGet")) }), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t("modelsRequestHint")), !modelValid && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-warning", role: "alert" }, t("error.model-unavailable")), agent && /* @__PURE__ */ import_react.default.createElement(Availability, { agent, t }), agent?.providerAuthentication && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t("providerAuth"), ": ", agent.providerAuthentication === "unverified" ? t("providerUnverified") : agent.providerAuthentication), Array.isArray(agent?.limitations) && agent.limitations.length > 0 && /* @__PURE__ */ import_react.default.createElement("details", { className: "dxa-runtime-details" }, /* @__PURE__ */ import_react.default.createElement("summary", null, t("limitations")), /* @__PURE__ */ import_react.default.createElement("ul", { className: "dxa-limitations" }, agent.limitations.filter((item) => typeof item === "string").map((item, index) => /* @__PURE__ */ import_react.default.createElement("li", { key: index }, item)))), agent && (agent.available !== true || agent.authenticated !== true) && canPrepare(agent) && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-notice" }, t("unknownBeforeRun")), !agent && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t(needsSetup ? "noRuntime" : "chooseAgent")), agent && models.length === 0 && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t("noModel")), task && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t(continueTask ? "continueHint" : "newHint")), !needsSetup && /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("label", { className: "dxa-goal" }, t("goal"), /* @__PURE__ */ import_react.default.createElement("textarea", { value: goal, onChange: (event) => {
    setGoal(event.target.value);
    setNotice(null);
  }, placeholder: t("goalPlaceholder"), rows: 3, maxLength: 12e3, disabled: !live })), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxa-primary", disabled: !canInsert || !goal.trim(), onClick: prepare }, t("insert"))), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t("hostHint"))), notice && /* @__PURE__ */ import_react.default.createElement("p", { className: `dxa-notice ${notice.error ? "dxa-warning" : ""}`, role: notice.error ? "alert" : "status" }, t(notice.key)), task && /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement(Events, { key: task.id, events: task.events, t }), /* @__PURE__ */ import_react.default.createElement("details", { className: "dxa-details" }, /* @__PURE__ */ import_react.default.createElement("summary", null, t("technical")), /* @__PURE__ */ import_react.default.createElement("dl", { className: "dxa-record" }, [["taskId", task.id], ["revision", task.revision], ["nativeSession", task.nativeSessionId || t("noSession")], ["cwd", task.cwd || t("noSession")], ["updated", formatTime(task.updatedAt)]].map(([label, value]) => /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, { key: label }, /* @__PURE__ */ import_react.default.createElement("dt", null, t(label)), /* @__PURE__ */ import_react.default.createElement("dd", null, value)))))), /* @__PURE__ */ import_react.default.createElement(Connections, { catalog: snapshot.catalog, t, enabled: live && !operation, prepareInspect: () => put(t("inspectRequest")) }));
}
function AgentsPanel({ sessionId, useTabInfo, useResource, inputActions, cancel, refresh, t, formatTime }) {
  const tab = useTabInfo(), address = tab.tab.navigation.address;
  const target = parseAddress(address), resource = useResource(address);
  const state = resource.value;
  if (!target || target.sessionId !== sessionId) return /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-message", role: "alert" }, t("invalidAddress"));
  if (!state?.snapshot || state.snapshot.scope !== target.scope || state.snapshot.sessionId !== sessionId) {
    const key = state?.status === "scope-changed" || state?.snapshot && state.snapshot.scope !== target.scope ? "scopeChanged" : state?.status === "failed" || resource.status === "failed" ? "unavailable" : "loading";
    return /* @__PURE__ */ import_react.default.createElement("div", { className: "dxa-message", role: "status" }, /* @__PURE__ */ import_react.default.createElement("p", null, t(key)), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: refresh }, t("retry")));
  }
  return /* @__PURE__ */ import_react.default.createElement(Workspace, { key: `${target.scope}/${sessionId}`, state, sessionId, inputActions, cancel, refresh, t, formatTime });
}
function AgentsToolRow({ phase, block, inspect, openCurrent, operationKind, t, formatTime = (value) => value || "\u2014" }) {
  const meta = block?.meta;
  const snapshot = !block?.isError && meta?.kind === "dsh-x-agents.result" && meta.version === 1 ? readSnapshot(meta, meta.sessionId) : null;
  const task = snapshot?.task;
  const modelsOperation = operationKind === "models";
  const modelAgent = modelsOperation ? snapshot?.catalog.find((agent) => agent.id === meta?.modelRuntime) : null;
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxa-tool", "aria-label": t("title") }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxa-task-heading" }, /* @__PURE__ */ import_react.default.createElement("strong", null, t(modelsOperation ? "modelCatalogTitle" : "title")), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxa-status", role: "status" }, phase !== "result" ? t(modelsOperation ? "modelsOperationRunning" : "operationRunning") : block?.isError ? t("operationFailed") : modelsOperation ? t(modelAgent?.modelCatalog ? `modelCatalog.${modelAgent.modelCatalog.status}` : "historyResult") : task ? t(`state.${task.cancellationRequested ? "stopping" : task.state}`) : t("historyResult"))), phase === "result" && /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, snapshot ? /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t("historyResult"), !modelsOperation && /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, " \xB7 ", t("host"))), modelsOperation ? modelAgent ? /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("strong", null, modelAgent.label), /* @__PURE__ */ import_react.default.createElement(ModelCatalog, { agent: modelAgent, t, formatTime })) : /* @__PURE__ */ import_react.default.createElement("p", null, t("unsupportedResult")) : /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, task && /* @__PURE__ */ import_react.default.createElement("p", null, task.title), task?.summary && /* @__PURE__ */ import_react.default.createElement("pre", { className: "dxa-raw" }, task.summary.slice(0, 1400), task.summary.length > 1400 ? "\u2026" : ""), task && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxa-muted" }, t(task.state)))) : /* @__PURE__ */ import_react.default.createElement("p", null, t("unsupportedResult")), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxa-stop" }, snapshot && openCurrent && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => openCurrent(snapshot) }, t("openCurrent")), inspect && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: inspect }, t("inspectRecord")))));
}

// src/client/styles.ts
var CSS = `
.dxa-workspace .dxa-model-request{font-size:12px;flex:0 0 auto}.dxa-model-catalog{margin-top:14px}.dxa-catalog-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.dxa-catalog-heading p{flex:1;margin:0}.dxa-runtime-details{margin:12px 0;font-size:12px}.dxa-runtime-details summary{cursor:pointer;color:var(--dsw-alias-label-secondary,#62666d)}.dxa-runtime-details ul{padding-inline-start:18px;margin:8px 0}.dxa-model-catalog summary{font-size:12px;cursor:pointer}.dxa-model-operation{margin-top:14px}
.dxa-dock{box-sizing:border-box;flex:none;width:calc(100% - var(--dsh-composer-side-clearance,16px) - var(--dsh-composer-side-clearance,16px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));max-width:calc(var(--dsh-composer-card-max-width,952px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));margin:0 auto;padding:0 var(--dsh-composer-dock-inset,8px)}.dxa-entry{box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;height:32px;margin:0;padding:0 10px;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary,#20252e);font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:13px;font-weight:500;line-height:20px;text-align:left;white-space:nowrap;cursor:pointer}.dxa-entry:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,#f2f3f5)}.dxa-entry:active:not(:disabled){background:var(--dsw-alias-bg-layer-2,#e9ebee)}.dxa-entry:disabled{opacity:.55;cursor:default}.dxa-entry:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4666d5);outline-offset:-2px}.dxa-entry-icon{display:grid;place-items:center;flex:none;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#717885))}.dxa-entry-icon svg{width:16px;height:16px}.dxa-entry-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}.dxa-entry-state{flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:400;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#717885))}.dxa-entry-go{display:grid;place-items:center;flex:none;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#717885));opacity:.75}
.dxa-tool{padding:12px;color:var(--dsw-alias-label-primary,#202124);font:13px/1.55 system-ui,sans-serif;overflow-wrap:anywhere}.dxa-tool button{color:inherit;font:inherit;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,#cfd2d6);border-radius:6px;padding:6px 9px;cursor:pointer}.dxa-tool button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4169e1);outline-offset:3px}.dxa-limitations{font-size:12px}.dxa-limitations ul{padding-inline-start:20px}
.dxa-workspace,.dxa-message{box-sizing:border-box;width:100%;max-width:100%;min-width:0;padding:20px;color:var(--dsw-alias-label-primary,#202124);font:13px/1.55 system-ui,sans-serif;overflow-wrap:anywhere;container-type:inline-size}.dxa-workspace *,.dxa-message *{box-sizing:border-box;min-width:0}.dxa-workspace h2{font-size:18px;line-height:1.4;margin:0}.dxa-workspace h3{font-size:13px;line-height:1.5;margin:0 0 8px;font-weight:600}.dxa-workspace p{margin:8px 0}.dxa-muted{font-size:12px;color:var(--dsw-alias-label-secondary,#62666d)}.dxa-header,.dxa-task-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dxa-header{align-items:center;padding-bottom:16px;border-bottom:1px solid var(--dsw-alias-border-l2,#d9dce0)}.dxa-header>div{flex:1}.dxa-header p{margin-bottom:0}.dxa-current,.dxa-prepare,.dxa-events{margin:16px 0}.dxa-task-heading h3{font-size:15px;flex:1}.dxa-task-agent{font-size:12px;color:var(--dsw-alias-label-secondary,#62666d)}.dxa-status{flex:0 1 auto;border:1px solid var(--dsw-alias-border-l2,#d9dce0);padding:2px 7px;border-radius:5px;font-size:11px;white-space:normal;font-weight:500;background:var(--dsw-alias-bg-layer-2,#f3f4f5)}
.dxa-state-failed,.dxa-state-blocked,.dxa-state-interrupted,.dxa-warning{color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#895c00) 62%,var(--dsw-alias-label-primary,#202124))}.dxa-next,.dxa-notice{background:var(--dsw-alias-bg-layer-2,#f3f4f5);border-radius:7px;padding:10px 12px}.dxa-next{border-inline-start:3px solid var(--dsw-alias-border-l2,#d9dce0)}.dxa-empty{padding:4px 0;color:var(--dsw-alias-label-secondary,#62666d)}
.dxa-workspace button,.dxa-workspace select,.dxa-workspace textarea,.dxa-message button{color:inherit;font:inherit;border:1px solid var(--dsw-alias-border-l2,#cfd2d6);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff)}.dxa-workspace button,.dxa-message button{min-height:36px;padding:7px 12px;cursor:pointer;max-width:100%;text-align:center;white-space:normal}.dxa-workspace button:hover:not(:disabled),.dxa-message button:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f5)}.dxa-workspace button:disabled,.dxa-workspace select:disabled,.dxa-workspace textarea:disabled{opacity:.55;cursor:not-allowed}.dxa-workspace button:focus-visible,.dxa-entry:focus-visible,.dxa-workspace select:focus-visible,.dxa-workspace textarea:focus-visible,.dxa-message button:focus-visible,.dxa-details>summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4169e1);outline-offset:3px}
.dxa-prepare{border:1px solid var(--dsw-alias-border-l2,#d9dce0);border-radius:12px;padding:16px}.dxa-prepare>h3{margin-bottom:16px}.dxa-selectors{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start;gap:12px}.dxa-selectors label,.dxa-goal{display:grid;align-content:start;grid-template-rows:auto auto;gap:6px;font-size:12px;font-weight:500}.dxa-workspace select{display:block;width:100%;height:38px;padding:8px 10px;text-overflow:ellipsis;font-weight:400;line-height:20px}.dxa-workspace textarea{resize:vertical;min-height:85px;width:100%;padding:9px 10px;font-weight:400;line-height:1.5}.dxa-workspace textarea::placeholder{color:var(--dsw-alias-label-secondary,#62666d)}.dxa-goal{margin:16px 0 12px}.dxa-workspace .dxa-primary{width:100%;text-align:center;min-height:40px;font-weight:600;border-color:var(--dsw-alias-label-primary,#202124);background:var(--dsw-alias-label-primary,#202124);color:var(--dsw-alias-bg-layer-1,#fff)}.dxa-workspace .dxa-primary:hover:not(:disabled){background:var(--dsw-alias-label-secondary,#62666d)}.dxa-modes{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}.dxa-modes button{font-size:12px}.dxa-modes button[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary,#4169e1);font-weight:600}.dxa-availability{display:block;color:var(--dsw-alias-label-secondary,#62666d);font-size:12px;margin-top:7px}.dxa-stop{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:10px}
.dxa-raw{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font:inherit;margin:5px 0;max-width:100%}.dxa-summary{line-height:1.7}.dxa-events ol{list-style:none;padding:0;margin:0}.dxa-events li{border-inline-start:2px solid var(--dsw-alias-border-l2,#d9dce0);padding:0 0 0 12px;margin:14px 0}.dxa-event-label{font-size:11px;color:var(--dsw-alias-label-secondary,#62666d);font-weight:600}.dxa-details{border-top:1px solid var(--dsw-alias-border-l2,#d9dce0);margin-top:16px}.dxa-details>summary{padding:12px 0;cursor:pointer;font-size:12px;font-weight:600;list-style-position:inside}.dxa-record{display:grid;grid-template-columns:minmax(60px,auto) minmax(0,1fr);gap:6px 10px;margin:9px 0;font-size:12px}.dxa-record dt{color:var(--dsw-alias-label-secondary,#62666d)}.dxa-record dd{margin:0;overflow-wrap:anywhere}.dxa-connection{padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l2,#d9dce0);margin-bottom:12px}.dxa-capabilities{display:flex;flex-wrap:wrap;gap:5px}.dxa-capabilities span{border:1px solid var(--dsw-alias-border-l2,#d9dce0);padding:1px 5px;border-radius:4px;font-size:11px;color:var(--dsw-alias-label-secondary,#62666d)}
@container(max-width:380px){.dxa-selectors{grid-template-columns:1fr}.dxa-catalog-heading{align-items:flex-start}.dxa-catalog-heading .dxa-model-request{flex-basis:100%}.dxa-header{flex-wrap:wrap}}
@media(max-width:480px){.dxa-workspace,.dxa-message{padding:14px}.dxa-selectors{grid-template-columns:1fr}.dxa-header{flex-wrap:wrap}.dxa-entry-state{display:none}.dxa-prepare{padding:11px}}
`;

// src/client/index.ts
var inject = ["slots", "connection", "resources", "sidebarRight", "sidebarRightTabs", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "agents: dictionaries");
  const t = ctx.locale.bind(NS);
  const controller = createAgentsController(ctx.connection.rpc);
  ctx.effect(() => () => controller.dispose(), "agents: scoped state");
  ctx.on("connection/reset", () => controller.reset());
  ctx.effect(() => ctx.resources.register(controller.resource), "agents: resources");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = "dsh-x-agents";
    style.textContent = CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, "agents: styles");
  const previewId = "dsh-x-agents.workspace";
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: previewId,
    kind: PROTOCOL,
    patterns: [`dsh-resource://${PROTOCOL}/**`],
    priority: "extension",
    canOpen: (address) => parseAddress(address) !== null,
    title: () => t("title")
  }), "agents: sidebar type");
  const formatTime = (value) => {
    if (!value || !Number.isFinite(Date.parse(value))) return value || "\u2014";
    const locale = ctx.locale.getLocale().active;
    const tag = locale === "zh" ? "zh-CN" : locale;
    return new Intl.DateTimeFormat(Intl.DateTimeFormat.supportedLocalesOf([tag])[0] ?? "en", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  };
  const face = (sessionId) => ({
    hooks: { agents: controller.source(sessionId) },
    formatTime,
    refresh: () => controller.refresh(sessionId),
    cancel: (target) => controller.cancel(sessionId, target),
    openAgents: () => {
      const state = controller.source(sessionId).getSnapshot();
      if (state.snapshot) ctx.sidebarRight.openResource(addressFor(state.snapshot.scope, sessionId));
      else controller.refresh(sessionId);
    }
  });
  ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
    name: "conversation.input.dock",
    id: previewId,
    order: -10,
    locale: NS,
    inject: face
  }, AgentsEntry));
  ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
    name: "sidebar.right.pane.tab",
    key: previewId,
    locale: NS,
    inject: face
  }, AgentsPanel));
  for (const key of ["dsh_x_agents_inspect", "dsh_x_agents_run", "dsh_x_agents_models"]) ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
    name: "tool.call.toolview",
    key,
    locale: NS,
    inject: () => ({ operationKind: key === "dsh_x_agents_models" ? "models" : null, formatTime, openCurrent: (snapshot) => {
      if (ctx.sidebarRight.mounted?.getSnapshot() !== snapshot.sessionId) return;
      ctx.sidebarRight.openResource(addressFor(snapshot.scope, snapshot.sessionId));
    } })
  }, AgentsToolRow));
}
return module.exports; } });
