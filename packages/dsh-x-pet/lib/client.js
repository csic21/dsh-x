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
  let disposed = false;
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
        return url;
      })().finally(() => {
        pending.delete(id);
      });
      pending.set(id, request);
      return request;
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
      timer = setTimeout(tick, plan.frames[index].durationMs);
      return;
    }
    index = next;
    set(plan.frames[index]);
    timer = setTimeout(tick, plan.frames[index].durationMs);
  };
  timer = setTimeout(tick, plan.frames[0].durationMs);
  return () => {
    disposed = true;
    if (timer !== void 0) clearTimeout(timer);
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
    return playSprite(element, animation, { rows, reducedMotion, loop: true });
  }, [url, rows, animation, reducedMotion, look]);
  (0, import_react.useEffect)(() => {
    if (!lookable) {
      setLook(null);
      return;
    }
    let linger;
    const cancel = () => {
      if (linger !== void 0) {
        clearTimeout(linger);
        linger = void 0;
      }
      setLook(null);
    };
    const onMove = (event) => {
      if (event.isPrimary === false || event.pointerType === "touch") return;
      const element = ref.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const over = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      if (over) {
        if (linger !== void 0) clearTimeout(linger);
        linger = setTimeout(cancel, LOOK_LINGER_MS);
      } else if (linger === void 0) return;
      setLook(lookFrame(event.clientX - (bounds.left + bounds.width / 2), event.clientY - (bounds.top + bounds.height / 2)));
    };
    globalThis.addEventListener?.("pointermove", onMove, { passive: true });
    return () => {
      globalThis.removeEventListener?.("pointermove", onMove);
      if (linger !== void 0) clearTimeout(linger);
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
      onPointerDown: props.onPointerDown,
      onClick: props.onClick,
      onKeyDown: props.onKeyDown
    }
  );
}
function PetPicker(props) {
  const { view, t, onSelect, onHide, onClose, failed } = props;
  const dialog = (0, import_react.useRef)(null);
  const pets = view?.pets ?? [];
  (0, import_react.useEffect)(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    globalThis.addEventListener?.("keydown", onKey);
    dialog.current?.focus();
    return () => globalThis.removeEventListener?.("keydown", onKey);
  }, [onClose]);
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-scrim", onClick: (event) => {
    if (event.target === event.currentTarget) onClose();
  } }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-dialog", role: "dialog", "aria-modal": "true", "aria-label": t("picker.title"), ref: dialog, tabIndex: -1 }, /* @__PURE__ */ import_react.default.createElement("header", null, /* @__PURE__ */ import_react.default.createElement("h2", null, t("picker.title")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: onClose }, t("picker.close"))), failed ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-notice" }, t("frame.failed")) : null, pets.length === 0 && !failed ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-empty" }, t("picker.empty", { path: view?.source ?? "~/.codex/pets" })) : /* @__PURE__ */ import_react.default.createElement("ul", { className: "dxp-list" }, pets.map((pet) => /* @__PURE__ */ import_react.default.createElement(PetRow, { key: pet.id, pet, active: view?.active === pet.id, t, onSelect, controller: props.controller }))), /* @__PURE__ */ import_react.default.createElement("footer", null, /* @__PURE__ */ import_react.default.createElement("p", null, t("picker.hint")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: onHide }, t("picker.hide")))));
}
function PetRow(props) {
  const { pet, active, t, onSelect, controller } = props;
  const [url, setUrl] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    controller.atlasUrl(pet.id).then((next) => {
      if (!cancelled) setUrl(next);
    }).catch(() => {
      if (!cancelled) setUrl(null);
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
      style: url ? { backgroundImage: `url(${url})`, backgroundPosition: "0% 0%" } : void 0
    }
  ), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxp-row-text" }, /* @__PURE__ */ import_react.default.createElement("strong", null, pet.displayName), /* @__PURE__ */ import_react.default.createElement("span", null, pet.description || t("picker.rows", { rows: pet.rows }))), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxp-tag" }, t(pet.source === "codex" ? "picker.codex" : pet.source === "local" ? "picker.local" : "picker.bundled"))));
}
function PetFrame(props) {
  const { controller, t } = props;
  const standard = props;
  const [pickerOpen, setPickerOpen] = (0, import_react.useState)(false);
  const [failed, setFailed] = (0, import_react.useState)(false);
  const [url, setUrl] = (0, import_react.useState)(null);
  const [offset, setOffset] = (0, import_react.useState)(null);
  const [dragging, setDragging] = (0, import_react.useState)(false);
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
  (0, import_react.useEffect)(() => {
    void controller.load();
  }, [controller]);
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
  const onPointerDown = (0, import_react.useCallback)((event) => {
    if (event.button !== 0) return;
    const target = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = offset ?? { x: 0, y: 0 };
    const latest = { x: origin.x, y: origin.y };
    let moved = false;
    const onMove = (move) => {
      const dx = move.clientX - startX;
      const dy = move.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      setDragging(true);
      target.setPointerCapture?.(move.pointerId);
      latest.x = origin.x + dx;
      latest.y = origin.y + dy;
      setOffset({ x: latest.x, y: latest.y });
    };
    const onUp = () => {
      globalThis.removeEventListener?.("pointermove", onMove);
      globalThis.removeEventListener?.("pointerup", onUp);
      globalThis.removeEventListener?.("pointercancel", onUp);
      setDragging(false);
      if (moved) void controller.move(latest.x, latest.y).catch(() => {
      });
    };
    globalThis.addEventListener?.("pointermove", onMove);
    globalThis.addEventListener?.("pointerup", onUp);
    globalThis.addEventListener?.("pointercancel", onUp);
  }, [controller, offset]);
  const onClick = (0, import_react.useCallback)((event) => {
    if (dragging) {
      event.preventDefault();
      return;
    }
    setPickerOpen(true);
  }, [dragging]);
  if (active === "off") return null;
  const label = `${t("frame.label")} \xB7 ${t(STATE_LABEL[state])}`;
  const style = offset ? { "--dxp-x": `${offset.x}px`, "--dxp-y": `${offset.y}px` } : void 0;
  return /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp", style, "data-pet-state": state }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-stage" }, /* @__PURE__ */ import_react.default.createElement(
    PetSprite,
    {
      url,
      rows: view?.pets.find((pet) => pet.id === active)?.rows ?? 11,
      state,
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
  ), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-status", role: "status" }, t(STATE_LABEL[state])), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxp-controls" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => setPickerOpen(true) }, t("frame.open")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => {
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
  )), /* @__PURE__ */ import_react.default.createElement("h3", null, t("settings.pick")), pets.length === 0 ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-empty" }, t("settings.empty")) : /* @__PURE__ */ import_react.default.createElement("ul", { className: "dxp-grid" }, pets.map((pet) => /* @__PURE__ */ import_react.default.createElement(SettingsCard, { key: pet.id, pet, active: view?.active === pet.id, t, controller, onSelect: (id) => {
    void controller.select(id).catch(() => {
    });
  } }))), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxp-settings-note" }, t("settings.local", { path: view?.source ? `${view.source}/pets` : "~/.codex/pets" })));
}
function SettingsCard(props) {
  const { pet, active, t, controller, onSelect } = props;
  const [url, setUrl] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    controller.atlasUrl(pet.id).then((next) => {
      if (!cancelled) setUrl(next);
    }).catch(() => {
      if (!cancelled) setUrl(null);
    });
    return () => {
      cancelled = true;
    };
  }, [controller, pet.id]);
  return /* @__PURE__ */ import_react.default.createElement("li", null, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxp-card", "aria-current": active, onClick: () => onSelect(pet.id) }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dxp-card-art", "aria-hidden": "true", style: url ? { backgroundImage: `url(${url})`, backgroundSize: `800% ${pet.rows * 100}%` } : void 0 }), /* @__PURE__ */ import_react.default.createElement("strong", null, pet.displayName), /* @__PURE__ */ import_react.default.createElement("span", null, pet.description || t("picker.rows", { rows: pet.rows }))));
}

// src/client/locales.ts
var NS = "dsh-x-pet";
var zh = {
  "title": "\u684C\u5BA0",
  "frame.label": "\u684C\u5BA0",
  "frame.open": "\u9009\u62E9\u684C\u5BA0",
  "frame.drag": "\u62D6\u52A8\u684C\u5BA0",
  "frame.hide": "\u9690\u85CF\u684C\u5BA0",
  "frame.loading": "\u6B63\u5728\u8F7D\u5165\u684C\u5BA0\u2026",
  "frame.failed": "\u684C\u5BA0\u7CBE\u7075\u8868\u65E0\u6CD5\u8F7D\u5165",
  "frame.failedHint": "\u68C0\u67E5\u56FE\u7247\u662F\u5426\u662F Codex \u89C4\u683C\uFF1A1536\xD71872\uFF089 \u884C\uFF09\u6216 1536\xD72288\uFF0811 \u884C\uFF09\uFF0C\u6BCF\u683C 192\xD7208\u3002",
  "frame.retry": "\u91CD\u8BD5",
  "state.idle": "\u7A7A\u95F2",
  "state.running": "\u5DE5\u4F5C\u4E2D",
  "state.waiting": "\u7B49\u5F85\u4F60\u7684\u8F93\u5165",
  "state.failed": "\u51FA\u9519\u4E86",
  "state.review": "\u67E5\u770B\u7ED3\u679C",
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
  "frame.loading": "Loading the pet\u2026",
  "frame.failed": "This pet spritesheet cannot be loaded",
  "frame.failedHint": "Expected a Codex sheet: 1536\xD71872 (9 rows) or 1536\xD72288 (11 rows), 192\xD7208 per cell.",
  "frame.retry": "Retry",
  "state.idle": "Idle",
  "state.running": "Working",
  "state.waiting": "Waiting for you",
  "state.failed": "Failed",
  "state.review": "Review",
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
.dxp-status{font-size:11px;color:var(--dsw-alias-label-secondary,#717885);background:var(--dsw-alias-bg-overlay,#fff);border:1px solid var(--dsw-alias-border-l1,#e4e7ec);border-radius:999px;padding:1px 8px;opacity:0;transition:opacity .16s ease;white-space:nowrap;pointer-events:none}
.dxp-stage:hover .dxp-status,.dxp-stage:focus-within .dxp-status{opacity:1}
.dxp-scrim{position:fixed;inset:0;z-index:60;background:rgba(15,23,42,.32);display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:auto}
.dxp-dialog{width:min(420px,100%);max-height:min(560px,calc(100vh - 48px));display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#20252e);border:1px solid var(--dsw-alias-border-l2,#d7dbe2);border-radius:14px;box-shadow:0 18px 48px rgba(15,23,42,.24);overflow:hidden}
.dxp-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#eceef1)}
.dxp-dialog h2{margin:0;font-size:14px;font-weight:600}
.dxp-dialog header button{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#717885);border-radius:8px;height:28px;padding:0 10px;font:inherit;cursor:pointer}
.dxp-dialog header button:hover{background:var(--dsw-alias-bg-layer-2,#f1f2f4)}
.dxp-list{list-style:none;margin:0;padding:8px;overflow:auto;display:flex;flex-direction:column;gap:2px}
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
var inject = ["slots", "connection", "locale"];
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
    inject: () => ({ controller })
  }, PetFrame));
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "dsh-x-pet",
    order: 12,
    locale: NS,
    label: () => t("settings.nav"),
    inject: () => ({ controller })
  }, PetSettings));
}
return module.exports; } });
