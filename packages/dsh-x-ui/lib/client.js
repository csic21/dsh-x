window.__ModuleLoader__.load({ id: "dsh-x-ui", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
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
var READ_ENDPOINT = "dsh-x-ui/read";
var WRITE_ENDPOINT = "dsh-x-ui/write";
var unwrap = (result) => {
  if (!result?.ok) throw new Error(String(result?.error?.code ?? "UI_UNAVAILABLE"));
  return result.value;
};
function createUiController(rpc) {
  let snapshot = null;
  let saving = false;
  let failure = null;
  const listeners = /* @__PURE__ */ new Set();
  const publish = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load(signal) {
      try {
        const next = unwrap(await rpc.call("/api", READ_ENDPOINT, {}, signal));
        snapshot = next;
        failure = null;
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
      publish();
    },
    async update(patch, signal) {
      saving = true;
      failure = null;
      publish();
      try {
        snapshot = unwrap(await rpc.call("/api", WRITE_ENDPOINT, patch, signal));
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      } finally {
        saving = false;
        publish();
      }
    },
    isSaving: () => saving,
    error: () => failure,
    dispose() {
      listeners.clear();
    }
  };
}

// src/client/components.tsx
var import_react = __toESM(require("react"), 1);
var LEVELS = ["clear", "regular", "dense"];
function GlassSettings({ controller, t }) {
  const snapshot = (0, import_react.useSyncExternalStore)(
    (0, import_react.useCallback)((listener) => controller.subscribe(listener), [controller]),
    (0, import_react.useCallback)(() => controller.getSnapshot(), [controller])
  );
  const saving = (0, import_react.useSyncExternalStore)(
    (0, import_react.useCallback)((listener) => controller.subscribe(listener), [controller]),
    (0, import_react.useCallback)(() => controller.isSaving(), [controller])
  );
  const error = (0, import_react.useSyncExternalStore)(
    (0, import_react.useCallback)((listener) => controller.subscribe(listener), [controller]),
    (0, import_react.useCallback)(() => controller.error(), [controller])
  );
  const update = (0, import_react.useCallback)((patch) => {
    void controller.update(patch);
  }, [controller]);
  if (snapshot === null) {
    return import_react.default.createElement(
      "div",
      { className: "dxu-row" },
      import_react.default.createElement(
        "div",
        { className: "dxu-rowText" },
        import_react.default.createElement("div", { className: "dxu-title" }, t("settings.title")),
        import_react.default.createElement("div", { className: "dxu-desc" }, t("settings.lead"))
      ),
      import_react.default.createElement("span", { className: "dxu-muted" }, t("settings.saving"))
    );
  }
  const appearance = snapshot;
  const disabled = saving;
  return import_react.default.createElement(
    "div",
    { className: "dxu-row", "data-disabled": disabled },
    import_react.default.createElement(
      "div",
      { className: "dxu-rowText" },
      import_react.default.createElement("div", { className: "dxu-title" }, t("settings.title")),
      import_react.default.createElement("div", { className: "dxu-desc" }, t("settings.lead"))
    ),
    import_react.default.createElement(
      "div",
      { className: "dxu-controls" },
      import_react.default.createElement(
        "div",
        { className: "dxu-line" },
        import_react.default.createElement("span", { className: "dxu-label" }, t("settings.enable")),
        import_react.default.createElement("button", {
          type: "button",
          role: "switch",
          className: "dxu-switch",
          "aria-checked": appearance.enabled,
          "aria-label": t("settings.enable"),
          disabled,
          onClick: () => update({ enabled: !appearance.enabled })
        }, import_react.default.createElement("span", { className: "dxu-thumb" }))
      ),
      import_react.default.createElement(
        "div",
        { className: "dxu-field" },
        import_react.default.createElement("span", { className: "dxu-label" }, t("settings.level")),
        import_react.default.createElement(
          "div",
          {
            className: "dxu-segments",
            role: "group",
            "aria-label": t("settings.level"),
            style: {
              "--dxu-segment-count": LEVELS.length,
              "--dxu-segment-index": LEVELS.indexOf(appearance.level)
            }
          },
          import_react.default.createElement("span", { className: "dxu-indicator", "aria-hidden": "true" }),
          LEVELS.map((level) => import_react.default.createElement("button", {
            key: level,
            type: "button",
            className: "dxu-segment",
            "aria-pressed": appearance.level === level,
            disabled,
            onClick: () => update({ level })
          }, t(`settings.level.${level}`)))
        ),
        import_react.default.createElement("div", { className: "dxu-hint" }, t("settings.levelHint"))
      ),
      import_react.default.createElement(
        "div",
        { className: "dxu-line" },
        import_react.default.createElement("span", { className: "dxu-label" }, t("settings.backdrop")),
        import_react.default.createElement("button", {
          type: "button",
          role: "switch",
          className: "dxu-switch",
          "aria-checked": appearance.backdrop,
          "aria-label": t("settings.backdrop"),
          disabled,
          onClick: () => update({ backdrop: !appearance.backdrop })
        }, import_react.default.createElement("span", { className: "dxu-thumb" }))
      ),
      import_react.default.createElement("div", { className: "dxu-hint" }, t("settings.backdropHint")),
      import_react.default.createElement(
        "div",
        { className: "dxu-line" },
        import_react.default.createElement("span", { className: "dxu-label" }, t("settings.refraction")),
        import_react.default.createElement("button", {
          type: "button",
          role: "switch",
          className: "dxu-switch",
          "aria-checked": appearance.refraction,
          "aria-label": t("settings.refraction"),
          disabled,
          onClick: () => update({ refraction: !appearance.refraction })
        }, import_react.default.createElement("span", { className: "dxu-thumb" }))
      ),
      import_react.default.createElement("div", { className: "dxu-hint" }, t("settings.refractionHint"))
    ),
    error === null ? null : import_react.default.createElement("div", { className: "dxu-error", role: "status" }, t("settings.failed", { message: error })),
    import_react.default.createElement("div", { className: "dxu-note" }, t("settings.systemReduce"))
  );
}

// src/client/locales.ts
var NS = "dsh-x-ui";
var zh = {
  "meta.title": "\u73BB\u7483\u754C\u9762",
  "meta.description": "\u628A\u6574\u4E2A\u754C\u9762\u6362\u6210 liquid glass \u8D28\u611F\uFF1A\u534A\u900F\u660E\u9762\u677F\u3001\u4F1A\u6D41\u52A8\u7684\u5E95\u8272\uFF0C\u4EE5\u53CA\u6D6E\u5C42\u4E0A\u771F\u6B63\u7684\u6A21\u7CCA\u3002",
  "settings.nav": "\u73BB\u7483\u754C\u9762",
  "settings.title": "\u73BB\u7483\u754C\u9762",
  "settings.lead": "\u628A\u9762\u677F\u3001\u4FA7\u680F\u548C\u6D6E\u5C42\u6362\u6210\u534A\u900F\u660E\u6750\u8D28\u3002\u989C\u8272\u4ECD\u6765\u81EA\u5B98\u65B9\u4E3B\u9898\uFF0C\u6D45\u8272\u4E0E\u6DF1\u8272\u5404\u81EA\u8DDF\u968F\u3002",
  "settings.enable": "\u542F\u7528\u73BB\u7483\u6750\u8D28",
  "settings.enableHint": "\u5173\u6389\u540E\u7ACB\u5373\u56DE\u5230\u5B98\u65B9\u539F\u6765\u7684\u6837\u5B50\uFF0C\u9009\u62E9\u4F1A\u4FDD\u7559\u3002",
  "settings.level": "\u6750\u8D28\u6D53\u5EA6",
  "settings.levelHint": "\u6D53\u5EA6\u8D8A\u9AD8\uFF0C\u9762\u677F\u8D8A\u4E0D\u900F\u660E\u3001\u6A21\u7CCA\u8D8A\u5F3A\u3002",
  "settings.level.clear": "\u6E05\u900F",
  "settings.level.regular": "\u6807\u51C6",
  "settings.level.dense": "\u539A\u5B9E",
  "settings.backdrop": "\u6D41\u52A8\u5E95\u8272",
  "settings.backdropHint": "\u9762\u677F\u540E\u9762\u7684\u5F69\u8272\u5E95\u3002\u5173\u6389\u540E\u53EA\u5269\u534A\u900F\u660E\uFF0C\u73BB\u7483\u4F1A\u663E\u5F97\u53D1\u7070\u3002",
  "settings.refraction": "\u9AD8\u5149\u8FB9\u7F18",
  "settings.refractionHint": "\u8F93\u5165\u6846\u9876\u90E8\u7684\u7EC6\u9AD8\u5149\u548C\u63CF\u8FB9\uFF0C\u8BA9\u9762\u677F\u50CF\u4E00\u5757\u73BB\u7483\u800C\u4E0D\u662F\u4E00\u5C42\u7070\u3002",
  "settings.preview": "\u9884\u89C8",
  "settings.previewHint": "\u8FD9\u5757\u9884\u89C8\u7528\u7684\u662F\u5F53\u524D\u6750\u8D28\u53C2\u6570\u3002",
  "settings.previewTitle": "\u6750\u8D28\u9884\u89C8",
  "settings.previewBody": "\u9762\u677F\u91CC\u7684\u6B63\u6587\u4ECD\u7136\u7528\u5B98\u65B9\u6587\u5B57\u8272\uFF0C\u6240\u4EE5\u6D53\u5EA6\u8C03\u9AD8\u65F6\u4E5F\u4E0D\u4F1A\u770B\u4E0D\u6E05\u3002",
  "settings.previewChip": "\u6807\u7B7E",
  "settings.saving": "\u6B63\u5728\u4FDD\u5B58\u2026",
  "settings.failed": "\u6CA1\u80FD\u4FDD\u5B58\u8FD9\u6B21\u6539\u52A8\uFF1A{message}",
  "settings.systemReduce": "\u7CFB\u7EDF\u5F00\u542F\u4E86\u300C\u964D\u4F4E\u900F\u660E\u5EA6\u300D\uFF0C\u6B64\u65F6\u4F1A\u81EA\u52A8\u6539\u7528\u4E0D\u900F\u660E\u914D\u8272\u3002"
};
var en = {
  "meta.title": "Glass UI",
  "meta.description": "Turns the whole interface into liquid glass: translucent panels, a living backdrop, and real blur on floating surfaces.",
  "settings.nav": "Glass UI",
  "settings.title": "Glass UI",
  "settings.lead": "Renders panels, the sidebar and floating surfaces as translucent material. Colors still come from the shipped theme and follow light and dark.",
  "settings.enable": "Use the glass material",
  "settings.enableHint": "Turning this off restores the shipped look immediately. Your choice is kept.",
  "settings.level": "Material density",
  "settings.levelHint": "Denser means more opaque panels and a stronger blur.",
  "settings.level.clear": "Clear",
  "settings.level.regular": "Regular",
  "settings.level.dense": "Dense",
  "settings.backdrop": "Living backdrop",
  "settings.backdropHint": "The colored field behind the panels. Without it the glass has nothing to show and reads grey.",
  "settings.refraction": "Specular edge",
  "settings.refractionHint": "The highlight and rim along the top of the composer, so a panel reads as glass rather than a grey sheet.",
  "settings.preview": "Preview",
  "settings.previewHint": "This preview uses the current material settings.",
  "settings.previewTitle": "Material preview",
  "settings.previewBody": "Body text keeps the shipped label color, so a denser setting never costs legibility.",
  "settings.previewChip": "Chip",
  "settings.saving": "Saving\u2026",
  "settings.failed": "Could not save that change: {message}",
  "settings.systemReduce": "The system asks for reduced transparency, so an opaque palette is used instead."
};

// src/client/design.ts
var LEVELS2 = Object.freeze({
  clear: Object.freeze({ tint: 0.72, blur: 16 }),
  regular: Object.freeze({ tint: 1, blur: 28 }),
  dense: Object.freeze({ tint: 1.28, blur: 40 })
});
var ALPHA = Object.freeze({
  base: 0.58,
  layer1: 0.66,
  layer2: 0.74,
  layer3: 0.82,
  overlay: 0.78,
  sidebar: 0.3,
  composer: 0.54,
  menu: 0.72,
  menuHeader: 0.9,
  mask: 0.2,
  code: 0.72,
  bubble: 0.58,
  floating: 0.7,
  module: 0.42,
  tooltip: 0.94,
  toast: 0.9
});
function alphaOf(surface, level) {
  const value = ALPHA[surface] * LEVELS2[level].tint;
  return Math.min(0.96, Math.max(0.06, Math.round(value * 1e3) / 1e3));
}
function tint(primitive, alpha) {
  return `color-mix(in srgb, var(${primitive}) ${Math.round(alpha * 100)}%, transparent)`;
}
var GLASS_NEUTRAL = Object.freeze({ light: "--dsw-static-neutral-bluish-00", dark: "--dsw-static-neutral-bluish-900" });
function backdropLayers() {
  return [
    "radial-gradient(56% 44% at 10% 6%, color-mix(in srgb, var(--dsw-static-blue-500) 34%, transparent) 0%, transparent 68%)",
    "radial-gradient(50% 42% at 92% 2%, color-mix(in srgb, var(--dsw-static-deepseek-400) 26%, transparent) 0%, transparent 70%)",
    "radial-gradient(62% 52% at 84% 98%, color-mix(in srgb, var(--dsw-static-blue-300) 24%, transparent) 0%, transparent 68%)",
    "radial-gradient(46% 40% at 16% 94%, color-mix(in srgb, var(--dsw-static-deepseek-200) 20%, transparent) 0%, transparent 70%)"
  ].join(",\n    ");
}
var BACKDROP_BASE = Object.freeze({
  light: "var(--dsw-static-neutral-bluish-50)",
  dark: "var(--dsw-static-neutral-bluish-950)"
});

// src/client/material.ts
function schemeVariables(level, dark) {
  const a = (surface) => alphaOf(surface, level);
  const spec = LEVELS2[level];
  if (!dark) {
    return `
  --dxu-base: ${tint(GLASS_NEUTRAL.light, a("base"))};
  --dxu-layer-1: ${tint(GLASS_NEUTRAL.light, a("layer1"))};
  --dxu-layer-2: ${tint(GLASS_NEUTRAL.light, a("layer2"))};
  --dxu-layer-3: ${tint(GLASS_NEUTRAL.light, a("layer3"))};
  --dxu-overlay: ${tint(GLASS_NEUTRAL.light, a("overlay"))};
  --dxu-sidebar: ${tint(GLASS_NEUTRAL.light, a("sidebar"))};
  --dxu-composer: ${tint(GLASS_NEUTRAL.light, a("composer"))};
  --dxu-menu: ${tint(GLASS_NEUTRAL.light, a("menu"))};
  --dxu-menu-header: ${tint(GLASS_NEUTRAL.light, a("menuHeader"))};
  --dxu-mask: ${tint(GLASS_NEUTRAL.light, a("mask"))};
  --dxu-code: ${tint(GLASS_NEUTRAL.light, a("code"))};
  --dxu-bubble: ${tint("--dsw-static-blue-75", a("bubble"))};
  --dxu-floating: ${tint(GLASS_NEUTRAL.light, a("floating"))};
  --dxu-module: ${tint(GLASS_NEUTRAL.light, a("module"))};
  --dxu-tooltip: ${tint(GLASS_NEUTRAL.dark, a("tooltip"))};
  --dxu-toast: ${tint(GLASS_NEUTRAL.dark, a("toast"))};
  --dxu-menu-blur: blur(${spec.blur}px) saturate(185%);
  --dxu-mask-blur: blur(${Math.round(spec.blur * 0.36)}px);
  --dxu-rim: rgb(255 255 255 / 72%);
  --dxu-blur: ${spec.blur}px;
  --dxu-blur-soft: ${Math.round(spec.blur * 0.5)}px;
  --dxu-blur-panel: blur(${Math.round(spec.blur * 0.8)}px) saturate(150%);
  /* A content pane is where text is read, so it stays very nearly opaque: it
     picks up a hint of the backdrop (frosted, not flat) without putting long
     text on a moving field. Other plugins read this with their own fill as the
     fallback. */
  --dxu-pane: ${tint(GLASS_NEUTRAL.light, 0.94)};`;
  }
  return `
  --dxu-base: ${tint(GLASS_NEUTRAL.dark, a("base"))};
  --dxu-layer-1: ${tint(GLASS_NEUTRAL.dark, a("layer1"))};
  --dxu-layer-2: ${tint(GLASS_NEUTRAL.dark, a("layer2"))};
  --dxu-layer-3: ${tint(GLASS_NEUTRAL.dark, a("layer3"))};
  --dxu-overlay: ${tint(GLASS_NEUTRAL.dark, a("overlay"))};
  --dxu-sidebar: ${tint(GLASS_NEUTRAL.dark, a("sidebar"))};
  --dxu-composer: ${tint(GLASS_NEUTRAL.dark, a("composer"))};
  --dxu-menu: ${tint(GLASS_NEUTRAL.dark, a("menu"))};
  --dxu-menu-header: ${tint(GLASS_NEUTRAL.dark, a("menuHeader"))};
  --dxu-mask: rgb(0 0 0 / ${Math.round(Math.min(0.7, 0.42 * spec.tint) * 100)}%);
  --dxu-code: ${tint("--dsw-static-neutral-bluish-950", a("code"))};
  --dxu-bubble: ${tint("--dsw-static-neutral-bluish-850", a("bubble"))};
  --dxu-floating: ${tint(GLASS_NEUTRAL.dark, a("floating"))};
  --dxu-module: rgb(255 255 255 / ${Math.round(Math.min(0.14, 0.06 * spec.tint) * 100)}%);
  --dxu-tooltip: ${tint("--dsw-static-neutral-bluish-800", a("tooltip"))};
  --dxu-toast: ${tint("--dsw-static-neutral-bluish-800", a("toast"))};
  --dxu-menu-blur: blur(${spec.blur}px) saturate(185%);
  --dxu-mask-blur: blur(${Math.round(spec.blur * 0.36)}px);
  --dxu-rim: rgb(255 255 255 / 12%);
  --dxu-blur: ${spec.blur}px;
  --dxu-blur-soft: ${Math.round(spec.blur * 0.5)}px;
  --dxu-blur-panel: blur(${Math.round(spec.blur * 0.8)}px) saturate(150%);
  --dxu-pane: ${tint(GLASS_NEUTRAL.dark, 0.94)};`;
}
function specular() {
  return `
/* One hairline highlight along the top edge and a faint inner glow is what the
   eye reads as a bevel. A pseudo-element keeps it out of layout and out of hit
   testing. */
[data-composer-card]::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: inherit;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 34%) 0%, transparent 18%),
    radial-gradient(120% 60% at 50% 0%, rgb(255 255 255 / 22%) 0%, transparent 62%);
  mix-blend-mode: screen;
  opacity: 0.9;
}
html body[data-ds-dark-theme] [data-composer-card]::before {
  background:
    linear-gradient(180deg, rgb(255 255 255 / 10%) 0%, transparent 20%),
    radial-gradient(120% 60% at 50% 0%, rgb(255 255 255 / 7%) 0%, transparent 64%);
}`;
}
function reducedTransparency() {
  const light = [
    ["--dxu-base", "--dsw-static-neutral-bluish-00"],
    ["--dxu-layer-1", "--dsw-static-neutral-bluish-00"],
    ["--dxu-layer-2", "--dsw-static-neutral-bluish-00"],
    ["--dxu-layer-3", "--dsw-static-neutral-bluish-00"],
    ["--dxu-overlay", "--dsw-static-neutral-bluish-00"],
    ["--dxu-sidebar", "--dsw-static-neutral-bluish-50"],
    ["--dxu-composer", "--dsw-static-neutral-bluish-00"],
    ["--dxu-menu", "--dsw-static-neutral-bluish-50"],
    ["--dxu-menu-header", "--dsw-static-neutral-bluish-50"],
    ["--dxu-code", "--dsw-static-neutral-bluish-50"],
    ["--dxu-bubble", "--dsw-static-deepseek-50"],
    ["--dxu-floating", "--dsw-static-neutral-bluish-00"],
    ["--dxu-module", "--dsw-static-neutral-bluish-60"],
    ["--dxu-pane", "--dsw-static-neutral-bluish-00"]
  ];
  const dark = [
    ["--dxu-base", "--dsw-static-neutral-bluish-950"],
    ["--dxu-layer-1", "--dsw-static-neutral-bluish-875"],
    ["--dxu-layer-2", "--dsw-static-neutral-bluish-850"],
    ["--dxu-layer-3", "--dsw-static-neutral-bluish-800"],
    ["--dxu-overlay", "--dsw-static-neutral-bluish-700"],
    ["--dxu-sidebar", "--dsw-static-neutral-bluish-900"],
    ["--dxu-composer", "--dsw-static-neutral-bluish-850"],
    ["--dxu-menu", "--dsw-static-neutral-bluish-850"],
    ["--dxu-menu-header", "--dsw-static-neutral-bluish-850"],
    ["--dxu-code", "--dsw-static-neutral-bluish-900"],
    ["--dxu-bubble", "--dsw-static-neutral-bluish-850"],
    ["--dxu-floating", "--dsw-static-neutral-bluish-850"],
    ["--dxu-module", "--dsw-static-neutral-bluish-800"],
    ["--dxu-pane", "--dsw-static-neutral-bluish-950"]
  ];
  const block = (selector, entries) => `${selector} {
${entries.map(([name, value]) => `    ${name}: var(${value});`).join("\n")}
  }`;
  return `
@media (prefers-reduced-transparency: reduce) {
  ${block("html body", light)}
  ${block("html body[data-ds-dark-theme]", dark)}
  html body {
    --dxu-menu-blur: none;
    --dxu-mask-blur: none;
    --dxu-blur: 0px;
    --dxu-blur-soft: 0px;
    --dxu-blur-panel: none;
  }
  html body::before { display: none; }
  [data-composer-card], [role='dialog'], [data-menu-material] {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}`;
}
function stylesheet(appearance) {
  const level = appearance.level;
  const field = appearance.backdrop ? `background:
    ${backdropLayers()};` : "background: none;";
  return `
/* The ambient field. Glass needs something to refract: one fixed layer behind
   the app, so it never scrolls, never repaints on layout, and never takes a
   pointer event. Isolation gives it a stacking context behind the app root
   without a negative z-index fight against the host's own layers. */
html body {
  isolation: isolate;
  background: ${BACKDROP_BASE.light};
}
html body[data-ds-dark-theme] {
  background: ${BACKDROP_BASE.dark};
}
html body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  ${field}
  opacity: 1;
  transition: opacity 240ms var(--ds-ease-in-out, ease);
}
/* Native macOS vibrancy already blurs the desktop behind the window, and the
   Electron window is transparent over it. Painting an opaque base here would
   cover that material, so the base steps aside and only the field remains. */
html[data-platform='darwin'] body {
  background: transparent;
}
html[data-platform='darwin'] body::before { opacity: 0.72; }

/* The scheme variables the token layer resolves against. */
html body {${schemeVariables(level, false)}
}
html body[data-ds-dark-theme] {${schemeVariables(level, true)}
}

/* The sidebar is the clearest surface: it carries the material's character and
   no long-form text. The centre column keeps more body so the transcript stays
   readable for long stretches. */
[data-shell-overlay], [data-shell-bottom] { background: transparent; }

/* Menus already paint their material through --dsw-menu-surface-fill and
   --dsw-menu-backdrop-filter; the token layer covers both. What is missing is
   the specular edge that separates glass from tint, and the same edge is what
   makes a dialog read as a sheet of material rather than a rounded rectangle. */
[data-menu-material] {
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 42%),
    0 0 0 0.5px rgb(255 255 255 / 22%),
    0 12px 32px rgb(8 12 20 / 16%);
}
html body[data-ds-dark-theme] [data-menu-material] {
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 8%),
    0 0 0 0.5px rgb(255 255 255 / 8%),
    0 12px 32px rgb(0 0 0 / 38%);
}

/* The composer is the one surface with content scrolling directly behind it, so
   it gets a real blur rather than only a tint. Scoped to the composer card's own
   hook, so it cannot reach a panel that happens to sit in the same column. */
[data-composer-card] {
  backdrop-filter: blur(var(--dxu-blur)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--dxu-blur)) saturate(180%);
}

/* Dialogs: the mask carries the blur, the card carries the material. */
[role='dialog'] {
  backdrop-filter: blur(var(--dxu-blur-soft)) saturate(160%);
  -webkit-backdrop-filter: blur(var(--dxu-blur-soft)) saturate(160%);
}
${appearance.refraction ? specular() : ""}
${reducedTransparency()}

@media (prefers-reduced-motion: reduce) {
  html body::before { transition: none; }
}
`;
}

// src/client/styles.ts
var SETTINGS_CSS = `
.dxu-row{display:flex;flex-direction:column;gap:10px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}
.dxu-rowText{display:flex;flex-direction:column;gap:4px;padding-right:48px}
.dxu-title{font-size:14px;font-weight:400;line-height:22px;color:var(--dsw-alias-label-primary)}
.dxu-desc{font-size:12px;font-weight:400;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dxu-controls{display:flex;flex-direction:column;gap:12px;max-width:420px}
.dxu-line{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:24px}
.dxu-field{display:flex;flex-direction:column;gap:8px}
.dxu-label{font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}
.dxu-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dxu-muted{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dxu-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dxu-error{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}
.dxu-row[data-disabled=true] .dxu-controls{opacity:.6}
/* Switch: the same capsule the host uses, keyed off aria-checked so the paint
   can never disagree with what assistive technology reads. */
.dxu-switch{box-sizing:border-box;position:relative;flex:0 0 auto;width:36px;height:20px;padding:2px;border:0;border-radius:999px;corner-shape:round;background:var(--dsw-alias-border-l3);cursor:pointer}
.dxu-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary)}
.dxu-switch:disabled{cursor:default;opacity:.5}
.dxu-switch:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.dxu-thumb{display:block;width:16px;height:16px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-label-primary-foreground);transition:transform 120ms ease}
.dxu-switch[aria-checked=false] .dxu-thumb{background:var(--dsw-alias-switch-thumb)}
.dxu-switch[aria-checked=true] .dxu-thumb{transform:translateX(16px)}
/* Segmented control: one sliding indicator, sized arithmetically from the
   segment count the component publishes, so no DOM measurement is needed. */
.dxu-segments{position:relative;display:inline-grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:2px;padding:4px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover)}
.dxu-indicator{position:absolute;top:4px;left:4px;width:calc((100% - 8px - 2px * (var(--dxu-segment-count) - 1)) / var(--dxu-segment-count));height:calc(100% - 8px);border:0;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-soft);transform:translateX(calc(var(--dxu-segment-index) * (100% + 2px)));transition:transform 160ms ease;pointer-events:none}
.dxu-segment{box-sizing:border-box;position:relative;z-index:1;height:28px;padding:0 16px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;font-weight:500;white-space:nowrap;cursor:pointer;transition:color 120ms ease}
.dxu-segment:hover:not(:disabled),.dxu-segment[aria-pressed=true]{color:var(--dsw-alias-label-primary)}
.dxu-segment:disabled{cursor:default}
.dxu-segment:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
@media (prefers-reduced-motion:reduce){.dxu-thumb,.dxu-indicator{transition:none}}
`;

// src/client/tokens.ts
var TOKEN_SOURCE = "dsh-x-ui";
var GLASS_TOKENS = Object.freeze({
  // Columns and the transcript sit on the base surface; it is the one that lets
  // the backdrop read through the whole frame.
  "--dsw-alias-bg-base": pair("var(--dxu-base, rgb(255 255 255 / 62%))", "var(--dxu-base, rgb(18 20 26 / 62%))"),
  // Raised surfaces, from a card to a nested panel. Alpha rises with elevation:
  // a dialog needs more body than a card, or text over a busy backdrop swims.
  "--dsw-alias-bg-layer-1": pair("var(--dxu-layer-1, rgb(255 255 255 / 70%))", "var(--dxu-layer-1, rgb(28 31 38 / 66%))"),
  "--dsw-alias-bg-layer-2": pair("var(--dxu-layer-2, rgb(255 255 255 / 78%))", "var(--dxu-layer-2, rgb(32 35 43 / 72%))"),
  "--dsw-alias-bg-layer-3": pair("var(--dxu-layer-3, rgb(255 255 255 / 86%))", "var(--dxu-layer-3, rgb(38 42 50 / 78%))"),
  "--dsw-alias-bg-overlay": pair("var(--dxu-overlay, rgb(250 251 253 / 80%))", "var(--dxu-overlay, rgb(30 33 40 / 82%))"),
  // Chrome. The sidebar is deliberately the clearest surface in the app: it is
  // where the material is most visible and where no long text has to be read.
  "--dsw-specific-sidebar-fill": pair("var(--dxu-sidebar, rgb(255 255 255 / 34%))", "var(--dxu-sidebar, rgb(24 27 33 / 44%))"),
  // The composer is glass with real blur, because content scrolls behind it.
  "--dsw-specific-input-major": pair("var(--dxu-composer, rgb(255 255 255 / 56%))", "var(--dxu-composer, rgb(32 35 43 / 62%))"),
  // Menus and popovers float over live content, so they keep the strongest fill.
  "--dsw-menu-surface-fill": pair("var(--dxu-menu, rgb(250 251 253 / 74%))", "var(--dxu-menu, rgb(38 41 49 / 76%))"),
  "--dsw-specific-menu": pair("var(--dxu-menu, rgb(250 251 253 / 74%))", "var(--dxu-menu, rgb(38 41 49 / 76%))"),
  "--dsw-alias-menu-group-header-fill": pair("var(--dxu-menu-header, rgb(250 251 253 / 92%))", "var(--dxu-menu-header, rgb(38 41 49 / 92%))"),
  // The mask behind a dialog is the one place a real blur earns its cost.
  "--dsw-alias-bg-mask-1": pair("var(--dxu-mask, rgb(12 16 24 / 18%))", "var(--dxu-mask, rgb(0 0 0 / 46%))"),
  // Reading surfaces keep enough body to stay legible; glass must not win over text.
  "--dsw-alias-markdown-code-block": pair("var(--dxu-code, rgb(255 255 255 / 76%))", "var(--dxu-code, rgb(10 12 16 / 66%))"),
  "--dsw-specific-bubble": pair("var(--dxu-bubble, rgb(236 241 255 / 62%))", "var(--dxu-bubble, rgb(40 46 60 / 60%))"),
  "--dsw-alias-button-floating-fill": pair("var(--dxu-floating, rgb(255 255 255 / 72%))", "var(--dxu-floating, rgb(40 43 51 / 74%))"),
  "--dsw-alias-button-elevated-fill": pair("var(--dxu-floating, rgb(255 255 255 / 72%))", "var(--dxu-floating, rgb(40 43 51 / 74%))"),
  "--dsw-alias-bg-module-platform": pair("var(--dxu-module, rgb(255 255 255 / 46%))", "var(--dxu-module, rgb(255 255 255 / 6%))"),
  // Both of these paint near-white text on a dark pill in BOTH palettes, so
  // their fill stays dark and only gains a little translucency.
  "--dsw-alias-tooltip-bg": pair("var(--dxu-tooltip, rgb(20 22 28 / 94%))", "var(--dxu-tooltip, rgb(34 37 44 / 94%))"),
  "--dsw-alias-toast-bg": pair("var(--dxu-toast, rgb(24 26 32 / 90%))", "var(--dxu-toast, rgb(34 37 44 / 90%))"),
  // Material. `--dsw-menu-backdrop-filter` and `--dsw-mask-blur` are declared by
  // the shipped stylesheet on `body`, so the presenter's inline write replaces
  // them and every consumer of the token follows.
  "--dsw-menu-backdrop-filter": pair("var(--dxu-menu-blur, blur(30px) saturate(185%))", "var(--dxu-menu-blur, blur(30px) saturate(185%))"),
  "--dsw-mask-blur": pair("var(--dxu-mask-blur, blur(10px))", "var(--dxu-mask-blur, blur(10px))"),
  // The elevation hairline is what draws the rim on every elevated surface in
  // the app; turning it into a light specular stroke is what makes those
  // surfaces read as glass instead of as flat tinted cards.
  "--dsw-elevation-stroke-color": pair("var(--dxu-rim, rgb(255 255 255 / 72%))", "var(--dxu-rim, rgb(255 255 255 / 12%))")
});
function pair(light, dark) {
  return Object.freeze({ light, dark });
}

// src/client/index.ts
var inject = ["slots", "connection", "locale", "theme"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "glass: dictionaries");
  const t = ctx.locale.bind(NS);
  const controller = createUiController(ctx.connection.rpc);
  ctx.effect(() => () => controller.dispose?.(), "glass: controller");
  ctx.on("connection/reset", () => {
    void controller.load();
  });
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = NS;
    style.dataset.pluginCss = `${NS}/settings`;
    style.textContent = SETTINGS_CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, "glass: settings styles");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = NS;
    style.dataset.pluginCss = `${NS}/material`;
    document.head.appendChild(style);
    let painted = null;
    let tokenDispose = null;
    const paint = (appearance) => {
      if (appearance === null || !appearance.enabled) {
        style.textContent = "";
        tokenDispose?.();
        tokenDispose = null;
        painted = appearance;
        return;
      }
      if (painted !== null && painted.enabled === appearance.enabled && painted.level === appearance.level && painted.backdrop === appearance.backdrop && painted.refraction === appearance.refraction) return;
      painted = appearance;
      style.textContent = stylesheet(appearance);
      tokenDispose = ctx.theme.overrideTokens(TOKEN_SOURCE, GLASS_TOKENS);
    };
    paint(controller.getSnapshot());
    const unsubscribe = controller.subscribe(() => paint(controller.getSnapshot()));
    void controller.load();
    return () => {
      unsubscribe();
      tokenDispose?.();
      style.remove();
    };
  }, "glass: material");
  ctx.slots.inject("settings.general.item", () => ctx.slots.register({
    name: "settings.general.item",
    id: "dsh-x-ui",
    order: 13,
    locale: NS,
    label: () => t("settings.nav"),
    inject: () => ({ controller, t })
  }, GlassSettings));
}
return module.exports; } });
