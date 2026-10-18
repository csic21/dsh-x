window.__ModuleLoader__.load({ id: "dsh-x-code", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
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
var MODES = ["worktree", "staged", "range"];
var SEVERITIES = ["critical", "high", "medium", "low", "info"];
var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var text = (value) => typeof value === "string";
var identifier = (value) => text(value) && value.length > 0 && value.length <= 4096;
function readSnapshot(value, sessionId) {
  if (!record(value) || value.sessionId !== sessionId || !identifier(value.scope) || !Number.isSafeInteger(value.revision) || !record(value.workspace) || !identifier(value.workspace.id) || !MODES.includes(value.workspace.mode) || !Array.isArray(value.files) || !record(value.limits)) return null;
  if (!value.files.every((file) => record(file) && identifier(file.path) && text(file.status) && typeof file.selectable === "boolean")) return null;
  if (new Set(value.files.map((file) => file.path)).size !== value.files.length) return null;
  if (value.operation != null && (!record(value.operation) || !identifier(value.operation.id) || value.operation.kind !== "review" || !["preparing", "waiting_permission", "reviewing", "verifying", "cancelling"].includes(value.operation.state))) return null;
  if (value.review != null) {
    const review = value.review;
    if (!record(review) || !identifier(review.id) || !text(review.state) || !Array.isArray(review.paths) || !review.paths.every(identifier) || !Array.isArray(review.findings) || !Array.isArray(review.checks ?? []) || typeof review.stale !== "boolean") return null;
    if (!review.findings.every((finding) => record(finding) && identifier(finding.id) && identifier(finding.path) && SEVERITIES.includes(finding.severity) && text(finding.title) && text(finding.body) && Number.isSafeInteger(finding.startLine) && finding.startLine > 0 && Number.isSafeInteger(finding.endLine) && finding.endLine >= finding.startLine)) return null;
  }
  return value;
}
function readFile(value, path) {
  if (!record(value) || value.path !== path || !text(value.status ?? value.kind ?? "text")) return null;
  if (["text", "missing"].includes(value.kind) && (!text(value.text) || !text(value.beforeText))) return null;
  if (value.text != null && !text(value.text) || value.beforeText != null && !text(value.beforeText)) return null;
  if (value.diff != null && !text(value.diff) && !Array.isArray(value.diff) && !record(value.diff)) return null;
  return value;
}
function isChanged(file) {
  return file.changed === true || !["unchanged", "clean", " "].includes(file.status);
}
function isComplete(review) {
  return Boolean(review && ["completed", "complete"].includes(review.state) && review.complete !== false);
}
function activeReview(review) {
  return Boolean(review && ["running", "reviewing", "waiting_permission", "waiting_input", "pending"].includes(review.state));
}
var shortHash = (value) => typeof value === "string" ? value.slice(0, 8) : "\u2014";
var basename = (path) => path?.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
function fileTree(files, query = "", filter = "changed") {
  const needle = query.trim().toLocaleLowerCase();
  const root = { name: "", path: "", directories: [], files: [] };
  const byPath = /* @__PURE__ */ new Map([["", root]]);
  for (const file of files) {
    if (filter === "changed" && !isChanged(file) || needle && !file.path.toLocaleLowerCase().includes(needle)) continue;
    const segments = file.path.split("/").filter(Boolean);
    let parent = root, path = "";
    for (const segment of segments.slice(0, -1)) {
      path = path ? `${path}/${segment}` : segment;
      let child = byPath.get(path);
      if (!child) {
        child = { name: segment, path, directories: [], files: [] };
        byPath.set(path, child);
        parent.directories.push(child);
      }
      parent = child;
    }
    parent.files.push(file);
  }
  function order(node) {
    node.directories.sort((a, b) => a.name.localeCompare(b.name));
    node.files.sort((a, b) => a.path.localeCompare(b.path));
    node.directories = node.directories.map(compact);
  }
  function compact(node) {
    order(node);
    while (!node.files.length && node.directories.length === 1) {
      const only = node.directories[0];
      node = { name: `${node.name}/${only.name}`, path: only.path, directories: only.directories, files: only.files };
    }
    return node;
  }
  root.directories = root.directories.sort((a, b) => a.name.localeCompare(b.name)).map(compact);
  root.files.sort((a, b) => a.path.localeCompare(b.path));
  return root;
}
function diffHunks(diff) {
  if (Array.isArray(diff)) return diff;
  if (diff && typeof diff === "object" && Array.isArray(diff.hunks)) return diff.hunks;
  if (typeof diff !== "string") return [];
  const hunks = [];
  let current;
  for (const line of diff.split("\n")) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
    if (header) {
      current = { oldStart: Number(header[1]), oldLines: Number(header[2] ?? 1), newStart: Number(header[3]), newLines: Number(header[4] ?? 1), heading: header[5].trim(), lines: [] };
      hunks.push(current);
    } else if (current && /^[ +\-]/.test(line)) current.lines.push(line);
  }
  return hunks;
}
function hunkRows(hunk) {
  let old = hunk.oldStart, next = hunk.newStart;
  return hunk.lines.filter((line) => /^[ +\-]/.test(line)).map((line) => line[0] === "+" ? { kind: "add", old: null, new: next++, text: line.slice(1) } : line[0] === "-" ? { kind: "del", old: old++, new: null, text: line.slice(1) } : { kind: "context", old: old++, new: next++, text: line.slice(1) });
}
function pairedRows(rows) {
  const result = [], removed = [], added = [];
  const flush = () => {
    for (let i = 0; i < Math.max(removed.length, added.length); i++) result.push({ left: removed[i], right: added[i] });
    removed.length = 0;
    added.length = 0;
  };
  for (const row of rows) {
    if (row.kind === "del") {
      if (added.length) flush();
      removed.push(row);
    } else if (row.kind === "add") added.push(row);
    else {
      flush();
      result.push({ left: row, right: row });
    }
  }
  flush();
  return result;
}
function sourceLines(value) {
  return value === "" || value == null ? [] : (value.endsWith("\n") ? value.slice(0, -1) : value).split("\n");
}
function searchMatches(lines, query) {
  if (!query) return [];
  const needle = query.toLocaleLowerCase(), matches = [];
  lines.forEach((line, index) => {
    const haystack = line.toLocaleLowerCase();
    let from = 0, found;
    while ((found = haystack.indexOf(needle, from)) !== -1) {
      matches.push({ line: index + 1, start: found, end: found + query.length });
      from = found + Math.max(needle.length, 1);
    }
  });
  return matches;
}
function reviewRequest(snapshot, { paths, runtime = "dsh", previousReviewId }) {
  if (!snapshot?.workspace || !Array.isArray(paths) || paths.length === 0) throw new Error("selectFiles");
  const allowed = snapshot.files.filter((file) => file.selectable).map((file) => file.path);
  if (paths.some((path) => !allowed.includes(path)) || paths.length > (snapshot.limits?.maxSelectedFiles ?? 20)) throw new Error("selectionChanged");
  return { scope: snapshot.scope, workspaceId: snapshot.workspace.id, mode: snapshot.workspace.mode, ...snapshot.workspace.mode === "range" ? { base: snapshot.workspace.baseRef ?? snapshot.workspace.base } : {}, paths, runtime, ...previousReviewId ? { previousReviewId } : {} };
}
function insertRequest(inputActions, text2) {
  if (!inputActions?.captureInsertion || !inputActions?.insertText) return false;
  const span = inputActions.captureInsertion();
  const safeSpan = { ...span, start: span.end };
  const inserted = inputActions.insertText(`

${text2}
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
var errorInfo = (error) => error && typeof error === "object" ? error : {};
var empty = () => ({ status: "loading", snapshot: null, error: null, file: null, fileStatus: "idle", fileKey: null, fileError: null, inspectedReview: null, historyStatus: "idle", historyError: null, historyId: null, pending: false });
var problem = (code, message = "") => ({ code: typeof code === "string" ? code : "code/unavailable", message: typeof message === "string" ? message : "" });
function createCodeController(rpc, { timeoutMs = 12e3, pollMs = 4e3, documentObject = globalThis.document } = {}) {
  const entries = /* @__PURE__ */ new Map();
  let disposed = false, epoch = 0;
  const publish = (entry, patch) => {
    entry.state = { ...entry.state, ...patch };
    for (const listener of [...entry.listeners]) listener();
  };
  const stopRead = (entry) => {
    clearTimeout(entry.timer ?? void 0);
    entry.timer = null;
    entry.request?.abort();
    entry.request = null;
  };
  const stopFile = (entry) => {
    entry.fileRequest?.abort();
    entry.fileRequest = null;
  };
  const schedule = (entry) => {
    if (!disposed && entry.listeners.size) {
      clearTimeout(entry.timer ?? void 0);
      entry.timer = setTimeout(() => {
        void refreshEntry(entry);
      }, documentObject?.hidden ? 2e4 : pollMs);
    }
  };
  async function call(endpoint, args, signal) {
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      signal.abort();
    }, timeoutMs);
    try {
      const result = await Promise.race([
        rpc.call("/api", endpoint, args, signal.signal),
        new Promise((_, reject) => signal.signal.addEventListener("abort", () => reject(problem(timedOut ? "code/timeout" : "code/aborted")), { once: true }))
      ]);
      if (!result?.ok) throw result?.error ?? problem("code/unavailable");
      return result.value;
    } finally {
      clearTimeout(timeout);
    }
  }
  async function refreshEntry(entry) {
    if (disposed || entry.request || !entry.listeners.size) return;
    const request = new AbortController(), generation = epoch, target = entry.target;
    entry.request = request;
    try {
      const raw = await call("code/snapshot", { sessionId: entry.sessionId, ...target }, request);
      if (disposed || request.signal.aborted || generation !== epoch || entry.request !== request || target !== entry.target) return;
      const snapshot = readSnapshot(raw, entry.sessionId);
      if (!snapshot) throw problem("code/invalid-snapshot");
      const previous = entry.state.snapshot;
      if (previous?.scope === snapshot.scope && snapshot.revision < previous.revision) return;
      const bindingChanged = previous && (previous.scope !== snapshot.scope || previous.workspace.cwd !== snapshot.workspace.cwd || previous.workspace.repoRoot !== snapshot.workspace.repoRoot || previous.workspace.gitDir !== snapshot.workspace.gitDir || previous.workspace.repositoryId !== snapshot.workspace.repositoryId || previous.workspace.policyRoot !== snapshot.workspace.policyRoot);
      const identityChanged = previous && (bindingChanged || previous.workspace.id !== snapshot.workspace.id);
      if (identityChanged && (bindingChanged || entry.fileTarget?.reviewId == null)) {
        stopFile(entry);
        entry.fileTarget = null;
      }
      if (bindingChanged) {
        entry.historyRequest?.abort();
        entry.historyRequest = null;
      }
      publish(entry, {
        status: "live",
        snapshot,
        error: null,
        ...identityChanged && entry.fileTarget?.reviewId == null ? { file: null, fileStatus: "idle", fileKey: null } : {},
        ...bindingChanged ? { inspectedReview: null, historyId: null, historyStatus: "idle", historyError: null } : {}
      });
    } catch (error) {
      if (!disposed && generation === epoch && entry.request === request && !request.signal.aborted) publish(entry, { status: "failed", error: problem(errorInfo(error).code, errorInfo(error).message) });
      else if (!disposed && entry.request === request && generation === epoch && errorInfo(error).code === "code/timeout") publish(entry, { status: "failed", error: problem("code/timeout") });
    } finally {
      if (entry.request === request) {
        entry.request = null;
        schedule(entry);
      }
    }
  }
  const entryFor = (sessionId) => {
    if (!entries.has(sessionId)) {
      const entry = { source: void 0, sessionId, target: { mode: "worktree" }, state: empty(), listeners: /* @__PURE__ */ new Set(), request: null, timer: null, fileRequest: null, fileTarget: null, historyRequest: null, action: null };
      entry.source = {
        getSnapshot: () => entry.state,
        subscribe(listener) {
          entry.listeners.add(listener);
          if (entry.listeners.size === 1) {
            publish(entry, { status: "loading" });
            void refreshEntry(entry);
          }
          return () => {
            entry.listeners.delete(listener);
            if (!entry.listeners.size) {
              stopRead(entry);
              stopFile(entry);
              entry.historyRequest?.abort();
              entry.historyRequest = null;
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
    stopRead(entry);
    void refreshEntry(entry);
  };
  const selectTarget = (sessionId, mode, base) => {
    const entry = entryFor(sessionId);
    if (entry.target.mode === mode && entry.target.base === base) return;
    stopRead(entry);
    stopFile(entry);
    entry.fileTarget = null;
    entry.target = { mode, ...mode === "range" ? { base } : {} };
    publish(entry, empty());
    void refreshEntry(entry);
  };
  async function loadFile(sessionId, target) {
    const entry = entryFor(sessionId), generation = epoch, key = JSON.stringify(target);
    if (entry.state.fileKey === key && ["loading", "ready"].includes(entry.state.fileStatus)) return;
    stopFile(entry);
    const request = new AbortController();
    entry.fileRequest = request;
    entry.fileTarget = target;
    publish(entry, { file: null, fileKey: key, fileStatus: "loading", fileError: null });
    try {
      const raw = await call("code/file", { sessionId, ...target }, request);
      if (disposed || request.signal.aborted || epoch !== generation || entry.fileRequest !== request) return;
      const file = readFile(raw, target.path);
      if (!file) throw problem("code/invalid-file");
      publish(entry, { file, fileStatus: "ready" });
    } catch (error) {
      if (!disposed && epoch === generation && entry.fileRequest === request) publish(entry, { file: null, fileStatus: "failed", fileError: problem(errorInfo(error).code, errorInfo(error).message) });
    } finally {
      if (entry.fileRequest === request) entry.fileRequest = null;
    }
  }
  const clearFile = (sessionId) => {
    const entry = entryFor(sessionId);
    stopFile(entry);
    entry.fileTarget = null;
    publish(entry, { file: null, fileStatus: "idle", fileKey: null, fileError: null });
  };
  async function loadReview(sessionId, reviewId) {
    const entry = entryFor(sessionId), snapshot = entry.state.snapshot, generation = epoch;
    entry.historyRequest?.abort();
    entry.historyRequest = null;
    if (!reviewId) {
      publish(entry, { inspectedReview: null, historyId: null, historyStatus: "idle", historyError: null });
      return;
    }
    if (!snapshot) return;
    const request = new AbortController();
    entry.historyRequest = request;
    publish(entry, { inspectedReview: null, historyId: reviewId, historyStatus: "loading", historyError: null });
    try {
      const raw = await call("code/review", { sessionId, scope: snapshot.scope, reviewId }, request);
      if (disposed || epoch !== generation || request.signal.aborted || entry.historyRequest !== request) return;
      const value = readSnapshot({ ...snapshot, review: raw }, sessionId);
      if (!value || value.review?.id !== reviewId) throw problem("code/invalid-review");
      publish(entry, { inspectedReview: value.review, historyStatus: "ready" });
    } catch (error) {
      if (!disposed && epoch === generation && entry.historyRequest === request) publish(entry, { historyStatus: "failed", historyError: problem(errorInfo(error).code, errorInfo(error).message) });
    } finally {
      if (entry.historyRequest === request) entry.historyRequest = null;
    }
  }
  async function cancel(sessionId) {
    const entry = entryFor(sessionId), snapshot = entry.state.snapshot, operation = snapshot?.operation, generation = epoch;
    if (!snapshot || entry.action || entry.state.status !== "live" || !operation?.id || operation.state === "cancelling") return { ok: false, error: problem("code/stale-action") };
    const request = new AbortController();
    entry.action = request;
    publish(entry, { pending: true });
    try {
      const raw = await call("code/cancel", { sessionId, scope: snapshot.scope, operationId: operation.id }, request);
      if (disposed || generation !== epoch || request.signal.aborted) throw problem("code/cancel-unconfirmed");
      const value = readSnapshot(raw, sessionId);
      if (!value || value.scope !== snapshot.scope) throw problem("code/cancel-unconfirmed");
      publish(entry, { snapshot: { ...entry.state.snapshot, operation: value.operation } });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: problem("code/cancel-unconfirmed", errorInfo(error).message) };
    } finally {
      if (entry.action === request) {
        entry.action = null;
        publish(entry, { pending: false });
        refresh(sessionId);
      }
    }
  }
  function reset() {
    epoch++;
    for (const entry of entries.values()) {
      stopRead(entry);
      stopFile(entry);
      entry.action?.abort();
      entry.historyRequest?.abort();
      entry.historyRequest = null;
      entry.action = null;
      entry.fileTarget = null;
      publish(entry, empty());
      if (entry.listeners.size) void refreshEntry(entry);
    }
  }
  return {
    source: (sessionId) => entryFor(sessionId).source,
    refresh,
    selectTarget,
    loadFile,
    clearFile,
    loadReview,
    cancel,
    reset,
    dispose() {
      disposed = true;
      epoch++;
      for (const entry of entries.values()) {
        stopRead(entry);
        stopFile(entry);
        entry.action?.abort();
        entry.historyRequest?.abort();
        entry.listeners.clear();
      }
      ;
      entries.clear();
    }
  };
}

// src/client/components.tsx
var import_react2 = __toESM(require("react"), 1);

// src/client/CodeViewer.tsx
var import_react = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
function Tabs({ items, value, onChange, label, className = "" }) {
  const onKey = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const at = items.findIndex((item) => item.value === value);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (at + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    onChange(items[next].value);
    event.currentTarget.parentElement?.children[next]?.focus();
  };
  return /* @__PURE__ */ import_react.default.createElement("div", { className: `dxc-tabs ${className}`, role: "tablist", "aria-label": label }, items.map((item) => /* @__PURE__ */ import_react.default.createElement("button", { key: item.value, type: "button", role: "tab", "aria-selected": value === item.value, tabIndex: value === item.value ? 0 : -1, onKeyDown: onKey, onClick: () => onChange(item.value) }, item.label)));
}
function MarkedText({ text: text2, query, spans }) {
  const chunks = spans?.length ? spans : [{ text: text2, style: void 0 }];
  let offset = 0;
  const matches = query ? searchMatches([text2], query) : [];
  return /* @__PURE__ */ import_react.default.createElement("span", { className: "dxc-line-text" }, chunks.map((span, token) => {
    const start = offset, end = offset + span.text.length;
    offset = end;
    const boundaries = [start, end, ...matches.flatMap((match) => [Math.max(start, match.start), Math.min(end, match.end)]).filter((point) => point > start && point < end)].sort((a, b) => a - b);
    return /* @__PURE__ */ import_react.default.createElement("span", { key: token, style: span.style }, boundaries.slice(0, -1).map((point, index) => {
      const part = span.text.slice(point - start, boundaries[index + 1] - start);
      return matches.some((match) => point >= match.start && point < match.end) ? /* @__PURE__ */ import_react.default.createElement("mark", { key: index }, part) : /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, { key: index }, part);
    }));
  }));
}
function Source({ text: text2, highlights, query, activeLine, focus, side }) {
  const lines = sourceLines(text2);
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-source-lines" }, lines.map((line, at) => /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-source-line", key: at, "data-line-target": `${side}:${at + 1}`, "data-focused": focus?.side === side && at + 1 >= focus.startLine && at + 1 <= focus.endLine || void 0, "data-find-active": activeLine === `${side}:${at + 1}` || void 0 }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dxc-line-number", "aria-hidden": "true" }, at + 1), /* @__PURE__ */ import_react.default.createElement(MarkedText, { text: line, spans: highlights?.[at], query }))));
}
function Diff({ hunks, split, wrap, oldHighlights, newHighlights, query, activeLine, focus, t }) {
  const columns = (0, import_react.useRef)({ left: null, right: null });
  const follow = (side) => (event) => {
    const peer = columns.current[side === "left" ? "right" : "left"];
    if (peer && peer.scrollLeft !== event.currentTarget.scrollLeft) peer.scrollLeft = event.currentTarget.scrollLeft;
  };
  const focused = (side, line) => focus?.side === side && line != null && line >= focus.startLine && line <= focus.endLine || void 0;
  const cell = (row, side, key) => {
    const no = row?.[side], spans = (side === "old" ? oldHighlights : newHighlights)?.[(no ?? 0) - 1];
    return /* @__PURE__ */ import_react.default.createElement("div", { key, className: `dxc-diff-cell dxc-line-${row?.kind ?? "empty"}`, "data-line-target": no ? `${side}:${no}` : void 0, "data-focused": focused(side, no), "data-find-active": activeLine === `${side}:${no}` || void 0 }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dxc-line-number", "aria-hidden": "true" }, no ?? ""), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxc-line-sign", "aria-hidden": "true" }, row?.kind === "add" ? "+" : row?.kind === "del" ? "\u2212" : ""), /* @__PURE__ */ import_react.default.createElement(MarkedText, { text: row?.text ?? "", spans, query }));
  };
  if (split && !wrap) return /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-split-columns" }, ["left", "right"].map((side) => /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-split-column", key: side, ref: (node) => {
    columns.current[side] = node;
  }, onScroll: follow(side) }, hunks.map((hunk, index) => /* @__PURE__ */ import_react.default.createElement("section", { className: "dxc-hunk", key: index }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-hunk-header" }, `@@ \u2212${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`), pairedRows(hunkRows(hunk)).map((row, at) => cell(row[side], side === "left" ? "old" : "new", at)))))));
  return /* @__PURE__ */ import_react.default.createElement("div", { className: `dxc-diff-lines ${split ? "dxc-split" : "dxc-unified"}` }, hunks.map((hunk, index) => {
    const rows = hunkRows(hunk);
    return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxc-hunk", key: index }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-hunk-header" }, `@@ \u2212${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`, hunk.heading && ` ${hunk.heading}`), split ? pairedRows(rows).map((row, at) => /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-split-row", key: at }, cell(row.left, "old", "left"), cell(row.right, "new", "right"))) : rows.map((row, at) => /* @__PURE__ */ import_react.default.createElement("div", { className: `dxc-unified-row dxc-line-${row.kind}`, key: at, "data-line-target": `${row.new == null ? "old" : "new"}:${row.new ?? row.old}`, "data-focused": focused("old", row.old) || focused("new", row.new), "data-find-active": activeLine === `${row.new == null ? "old" : "new"}:${row.new ?? row.old}` || void 0 }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dxc-line-number", "aria-label": t("oldSide") }, row.old ?? ""), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxc-line-number", "aria-label": t("newSide") }, row.new ?? ""), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxc-line-sign", "aria-hidden": "true" }, row.kind === "add" ? "+" : row.kind === "del" ? "\u2212" : ""), /* @__PURE__ */ import_react.default.createElement(MarkedText, { text: row.text, spans: (row.new == null ? oldHighlights : newHighlights)?.[(row.new ?? row.old ?? 0) - 1], query }))));
  }));
}
function CodeViewer({ file, status, error, path, identity, mode, context, focus, retry, scrollPositions, t }) {
  const [tab, setTab] = (0, import_react.useState)("source"), [side, setSide] = (0, import_react.useState)("new"), [split, setSplit] = (0, import_react.useState)(false), [wrap, setWrap] = (0, import_react.useState)(false);
  const [narrow, setNarrow] = (0, import_react.useState)(false);
  const [findOpen, setFindOpen] = (0, import_react.useState)(false), [query, setQuery] = (0, import_react.useState)(""), [matchIndex, setMatchIndex] = (0, import_react.useState)(0);
  const scroll = (0, import_react.useRef)(null), findInput = (0, import_react.useRef)(null), root = (0, import_react.useRef)(null);
  const highlighter = (0, import_dsh_client_ui_primitives.useCodeHighlighter)((0, import_dsh_client_ui_primitives.languageForPath)(path ?? ""));
  const oldHighlights = (0, import_react.useMemo)(() => highlighter(file?.beforeText ?? ""), [highlighter, file?.beforeText]);
  const newHighlights = (0, import_react.useMemo)(() => highlighter(file?.text ?? ""), [highlighter, file?.text]);
  const hunks = (0, import_react.useMemo)(() => diffHunks(file?.hunks ?? file?.diff), [file?.hunks, file?.diff]);
  const rows = (0, import_react.useMemo)(() => tab === "source" ? sourceLines(side === "old" ? file?.beforeText : file?.text).map((text2, at) => ({ text: text2, key: `${side}:${at + 1}` })) : hunks.flatMap(hunkRows).map((row) => ({ text: row.text, key: `${row.new == null ? "old" : "new"}:${row.new ?? row.old}` })), [file, tab, side, hunks]);
  const matches = (0, import_react.useMemo)(() => searchMatches(rows.map((row) => row.text), query), [rows, query]);
  const normalizedIndex = matches.length ? matchIndex % matches.length : 0;
  const activeLine = matches.length ? rows[matches[normalizedIndex].line - 1].key : null;
  const scrollKey = `${identity}:${tab}:${side}`;
  (0, import_react.useEffect)(() => {
    if (!globalThis.ResizeObserver || !root.current) return;
    const observer = new ResizeObserver((entries) => setNarrow(entries[0].contentRect.width < 560));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  (0, import_react.useLayoutEffect)(() => {
    const node = scroll.current;
    if (!node) return;
    const position = scrollPositions.current.get(scrollKey);
    node.scrollTop = position?.top ?? 0;
    node.scrollLeft = position?.left ?? 0;
    return () => {
      scrollPositions.current.set(scrollKey, { top: node.scrollTop, left: node.scrollLeft });
    };
  }, [scrollKey, status, scrollPositions]);
  (0, import_react.useEffect)(() => {
    setMatchIndex(0);
  }, [query, tab, side, identity]);
  (0, import_react.useEffect)(() => {
    if (findOpen) findInput.current?.focus();
  }, [findOpen]);
  (0, import_react.useEffect)(() => {
    if (!focus) return;
    setTab("source");
    setSide(focus.side ?? "new");
  }, [focus]);
  (0, import_react.useEffect)(() => {
    const target = focus && status === "ready" ? root.current?.querySelector(`[data-line-target="${focus.side ?? "new"}:${focus.startLine}"]`) : null;
    target?.scrollIntoView?.({ block: "center" });
  }, [focus, status, tab, side]);
  (0, import_react.useEffect)(() => {
    if (findOpen && activeLine) root.current?.querySelector(`[data-line-target="${activeLine}"]`)?.scrollIntoView?.({ block: "center" });
  }, [findOpen, activeLine, normalizedIndex]);
  const nextMatch = (delta) => setMatchIndex((value) => matches.length ? (value + delta + matches.length) % matches.length : 0);
  const closeFind = () => {
    setFindOpen(false);
    setQuery("");
    root.current?.focus();
  };
  const kind = file?.kind ?? file?.status;
  const nonText = ["binary", "oversized", "symlink", "excluded", "unavailable"].includes(kind ?? "");
  const source = side === "old" ? file?.beforeText : file?.text;
  const loadedPath = file?.path === path;
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxc-viewer", "aria-label": t("codeView"), ref: root, tabIndex: 0, onKeyDown: (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      setFindOpen(true);
    }
    if (event.key === "Escape" && findOpen) {
      event.preventDefault();
      closeFind();
    }
  } }, /* @__PURE__ */ import_react.default.createElement("header", { className: "dxc-viewer-heading" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-path", title: path ?? void 0 }, path || t("chooseFile")), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxc-readonly" }, t("readOnly"))), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-viewer-controls" }, /* @__PURE__ */ import_react.default.createElement(Tabs, { value: tab, onChange: setTab, label: t("code"), items: [{ value: "source", label: t("source") }, { value: "diff", label: t("diff") }] }), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-viewer-options" }, tab === "source" ? /* @__PURE__ */ import_react.default.createElement("select", { "aria-label": t("context"), value: side, onChange: (event) => setSide(event.target.value) }, /* @__PURE__ */ import_react.default.createElement("option", { value: "new" }, context === "review" ? t("reviewed") : t(`origin.${mode}`)), /* @__PURE__ */ import_react.default.createElement("option", { value: "old" }, t("before"))) : /* @__PURE__ */ import_react.default.createElement("button", { className: "dxc-split-control", type: "button", disabled: narrow, title: narrow ? t("splitNarrow") : void 0, "aria-pressed": split && !narrow, onClick: () => setSplit((value) => !value) }, t(split && !narrow ? "split" : "unified")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxc-icon-button", "aria-pressed": wrap, "aria-label": t("wrap"), title: t("wrap"), onClick: () => setWrap((value) => !value) }, "\u21B5"), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxc-icon-button", "aria-label": t("find"), title: t("find"), onClick: () => setFindOpen((value) => !value) }, "\u2315"))), findOpen && /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-find", role: "search" }, /* @__PURE__ */ import_react.default.createElement("input", { ref: findInput, value: query, placeholder: t("findPlaceholder"), "aria-label": t("find"), onChange: (event) => setQuery(event.target.value), onKeyDown: (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      nextMatch(event.shiftKey ? -1 : 1);
    }
  } }), /* @__PURE__ */ import_react.default.createElement("span", { role: "status" }, matches.length ? t("matches", { current: normalizedIndex + 1, count: matches.length }) : t("noMatches")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", "aria-label": t("previousMatch"), disabled: !matches.length, onClick: () => nextMatch(-1) }, "\u2191"), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", "aria-label": t("nextMatch"), disabled: !matches.length, onClick: () => nextMatch(1) }, "\u2193"), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", "aria-label": t("closeFind"), onClick: closeFind }, "\xD7")), loadedPath && /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-version" }, /* @__PURE__ */ import_react.default.createElement("span", null, tab === "source" && side === "old" ? t("beforeVersion", { version: shortHash(file.baseVersion) }) : t("afterVersion", { origin: context === "review" ? t("reviewed") : t(`origin.${mode}`), version: shortHash(["Worktree", "Index"].includes(file.version ?? "") ? file.hash : file.version ?? file.hash) })), tab === "diff" && /* @__PURE__ */ import_react.default.createElement("span", null, t("beforeVersion", { version: shortHash(file.baseVersion) }))), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-code-scroll", ref: scroll, "data-wrap": wrap || void 0, onScroll: (event) => scrollPositions.current.set(scrollKey, { top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft }) }, !path ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-empty dxc-code-empty" }, /* @__PURE__ */ import_react.default.createElement("span", { "aria-hidden": "true" }, "{ }"), /* @__PURE__ */ import_react.default.createElement("p", null, t("chooseFile"))) : status === "loading" || status === "ready" && !loadedPath ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dxc-state", role: "status" }, t("fileLoading")) : status === "failed" ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dxc-state", role: "alert" }, /* @__PURE__ */ import_react.default.createElement("p", null, t(/stale/i.test(error?.code ?? "") ? "fileChanged" : "fileFailed")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: retry }, t("retry"))) : loadedPath ? /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, (file.truncated || file.diffTruncated) && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxc-inline-warning" }, t("truncated")), nonText ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dxc-state" }, t(kind === "unavailable" ? "fileFailed" : kind ?? "unavailable")) : tab === "source" ? source == null || side === "old" && file.beforeKind === "missing" || side === "new" && (file.afterKind === "missing" || kind === "missing") ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dxc-state" }, t("missing")) : source === "" ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dxc-state" }, t("emptyFile")) : /* @__PURE__ */ import_react.default.createElement(Source, { text: source, highlights: side === "old" ? oldHighlights : newHighlights, query, activeLine, focus, side }) : hunks.length ? /* @__PURE__ */ import_react.default.createElement(Diff, { hunks, split: split && !narrow, wrap, oldHighlights, newHighlights, query, activeLine, focus, t }) : /* @__PURE__ */ import_react.default.createElement("p", { className: "dxc-state" }, t("noDiff"))) : null));
}

// src/client/locales.ts
var NS = "dshXCode";
var en = {
  "stage.preparing": "Capturing source",
  "stage.waiting_permission": "Awaiting permission",
  "stage.reviewing": "Reviewing snapshot",
  "stage.repairing": "Fixing selected findings",
  "stage.verifying": "Checking result",
  "stage.cancelling": "Stopping\u2026",
  splitNarrow: "Widen the code pane for a split view.",
  repairAttempt: "Fix attempt",
  viewingHistory: "Historical review",
  latestReview: "Latest review",
  historyLoading: "Loading recorded review\u2026",
  historyFailed: "The recorded review could not be loaded.",
  reviewer: "Reviewer",
  dshReviewer: "Current DSH model",
  sessionModel: "Session model",
  reviewerMissing: "Configure a session model before reviewing.",
  worktreeFirst: "Switch to the worktree scope to re-review the same files.",
  excluded: "This file is excluded from source preview.",
  title: "Code",
  open: "Open Code",
  back: "Conversation",
  refresh: "Refresh",
  loading: "Loading repository\u2026",
  retry: "Try again",
  close: "Close",
  cancel: "Cancel",
  snapshotBoundary: "Only selected source snapshots are sent; no tools or conversation history.",
  gitUnavailable: "Git data could not be inspected. Choose a Git-backed workspace and refresh.",
  invalidBase: "This base could not be compared with HEAD. Check the branch, tag or commit.",
  noHead: "Choose a repository with at least one commit.",
  policyUnavailable: "The host workspace permission policy is unavailable.",
  boundaryBlocked: "This repository cannot be inspected within the current workspace boundary.",
  incompleteManifest: "The repository exceeds the inspection limits. Choose a smaller repository.",
  noSession: "Open a conversation to browse its workspace.",
  noRepository: "This workspace is not a Git repository.",
  unavailable: "The repository is unavailable. Refresh to try again.",
  disconnected: "Connection interrupted. Showing the last snapshot; actions are paused.",
  invalidState: "The host returned an unsupported result. Refresh before continuing.",
  repository: "Repository",
  scope: "Compare",
  "mode.worktree": "Worktree",
  "mode.staged": "Staged",
  "mode.range": "Base\u2026HEAD",
  base: "Base ref",
  basePlaceholder: "main or commit",
  applyBase: "Compare",
  context: "Content version",
  current: "Current workspace",
  reviewed: "Reviewed snapshot",
  snapshot: "Snapshot",
  "origin.worktree": "Working tree",
  "origin.staged": "Index",
  "origin.range": "HEAD",
  before: "Before",
  source: "Source",
  diff: "Diff",
  readOnly: "Read-only",
  unified: "Unified",
  split: "Split",
  wrap: "Wrap lines",
  files: "Files",
  code: "Code",
  findings: "Findings",
  changed: "Changed",
  all: "All",
  searchFiles: "Find a file\u2026",
  fileSearchLabel: "Search file names and paths",
  noFiles: "No matching files.",
  noChanges: "No changes in this scope.",
  chooseFile: "Choose a file to read its source or diff.",
  openFile: "Open {path}",
  selectFile: "Select {path} for review",
  selectChanged: "Select changed",
  clearSelection: "Clear selection",
  selection: "{count} selected",
  fileCount: "{count} files",
  selectionLimit: "Select up to {count} files.",
  partialFiles: "File list is limited. Narrow the workspace before reviewing omitted files.",
  "file.modified": "Modified",
  "file.added": "Added",
  "file.deleted": "Deleted",
  "file.renamed": "Renamed",
  "file.untracked": "Untracked",
  "file.unchanged": "Unchanged",
  "file.typechanged": "Type changed",
  "file.conflicted": "Conflict",
  fileLoading: "Loading file\u2026",
  fileFailed: "This file could not be loaded.",
  fileChanged: "The workspace changed. Refresh to load its current version.",
  binary: "Binary file. Text preview is unavailable.",
  oversized: "This file exceeds the preview limit.",
  symlink: "Symbolic link. Its target is not opened here.",
  missing: "This version does not contain the file.",
  emptyFile: "Empty file",
  noDiff: "No text changes in this comparison.",
  truncated: "Preview is limited; omitted content has not been shown.",
  renamedFrom: "Renamed from {path}",
  find: "Find in file",
  findPlaceholder: "Find text\u2026",
  matches: "{current} / {count}",
  noMatches: "No matches",
  nextMatch: "Next match",
  previousMatch: "Previous match",
  closeFind: "Close find",
  codeView: "Read-only source code",
  diffView: "Read-only code comparison",
  beforeVersion: "Before \xB7 {version}",
  afterVersion: "{origin} \xB7 {version}",
  review: "Review",
  reviewSelected: "Review selected files",
  reviewSetup: "Review changes",
  repairSetup: "Fix selected findings",
  rereviewSetup: "Review updated changes",
  agent: "Agent",
  chooseAgent: "Choose an Agent",
  model: "Model",
  nativeDefault: "Agent default",
  agentsMissing: "Enable the Agents plugin to fix selected findings.",
  noAgent: "No compatible Agent is ready. Check setup in Agents.",
  reviewRuntime: "Reviews need a read-only local Agent.",
  agentSetup: "Check Agent setup",
  models: "Refresh models",
  modelNotVerified: "Model access is checked when the task starts.",
  "catalog.not-loaded": "Models not loaded",
  "catalog.fresh": "Models loaded",
  "catalog.stale": "Model list is stale",
  "catalog.failed": "Model refresh failed",
  prepare: "Prepare in conversation",
  prepareHint: "Review and send the request in your conversation.",
  draftChanged: "The input changed or is locked. No request was inserted.",
  insertionUnconfirmed: "Check the conversation input before trying again; insertion could not be confirmed.",
  inserted: "Request prepared in the conversation.",
  selectFiles: "Select files to review first.",
  selectionChanged: "The selection changed. Refresh and select the files again.",
  staleFix: "This review cannot be used for a fix. Review the current changes first.",
  noReview: "No review yet",
  noReviewHint: "Select changed files, then start a review.",
  noFindings: "No findings in the selected files.",
  incomplete: "Review incomplete",
  incompleteHint: "This run did not produce a complete structured review.",
  allFindings: "All severities",
  openFindings: "{count} findings",
  selectFinding: "Select finding: {title}",
  findingLocation: "Open {path}, line {line}",
  evidence: "Evidence",
  trigger: "When it occurs",
  details: "Details",
  checks: "Verification",
  "check.passed": "Passed",
  "check.failed": "Failed",
  "check.running": "Running",
  "check.not_run": "Not run",
  "check.not-run": "Not run",
  "check.blocked": "Blocked",
  "check.unknown": "Not verified",
  noChecks: "Checks not run",
  checksHint: "A completed Agent turn does not mean checks passed.",
  "severity.critical": "Critical",
  "severity.high": "High",
  "severity.medium": "Medium",
  "severity.low": "Low",
  "severity.info": "Info",
  fix: "Fix selected ({count})",
  rereview: "Re-review",
  needsReview: "Needs re-review",
  repairComplete: "The fix run ended. Review the updated worktree.",
  stale: "Files changed since this review.",
  staleHint: "These findings refer to the captured snapshot. Start a fresh review before fixing.",
  stop: "Stop",
  stopping: "Stopping\u2026",
  cancelUnconfirmed: "The stop result is unconfirmed. Check the native task before retrying.",
  openConversation: "Open conversation",
  continueTask: "Prepare continuation",
  continuePrompt: "Continue this Code operation from its current state. Do not treat prior incomplete checks as passing. Keep its snapshot binding and return the required structured result.",
  "state.running": "Reviewing",
  "state.reviewing": "Reviewing",
  "state.repairing": "Fixing",
  "state.pending": "Preparing",
  "state.waiting_permission": "Awaiting permission",
  "state.waiting_input": "Awaiting your answer",
  "state.completed": "Review complete",
  "state.complete": "Review complete",
  "state.cancelled": "Stopped",
  "state.failed": "Failed",
  "state.blocked": "Blocked",
  "state.interrupted": "Interrupted",
  "state.idle": "Ready",
  "state.incomplete": "Incomplete",
  "state.invalid": "Incomplete",
  history: "Review history",
  summary: "Summary",
  coverage: "Files in scope: {count}",
  reviewBudget: "Up to {count} files; {bytes} bytes of source per review.",
  reviewedOnly: "Only captured files are available in this snapshot.",
  currentSelection: "Current file",
  oldSide: "Old lines",
  newSide: "New lines",
  noSelectedIssues: "Select findings to prepare a fix.",
  reviewRequest: "Please call dsh_x_code_review with these exact arguments. Use the official approval flow and return a complete structured review:",
  repairRequest: "Please call dsh_x_code_repair with these exact arguments. Fix only the selected findings, retain native permission checks, and report verification honestly:",
  inspectRequest: "Please call dsh_x_agents_inspect with {} to check the configured Agents. Do not install software or change authentication.",
  modelsRequest: "Please call dsh_x_agents_models with these exact arguments using the official approval flow:",
  continueRequest: "Please call dsh_x_agents_run with these exact arguments using the official approval flow:",
  historical: "Recorded result",
  viewWorkbench: "Open Code",
  toolRunning: "Code operation in progress",
  toolFailed: "Code operation did not complete",
  toolUnknown: "This record has no supported structured result."
};
var zh = {
  "stage.preparing": "\u6B63\u5728\u6355\u83B7\u6E90\u7801",
  "stage.waiting_permission": "\u7B49\u5F85\u6388\u6743",
  "stage.reviewing": "\u6B63\u5728\u5BA1\u67E5\u5FEB\u7167",
  "stage.repairing": "\u6B63\u5728\u4FEE\u590D\u6240\u9009\u95EE\u9898",
  "stage.verifying": "\u6B63\u5728\u68C0\u67E5\u7ED3\u679C",
  "stage.cancelling": "\u6B63\u5728\u505C\u6B62\u2026",
  splitNarrow: "\u52A0\u5BBD\u4EE3\u7801\u533A\u57DF\u540E\u53EF\u4F7F\u7528\u5E76\u6392\u89C6\u56FE\u3002",
  repairAttempt: "\u4FEE\u590D\u5C1D\u8BD5",
  viewingHistory: "\u5386\u53F2\u5BA1\u67E5",
  latestReview: "\u8FD4\u56DE\u6700\u65B0\u5BA1\u67E5",
  historyLoading: "\u6B63\u5728\u8BFB\u53D6\u5386\u53F2\u5BA1\u67E5\u2026",
  historyFailed: "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\u6B64\u5386\u53F2\u5BA1\u67E5\u3002",
  reviewer: "\u5BA1\u67E5\u8005",
  dshReviewer: "DSH \u5F53\u524D\u6A21\u578B",
  sessionModel: "\u5BF9\u8BDD\u6A21\u578B",
  reviewerMissing: "\u914D\u7F6E\u5BF9\u8BDD\u6A21\u578B\u540E\u5373\u53EF\u5BA1\u67E5\u3002",
  worktreeFirst: "\u8BF7\u5207\u6362\u5230\u5DE5\u4F5C\u533A\u8303\u56F4\u540E\u518D\u590D\u5BA1\u540C\u4E00\u6279\u6587\u4EF6\u3002",
  excluded: "\u6B64\u6587\u4EF6\u4E0D\u5728\u6E90\u7801\u9884\u89C8\u8303\u56F4\u5185\u3002",
  title: "Code",
  open: "\u6253\u5F00 Code",
  back: "\u8FD4\u56DE\u5BF9\u8BDD",
  refresh: "\u5237\u65B0",
  loading: "\u6B63\u5728\u8BFB\u53D6\u4ED3\u5E93\u2026",
  retry: "\u91CD\u8BD5",
  close: "\u5173\u95ED",
  cancel: "\u53D6\u6D88",
  snapshotBoundary: "\u4EC5\u53D1\u9001\u6240\u9009\u6E90\u7801\u5FEB\u7167\uFF0C\u4E0D\u63D0\u4F9B\u5DE5\u5177\u6216\u5BF9\u8BDD\u5386\u53F2\u3002",
  gitUnavailable: "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6 Git \u6570\u636E\uFF0C\u8BF7\u9009\u62E9 Git \u5DE5\u4F5C\u533A\u540E\u5237\u65B0\u3002",
  invalidBase: "\u65E0\u6CD5\u5C06\u6B64\u57FA\u51C6\u4E0E HEAD \u6BD4\u8F83\uFF0C\u8BF7\u68C0\u67E5\u5206\u652F\u3001\u6807\u7B7E\u6216\u63D0\u4EA4\u3002",
  noHead: "\u8BF7\u9009\u62E9\u81F3\u5C11\u6709\u4E00\u6B21\u63D0\u4EA4\u7684 Git \u4ED3\u5E93\u3002",
  policyUnavailable: "\u5BBF\u4E3B\u6682\u672A\u63D0\u4F9B\u53EF\u7528\u7684\u5DE5\u4F5C\u533A\u6743\u9650\u7B56\u7565\u3002",
  boundaryBlocked: "\u5F53\u524D\u5DE5\u4F5C\u533A\u8FB9\u754C\u4E0D\u652F\u6301\u8BFB\u53D6\u6B64\u4ED3\u5E93\u3002",
  incompleteManifest: "\u4ED3\u5E93\u8D85\u8FC7\u68C0\u67E5\u8303\u56F4\u9650\u5236\uFF0C\u8BF7\u9009\u62E9\u8F83\u5C0F\u7684\u4ED3\u5E93\u3002",
  noSession: "\u5148\u6253\u5F00\u4E00\u4E2A\u5BF9\u8BDD\uFF0C\u5373\u53EF\u6D4F\u89C8\u5B83\u7684\u5DE5\u4F5C\u533A\u3002",
  noRepository: "\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0D\u662F Git \u4ED3\u5E93\u3002",
  unavailable: "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\u4ED3\u5E93\uFF0C\u8BF7\u5237\u65B0\u91CD\u8BD5\u3002",
  disconnected: "\u8FDE\u63A5\u5DF2\u4E2D\u65AD\uFF0C\u5F53\u524D\u5C55\u793A\u4E0A\u6B21\u5FEB\u7167\uFF0C\u64CD\u4F5C\u5DF2\u6682\u505C\u3002",
  invalidState: "\u5BBF\u4E3B\u8FD4\u56DE\u7684\u7ED3\u679C\u6682\u4E0D\u53D7\u652F\u6301\uFF0C\u8BF7\u5237\u65B0\u540E\u7EE7\u7EED\u3002",
  repository: "\u4ED3\u5E93",
  scope: "\u6BD4\u8F83\u8303\u56F4",
  "mode.worktree": "\u5DE5\u4F5C\u533A",
  "mode.staged": "\u6682\u5B58\u533A",
  "mode.range": "\u57FA\u7EBF\u2026HEAD",
  base: "\u57FA\u7EBF\u5F15\u7528",
  basePlaceholder: "main \u6216\u63D0\u4EA4",
  applyBase: "\u6BD4\u8F83",
  context: "\u5185\u5BB9\u7248\u672C",
  current: "\u5F53\u524D\u5DE5\u4F5C\u533A",
  reviewed: "\u5BA1\u67E5\u5FEB\u7167",
  snapshot: "\u5FEB\u7167",
  "origin.worktree": "\u5DE5\u4F5C\u533A\u6587\u4EF6",
  "origin.staged": "\u6682\u5B58\u533A\u6587\u4EF6",
  "origin.range": "HEAD",
  before: "\u4FEE\u6539\u524D",
  source: "\u6E90\u7801",
  diff: "\u5DEE\u5F02",
  readOnly: "\u53EA\u8BFB",
  unified: "\u7EDF\u4E00",
  split: "\u5E76\u6392",
  wrap: "\u81EA\u52A8\u6362\u884C",
  files: "\u6587\u4EF6",
  code: "\u4EE3\u7801",
  findings: "\u95EE\u9898",
  changed: "\u5DF2\u66F4\u6539",
  all: "\u5168\u90E8",
  searchFiles: "\u67E5\u627E\u6587\u4EF6\u2026",
  fileSearchLabel: "\u641C\u7D22\u6587\u4EF6\u540D\u548C\u8DEF\u5F84",
  noFiles: "\u6CA1\u6709\u5339\u914D\u7684\u6587\u4EF6\u3002",
  noChanges: "\u6B64\u8303\u56F4\u5185\u6CA1\u6709\u66F4\u6539\u3002",
  chooseFile: "\u9009\u62E9\u6587\u4EF6\uFF0C\u67E5\u770B\u6E90\u7801\u6216\u5DEE\u5F02\u3002",
  openFile: "\u6253\u5F00 {path}",
  selectFile: "\u9009\u62E9 {path} \u8FDB\u884C\u5BA1\u67E5",
  selectChanged: "\u9009\u62E9\u66F4\u6539",
  clearSelection: "\u6E05\u7A7A\u9009\u62E9",
  selection: "\u5DF2\u9009 {count} \u9879",
  fileCount: "{count} \u4E2A\u6587\u4EF6",
  selectionLimit: "\u6700\u591A\u9009\u62E9 {count} \u4E2A\u6587\u4EF6\u3002",
  partialFiles: "\u6587\u4EF6\u5217\u8868\u5DF2\u8FBE\u4E0A\u9650\uFF0C\u7F29\u5C0F\u5DE5\u4F5C\u533A\u540E\u518D\u5BA1\u67E5\u672A\u5217\u51FA\u7684\u6587\u4EF6\u3002",
  "file.modified": "\u5DF2\u4FEE\u6539",
  "file.added": "\u65B0\u589E",
  "file.deleted": "\u5DF2\u5220\u9664",
  "file.renamed": "\u5DF2\u91CD\u547D\u540D",
  "file.untracked": "\u672A\u8DDF\u8E2A",
  "file.unchanged": "\u672A\u4FEE\u6539",
  "file.typechanged": "\u7C7B\u578B\u66F4\u6539",
  "file.conflicted": "\u5B58\u5728\u51B2\u7A81",
  fileLoading: "\u6B63\u5728\u8BFB\u53D6\u6587\u4EF6\u2026",
  fileFailed: "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\u6B64\u6587\u4EF6\u3002",
  fileChanged: "\u5DE5\u4F5C\u533A\u5DF2\u66F4\u6539\uFF0C\u8BF7\u5237\u65B0\u540E\u8BFB\u53D6\u6700\u65B0\u7248\u672C\u3002",
  binary: "\u4E8C\u8FDB\u5236\u6587\u4EF6\uFF0C\u65E0\u6CD5\u9884\u89C8\u6587\u672C\u3002",
  oversized: "\u6587\u4EF6\u8D85\u8FC7\u9884\u89C8\u5927\u5C0F\u4E0A\u9650\u3002",
  symlink: "\u7B26\u53F7\u94FE\u63A5\uFF0C\u8FD9\u91CC\u4E0D\u4F1A\u6253\u5F00\u5176\u76EE\u6807\u3002",
  missing: "\u6B64\u7248\u672C\u4E2D\u6CA1\u6709\u8BE5\u6587\u4EF6\u3002",
  emptyFile: "\u7A7A\u6587\u4EF6",
  noDiff: "\u6B64\u6BD4\u8F83\u4E2D\u6CA1\u6709\u6587\u672C\u53D8\u5316\u3002",
  truncated: "\u9884\u89C8\u5DF2\u8FBE\u4E0A\u9650\uFF0C\u672A\u5C55\u793A\u5176\u4F59\u5185\u5BB9\u3002",
  renamedFrom: "\u539F\u8DEF\u5F84\uFF1A{path}",
  find: "\u5728\u6587\u4EF6\u4E2D\u67E5\u627E",
  findPlaceholder: "\u67E5\u627E\u6587\u672C\u2026",
  matches: "{current} / {count}",
  noMatches: "\u6CA1\u6709\u5339\u914D\u9879",
  nextMatch: "\u4E0B\u4E00\u5904",
  previousMatch: "\u4E0A\u4E00\u5904",
  closeFind: "\u5173\u95ED\u67E5\u627E",
  codeView: "\u53EA\u8BFB\u6E90\u7801",
  diffView: "\u53EA\u8BFB\u4EE3\u7801\u6BD4\u8F83",
  beforeVersion: "\u4FEE\u6539\u524D \xB7 {version}",
  afterVersion: "{origin} \xB7 {version}",
  review: "\u5BA1\u67E5",
  reviewSelected: "\u5BA1\u67E5\u6240\u9009\u6587\u4EF6",
  reviewSetup: "\u5BA1\u67E5\u66F4\u6539",
  repairSetup: "\u4FEE\u590D\u6240\u9009\u95EE\u9898",
  rereviewSetup: "\u590D\u5BA1\u6700\u65B0\u66F4\u6539",
  agent: "Agent",
  chooseAgent: "\u9009\u62E9 Agent",
  model: "\u6A21\u578B",
  nativeDefault: "Agent \u9ED8\u8BA4\u6A21\u578B",
  agentsMissing: "\u542F\u7528 Agents \u63D2\u4EF6\u540E\u5373\u53EF\u4FEE\u590D\u6240\u9009\u95EE\u9898\u3002",
  noAgent: "\u6682\u65E0\u53EF\u7528\u7684 Agent\uFF0C\u8BF7\u5148\u68C0\u67E5\u914D\u7F6E\u3002",
  reviewRuntime: "\u5BA1\u67E5\u9700\u8981\u652F\u6301\u53EA\u8BFB\u9694\u79BB\u7684\u672C\u5730 Agent\u3002",
  agentSetup: "\u68C0\u67E5 Agent \u914D\u7F6E",
  models: "\u5237\u65B0\u6A21\u578B",
  modelNotVerified: "\u5F00\u59CB\u4EFB\u52A1\u65F6\u4F1A\u68C0\u67E5\u6A21\u578B\u662F\u5426\u53EF\u7528\u3002",
  "catalog.not-loaded": "\u5C1A\u672A\u8BFB\u53D6\u6A21\u578B",
  "catalog.fresh": "\u6A21\u578B\u5DF2\u8BFB\u53D6",
  "catalog.stale": "\u6A21\u578B\u5217\u8868\u5DF2\u8FC7\u671F",
  "catalog.failed": "\u6A21\u578B\u5237\u65B0\u5931\u8D25",
  prepare: "\u5199\u5165\u5BF9\u8BDD",
  prepareHint: "\u8BF7\u5728\u5BF9\u8BDD\u4E2D\u786E\u8BA4\u5E76\u53D1\u9001\u8BF7\u6C42\u3002",
  draftChanged: "\u8F93\u5165\u6846\u5DF2\u53D8\u5316\u6216\u88AB\u9501\u5B9A\uFF0C\u6CA1\u6709\u5199\u5165\u8BF7\u6C42\u3002",
  insertionUnconfirmed: "\u6682\u672A\u786E\u8BA4\u662F\u5426\u5199\u5165\uFF0C\u8BF7\u5148\u68C0\u67E5\u5BF9\u8BDD\u8F93\u5165\u6846\uFF0C\u907F\u514D\u91CD\u590D\u3002",
  inserted: "\u8BF7\u6C42\u5DF2\u5199\u5165\u5BF9\u8BDD\u3002",
  selectFiles: "\u8BF7\u5148\u9009\u62E9\u8981\u5BA1\u67E5\u7684\u6587\u4EF6\u3002",
  selectionChanged: "\u9009\u62E9\u5185\u5BB9\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u5E76\u91CD\u65B0\u9009\u62E9\u6587\u4EF6\u3002",
  staleFix: "\u6B64\u5BA1\u67E5\u4E0D\u80FD\u7528\u4E8E\u4FEE\u590D\uFF0C\u8BF7\u5148\u5BA1\u67E5\u6700\u65B0\u66F4\u6539\u3002",
  noReview: "\u5C1A\u672A\u5BA1\u67E5",
  noReviewHint: "\u9009\u62E9\u66F4\u6539\u7684\u6587\u4EF6\uFF0C\u7136\u540E\u5F00\u59CB\u5BA1\u67E5\u3002",
  noFindings: "\u6240\u9009\u6587\u4EF6\u4E2D\u672A\u53D1\u73B0\u95EE\u9898\u3002",
  incomplete: "\u5BA1\u67E5\u672A\u5B8C\u6210",
  incompleteHint: "\u672C\u6B21\u6267\u884C\u6CA1\u6709\u4EA7\u51FA\u5B8C\u6574\u7684\u7ED3\u6784\u5316\u5BA1\u67E5\u7ED3\u679C\u3002",
  allFindings: "\u5168\u90E8\u4E25\u91CD\u7A0B\u5EA6",
  openFindings: "{count} \u4E2A\u95EE\u9898",
  selectFinding: "\u9009\u62E9\u95EE\u9898\uFF1A{title}",
  findingLocation: "\u6253\u5F00 {path}\uFF0C\u7B2C {line} \u884C",
  evidence: "\u8BC1\u636E",
  trigger: "\u89E6\u53D1\u6761\u4EF6",
  details: "\u8BE6\u60C5",
  checks: "\u9A8C\u8BC1",
  "check.passed": "\u901A\u8FC7",
  "check.failed": "\u5931\u8D25",
  "check.running": "\u8FDB\u884C\u4E2D",
  "check.not_run": "\u672A\u6267\u884C",
  "check.not-run": "\u672A\u6267\u884C",
  "check.blocked": "\u53D7\u963B",
  "check.unknown": "\u5C1A\u672A\u9A8C\u8BC1",
  noChecks: "\u5C1A\u672A\u6267\u884C\u9A8C\u8BC1",
  checksHint: "Agent \u672C\u8F6E\u7ED3\u675F\u4E0D\u4EE3\u8868\u9A8C\u8BC1\u901A\u8FC7\u3002",
  "severity.critical": "\u4E25\u91CD",
  "severity.high": "\u9AD8",
  "severity.medium": "\u4E2D",
  "severity.low": "\u4F4E",
  "severity.info": "\u63D0\u793A",
  fix: "\u4FEE\u590D\u6240\u9009\u95EE\u9898\uFF08{count}\uFF09",
  rereview: "\u590D\u5BA1",
  needsReview: "\u9700\u8981\u590D\u5BA1",
  repairComplete: "\u4FEE\u590D\u672C\u8F6E\u5DF2\u7ED3\u675F\uFF0C\u8BF7\u5BA1\u67E5\u66F4\u65B0\u540E\u7684\u5DE5\u4F5C\u533A\u3002",
  stale: "\u6587\u4EF6\u5728\u5BA1\u67E5\u540E\u53D1\u751F\u4E86\u53D8\u5316\u3002",
  staleHint: "\u8FD9\u4E9B\u95EE\u9898\u4ECD\u5BF9\u5E94\u5DF2\u4FDD\u5B58\u7684\u5FEB\u7167\u3002\u8BF7\u5148\u91CD\u65B0\u5BA1\u67E5\uFF0C\u518D\u8FDB\u884C\u4FEE\u590D\u3002",
  stop: "\u505C\u6B62",
  stopping: "\u6B63\u5728\u505C\u6B62\u2026",
  cancelUnconfirmed: "\u6682\u672A\u786E\u8BA4\u505C\u6B62\u7ED3\u679C\uFF0C\u8BF7\u68C0\u67E5\u539F\u751F\u4EFB\u52A1\u540E\u518D\u64CD\u4F5C\u3002",
  openConversation: "\u6253\u5F00\u5BF9\u8BDD",
  continueTask: "\u51C6\u5907\u7EE7\u7EED",
  continuePrompt: "\u4ECE\u5F53\u524D\u72B6\u6001\u7EE7\u7EED\u6B64 Code \u64CD\u4F5C\u3002\u4E0D\u8981\u628A\u672A\u5B8C\u6210\u7684\u9A8C\u8BC1\u5F53\u4F5C\u901A\u8FC7\u3002\u4FDD\u7559\u5FEB\u7167\u7ED1\u5B9A\uFF0C\u5E76\u8FD4\u56DE\u8981\u6C42\u7684\u7ED3\u6784\u5316\u7ED3\u679C\u3002",
  "state.running": "\u6B63\u5728\u5BA1\u67E5",
  "state.reviewing": "\u6B63\u5728\u5BA1\u67E5",
  "state.repairing": "\u6B63\u5728\u4FEE\u590D",
  "state.pending": "\u6B63\u5728\u51C6\u5907",
  "state.waiting_permission": "\u7B49\u5F85\u6388\u6743",
  "state.waiting_input": "\u7B49\u5F85\u4F60\u56DE\u7B54",
  "state.completed": "\u5BA1\u67E5\u5B8C\u6210",
  "state.complete": "\u5BA1\u67E5\u5B8C\u6210",
  "state.cancelled": "\u5DF2\u505C\u6B62",
  "state.failed": "\u5931\u8D25",
  "state.blocked": "\u53D7\u963B",
  "state.interrupted": "\u5DF2\u4E2D\u65AD",
  "state.idle": "\u5C31\u7EEA",
  "state.incomplete": "\u672A\u5B8C\u6210",
  "state.invalid": "\u672A\u5B8C\u6210",
  history: "\u5BA1\u67E5\u5386\u53F2",
  summary: "\u6458\u8981",
  coverage: "\u8303\u56F4\u5185\u6587\u4EF6\uFF1A{count}",
  reviewBudget: "\u6700\u591A {count} \u4E2A\u6587\u4EF6\uFF0C\u6E90\u7801\u5171 {bytes} \u5B57\u8282\u3002",
  reviewedOnly: "\u6B64\u5FEB\u7167\u4EC5\u5305\u542B\u5DF2\u6355\u83B7\u7684\u6587\u4EF6\u3002",
  currentSelection: "\u5F53\u524D\u6587\u4EF6",
  oldSide: "\u65E7\u884C\u53F7",
  newSide: "\u65B0\u884C\u53F7",
  noSelectedIssues: "\u9009\u62E9\u95EE\u9898\u540E\u5373\u53EF\u51C6\u5907\u4FEE\u590D\u3002",
  reviewRequest: "\u8BF7\u4F7F\u7528\u4EE5\u4E0B\u7CBE\u786E\u53C2\u6570\u8C03\u7528 dsh_x_code_review\uFF0C\u4FDD\u7559\u5B98\u65B9\u6388\u6743\u6D41\u7A0B\uFF0C\u5E76\u8FD4\u56DE\u5B8C\u6574\u7684\u7ED3\u6784\u5316\u5BA1\u67E5\u7ED3\u679C\uFF1A",
  repairRequest: "\u8BF7\u4F7F\u7528\u4EE5\u4E0B\u7CBE\u786E\u53C2\u6570\u8C03\u7528 dsh_x_code_repair\uFF0C\u4EC5\u4FEE\u590D\u6240\u9009\u95EE\u9898\uFF0C\u4FDD\u7559\u539F\u751F\u6388\u6743\u68C0\u67E5\uFF0C\u5E76\u5982\u5B9E\u62A5\u544A\u9A8C\u8BC1\u7ED3\u679C\uFF1A",
  inspectRequest: "\u8BF7\u4F7F\u7528 {} \u8C03\u7528 dsh_x_agents_inspect \u68C0\u67E5\u5DF2\u914D\u7F6E\u7684 Agent\uFF0C\u4E0D\u8981\u5B89\u88C5\u8F6F\u4EF6\u6216\u66F4\u6539\u8BA4\u8BC1\u8BBE\u7F6E\u3002",
  modelsRequest: "\u8BF7\u4F7F\u7528\u4EE5\u4E0B\u7CBE\u786E\u53C2\u6570\u8C03\u7528 dsh_x_agents_models\uFF0C\u5E76\u4FDD\u7559\u5B98\u65B9\u6388\u6743\u6D41\u7A0B\uFF1A",
  continueRequest: "\u8BF7\u4F7F\u7528\u4EE5\u4E0B\u7CBE\u786E\u53C2\u6570\u8C03\u7528 dsh_x_agents_run\uFF0C\u5E76\u4FDD\u7559\u5B98\u65B9\u6388\u6743\u6D41\u7A0B\uFF1A",
  historical: "\u5DF2\u8BB0\u5F55\u7684\u7ED3\u679C",
  viewWorkbench: "\u6253\u5F00 Code",
  toolRunning: "Code \u64CD\u4F5C\u8FDB\u884C\u4E2D",
  toolFailed: "Code \u64CD\u4F5C\u672A\u5B8C\u6210",
  toolUnknown: "\u6B64\u8BB0\u5F55\u6CA1\u6709\u53D7\u652F\u6301\u7684\u7ED3\u6784\u5316\u7ED3\u679C\u3002"
};
var messageKey = (code) => {
  code = String(code ?? "").toLowerCase();
  const specific = { code_git: "gitUnavailable", code_base: "invalidBase", code_head: "noHead", code_policy: "policyUnavailable", code_boundary: "boundaryBlocked", code_incomplete: "incompleteManifest" };
  if (specific[String(code)]) return specific[String(code)];
  if (/not-git|not-repository|repository-not-found/.test(String(code ?? ""))) return "noRepository";
  if (/stale|workspace-changed/.test(String(code ?? ""))) return "fileChanged";
  if (/invalid/.test(String(code ?? ""))) return "invalidState";
  return "unavailable";
};

// src/client/components.tsx
function CodeIcon() {
  return /* @__PURE__ */ import_react2.default.createElement("svg", { viewBox: "0 0 24 24", width: "20", height: "20", fill: "none", stroke: "currentColor", strokeWidth: "1.7", "aria-hidden": "true" }, /* @__PURE__ */ import_react2.default.createElement("path", { d: "m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18", strokeLinecap: "round", strokeLinejoin: "round" }));
}
function CodeEntry({ open, t }) {
  return /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-dock" }, /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", className: "dxc-entry", onClick: open, title: t("open") }, /* @__PURE__ */ import_react2.default.createElement("span", { className: "dxc-entry-icon", "aria-hidden": "true" }, /* @__PURE__ */ import_react2.default.createElement(CodeIcon, null)), /* @__PURE__ */ import_react2.default.createElement("span", { className: "dxc-entry-label" }, t("title")), /* @__PURE__ */ import_react2.default.createElement("span", { className: "dxc-entry-go", "aria-hidden": "true" }, /* @__PURE__ */ import_react2.default.createElement("svg", { viewBox: "0 0 24 24", width: "14", height: "14", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ import_react2.default.createElement("path", { d: "m9 6 6 6-6 6", strokeLinecap: "round", strokeLinejoin: "round" })))));
}
function CodePanel({ renderSlot }) {
  return renderSlot("dsh-x-code.workspace", {});
}
var STATUS_MARKS = { added: "A", deleted: "D", renamed: "R", untracked: "U", conflicted: "!" };
var indent = (depth) => ({ paddingInlineStart: 8 + depth * 12 });
function FileRow({ file, path, selected, select, open, t, limit, reviewed, depth }) {
  return /* @__PURE__ */ import_react2.default.createElement("li", { className: "dxc-file-row", style: indent(depth), "data-selected": path === file.path || void 0 }, !reviewed && /* @__PURE__ */ import_react2.default.createElement("input", { type: "checkbox", "aria-label": t("selectFile", { path: file.path }), checked: selected.includes(file.path), disabled: !file.selectable || !selected.includes(file.path) && selected.length >= limit, onChange: () => select(file.path) }), /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", className: "dxc-file", "aria-current": path === file.path ? "true" : void 0, "aria-label": t("openFile", { path: file.path }), title: file.path, onClick: () => open(file.path) }, /* @__PURE__ */ import_react2.default.createElement("span", { className: "dxc-file-name" }, basename(file.path)), /* @__PURE__ */ import_react2.default.createElement("span", { className: `dxc-file-status dxc-status-${file.status}`, title: t(Object.hasOwn(en, `file.${file.status}`) ? `file.${file.status}` : "file.modified") }, isChanged(file) ? STATUS_MARKS[file.status] ?? "M" : "")));
}
function TreeBranch({ node, depth, ...rest }) {
  if (!node.directories.length && !node.files.length) return null;
  return /* @__PURE__ */ import_react2.default.createElement("li", { className: "dxc-branch" }, /* @__PURE__ */ import_react2.default.createElement("details", { className: "dxc-directory", open: true }, /* @__PURE__ */ import_react2.default.createElement("summary", { title: node.path, "aria-label": node.path, style: indent(depth) }, /* @__PURE__ */ import_react2.default.createElement("span", { className: "dxc-disclosure", "aria-hidden": "true" }, "\u25B8"), /* @__PURE__ */ import_react2.default.createElement("span", { className: "dxc-dir-name" }, node.name)), /* @__PURE__ */ import_react2.default.createElement("ul", { className: "dxc-children" }, node.directories.map((child) => /* @__PURE__ */ import_react2.default.createElement(TreeBranch, { key: child.path, node: child, depth: depth + 1, ...rest })), node.files.map((file) => /* @__PURE__ */ import_react2.default.createElement(FileRow, { key: file.path, file, depth: depth + 1, ...rest })))));
}
function FileNavigator({ files, path, selected, select, open, t, limit, snapshot, reviewed }) {
  const [filter, setFilter] = (0, import_react2.useState)("changed"), [query, setQuery] = (0, import_react2.useState)("");
  const tree = (0, import_react2.useMemo)(() => fileTree(files, query, reviewed ? "all" : filter), [files, query, filter, reviewed]);
  const rows = { path, selected, select, open, t, limit, reviewed };
  return /* @__PURE__ */ import_react2.default.createElement("aside", { className: "dxc-files", "aria-label": t("files") }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-section-title" }, /* @__PURE__ */ import_react2.default.createElement("strong", null, t("files")), /* @__PURE__ */ import_react2.default.createElement("span", null, t("fileCount", { count: files.length }))), !reviewed && /* @__PURE__ */ import_react2.default.createElement(Tabs, { label: t("files"), value: filter, onChange: setFilter, items: [{ value: "changed", label: t("changed") }, { value: "all", label: t("all") }] }), /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-file-search" }, /* @__PURE__ */ import_react2.default.createElement("span", { "aria-hidden": "true" }, "\u2315"), /* @__PURE__ */ import_react2.default.createElement("input", { type: "search", value: query, onChange: (event) => setQuery(event.target.value), placeholder: t("searchFiles"), "aria-label": t("fileSearchLabel") })), /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-file-list" }, tree.directories.length || tree.files.length ? /* @__PURE__ */ import_react2.default.createElement("ul", { className: "dxc-tree" }, tree.directories.map((node) => /* @__PURE__ */ import_react2.default.createElement(TreeBranch, { key: node.path, node, depth: 0, ...rows })), tree.files.map((file) => /* @__PURE__ */ import_react2.default.createElement(FileRow, { key: file.path, file, depth: 0, ...rows }))) : /* @__PURE__ */ import_react2.default.createElement("p", { className: "dxc-state" }, t(filter === "changed" && !query && !reviewed ? "noChanges" : "noFiles"))), /* @__PURE__ */ import_react2.default.createElement("footer", { className: "dxc-file-footer" }, reviewed ? /* @__PURE__ */ import_react2.default.createElement("span", null, t("reviewedOnly")) : /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("span", null, t("selection", { count: selected.length })), /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", onClick: () => select(selected.length ? null : "all") }, t(selected.length ? "clearSelection" : "selectChanged"))), snapshot.truncated && /* @__PURE__ */ import_react2.default.createElement("p", { className: "dxc-inline-warning" }, t("partialFiles"))));
}
function FindingCard({ finding, jump, t }) {
  return /* @__PURE__ */ import_react2.default.createElement("article", { className: "dxc-finding", "data-severity": finding.severity }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-finding-top" }, /* @__PURE__ */ import_react2.default.createElement("span", { className: `dxc-severity dxc-severity-${finding.severity}` }, t(`severity.${finding.severity}`)), /* @__PURE__ */ import_react2.default.createElement("span", { className: "dxc-finding-id" }, finding.id.slice(0, 7))), /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", className: "dxc-finding-title", onClick: jump }, finding.title), /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", className: "dxc-location", title: finding.path, "aria-label": t("findingLocation", { path: finding.path, line: finding.startLine }), onClick: jump }, basename(finding.path), /* @__PURE__ */ import_react2.default.createElement("span", null, ":", finding.startLine, finding.endLine !== finding.startLine ? `\u2013${finding.endLine}` : "")), /* @__PURE__ */ import_react2.default.createElement("p", { className: "dxc-finding-body" }, finding.body), (finding.evidence || finding.trigger) && /* @__PURE__ */ import_react2.default.createElement("details", null, /* @__PURE__ */ import_react2.default.createElement("summary", null, t("details")), finding.evidence && /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("span", { className: "dxc-detail-label" }, t("evidence")), /* @__PURE__ */ import_react2.default.createElement("pre", null, finding.evidence)), finding.trigger && /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("span", { className: "dxc-detail-label" }, t("trigger")), /* @__PURE__ */ import_react2.default.createElement("p", null, finding.trigger))));
}
function Findings({ review, history, historyId, inspectHistory, historyStatus, jump, rereview, enabled, canRereview, t, formatTime }) {
  const [severity, setSeverity] = (0, import_react2.useState)("all");
  const filtered = review?.findings.filter((finding) => severity === "all" || finding.severity === severity) ?? [];
  const complete = isComplete(review);
  return /* @__PURE__ */ import_react2.default.createElement("aside", { className: "dxc-findings", "aria-label": t("findings") }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-section-title" }, /* @__PURE__ */ import_react2.default.createElement("strong", null, t("findings")), review && /* @__PURE__ */ import_react2.default.createElement("span", null, review.findings.length)), !review && historyId ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-state", role: historyStatus === "failed" ? "alert" : "status" }, /* @__PURE__ */ import_react2.default.createElement("p", null, t(historyStatus === "failed" ? "historyFailed" : "historyLoading")), historyStatus === "failed" && /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", onClick: () => inspectHistory(historyId) }, t("retry"))) : !review ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-empty dxc-findings-empty" }, /* @__PURE__ */ import_react2.default.createElement("span", { "aria-hidden": "true" }, "\u25CE"), /* @__PURE__ */ import_react2.default.createElement("strong", null, t("noReview")), /* @__PURE__ */ import_react2.default.createElement("p", null, t("noReviewHint"))) : /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-review-summary" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-review-state", role: "status" }, /* @__PURE__ */ import_react2.default.createElement("span", { className: `dxc-state-dot dxc-review-${review.state}` }), /* @__PURE__ */ import_react2.default.createElement("strong", null, t(Object.hasOwn(en, `state.${review.state}`) ? `state.${review.state}` : "incomplete"))), /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-muted" }, t("coverage", { count: review.paths?.length ?? 0 }), " \xB7 ", shortHash(review.snapshotId)), review.createdAt && /* @__PURE__ */ import_react2.default.createElement("time", { className: "dxc-muted" }, formatTime(review.createdAt)), review.summary && /* @__PURE__ */ import_react2.default.createElement("details", null, /* @__PURE__ */ import_react2.default.createElement("summary", null, t("summary")), /* @__PURE__ */ import_react2.default.createElement("p", null, review.summary))), review.stale && /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-notice dxc-warning" }, /* @__PURE__ */ import_react2.default.createElement("strong", null, t("stale")), /* @__PURE__ */ import_react2.default.createElement("p", null, t("staleHint"))), !complete && !activeReview(review) && /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-notice dxc-warning" }, /* @__PURE__ */ import_react2.default.createElement("strong", null, t("incomplete")), /* @__PURE__ */ import_react2.default.createElement("p", null, t("incompleteHint")), review.reason && /* @__PURE__ */ import_react2.default.createElement("details", null, /* @__PURE__ */ import_react2.default.createElement("summary", null, t("details")), /* @__PURE__ */ import_react2.default.createElement("p", null, review.reason))), review.findings.length > 0 && /* @__PURE__ */ import_react2.default.createElement("select", { className: "dxc-severity-filter", value: severity, "aria-label": t("allFindings"), onChange: (event) => setSeverity(event.target.value) }, /* @__PURE__ */ import_react2.default.createElement("option", { value: "all" }, t("allFindings")), SEVERITIES.map((item) => /* @__PURE__ */ import_react2.default.createElement("option", { key: item, value: item }, t(`severity.${item}`), " (", review.findings.filter((finding) => finding.severity === item).length, ")"))), /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-findings-list" }, filtered.map((finding) => /* @__PURE__ */ import_react2.default.createElement(FindingCard, { key: finding.id, finding, jump: () => jump(finding), t })), complete && review.findings.length === 0 && /* @__PURE__ */ import_react2.default.createElement("p", { className: "dxc-no-findings" }, t("noFindings"))), /* @__PURE__ */ import_react2.default.createElement("section", { className: "dxc-checks" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-section-title" }, /* @__PURE__ */ import_react2.default.createElement("strong", null, t("checks"))), review.checks?.length ? /* @__PURE__ */ import_react2.default.createElement("ul", null, review.checks.map((check, at) => /* @__PURE__ */ import_react2.default.createElement("li", { key: at }, /* @__PURE__ */ import_react2.default.createElement("span", null, check.name ?? check.command ?? t("checks")), /* @__PURE__ */ import_react2.default.createElement("span", { className: check.status === "failed" ? "dxc-warning" : "dxc-muted" }, t(check.status === "passed" && check.verified !== true ? "check.unknown" : Object.hasOwn(en, `check.${check.status}`) ? `check.${check.status}` : "check.unknown")), check.evidence && /* @__PURE__ */ import_react2.default.createElement("details", null, /* @__PURE__ */ import_react2.default.createElement("summary", null, t("evidence")), /* @__PURE__ */ import_react2.default.createElement("pre", null, check.evidence))))) : /* @__PURE__ */ import_react2.default.createElement("p", { className: "dxc-muted" }, t("noChecks"))), /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-findings-actions" }, complete && /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", disabled: !enabled || !canRereview, onClick: rereview }, t("rereview"))), !canRereview && complete && /* @__PURE__ */ import_react2.default.createElement("p", { className: "dxc-muted" }, t("worktreeFirst"))), history?.length > 0 && /* @__PURE__ */ import_react2.default.createElement("details", { className: "dxc-history" }, /* @__PURE__ */ import_react2.default.createElement("summary", null, t("history"), " (", history.length, ")"), /* @__PURE__ */ import_react2.default.createElement("ol", null, [...history].reverse().map((item) => /* @__PURE__ */ import_react2.default.createElement("li", { key: item.id }, /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", className: "dxc-history-item", "aria-pressed": historyId === item.id, onClick: () => inspectHistory(item.id) }, /* @__PURE__ */ import_react2.default.createElement("time", null, formatTime(item.createdAt)), /* @__PURE__ */ import_react2.default.createElement("span", null, t("openFindings", { count: item.findings }), " \xB7 ", shortHash(item.snapshotId))))))));
}
function CodeWorkspace({ sessionId, useCode, inputActions, refresh, selectTarget, loadFile, clearFile, loadReview, cancel, back, t, formatTime }) {
  const state = useCode((value) => value), snapshot = state.snapshot;
  const page = (0, import_react2.useRef)(null), [layout, setLayout] = (0, import_react2.useState)("wide");
  (0, import_react2.useEffect)(() => {
    if (!globalThis.ResizeObserver || !page.current) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      setLayout(width < 650 ? "narrow" : width <= 1100 ? "medium" : "wide");
    });
    observer.observe(page.current);
    return () => observer.disconnect();
  }, []);
  const [path, setPath] = (0, import_react2.useState)(null), [selected, setSelected] = (0, import_react2.useState)([]);
  const [context, setContext] = (0, import_react2.useState)("current"), [pane, setPane] = (0, import_react2.useState)("files"), [notice, setNotice] = (0, import_react2.useState)(null), [focus, setFocus] = (0, import_react2.useState)(null);
  const [base, setBase] = (0, import_react2.useState)(snapshot?.workspace.baseRef ?? "main"), [mode, setMode] = (0, import_react2.useState)(snapshot?.workspace.mode ?? "worktree");
  const scrollPositions = (0, import_react2.useRef)(/* @__PURE__ */ new Map()), previousWorkspace = (0, import_react2.useRef)(null), previousReview = (0, import_react2.useRef)(void 0), rereviewId = (0, import_react2.useRef)(null);
  const live = state.status === "live", historyId = state.historyId, review = historyId ? state.inspectedReview : snapshot?.review;
  const maxFiles = snapshot?.limits.maxSelectedFiles ?? 20;
  const files = context === "review" && review && snapshot ? snapshot.files.filter((file) => review.paths.includes(file.path)).concat(review.paths.filter((item) => !snapshot.files.some((file) => file.path === item)).map((path2) => ({ path: path2, status: "modified", changed: true, selectable: false }))) : snapshot?.files ?? [];
  const currentFile = files.find((file) => file.path === path);
  const effectivePath = currentFile?.path ?? null;
  const request = (0, import_react2.useMemo)(() => snapshot && effectivePath ? { scope: snapshot.scope, workspaceId: snapshot.workspace.id, path: effectivePath, mode: snapshot.workspace.mode, ...snapshot.workspace.mode === "range" ? { base: snapshot.workspace.baseRef ?? snapshot.workspace.base } : {}, ...context === "review" && review ? { reviewId: review.id } : {} } : null, [snapshot?.scope, snapshot?.workspace.id, snapshot?.workspace.mode, snapshot?.workspace.baseRef, effectivePath, context, review?.id]);
  const fileKey = request ? JSON.stringify(request) : null;
  const fileMatches = fileKey && state.fileKey === fileKey;
  const identity = `${snapshot?.scope}:${context === "review" ? review?.snapshotId : snapshot?.workspace.id}:${effectivePath}`;
  const reviewAvailable = Boolean(snapshot?.dshAvailable);
  const operation = snapshot?.operation;
  const canStop = Boolean(operation?.id);
  const running = Boolean(operation) || activeReview(snapshot?.review);
  (0, import_react2.useEffect)(() => {
    if (!request) {
      clearFile();
      return;
    }
    loadFile(request);
  }, [fileKey, state.fileStatus === "idle"]);
  (0, import_react2.useEffect)(() => {
    if (!snapshot) return;
    setMode(snapshot.workspace.mode);
    if (snapshot.workspace.mode === "range") setBase(snapshot.workspace.baseRef ?? "main");
    if (previousWorkspace.current && previousWorkspace.current !== snapshot.workspace.id) {
      setSelected((value) => value.filter((path2) => snapshot.files.some((file) => file.path === path2 && file.selectable)));
      setNotice(null);
    }
    previousWorkspace.current = snapshot.workspace.id;
    if (previousReview.current !== review?.id) {
      setFocus(null);
      previousReview.current = review?.id;
    }
  }, [snapshot?.workspace.id, review?.id]);
  const changeScope = (value, baseValue = base) => {
    setMode(value);
    setPath(null);
    setSelected([]);
    setFocus(null);
    setContext("current");
    setNotice(null);
    clearFile();
    loadReview(null);
    selectTarget(value, value === "range" ? baseValue : void 0);
  };
  const inspectHistory = (id) => {
    setContext("review");
    setPath(null);
    setFocus(null);
    setPane("findings");
    clearFile();
    loadReview(id);
  };
  const latest = () => {
    setPath(null);
    setFocus(null);
    loadReview(null);
  };
  const openFile = (next) => {
    setPath(next);
    setPane("code");
    setFocus(null);
  };
  const put = (text2) => {
    try {
      if (!insertRequest(inputActions, text2)) {
        setNotice("draftChanged");
        return;
      }
      setNotice(null);
      back();
    } catch {
      setNotice("insertionUnconfirmed");
    }
  };
  const prepare = (kind) => {
    try {
      if (!snapshot) throw new Error("unavailable");
      if (kind === "rereview" && (review?.mode !== "worktree" || snapshot.workspace.mode !== "worktree")) throw new Error("worktreeFirst");
      const paths = kind === "rereview" ? review.paths : selected;
      const args = reviewRequest(snapshot, { paths, ...kind === "rereview" ? { previousReviewId: rereviewId.current ?? review.id } : {} });
      put(`${t("reviewRequest")}
${JSON.stringify(args, null, 2)}`);
    } catch (error) {
      setNotice(error instanceof Error && Object.hasOwn(en, error.message) ? error.message : "unavailable");
    }
  };
  const beginReview = (kind) => {
    if (kind === "rereview") {
      rereviewId.current = review.id;
      setContext("current");
      setSelected([...review.paths]);
      setFocus(null);
    }
    prepare(kind);
  };
  const toggleFile = (next) => {
    if (next === null) {
      setSelected([]);
      return;
    }
    if (next === "all") {
      const changed = snapshot.files.filter((file) => isChanged(file) && file.selectable).map((file) => file.path);
      if (changed.length > maxFiles) {
        setNotice("selectionLimit");
        return;
      }
      setSelected(changed);
      return;
    }
    setSelected((value) => value.includes(next) ? value.filter((path2) => path2 !== next) : value.length < maxFiles ? [...value, next] : value);
  };
  const jump = (finding) => {
    setContext("review");
    setPath(finding.path);
    setPane(layout === "narrow" ? "code" : "findings");
    setFocus({ side: finding.side === "before" ? "old" : "new", startLine: finding.startLine, endLine: finding.endLine ?? finding.startLine, findingId: finding.id });
  };
  if (!sessionId) return /* @__PURE__ */ import_react2.default.createElement("main", { className: "dxc dxc-page" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-empty" }, /* @__PURE__ */ import_react2.default.createElement(CodeIcon, null), /* @__PURE__ */ import_react2.default.createElement("h1", null, t("title")), /* @__PURE__ */ import_react2.default.createElement("p", null, t("noSession")), /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", onClick: back }, t("openConversation"))));
  return /* @__PURE__ */ import_react2.default.createElement("main", { className: "dxc dxc-page", ref: page, "data-code-session": sessionId, "data-pane": pane }, /* @__PURE__ */ import_react2.default.createElement("header", { className: "dxc-header" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-brand" }, /* @__PURE__ */ import_react2.default.createElement(CodeIcon, null), /* @__PURE__ */ import_react2.default.createElement("h1", null, t("title")), snapshot && /* @__PURE__ */ import_react2.default.createElement("span", { className: "dxc-repo", title: snapshot.workspace.repoRoot }, basename(snapshot.workspace.repoRoot))), /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-header-actions" }, /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", onClick: back }, t("back")), /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", onClick: () => {
    clearFile();
    refresh();
  } }, t("refresh")), /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", className: "dxc-primary", disabled: !live || !selected.length || !reviewAvailable || running || snapshot?.truncated || snapshot?.complete === false, onClick: () => beginReview("review") }, t("review"), /* @__PURE__ */ import_react2.default.createElement("span", { className: "dxc-count" }, selected.length)))), /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-toolbar" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-scope" }, /* @__PURE__ */ import_react2.default.createElement("label", { htmlFor: `code-scope-${sessionId}` }, t("scope")), /* @__PURE__ */ import_react2.default.createElement("select", { id: `code-scope-${sessionId}`, value: mode, onChange: (event) => changeScope(event.target.value) }, /* @__PURE__ */ import_react2.default.createElement("option", { value: "worktree" }, t("mode.worktree")), /* @__PURE__ */ import_react2.default.createElement("option", { value: "staged" }, t("mode.staged")), /* @__PURE__ */ import_react2.default.createElement("option", { value: "range" }, t("mode.range"))), mode === "range" && /* @__PURE__ */ import_react2.default.createElement("form", { onSubmit: (event) => {
    event.preventDefault();
    changeScope("range", base);
  } }, /* @__PURE__ */ import_react2.default.createElement("input", { "aria-label": t("base"), value: base, placeholder: t("basePlaceholder"), onChange: (event) => setBase(event.target.value), maxLength: 160 }), /* @__PURE__ */ import_react2.default.createElement("button", { type: "submit", disabled: !base.trim() }, t("applyBase")))), review && /* @__PURE__ */ import_react2.default.createElement("select", { "aria-label": t("context"), value: context, onChange: (event) => {
    setContext(event.target.value);
    setFocus(null);
    clearFile();
  } }, /* @__PURE__ */ import_react2.default.createElement("option", { value: "current" }, t("current")), /* @__PURE__ */ import_react2.default.createElement("option", { value: "review" }, t("reviewed"), " \xB7 ", shortHash(review.snapshotId)))), historyId && /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-banner dxc-history-banner" }, /* @__PURE__ */ import_react2.default.createElement("span", null, t("viewingHistory"), " \xB7 ", shortHash(review?.snapshotId)), /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", onClick: latest }, t("latestReview"))), !live && snapshot && /* @__PURE__ */ import_react2.default.createElement("p", { className: "dxc-banner dxc-warning", role: "alert" }, t("disconnected")), notice && /* @__PURE__ */ import_react2.default.createElement("p", { className: "dxc-banner dxc-warning", role: "alert" }, t(notice, { count: maxFiles }), /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", "aria-label": t("close"), onClick: () => setNotice(null) }, "\xD7")), running && /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-banner dxc-running", role: "status" }, /* @__PURE__ */ import_react2.default.createElement("span", { className: "dxc-state-dot" }), /* @__PURE__ */ import_react2.default.createElement("span", null, t(operation && Object.hasOwn(en, `stage.${operation.state}`) ? `stage.${operation.state}` : "state.running")), /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", onClick: back }, t("openConversation")), canStop && /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", disabled: !live || state.pending || operation?.state === "cancelling", onClick: async () => {
    const result = await cancel();
    if (!result.ok) setNotice("cancelUnconfirmed");
  } }, t(state.pending || operation?.state === "cancelling" ? "stopping" : "stop"))), snapshot && !reviewAvailable && /* @__PURE__ */ import_react2.default.createElement("p", { className: "dxc-banner" }, t("reviewerMissing")), !snapshot ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-empty", role: state.status === "failed" ? "alert" : "status" }, /* @__PURE__ */ import_react2.default.createElement(CodeIcon, null), /* @__PURE__ */ import_react2.default.createElement("p", null, t(state.status === "failed" ? messageKey(state.error?.code) : "loading")), state.status === "failed" && /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", onClick: refresh }, t("retry"))) : /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement(Tabs, { className: "dxc-mobile-tabs", label: t("title"), value: layout === "medium" && pane === "code" ? "files" : pane, onChange: setPane, items: [{ value: "files", label: t("files") }, ...layout === "medium" ? [] : [{ value: "code", label: t("code") }], { value: "findings", label: `${t("findings")}${review?.findings.length ? ` \xB7 ${review.findings.length}` : ""}` }] }), /* @__PURE__ */ import_react2.default.createElement("div", { className: "dxc-workbench" }, /* @__PURE__ */ import_react2.default.createElement(FileNavigator, { files, path: effectivePath, selected, select: toggleFile, open: openFile, t, limit: maxFiles, snapshot, reviewed: context === "review" }), /* @__PURE__ */ import_react2.default.createElement(CodeViewer, { file: fileMatches ? state.file : null, status: fileMatches ? state.fileStatus : effectivePath ? "loading" : "idle", error: fileMatches ? state.fileError : null, path: effectivePath, identity, mode: snapshot.workspace.mode, context, focus, retry: () => {
    clearFile();
    if (request) loadFile(request);
  }, scrollPositions, t }), /* @__PURE__ */ import_react2.default.createElement(Findings, { review, history: snapshot.history, historyId, inspectHistory, historyStatus: state.historyStatus, jump, rereview: () => beginReview("rereview"), enabled: live && !running && !historyId, canRereview: review?.mode === "worktree" && snapshot.workspace.mode === "worktree", t, formatTime }))));
}
function CodeToolRow({ phase, block, open, t }) {
  const meta = block?.meta, valid = meta?.kind === "dsh-x-code.result" && meta.version === 1;
  const review = valid ? meta.review : null;
  return /* @__PURE__ */ import_react2.default.createElement("section", { className: "dxc dxc-tool" }, /* @__PURE__ */ import_react2.default.createElement("header", null, /* @__PURE__ */ import_react2.default.createElement(CodeIcon, null), /* @__PURE__ */ import_react2.default.createElement("strong", null, t("title")), /* @__PURE__ */ import_react2.default.createElement("span", null, t(phase !== "result" ? "toolRunning" : block?.isError ? "toolFailed" : "historical"))), phase === "result" && /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, review ? /* @__PURE__ */ import_react2.default.createElement("p", null, t(isComplete(review) ? "openFindings" : "incomplete", { count: review.findings?.length ?? 0 }), review.stale ? ` \xB7 ${t("stale")}` : "") : /* @__PURE__ */ import_react2.default.createElement("p", null, t(valid ? "historical" : "toolUnknown")), /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", onClick: open }, t("viewWorkbench"))));
}

// src/client/styles.ts
var CSS = `
.dxc{--code-bg:var(--dsw-alias-bg-layer-1,#fff);--code-soft:var(--dsw-alias-bg-layer-2,#f5f6f8);--code-line:var(--dsw-alias-border-l2,#e2e5e9);--code-fg:var(--dsw-alias-label-primary,#20252e);--code-muted:var(--dsw-alias-label-secondary,#717885);--code-accent:var(--dsw-alias-brand-primary,#4666d5);--code-warning:var(--dsw-alias-state-warn-primary,#9b6815);color:var(--code-fg);font:13px/1.5 system-ui,sans-serif;box-sizing:border-box}.dxc *{box-sizing:border-box;min-width:0}.dxc-page{height:100%;min-height:0;width:100%;max-width:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--code-bg);container-type:inline-size}.dxc h1,.dxc h2,.dxc p{margin:0}.dxc button,.dxc input,.dxc select{font:inherit;color:inherit}.dxc button,.dxc select,.dxc input[type=search],.dxc input:not([type]){border:1px solid var(--code-line);border-radius:6px;background:var(--code-bg)}.dxc button{cursor:pointer;padding:5px 9px;line-height:1.45;white-space:nowrap}.dxc button:hover:not(:disabled){background:var(--code-soft)}.dxc button:disabled,.dxc input:disabled,.dxc select:disabled{opacity:.45;cursor:not-allowed}.dxc :is(button,input,select,summary,[tabindex]):focus-visible{outline:2px solid var(--code-accent);outline-offset:2px}.dxc input[type=checkbox]{width:14px;height:14px;flex:none;margin:0;accent-color:var(--code-accent)}.dxc input[type=search],.dxc input:not([type]),.dxc select{padding:5px 8px}.dxc select{max-width:100%}.dxc .dxc-primary{background:var(--code-accent);border-color:var(--code-accent);color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:550}.dxc .dxc-primary:hover:not(:disabled){background:color-mix(in srgb,var(--code-accent) 90%,#000)}.dxc-muted{color:var(--code-muted);font-size:11px}.dxc-warning{color:var(--code-warning)}.dxc-inline-warning{background:color-mix(in srgb,var(--code-warning) 8%,var(--code-bg));color:var(--code-warning);padding:8px 12px;font:12px/1.5 system-ui,sans-serif;white-space:normal}.dxc details summary{cursor:pointer;color:var(--code-muted);font-size:11px}.dxc pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;margin:6px 0}.dxc details p{font-size:12px;margin:7px 0;white-space:pre-wrap;overflow-wrap:anywhere}
.dxc-header{padding:18px 20px 14px;padding-inline-start:max(20px,var(--dsh-frame-leading-clearance,0px));display:flex;gap:14px;align-items:center;justify-content:space-between;flex:none}.dxc-brand{display:flex;align-items:center;gap:9px;min-width:0}.dxc-brand svg{color:var(--code-accent);flex:none}.dxc-brand h1{font-size:18px;font-weight:650;letter-spacing:-.5px}.dxc-repo{color:var(--code-muted);font-size:12px;margin-left:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dxc-header-actions{display:flex;gap:7px;align-items:center;flex:none}.dxc-count{display:inline-block;background:color-mix(in srgb,var(--dsw-alias-label-primary-foreground,#fff) 15%,transparent);border-radius:4px;margin-left:7px;padding:0 5px;font-size:11px}.dxc-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 20px 13px;border-bottom:1px solid var(--code-line);flex-wrap:wrap;flex:none}.dxc-scope{display:flex;gap:7px;align-items:center}.dxc-scope label{color:var(--code-muted);font-size:11px}.dxc-scope form{display:flex;gap:5px}.dxc-scope input{width:145px}.dxc-banner{display:flex;align-items:center;gap:9px;padding:9px 20px;border-bottom:1px solid var(--code-line);background:var(--code-soft);font-size:12px;flex:none;flex-wrap:wrap}.dxc-banner>button:last-child{margin-left:auto}.dxc-banner button{font-size:11px;padding:3px 7px}.dxc-running{color:var(--code-accent)}.dxc-state-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--code-accent);flex:none}.dxc-review-failed,.dxc-review-interrupted,.dxc-review-blocked{background:var(--code-warning)}
.dxc-workbench{display:grid;grid-template-columns:minmax(160px,205px) minmax(270px,1fr) minmax(250px,300px);flex:1;min-height:0;overflow:hidden}.dxc-files{border-right:1px solid var(--code-line);display:flex;flex-direction:column;overflow:hidden;min-height:0;padding-top:14px;background:color-mix(in srgb,var(--code-soft) 35%,var(--code-bg))}.dxc-section-title{display:flex;align-items:center;justify-content:space-between;gap:7px;padding:0 14px;font-size:12px}.dxc-section-title>span{color:var(--code-muted);font-size:11px;font-variant-numeric:tabular-nums}.dxc-files>.dxc-tabs{margin:10px 12px 0}.dxc-tabs{display:flex;gap:2px;background:var(--code-soft);padding:2px;border-radius:6px;width:max-content;max-width:100%}.dxc-tabs button{border:none;background:transparent;font-size:11px;padding:4px 10px;color:var(--code-muted);border-radius:4px}.dxc-tabs button[aria-selected=true]{background:var(--code-bg);color:var(--code-fg);box-shadow:0 1px 3px #0000000b}.dxc-file-search{display:flex;align-items:center;gap:5px;margin:12px;border:1px solid var(--code-line);background:var(--code-bg);border-radius:6px;padding:0 7px}.dxc-file-search>span{color:var(--code-muted);font-size:17px}.dxc-file-search input[type=search]{border:0;background:transparent;width:100%;padding:6px 0;font-size:11px;outline-offset:5px}.dxc-file-list{flex:1;overflow:auto;padding:0 5px 12px}.dxc-tree,.dxc-children{padding:0;margin:0;list-style:none}.dxc-branch,.dxc-file-row{list-style:none}.dxc-directory{margin:1px 0}.dxc-directory>summary{display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:5px;overflow:hidden;white-space:nowrap;list-style:none;font-size:11px;cursor:pointer}.dxc-directory>summary::-webkit-details-marker{display:none}.dxc-directory>summary:hover{background:var(--code-soft)}.dxc-disclosure{display:inline-block;flex:none;font-size:9px;color:var(--code-muted);transition:transform .12s}.dxc-directory[open]>summary .dxc-disclosure{transform:rotate(90deg)}.dxc-dir-name{overflow:hidden;text-overflow:ellipsis;font-size:11px;letter-spacing:.01em;color:var(--code-muted)}.dxc-file-row{display:flex;align-items:center;gap:6px;border-radius:5px;margin:1px 0;padding-right:4px}.dxc-file-row[data-selected=true]{background:color-mix(in srgb,var(--code-accent) 9%,var(--code-bg))}.dxc-file-row[data-selected=true] .dxc-file-name{color:var(--code-accent);font-weight:550}.dxc-file{display:flex;align-items:center;gap:6px;width:100%;text-align:left;min-width:0;border:0!important;background:transparent!important;padding:5px 6px!important;font-size:12px!important}.dxc-file-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.dxc-file-status{font:10px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;min-width:10px;text-align:center;color:var(--code-muted)}.dxc-status-added,.dxc-status-untracked{color:#2b865c}.dxc-status-deleted{color:#bb5863}.dxc-status-modified{color:var(--code-warning)}.dxc-file-footer{padding:10px 12px;border-top:1px solid var(--code-line);font-size:10px;color:var(--code-muted);display:flex;align-items:center;justify-content:space-between;gap:5px;flex-wrap:wrap}.dxc-file-footer button{font-size:10px;padding:2px 5px;background:transparent;border-color:transparent}.dxc-file-footer>span{flex:1}
.dxc-viewer{display:flex;flex-direction:column;overflow:hidden;min-height:0;outline:none}.dxc-viewer-heading{display:flex;gap:12px;align-items:center;padding:13px 15px 8px;flex:none}.dxc-path{font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.dxc-readonly{font-size:9px;letter-spacing:.04em;color:var(--code-muted);border:1px solid var(--code-line);padding:1px 5px;border-radius:4px;flex:none}.dxc-viewer-controls{display:flex;justify-content:space-between;align-items:center;padding:0 12px 9px;gap:8px;flex-wrap:wrap;flex:none}.dxc-viewer-options{display:flex;gap:5px;align-items:center}.dxc-viewer-options button,.dxc-viewer-options select{font-size:10px;padding:4px 6px}.dxc-viewer-options select{max-width:150px}.dxc-viewer-options button[aria-pressed=true]{border-color:var(--code-accent);color:var(--code-accent);background:color-mix(in srgb,var(--code-accent) 6%,var(--code-bg))}.dxc-icon-button{min-width:27px}.dxc-version{display:flex;justify-content:space-between;gap:8px;padding:6px 15px;border-block:1px solid var(--code-line);font-size:10px;color:var(--code-muted);background:var(--code-soft);flex:none}.dxc-version span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.dxc-code-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding-bottom:35px;font:12px/1.8 ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-variant-ligatures:none;tab-size:2}.dxc-source-lines{padding-top:9px;min-width:max-content}.dxc-source-line{display:grid;grid-template-columns:48px minmax(0,1fr);min-height:22px;padding-right:16px}.dxc-line-number{font-size:10px;color:var(--code-muted);opacity:.8;text-align:right;padding:0 12px 0 6px;user-select:none;font-variant-numeric:tabular-nums}.dxc-line-text{white-space:pre;display:block;padding-right:12px}.dxc-line-text mark{background:#eecb6a66;color:inherit;border-radius:2px}.dxc-code-scroll[data-wrap=true] .dxc-line-text{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}.dxc-code-scroll[data-wrap=true] .dxc-source-lines{min-width:0}.dxc-code-scroll [data-focused=true]{background:color-mix(in srgb,var(--code-accent) 13%,var(--code-bg));box-shadow:inset 3px 0 var(--code-accent)}.dxc-code-scroll [data-find-active=true]{box-shadow:inset 0 0 0 1px #cda74880;background:color-mix(in srgb,#eecb6a 13%,var(--code-bg))}.dxc-hunk-header{font-size:10px;line-height:26px;white-space:nowrap;padding:0 12px;color:var(--code-muted);background:var(--code-soft);border-block:1px solid var(--code-line);position:sticky;left:0;overflow:hidden;text-overflow:ellipsis}.dxc-hunk+.dxc-hunk{margin-top:10px}.dxc-unified-row{display:grid;grid-template-columns:38px 38px 16px minmax(0,1fr);min-height:22px;min-width:max-content}.dxc-unified-row .dxc-line-number{padding:0 6px}.dxc-line-sign{text-align:center;color:var(--code-muted);user-select:none;font-size:11px}.dxc-line-add{background:color-mix(in srgb,#47a879 10%,var(--code-bg))}.dxc-line-del{background:color-mix(in srgb,#d16574 10%,var(--code-bg))}.dxc-line-add .dxc-line-sign{color:#2b865c}.dxc-line-del .dxc-line-sign{color:#bb5863}.dxc-line-empty{background:var(--code-soft)}.dxc-split-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.dxc-split-column{overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scrollbar-width:thin}.dxc-split-column:first-child{border-right:1px solid var(--code-line)}.dxc-split-column .dxc-diff-cell{min-width:max-content;overflow:visible;border:0;height:22px}.dxc-split-column .dxc-line-text{overflow:visible}.dxc-split-column .dxc-hunk-header{height:28px}.dxc-split-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.dxc-diff-cell{display:grid;grid-template-columns:36px 14px minmax(0,1fr);min-height:22px;overflow:hidden}.dxc-diff-cell .dxc-line-text{overflow:hidden}.dxc-diff-cell:first-child{border-right:1px solid var(--code-line)}.dxc-diff-cell .dxc-line-number{padding:0 5px}.dxc-code-scroll[data-wrap=true] .dxc-unified-row{min-width:0}.dxc-find{display:flex;align-items:center;gap:4px;padding:6px 12px;background:var(--code-soft);border-top:1px solid var(--code-line)}.dxc-find input{flex:1;width:50px}.dxc-find>span{font-size:10px;color:var(--code-muted);padding:0 4px;white-space:nowrap}.dxc-find button{font-size:12px;padding:2px 6px}.dxc-state{padding:20px 16px;font:12px/1.7 system-ui,sans-serif;color:var(--code-muted)}.dxc-state button{margin-top:10px}.dxc-empty{display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;padding:45px 20px;color:var(--code-muted);text-align:center;font-size:12px;flex:1}.dxc-empty>svg{width:28px;height:28px;margin-bottom:4px;opacity:.55}.dxc-empty>span{font:26px/1.5 ui-monospace,monospace;opacity:.45;margin-bottom:7px}.dxc-empty strong{font-weight:550;color:var(--code-fg)}.dxc-code-empty{height:100%;min-height:180px}.dxc-findings-empty{justify-content:flex-start;padding-top:50px;gap:7px}
.dxc-findings{border-left:1px solid var(--code-line);display:flex;flex-direction:column;overflow:auto;min-height:0;padding:14px 0 10px;background:color-mix(in srgb,var(--code-soft) 20%,var(--code-bg))}.dxc-review-summary{padding:13px 14px 11px;border-bottom:1px solid var(--code-line)}.dxc-review-state{display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:4px}.dxc-review-summary time{display:block;font-size:10px;margin-top:3px}.dxc-review-summary details{margin-top:8px}.dxc-notice{padding:10px 12px;margin:10px 12px 0;background:var(--code-soft);border:1px solid var(--code-line);border-radius:6px;font-size:11px}.dxc-notice p{margin-top:4px;line-height:1.55;color:var(--code-muted)}.dxc-notice.dxc-warning{border-color:color-mix(in srgb,var(--code-warning) 28%,var(--code-line));background:color-mix(in srgb,var(--code-warning) 5%,var(--code-bg))}.dxc-severity-filter{margin:12px 12px 3px;max-width:calc(100% - 24px)!important;font-size:11px!important}.dxc-findings-list{padding:0 12px}.dxc-finding{margin:10px 0;padding:12px;background:var(--code-bg);border:1px solid var(--code-line);border-radius:8px;box-shadow:0 2px 4px #00000002}.dxc-finding-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:7px}.dxc-finding-top label{display:flex;align-items:center;gap:7px}.dxc-finding-id{font:9px/1.5 ui-monospace,monospace;color:var(--code-muted)}.dxc-severity{font-size:9px;line-height:1.8;padding:0 6px;border-radius:4px;background:var(--code-soft);color:var(--code-muted);font-weight:600}.dxc-severity-critical,.dxc-severity-high{background:color-mix(in srgb,#c65a68 10%,var(--code-bg));color:#b64c5b}.dxc-severity-medium{background:color-mix(in srgb,var(--code-warning) 10%,var(--code-bg));color:var(--code-warning)}.dxc-severity-low{background:color-mix(in srgb,var(--code-accent) 9%,var(--code-bg));color:var(--code-accent)}.dxc-finding-title{display:block;text-align:left;border:0!important;background:transparent!important;padding:0!important;font-size:12px!important;line-height:1.55!important;font-weight:600;white-space:normal!important}.dxc-location{font:10px/1.5 ui-monospace,monospace!important;color:var(--code-accent)!important;border:0!important;background:transparent!important;padding:3px 0!important;display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis}.dxc-location span{color:var(--code-muted)}.dxc-finding-body{font-size:11px;margin:5px 0 8px!important;line-height:1.65;overflow-wrap:anywhere}.dxc-finding details{border-top:1px solid var(--code-line);padding-top:7px}.dxc-detail-label{font-size:10px;font-weight:550;color:var(--code-muted);display:block;margin-top:8px}.dxc-finding pre{padding:7px;background:var(--code-soft);border-radius:4px}.dxc-no-findings{padding:24px 3px;color:var(--code-muted);font-size:12px}.dxc-checks{border-top:1px solid var(--code-line);padding:12px 0;margin-top:8px}.dxc-checks>p{margin:8px 14px}.dxc-checks ul{padding:0 14px;margin:8px 0 0;list-style:none}.dxc-checks li{display:flex;justify-content:space-between;gap:7px;flex-wrap:wrap;font-size:11px;margin:7px 0}.dxc-checks li>span:first-child{flex:1;overflow-wrap:anywhere}.dxc-checks details{width:100%}.dxc-findings-actions{display:flex;flex-direction:column;gap:7px;padding:10px 12px;border-top:1px solid var(--code-line);margin-top:auto;position:sticky;bottom:-10px;background:var(--code-bg)}.dxc-findings-actions button{font-size:12px}.dxc-history{padding:12px 14px 4px;border-top:1px solid var(--code-line)}.dxc-history ol{list-style:none;margin:8px 0 0;padding:0}.dxc-history-item{display:flex;flex-direction:column;gap:3px;text-align:left;font-size:10px!important;width:100%;background:transparent!important;border-color:transparent!important}.dxc-history-item[aria-pressed=true]{border-color:var(--code-accent)!important;color:var(--code-accent)}.dxc-history li{display:flex;flex-direction:column;gap:3px;font-size:10px;color:var(--code-muted);padding:7px 0;border-top:1px solid var(--code-line)}
.dxc-setup{margin:12px 20px;padding:13px 15px;border:1px solid color-mix(in srgb,var(--code-accent) 40%,var(--code-line));border-radius:9px;background:var(--code-soft);flex:none}.dxc-setup>header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.dxc-setup>header button{border:0;background:transparent;padding:0 3px;font-size:17px}.dxc-setup-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.dxc-setup-fields label{display:grid;gap:5px;font-size:11px;color:var(--code-muted)}.dxc-setup-fields select{width:100%;color:var(--code-fg)}.dxc-session-model{display:block;padding:6px 8px;color:var(--code-fg);border:1px solid var(--code-line);border-radius:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dxc-setup-meta{display:flex;justify-content:space-between;align-items:center;margin:7px 0;color:var(--code-muted);font-size:10px}.dxc-setup-meta button{font-size:10px;border:0;background:transparent;padding:1px 0;color:var(--code-accent)}.dxc-setup-footer{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px}.dxc-setup>p{font-size:10px;margin-top:5px}.dxc-mobile-tabs{display:none}.dxc-dock{box-sizing:border-box;flex:none;width:calc(100% - var(--dsh-composer-side-clearance,16px) - var(--dsh-composer-side-clearance,16px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));max-width:calc(var(--dsh-composer-card-max-width,952px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));margin:0 auto;padding:0 var(--dsh-composer-dock-inset,8px)}.dxc-entry{box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;height:32px;margin:0;padding:0 10px;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary,#20252e);font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:13px;font-weight:500;line-height:20px;text-align:left;white-space:nowrap;cursor:pointer}.dxc-entry:hover{background:var(--dsw-alias-bg-layer-2,#f2f3f5)}.dxc-entry:active{background:var(--dsw-alias-bg-layer-2,#e9ebee)}.dxc-entry:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4666d5);outline-offset:-2px}.dxc-entry-icon{display:grid;place-items:center;flex:none;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#717885))}.dxc-entry-icon svg{width:16px;height:16px}.dxc-entry-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}.dxc-entry-go{display:grid;place-items:center;flex:none;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#717885));opacity:.75}.dxc-tool{padding:12px}.dxc-tool header{display:flex;align-items:center;gap:7px}.dxc-tool header>span{font-size:11px;color:var(--code-muted);margin-left:auto}.dxc-tool p{margin:8px 0;color:var(--code-muted);font-size:12px}.dxc-tool button{font-size:11px}
@container(min-width:650px) and (max-width:1100px){.dxc-workbench{grid-template-columns:190px minmax(0,1fr)}.dxc-mobile-tabs{display:flex;margin:9px 12px}.dxc-workbench>.dxc-files{display:flex;grid-column:1;grid-row:1}.dxc-workbench>.dxc-viewer{display:flex;grid-column:2;grid-row:1}.dxc-workbench>.dxc-findings{display:none}.dxc-page[data-pane=findings] .dxc-workbench{grid-template-columns:280px minmax(0,1fr)}.dxc-page[data-pane=findings] .dxc-files{display:none}.dxc-page[data-pane=findings] .dxc-findings{display:flex;grid-column:1;grid-row:1;border-left:0;border-right:1px solid var(--code-line)}}
@container(max-width:649px){.dxc-workbench{display:block;position:relative}.dxc-mobile-tabs{display:flex;margin:9px 12px}.dxc-workbench>.dxc-files,.dxc-workbench>.dxc-viewer,.dxc-workbench>.dxc-findings{display:none;height:100%;border:0}.dxc-page[data-pane=files] .dxc-files,.dxc-page[data-pane=code] .dxc-viewer,.dxc-page[data-pane=findings] .dxc-findings{display:flex}.dxc-file-list{padding-inline:10px}.dxc-file-row{max-width:100%}.dxc-findings-actions{flex-direction:row;justify-content:flex-end;margin-top:auto;bottom:-10px;flex-wrap:wrap}.dxc-findings-actions>p{width:100%}.dxc-findings-actions button{min-width:130px}.dxc-files>.dxc-tabs{margin-inline:14px}}
@container(max-width:560px){.dxc-header{padding:13px 12px 10px;gap:7px;flex-wrap:wrap}.dxc-header-actions{gap:5px}.dxc-header-actions>button{font-size:11px;padding:5px 7px}.dxc-brand{gap:6px}.dxc-brand h1{font-size:16px}.dxc-repo{max-width:125px;font-size:10px;margin-left:1px}.dxc-toolbar{padding:0 12px 10px;gap:7px}.dxc-toolbar select{font-size:11px}.dxc-scope{gap:5px;flex-wrap:wrap}.dxc-scope label{display:none}.dxc-scope input{width:110px;font-size:11px!important}.dxc-scope form button{font-size:11px}.dxc-banner{padding:8px 12px;font-size:11px}.dxc-setup{margin:8px 12px;padding:10px}.dxc-setup-fields{gap:8px}.dxc-viewer-heading{padding:10px 12px 8px}.dxc-path{font-size:11px}.dxc-readonly{font-size:8px}.dxc-split-control{display:none}.dxc-split-row{grid-template-columns:1fr}.dxc-diff-cell:first-child{border-right:0}.dxc-diff-cell.dxc-line-context:first-child{display:none}.dxc-diff-cell.dxc-line-empty{display:none}.dxc-version{font-size:9px}.dxc-code-scroll{font-size:11px}.dxc-findings-list{display:block}.dxc-findings-actions button{min-width:0;flex:1}.dxc-find>span{font-size:9px}.dxc-find{padding-inline:8px}.dxc-source-line{grid-template-columns:38px minmax(0,1fr)}.dxc-source-line .dxc-line-number{padding-right:9px}}
@media(max-height:520px){.dxc-page{overflow-y:auto}.dxc-workbench{flex:1 0 260px;min-height:260px}}
@media(prefers-reduced-motion:reduce){.dxc *{scroll-behavior:auto!important}}
`;

// src/client/index.ts
var inject = ["slots", "connection", "layout", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "code: dictionaries");
  const t = ctx.locale.bind(NS), controller = createCodeController(ctx.connection.rpc);
  const absent = { ...empty(), status: "idle" }, empty2 = { getSnapshot: () => absent, subscribe: () => () => {
  } };
  ctx.effect(() => () => controller.dispose(), "code: session state");
  ctx.on("connection/reset", () => controller.reset());
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = "dsh-x-code";
    style.textContent = CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, "code: styles");
  const open = () => ctx.layout.selectPanel("dsh-x-code"), back = () => ctx.layout.selectPanel(null);
  const formatTime = (value) => {
    if (!value || !Number.isFinite(Date.parse(value))) return "\u2014";
    const active = ctx.locale.getLocale().active, tag = active === "zh" ? "zh-CN" : active;
    return new Intl.DateTimeFormat(Intl.DateTimeFormat.supportedLocalesOf([tag])[0] ?? "en", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  };
  ctx.slots.inject("main", () => {
    const parent = ctx.slots.register({ name: "main", key: "dsh-x-code", children: { "dsh-x-code.workspace": { kind: "single", scope: "session-maybe" } } }, CodePanel);
    const child = ctx.slots.register({ name: "dsh-x-code.workspace", locale: NS, inject: (sessionId) => ({
      hooks: { code: sessionId ? controller.source(sessionId) : empty2 },
      back,
      formatTime,
      refresh: () => sessionId && controller.refresh(sessionId),
      selectTarget: (mode, base) => sessionId && controller.selectTarget(sessionId, mode, base),
      loadReview: (reviewId) => sessionId && controller.loadReview(sessionId, reviewId),
      loadFile: (target) => sessionId && controller.loadFile(sessionId, target),
      clearFile: () => sessionId && controller.clearFile(sessionId),
      cancel: () => controller.cancel(sessionId)
    }) }, CodeWorkspace);
    return () => {
      child();
      parent();
    };
  });
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: "dsh-x-code", order: 70, label: () => t("title") }, CodeIcon));
  ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({ name: "conversation.input.dock", id: "dsh-x-code", order: -11, locale: NS, inject: () => ({ open }) }, CodeEntry));
  for (const key of ["dsh_x_code_inspect", "dsh_x_code_file", "dsh_x_code_review"]) ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({ name: "tool.call.toolview", key, locale: NS, inject: () => ({ open }) }, CodeToolRow));
}
return module.exports; } });
