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

// src/formats.ts
var MAX_PREVIEW_MEDIA_BYTES = 8 * 1024 * 1024;
var MEDIA = {
  png: { kind: "image", mime: "image/png" },
  jpg: { kind: "image", mime: "image/jpeg" },
  jpeg: { kind: "image", mime: "image/jpeg" },
  jpe: { kind: "image", mime: "image/jpeg" },
  gif: { kind: "image", mime: "image/gif" },
  webp: { kind: "image", mime: "image/webp" },
  bmp: { kind: "image", mime: "image/bmp" },
  ico: { kind: "image", mime: "image/x-icon" },
  avif: { kind: "image", mime: "image/avif" },
  mp3: { kind: "audio", mime: "audio/mpeg" },
  wav: { kind: "audio", mime: "audio/wav" },
  ogg: { kind: "audio", mime: "audio/ogg" },
  oga: { kind: "audio", mime: "audio/ogg" },
  mp4: { kind: "video", mime: "video/mp4" },
  webm: { kind: "video", mime: "video/webm" },
  ogv: { kind: "video", mime: "video/ogg" }
};
function fileExtension(file) {
  const name = file?.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}
function mediaOf(file) {
  return MEDIA[fileExtension(file)] ?? null;
}
function isSvgPath(file) {
  return fileExtension(file) === "svg";
}

// src/client/model.ts
var MODES = ["worktree", "staged", "range"];
var SEVERITIES = ["critical", "high", "medium", "low", "info"];
function isMarkdownPath(path) {
  return /\.(?:md|mdx)$/i.test(path?.split("/").pop() ?? "");
}
function previewKind(path) {
  if (!path) return null;
  if (isMarkdownPath(path)) return "markdown";
  if (isSvgPath(path)) return "svg";
  return mediaOf(path)?.kind ?? null;
}
function showsSource(path) {
  const kind = previewKind(path);
  return kind !== "image" && kind !== "audio" && kind !== "video";
}
function viewerTabs(path) {
  const kind = previewKind(path);
  if (kind === "image" || kind === "audio" || kind === "video") return ["preview"];
  if (kind === "markdown" || kind === "svg") return ["source", "preview", "diff"];
  return ["source", "diff"];
}
function defaultViewerTab(path, focused) {
  if (focused && showsSource(path)) return "source";
  if (previewKind(path)) return "preview";
  return "source";
}
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
function sameSnapshot(left, right) {
  if (!left) return false;
  if (left.scope !== right.scope || left.revision !== right.revision || left.workspace.id !== right.workspace.id) return false;
  if (left.complete !== right.complete || left.truncated !== right.truncated || left.dshAvailable !== right.dshAvailable) return false;
  if (JSON.stringify(left.dshModel ?? null) !== JSON.stringify(right.dshModel ?? null)) return false;
  if ((left.operation?.id ?? null) !== (right.operation?.id ?? null) || (left.operation?.state ?? null) !== (right.operation?.state ?? null)) return false;
  const before = left.review, after = right.review;
  if ((before?.id ?? null) !== (after?.id ?? null) || (before?.state ?? null) !== (after?.state ?? null) || (before?.stale ?? null) !== (after?.stale ?? null) || (before?.summary ?? null) !== (after?.summary ?? null)) return false;
  if ((before?.findings.length ?? 0) !== (after?.findings.length ?? 0) || (before?.paths.length ?? 0) !== (after?.paths.length ?? 0)) return false;
  return left.history.length === right.history.length && left.history.every((item, index) => item.id === right.history[index]?.id);
}
function readFile(value, path) {
  if (!record(value) || value.path !== path || !text(value.status ?? value.kind ?? "text")) return null;
  if (["image", "audio", "video"].includes(value.kind)) {
    if (value.mediaType != null && !text(value.mediaType)) return null;
    if (value.data != null && !text(value.data)) return null;
    if (value.beforeData != null && !text(value.beforeData)) return null;
    return value;
  }
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
function chatSessionView(sessions, workspaces, currentId, cwd) {
  const byId = sessions && typeof sessions === "object" && sessions.byId && typeof sessions.byId === "object" ? sessions.byId : {};
  const record2 = workspaces && typeof workspaces === "object" ? workspaces : void 0;
  const groups = Array.isArray(workspaces) ? workspaces : Array.isArray(record2?.workspaces) ? record2.workspaces : Array.isArray(record2?.items) ? record2.items : [];
  const archived = new Set(Array.isArray(record2?.archivedSessionIds) ? record2.archivedSessionIds.filter((id) => typeof id === "string") : []);
  const samePath = (value) => typeof value === "string" && !!cwd && (value === cwd || value.replace(/\/+$/, "") === cwd.replace(/\/+$/, ""));
  const match = groups.find((group) => Array.isArray(group?.sessionIds) && !!currentId && group.sessionIds.includes(currentId)) ?? groups.find((group) => samePath(group?.cwd) || samePath(group?.path) || samePath(group?.repoRoot));
  const listed = Array.isArray(match?.sessionIds) ? match.sessionIds : currentId ? [currentId] : Object.keys(byId);
  const ids = [...new Set(listed.filter((id) => typeof id === "string"))];
  if (currentId && byId[currentId] && !ids.includes(currentId)) ids.unshift(currentId);
  const rows = ids.flatMap((id) => {
    const row = byId[id];
    if (!row || row.archived === true || archived.has(id) || row.origin === "subagent") return [];
    if (row.blank === true && id !== currentId) return [];
    const title = typeof row.title === "string" ? row.title.trim() : "";
    return [{ id, title, blank: row.blank === true, running: row.running === true, updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : 0 }];
  }).sort((left, right) => right.updatedAt - left.updatedAt || (left.id < right.id ? -1 : 1));
  return { sessions: rows, ...typeof match?.workspaceId === "string" ? { workspaceId: match.workspaceId } : {} };
}
var ASK_TEXT_LIMIT = 4e3;
function askPrompt(template, path, selection = "") {
  const safePath = path.replace(/[`\r\n]/g, "").trim();
  if (!safePath || safePath.length > 500 || /[\u0000-\u001f]/.test(safePath)) return "";
  const body = selection.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim().slice(0, ASK_TEXT_LIMIT);
  if (template.includes("{selection}") && !body) return "";
  const ticks = Math.max(2, ...[...body.matchAll(/`+/g)].map((item) => item[0].length));
  const fence = "`".repeat(ticks + 1);
  const quoted = body ? `${fence}
${body}
${fence}` : "";
  return template.replaceAll("{path}", safePath).replaceAll("{selection}", quoted).trim();
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
var FILE_CACHE_LIMIT = 12;
var fileCacheWeight = (file) => (file.data?.length ?? 0) + (file.beforeData?.length ?? 0);
var cacheFile = (entry, key, file) => {
  entry.files.delete(key);
  if (fileCacheWeight(file) > 2e6) return;
  entry.files.set(key, file);
  while (entry.files.size > FILE_CACHE_LIMIT) {
    const oldest = entry.files.keys().next().value;
    if (oldest === void 0) break;
    entry.files.delete(oldest);
  }
};
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
      if (previous && entry.state.status === "live" && sameSnapshot(previous, snapshot)) return;
      const bindingChanged = previous && (previous.scope !== snapshot.scope || previous.workspace.cwd !== snapshot.workspace.cwd || previous.workspace.repoRoot !== snapshot.workspace.repoRoot || previous.workspace.gitDir !== snapshot.workspace.gitDir || previous.workspace.repositoryId !== snapshot.workspace.repositoryId || previous.workspace.policyRoot !== snapshot.workspace.policyRoot);
      const identityChanged = previous && (bindingChanged || previous.workspace.id !== snapshot.workspace.id);
      if (identityChanged && (bindingChanged || entry.fileTarget?.reviewId == null)) {
        stopFile(entry);
        entry.fileTarget = null;
      }
      if (bindingChanged) {
        entry.historyRequest?.abort();
        entry.historyRequest = null;
        entry.files.clear();
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
      const entry = { source: void 0, sessionId, target: { mode: "worktree" }, state: empty(), listeners: /* @__PURE__ */ new Set(), request: null, timer: null, fileRequest: null, fileTarget: null, historyRequest: null, action: null, files: /* @__PURE__ */ new Map() };
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
  const selectTarget = (sessionId, mode, base2) => {
    const entry = entryFor(sessionId);
    if (entry.target.mode === mode && entry.target.base === base2) return;
    stopRead(entry);
    stopFile(entry);
    entry.fileTarget = null;
    entry.files.clear();
    entry.target = { mode, ...mode === "range" ? { base: base2 } : {} };
    publish(entry, empty());
    void refreshEntry(entry);
  };
  async function loadFile(sessionId, target) {
    const entry = entryFor(sessionId), generation = epoch, key = JSON.stringify(target);
    if (entry.state.fileKey === key && ["loading", "ready"].includes(entry.state.fileStatus)) return;
    stopFile(entry);
    const cached = entry.files.get(key);
    if (cached) {
      cacheFile(entry, key, cached);
      entry.fileTarget = target;
      publish(entry, { file: cached, fileKey: key, fileStatus: "ready", fileError: null });
      return;
    }
    const request = new AbortController();
    entry.fileRequest = request;
    entry.fileTarget = target;
    publish(entry, { file: null, fileKey: key, fileStatus: "loading", fileError: null });
    try {
      const raw = await call("code/file", { sessionId, ...target }, request);
      if (disposed || request.signal.aborted || epoch !== generation || entry.fileRequest !== request) return;
      const file = readFile(raw, target.path);
      if (!file) throw problem("code/invalid-file");
      cacheFile(entry, key, file);
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
      entry.files.clear();
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
var import_react7 = __toESM(require("react"), 1);

// src/client/CodeViewer.tsx
var import_react4 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/icons.tsx
var import_react = __toESM(require("react"), 1);
var base = (size) => ({ viewBox: "0 0 16 16", width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true });
function ExplorerIcon({ size = 16 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { ...base(size) }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M2.5 3.5h4l1.2 1.5h5.8v7.5H2.5z" }));
}
function ReviewIcon({ size = 16 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { ...base(size) }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M8 1.8 13 3.6v4.1c0 3.4-2.4 5.4-5 6.5-2.6-1.1-5-3.1-5-6.5V3.6z" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "m5.7 7.8 1.7 1.7 3.1-3.4" }));
}
function HistoryIcon({ size = 16 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { ...base(size) }, /* @__PURE__ */ import_react.default.createElement("circle", { cx: "8", cy: "8", r: "5.6" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M8 4.8V8l2.3 1.5" }));
}
function ChangesIcon({ size = 16 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { ...base(size) }, /* @__PURE__ */ import_react.default.createElement("circle", { cx: "4", cy: "3.4", r: "1.5" }), /* @__PURE__ */ import_react.default.createElement("circle", { cx: "4", cy: "12.6", r: "1.5" }), /* @__PURE__ */ import_react.default.createElement("circle", { cx: "12", cy: "8", r: "1.5" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M4 4.9v6.2M5.5 8h5" }));
}
function ChevronIcon({ size = 16 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { ...base(size) }, /* @__PURE__ */ import_react.default.createElement("path", { d: "m6 4 4 4-4 4" }));
}
function CloseIcon({ size = 16 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { ...base(size) }, /* @__PURE__ */ import_react.default.createElement("path", { d: "m4.5 4.5 7 7m0-7-7 7" }));
}
function SidebarIcon({ size = 16 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { ...base(size) }, /* @__PURE__ */ import_react.default.createElement("rect", { x: "1.8", y: "2.8", width: "12.4", height: "10.4", rx: "1.4" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M6 2.8v10.4" }));
}
function PanelIcon({ size = 16 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { ...base(size) }, /* @__PURE__ */ import_react.default.createElement("rect", { x: "1.8", y: "2.8", width: "12.4", height: "10.4", rx: "1.4" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M1.8 9.6h12.4" }));
}
function WrapIcon({ size = 14 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { ...base(size) }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M2.5 4.5h11M2.5 8h8.5a2 2 0 0 1 0 4H8" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "m9.6 10.6-1.6 1.4 1.6 1.4" }));
}
function CodeGlyph({ size = 20 }) {
  return /* @__PURE__ */ import_react.default.createElement("svg", { viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: "1.7", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18", strokeLinecap: "round", strokeLinejoin: "round" }));
}

// src/client/FileIcon.tsx
var import_react2 = __toESM(require("react"), 1);

// src/client/file-icon.ts
var BY_NAME = {
  "package.json": "package",
  "package-lock.json": "package",
  "pnpm-lock.yaml": "package",
  "yarn.lock": "package",
  dockerfile: "docker",
  "license": "license",
  "license.md": "license",
  "license.txt": "license",
  ".gitignore": "git",
  ".gitattributes": "git",
  ".gitmodules": "git",
  ".gitkeep": "git"
};
var BY_EXT = {
  md: "markdown",
  mdx: "markdown",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "yaml",
  svg: "svg",
  png: "image",
  jpg: "image",
  jpeg: "image",
  jpe: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  ico: "image",
  avif: "image",
  css: "style",
  scss: "style",
  less: "style",
  html: "html",
  htm: "html",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  py: "python",
  go: "go",
  rs: "rust",
  vue: "vue",
  xml: "xml",
  lock: "lock",
  txt: "text",
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  oga: "audio",
  mp4: "video",
  webm: "video",
  ogv: "video"
};
function fileIconKind(path) {
  const base2 = path?.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (!base2) return "file";
  if (BY_NAME[base2]) return BY_NAME[base2];
  if (base2.startsWith("tsconfig") && base2.endsWith(".json")) return "typescript";
  if (base2.startsWith("dockerfile")) return "docker";
  const dot = base2.lastIndexOf(".");
  const ext = dot > 0 ? base2.slice(dot + 1) : "";
  return BY_EXT[ext] ?? "file";
}

// src/client/FileIcon.tsx
var INK = "#fff";
var INK_DARK = "#3a3320";
function Doc({ color, size, label, ink = INK }) {
  return /* @__PURE__ */ import_react2.default.createElement("svg", { viewBox: "0 0 16 16", width: size, height: size, "aria-hidden": "true" }, /* @__PURE__ */ import_react2.default.createElement("path", { fill: color, d: "M3 1.3h6.1L13.2 5.4V14.7H3z" }), /* @__PURE__ */ import_react2.default.createElement("path", { fill: INK, fillOpacity: ".55", d: "M9.1 1.3V5.4h4.1z" }), label ? /* @__PURE__ */ import_react2.default.createElement("text", { x: "8", y: "12.2", textAnchor: "middle", fill: ink, fontSize: "5.6", fontWeight: "700", fontFamily: "ui-sans-serif,system-ui,sans-serif" }, label) : /* @__PURE__ */ import_react2.default.createElement("path", { stroke: INK, strokeWidth: "1", strokeLinecap: "round", d: "M5 8.2h6M5 10.4h4.2" }));
}
function Badge({ color, size, label, ink = INK }) {
  return /* @__PURE__ */ import_react2.default.createElement("svg", { viewBox: "0 0 16 16", width: size, height: size, "aria-hidden": "true" }, /* @__PURE__ */ import_react2.default.createElement("rect", { x: "1.2", y: "1.2", width: "13.6", height: "13.6", rx: "3", fill: color }), /* @__PURE__ */ import_react2.default.createElement("text", { x: "8", y: "11.15", textAnchor: "middle", fill: ink, fontSize: label.length > 2 ? 4.6 : 6.2, fontWeight: "700", fontFamily: "ui-sans-serif,system-ui,sans-serif" }, label));
}
function Glyph({ kind, size }) {
  if (kind === "typescript") return /* @__PURE__ */ import_react2.default.createElement(Badge, { color: "#3178c6", size, label: "TS" });
  if (kind === "javascript") return /* @__PURE__ */ import_react2.default.createElement(Badge, { color: "#f0d454", size, label: "JS", ink: INK_DARK });
  if (kind === "json") return /* @__PURE__ */ import_react2.default.createElement(Doc, { color: "#c9b458", size, label: "{ }", ink: INK_DARK });
  if (kind === "markdown") return /* @__PURE__ */ import_react2.default.createElement(Doc, { color: "#519aba", size, label: "M" });
  if (kind === "yaml") return /* @__PURE__ */ import_react2.default.createElement(Doc, { color: "#7b5ea7", size });
  if (kind === "html") return /* @__PURE__ */ import_react2.default.createElement(Badge, { color: "#e44d26", size, label: "<>" });
  if (kind === "style") return /* @__PURE__ */ import_react2.default.createElement(Badge, { color: "#2b9fd8", size, label: "#" });
  if (kind === "shell") return /* @__PURE__ */ import_react2.default.createElement(Badge, { color: "#3d9a4a", size, label: "$" });
  if (kind === "python") return /* @__PURE__ */ import_react2.default.createElement(Badge, { color: "#3776ab", size, label: "PY" });
  if (kind === "go") return /* @__PURE__ */ import_react2.default.createElement(Badge, { color: "#00acc1", size, label: "GO" });
  if (kind === "rust") return /* @__PURE__ */ import_react2.default.createElement(Badge, { color: "#d4844a", size, label: "RS" });
  if (kind === "vue") return /* @__PURE__ */ import_react2.default.createElement(Badge, { color: "#41b883", size, label: "V" });
  if (kind === "xml") return /* @__PURE__ */ import_react2.default.createElement(Doc, { color: "#e37933", size, label: "</>" });
  if (kind === "package") return /* @__PURE__ */ import_react2.default.createElement(Badge, { color: "#cb3837", size, label: "npm" });
  if (kind === "docker") return /* @__PURE__ */ import_react2.default.createElement(Badge, { color: "#2496ed", size, label: "D" });
  if (kind === "license") return /* @__PURE__ */ import_react2.default.createElement(Doc, { color: "#c9a227", size, label: "\xA7", ink: INK_DARK });
  if (kind === "lock") return /* @__PURE__ */ import_react2.default.createElement(Doc, { color: "#8b939c", size });
  if (kind === "text") return /* @__PURE__ */ import_react2.default.createElement(Doc, { color: "#8b939c", size });
  if (kind === "git") return /* @__PURE__ */ import_react2.default.createElement("svg", { viewBox: "0 0 16 16", width: size, height: size, "aria-hidden": "true" }, /* @__PURE__ */ import_react2.default.createElement("circle", { cx: "4", cy: "3.2", r: "1.7", fill: "#f05133" }), /* @__PURE__ */ import_react2.default.createElement("circle", { cx: "4", cy: "12.8", r: "1.7", fill: "#f05133" }), /* @__PURE__ */ import_react2.default.createElement("circle", { cx: "12", cy: "8", r: "1.7", fill: "#f05133" }), /* @__PURE__ */ import_react2.default.createElement("path", { d: "M4 4.9v6.2M5.6 8.4h4.7", stroke: "#f05133", strokeWidth: "1.3", fill: "none" }));
  if (kind === "svg" || kind === "image") return /* @__PURE__ */ import_react2.default.createElement("svg", { viewBox: "0 0 16 16", width: size, height: size, "aria-hidden": "true" }, /* @__PURE__ */ import_react2.default.createElement("rect", { x: "1.4", y: "2.2", width: "13.2", height: "11.6", rx: "2", fill: kind === "svg" ? "#e39b2b" : "#7b6bb5" }), /* @__PURE__ */ import_react2.default.createElement("path", { d: "m2.6 11.2 3-3.2 2.1 2.2 1.8-1.6 3.9 3.4", fill: "none", stroke: "#fff", strokeWidth: "1.2", strokeLinejoin: "round" }), /* @__PURE__ */ import_react2.default.createElement("circle", { cx: "11.2", cy: "5.6", r: "1.1", fill: "#fff" }));
  if (kind === "audio") return /* @__PURE__ */ import_react2.default.createElement("svg", { viewBox: "0 0 16 16", width: size, height: size, "aria-hidden": "true" }, /* @__PURE__ */ import_react2.default.createElement("rect", { x: "1.2", y: "1.2", width: "13.6", height: "13.6", rx: "3", fill: "#1f9d6a" }), /* @__PURE__ */ import_react2.default.createElement("path", { d: "M6.2 11.2V5.4l5-1.2v5.6", fill: "none", stroke: "#fff", strokeWidth: "1.2" }), /* @__PURE__ */ import_react2.default.createElement("circle", { cx: "5.2", cy: "11.2", r: "1.3", fill: "#fff" }), /* @__PURE__ */ import_react2.default.createElement("circle", { cx: "10.2", cy: "9.8", r: "1.3", fill: "#fff" }));
  if (kind === "video") return /* @__PURE__ */ import_react2.default.createElement("svg", { viewBox: "0 0 16 16", width: size, height: size, "aria-hidden": "true" }, /* @__PURE__ */ import_react2.default.createElement("rect", { x: "1.2", y: "3", width: "10.2", height: "10", rx: "1.6", fill: "#7b5ea7" }), /* @__PURE__ */ import_react2.default.createElement("path", { d: "m11.4 6.2 3.2-1.6v6.8l-3.2-1.6z", fill: "#7b5ea7" }));
  return /* @__PURE__ */ import_react2.default.createElement(Doc, { color: "#8b939c", size });
}
function FileTypeIcon({ path, size = 16 }) {
  return /* @__PURE__ */ import_react2.default.createElement("span", { className: "dxc-type-icon", "data-file-icon": fileIconKind(path) }, /* @__PURE__ */ import_react2.default.createElement(Glyph, { kind: fileIconKind(path), size }));
}
function FolderIcon({ size = 16 }) {
  return /* @__PURE__ */ import_react2.default.createElement("span", { className: "dxc-folder-icon", "aria-hidden": "true" }, /* @__PURE__ */ import_react2.default.createElement("svg", { viewBox: "0 0 16 16", width: size, height: size }, /* @__PURE__ */ import_react2.default.createElement("path", { fill: "#dcb67a", d: "M1.4 3.6h4.4l1.15 1.35H14.6V13H1.4z" }), /* @__PURE__ */ import_react2.default.createElement("path", { fill: "#c4a068", d: "M1.4 6h13.2V13H1.4z" })));
}

// src/client/MediaPreview.tsx
var import_react3 = __toESM(require("react"), 1);
var BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
function decodeBase64(value) {
  if (value.length > Math.ceil(MAX_PREVIEW_MEDIA_BYTES / 3) * 4 || value.length % 4 !== 0 || !BASE64.test(value)) throw new Error("media");
  const binary = atob(value);
  if (binary.length > MAX_PREVIEW_MEDIA_BYTES) throw new Error("media");
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return buffer;
}
function useMediaUrl(payload, mime, encoding) {
  const url = (0, import_react3.useMemo)(() => {
    if (!payload) return null;
    try {
      const blob = encoding === "text" ? new Blob([payload], { type: mime }) : new Blob([decodeBase64(payload)], { type: mime });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }, [payload, mime, encoding]);
  (0, import_react3.useEffect)(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}
var MIN_ZOOM = 0.1;
var MAX_ZOOM = 8;
function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}
function stepZoom(current, direction) {
  const next = direction > 0 ? current * 1.25 : current / 1.25;
  return clampZoom(Math.round(next * 100) / 100);
}
function wheelZoom(current, event) {
  const line = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
  return clampZoom(current * Math.exp(-(event.deltaY * line) / 500));
}
function ImageView({ src, name, label = "image", t }) {
  const stage = (0, import_react3.useRef)(null);
  const image = (0, import_react3.useRef)(null);
  const [mode, setMode] = (0, import_react3.useState)("fit");
  const [natural, setNatural] = (0, import_react3.useState)(null);
  const [broken, setBroken] = (0, import_react3.useState)(false);
  const displayed = () => {
    const node = image.current;
    if (!node?.naturalWidth) return 1;
    const width = node.getBoundingClientRect().width;
    return width > 0 ? width / node.naturalWidth : 1;
  };
  (0, import_react3.useEffect)(() => {
    setMode("fit");
    setBroken(false);
    setNatural(null);
  }, [src]);
  (0, import_react3.useEffect)(() => {
    const node = stage.current;
    if (!node) return;
    const onWheel = (event) => {
      if (!event.deltaY) return;
      event.preventDefault();
      setMode((current) => wheelZoom(current === "fit" ? displayed() : current, event));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);
  const sized = mode !== "fit" && natural && natural.width > 0;
  return /* @__PURE__ */ import_react3.default.createElement("div", { className: "dxc-media", "data-media": label }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "dxc-media-toolbar", role: "toolbar", "aria-label": t("preview") }, /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", "aria-label": t("zoomOut"), onClick: () => setMode((current) => stepZoom(current === "fit" ? displayed() : current, -1)) }, "\u2212"), /* @__PURE__ */ import_react3.default.createElement("span", null, mode === "fit" ? t("zoomFit") : t("zoomPercent", { percent: Math.round(mode * 100) })), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", "aria-label": t("zoomIn"), onClick: () => setMode((current) => stepZoom(current === "fit" ? displayed() : current, 1)) }, "+"), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", "aria-pressed": mode === "fit", onClick: () => setMode("fit") }, t("zoomFit")), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", "aria-pressed": mode === 1, onClick: () => setMode(1) }, t("zoomActual")), natural && natural.width > 0 && /* @__PURE__ */ import_react3.default.createElement("span", null, t("dimensions", { width: natural.width, height: natural.height }))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "dxc-media-stage", "data-fit": mode === "fit" || void 0, ref: stage }, /* @__PURE__ */ import_react3.default.createElement("img", { ref: image, src, alt: name, hidden: broken || void 0, "data-broken": broken || void 0, style: sized ? { width: natural.width * mode } : void 0, onLoad: (event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }), onError: () => setBroken(true) }), broken && /* @__PURE__ */ import_react3.default.createElement("p", { className: "dxc-state" }, t("mediaFailed"))));
}
function MediaView({ kind, payload, encoding, mime, name, t }) {
  const url = useMediaUrl(payload, mime, encoding);
  if (!url) return /* @__PURE__ */ import_react3.default.createElement("p", { className: "dxc-state" }, t("mediaFailed"));
  if (kind === "audio") return /* @__PURE__ */ import_react3.default.createElement("div", { className: "dxc-media dxc-player", "data-media": "audio" }, /* @__PURE__ */ import_react3.default.createElement("audio", { controls: true, src: url }));
  if (kind === "video") return /* @__PURE__ */ import_react3.default.createElement("div", { className: "dxc-media dxc-player", "data-media": "video" }, /* @__PURE__ */ import_react3.default.createElement("video", { controls: true, src: url }));
  return /* @__PURE__ */ import_react3.default.createElement(ImageView, { src: url, name, label: kind === "svg" ? "svg" : "image", t });
}

// src/client/CodeViewer.tsx
function viewerSelection(root) {
  const selection = root?.ownerDocument.getSelection();
  if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) return "";
  const range = selection.getRangeAt(0);
  const host = range.commonAncestorContainer;
  const element = host.nodeType === 1 ? host : host.parentElement;
  if (!element || !root.contains(element)) return "";
  const fragment = range.cloneContents();
  fragment.querySelectorAll(".dxc-line-number, .dxc-line-sign, .dxc-hunk-header").forEach((node) => node.remove());
  return (fragment.textContent ?? "").replace(/\u00a0/g, " ");
}
function Tabs({ items, value, onChange, label, className = "" }) {
  const onKey = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const at = items.findIndex((item) => item.value === value);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (at + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    onChange(items[next].value);
    event.currentTarget.parentElement?.children[next]?.focus();
  };
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: `dxc-tabs ${className}`, role: "tablist", "aria-label": label }, items.map((item) => /* @__PURE__ */ import_react4.default.createElement("button", { key: item.value, type: "button", role: "tab", "aria-selected": value === item.value, tabIndex: value === item.value ? 0 : -1, onKeyDown: onKey, onClick: () => onChange(item.value) }, item.label)));
}
function MarkedText({ text: text2, query, spans }) {
  const chunks = spans?.length ? spans : [{ text: text2, style: void 0 }];
  let offset = 0;
  const matches = query ? searchMatches([text2], query) : [];
  return /* @__PURE__ */ import_react4.default.createElement("span", { className: "dxc-line-text" }, chunks.map((span, token) => {
    const start = offset, end = offset + span.text.length;
    offset = end;
    const boundaries = [start, end, ...matches.flatMap((match) => [Math.max(start, match.start), Math.min(end, match.end)]).filter((point) => point > start && point < end)].sort((a, b) => a - b);
    return /* @__PURE__ */ import_react4.default.createElement("span", { key: token, style: span.style }, boundaries.slice(0, -1).map((point, index) => {
      const part = span.text.slice(point - start, boundaries[index + 1] - start);
      return matches.some((match) => point >= match.start && point < match.end) ? /* @__PURE__ */ import_react4.default.createElement("mark", { key: index }, part) : /* @__PURE__ */ import_react4.default.createElement(import_react4.default.Fragment, { key: index }, part);
    }));
  }));
}
function Source({ text: text2, highlights, query, activeLine, focus, side }) {
  const lines = sourceLines(text2);
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "dxc-source-lines" }, lines.map((line, at) => /* @__PURE__ */ import_react4.default.createElement("div", { className: "dxc-source-line", key: at, "data-line-target": `${side}:${at + 1}`, "data-focused": focus?.side === side && at + 1 >= focus.startLine && at + 1 <= focus.endLine || void 0, "data-find-active": activeLine === `${side}:${at + 1}` || void 0 }, /* @__PURE__ */ import_react4.default.createElement("span", { className: "dxc-line-number", "aria-hidden": "true" }, at + 1), /* @__PURE__ */ import_react4.default.createElement(MarkedText, { text: line, spans: highlights?.[at], query }))));
}
function Diff({ hunks, split, wrap, oldHighlights, newHighlights, query, activeLine, focus, t }) {
  const columns = (0, import_react4.useRef)({ left: null, right: null });
  const follow = (side) => (event) => {
    const peer = columns.current[side === "left" ? "right" : "left"];
    if (peer && peer.scrollLeft !== event.currentTarget.scrollLeft) peer.scrollLeft = event.currentTarget.scrollLeft;
  };
  const focused = (side, line) => focus?.side === side && line != null && line >= focus.startLine && line <= focus.endLine || void 0;
  const cell = (row, side, key) => {
    const no = row?.[side], spans = (side === "old" ? oldHighlights : newHighlights)?.[(no ?? 0) - 1];
    return /* @__PURE__ */ import_react4.default.createElement("div", { key, className: `dxc-diff-cell dxc-line-${row?.kind ?? "empty"}`, "data-line-target": no ? `${side}:${no}` : void 0, "data-focused": focused(side, no), "data-find-active": activeLine === `${side}:${no}` || void 0 }, /* @__PURE__ */ import_react4.default.createElement("span", { className: "dxc-line-number", "aria-hidden": "true" }, no ?? ""), /* @__PURE__ */ import_react4.default.createElement("span", { className: "dxc-line-sign", "aria-hidden": "true" }, row?.kind === "add" ? "+" : row?.kind === "del" ? "\u2212" : ""), /* @__PURE__ */ import_react4.default.createElement(MarkedText, { text: row?.text ?? "", spans, query }));
  };
  if (split && !wrap) return /* @__PURE__ */ import_react4.default.createElement("div", { className: "dxc-split-columns" }, ["left", "right"].map((side) => /* @__PURE__ */ import_react4.default.createElement("div", { className: "dxc-split-column", key: side, ref: (node) => {
    columns.current[side] = node;
  }, onScroll: follow(side) }, hunks.map((hunk, index) => /* @__PURE__ */ import_react4.default.createElement("section", { className: "dxc-hunk", key: index }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "dxc-hunk-header" }, `@@ \u2212${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`), pairedRows(hunkRows(hunk)).map((row, at) => cell(row[side], side === "left" ? "old" : "new", at)))))));
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: `dxc-diff-lines ${split ? "dxc-split" : "dxc-unified"}` }, hunks.map((hunk, index) => {
    const rows = hunkRows(hunk);
    return /* @__PURE__ */ import_react4.default.createElement("section", { className: "dxc-hunk", key: index }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "dxc-hunk-header" }, `@@ \u2212${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`, hunk.heading && ` ${hunk.heading}`), split ? pairedRows(rows).map((row, at) => /* @__PURE__ */ import_react4.default.createElement("div", { className: "dxc-split-row", key: at }, cell(row.left, "old", "left"), cell(row.right, "new", "right"))) : rows.map((row, at) => /* @__PURE__ */ import_react4.default.createElement("div", { className: `dxc-unified-row dxc-line-${row.kind}`, key: at, "data-line-target": `${row.new == null ? "old" : "new"}:${row.new ?? row.old}`, "data-focused": focused("old", row.old) || focused("new", row.new), "data-find-active": activeLine === `${row.new == null ? "old" : "new"}:${row.new ?? row.old}` || void 0 }, /* @__PURE__ */ import_react4.default.createElement("span", { className: "dxc-line-number", "aria-label": t("oldSide") }, row.old ?? ""), /* @__PURE__ */ import_react4.default.createElement("span", { className: "dxc-line-number", "aria-label": t("newSide") }, row.new ?? ""), /* @__PURE__ */ import_react4.default.createElement("span", { className: "dxc-line-sign", "aria-hidden": "true" }, row.kind === "add" ? "+" : row.kind === "del" ? "\u2212" : ""), /* @__PURE__ */ import_react4.default.createElement(MarkedText, { text: row.text, spans: (row.new == null ? oldHighlights : newHighlights)?.[(row.new ?? row.old ?? 0) - 1], query }))));
  }));
}
function MarkdownPreview({ text: text2, labels }) {
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "dxc-markdown" }, /* @__PURE__ */ import_react4.default.createElement(import_dsh_client_ui_primitives.MarkdownText, { text: text2, labels, variant: "body" }));
}
function Breadcrumbs({ path }) {
  const segments = path?.split("/").filter(Boolean) ?? [];
  if (!segments.length) return null;
  return /* @__PURE__ */ import_react4.default.createElement("nav", { className: "dxc-breadcrumbs", "aria-label": "breadcrumbs" }, segments.map((segment, at) => /* @__PURE__ */ import_react4.default.createElement(import_react4.default.Fragment, { key: at }, at > 0 && /* @__PURE__ */ import_react4.default.createElement("span", { className: "dxc-crumb-sep", "aria-hidden": "true" }, /* @__PURE__ */ import_react4.default.createElement(ChevronIcon, { size: 11 })), /* @__PURE__ */ import_react4.default.createElement("span", { className: "dxc-crumb", "data-last": at === segments.length - 1 || void 0 }, at === segments.length - 1 ? /* @__PURE__ */ import_react4.default.createElement(FileTypeIcon, { path: path ?? segment, size: 14 }) : /* @__PURE__ */ import_react4.default.createElement(FolderIcon, { size: 14 }), segment))));
}
function CodeViewer({ file, status, error, path, identity, mode, context, focus, retry, scrollPositions, t, onAsk }) {
  const [tab, setTab] = (0, import_react4.useState)(() => defaultViewerTab(path, Boolean(focus))), [side, setSide] = (0, import_react4.useState)("new"), [split, setSplit] = (0, import_react4.useState)(false), [wrap, setWrap] = (0, import_react4.useState)(false);
  const [narrow, setNarrow] = (0, import_react4.useState)(false);
  const [findOpen, setFindOpen] = (0, import_react4.useState)(false), [query, setQuery] = (0, import_react4.useState)(""), [matchIndex, setMatchIndex] = (0, import_react4.useState)(0);
  const scroll = (0, import_react4.useRef)(null), findInput = (0, import_react4.useRef)(null), root = (0, import_react4.useRef)(null);
  const rendered = previewKind(path);
  const panes = viewerTabs(path);
  const seenPath = (0, import_react4.useRef)(path);
  let active = tab;
  if (seenPath.current !== path) {
    seenPath.current = path;
    const next = defaultViewerTab(path, Boolean(focus));
    active = next;
    if (next !== tab) setTab(next);
  }
  const view = panes.includes(active) ? active : panes[0];
  const copyLabel = t("copyCode"), copiedLabel = t("copiedCode"), footnotes = t("footnotes");
  const labels = (0, import_react4.useMemo)(() => ({ code: { copyLabel, copiedLabel }, footnotes }), [copyLabel, copiedLabel, footnotes]);
  const highlighter = (0, import_dsh_client_ui_primitives.useCodeHighlighter)((0, import_dsh_client_ui_primitives.languageForPath)(path ?? ""));
  const oldHighlights = (0, import_react4.useMemo)(() => highlighter(file?.beforeText ?? ""), [highlighter, file?.beforeText]);
  const newHighlights = (0, import_react4.useMemo)(() => highlighter(file?.text ?? ""), [highlighter, file?.text]);
  const hunks = (0, import_react4.useMemo)(() => diffHunks(file?.hunks ?? file?.diff), [file?.hunks, file?.diff]);
  const rows = (0, import_react4.useMemo)(() => view === "diff" ? hunks.flatMap(hunkRows).map((row) => ({ text: row.text, key: `${row.new == null ? "old" : "new"}:${row.new ?? row.old}` })) : sourceLines(side === "old" ? file?.beforeText : file?.text).map((text2, at) => ({ text: text2, key: `${side}:${at + 1}` })), [file, view, side, hunks]);
  const matches = (0, import_react4.useMemo)(() => searchMatches(rows.map((row) => row.text), query), [rows, query]);
  const normalizedIndex = matches.length ? matchIndex % matches.length : 0;
  const activeLine = matches.length ? rows[matches[normalizedIndex].line - 1].key : null;
  const scrollKey = `${identity}:${view}:${side}`;
  (0, import_react4.useEffect)(() => {
    if (!globalThis.ResizeObserver || !root.current) return;
    const observer = new ResizeObserver((entries) => setNarrow(entries[0].contentRect.width < 560));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  (0, import_react4.useLayoutEffect)(() => {
    const node = scroll.current;
    if (!node) return;
    const position = scrollPositions.current.get(scrollKey);
    node.scrollTop = position?.top ?? 0;
    node.scrollLeft = position?.left ?? 0;
    return () => {
      scrollPositions.current.set(scrollKey, { top: node.scrollTop, left: node.scrollLeft });
    };
  }, [scrollKey, status, scrollPositions]);
  (0, import_react4.useEffect)(() => {
    setMatchIndex(0);
  }, [query, view, side, identity]);
  (0, import_react4.useEffect)(() => {
    if (findOpen) findInput.current?.focus();
  }, [findOpen]);
  (0, import_react4.useEffect)(() => {
    if (!focus) return;
    if (showsSource(path)) setTab("source");
    setSide(focus.side ?? "new");
  }, [focus, path]);
  (0, import_react4.useEffect)(() => {
    const target = focus && status === "ready" ? root.current?.querySelector(`[data-line-target="${focus.side ?? "new"}:${focus.startLine}"]`) : null;
    target?.scrollIntoView?.({ block: "center" });
  }, [focus, status, tab, side]);
  (0, import_react4.useEffect)(() => {
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
  const totalLines = sourceLines(file?.text).length;
  const textual = view === "source" || view === "diff";
  const media = rendered === "image" || rendered === "audio" || rendered === "video" ? rendered : null;
  const mediaPayload = side === "old" ? file?.beforeData : file?.data;
  const mediaSide = side === "old" ? file?.beforeKind : file?.afterKind ?? kind;
  const mime = mediaOf(path)?.mime;
  const name = basename(path ?? "");
  return /* @__PURE__ */ import_react4.default.createElement("section", { className: "dxc-viewer", "aria-label": t("codeView"), ref: root, tabIndex: 0, onKeyDown: (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f" && textual) {
      event.preventDefault();
      setFindOpen(true);
    }
    if (event.key === "Escape" && findOpen) {
      event.preventDefault();
      closeFind();
    }
  } }, /* @__PURE__ */ import_react4.default.createElement("header", { className: "dxc-viewer-heading" }, /* @__PURE__ */ import_react4.default.createElement(Breadcrumbs, { path }), /* @__PURE__ */ import_react4.default.createElement("span", { className: "dxc-readonly" }, t("readOnly"))), /* @__PURE__ */ import_react4.default.createElement("div", { className: "dxc-viewer-controls" }, /* @__PURE__ */ import_react4.default.createElement(Tabs, { value: view, onChange: setTab, label: t("code"), items: panes.map((value) => ({ value, label: t(value) })) }), /* @__PURE__ */ import_react4.default.createElement("div", { className: "dxc-viewer-options" }, view === "diff" ? /* @__PURE__ */ import_react4.default.createElement("button", { className: "dxc-split-control", type: "button", disabled: narrow, title: narrow ? t("splitNarrow") : void 0, "aria-pressed": split && !narrow, onClick: () => setSplit((value) => !value) }, t(split && !narrow ? "split" : "unified")) : /* @__PURE__ */ import_react4.default.createElement("select", { "aria-label": t("context"), value: side, onChange: (event) => setSide(event.target.value) }, /* @__PURE__ */ import_react4.default.createElement("option", { value: "new" }, context === "review" ? t("reviewed") : t(`origin.${mode}`)), /* @__PURE__ */ import_react4.default.createElement("option", { value: "old" }, t("before"))), textual && /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", className: "dxc-icon-button", "aria-pressed": wrap, "aria-label": t("wrap"), title: t("wrap"), onClick: () => setWrap((value) => !value) }, /* @__PURE__ */ import_react4.default.createElement(WrapIcon, null)), textual && /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", className: "dxc-icon-button", "aria-label": t("find"), title: t("find"), onClick: () => setFindOpen((value) => !value) }, /* @__PURE__ */ import_react4.default.createElement("svg", { viewBox: "0 0 16 16", width: "14", height: "14", fill: "none", stroke: "currentColor", strokeWidth: "1.4" }, /* @__PURE__ */ import_react4.default.createElement("circle", { cx: "7", cy: "7", r: "4" }), /* @__PURE__ */ import_react4.default.createElement("path", { d: "m10 10 3.5 3.5", strokeLinecap: "round" }))))), textual && findOpen && /* @__PURE__ */ import_react4.default.createElement("div", { className: "dxc-find", role: "search" }, /* @__PURE__ */ import_react4.default.createElement("input", { ref: findInput, value: query, placeholder: t("findPlaceholder"), "aria-label": t("find"), onChange: (event) => setQuery(event.target.value), onKeyDown: (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      nextMatch(event.shiftKey ? -1 : 1);
    }
  } }), /* @__PURE__ */ import_react4.default.createElement("span", { role: "status" }, matches.length ? t("matches", { current: normalizedIndex + 1, count: matches.length }) : t("noMatches")), /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", "aria-label": t("previousMatch"), disabled: !matches.length, onClick: () => nextMatch(-1) }, "\u2191"), /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", "aria-label": t("nextMatch"), disabled: !matches.length, onClick: () => nextMatch(1) }, "\u2193"), /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", "aria-label": t("closeFind"), onClick: closeFind }, /* @__PURE__ */ import_react4.default.createElement(CloseIcon, { size: 12 }))), /* @__PURE__ */ import_react4.default.createElement("div", { className: "dxc-code-scroll", ref: scroll, "data-wrap": wrap || void 0, onScroll: (event) => scrollPositions.current.set(scrollKey, { top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft }), onContextMenu: (event) => {
    if (!path || !onAsk || event.target.closest("input, textarea, button, a, select")) return;
    event.preventDefault();
    onAsk({ x: event.clientX, y: event.clientY, path, selection: viewerSelection(event.currentTarget) });
  } }, !path ? /* @__PURE__ */ import_react4.default.createElement("div", { className: "dxc-empty dxc-code-empty" }, /* @__PURE__ */ import_react4.default.createElement("span", { "aria-hidden": "true" }, "{ }"), /* @__PURE__ */ import_react4.default.createElement("p", null, t("chooseFile"))) : status === "loading" || status === "ready" && !loadedPath ? /* @__PURE__ */ import_react4.default.createElement("p", { className: "dxc-state", role: "status" }, t("fileLoading")) : status === "failed" ? /* @__PURE__ */ import_react4.default.createElement("div", { className: "dxc-state", role: "alert" }, /* @__PURE__ */ import_react4.default.createElement("p", null, t(/stale/i.test(error?.code ?? "") ? "fileChanged" : "fileFailed")), /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", onClick: retry }, t("retry"))) : loadedPath ? /* @__PURE__ */ import_react4.default.createElement(import_react4.default.Fragment, null, (file.truncated || file.diffTruncated) && /* @__PURE__ */ import_react4.default.createElement("p", { className: "dxc-inline-warning" }, t("truncated")), nonText ? /* @__PURE__ */ import_react4.default.createElement("p", { className: "dxc-state" }, t(kind === "unavailable" ? "fileFailed" : kind ?? "unavailable")) : view === "diff" ? hunks.length ? /* @__PURE__ */ import_react4.default.createElement(Diff, { hunks, split: split && !narrow, wrap, oldHighlights, newHighlights, query, activeLine, focus, t }) : /* @__PURE__ */ import_react4.default.createElement("p", { className: "dxc-state" }, t("noDiff")) : media && view === "preview" ? mediaSide === "missing" || side === "new" && kind === "missing" ? /* @__PURE__ */ import_react4.default.createElement("p", { className: "dxc-state" }, t("missing")) : mediaSide === "oversized" ? /* @__PURE__ */ import_react4.default.createElement("p", { className: "dxc-state" }, t("oversized")) : mediaSide === "symlink" ? /* @__PURE__ */ import_react4.default.createElement("p", { className: "dxc-state" }, t("symlink")) : !mediaPayload || !mime ? /* @__PURE__ */ import_react4.default.createElement("p", { className: "dxc-state" }, t(mediaPayload === "" ? "emptyFile" : "mediaFailed")) : /* @__PURE__ */ import_react4.default.createElement(MediaView, { kind: media, payload: mediaPayload, encoding: "base64", mime, name, t }) : source == null || side === "old" && file.beforeKind === "missing" || side === "new" && (file.afterKind === "missing" || kind === "missing") ? /* @__PURE__ */ import_react4.default.createElement("p", { className: "dxc-state" }, t("missing")) : source === "" ? /* @__PURE__ */ import_react4.default.createElement("p", { className: "dxc-state" }, t("emptyFile")) : view === "preview" && rendered === "svg" ? /* @__PURE__ */ import_react4.default.createElement(MediaView, { kind: "svg", payload: source, encoding: "text", mime: "image/svg+xml", name, t }) : view === "preview" ? /* @__PURE__ */ import_react4.default.createElement(MarkdownPreview, { text: source, labels }) : /* @__PURE__ */ import_react4.default.createElement(Source, { text: source, highlights: side === "old" ? oldHighlights : newHighlights, query, activeLine, focus, side })) : null), /* @__PURE__ */ import_react4.default.createElement("footer", { className: "dxc-statusbar" }, /* @__PURE__ */ import_react4.default.createElement("span", { className: "dxc-status-item" }, view === "diff" ? t("diff") : side === "old" ? t("beforeVersion", { version: shortHash(file?.baseVersion) }) : t("afterVersion", { origin: context === "review" ? t("reviewed") : t(`origin.${mode}`), version: shortHash(["Worktree", "Index"].includes(file?.version ?? "") ? file?.hash : file?.version ?? file?.hash) })), loadedPath && totalLines > 0 && /* @__PURE__ */ import_react4.default.createElement("span", { className: "dxc-status-item" }, t("lineCount", { count: totalLines })), /* @__PURE__ */ import_react4.default.createElement("span", { className: "dxc-status-spacer" }), /* @__PURE__ */ import_react4.default.createElement("span", { className: "dxc-status-item" }, t("readOnly"))));
}

// src/client/Splitter.tsx
var import_react6 = __toESM(require("react"), 1);

// src/client/layout.ts
var import_react5 = require("react");
var SIDEBAR_BOUNDS = { min: 180, max: 460, default: 236 };
var PANEL_BOUNDS = { min: 250, max: 560, default: 328 };
var COLLAPSE_SNAP = 14;
var ACTIVITIES = ["files", "changes", "history"];
var PANEL_TABS = ["problems", "review", "chat"];
var DEFAULT_LAYOUT = { sidebar: SIDEBAR_BOUNDS.default, panel: PANEL_BOUNDS.default, sidebarCollapsed: false, panelCollapsed: false, activity: "files", panelTab: "review" };
var LAYOUT_KEY = "dsh-x-code:layout:v1";
var clampSize = (value, bounds) => Number.isFinite(value) ? Math.min(bounds.max, Math.max(bounds.min, Math.round(value))) : bounds.default;
var dragSize = (origin, delta, bounds) => clampSize(origin + delta, bounds);
function normalizeLayout(value) {
  const record2 = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const number = (key, bounds) => typeof record2[key] === "number" ? clampSize(record2[key], bounds) : bounds.default;
  return {
    sidebar: number("sidebar", SIDEBAR_BOUNDS),
    panel: number("panel", PANEL_BOUNDS),
    sidebarCollapsed: record2.sidebarCollapsed === true,
    panelCollapsed: record2.panelCollapsed === true,
    activity: ACTIVITIES.includes(record2.activity) ? record2.activity : DEFAULT_LAYOUT.activity,
    panelTab: PANEL_TABS.includes(record2.panelTab) ? record2.panelTab : DEFAULT_LAYOUT.panelTab
  };
}
function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function readLayout(storage) {
  try {
    return normalizeLayout(JSON.parse(storage?.getItem(LAYOUT_KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}
function writeLayout(storage, layout) {
  try {
    storage?.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
  }
}
function useWorkbenchLayout(storage) {
  const [layout, setLayout] = (0, import_react5.useState)(() => readLayout(storage));
  (0, import_react5.useEffect)(() => {
    writeLayout(storage, layout);
  }, [storage, layout]);
  const update = (patch) => setLayout((value) => normalizeLayout({ ...value, ...patch }));
  const reset = () => setLayout({ ...DEFAULT_LAYOUT });
  return { layout, update, reset };
}
var MAX_TABS = 24;
function addTab(tabs, path, preview) {
  const at = tabs.findIndex((tab) => tab.path === path);
  if (at >= 0) return preview || !tabs[at].preview ? tabs : tabs.map((tab, index) => index === at ? { ...tab, preview: false } : tab);
  const last = tabs.length - 1;
  if (preview && last >= 0 && tabs[last].preview) return [...tabs.slice(0, last), { path, preview: true }];
  return [...tabs, { path, preview }].slice(-MAX_TABS);
}
function closeTab(tabs, path, active) {
  const at = tabs.findIndex((tab) => tab.path === path);
  if (at < 0) return { tabs, active };
  const next = tabs.filter((tab) => tab.path !== path);
  return { tabs: next, active: active === path ? next[Math.min(at, next.length - 1)]?.path ?? null : active };
}
function moveTab(tabs, from, to) {
  if (from === to || from < 0 || from >= tabs.length || to < 0 || to >= tabs.length) return tabs;
  const next = [...tabs], [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// src/client/Splitter.tsx
function Splitter({ value, bounds, label, orientation, direction, className = "", onResize, onToggle, onPreview }) {
  const [dragging, setDragging] = (0, import_react6.useState)(false);
  const drag = (0, import_react6.useRef)(null);
  const vertical = orientation === "vertical";
  (0, import_react6.useEffect)(() => () => {
    const state = drag.current;
    if (state?.frame) cancelAnimationFrame(state.frame);
    restore();
  }, []);
  const restore = () => {
    try {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    } catch {
    }
  };
  const end = (event, commit) => {
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId) return;
    if (state.frame) cancelAnimationFrame(state.frame);
    drag.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
    }
    restore();
    setDragging(false);
    const next = state.latest;
    if (!commit) {
      onPreview?.(state.origin);
      return;
    }
    if (next <= bounds.min + COLLAPSE_SNAP) onToggle();
    else onResize(next);
  };
  return /* @__PURE__ */ import_react6.default.createElement(
    "div",
    {
      className: `dxc-splitter ${className}`,
      "data-orientation": orientation,
      role: "separator",
      "aria-orientation": orientation,
      "aria-label": label,
      "aria-valuemin": bounds.min,
      "aria-valuemax": bounds.max,
      "aria-valuenow": dragging ? void 0 : value,
      "data-dragging": dragging || void 0,
      tabIndex: 0,
      onPointerDown: (event) => {
        if (event.button !== 0) return;
        drag.current = { at: vertical ? event.clientX : event.clientY, origin: value, pointer: event.pointerId, latest: value, frame: 0 };
        setDragging(true);
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
        }
        document.body.style.cursor = vertical ? "col-resize" : "row-resize";
        document.body.style.userSelect = "none";
        event.preventDefault();
      },
      onPointerMove: (event) => {
        const state = drag.current;
        if (!state || state.pointer !== event.pointerId) return;
        state.latest = dragSize(state.origin, ((vertical ? event.clientX : event.clientY) - state.at) * direction, bounds);
        if (state.frame) return;
        const separator = event.currentTarget;
        const paint = () => {
          const active = drag.current;
          if (!active) return;
          active.frame = 0;
          separator.setAttribute("aria-valuenow", String(active.latest));
          onPreview?.(active.latest);
        };
        state.frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(paint) : (paint(), 0);
      },
      onPointerUp: (event) => end(event, true),
      onPointerCancel: (event) => end(event, false),
      onDoubleClick: onToggle,
      onKeyDown: (event) => {
        const back = vertical ? "ArrowLeft" : "ArrowUp", forward = vertical ? "ArrowRight" : "ArrowDown";
        const step = event.shiftKey ? 48 : 12;
        if (event.key === back || event.key === forward) {
          event.preventDefault();
          onResize(dragSize(value, (event.key === forward ? step : -step) * direction, bounds));
        } else if (event.key === "Home") {
          event.preventDefault();
          onResize(bounds.min);
        } else if (event.key === "End") {
          event.preventDefault();
          onResize(bounds.max);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }
    },
    /* @__PURE__ */ import_react6.default.createElement("span", { className: "dxc-splitter-grip", "aria-hidden": "true" })
  );
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
  explorer: "Explorer",
  activityBar: "Workbench views",
  openEditors: "Open editors",
  tabActions: "Tab actions",
  closeTab: "Close {name}",
  closeTabAction: "Close",
  closeOthers: "Close others",
  closeAll: "Close all",
  panel: "Review panel",
  reviewSummary: "Review",
  problems: "Problems",
  chat: "Chat",
  chatSessions: "Sessions",
  chatNew: "New session",
  chatUntitled: "Untitled",
  chatBlank: "New session",
  chatCurrent: "Current",
  chatUnavailable: "The shared conversation is unavailable here. Open the main conversation instead.",
  noHistory: "No recorded reviews yet.",
  toggleSidebar: "Toggle sidebar",
  togglePanel: "Toggle review panel",
  resizeSidebar: "Resize the file sidebar",
  resizePanel: "Resize the review panel",
  lineCount: "{count} lines",
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
  preview: "Preview",
  diff: "Diff",
  readOnly: "Read-only",
  unified: "Unified",
  split: "Split",
  wrap: "Wrap lines",
  copyCode: "Copy",
  copiedCode: "Copied",
  footnotes: "Footnotes",
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
  askMenu: "Add to conversation",
  askFile: "Ask about this file",
  askSelection: "Ask about this selection",
  askFilePrompt: "Please look at `{path}`.",
  askSelectionPrompt: "About this part of `{path}`:\n\n{selection}",
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
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomFit: "Fit",
  zoomActual: "Actual size",
  zoomPercent: "{percent}%",
  dimensions: "{width} \xD7 {height}",
  mediaFailed: "This preview could not be shown.",
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
  reviewRequest: "Please call dsh_x_code_review with these exact arguments. Use the official approval flow and return a complete structured review:",
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
  explorer: "\u8D44\u6E90\u7BA1\u7406\u5668",
  activityBar: "\u5DE5\u4F5C\u53F0\u89C6\u56FE",
  openEditors: "\u5DF2\u6253\u5F00\u7684\u7F16\u8F91\u5668",
  tabActions: "\u6807\u7B7E\u64CD\u4F5C",
  closeTab: "\u5173\u95ED {name}",
  closeTabAction: "\u5173\u95ED",
  closeOthers: "\u5173\u95ED\u5176\u4ED6",
  closeAll: "\u5168\u90E8\u5173\u95ED",
  panel: "\u5BA1\u67E5\u9762\u677F",
  reviewSummary: "\u5BA1\u67E5",
  problems: "\u95EE\u9898",
  chat: "\u5BF9\u8BDD",
  chatSessions: "\u4F1A\u8BDD",
  chatNew: "\u65B0\u5EFA\u4F1A\u8BDD",
  chatUntitled: "\u672A\u547D\u540D",
  chatBlank: "\u65B0\u4F1A\u8BDD",
  chatCurrent: "\u5F53\u524D",
  chatUnavailable: "\u8FD9\u91CC\u6682\u65F6\u65E0\u6CD5\u5D4C\u5165\u5171\u4EAB\u5BF9\u8BDD\uFF0C\u8BF7\u6539\u7528\u4E3B\u5BF9\u8BDD\u3002",
  noHistory: "\u8FD8\u6CA1\u6709\u5BA1\u67E5\u8BB0\u5F55\u3002",
  toggleSidebar: "\u663E\u793A/\u9690\u85CF\u4FA7\u8FB9\u680F",
  togglePanel: "\u663E\u793A/\u9690\u85CF\u5BA1\u67E5\u9762\u677F",
  resizeSidebar: "\u8C03\u6574\u6587\u4EF6\u4FA7\u8FB9\u680F\u5BBD\u5EA6",
  resizePanel: "\u8C03\u6574\u5BA1\u67E5\u9762\u677F\u5BBD\u5EA6",
  lineCount: "{count} \u884C",
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
  preview: "\u9884\u89C8",
  diff: "\u5DEE\u5F02",
  readOnly: "\u53EA\u8BFB",
  unified: "\u7EDF\u4E00",
  split: "\u5E76\u6392",
  wrap: "\u81EA\u52A8\u6362\u884C",
  copyCode: "\u590D\u5236",
  copiedCode: "\u5DF2\u590D\u5236",
  footnotes: "\u811A\u6CE8",
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
  askMenu: "\u52A0\u5165\u63D0\u95EE",
  askFile: "\u5C31\u6B64\u6587\u4EF6\u63D0\u95EE",
  askSelection: "\u628A\u9009\u4E2D\u5185\u5BB9\u52A0\u5165\u63D0\u95EE",
  askFilePrompt: "\u8BF7\u770B\u8FD9\u4E2A\u6587\u4EF6\uFF1A`{path}`",
  askSelectionPrompt: "\u5173\u4E8E `{path}` \u91CC\u7684\u8FD9\u6BB5\u5185\u5BB9\uFF1A\n\n{selection}",
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
  zoomIn: "\u653E\u5927",
  zoomOut: "\u7F29\u5C0F",
  zoomFit: "\u9002\u5E94",
  zoomActual: "\u5B9E\u9645\u5927\u5C0F",
  zoomPercent: "{percent}%",
  dimensions: "{width} \xD7 {height}",
  mediaFailed: "\u65E0\u6CD5\u663E\u793A\u6B64\u9884\u89C8\u3002",
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
  reviewRequest: "\u8BF7\u4F7F\u7528\u4EE5\u4E0B\u7CBE\u786E\u53C2\u6570\u8C03\u7528 dsh_x_code_review\uFF0C\u4FDD\u7559\u5B98\u65B9\u6388\u6743\u6D41\u7A0B\uFF0C\u5E76\u8FD4\u56DE\u5B8C\u6574\u7684\u7ED3\u6784\u5316\u5BA1\u67E5\u7ED3\u679C\uFF1A",
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
function CodeIcon({ size = 20 }) {
  return /* @__PURE__ */ import_react7.default.createElement(CodeGlyph, { size });
}
function CodeEntry({ open, t }) {
  return /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-dock" }, /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", className: "dxc-entry", onClick: open, title: t("open") }, /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-entry-icon", "aria-hidden": "true" }, /* @__PURE__ */ import_react7.default.createElement(CodeIcon, null)), /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-entry-label" }, t("title")), /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-entry-go", "aria-hidden": "true" }, /* @__PURE__ */ import_react7.default.createElement(ChevronIcon, { size: 14 }))));
}
function CodePanel({ renderSlot }) {
  return renderSlot("dsh-x-code.workspace", {});
}
var STATUS_MARKS = { added: "A", deleted: "D", renamed: "R", untracked: "U", conflicted: "!" };
var indent = (depth) => ({ paddingInlineStart: 10 + depth * 11 });
var mark = (file) => isChanged(file) ? STATUS_MARKS[file.status] ?? "M" : "";
function ActivityBar({ activity, onChange, counts, t }) {
  const items = [
    { value: "files", label: t("explorer"), icon: /* @__PURE__ */ import_react7.default.createElement(ExplorerIcon, null), count: counts.files },
    { value: "changes", label: t("changed"), icon: /* @__PURE__ */ import_react7.default.createElement(ChangesIcon, null), count: counts.changes },
    { value: "history", label: t("history"), icon: /* @__PURE__ */ import_react7.default.createElement(HistoryIcon, null), count: counts.history }
  ];
  return /* @__PURE__ */ import_react7.default.createElement("nav", { className: "dxc-activity", "aria-label": t("explorer") }, items.map((item) => /* @__PURE__ */ import_react7.default.createElement("button", { key: item.value, type: "button", className: "dxc-activity-item", "aria-pressed": activity === item.value, title: item.label, "aria-label": item.label, onClick: () => onChange(item.value) }, /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-activity-icon", "aria-hidden": "true" }, item.icon), item.count > 0 && /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-activity-count" }, item.count))));
}
function FileRow({ file, path, selected, select, open, ask, t, limit, reviewed, depth }) {
  return /* @__PURE__ */ import_react7.default.createElement("li", { className: "dxc-file-row", style: indent(depth), "data-selected": path === file.path || void 0, onContextMenu: (event) => {
    event.preventDefault();
    ask({ x: event.clientX, y: event.clientY, path: file.path, selection: "" });
  } }, !reviewed && /* @__PURE__ */ import_react7.default.createElement("input", { type: "checkbox", "aria-label": t("selectFile", { path: file.path }), checked: selected.includes(file.path), disabled: !file.selectable || !selected.includes(file.path) && selected.length >= limit, onChange: () => select(file.path) }), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", className: "dxc-file", "aria-current": path === file.path ? "true" : void 0, "aria-label": t("openFile", { path: file.path }), title: file.path, onClick: () => open(file.path) }, /* @__PURE__ */ import_react7.default.createElement(FileTypeIcon, { path: file.path }), /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-file-name" }, basename(file.path)), /* @__PURE__ */ import_react7.default.createElement("span", { className: `dxc-file-status dxc-status-${file.status}`, title: t(Object.hasOwn(en, `file.${file.status}`) ? `file.${file.status}` : "file.modified") }, mark(file))));
}
function TreeBranch({ node, depth, ...rest }) {
  if (!node.directories.length && !node.files.length) return null;
  return /* @__PURE__ */ import_react7.default.createElement("li", { className: "dxc-branch" }, /* @__PURE__ */ import_react7.default.createElement("details", { className: "dxc-directory", open: true }, /* @__PURE__ */ import_react7.default.createElement("summary", { title: node.path, "aria-label": node.path, style: indent(depth) }, /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-disclosure", "aria-hidden": "true" }, /* @__PURE__ */ import_react7.default.createElement(ChevronIcon, { size: 12 })), /* @__PURE__ */ import_react7.default.createElement(FolderIcon, null), /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-dir-name" }, node.name)), /* @__PURE__ */ import_react7.default.createElement("ul", { className: "dxc-children" }, node.directories.map((child) => /* @__PURE__ */ import_react7.default.createElement(TreeBranch, { key: child.path, node: child, depth: depth + 1, ...rest })), node.files.map((file) => /* @__PURE__ */ import_react7.default.createElement(FileRow, { key: file.path, file, depth: depth + 1, ...rest })))));
}
function FileList({ files, path, selected, select, open, ask, t, limit, reviewed, filter }) {
  const [query, setQuery] = (0, import_react7.useState)("");
  const tree = (0, import_react7.useMemo)(() => fileTree(files, query, reviewed ? "all" : filter), [files, query, filter, reviewed]);
  const rows = { path, selected, select, open, ask, t, limit, reviewed };
  return /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-file-search" }, /* @__PURE__ */ import_react7.default.createElement("span", { "aria-hidden": "true" }, /* @__PURE__ */ import_react7.default.createElement("svg", { viewBox: "0 0 16 16", width: "12", height: "12", fill: "none", stroke: "currentColor", strokeWidth: "1.4" }, /* @__PURE__ */ import_react7.default.createElement("circle", { cx: "7", cy: "7", r: "4" }), /* @__PURE__ */ import_react7.default.createElement("path", { d: "m10 10 3.5 3.5", strokeLinecap: "round" }))), /* @__PURE__ */ import_react7.default.createElement("input", { type: "search", value: query, onChange: (event) => setQuery(event.target.value), placeholder: t("searchFiles"), "aria-label": t("fileSearchLabel") })), /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-file-list" }, tree.directories.length || tree.files.length ? /* @__PURE__ */ import_react7.default.createElement("ul", { className: "dxc-tree" }, tree.directories.map((node) => /* @__PURE__ */ import_react7.default.createElement(TreeBranch, { key: node.path, node, depth: 0, ...rows })), tree.files.map((file) => /* @__PURE__ */ import_react7.default.createElement(FileRow, { key: file.path, file, depth: 0, ...rows }))) : /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxc-state" }, t(filter === "changed" && !query && !reviewed ? "noChanges" : "noFiles"))));
}
function Sidebar({ files, path, selected, select, open, ask, t, limit, snapshot, reviewed, activity, history, historyId, inspectHistory, latest, formatTime }) {
  const [filter, setFilter] = (0, import_react7.useState)("changed");
  const changed = files.filter(isChanged), scope = activity === "changes" ? filter : "all";
  const shown = scope === "changed" ? changed : files;
  const title = activity === "files" ? "explorer" : activity === "changes" ? "changed" : "history";
  return /* @__PURE__ */ import_react7.default.createElement("aside", { className: "dxc-sidebar", "aria-label": t(title) }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-sidebar-title" }, /* @__PURE__ */ import_react7.default.createElement("strong", null, t(title)), activity !== "history" && /* @__PURE__ */ import_react7.default.createElement("span", null, t("fileCount", { count: shown.length }))), activity === "history" ? /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-history-pane" }, history.length ? /* @__PURE__ */ import_react7.default.createElement("ol", null, [...history].reverse().map((item) => /* @__PURE__ */ import_react7.default.createElement("li", { key: item.id }, /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", className: "dxc-history-item", "aria-pressed": historyId === item.id, onClick: () => inspectHistory(item.id) }, /* @__PURE__ */ import_react7.default.createElement("time", null, formatTime(item.createdAt)), /* @__PURE__ */ import_react7.default.createElement("span", null, t("openFindings", { count: item.findings }), " \xB7 ", shortHash(item.snapshotId)))))) : /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxc-state" }, t("noHistory")), historyId && /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", className: "dxc-link", onClick: latest }, t("latestReview"))) : /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, activity === "changes" && !reviewed && /* @__PURE__ */ import_react7.default.createElement(Tabs, { className: "dxc-sidebar-tabs", label: t("files"), value: filter, onChange: setFilter, items: [{ value: "changed", label: t("changed") }, { value: "all", label: t("all") }] }), /* @__PURE__ */ import_react7.default.createElement(FileList, { files: shown, path, selected, select, open, ask, t, limit, reviewed, filter: scope }), /* @__PURE__ */ import_react7.default.createElement("footer", { className: "dxc-file-footer" }, reviewed ? /* @__PURE__ */ import_react7.default.createElement("span", null, t("reviewedOnly")) : /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement("span", null, t("selection", { count: selected.length })), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", onClick: () => select(selected.length ? null : "all") }, t(selected.length ? "clearSelection" : "selectChanged"))), snapshot.truncated && /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxc-inline-warning" }, t("partialFiles")))));
}
function EditorTabs({ path, tabs, select, close, reorder, closeOthers, closeAll, ask, t }) {
  const [menu, setMenu] = (0, import_react7.useState)(false), dragging = (0, import_react7.useRef)(null);
  if (!tabs.length) return null;
  return /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-editor-tabs", role: "tablist", "aria-label": t("openEditors") }, tabs.map((tab, at) => /* @__PURE__ */ import_react7.default.createElement(
    "div",
    {
      key: tab.path,
      className: "dxc-tab",
      role: "presentation",
      "data-active": tab.path === path || void 0,
      "data-preview": tab.preview || void 0,
      draggable: true,
      onDragStart: () => {
        dragging.current = at;
      },
      onDragOver: (event) => event.preventDefault(),
      onDrop: (event) => {
        event.preventDefault();
        if (dragging.current != null) reorder(dragging.current, at);
        dragging.current = null;
      },
      onDragEnd: () => {
        dragging.current = null;
      },
      onContextMenu: (event) => {
        event.preventDefault();
        ask({ x: event.clientX, y: event.clientY, path: tab.path, selection: "" });
      }
    },
    /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", role: "tab", "aria-selected": tab.path === path, title: tab.path, onClick: () => select(tab.path), onAuxClick: (event) => {
      if (event.button === 1) close(tab.path);
    } }, /* @__PURE__ */ import_react7.default.createElement(FileTypeIcon, { path: tab.path, size: 14 }), /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-tab-name" }, basename(tab.path))),
    /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", className: "dxc-tab-close", "aria-label": t("closeTab", { name: basename(tab.path) }), onClick: () => close(tab.path) }, /* @__PURE__ */ import_react7.default.createElement(CloseIcon, { size: 12 }))
  )), /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-tab-menu-wrap" }, /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", className: "dxc-tab-menu", "aria-haspopup": "menu", "aria-expanded": menu, "aria-label": t("tabActions"), onClick: () => setMenu((value) => !value) }, /* @__PURE__ */ import_react7.default.createElement(ChevronIcon, { size: 13 })), menu && /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-tab-popup", role: "menu", onMouseLeave: () => setMenu(false) }, /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", role: "menuitem", disabled: !path, onClick: () => {
    if (path) close(path);
    setMenu(false);
  } }, t("closeTabAction")), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", role: "menuitem", disabled: !path || tabs.length < 2, onClick: () => {
    if (path) closeOthers(path);
    setMenu(false);
  } }, t("closeOthers")), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", role: "menuitem", onClick: () => {
    closeAll();
    setMenu(false);
  } }, t("closeAll")))));
}
function FindingCard({ finding, jump, t }) {
  return /* @__PURE__ */ import_react7.default.createElement("article", { className: "dxc-finding", "data-severity": finding.severity }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-finding-top" }, /* @__PURE__ */ import_react7.default.createElement("span", { className: `dxc-severity dxc-severity-${finding.severity}` }, t(`severity.${finding.severity}`)), /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-finding-id" }, finding.id.slice(0, 7))), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", className: "dxc-finding-title", onClick: jump }, finding.title), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", className: "dxc-location", title: finding.path, "aria-label": t("findingLocation", { path: finding.path, line: finding.startLine }), onClick: jump }, basename(finding.path), /* @__PURE__ */ import_react7.default.createElement("span", null, ":", finding.startLine, finding.endLine !== finding.startLine ? `\u2013${finding.endLine}` : "")), /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxc-finding-body" }, finding.body), (finding.evidence || finding.trigger) && /* @__PURE__ */ import_react7.default.createElement("details", null, /* @__PURE__ */ import_react7.default.createElement("summary", null, t("details")), finding.evidence && /* @__PURE__ */ import_react7.default.createElement("div", null, /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-detail-label" }, t("evidence")), /* @__PURE__ */ import_react7.default.createElement("pre", null, finding.evidence)), finding.trigger && /* @__PURE__ */ import_react7.default.createElement("div", null, /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-detail-label" }, t("trigger")), /* @__PURE__ */ import_react7.default.createElement("p", null, finding.trigger))));
}
function ReviewPane({ review, jump, rereview, enabled, canRereview, t, formatTime, historyStatus, historyId, inspectHistory }) {
  const [severity, setSeverity] = (0, import_react7.useState)("all");
  const filtered = review?.findings.filter((finding) => severity === "all" || finding.severity === severity) ?? [];
  const complete = isComplete(review);
  if (!review && historyId) return /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-state", role: historyStatus === "failed" ? "alert" : "status" }, /* @__PURE__ */ import_react7.default.createElement("p", null, t(historyStatus === "failed" ? "historyFailed" : "historyLoading")), historyStatus === "failed" && /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", onClick: () => inspectHistory(historyId) }, t("retry")));
  if (!review) return /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-empty dxc-panel-empty" }, /* @__PURE__ */ import_react7.default.createElement(ReviewIcon, { size: 24 }), /* @__PURE__ */ import_react7.default.createElement("strong", null, t("noReview")), /* @__PURE__ */ import_react7.default.createElement("p", null, t("noReviewHint")));
  return /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-review-summary" }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-review-state", role: "status" }, /* @__PURE__ */ import_react7.default.createElement("span", { className: `dxc-state-dot dxc-review-${review.state}` }), /* @__PURE__ */ import_react7.default.createElement("strong", null, t(Object.hasOwn(en, `state.${review.state}`) ? `state.${review.state}` : "incomplete"))), /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-muted" }, t("coverage", { count: review.paths?.length ?? 0 }), " \xB7 ", shortHash(review.snapshotId)), review.createdAt && /* @__PURE__ */ import_react7.default.createElement("time", { className: "dxc-muted" }, formatTime(review.createdAt)), review.summary && /* @__PURE__ */ import_react7.default.createElement("details", null, /* @__PURE__ */ import_react7.default.createElement("summary", null, t("summary")), /* @__PURE__ */ import_react7.default.createElement("p", null, review.summary))), review.stale && /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-notice dxc-warning" }, /* @__PURE__ */ import_react7.default.createElement("strong", null, t("stale")), /* @__PURE__ */ import_react7.default.createElement("p", null, t("staleHint"))), !complete && !activeReview(review) && /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-notice dxc-warning" }, /* @__PURE__ */ import_react7.default.createElement("strong", null, t("incomplete")), /* @__PURE__ */ import_react7.default.createElement("p", null, t("incompleteHint")), review.reason && /* @__PURE__ */ import_react7.default.createElement("details", null, /* @__PURE__ */ import_react7.default.createElement("summary", null, t("details")), /* @__PURE__ */ import_react7.default.createElement("p", null, review.reason))), review.findings.length > 0 && /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-panel-filter" }, /* @__PURE__ */ import_react7.default.createElement("select", { className: "dxc-severity-filter", value: severity, "aria-label": t("allFindings"), onChange: (event) => setSeverity(event.target.value) }, /* @__PURE__ */ import_react7.default.createElement("option", { value: "all" }, t("allFindings")), SEVERITIES.map((item) => /* @__PURE__ */ import_react7.default.createElement("option", { key: item, value: item }, t(`severity.${item}`), " (", review.findings.filter((finding) => finding.severity === item).length, ")")))), /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-findings-list" }, filtered.map((finding) => /* @__PURE__ */ import_react7.default.createElement(FindingCard, { key: finding.id, finding, jump: () => jump(finding), t })), complete && review.findings.length === 0 && /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxc-no-findings" }, t("noFindings"))), /* @__PURE__ */ import_react7.default.createElement("section", { className: "dxc-checks" }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-section-title" }, /* @__PURE__ */ import_react7.default.createElement("strong", null, t("checks"))), review.checks?.length ? /* @__PURE__ */ import_react7.default.createElement("ul", null, review.checks.map((check, at) => /* @__PURE__ */ import_react7.default.createElement("li", { key: at }, /* @__PURE__ */ import_react7.default.createElement("span", null, check.name ?? check.command ?? t("checks")), /* @__PURE__ */ import_react7.default.createElement("span", { className: check.status === "failed" ? "dxc-warning" : "dxc-muted" }, t(check.status === "passed" && check.verified !== true ? "check.unknown" : Object.hasOwn(en, `check.${check.status}`) ? `check.${check.status}` : "check.unknown")), check.evidence && /* @__PURE__ */ import_react7.default.createElement("details", null, /* @__PURE__ */ import_react7.default.createElement("summary", null, t("evidence")), /* @__PURE__ */ import_react7.default.createElement("pre", null, check.evidence))))) : /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxc-muted" }, t("noChecks"))), /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-findings-actions" }, complete && /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", disabled: !enabled || !canRereview, onClick: rereview }, t("rereview")), !canRereview && complete && /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxc-muted" }, t("worktreeFirst"))));
}
function ChatView({ renderSlot }) {
  return /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, renderSlot("conversation.session", { view: "chat" }));
}
function ConversationEmbed({ renderFactorySlot, sessionId, useSession, useConversation, useSessions, t }) {
  const session = useSession?.((value) => value);
  const conversation = useConversation?.((value) => value);
  const summaryBlank = useSessions?.((state) => state?.byId?.[sessionId]?.blank);
  const shellPhase = session === void 0 ? "active" : conversation?.activeTargets?.size > 0 || !session.blank && !session.awaitingFirstTurn || session.running ? "active" : session.promptAttempted ? "engaging" : "blank";
  const settling = shellPhase === "blank" && session?.openState === "loading" && summaryBlank !== true;
  const hero = shellPhase === "blank" && (session?.openState === "open" || summaryBlank === true);
  const phase = settling ? "settling" : hero ? "hero" : "active";
  if (typeof renderFactorySlot !== "function") return /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxc-state" }, t("chatUnavailable"));
  return /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-chat-embed" }, renderFactorySlot("conversation.content", { variant: "embedded", phase, hero }, { slots: { views: ChatView }, fallback: /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxc-state" }, t("chatUnavailable")) }));
}
function sessionLabel(session, current, t) {
  const name = session.title || (session.blank ? t("chatBlank") : t("chatUntitled"));
  return current ? `${name} \xB7 ${t("chatCurrent")}` : name;
}
function SessionBar({ sessionId, cwd, useSessions, useWorkspaces, openSession, startSession, t }) {
  const sessionList = useSessions?.((state) => state);
  const workspaceList = useWorkspaces?.((state) => state);
  const directory = (0, import_react7.useMemo)(() => chatSessionView(sessionList, workspaceList, sessionId, cwd), [sessionList, workspaceList, sessionId, cwd]);
  const choices = directory.sessions.some((session) => session.id === sessionId) ? directory.sessions : [{ id: sessionId, title: "", blank: false, running: false, updatedAt: 0 }, ...directory.sessions];
  return /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-session-bar" }, /* @__PURE__ */ import_react7.default.createElement("select", { "aria-label": t("chatSessions"), value: sessionId, disabled: !openSession, onChange: (event) => {
    if (event.target.value && event.target.value !== sessionId) openSession?.(event.target.value);
  } }, choices.map((session) => /* @__PURE__ */ import_react7.default.createElement("option", { key: session.id, value: session.id }, sessionLabel(session, session.id === sessionId, t)))), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", disabled: !startSession, onClick: () => startSession?.(directory.workspaceId) }, t("chatNew")));
}
function BottomPanel({ tab, setTab, review, jump, rereview, enabled, canRereview, t, formatTime, historyStatus, historyId, inspectHistory, renderFactorySlot, sessionId, cwd, openSession, startSession, useSession, useConversation, useSessions, useWorkspaces }) {
  const problems = review?.findings.length ?? 0;
  return /* @__PURE__ */ import_react7.default.createElement("aside", { className: "dxc-panel", "aria-label": t("panel") }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-panel-tabs", role: "tablist", "aria-label": t("panel") }, /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", role: "tab", "aria-selected": tab === "problems", onClick: () => setTab("problems") }, t("problems"), problems > 0 && /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-count" }, problems)), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", role: "tab", "aria-selected": tab === "review", onClick: () => setTab("review") }, t("reviewSummary")), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", role: "tab", "aria-selected": tab === "chat", onClick: () => setTab("chat") }, t("chat"))), /* @__PURE__ */ import_react7.default.createElement(SessionBar, { sessionId, cwd, useSessions, useWorkspaces, openSession, startSession, t }), /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-panel-body" }, tab === "chat" ? /* @__PURE__ */ import_react7.default.createElement(ConversationEmbed, { renderFactorySlot, sessionId, useSession, useConversation, useSessions, t }) : tab === "problems" ? /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-problems" }, !review ? /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxc-state" }, t("noReviewHint")) : review.findings.length === 0 ? /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxc-state" }, isComplete(review) ? t("noFindings") : t("incomplete")) : /* @__PURE__ */ import_react7.default.createElement("ul", { className: "dxc-problem-list" }, review.findings.map((finding) => /* @__PURE__ */ import_react7.default.createElement("li", { key: finding.id }, /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", className: "dxc-problem", onClick: () => jump(finding) }, /* @__PURE__ */ import_react7.default.createElement("span", { className: `dxc-severity dxc-severity-${finding.severity}` }, t(`severity.${finding.severity}`)), /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-problem-title" }, finding.title), /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-problem-path", title: finding.path }, basename(finding.path), /* @__PURE__ */ import_react7.default.createElement("span", null, ":", finding.startLine))))))) : /* @__PURE__ */ import_react7.default.createElement(ReviewPane, { review, jump, rereview, enabled, canRereview, t, formatTime, historyStatus, historyId, inspectHistory })));
}
function AskMenu({ x, y, label, items, onClose }) {
  const ref = (0, import_react7.useRef)(null);
  (0, import_react7.useEffect)(() => {
    const node = ref.current;
    const view = node?.ownerDocument.defaultView;
    const box = node?.getBoundingClientRect();
    if (node && box && view) {
      node.style.left = `${Math.max(8, Math.min(x, view.innerWidth - box.width - 8))}px`;
      node.style.top = `${Math.max(8, Math.min(y, view.innerHeight - box.height - 8))}px`;
    }
    node?.querySelector("button")?.focus();
    const onPointer = (event) => {
      if (!node?.contains(event.target)) onClose();
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    node?.ownerDocument.addEventListener("pointerdown", onPointer);
    node?.ownerDocument.addEventListener("keydown", onKey);
    return () => {
      node?.ownerDocument.removeEventListener("pointerdown", onPointer);
      node?.ownerDocument.removeEventListener("keydown", onKey);
    };
  }, [x, y, onClose]);
  return /* @__PURE__ */ import_react7.default.createElement("div", { ref, className: "dxc-context-menu", role: "menu", "aria-label": label, style: { left: x, top: y } }, items.map((item) => /* @__PURE__ */ import_react7.default.createElement("button", { key: item.id, type: "button", role: "menuitem", onClick: () => {
    item.run();
    onClose();
  } }, item.label)));
}
function CodeWorkspace(props) {
  return /* @__PURE__ */ import_react7.default.createElement(CodeWorkspaceBody, { ...props });
}
function CodeWorkspaceBody({ sessionId, useCode, inputActions, refresh, selectTarget, loadFile, clearFile, loadReview, renderFactorySlot, useSession, useConversation, useSessions, useWorkspaces, openSession, startSession, cancel, back, t, formatTime }) {
  const state = useCode((value) => value), snapshot = state.snapshot;
  const page = (0, import_react7.useRef)(null);
  const workbench = (0, import_react7.useRef)(null);
  const { layout, update: setLayout } = useWorkbenchLayout(browserStorage());
  const [narrow, setNarrow] = (0, import_react7.useState)(false), [pane, setPane] = (0, import_react7.useState)("files");
  const [tabs, setTabs] = (0, import_react7.useState)([]), [path, setPath] = (0, import_react7.useState)(null);
  const [selected, setSelected] = (0, import_react7.useState)([]), [context, setContext] = (0, import_react7.useState)("current"), [notice, setNotice] = (0, import_react7.useState)(null), [focus, setFocus] = (0, import_react7.useState)(null), [askMenu, setAskMenu] = (0, import_react7.useState)(null);
  const [base2, setBase] = (0, import_react7.useState)(snapshot?.workspace.baseRef ?? "main"), [mode, setMode] = (0, import_react7.useState)(snapshot?.workspace.mode ?? "worktree");
  const scrollPositions = (0, import_react7.useRef)(/* @__PURE__ */ new Map()), previousWorkspace = (0, import_react7.useRef)(null), previousReview = (0, import_react7.useRef)(void 0), rereviewId = (0, import_react7.useRef)(null);
  (0, import_react7.useEffect)(() => {
    if (!globalThis.ResizeObserver || !page.current) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      setNarrow(width < 700);
    });
    observer.observe(page.current);
    return () => observer.disconnect();
  }, []);
  const live = state.status === "live", historyId = state.historyId, review = historyId ? state.inspectedReview : snapshot?.review;
  const maxFiles = snapshot?.limits.maxSelectedFiles ?? 20;
  const files = context === "review" && review && snapshot ? snapshot.files.filter((file) => review.paths.includes(file.path)).concat(review.paths.filter((item) => !snapshot.files.some((file) => file.path === item)).map((path2) => ({ path: path2, status: "modified", changed: true, selectable: false }))) : snapshot?.files ?? [];
  const currentFile = files.find((file) => file.path === path);
  const effectivePath = currentFile?.path ?? null;
  const request = (0, import_react7.useMemo)(() => snapshot && effectivePath ? { scope: snapshot.scope, workspaceId: snapshot.workspace.id, path: effectivePath, mode: snapshot.workspace.mode, ...snapshot.workspace.mode === "range" ? { base: snapshot.workspace.baseRef ?? snapshot.workspace.base } : {}, ...context === "review" && review ? { reviewId: review.id } : {} } : null, [snapshot?.scope, snapshot?.workspace.id, snapshot?.workspace.mode, snapshot?.workspace.baseRef, effectivePath, context, review?.id]);
  const fileKey = request ? JSON.stringify(request) : null;
  const fileMatches = fileKey && state.fileKey === fileKey;
  const identity = `${snapshot?.scope}:${context === "review" ? review?.snapshotId : snapshot?.workspace.id}:${effectivePath}`;
  const reviewAvailable = Boolean(snapshot?.dshAvailable);
  const operation = snapshot?.operation;
  const canStop = Boolean(operation?.id);
  const running = Boolean(operation) || activeReview(snapshot?.review);
  (0, import_react7.useEffect)(() => {
    if (!request) {
      clearFile();
      return;
    }
    loadFile(request);
  }, [fileKey, state.fileStatus === "idle"]);
  (0, import_react7.useEffect)(() => {
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
  const changeScope = (value, baseValue = base2) => {
    setMode(value);
    setPath(null);
    setTabs([]);
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
    setTabs([]);
    setFocus(null);
    clearFile();
    loadReview(id);
    setPane("findings");
  };
  const latest = () => {
    setPath(null);
    setTabs([]);
    setFocus(null);
    loadReview(null);
  };
  const openFile = (next, preview = true) => {
    setTabs((value) => addTab(value, next, preview));
    setPath(next);
    setFocus(null);
    setPane("code");
  };
  const closeTabPath = (next) => {
    const result = closeTab(tabs, next, path);
    setTabs(result.tabs);
    if (result.active !== path) {
      setPath(result.active);
      if (!result.active) clearFile();
    }
  };
  const closeOthers = (keep) => {
    setTabs((value) => value.filter((tab) => tab.path === keep));
    setPath(keep);
  };
  const closeAll = () => {
    setTabs([]);
    setPath(null);
    clearFile();
  };
  const openAsk = (target) => setAskMenu(target);
  const quote = (path2, selection) => {
    if (!files.some((file) => file.path === path2)) {
      setNotice("unavailable");
      return;
    }
    const text2 = askPrompt(selection.trim() ? t("askSelectionPrompt") : t("askFilePrompt"), path2, selection);
    if (!text2) {
      setNotice("unavailable");
      return;
    }
    try {
      if (!insertRequest(inputActions, text2)) {
        setNotice("draftChanged");
        return;
      }
      setNotice("inserted");
      setLayout({ panelCollapsed: false, panelTab: "chat" });
      if (narrow) setPane("findings");
    } catch {
      setNotice("insertionUnconfirmed");
    }
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
    openFile(finding.path, false);
    setFocus({ side: finding.side === "before" ? "old" : "new", startLine: finding.startLine, endLine: finding.endLine ?? finding.startLine, findingId: finding.id });
  };
  const changeActivity = (activity) => setLayout(layout.activity === activity && !layout.sidebarCollapsed ? { sidebarCollapsed: true } : { activity, sidebarCollapsed: false });
  if (!sessionId) return /* @__PURE__ */ import_react7.default.createElement("main", { className: "dxc dxc-page" }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-empty" }, /* @__PURE__ */ import_react7.default.createElement(CodeIcon, null), /* @__PURE__ */ import_react7.default.createElement("h1", null, t("title")), /* @__PURE__ */ import_react7.default.createElement("p", null, t("noSession")), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", onClick: back }, t("openConversation"))));
  const counts = { files: files.length, changes: files.filter(isChanged).length, history: snapshot?.history.length ?? 0 };
  const showSidebar = !layout.sidebarCollapsed;
  const showPanel = !layout.panelCollapsed;
  const columnsFor = (sidebar, panel) => `40px ${showSidebar ? `${sidebar}px 4px` : "0px 0px"} minmax(240px,1fr) ${showPanel ? `4px ${panel}px` : "0px 0px"}`;
  const columns = columnsFor(layout.sidebar, layout.panel);
  const paintTrack = (sidebar, panel) => {
    if (workbench.current) workbench.current.style.gridTemplateColumns = columnsFor(sidebar, panel);
  };
  return /* @__PURE__ */ import_react7.default.createElement("main", { className: "dxc dxc-page", ref: page, "data-code-session": sessionId, "data-pane": pane, "data-narrow": narrow || void 0, "data-sidebar": showSidebar || void 0, "data-panel": showPanel || void 0 }, /* @__PURE__ */ import_react7.default.createElement("header", { className: "dxc-titlebar", "data-window-drag": true }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-brand" }, /* @__PURE__ */ import_react7.default.createElement(CodeIcon, null), /* @__PURE__ */ import_react7.default.createElement("h1", null, t("title")), snapshot && /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-repo", title: snapshot.workspace.repoRoot }, basename(snapshot.workspace.repoRoot))), /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-header-actions" }, !narrow && /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", "aria-pressed": showPanel && layout.panelTab === "chat", onClick: () => setLayout({ panelCollapsed: false, panelTab: "chat" }) }, t("chat")), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", className: "dxc-icon-button", "aria-pressed": showSidebar, "aria-label": t("toggleSidebar"), title: t("toggleSidebar"), onClick: () => setLayout({ sidebarCollapsed: !layout.sidebarCollapsed }) }, /* @__PURE__ */ import_react7.default.createElement(SidebarIcon, null)), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", className: "dxc-icon-button", "aria-pressed": showPanel, "aria-label": t("togglePanel"), title: t("togglePanel"), onClick: () => setLayout({ panelCollapsed: !layout.panelCollapsed }) }, /* @__PURE__ */ import_react7.default.createElement(PanelIcon, null))), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", onClick: back }, t("back")), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", onClick: () => {
    clearFile();
    refresh();
  } }, t("refresh")), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", className: "dxc-primary", disabled: !live || !selected.length || !reviewAvailable || running || snapshot?.truncated || snapshot?.complete === false, onClick: () => beginReview("review") }, t("review"), /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-count" }, selected.length)))), /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-toolbar" }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-scope" }, /* @__PURE__ */ import_react7.default.createElement("label", { htmlFor: `code-scope-${sessionId}` }, t("scope")), /* @__PURE__ */ import_react7.default.createElement("select", { id: `code-scope-${sessionId}`, value: mode, onChange: (event) => changeScope(event.target.value) }, /* @__PURE__ */ import_react7.default.createElement("option", { value: "worktree" }, t("mode.worktree")), /* @__PURE__ */ import_react7.default.createElement("option", { value: "staged" }, t("mode.staged")), /* @__PURE__ */ import_react7.default.createElement("option", { value: "range" }, t("mode.range"))), mode === "range" && /* @__PURE__ */ import_react7.default.createElement("form", { onSubmit: (event) => {
    event.preventDefault();
    changeScope("range", base2);
  } }, /* @__PURE__ */ import_react7.default.createElement("input", { "aria-label": t("base"), value: base2, placeholder: t("basePlaceholder"), onChange: (event) => setBase(event.target.value), maxLength: 160 }), /* @__PURE__ */ import_react7.default.createElement("button", { type: "submit", disabled: !base2.trim() }, t("applyBase")))), review && /* @__PURE__ */ import_react7.default.createElement("select", { "aria-label": t("context"), value: context, onChange: (event) => {
    setContext(event.target.value);
    setFocus(null);
    clearFile();
  } }, /* @__PURE__ */ import_react7.default.createElement("option", { value: "current" }, t("current")), /* @__PURE__ */ import_react7.default.createElement("option", { value: "review" }, t("reviewed"), " \xB7 ", shortHash(review.snapshotId)))), historyId && /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-banner dxc-history-banner" }, /* @__PURE__ */ import_react7.default.createElement("span", null, t("viewingHistory"), " \xB7 ", shortHash(review?.snapshotId)), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", onClick: latest }, t("latestReview"))), !live && snapshot && /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxc-banner dxc-warning", role: "alert" }, t("disconnected")), notice && /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxc-banner dxc-warning", role: "alert" }, t(notice, { count: maxFiles }), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", "aria-label": t("close"), onClick: () => setNotice(null) }, "\xD7")), running && /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-banner dxc-running", role: "status" }, /* @__PURE__ */ import_react7.default.createElement("span", { className: "dxc-state-dot" }), /* @__PURE__ */ import_react7.default.createElement("span", null, t(operation && Object.hasOwn(en, `stage.${operation.state}`) ? `stage.${operation.state}` : "state.running")), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", onClick: back }, t("openConversation")), canStop && /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", disabled: !live || state.pending || operation?.state === "cancelling", onClick: async () => {
    const result = await cancel();
    if (!result.ok) setNotice("cancelUnconfirmed");
  } }, t(state.pending || operation?.state === "cancelling" ? "stopping" : "stop"))), snapshot && !reviewAvailable && /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxc-banner" }, t("reviewerMissing")), !snapshot ? /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-empty", role: state.status === "failed" ? "alert" : "status" }, /* @__PURE__ */ import_react7.default.createElement(CodeIcon, null), /* @__PURE__ */ import_react7.default.createElement("p", null, t(state.status === "failed" ? messageKey(state.error?.code) : "loading")), state.status === "failed" && /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", onClick: refresh }, t("retry"))) : /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, narrow && /* @__PURE__ */ import_react7.default.createElement(Tabs, { className: "dxc-mobile-tabs", label: t("title"), value: pane, onChange: setPane, items: [{ value: "files", label: t("files") }, { value: "code", label: t("code") }, { value: "findings", label: `${t("findings")}${review?.findings.length ? ` \xB7 ${review.findings.length}` : ""}` }] }), /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-workbench", ref: workbench, style: narrow ? void 0 : { gridTemplateColumns: columns } }, !narrow && /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxc-track-activity" }, /* @__PURE__ */ import_react7.default.createElement(ActivityBar, { activity: layout.activity, onChange: changeActivity, counts, t })), (narrow || showSidebar) && /* @__PURE__ */ import_react7.default.createElement(Sidebar, { files, path: effectivePath, selected, select: toggleFile, open: (next) => openFile(next), ask: openAsk, t, limit: maxFiles, snapshot, reviewed: context === "review", activity: layout.activity, history: snapshot.history, historyId, inspectHistory, latest, formatTime }), !narrow && showSidebar && /* @__PURE__ */ import_react7.default.createElement(Splitter, { value: layout.sidebar, bounds: SIDEBAR_BOUNDS, label: t("resizeSidebar"), orientation: "vertical", direction: 1, className: "dxc-track-sidebar-splitter", onResize: (value) => setLayout({ sidebar: value }), onPreview: (value) => paintTrack(value, layout.panel), onToggle: () => setLayout({ sidebarCollapsed: !layout.sidebarCollapsed }) }), /* @__PURE__ */ import_react7.default.createElement("section", { className: "dxc-editor" }, /* @__PURE__ */ import_react7.default.createElement(EditorTabs, { path: effectivePath, tabs, select: (next) => setPath(next), close: closeTabPath, reorder: (from, to) => setTabs((value) => moveTab(value, from, to)), closeOthers, closeAll, ask: openAsk, t }), /* @__PURE__ */ import_react7.default.createElement(CodeViewer, { file: fileMatches ? state.file : null, status: fileMatches ? state.fileStatus : effectivePath ? "loading" : "idle", error: fileMatches ? state.fileError : null, path: effectivePath, identity, mode: snapshot.workspace.mode, context, focus, retry: () => {
    clearFile();
    if (request) loadFile(request);
  }, scrollPositions, onAsk: openAsk, t })), !narrow && showPanel && /* @__PURE__ */ import_react7.default.createElement(Splitter, { value: layout.panel, bounds: PANEL_BOUNDS, label: t("resizePanel"), orientation: "vertical", direction: -1, className: "dxc-track-panel-splitter", onResize: (value) => setLayout({ panel: value }), onPreview: (value) => paintTrack(layout.sidebar, value), onToggle: () => setLayout({ panelCollapsed: !layout.panelCollapsed }) }), (narrow || showPanel) && /* @__PURE__ */ import_react7.default.createElement(BottomPanel, { tab: layout.panelTab, setTab: (tab) => setLayout({ panelTab: tab }), review, historyId, inspectHistory, historyStatus: state.historyStatus, jump, rereview: () => beginReview("rereview"), enabled: live && !running && !historyId, canRereview: review?.mode === "worktree" && snapshot.workspace.mode === "worktree", t, formatTime, renderFactorySlot, sessionId, cwd: snapshot.workspace.cwd ?? snapshot.workspace.repoRoot, openSession, startSession, useSession, useConversation, useSessions, useWorkspaces })), askMenu && /* @__PURE__ */ import_react7.default.createElement(AskMenu, { x: askMenu.x, y: askMenu.y, label: t("askMenu"), onClose: () => setAskMenu(null), items: [...askMenu.selection.trim() ? [{ id: "selection", label: t("askSelection"), run: () => quote(askMenu.path, askMenu.selection) }] : [], { id: "file", label: t("askFile"), run: () => quote(askMenu.path, "") }] })));
}
function CodeToolRow({ phase, block, open, t }) {
  const meta = block?.meta, valid = meta?.kind === "dsh-x-code.result" && meta.version === 1;
  const review = valid ? meta.review : null;
  return /* @__PURE__ */ import_react7.default.createElement("section", { className: "dxc dxc-tool" }, /* @__PURE__ */ import_react7.default.createElement("header", null, /* @__PURE__ */ import_react7.default.createElement(CodeIcon, null), /* @__PURE__ */ import_react7.default.createElement("strong", null, t("title")), /* @__PURE__ */ import_react7.default.createElement("span", null, t(phase !== "result" ? "toolRunning" : block?.isError ? "toolFailed" : "historical"))), phase === "result" && /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, review ? /* @__PURE__ */ import_react7.default.createElement("p", null, t(isComplete(review) ? "openFindings" : "incomplete", { count: review.findings?.length ?? 0 }), review.stale ? ` \xB7 ${t("stale")}` : "") : /* @__PURE__ */ import_react7.default.createElement("p", null, t(valid ? "historical" : "toolUnknown")), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", onClick: open }, t("viewWorkbench"))));
}

// src/client/styles.ts
var CSS = `
.dxc{--code-bg:var(--dsw-alias-bg-layer-1,#fff);--code-soft:var(--dsw-alias-bg-layer-2,#f5f6f8);--code-sunken:var(--dsw-specific-sidebar-fill,color-mix(in srgb,var(--dsw-alias-bg-layer-2,#f2f3f5) 70%,var(--dsw-alias-bg-layer-1,#fff)));--code-line:var(--dsw-alias-border-l2,#e2e5e9);--code-line-soft:var(--dsw-alias-border-l1,#eceef1);--code-fg:var(--dsw-alias-label-primary,#20252e);--code-muted:var(--dsw-alias-label-secondary,#717885);--code-accent:var(--dsw-alias-brand-primary,#4666d5);--code-warning:var(--dsw-alias-state-warn-primary,#9b6815);--code-success:var(--dsw-alias-state-success-primary,#2b865c);--code-danger:var(--dsw-alias-state-error-primary,#bb5863);--code-tab-h:35px;color:var(--code-fg);font:13px/1.5 var(--dsw-font-family,system-ui,sans-serif);box-sizing:border-box}
/* Generic element styling stops at the embedded Conversation: the shell owns
   every control, heading and paragraph inside it. */
.dxc :not(.dxc-chat-embed *){box-sizing:border-box;min-width:0}
.dxc-page{height:100%;min-height:0;width:100%;max-width:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--code-bg);container-type:inline-size}
.dxc :is(h1,h2,p):not(.dxc-chat-embed *){margin:0}
.dxc :is(button,input,select):not(.dxc-chat-embed *){font:inherit;color:inherit}
.dxc :is(button,select,input[type=search],input:not([type])):not(.dxc-chat-embed *){border:1px solid var(--code-line);border-radius:6px;background:var(--code-bg)}
.dxc button:not(.dxc-chat-embed *){cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 10px;font-size:12px;line-height:1;border-radius:6px;white-space:nowrap}
.dxc :is(.dxc-file,.dxc-problem,.dxc-finding-title,.dxc-location,.dxc-link,.dxc-history-item,.dxc-tab-popup button,.dxc-context-menu button,.dxc-file-footer button){height:auto;min-height:0}
.dxc button:not(.dxc-chat-embed *):hover:not(:disabled){background:var(--code-soft)}
.dxc :is(button,input,select):not(.dxc-chat-embed *):disabled{opacity:.45;cursor:not-allowed}
.dxc :is(button,input,select,summary,[tabindex]):not(.dxc-chat-embed *):focus-visible{outline:2px solid var(--code-accent);outline-offset:2px}
.dxc input[type=checkbox]{width:13px;height:13px;flex:none;margin:0;accent-color:var(--code-accent)}
.dxc :is(input[type=search],input:not([type]),select):not(.dxc-chat-embed *){height:28px;padding:0 8px;font-size:12px}
.dxc select:not(.dxc-chat-embed *){max-width:100%}
.dxc .dxc-primary{background:var(--code-accent);border-color:var(--code-accent);color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:550}
.dxc .dxc-primary:hover:not(:disabled){background:color-mix(in srgb,var(--code-accent) 90%,#000)}
.dxc-muted{color:var(--code-muted);font-size:11px}
.dxc-warning{color:var(--code-warning)}
.dxc-inline-warning{background:color-mix(in srgb,var(--code-warning) 8%,var(--code-bg));color:var(--code-warning);padding:8px 12px;font:12px/1.5 system-ui,sans-serif;white-space:normal}
.dxc details:not(.dxc-chat-embed *) summary{cursor:pointer;color:var(--code-muted);font-size:11px}
.dxc pre:not(.dxc-chat-embed *){white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;margin:6px 0}
.dxc details:not(.dxc-chat-embed *) p{font-size:12px;margin:7px 0;white-space:pre-wrap;overflow-wrap:anywhere}

/* Title bar: a compact, editor-like header instead of a page hero. It matches
   the official single-row page header: 50px tall (10 + 30 + 10), so its content
   centre lands on the 25px window-chrome baseline and its border on 50px. */
.dxc-titlebar{display:flex;align-items:center;gap:12px;justify-content:space-between;height:50px;padding:0 12px;padding-inline-start:max(12px,var(--dsh-frame-leading-clearance,0px));border-bottom:.5px solid var(--dsw-alias-border-l3,var(--code-line-soft));background:var(--code-sunken);flex:none}
.dxc-brand{display:flex;align-items:center;gap:8px;min-width:0}
.dxc-brand svg{color:var(--code-accent);flex:none;width:16px;height:16px}
.dxc-brand h1{font-size:13px;font-weight:600;letter-spacing:0}
.dxc-repo{color:var(--code-muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-left:1px solid var(--code-line);padding-left:8px;margin-left:2px}
.dxc-header-actions{display:flex;gap:6px;align-items:center;flex:none}
.dxc-header-actions>button{font-size:12px;padding:0 10px}
.dxc-count{display:inline-block;background:color-mix(in srgb,var(--dsw-alias-label-primary-foreground,#fff) 16%,transparent);border-radius:4px;margin-left:6px;padding:0 5px;font-size:10px;font-variant-numeric:tabular-nums}
.dxc-header-actions .dxc-primary .dxc-count{background:color-mix(in srgb,var(--dsw-alias-label-primary-foreground,#fff) 22%,transparent)}
.dxc-icon-button{display:inline-grid;place-items:center;width:28px;height:28px;min-width:28px;padding:0!important;border-color:transparent!important;background:transparent!important;color:var(--code-muted)}
.dxc-icon-button:hover:not(:disabled){background:var(--code-soft)!important;color:var(--code-fg)}
.dxc-icon-button[aria-pressed=true]{color:var(--code-fg);background:color-mix(in srgb,var(--code-accent) 10%,transparent)!important}
.dxc-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;padding:8px 12px;border-bottom:1px solid var(--code-line-soft);flex-wrap:wrap;flex:none;font-size:12px;background:var(--code-bg)}
.dxc-scope{display:flex;gap:6px;align-items:center}
.dxc-scope label{color:var(--code-muted);font-size:11px}
.dxc-scope form{display:flex;gap:5px}
.dxc-scope input{width:145px;font-size:11px}
.dxc-scope select,.dxc-toolbar select,.dxc-scope button{height:28px;font-size:12px;padding:0 10px}
.dxc-banner{display:flex;align-items:center;gap:9px;padding:7px 12px;border-bottom:1px solid var(--code-line);background:var(--code-soft);font-size:11px;flex:none;flex-wrap:wrap}
.dxc-banner>button:last-child{margin-left:auto}
.dxc-banner button{height:28px;font-size:12px;padding:0 10px}
.dxc-running{color:var(--code-accent)}
.dxc-state-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--code-accent);flex:none}
.dxc-review-failed,.dxc-review-interrupted,.dxc-review-blocked{background:var(--code-warning)}

/* Workbench: activity bar, resizable sidebar, editor, resizable review panel. */
.dxc-workbench{display:grid;grid-template-columns:40px 236px 4px minmax(240px,1fr) 4px 328px;flex:1;min-height:0;overflow:hidden}
.dxc-track-activity{grid-column:1;grid-row:1;min-width:0;min-height:0;overflow:hidden;background:var(--code-sunken);border-right:1px solid var(--code-line)}
.dxc-sidebar{grid-column:2;grid-row:1}
.dxc-track-sidebar-splitter{grid-column:3;grid-row:1}
.dxc-editor{grid-column:4;grid-row:1}
.dxc-track-panel-splitter{grid-column:5;grid-row:1}
.dxc-panel{grid-column:6;grid-row:1}
.dxc-activity{display:flex;flex-direction:column;align-items:center;gap:2px;height:100%;padding:6px 0;background:transparent;overflow:visible}
.dxc .dxc-activity-item{position:relative;display:grid;place-items:center;width:32px;height:32px;padding:0!important;border:0!important;background:transparent!important;border-radius:6px;color:var(--code-muted)}
.dxc-activity-item:hover:not(:disabled){background:color-mix(in srgb,var(--code-fg) 7%,transparent)!important;color:var(--code-fg)}
.dxc-activity-item[aria-pressed=true]{color:var(--code-fg);background:color-mix(in srgb,var(--code-fg) 7%,transparent)!important}
.dxc-activity-item[aria-pressed=true]::before{content:'';position:absolute;inset-inline-start:-4px;top:7px;bottom:7px;width:2px;border-radius:2px;background:var(--code-accent)}
.dxc-activity-icon{display:grid;place-items:center}
.dxc-activity-count{position:absolute;top:1px;right:0;min-width:14px;height:14px;padding:0 4px;border-radius:7px;background:var(--code-accent);color:var(--dsw-alias-label-primary-foreground,#fff);font-size:9px;line-height:14px;font-variant-numeric:tabular-nums;text-align:center}
.dxc-sidebar{border-right:1px solid var(--code-line);display:flex;flex-direction:column;overflow:hidden;min-height:0;background:var(--code-sunken)}
.dxc-sidebar-title{display:flex;align-items:center;justify-content:space-between;gap:7px;padding:9px 12px 7px;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.dxc-sidebar-title>strong{font-weight:600;color:var(--code-muted)}
.dxc-sidebar-title>span{color:var(--code-muted);font-size:10px;font-variant-numeric:tabular-nums;text-transform:none;letter-spacing:0}
.dxc-section-title{display:flex;align-items:center;justify-content:space-between;gap:7px;padding:0 14px;font-size:12px}
.dxc-section-title>span{color:var(--code-muted);font-size:11px;font-variant-numeric:tabular-nums}
.dxc-tabs{display:flex;align-items:center;gap:2px;height:28px;background:var(--code-soft);padding:2px;border:1px solid var(--code-line-soft);border-radius:8px;width:max-content;max-width:100%}
.dxc-tabs button{height:24px;border:none;background:transparent;font-size:12px;padding:0 10px;color:var(--code-muted);border-radius:6px}
.dxc-tabs button[aria-selected=true]{background:var(--code-bg);color:var(--code-fg);font-weight:600;box-shadow:0 1px 2px #00000014}
.dxc-sidebar-tabs{margin:0 12px 8px}
.dxc-file-search{display:flex;align-items:center;gap:5px;margin:0 10px 8px;border:1px solid var(--code-line);background:var(--code-bg);border-radius:6px;padding:0 7px;flex:none}
.dxc-file-search>span{color:var(--code-muted);display:grid;place-items:center}
.dxc-file-search input[type=search]{border:0;background:transparent;width:100%;height:28px;padding:0;font-size:12px;outline-offset:5px}
.dxc-file-list{flex:1;overflow:auto;padding:0 6px 12px}
.dxc-tree,.dxc-children{padding:0;margin:0;list-style:none}
.dxc-branch,.dxc-file-row{list-style:none}
.dxc-directory{margin:1px 0}
.dxc-directory>summary{display:flex;align-items:center;gap:3px;padding:3px 6px;border-radius:5px;overflow:hidden;white-space:nowrap;list-style:none;font-size:11px;cursor:pointer;font-weight:550}
.dxc-directory>summary::-webkit-details-marker{display:none}
.dxc-directory>summary:hover{background:color-mix(in srgb,var(--code-fg) 6%,transparent)}
.dxc-disclosure{display:grid;place-items:center;flex:none;color:var(--code-muted);transition:transform .12s}
.dxc-directory[open]>summary .dxc-disclosure{transform:rotate(90deg)}
.dxc-dir-name{overflow:hidden;text-overflow:ellipsis;font-size:11px;letter-spacing:.01em}
.dxc .dxc-type-icon,.dxc .dxc-folder-icon{display:inline-grid;place-items:center;flex:none;width:16px;min-width:16px;height:16px;line-height:0}
.dxc-type-icon svg,.dxc-folder-icon svg{display:block}
.dxc-file-row{display:flex;align-items:center;gap:5px;border-radius:5px;margin:1px 0;padding-right:4px}
.dxc-file-row:hover{background:color-mix(in srgb,var(--code-fg) 5%,transparent)}
.dxc-file-row[data-selected=true]{background:color-mix(in srgb,var(--code-accent) 12%,transparent)}
.dxc-file-row[data-selected=true] .dxc-file-name{color:var(--code-fg);font-weight:550}
.dxc-file{display:flex;align-items:center;gap:6px;width:100%;text-align:left;min-width:0;border:0!important;background:transparent!important;padding:3px 4px!important;font-size:12px!important;border-radius:5px}
.dxc-file:hover:not(:disabled){background:transparent!important}
.dxc-file-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:12px}
.dxc-file-status{font:9px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;min-width:9px;text-align:center;color:var(--code-muted);font-weight:600}
.dxc-status-added,.dxc-status-untracked{color:var(--code-success)}
.dxc-status-deleted{color:var(--code-danger)}
.dxc-status-modified{color:var(--code-warning)}
.dxc-file-footer{padding:7px 10px;border-top:1px solid var(--code-line);font-size:10px;color:var(--code-muted);display:flex;align-items:center;justify-content:space-between;gap:5px;flex-wrap:wrap;flex:none}
.dxc-file-footer button{font-size:10px;padding:1px 5px;background:transparent;border-color:transparent;color:var(--code-accent)}
.dxc-file-footer>span{flex:1}
.dxc-history-pane{flex:1;overflow:auto;padding:2px 10px 12px;display:flex;flex-direction:column;gap:6px}
.dxc-history-pane ol{list-style:none;margin:0;padding:0}
.dxc-history-pane li{margin:2px 0}
.dxc-link{border:0!important;background:transparent!important;color:var(--code-accent)!important;font-size:11px!important;padding:4px 0!important;text-align:left}

/* Editor: tabs, breadcrumbs, code, status bar. */
.dxc-editor{display:flex;flex-direction:column;overflow:hidden;min-height:0;min-width:0;background:var(--code-bg)}
.dxc-editor-tabs{display:flex;align-items:stretch;height:var(--code-tab-h);border-bottom:1px solid var(--code-line);background:var(--code-sunken);overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;flex:none}
.dxc-tab{display:flex;align-items:center;gap:2px;border-right:1px solid var(--code-line);padding:0 2px 0 10px;background:var(--code-sunken);position:relative;max-width:210px;flex:none}
.dxc-tab[data-active=true]{background:var(--code-bg)}
.dxc-tab[data-active=true]::after{content:'';position:absolute;inset-inline:0;top:0;height:1px;background:var(--code-accent)}
.dxc-tab[data-preview=true] .dxc-tab-name{font-style:italic;color:var(--code-muted)}
.dxc-tab[role=tablist]{outline:none}
.dxc-tab button[role=tab]{display:inline-flex;align-items:center;gap:6px;border:0!important;background:transparent!important;padding:0!important;font-size:12px!important;max-width:180px;min-width:0;overflow:hidden;white-space:nowrap;color:var(--code-muted);border-radius:0}
.dxc-tab[data-active=true] button[role=tab]{color:var(--code-fg)}
.dxc-tab button[role=tab]:hover:not(:disabled){background:transparent!important;color:var(--code-fg)}
.dxc-tab-name{display:block;overflow:hidden;text-overflow:ellipsis}
.dxc .dxc-tab-close{display:grid;place-items:center;width:18px;height:18px;padding:0!important;border:0!important;background:transparent!important;border-radius:4px;color:var(--code-muted);opacity:0}
.dxc-tab:hover .dxc-tab-close,.dxc-tab[data-active=true] .dxc-tab-close{opacity:1}
.dxc-tab-close:hover:not(:disabled){background:color-mix(in srgb,var(--code-fg) 12%,transparent)!important;color:var(--code-fg)}
.dxc-tab-menu-wrap{position:relative;margin-left:auto;display:flex;align-items:center;padding:0 4px;flex:none}
.dxc .dxc-tab-menu{display:grid;place-items:center;width:22px;height:22px;padding:0!important;border:0!important;background:transparent!important;color:var(--code-muted)}
.dxc-tab-popup{position:absolute;top:calc(100% + 2px);right:4px;z-index:20;display:flex;flex-direction:column;min-width:130px;padding:4px;background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--code-line);border-radius:7px;box-shadow:0 8px 22px #0000001f}
.dxc-tab-popup button{border:0!important;background:transparent!important;text-align:left;font-size:11px!important;padding:5px 8px!important;border-radius:4px}
.dxc-tab-popup button:hover:not(:disabled){background:var(--code-soft)!important}
.dxc-context-menu{position:fixed;z-index:40;display:flex;flex-direction:column;min-width:168px;padding:4px;background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--code-line);border-radius:7px;box-shadow:0 8px 22px #0000001f}
.dxc-context-menu button{border:0!important;background:transparent!important;justify-content:flex-start;text-align:left;font-size:12px!important;padding:6px 8px!important;border-radius:4px}
.dxc-context-menu button:hover:not(:disabled){background:var(--code-soft)!important}
.dxc-viewer{display:flex;flex-direction:column;overflow:hidden;min-height:0;flex:1;outline:none}
.dxc-viewer-heading{display:flex;gap:10px;align-items:center;padding:6px 12px;flex:none;border-bottom:1px solid var(--code-line-soft);min-height:28px}
.dxc-breadcrumbs{display:flex;align-items:center;gap:1px;overflow:hidden;flex:1;font-size:11px;color:var(--code-muted);white-space:nowrap}
.dxc-crumb{display:inline-flex;align-items:center;gap:4px;overflow:hidden;text-overflow:ellipsis;min-width:0}
.dxc-crumb[data-last]{color:var(--code-fg);flex:none;max-width:none}
.dxc-crumb-sep{display:grid;place-items:center;opacity:.55;flex:none}
.dxc-readonly{font-size:9px;letter-spacing:.04em;color:var(--code-muted);border:1px solid var(--code-line);padding:0 5px;border-radius:4px;flex:none;line-height:16px}
.dxc-viewer-controls{display:flex;justify-content:space-between;align-items:center;padding:5px 10px;gap:8px;flex-wrap:wrap;flex:none;border-bottom:1px solid var(--code-line-soft)}
.dxc-viewer-options{display:flex;gap:4px;align-items:center}
.dxc-viewer-options button,.dxc-viewer-options select{height:28px;font-size:12px;padding:0 10px}
.dxc-viewer-options select{max-width:150px}
.dxc-viewer-options button[aria-pressed=true]{border-color:var(--code-accent);color:var(--code-accent);background:color-mix(in srgb,var(--code-accent) 6%,var(--code-bg))}
.dxc-viewer-options .dxc-icon-button[aria-pressed=true]{border-color:transparent!important}
.dxc-code-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding-bottom:12px;font:12px/1.75 ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;font-variant-ligatures:none;tab-size:2}
.dxc-markdown{max-width:48rem;padding:8px 28px 40px;color:var(--code-fg);font:15px/1.7 var(--dsw-font-family,system-ui,sans-serif)}
.dxc .dxc-markdown :is(h1,h2,h3,h4,p,ul,ol,blockquote){margin:0.75em 0}
.dxc .dxc-markdown h1{margin-top:0.15em;font-size:1.55em;line-height:1.3;font-weight:650}
.dxc .dxc-markdown h2{font-size:1.25em;line-height:1.35;font-weight:650}
.dxc .dxc-markdown h3,.dxc .dxc-markdown h4{font-size:1.08em;font-weight:650}
.dxc .dxc-markdown :is(ul,ol){padding-inline-start:1.4em}
.dxc .dxc-markdown :not(pre)>code{padding:0.1em 0.35em;border-radius:4px;background:var(--code-soft);font:0.92em ui-monospace,SFMono-Regular,Consolas,monospace}
.dxc-code-scroll:has(.dxc-media){display:flex;flex-direction:column;padding-bottom:0}
.dxc-media{flex:1;min-height:0;display:flex;flex-direction:column}
.dxc-media-toolbar{display:flex;align-items:center;gap:4px;padding:6px 10px;border-bottom:1px solid var(--code-line-soft);background:var(--code-bg);flex:none}
.dxc-media-toolbar button{height:26px;padding:0 8px;font-size:11px}
.dxc-media-toolbar>span{font-size:11px;color:var(--code-muted);font-variant-numeric:tabular-nums;padding:0 4px}
.dxc-media-stage{flex:1;min-height:180px;overflow:auto;display:grid;place-items:center;padding:16px;background-color:var(--code-bg);background-image:linear-gradient(45deg,color-mix(in srgb,var(--code-fg) 8%,transparent) 25%,transparent 25%),linear-gradient(-45deg,color-mix(in srgb,var(--code-fg) 8%,transparent) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,color-mix(in srgb,var(--code-fg) 8%,transparent) 75%),linear-gradient(-45deg,transparent 75%,color-mix(in srgb,var(--code-fg) 8%,transparent) 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
.dxc-media-stage img{display:block;image-rendering:auto}
.dxc-media-stage[data-fit=true] img{max-width:100%;max-height:100%;object-fit:contain}
.dxc-player{place-items:center;align-items:center;justify-content:center;background:var(--code-bg);padding:28px 16px}
.dxc-player audio,.dxc-player video{width:min(720px,100%)}
.dxc-source-lines{padding:6px 0;min-width:max-content}
.dxc-source-line{display:grid;grid-template-columns:50px minmax(0,1fr);min-height:21px;padding-right:16px}
.dxc-source-line:hover{background:color-mix(in srgb,var(--code-fg) 3%,transparent)}
.dxc-line-number{font-size:10px;color:var(--code-muted);opacity:.75;text-align:right;padding:0 12px 0 6px;user-select:none;font-variant-numeric:tabular-nums}
.dxc-line-text{white-space:pre;display:block;padding-right:12px}
.dxc-line-text mark{background:#eecb6a66;color:inherit;border-radius:2px}
.dxc-code-scroll[data-wrap=true] .dxc-line-text{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}
.dxc-code-scroll[data-wrap=true] .dxc-source-lines{min-width:0}
.dxc-code-scroll [data-focused=true]{background:color-mix(in srgb,var(--code-accent) 13%,var(--code-bg));box-shadow:inset 3px 0 var(--code-accent)}
.dxc-code-scroll [data-find-active=true]{box-shadow:inset 0 0 0 1px #cda74880;background:color-mix(in srgb,#eecb6a 13%,var(--code-bg))}
.dxc-hunk-header{font-size:10px;line-height:24px;white-space:nowrap;padding:0 12px;color:var(--code-muted);background:var(--code-soft);border-block:1px solid var(--code-line);position:sticky;left:0;overflow:hidden;text-overflow:ellipsis}
.dxc-hunk+.dxc-hunk{margin-top:10px}
.dxc-unified-row{display:grid;grid-template-columns:38px 38px 16px minmax(0,1fr);min-height:21px;min-width:max-content}
.dxc-unified-row .dxc-line-number{padding:0 6px}
.dxc-line-sign{text-align:center;color:var(--code-muted);user-select:none;font-size:11px}
.dxc-line-add{background:color-mix(in srgb,var(--code-success) 10%,var(--code-bg))}
.dxc-line-del{background:color-mix(in srgb,var(--code-danger) 10%,var(--code-bg))}
.dxc-line-add .dxc-line-sign{color:var(--code-success)}
.dxc-line-del .dxc-line-sign{color:var(--code-danger)}
.dxc-line-empty{background:var(--code-soft)}
.dxc-split-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.dxc-split-column{overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scrollbar-width:thin}
.dxc-split-column:first-child{border-right:1px solid var(--code-line)}
.dxc-split-column .dxc-diff-cell{min-width:max-content;overflow:visible;border:0;height:21px}
.dxc-split-column .dxc-line-text{overflow:visible}
.dxc-split-column .dxc-hunk-header{height:26px}
.dxc-split-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.dxc-diff-cell{display:grid;grid-template-columns:36px 14px minmax(0,1fr);min-height:21px;overflow:hidden}
.dxc-diff-cell .dxc-line-text{overflow:hidden}
.dxc-diff-cell:first-child{border-right:1px solid var(--code-line)}
.dxc-diff-cell .dxc-line-number{padding:0 5px}
.dxc-code-scroll[data-wrap=true] .dxc-unified-row{min-width:0}
.dxc-find{display:flex;align-items:center;gap:4px;padding:5px 10px;background:var(--code-soft);border-bottom:1px solid var(--code-line)}
.dxc-find input{flex:1;width:50px}
.dxc-find>span{font-size:10px;color:var(--code-muted);padding:0 4px;white-space:nowrap}
.dxc-find button{display:grid;place-items:center;width:28px;height:28px;font-size:12px;padding:0}
.dxc-statusbar{display:flex;align-items:center;gap:12px;height:22px;padding:0 10px;border-top:1px solid var(--code-line);background:var(--code-sunken);font-size:10px;color:var(--code-muted);flex:none;overflow:hidden;white-space:nowrap}
.dxc-status-item{overflow:hidden;text-overflow:ellipsis}
.dxc-status-spacer{flex:1}
.dxc-state{padding:16px 14px;font:12px/1.7 system-ui,sans-serif;color:var(--code-muted)}
.dxc-state button{margin-top:10px}
.dxc-empty{display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;padding:45px 20px;color:var(--code-muted);text-align:center;font-size:12px;flex:1}
.dxc-empty>svg{width:28px;height:28px;margin-bottom:4px;opacity:.55}
.dxc-empty>span{font:26px/1.5 ui-monospace,monospace;opacity:.45;margin-bottom:7px}
.dxc-empty strong{font-weight:550;color:var(--code-fg)}
.dxc-code-empty{height:100%;min-height:180px}
.dxc-panel-empty{justify-content:flex-start;padding-top:44px;gap:7px}

/* Review panel: Problems list and the full review detail. */
.dxc-panel{border-left:1px solid var(--code-line);display:flex;flex-direction:column;overflow:hidden;min-height:0;background:var(--code-bg)}
.dxc-panel-tabs{display:flex;align-items:center;gap:2px;height:var(--code-tab-h);padding:0 6px;border-bottom:1px solid var(--code-line);background:var(--code-sunken);flex:none;overflow-x:auto;scrollbar-width:thin}
.dxc-panel-tabs button{position:relative;border:0!important;background:transparent!important;font-size:11px!important;padding:0 8px!important;height:100%;color:var(--code-muted);border-radius:0;display:flex;align-items:center;gap:5px;text-transform:uppercase;letter-spacing:.04em}
.dxc-panel-tabs button[aria-selected=true]{color:var(--code-fg)}
.dxc-panel-tabs button[aria-selected=true]::after{content:'';position:absolute;inset-inline:4px;bottom:0;height:1px;background:var(--code-accent)}
.dxc-panel-tabs .dxc-count{margin-left:0;background:color-mix(in srgb,var(--code-fg) 12%,transparent);color:var(--code-fg)}
.dxc-session-bar{display:flex;align-items:center;gap:6px;height:32px;padding:0 8px;border-bottom:1px solid var(--code-line);background:var(--code-bg);flex:none}
.dxc-session-bar select{flex:1;min-width:0;height:24px;font-size:11px}
.dxc-session-bar button{height:24px;padding:0 8px;font-size:11px;flex:none}
.dxc-panel-body{flex:1;overflow:auto;min-height:0;padding-bottom:10px}
.dxc-panel-body:has(.dxc-chat-embed){display:flex;flex-direction:column;overflow:hidden;padding-bottom:0}
/* The embedded official Conversation owns its own scrollport, composer and draft. */
.dxc-chat-embed{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--code-bg)}
.dxc-chat-embed>[data-factory-error],.dxc-chat-embed>[data-slot]{display:flex;flex:1;min-height:0;flex-direction:column}
.dxc-chat-embed :is([data-slot=conversation.session],[data-slot=conversation.view]){display:flex;flex:1;min-height:0;flex-direction:column}
.dxc-chat-embed .dxc-state{padding:16px 14px}
/* The Code launcher is meaningless inside Code's own embedded conversation. */
.dxc-chat-embed [data-slot=conversation.input.dock] .dxc-dock{display:none}
.dxc-problems{padding:4px 0}
.dxc-problem-list{list-style:none;margin:0;padding:0}
.dxc-problem{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-areas:'sev title' 'sev path';gap:1px 8px;width:100%;text-align:left;border:0!important;background:transparent!important;padding:5px 10px!important;border-radius:0}
.dxc-problem:hover:not(:disabled){background:color-mix(in srgb,var(--code-fg) 5%,transparent)!important}
.dxc-problem .dxc-severity{grid-area:sev;align-self:center}
.dxc-problem-title{grid-area:title;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxc-problem-path{grid-area:path;font:10px/1.5 ui-monospace,monospace;color:var(--code-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxc-panel-filter{padding:8px 10px 0}
.dxc-severity-filter{max-width:100%!important;font-size:11px!important;padding:3px 6px!important}
.dxc-review-summary{padding:10px 12px;border-bottom:1px solid var(--code-line)}
.dxc-review-state{display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:3px}
.dxc-review-summary time{display:block;font-size:10px;margin-top:3px}
.dxc-review-summary details{margin-top:7px}
.dxc-notice{padding:9px 11px;margin:9px 10px 0;background:var(--code-soft);border:1px solid var(--code-line);border-radius:6px;font-size:11px}
.dxc-notice p{margin-top:4px;line-height:1.55;color:var(--code-muted)}
.dxc-notice.dxc-warning{border-color:color-mix(in srgb,var(--code-warning) 28%,var(--code-line));background:color-mix(in srgb,var(--code-warning) 5%,var(--code-bg))}
.dxc-findings-list{padding:0 10px}
.dxc-finding{margin:9px 0;padding:10px;background:var(--code-bg);border:1px solid var(--code-line);border-radius:7px}
.dxc-finding-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
.dxc-finding-id{font:9px/1.5 ui-monospace,monospace;color:var(--code-muted)}
.dxc-severity{font-size:9px;line-height:1.8;padding:0 5px;border-radius:4px;background:var(--code-soft);color:var(--code-muted);font-weight:600;white-space:nowrap;text-transform:uppercase;letter-spacing:.02em}
.dxc-severity-critical,.dxc-severity-high{background:color-mix(in srgb,var(--code-danger) 12%,var(--code-bg));color:var(--code-danger)}
.dxc-severity-medium{background:color-mix(in srgb,var(--code-warning) 12%,var(--code-bg));color:var(--code-warning)}
.dxc-severity-low,.dxc-severity-info{background:color-mix(in srgb,var(--code-accent) 10%,var(--code-bg));color:var(--code-accent)}
.dxc-finding-title{display:block;text-align:left;border:0!important;background:transparent!important;padding:0!important;font-size:12px!important;line-height:1.55!important;font-weight:600;white-space:normal!important;border-radius:0}
.dxc-finding-title:hover:not(:disabled){background:transparent!important;color:var(--code-accent)}
.dxc-location{font:10px/1.5 ui-monospace,monospace!important;color:var(--code-accent)!important;border:0!important;background:transparent!important;padding:3px 0!important;display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;border-radius:0}
.dxc-location:hover:not(:disabled){background:transparent!important;text-decoration:underline}
.dxc-location span{color:var(--code-muted)}
.dxc-finding-body{font-size:11px;margin:4px 0 8px!important;line-height:1.65;overflow-wrap:anywhere}
.dxc-finding details{border-top:1px solid var(--code-line);padding-top:6px}
.dxc-detail-label{font-size:10px;font-weight:550;color:var(--code-muted);display:block;margin-top:8px}
.dxc-finding pre{padding:7px;background:var(--code-soft);border-radius:4px}
.dxc-no-findings{padding:22px 3px;color:var(--code-muted);font-size:12px}
.dxc-checks{border-top:1px solid var(--code-line);padding:10px 0;margin-top:8px}
.dxc-checks>p{margin:8px 14px}
.dxc-checks ul{padding:0 14px;margin:8px 0 0;list-style:none}
.dxc-checks li{display:flex;justify-content:space-between;gap:7px;flex-wrap:wrap;font-size:11px;margin:6px 0}
.dxc-checks li>span:first-child{flex:1;overflow-wrap:anywhere}
.dxc-checks details{width:100%}
.dxc-findings-actions{display:flex;flex-direction:column;gap:7px;padding:10px 12px;border-top:1px solid var(--code-line);margin-top:auto;background:var(--code-bg)}
.dxc-findings-actions button{font-size:12px}
.dxc-history{padding:12px 14px 4px;border-top:1px solid var(--code-line)}
.dxc-history ol{list-style:none;margin:8px 0 0;padding:0}
.dxc-history-item{display:flex;flex-direction:column;gap:3px;text-align:left;font-size:10px!important;width:100%;background:transparent!important;border-color:transparent!important;border-radius:5px}
.dxc-history-item:hover:not(:disabled){background:color-mix(in srgb,var(--code-fg) 6%,transparent)!important}
.dxc-history-item[aria-pressed=true]{border-color:var(--code-accent)!important;color:var(--code-accent)}
.dxc-history-item time{color:var(--code-muted)}

/* Resizable separators: a 4px track with a visible hover/active grip. */
.dxc-splitter{position:relative;display:flex;align-items:center;justify-content:center;cursor:col-resize;touch-action:none;outline:none;background:transparent;z-index:3}
.dxc-splitter::before{content:'';position:absolute;inset-block:0;inset-inline-start:50%;width:1px;margin-inline-start:-.5px;background:var(--code-line)}
.dxc-splitter-grip{position:relative;width:3px;height:28px;border-radius:2px;background:transparent;transition:background .12s}
.dxc-splitter:hover .dxc-splitter-grip,.dxc-splitter[data-dragging=true] .dxc-splitter-grip{background:var(--code-accent)}
.dxc-splitter:focus-visible .dxc-splitter-grip{background:var(--code-accent)}
.dxc-splitter[data-dragging=true]::before,.dxc-splitter:hover::before{background:var(--code-accent)}
.dxc-splitter[data-dragging=true]{background:color-mix(in srgb,var(--code-accent) 8%,transparent)}
.dxc-page[data-sidebar=false] .dxc-track-activity{grid-column:1}
.dxc-page[data-panel=false] .dxc-panel,.dxc-page[data-panel=false] .dxc-track-panel-splitter{display:none}

/* Composer dock entry and tool row keep the shared Harness look. */
.dxc-mobile-tabs{display:none}
.dxc-dock{box-sizing:border-box;flex:none;width:calc(100% - var(--dsh-composer-side-clearance,16px) - var(--dsh-composer-side-clearance,16px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));max-width:calc(var(--dsh-composer-card-max-width,952px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));margin:0 auto;padding:0 var(--dsh-composer-dock-inset,8px)}
.dxc-entry{box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;height:32px;margin:0;padding:0 10px;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary,#20252e);font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:13px;font-weight:500;line-height:20px;text-align:left;white-space:nowrap;cursor:pointer}
.dxc-entry:hover{background:var(--dsw-alias-bg-layer-2,#f2f3f5)}
.dxc-entry:active{background:var(--dsw-alias-bg-layer-2,#e9ebee)}
.dxc-entry:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4666d5);outline-offset:-2px}
.dxc-entry-icon{display:grid;place-items:center;flex:none;color:var(--dsw-alias-label-secondary,#717885)}
.dxc-entry-icon svg{width:16px;height:16px}
.dxc-entry-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.dxc-entry-go{display:grid;place-items:center;flex:none;color:var(--dsw-alias-label-secondary,#717885);opacity:.75}
.dxc-tool{padding:12px}
.dxc-tool header{display:flex;align-items:center;gap:7px}
.dxc-tool header>span{font-size:11px;color:var(--code-muted);margin-left:auto}
.dxc-tool p{margin:8px 0;color:var(--code-muted);font-size:12px}
.dxc-tool button{height:28px;font-size:12px;padding:0 10px}

/* Narrow workbench: one pane at a time, chosen by the mobile tabs. */
@container(max-width:699px){.dxc-workbench{display:block;position:relative}.dxc-track-activity,.dxc-splitter,.dxc-statusbar{display:none}.dxc-mobile-tabs{display:flex;margin:8px 12px}.dxc-sidebar,.dxc-editor,.dxc-panel{display:none;height:100%;border:0;min-height:0;grid-column:auto;grid-row:auto}.dxc-page[data-pane=files] .dxc-sidebar{display:flex}.dxc-page[data-pane=code] .dxc-editor{display:flex}.dxc-page[data-pane=findings] .dxc-panel{display:flex}.dxc-file-list{padding-inline:8px}.dxc-findings-actions{flex-direction:row;justify-content:flex-end;flex-wrap:wrap}.dxc-findings-actions>p{width:100%}.dxc-findings-actions button{min-width:120px}}
@container(max-width:560px){.dxc-titlebar{padding:0 8px;gap:8px;height:50px}.dxc-header-actions{gap:4px}.dxc-header-actions>button{font-size:12px;padding:0 8px}.dxc-brand{gap:6px}.dxc-brand h1{font-size:13px}.dxc-repo{max-width:110px;font-size:12px}.dxc-toolbar{padding:6px 8px;gap:6px}.dxc-toolbar select{font-size:12px}.dxc-scope{gap:6px;flex-wrap:wrap}.dxc-scope label{display:none}.dxc-scope input{width:110px;font-size:12px!important}.dxc-banner{padding:7px 10px;font-size:12px}.dxc-viewer-heading{padding:5px 8px}.dxc-readonly{font-size:8px}.dxc-split-control{display:none}.dxc-split-row{grid-template-columns:1fr}.dxc-diff-cell:first-child{border-right:0}.dxc-diff-cell.dxc-line-context:first-child{display:none}.dxc-diff-cell.dxc-line-empty{display:none}.dxc-code-scroll{font-size:11px}.dxc-findings-actions button{min-width:0;flex:1}.dxc-find>span{font-size:9px}.dxc-find{padding-inline:8px}.dxc-source-line{grid-template-columns:40px minmax(0,1fr)}.dxc-source-line .dxc-line-number{padding-right:9px}.dxc-tab{max-width:160px}}
@media(max-height:520px){.dxc-page{overflow-y:auto}.dxc-workbench{flex:1 0 260px;min-height:260px}}
@media(prefers-reduced-motion:reduce){.dxc *{scroll-behavior:auto!important;transition:none!important}}

/* \u2500\u2500 Glass material \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   The Harness glass theme (dsh-x-ui) makes the shared surface tokens
   translucent. Chrome that floats over the transcript needs the blur that
   belongs with that fill; a content pane keeps an opaque fill instead, because
   long-form text and dense tables must not sit on a moving backdrop.

   Two constraints shape this block:
   - backdrop-filter makes its host a containing block for position:fixed
     descendants, so only a surface without one may carry it. The context menu
     in the code workspace is a direct child of its page root, which is why that
     root itself stays untouched.
   - --dxu-blur-panel falls back to none, so every rule below is inert unless
     the glass theme is installed. */

.dxc-titlebar,.dxc-toolbar{backdrop-filter:var(--dxu-blur-panel,none);-webkit-backdrop-filter:var(--dxu-blur-panel,none)}
/* A content pane stays opaque on purpose: it is where text is read. */
.dxc-editor,.dxc-panel,.dxc-sidebar{background:var(--dxu-pane,var(--code-bg))}
`;

// src/client/index.ts
var inject = ["slots", "connection", "layout", "locale", "uiWorkspace"];
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
      selectTarget: (mode, base2) => sessionId && controller.selectTarget(sessionId, mode, base2),
      loadReview: (reviewId) => sessionId && controller.loadReview(sessionId, reviewId),
      loadFile: (target) => sessionId && controller.loadFile(sessionId, target),
      clearFile: () => sessionId && controller.clearFile(sessionId),
      cancel: () => controller.cancel(sessionId),
      openSession: ctx.uiWorkspace ? (id) => ctx.uiWorkspace.openSession(id) : void 0,
      startSession: ctx.uiWorkspace ? (workspaceId) => ctx.uiWorkspace.startSession(workspaceId) : void 0
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
