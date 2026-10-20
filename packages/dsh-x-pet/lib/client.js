window.__ModuleLoader__.load({ id: "dsh-x-pet", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
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

// src/client/controller.ts
var LIST_ENDPOINT = "dsh-x-pet/list";
var SELECT_ENDPOINT = "dsh-x-pet/select";
var MOVE_ENDPOINT = "dsh-x-pet/move";
var ATLAS_ENDPOINT = "dsh-x-pet/atlas";
var ACTIVITY_ENDPOINT = "dsh-x-pet/activity";
var unwrap = (result) => {
  if (!result?.ok) throw new Error(String(result?.error?.code ?? "PET_UNAVAILABLE"));
  return result.value;
};
var EMPTY = {
  pets: [],
  selection: { version: 1, active: "off", chosen: null, position: null },
  active: "off",
  source: null
};
function createPetController(rpc, fetchObject = globalThis.fetch) {
  let view = null;
  let loading = null;
  const listeners = /* @__PURE__ */ new Set();
  const urls = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Map();
  const thumbnails = /* @__PURE__ */ new Map();
  let keepIds = [];
  let disposed = false;
  const MAX_CACHED_ATLASES = 3;
  const publish = (next) => {
    view = next;
    for (const listener of listeners) listener();
  };
  const call = async (endpoint, payload, signal) => unwrap(await rpc.call("/api", endpoint, payload, signal));
  const load = async (signal) => {
    if (loading) return loading;
    loading = (async () => {
      try {
        const next = await call(LIST_ENDPOINT, {}, signal);
        if (!disposed) publish(next);
      } catch {
        if (!disposed && view === null) publish(EMPTY);
      } finally {
        loading = null;
      }
    })();
    return loading;
  };
  return {
    getSnapshot: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    async select(id, signal) {
      const next = await call(SELECT_ENDPOINT, { id }, signal);
      if (!disposed) publish(next);
    },
    async move(x, y) {
      const next = await call(MOVE_ENDPOINT, { x, y });
      if (!disposed) publish(next);
    },
    async activity(ids) {
      if (ids.length === 0) return {};
      try {
        const value = await call(ACTIVITY_ENDPOINT, { ids });
        return value?.activities ?? {};
      } catch {
        return {};
      }
    },
    atlasUrl(id) {
      const cached = urls.get(id);
      if (cached) return Promise.resolve(cached);
      const inFlight = pending.get(id);
      if (inFlight) return inFlight;
      const request = (async () => {
        if (!fetchObject) throw new Error("PET_FETCH");
        const response = await fetchObject(`/api/${ATLAS_ENDPOINT}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method: ATLAS_ENDPOINT, payload: { id } })
        });
        if (!response.ok) throw new Error("PET_ATLAS");
        const blob = await response.blob();
        if (disposed) throw new Error("PET_DISPOSED");
        const url = URL.createObjectURL(blob);
        urls.set(id, url);
        for (const [key, value] of urls) {
          if (urls.size <= MAX_CACHED_ATLASES) break;
          if (key === id || keepIds.includes(key)) continue;
          URL.revokeObjectURL(value);
          urls.delete(key);
        }
        return url;
      })().finally(() => {
        pending.delete(id);
      });
      pending.set(id, request);
      return request;
    },
    async thumbnail(id, rows) {
      const cached = thumbnails.get(id);
      if (cached) return { src: cached, cropped: true };
      const full = await this.atlasUrl(id);
      try {
        const canvas = globalThis.document.createElement("canvas");
        const width = 96;
        const height = Math.round(width * 208 / 192);
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("PET_CANVAS");
        const view2 = globalThis.document?.defaultView ?? globalThis;
        const image = new view2.Image();
        image.src = full;
        try {
          await new Promise((resolve, reject) => {
            const timer = globalThis.setTimeout(() => reject(new Error("PET_DECODE")), 5e3);
            const settle = (run) => {
              globalThis.clearTimeout(timer);
              run();
            };
            image.onload = () => settle(resolve);
            image.onerror = () => settle(() => reject(new Error("PET_DECODE")));
            if (typeof image.decode === "function") image.decode().then(() => settle(resolve)).catch(() => settle(() => reject(new Error("PET_DECODE"))));
          });
          context.imageSmoothingEnabled = false;
          context.drawImage(image, 0, 0, 192, 208, 0, 0, width, height);
        } finally {
          image.onload = null;
          image.onerror = null;
          image.src = "";
        }
        const data = canvas.toDataURL("image/png");
        thumbnails.set(id, data);
        if (keepIds.length > 0 && !keepIds.includes(id) && urls.has(id)) {
          const url = urls.get(id);
          URL.revokeObjectURL(url);
          urls.delete(id);
        }
        return { src: data, cropped: true };
      } catch {
        return { src: full, cropped: false };
      }
    },
    release(keep) {
      keepIds = [...keep];
      const allowed = new Set(keepIds);
      for (const [id, url] of urls) {
        if (allowed.has(id)) continue;
        URL.revokeObjectURL(url);
        urls.delete(id);
      }
      for (const id of [...thumbnails.keys()]) if (!allowed.has(id)) thumbnails.delete(id);
    },
    reset() {
      publish(null);
      loading = null;
    },
    dispose() {
      disposed = true;
      listeners.clear();
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
      pending.clear();
      thumbnails.clear();
    }
  };
}

// src/client/components.tsx
var import_react = __toESM(require("react"), 1);

// src/frames.ts
var CELL_WIDTH = 192;
var CELL_HEIGHT = 208;
var COLUMNS = 8;
var V1_ROWS = 9;
var V2_ROWS = 11;
var V1_HEIGHT = CELL_HEIGHT * V1_ROWS;
var V2_HEIGHT = CELL_HEIGHT * V2_ROWS;
var ATLAS_WIDTH = CELL_WIDTH * COLUMNS;
var LOOK_ROW_A = 9;
var LOOK_STEP_DEGREES = 22.5;
var LOOK_DIRECTIONS = 16;
var row = (rowIndex, count, durationMs, lastMs) => Array.from({ length: count }, (_, column) => ({ row: rowIndex, column, durationMs: column === count - 1 ? lastMs : durationMs }));
var IDLE = [
  { row: 0, column: 0, durationMs: 280 },
  { row: 0, column: 1, durationMs: 110 },
  { row: 0, column: 2, durationMs: 110 },
  { row: 0, column: 3, durationMs: 140 },
  { row: 0, column: 4, durationMs: 140 },
  { row: 0, column: 5, durationMs: 320 }
];
var IDLE_SLOW = IDLE.map((frame) => ({ ...frame, durationMs: frame.durationMs * 6 }));
var STATE_FRAMES = {
  idle: IDLE,
  "running-right": row(1, 8, 120, 220),
  "running-left": row(2, 8, 120, 220),
  waving: row(3, 4, 140, 280),
  jumping: row(4, 5, 140, 280),
  failed: row(5, 8, 140, 240),
  waiting: row(6, 6, 150, 260),
  running: row(7, 6, 120, 220),
  review: row(8, 6, 150, 280)
};
function resolvePlayback(state, options = {}) {
  const frames = STATE_FRAMES[state];
  if (options.reducedMotion) return { frames: [frames[0]], loopStart: null };
  if (state === "idle") return { frames: IDLE_SLOW, loopStart: 0 };
  if (options.loop) return { frames, loopStart: 0 };
  const repeated = [...frames, ...frames, ...frames];
  return { frames: [...repeated, ...IDLE_SLOW], loopStart: repeated.length };
}
var columnPercent = (column) => column / (COLUMNS - 1) * 100;
var rowPercent = (rowIndex, rows) => rowIndex / (rows - 1) * 100;
function lookFrame(dx, dy, deadzone = 1) {
  if (Math.hypot(dx, dy) <= deadzone) return null;
  const angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  const direction = Math.round(angle / LOOK_STEP_DEGREES) % LOOK_DIRECTIONS;
  return { column: direction % COLUMNS, row: LOOK_ROW_A + Math.floor(direction / COLUMNS) };
}

// src/client/playback.ts
function playSprite(element, state, options) {
  const plan = resolvePlayback(state, { reducedMotion: options.reducedMotion, loop: options.loop });
  const set = (frame) => {
    element.style.backgroundPosition = `${columnPercent(frame.column)}% ${rowPercent(frame.row, options.rows)}%`;
    options.onFrame?.(frame);
  };
  let index = 0;
  let timer;
  let disposed = false;
  set(plan.frames[0]);
  if (plan.frames.length === 1) return () => {
    disposed = true;
  };
  const tick = () => {
    if (disposed) return;
    const next = index + 1;
    if (next >= plan.frames.length) {
      if (plan.loopStart === null) return;
      index = plan.loopStart;
      set(plan.frames[index]);
      timer = globalThis.setTimeout(tick, plan.frames[index].durationMs);
      return;
    }
    index = next;
    set(plan.frames[index]);
    timer = globalThis.setTimeout(tick, plan.frames[index].durationMs);
  };
  timer = globalThis.setTimeout(tick, plan.frames[0].durationMs);
  return () => {
    disposed = true;
    if (timer !== void 0) globalThis.clearTimeout(timer);
  };
}
function showLookFrame(element, look, rows) {
  element.style.backgroundPosition = `${columnPercent(look.column)}% ${rowPercent(look.row, rows)}%`;
}
function prefersReducedMotion(view) {
  try {
    return view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

// src/client/components.tsx
var DRAG_THRESHOLD = 6;
var STATE_LABEL = {
  idle: "state.idle",
  running: "state.running",
  "running-right": "state.running",
  "running-left": "state.running",
  waving: "state.idle",
  jumping: "state.idle",
  failed: "state.failed",
  waiting: "state.waiting",
  review: "state.review"
};
function derivePetState(list, statuses, panelActive) {
  if (panelActive) return "idle";
  const rows = Object.values(list?.byId ?? {});
  const current = rows.find((row2) => (row2?.retainedBy?.mainView ?? 0) > 0);
  if (!current?.id) return "idle";
  const status = statuses?.get(current.id);
  if (!status) return "idle";
  if (status.pendingInteraction) return "waiting";
  if (status.running) return "running";
  if (status.completionUnread) return "review";
  return "idle";
}
var LOOK_LINGER_MS = 1e4;
function PetSprite(props) {
  const { url, rows, state, reducedMotion, label } = props;
  const loop = props.loop ?? true;
  const ref = (0, import_react.useRef)(null);
  const [hovered, setHovered] = (0, import_react.useState)(false);
  const [look, setLook] = (0, import_react.useState)(null);
  const animation = hovered ? "jumping" : state;
  const lookable = state === "idle" && rows >= 11 && !reducedMotion;
  (0, import_react.useEffect)(() => {
    const element = ref.current;
    if (!element || !url) return;
    if (look) {
      showLookFrame(element, look, rows);
      return;
    }
    return playSprite(element, animation, { rows, reducedMotion, loop });
  }, [url, rows, animation, reducedMotion, look, loop]);
  (0, import_react.useEffect)(() => {
    if (!lookable) {
      setLook(null);
      return;
    }
    const element = ref.current;
    if (!element) return;
    const host = element.ownerDocument?.defaultView ?? globalThis;
    let linger;
    const cancel = () => {
      if (linger !== void 0) {
        host.clearTimeout(linger);
        linger = void 0;
      }
      setLook(null);
    };
    const onMove = (event) => {
      if (event.isPrimary === false || event.pointerType === "touch") return;
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const over = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      if (over) {
        if (linger !== void 0) host.clearTimeout(linger);
        linger = host.setTimeout(cancel, LOOK_LINGER_MS);
      } else if (linger === void 0) return;
      const next = lookFrame(event.clientX - (bounds.left + bounds.width / 2), event.clientY - (bounds.top + bounds.height / 2));
      setLook((current) => current && next && current.row === next.row && current.column === next.column ? current : next);
    };
    host.addEventListener?.("pointermove", onMove, { passive: true });
    return () => {
      host.removeEventListener?.("pointermove", onMove);
      if (linger !== void 0) host.clearTimeout(linger);
    };
  }, [lookable, rows]);
  if (!url) {
    return /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-fallback", role: "img", "aria-label": label }, label);
  }
  return /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      ref,
      type: "button",
      className: "dxp-sprite",
      "aria-label": label,
      "aria-describedby": props.describedBy,
      "data-codex-pet-state": animation,
      style: { backgroundImage: `url(${url})`, backgroundSize: `800% ${rows * 100}%` },
      onPointerEnter: () => {
        setHovered(true);
        props.onPointerEnter();
      },
      onPointerLeave: () => {
        setHovered(false);
        props.onPointerLeave();
      },
      draggable: false,
      onPointerDown: props.onPointerDown,
      onClick: props.onClick,
      onKeyDown: props.onKeyDown
    }
  );
}
function PetPicker(props) {
  const { view, t, controller, onSelect, onHide, onClose, failed } = props;
  const dialog = (0, import_react.useRef)(null);
  const pets = view?.pets ?? [];
  const activeRef = (0, import_react.useRef)(view?.active ?? "off");
  activeRef.current = view?.active ?? "off";
  (0, import_react.useEffect)(() => () => {
    const active = activeRef.current;
    controller.release(active === "off" ? [] : [active]);
  }, [controller]);
  (0, import_react.useEffect)(() => {
    const host = dialog.current?.ownerDocument?.defaultView ?? globalThis;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    host.addEventListener?.("keydown", onKey);
    dialog.current?.focus();
    return () => host.removeEventListener?.("keydown", onKey);
  }, [onClose]);
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-scrim", onClick: (event) => {
    if (event.target === event.currentTarget) onClose();
  } }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-dialog", role: "dialog", "aria-modal": "true", "aria-label": t("picker.title"), ref: dialog, tabIndex: -1 }, /* @__PURE__ */ import_react.default.createElement("header", null, /* @__PURE__ */ import_react.default.createElement("h2", null, t("picker.title")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: onClose }, t("picker.close"))), failed ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-notice" }, t("frame.failed")) : null, pets.length === 0 && !failed ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-empty" }, t("picker.empty", { path: view?.source ?? "~/.codex/pets" })) : /* @__PURE__ */ import_react.default.createElement("ul", { className: "dxp-list" }, pets.map((pet) => /* @__PURE__ */ import_react.default.createElement(PetRow, { key: pet.id, pet, active: view?.active === pet.id, t, onSelect, controller: props.controller }))), /* @__PURE__ */ import_react.default.createElement("footer", null, /* @__PURE__ */ import_react.default.createElement("p", null, t("picker.hint")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: onHide }, t("picker.hide")))));
}
function PetRow(props) {
  const { pet, active, t, onSelect, controller } = props;
  const [thumb, setThumb] = (0, import_react.useState)(null);
  const url = thumb?.src ?? null;
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    controller.thumbnail(pet.id, pet.rows).then((next) => {
      if (!cancelled) setThumb(next);
    }).catch(() => {
      if (!cancelled) setThumb(null);
    });
    return () => {
      cancelled = true;
    };
  }, [controller, pet.id]);
  return /* @__PURE__ */ import_react.default.createElement("li", null, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxp-row", "aria-current": active, onClick: () => onSelect(pet.id) }, /* @__PURE__ */ import_react.default.createElement(
    "span",
    {
      className: "dxp-thumb",
      "aria-hidden": "true",
      style: url ? thumb?.cropped ? { backgroundImage: `url(${url})`, backgroundSize: "100% 100%" } : { backgroundImage: `url(${url})`, backgroundSize: "800% 1100%", backgroundPosition: "0% 0%" } : void 0
    }
  ), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxp-row-text" }, /* @__PURE__ */ import_react.default.createElement("strong", null, pet.displayName), /* @__PURE__ */ import_react.default.createElement("span", null, pet.description || t("picker.rows", { rows: pet.rows }))), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxp-tag" }, t(pet.source === "codex" ? "picker.codex" : pet.source === "local" ? "picker.local" : "picker.bundled"))));
}
var NOTIFY_KEY = "dsh-x-pet:notify";
var ACTIVITY_POLL_MS = 4e3;
function notificationsAllowed() {
  try {
    if (globalThis.localStorage?.getItem(NOTIFY_KEY) === "off") return false;
    return notificationPermission() === "granted";
  } catch {
    return false;
  }
}
function notificationPermission() {
  try {
    return globalThis.Notification?.permission ?? "denied";
  } catch {
    return "denied";
  }
}
function notifyFinished(title, t) {
  try {
    if (!notificationsAllowed()) return;
    if (globalThis.document?.visibilityState === "visible") return;
    const Ctor = globalThis.Notification;
    if (!Ctor) return;
    new Ctor(t("notify.owner"), { body: title ? t("notify.doneTitle", { title }) : t("notify.done"), tag: "dsh-x-pet" });
  } catch {
  }
}
var formatElapsed = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1e3));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const seconds = total % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};
function activeCandidates(list, statuses) {
  if (!statuses) return [];
  const rows = list?.byId ?? {};
  const candidates = [];
  for (const [id, value] of statuses) {
    const pending = value.pendingInteraction?.kind ?? null;
    if (!value.running && pending === null) continue;
    const row2 = rows[id] ?? {};
    const title = typeof row2.title === "string" && row2.title.trim() ? row2.title.trim().slice(0, 80) : null;
    candidates.push({
      id,
      title,
      running: value.running === true,
      pending,
      main: (row2.retainedBy?.mainView ?? 0) > 0,
      updatedAt: Number(row2.updatedAt ?? 0)
    });
  }
  candidates.sort((left, right) => Number(right.main) - Number(left.main) || right.updatedAt - left.updatedAt);
  return candidates;
}
function usePetNarration(list, statuses, controller, t, enabled = true) {
  const statusKey = statuses ? [...statuses].map(([id, value]) => `${id}:${value.running ? 1 : 0}:${value.pendingInteraction?.kind ?? ""}`).join(",") : "";
  const candidates = (0, import_react.useMemo)(() => activeCandidates(list, statuses), [list, statuses, statusKey]);
  const [activities, setActivities] = (0, import_react.useState)({});
  const [finished, setFinished] = (0, import_react.useState)(null);
  const [celebrate, setCelebrate] = (0, import_react.useState)(false);
  const [dismissed, setDismissed] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const [, setTick] = (0, import_react.useState)(0);
  const since = (0, import_react.useRef)(/* @__PURE__ */ new Map());
  const previous = (0, import_react.useRef)(/* @__PURE__ */ new Map());
  const turns = (0, import_react.useRef)(/* @__PURE__ */ new Map());
  const finishedSeq = (0, import_react.useRef)(0);
  const primary = candidates[0] ?? null;
  const anyRunning = candidates.some((candidate) => candidate.running);
  const ids = candidates.map((candidate) => candidate.id);
  const idKey = ids.join(",");
  (0, import_react.useEffect)(() => {
    if (!statuses) return;
    const done = [];
    const rows2 = list?.byId ?? {};
    for (const [id, value] of statuses) {
      const was = previous.current.get(id);
      const now = value.running === true;
      if (now && was !== true) turns.current.set(id, (turns.current.get(id) ?? 0) + 1);
      if (was === true && !now) {
        const title = rows2[id]?.title;
        done.push({ title: typeof title === "string" && title.trim() ? title.trim() : null });
      }
      previous.current.set(id, now);
    }
    for (const id of [...previous.current.keys()]) if (!statuses.has(id)) previous.current.delete(id);
    for (const id of [...turns.current.keys()]) if (!statuses.has(id)) turns.current.delete(id);
    if (done.length === 0) return;
    if ([...statuses.values()].some((item) => item.pendingInteraction)) return;
    setFinished({ ...done[0], id: ++finishedSeq.current });
    setCelebrate(true);
    notifyFinished(done[0].title, t);
  }, [statuses, list, t]);
  (0, import_react.useEffect)(() => {
    if (!celebrate) return;
    const timer = globalThis.setTimeout(() => setCelebrate(false), 2100);
    return () => globalThis.clearTimeout(timer);
  }, [celebrate]);
  (0, import_react.useEffect)(() => {
    if (!finished) return;
    const timer = globalThis.setTimeout(() => setFinished(null), 9e3);
    return () => globalThis.clearTimeout(timer);
  }, [finished]);
  (0, import_react.useEffect)(() => {
    const map = since.current;
    const now = Date.now();
    for (const candidate of candidates) if (candidate.running && !map.has(candidate.id)) map.set(candidate.id, now);
    for (const id of [...map.keys()]) if (!candidates.some((candidate) => candidate.id === id && candidate.running)) map.delete(id);
  }, [candidates]);
  (0, import_react.useEffect)(() => {
    if (!enabled || !anyRunning) return;
    const timer = globalThis.setInterval(() => setTick((value) => value + 1), 1e3);
    return () => globalThis.clearInterval(timer);
  }, [enabled, anyRunning]);
  (0, import_react.useEffect)(() => {
    if (!enabled || ids.length === 0) {
      setActivities((current) => Object.keys(current).length === 0 ? current : {});
      return;
    }
    let cancelled = false;
    let inFlight = false;
    const load = () => {
      if (inFlight) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      inFlight = true;
      void controller.activity(ids).then((next) => {
        if (!cancelled) setActivities(next);
      }).catch(() => {
      }).finally(() => {
        inFlight = false;
      });
    };
    load();
    const timer = anyRunning ? globalThis.setInterval(load, ACTIVITY_POLL_MS) : void 0;
    return () => {
      cancelled = true;
      if (timer !== void 0) globalThis.clearInterval(timer);
    };
  }, [controller, idKey, anyRunning, enabled]);
  const rows = candidates.map((candidate) => {
    const title = candidate.title ?? t("bubble.untitled");
    const turn = turns.current.get(candidate.id) ?? 0;
    if (candidate.pending) {
      const detail = t(candidate.pending === "question" ? "bubble.question" : "bubble.blocked");
      return { id: candidate.id, title, detail, tone: "waiting", key: `${candidate.id}:waiting:${turn}` };
    }
    const activity = activities[candidate.id];
    const activityText = activity?.phase === "tool" ? t("bubble.tool", { tool: activity.tool ?? "\u2014" }) : activity?.phase === "thinking" ? t("bubble.thinking") : t("bubble.busy");
    const elapsed = formatElapsed(Date.now() - (since.current.get(candidate.id) ?? Date.now()));
    return {
      id: candidate.id,
      title,
      detail: t("bubble.detail", { activity: activityText, elapsed }),
      tone: "working",
      key: `${candidate.id}:working:${turn}`
    };
  });
  let line = null;
  if (primary) {
    const title = primary.title ?? t("bubble.untitled");
    if (primary.pending) {
      line = { title, detail: t(primary.pending === "question" ? "bubble.question" : "bubble.blocked"), tone: "waiting" };
    } else {
      const activity = activities[primary.id];
      const activityText = activity?.phase === "tool" ? t("bubble.tool", { tool: activity.tool ?? "\u2014" }) : activity?.phase === "thinking" ? t("bubble.thinking") : t("bubble.busy");
      const elapsed = formatElapsed(Date.now() - (since.current.get(primary.id) ?? Date.now()));
      line = { title, detail: t("bubble.detail", { activity: activityText, elapsed }), tone: "working" };
    }
  } else if (finished) {
    line = { title: finished.title ?? t("bubble.untitled"), detail: t("bubble.done"), tone: "done" };
  }
  const finishedKey = finished ? `done:${finished.id}` : "";
  const visibleRows = rows.filter((row2) => !dismissed.has(row2.key));
  const visibleLine = line !== null && finishedKey !== "" && !dismissed.has(finishedKey) ? line : null;
  const live = rows.map((row2) => row2.key).join("|") + (finishedKey === "" ? "" : `|${finishedKey}`);
  (0, import_react.useEffect)(() => {
    setDismissed((previous2) => {
      const keep = /* @__PURE__ */ new Set();
      for (const row2 of rows) keep.add(row2.key);
      if (finishedKey !== "") keep.add(finishedKey);
      if (previous2.size === 0) return previous2;
      const next = new Set([...previous2].filter((key) => keep.has(key)));
      return next.size === previous2.size ? previous2 : next;
    });
  }, [live]);
  return {
    line: visibleLine,
    rows: visibleRows,
    lineKey: visibleLine === null ? null : finishedKey,
    primaryId: primary?.id ?? null,
    count: candidates.length,
    celebrate,
    busy: primary?.running === true,
    dismiss: (key) => setDismissed((previous2) => new Set(previous2).add(key))
  };
}
function PetFrame(props) {
  const { controller, t } = props;
  const standard = props;
  const [pickerOpen, setPickerOpen] = (0, import_react.useState)(false);
  const [openError, setOpenError] = (0, import_react.useState)(null);
  const [failed, setFailed] = (0, import_react.useState)(false);
  const [url, setUrl] = (0, import_react.useState)(null);
  const [offset, setOffset] = (0, import_react.useState)(null);
  const dragged = (0, import_react.useRef)(false);
  const dragTeardown = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => () => {
    dragTeardown.current?.();
  }, []);
  const reducedMotion = (0, import_react.useMemo)(() => prefersReducedMotion(globalThis.window), []);
  const list = standard.useSessions((state2) => state2);
  const statuses = standard.useSessionStatus((state2) => state2);
  const panelActive = standard.usePanelInfo((info) => info.activePanelId !== null);
  const state = derivePetState(list, statuses, panelActive === true);
  const view = (0, import_react.useSyncExternalStore)(
    (0, import_react.useCallback)((listener) => controller.subscribe(listener), [controller]),
    (0, import_react.useCallback)(() => controller.getSnapshot(), [controller])
  );
  const active = view?.active ?? "off";
  const narration = usePetNarration(list, statuses, controller, t, active !== "off");
  const animation = narration.celebrate ? "waving" : state;
  (0, import_react.useEffect)(() => {
    void controller.load();
  }, [controller]);
  (0, import_react.useEffect)(() => {
    controller.release(active === "off" ? [] : [active]);
  }, [controller, active]);
  (0, import_react.useEffect)(() => {
    if (active === "off") {
      setUrl(null);
      return;
    }
    let cancelled = false;
    setUrl(null);
    controller.atlasUrl(active).then((next) => {
      if (!cancelled) {
        setUrl(next);
        setFailed(false);
      }
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [controller, active]);
  (0, import_react.useEffect)(() => {
    setOffset(view?.selection?.position ?? null);
  }, [view?.selection?.position?.x, view?.selection?.position?.y]);
  const openConversation = (0, import_react.useCallback)((id) => {
    if (id === null) return;
    try {
      if (typeof props.openSession !== "function") throw new Error("no opener");
      props.openSession(id);
      setOpenError(null);
    } catch (error) {
      const message = error !== null && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      setOpenError(message);
    }
  }, [props.openSession]);
  const onPointerDown = (0, import_react.useCallback)((event) => {
    if (event.button !== 0) return;
    const target = event.currentTarget;
    const host = target.ownerDocument?.defaultView ?? globalThis;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = offset ?? { x: 0, y: 0 };
    const box = target.getBoundingClientRect();
    const limit = (size, viewport) => Math.min(12, Math.round(size) + 28 - viewport);
    const minX = limit(box.width, host.innerWidth ?? 0);
    const minY = limit(box.height, host.innerHeight ?? 0);
    const clampX = (value) => Math.max(minX, Math.min(12, value));
    const clampY = (value) => Math.max(minY, Math.min(12, value));
    const latest = { x: origin.x, y: origin.y };
    let moved = false;
    dragged.current = false;
    const onMove = (move) => {
      const dx = move.clientX - startX;
      const dy = move.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      dragged.current = true;
      target.setPointerCapture?.(move.pointerId);
      latest.x = clampX(origin.x + dx);
      latest.y = clampY(origin.y + dy);
      setOffset({ x: latest.x, y: latest.y });
    };
    const teardown = () => {
      host.removeEventListener?.("pointermove", onMove);
      host.removeEventListener?.("pointerup", onUp);
      host.removeEventListener?.("pointercancel", onUp);
      host.removeEventListener?.("blur", teardown);
      if (dragTeardown.current === teardown) dragTeardown.current = null;
    };
    dragTeardown.current?.();
    dragTeardown.current = teardown;
    const onUp = () => {
      teardown();
      if (!moved) return;
      void controller.move(latest.x, latest.y).catch(() => {
      });
      host.setTimeout(() => {
        dragged.current = false;
      }, 0);
    };
    host.addEventListener?.("pointermove", onMove);
    host.addEventListener?.("pointerup", onUp);
    host.addEventListener?.("pointercancel", onUp);
    host.addEventListener?.("blur", teardown);
  }, [controller, offset]);
  const onClick = (0, import_react.useCallback)((event) => {
    if (dragged.current) {
      dragged.current = false;
      event.preventDefault();
      return;
    }
    setPickerOpen(true);
  }, []);
  if (active === "off") return null;
  const label = `${t("frame.label")} \xB7 ${t(STATE_LABEL[animation])}`;
  const style = offset ? { "--dxp-x": `${offset.x}px`, "--dxp-y": `${offset.y}px` } : void 0;
  return /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp", style, "data-pet-state": animation }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-stage" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-bubbles" }, narration.rows.map((row2) => /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-bubble", key: row2.key, "data-show": "true", "data-tone": row2.tone }, /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      type: "button",
      className: "dxp-bubble-text dxp-bubble-open",
      title: t("bubble.open", { title: row2.title }),
      onClick: () => {
        openConversation(row2.id);
      }
    },
    /* @__PURE__ */ import_react.default.createElement("strong", { className: "dxp-bubble-title" }, row2.title),
    /* @__PURE__ */ import_react.default.createElement("span", { className: "dxp-bubble-detail" }, row2.detail)
  ), /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      type: "button",
      className: "dxp-bubble-close",
      title: t("bubble.close"),
      "aria-label": t("bubble.close"),
      onClick: () => {
        narration.dismiss(row2.key);
      }
    },
    "\xD7"
  ))), narration.line !== null ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-bubble", "data-show": "true", "data-tone": narration.line.tone }, /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      type: "button",
      className: "dxp-bubble-text dxp-bubble-open",
      title: t("bubble.open", { title: narration.line.title }),
      onClick: () => {
        openConversation(narration.primaryId);
      }
    },
    /* @__PURE__ */ import_react.default.createElement("strong", { className: "dxp-bubble-title" }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dxp-bubble-check", "aria-hidden": "true" }, "\u2713"), narration.line.title),
    /* @__PURE__ */ import_react.default.createElement("span", { className: "dxp-bubble-detail" }, narration.line.detail)
  ), /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      type: "button",
      className: "dxp-bubble-close",
      title: t("bubble.close"),
      "aria-label": t("bubble.close"),
      onClick: () => {
        if (narration.lineKey !== null) narration.dismiss(narration.lineKey);
      }
    },
    "\xD7"
  )) : null, openError !== null ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-error", role: "alert" }, t("bubble.navigateFailed", { message: openError })) : null), /* @__PURE__ */ import_react.default.createElement(
    PetSprite,
    {
      url,
      rows: view?.pets.find((pet) => pet.id === active)?.rows ?? 11,
      state: animation,
      loop: animation !== "waving",
      reducedMotion,
      label,
      onPointerEnter: () => {
      },
      onPointerLeave: () => {
      },
      onPointerDown,
      onClick,
      onKeyDown: () => {
      }
    }
  ), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-status" }, t(STATE_LABEL[state])), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-controls" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => setPickerOpen(true) }, t("frame.open")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => {
    void controller.select("off").catch(() => {
    });
  } }, t("frame.hide"))))), pickerOpen ? /* @__PURE__ */ import_react.default.createElement(
    PetPicker,
    {
      view,
      t,
      controller,
      failed,
      onRetry: () => {
        void controller.load();
      },
      onSelect: (id) => {
        void controller.select(id).catch(() => {
        });
        setPickerOpen(false);
      },
      onHide: () => {
        void controller.select("off").catch(() => {
        });
        setPickerOpen(false);
      },
      onClose: () => setPickerOpen(false)
    }
  ) : null);
}
function PetSettings(props) {
  const { controller, t } = props;
  const view = (0, import_react.useSyncExternalStore)(
    (0, import_react.useCallback)((listener) => controller.subscribe(listener), [controller]),
    (0, import_react.useCallback)(() => controller.getSnapshot(), [controller])
  );
  (0, import_react.useEffect)(() => {
    void controller.load();
  }, [controller]);
  const activeRef = (0, import_react.useRef)(view?.active ?? "off");
  activeRef.current = view?.active ?? "off";
  (0, import_react.useEffect)(() => () => {
    const active = activeRef.current;
    controller.release(active === "off" ? [] : [active]);
  }, [controller]);
  const pets = view?.pets ?? [];
  const shown = (view?.active ?? "off") !== "off";
  const restore = view?.selection.chosen && view.selection.chosen !== "off" ? view.selection.chosen : pets[0]?.id;
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxp-settings" }, /* @__PURE__ */ import_react.default.createElement("header", { className: "dxp-settings-head" }, /* @__PURE__ */ import_react.default.createElement("h2", null, t("settings.title")), /* @__PURE__ */ import_react.default.createElement("p", null, t("settings.lead"))), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-switch-row" }, /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("strong", null, t("settings.show")), /* @__PURE__ */ import_react.default.createElement("span", null, t("settings.showHint"))), /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      type: "button",
      role: "switch",
      className: "dxp-switch",
      "aria-checked": shown,
      "aria-label": t("settings.show"),
      onClick: () => {
        void controller.select(shown ? "off" : restore ?? "off").catch(() => {
        });
      }
    }
  )), /* @__PURE__ */ import_react.default.createElement(NotifyRow, { t }), /* @__PURE__ */ import_react.default.createElement("h3", null, t("settings.pick")), pets.length === 0 ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-empty" }, t("settings.empty")) : /* @__PURE__ */ import_react.default.createElement("ul", { className: "dxp-grid" }, pets.map((pet) => /* @__PURE__ */ import_react.default.createElement(SettingsCard, { key: pet.id, pet, active: view?.active === pet.id, t, controller, onSelect: (id) => {
    void controller.select(id).catch(() => {
    });
  } }))), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-settings-note" }, t("settings.local", { path: view?.source ? `${view.source}/pets` : "~/.codex/pets" })));
}
function NotifyRow(props) {
  const { t } = props;
  const [permission, setPermission] = (0, import_react.useState)(notificationPermission);
  const [enabled, setEnabled] = (0, import_react.useState)(() => {
    try {
      return notificationsAllowed();
    } catch {
      return false;
    }
  });
  const toggle = async () => {
    if (enabled) {
      try {
        globalThis.localStorage?.setItem(NOTIFY_KEY, "off");
      } catch {
      }
      setEnabled(false);
      return;
    }
    let state = notificationPermission();
    if (state === "default") {
      try {
        state = await globalThis.Notification.requestPermission();
      } catch {
        state = "denied";
      }
      setPermission(state);
    }
    if (state !== "granted") {
      setEnabled(false);
      return;
    }
    try {
      globalThis.localStorage?.setItem(NOTIFY_KEY, "on");
    } catch {
    }
    setEnabled(true);
  };
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-switch-row" }, /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("strong", null, t("settings.notify")), /* @__PURE__ */ import_react.default.createElement("span", null, permission === "denied" ? t("settings.notifyDenied") : t("settings.notifyHint"))), /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      type: "button",
      role: "switch",
      className: "dxp-switch",
      "aria-checked": enabled && permission === "granted",
      "aria-label": t("settings.notify"),
      onClick: () => {
        void toggle();
      }
    }
  ));
}
function SettingsCard(props) {
  const { pet, active, t, controller, onSelect } = props;
  const [thumb, setThumb] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    controller.thumbnail(pet.id, pet.rows).then((next) => {
      if (!cancelled) setThumb(next);
    }).catch(() => {
      if (!cancelled) setThumb(null);
    });
    return () => {
      cancelled = true;
    };
  }, [controller, pet.id]);
  const art = thumb ? thumb.cropped ? { backgroundImage: `url(${thumb.src})`, backgroundSize: "100% 100%" } : { backgroundImage: `url(${thumb.src})`, backgroundSize: `800% ${pet.rows * 100}%` } : void 0;
  return /* @__PURE__ */ import_react.default.createElement("li", null, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxp-card", "aria-current": active, onClick: () => onSelect(pet.id) }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dxp-card-art", "aria-hidden": "true", style: art }), /* @__PURE__ */ import_react.default.createElement("strong", null, pet.displayName), /* @__PURE__ */ import_react.default.createElement("span", null, pet.description || t("picker.rows", { rows: pet.rows }))));
}

// src/client/locales.ts
var NS = "dsh-x-pet";
var zh = {
  "title": "\u684C\u5BA0",
  "frame.label": "\u684C\u5BA0",
  "frame.open": "\u9009\u62E9\u684C\u5BA0",
  "frame.drag": "\u62D6\u52A8\u684C\u5BA0",
  "frame.hide": "\u9690\u85CF\u684C\u5BA0",
  "frame.popout": "\u72EC\u7ACB\u7A97\u53E3",
  "frame.loading": "\u6B63\u5728\u8F7D\u5165\u684C\u5BA0\u2026",
  "frame.failed": "\u684C\u5BA0\u7CBE\u7075\u8868\u65E0\u6CD5\u8F7D\u5165",
  "frame.failedHint": "\u68C0\u67E5\u56FE\u7247\u662F\u5426\u662F Codex \u89C4\u683C\uFF1A1536\xD71872\uFF089 \u884C\uFF09\u6216 1536\xD72288\uFF0811 \u884C\uFF09\uFF0C\u6BCF\u683C 192\xD7208\u3002",
  "frame.retry": "\u91CD\u8BD5",
  "state.idle": "\u7A7A\u95F2",
  "state.running": "\u5DE5\u4F5C\u4E2D",
  "state.waiting": "\u7B49\u5F85\u4F60\u7684\u8F93\u5165",
  "state.failed": "\u51FA\u9519\u4E86",
  "state.review": "\u67E5\u770B\u7ED3\u679C",
  "bubble.untitled": "\u65B0\u5BF9\u8BDD",
  "bubble.busy": "\u5904\u7406\u4E2D",
  "bubble.thinking": "\u601D\u8003\u4E2D",
  "bubble.tool": "\u6B63\u5728\u7528 {tool}",
  "bubble.detail": "{activity} \xB7 {elapsed}",
  "bubble.blocked": "\u7B49\u4F60\u786E\u8BA4\u4E00\u4E0B",
  "bubble.question": "\u7B49\u4F60\u56DE\u7B54",
  "bubble.done": "\u8FD9\u8F6E\u505A\u5B8C\u4E86",
  "bubble.doneTitle": "\u300C{title}\u300D\u505A\u5B8C\u4E86",
  "bubble.open": "\u6253\u5F00\u300C{title}\u300D",
  "bubble.close": "\u6536\u8D77\u8FD9\u6761\u63D0\u793A\uFF08\u4E0D\u5F71\u54CD\u5BF9\u8BDD\uFF09",
  "bubble.navigateFailed": "\u8DF3\u8F6C\u5931\u8D25\uFF1A{message}",
  "picker.title": "\u9009\u62E9\u684C\u5BA0",
  "picker.close": "\u5173\u95ED",
  "picker.bundled": "\u5185\u7F6E",
  "picker.local": "\u672C\u673A",
  "picker.codex": "Codex",
  "settings.nav": "\u684C\u5BA0",
  "settings.title": "\u684C\u5BA0",
  "settings.lead": "\u5728\u7A97\u53E3\u91CC\u663E\u793A Codex \u684C\u5BA0\u3002\u81EA\u5E26\u89D2\u8272\u8BFB\u53D6\u672C\u673A\u5DF2\u5B89\u88C5\u7684 Codex / ChatGPT\uFF0C\u4E0D\u4F1A\u590D\u5236\u5230\u63D2\u4EF6\u91CC\u3002",
  "settings.show": "\u663E\u793A\u684C\u5BA0",
  "settings.showHint": "\u5173\u6389\u540E\u684C\u5BA0\u4ECE\u7A97\u53E3\u6D88\u5931\uFF0C\u9009\u62E9\u4ECD\u4F1A\u4FDD\u7559\u3002",
  "settings.pick": "\u9009\u62E9\u89D2\u8272",
  "settings.local": "\u81EA\u5DF1\u505A\u7684\u684C\u5BA0\u653E\u5728 {path}\uFF0C\u4F1A\u548C\u8FD9\u4E9B\u89D2\u8272\u51FA\u73B0\u5728\u4E00\u8D77\u3002",
  "settings.empty": "\u6CA1\u6709\u627E\u5230\u672C\u673A\u7684 Codex \u5E94\u7528\uFF0C\u76EE\u524D\u53EA\u6709\u5185\u7F6E\u89D2\u8272\u3002",
  "settings.notify": "\u5B8C\u6210\u65F6\u63D0\u9192",
  "settings.notifyHint": "\u7A97\u53E3\u5728\u540E\u53F0\u65F6\uFF0C\u7528\u7CFB\u7EDF\u901A\u77E5\u544A\u8BC9\u4F60\u8FD9\u8F6E\u505A\u5B8C\u4E86\u3002",
  "settings.notifyDenied": "\u7CFB\u7EDF\u5DF2\u62D2\u7EDD\u901A\u77E5\u6743\u9650\uFF0C\u9700\u8981\u5728\u7CFB\u7EDF\u8BBE\u7F6E\u91CC\u6253\u5F00\u3002",
  "notify.owner": "DeepSeek Harness",
  "notify.done": "\u8FD9\u8F6E\u5BF9\u8BDD\u505A\u5B8C\u4E86",
  "notify.doneTitle": "\u300C{title}\u300D\u505A\u5B8C\u4E86",
  "picker.rows": "{rows} \u884C\u52A8\u753B",
  "picker.active": "\u5F53\u524D",
  "picker.hide": "\u9690\u85CF\u684C\u5BA0",
  "picker.empty": "\u8FD8\u6CA1\u6709\u672C\u5730\u684C\u5BA0\u3002\u628A Codex \u684C\u5BA0\u653E\u8FDB {path}\uFF0C\u5B83\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002",
  "picker.hint": "\u4E0E Codex \u684C\u5BA0\u5171\u7528\u540C\u4E00\u4EFD\u7CBE\u7075\u8868\u548C\u540C\u4E00\u4E2A\u76EE\u5F55\u3002",
  "picker.unavailable": "\u65E0\u6CD5\u8BFB\u53D6\u672C\u673A\u684C\u5BA0\u76EE\u5F55\uFF0C\u4EC5\u663E\u793A\u5185\u7F6E\u684C\u5BA0\u3002",
  "picker.selectFailed": "\u65E0\u6CD5\u5207\u6362\u684C\u5BA0\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  "picker.more": "\u8FD8\u6709 {count} \u4E2A\u672A\u5217\u51FA"
};
var en = {
  "title": "Pet",
  "frame.label": "Desktop pet",
  "frame.open": "Choose a pet",
  "frame.drag": "Drag the pet",
  "frame.hide": "Hide the pet",
  "frame.popout": "Detached window",
  "frame.loading": "Loading the pet\u2026",
  "frame.failed": "This pet spritesheet cannot be loaded",
  "frame.failedHint": "Expected a Codex sheet: 1536\xD71872 (9 rows) or 1536\xD72288 (11 rows), 192\xD7208 per cell.",
  "frame.retry": "Retry",
  "state.idle": "Idle",
  "state.running": "Working",
  "state.waiting": "Waiting for you",
  "state.failed": "Failed",
  "state.review": "Review",
  "bubble.untitled": "New conversation",
  "bubble.busy": "Working",
  "bubble.thinking": "Thinking",
  "bubble.tool": "Running {tool}",
  "bubble.detail": "{activity} \xB7 {elapsed}",
  "bubble.blocked": "Waiting for your approval",
  "bubble.question": "Waiting for your answer",
  "bubble.done": "This turn is done",
  "bubble.doneTitle": '"{title}" is done',
  "bubble.open": 'Open "{title}"',
  "bubble.close": "Hide this bubble (the conversation keeps running)",
  "bubble.navigateFailed": "Could not open it: {message}",
  "picker.title": "Choose a pet",
  "picker.close": "Close",
  "picker.bundled": "Bundled",
  "picker.local": "Local",
  "picker.codex": "Codex",
  "settings.nav": "Pet",
  "settings.title": "Desktop pet",
  "settings.lead": "Shows a Codex pet in the frame. Built-in characters are read from the Codex or ChatGPT app installed on this Mac and are not copied into the plugin.",
  "settings.show": "Show the pet",
  "settings.showHint": "Turning this off hides the pet. Your choice is kept.",
  "settings.pick": "Choose a character",
  "settings.local": "Pets you make yourself go in {path} and show up here with the others.",
  "settings.empty": "No Codex app was found on this Mac, so only the bundled pet is available.",
  "settings.notify": "Tell me when a turn finishes",
  "settings.notifyHint": "When the window is in the background, a system notification says the turn is done.",
  "settings.notifyDenied": "Notifications are blocked in the system settings.",
  "notify.owner": "DeepSeek Harness",
  "notify.done": "This conversation finished its turn",
  "notify.doneTitle": '"{title}" finished its turn',
  "picker.rows": "{rows} animation rows",
  "picker.active": "Active",
  "picker.hide": "Hide the pet",
  "picker.empty": "No local pets yet. Put a Codex pet in {path} and it appears here.",
  "picker.hint": "The same spritesheet and the same folder as Codex pets.",
  "picker.unavailable": "The local pet folder is unavailable; only the bundled pet is listed.",
  "picker.selectFailed": "Could not switch pets. Try again.",
  "picker.more": "{count} more not listed"
};

// src/client/styles.ts
var CSS = `
.dxp{--dxp-size:7.04rem;position:absolute;right:0;bottom:0;z-index:40;pointer-events:none;font:12px/1.4 var(--dsw-font-family,system-ui,sans-serif);color:var(--dsw-alias-label-primary,#20252e)}
.dxp *{box-sizing:border-box}
.dxp-stage{position:absolute;right:calc(20px - var(--dxp-x,0px));bottom:calc(20px - var(--dxp-y,0px));display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:auto}
.dxp-sprite{position:relative;width:var(--dxp-size);aspect-ratio:192/208;background-repeat:no-repeat;background-size:800% 1100%;image-rendering:pixelated;cursor:grab;touch-action:none;border:0;padding:0;background-color:transparent;filter:drop-shadow(0 6px 10px rgba(15,23,42,.18));transition:transform .18s ease}
.dxp-sprite:active{cursor:grabbing;transform:scale(.98)}
.dxp-sprite:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4666d5);outline-offset:4px;border-radius:18px}
.dxp-sprite[data-loading=true]{opacity:0}
.dxp-fallback{display:flex;align-items:center;justify-content:center;width:var(--dxp-size);aspect-ratio:192/208;border-radius:18px;background:var(--dsw-alias-bg-layer-2,#f4f4f5);border:1px dashed var(--dsw-alias-border-l2,#cbd2dc);color:var(--dsw-alias-label-secondary,#717885);text-align:center;padding:8px;font-size:11px}
.dxp-controls{display:flex;align-items:center;gap:4px;padding:2px;border-radius:999px;background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--dsw-alias-border-l1,#e4e7ec);box-shadow:0 2px 8px rgba(15,23,42,.12);opacity:0;transform:translateY(2px);transition:opacity .16s ease,transform .16s ease;pointer-events:none}
.dxp-stage:hover .dxp-controls,.dxp-stage:focus-within .dxp-controls{opacity:1;transform:none;pointer-events:auto}
.dxp-controls button{display:inline-flex;align-items:center;justify-content:center;height:24px;min-width:24px;padding:0 8px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:11px;cursor:pointer;white-space:nowrap}
.dxp-controls button:hover{background:var(--dsw-alias-bg-layer-2,#f1f2f4)}
.dxp-controls button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4666d5);outline-offset:1px}
/* Every line of a stack shares one width, so the bubbles read as a column
   instead of a ragged pile of different sizes. The padding leaves room for the
   shadows and the negative margin cancels it again, so they stay aligned with
   the sprite above the controls. */
.dxp-bubbles{--dxp-bubble-w:232px;display:flex;flex-direction:column;align-items:stretch;gap:6px;width:calc(var(--dxp-bubble-w) + 16px);max-height:min(300px,44vh);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:none;-ms-overflow-style:none;padding:6px 8px;margin:-6px -8px 2px}
/* A scrollbar in this corner would be a gray gutter wedged beside the bubbles.
   The stack still scrolls by wheel and trackpad, with no bar to look at. */
.dxp-bubbles::-webkit-scrollbar{display:none;width:0;height:0}
/* With nothing to say the stack must not leave a click-blocking strip above the
   pet: the padding that holds the shadows would otherwise be hit-testable. */
.dxp-bubbles:empty{display:none}
/* Only the bubble nearest the pet keeps its tail; the rest of the stack is one
   card after another. The 6px bottom padding above holds the tail, so it never
   turns into scrollable overflow. */
.dxp-bubbles .dxp-bubble::after{display:none}
.dxp-bubbles .dxp-bubble:last-of-type::after{display:block}
/* A raised surface reads as a card here; the overlay token is a darker gray and
   made the bubbles look like dimmed panels floating over the page. */
.dxp-bubble{position:relative;display:flex;align-items:center;gap:6px;padding:7px 8px 7px 10px;border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#20252e);border:1px solid var(--dsw-alias-border-l2,#d7dbe2);box-shadow:0 1px 2px rgba(15,23,42,.05),0 3px 8px rgba(15,23,42,.07);font-size:12px;line-height:1.35;pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity .18s ease,transform .18s ease}
.dxp-bubble-text{display:flex;flex-direction:column;gap:1px;min-width:0;text-align:left}
.dxp-bubble-title{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary,#717885);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.dxp-bubble-detail{font-size:12px;overflow-wrap:anywhere}
.dxp-bubble[data-tone=waiting]{border-color:var(--dsw-alias-link,#4176e6)}
.dxp-bubble[data-tone=done]{border-color:var(--dsw-alias-state-success-primary,#12805c)}
.dxp-bubble-more{flex:none;min-width:24px;height:20px;padding:0 5px;border:1px solid var(--dsw-alias-border-l2,#d7dbe2);border-radius:999px;background:var(--dsw-alias-bg-layer-2,#f4f5f7);color:var(--dsw-alias-label-secondary,#717885);font:inherit;font-size:10px;cursor:pointer;pointer-events:auto}
.dxp-bubble-more:hover{background:var(--dsw-alias-bg-layer-3,#e9ebef)}
.dxp-bubble-more:focus-visible{outline:2px solid var(--dsw-alias-link,#4176e6);outline-offset:1px}
.dxp-bubble-check{color:var(--dsw-alias-state-success-primary,#12805c);margin-right:3px;font-weight:700}
.dxp-bubble[data-tone=waiting] .dxp-bubble-title{color:var(--dsw-alias-link,#4176e6)}
.dxp-bubble-open{flex:1;border:0;background:transparent;font:inherit;color:inherit;padding:0;text-align:left;cursor:pointer;pointer-events:auto}
.dxp-bubble-open:hover .dxp-bubble-title{color:var(--dsw-alias-label-primary,#20252e)}
.dxp-error{margin:2px 0 0;padding:0 6px;font-size:11px;line-height:1.35;color:var(--dsw-alias-state-error-primary,#c2410c);overflow-wrap:anywhere}
.dxp-bubble-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary,#8a919c);font:inherit;font-size:14px;line-height:1;cursor:pointer;pointer-events:auto}
.dxp-bubble-close:hover{background:var(--dsw-alias-bg-layer-3,#e9ebef);color:var(--dsw-alias-label-primary,#20252e)}
.dxp-bubble-close:focus-visible{outline:2px solid var(--dsw-alias-link,#4176e6);outline-offset:1px}
.dxp-bubble[data-show=true]{opacity:1;transform:none}
.dxp-bubble::after{content:"";position:absolute;left:50%;bottom:-5px;width:8px;height:8px;margin-left:-4px;transform:rotate(45deg);background:inherit;border-right:1px solid var(--dsw-alias-border-l2,#d7dbe2);border-bottom:1px solid var(--dsw-alias-border-l2,#d7dbe2)}
.dxp-stage:hover .dxp-status,.dxp-stage:focus-within .dxp-status{opacity:1}
.dxp-status{font-size:11px;color:var(--dsw-alias-label-secondary,#717885);background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--dsw-alias-border-l1,#e4e7ec);border-radius:999px;padding:1px 8px;opacity:0;transition:opacity .16s ease;white-space:nowrap;pointer-events:none}
.dxp-scrim{position:fixed;inset:0;z-index:60;background:rgba(15,23,42,.32);display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:auto}
.dxp-dialog{width:min(420px,100%);max-height:min(560px,calc(100vh - 48px));display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#20252e);border:1px solid var(--dsw-alias-border-l2,#d7dbe2);border-radius:14px;box-shadow:0 18px 48px rgba(15,23,42,.24);overflow:hidden}
.dxp-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#eceef1)}
.dxp-dialog h2{margin:0;font-size:14px;font-weight:600}
.dxp-dialog header button{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#717885);border-radius:8px;height:28px;padding:0 10px;font:inherit;cursor:pointer}
.dxp-dialog header button:hover{background:var(--dsw-alias-bg-layer-2,#f1f2f4)}
.dxp-row{display:flex;align-items:center;gap:12px;width:100%;padding:8px;border:1px solid transparent;border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dxp-row:hover{background:var(--dsw-alias-bg-layer-2,#f4f5f7)}
.dxp-row[aria-current=true]{border-color:var(--dsw-alias-brand-primary,#4666d5);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4666d5) 8%,transparent)}
.dxp-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4666d5);outline-offset:1px}
.dxp-thumb{width:44px;height:48px;flex:none;border-radius:8px;background-repeat:no-repeat;background-size:800% 1100%;image-rendering:pixelated;background-color:var(--dsw-alias-bg-layer-2,#f4f5f7)}
.dxp-row-text{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
.dxp-row-text strong{font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxp-row-text span{font-size:11px;color:var(--dsw-alias-label-secondary,#717885);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxp-tag{flex:none;font-size:10px;letter-spacing:.02em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#717885);border:1px solid var(--dsw-alias-border-l1,#e4e7ec);border-radius:999px;padding:1px 6px}
.dxp-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px 14px;border-top:1px solid var(--dsw-alias-border-l1,#eceef1);font-size:11px;color:var(--dsw-alias-label-secondary,#717885)}
.dxp-dialog footer p{margin:0;overflow-wrap:anywhere}
.dxp-empty{margin:0;padding:18px 16px;color:var(--dsw-alias-label-secondary,#717885);font-size:12px;overflow-wrap:anywhere}
.dxp-notice{margin:0;padding:8px 16px 0;color:var(--dsw-alias-state-warn-primary,#b45309);font-size:11px}
.dxp-settings{display:flex;flex-direction:column;gap:16px;max-width:720px;padding:8px 4px 24px;color:var(--dsw-alias-label-primary,#20252e)}
.dxp-settings-head h2{margin:0 0 6px;font-size:18px;font-weight:650}
.dxp-settings-head p,.dxp-settings-note,.dxp-switch-row span{margin:0;color:var(--dsw-alias-label-secondary,#717885);font-size:13px;line-height:1.5}
.dxp-settings h3{margin:8px 0 0;font-size:13px;font-weight:650}
.dxp-switch-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2,#d7dbe2);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff)}
.dxp-switch-row strong{display:block;font-size:13px;margin-bottom:2px}
.dxp-switch{position:relative;width:40px;height:24px;flex:none;border:0;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-secondary,#717885) 55%,var(--dsw-alias-bg-layer-2,#2a2e35));cursor:pointer;padding:0}
.dxp-switch::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.35);transition:transform .16s ease}
.dxp-switch[aria-checked=true]{background:var(--dsw-alias-link,#4176e6)}
.dxp-switch[aria-checked=true]::after{transform:translateX(16px)}
.dxp-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4666d5);outline-offset:2px}
.dxp-grid{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px;margin:0;padding:0}
.dxp-card{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;min-height:168px;padding:12px 10px;border:1px solid var(--dsw-alias-border-l2,#d7dbe2);border-radius:14px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;cursor:pointer;text-align:center}
.dxp-card:hover{background:var(--dsw-alias-bg-layer-2,#f4f5f7)}
.dxp-card[aria-current=true]{border-color:var(--dsw-alias-link,#4176e6);box-shadow:inset 0 0 0 1px var(--dsw-alias-link,#4176e6)}
.dxp-card:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4666d5);outline-offset:2px}
.dxp-card strong{font-size:13px}
.dxp-card span{font-size:11px;line-height:1.4;color:var(--dsw-alias-label-secondary,#717885)}
.dxp-card-art{width:72px;height:78px;background-repeat:no-repeat;background-position:0 0;image-rendering:pixelated}
@media (prefers-reduced-motion:reduce){.dxp-sprite,.dxp-switch::after{transition:none}}
@media (max-width:720px){.dxp{--dxp-size:88px}}
`;

// src/client/index.ts
var inject = ["slots", "connection", "locale", "uiWorkspace"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "pet: dictionaries");
  const t = ctx.locale.bind(NS);
  const controller = createPetController(ctx.connection.rpc);
  ctx.effect(() => () => controller.dispose(), "pet: controller");
  ctx.on("connection/reset", () => controller.reset());
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = NS;
    style.textContent = CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, "pet: styles");
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    name: "shell.overlay",
    id: "dsh-x-pet",
    order: 40,
    locale: NS,
    label: () => t("title"),
    inject: () => ({ controller, openSession: (id) => {
      const workspace = ctx.uiWorkspace;
      if (workspace === void 0 || typeof workspace.openSession !== "function") throw new Error("uiWorkspace.openSession is unavailable");
      workspace.openSession(id);
    } })
  }, PetFrame));
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "dsh-x-pet",
    order: 12,
    locale: NS,
    label: () => t("settings.nav"),
    inject: () => ({ controller, openSession: (id) => {
      const workspace = ctx.uiWorkspace;
      if (workspace === void 0 || typeof workspace.openSession !== "function") throw new Error("uiWorkspace.openSession is unavailable");
      workspace.openSession(id);
    } })
  }, PetSettings));
}
return module.exports; } });
