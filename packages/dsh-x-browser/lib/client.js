window.__ModuleLoader__.load({ id: "dsh-x-browser", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
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

// src/contract/commands.ts
var ACTIONS = [
  "observe",
  "navigate",
  "click",
  "type",
  "scroll",
  "press",
  "back",
  "forward",
  "reload",
  "select",
  "read",
  "screenshot"
];
var EMBEDDED_ACTIONS = [
  "observe",
  "navigate",
  "click",
  "type",
  "scroll",
  "press",
  "back",
  "forward",
  "reload"
];
var ACTION_SPEC = {
  observe: { fields: [], navigation: false, mutates: false },
  navigate: { fields: ["url"], navigation: true, mutates: true },
  click: { fields: ["target"], navigation: false, mutates: true },
  type: { fields: ["target", "text"], navigation: false, mutates: true },
  scroll: { fields: ["x", "y"], navigation: false, mutates: false },
  press: { fields: ["key"], navigation: false, mutates: true },
  back: { fields: [], navigation: true, mutates: true },
  forward: { fields: [], navigation: true, mutates: true },
  reload: { fields: [], navigation: true, mutates: false },
  select: { fields: ["target", "value"], navigation: false, mutates: true },
  read: { fields: ["url"], navigation: false, mutates: false },
  screenshot: { fields: [], navigation: false, mutates: false }
};
var NAVIGATION = new Set(ACTIONS.filter((action) => ACTION_SPEC[action].navigation));
var EMBEDDED_REF_PATTERN = /^e\d+:s\d+:n\d+$/;

// src/contract/errors.ts
var BROWSER_ERROR_CODES = [
  "BROWSER_API",
  "BROWSER_APPROVAL",
  "BROWSER_BINARY_MISSING",
  "BROWSER_BUSY",
  "BROWSER_CLOSED",
  "BROWSER_DISABLED",
  "BROWSER_DAEMON",
  "BROWSER_DESKTOP",
  "BROWSER_GRANT",
  "BROWSER_GUEST",
  "BROWSER_HIDDEN",
  "BROWSER_HOST",
  "BROWSER_INPUT",
  "BROWSER_LIMIT",
  "BROWSER_OFFLINE",
  "BROWSER_OWNER",
  "BROWSER_PROTOCOL",
  "BROWSER_RESULT",
  "BROWSER_REVOKED",
  "BROWSER_RPC",
  "BROWSER_RUN",
  "BROWSER_SCOPE",
  "BROWSER_SECRET",
  "BROWSER_SESSION",
  "BROWSER_STALE",
  "BROWSER_TARGET",
  "BROWSER_TIMEOUT",
  "BROWSER_UNAVAILABLE",
  "BROWSER_UNSENT",
  "BROWSER_UNSUPPORTED",
  "BROWSER_URL",
  "BROWSER_VERSION",
  "BROWSER_WORKSPACE"
];
var KNOWN = new Set(BROWSER_ERROR_CODES);
function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

// src/contract/limits.ts
var MAX_RESULT_BYTES = 64 * 1024;
var MAX_OBSERVATION_TEXT_BYTES = 24 * 1024;

// src/contract/observation.ts
function modelUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

// src/contract/url.ts
function parseAddress(value, applicationOrigin) {
  if (typeof value !== "string" || value.length > 4096 || !value.trim()) throw fail("BROWSER_URL", "Enter a bounded HTTP(S) URL.");
  let url;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw fail("BROWSER_URL", "Enter a valid HTTP(S) URL.");
  }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw fail("BROWSER_URL", "Only HTTP(S) URLs without embedded credentials are allowed.");
  if (applicationOrigin && applicationOrigin !== "null") {
    let host;
    try {
      host = new URL(applicationOrigin);
    } catch {
    }
    if (host && ["http:", "https:"].includes(host.protocol) && url.port === host.port && (url.hostname === host.hostname || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw fail("BROWSER_HOST", "The application host cannot be opened in a browser guest.");
  }
  return url.href;
}

// src/protocol.ts
var ACTIONS2 = Object.freeze([...EMBEDDED_ACTIONS]);
function plainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}
function validateCommand(raw, applicationOrigin, refPattern = EMBEDDED_REF_PATTERN, actions = ACTIONS2) {
  if (!plainObject(raw) || typeof raw.action !== "string" || !actions.includes(raw.action)) throw fail("BROWSER_INPUT", "Choose a supported browser action.");
  const fields = ACTION_SPEC[raw.action].fields;
  if (Object.keys(raw).some((key) => key !== "action" && !fields.includes(key))) throw fail("BROWSER_INPUT", "Unknown browser command field.");
  const result = { action: raw.action };
  if (raw.action === "navigate") result.url = parseAddress(raw.url, applicationOrigin);
  if (["click", "type"].includes(raw.action)) {
    if (typeof raw.target !== "string" || !refPattern.test(raw.target)) throw fail("BROWSER_TARGET", "Use an exact target from the latest observation.");
    result.target = raw.target;
  }
  if (raw.action === "select") {
    if (typeof raw.target !== "string" || !refPattern.test(raw.target)) throw fail("BROWSER_TARGET", "Use an exact target from the latest observation.");
    if (typeof raw.value !== "string" || !raw.value || raw.value.length > 500 || /\u0000/.test(raw.value)) throw fail("BROWSER_INPUT", "Select value must contain 1\u2013500 characters.");
    result.target = raw.target;
    result.value = raw.value;
  }
  if (raw.action === "type") {
    if (typeof raw.text !== "string" || !raw.text || raw.text.length > 2e3 || /\u0000/.test(raw.text)) throw fail("BROWSER_INPUT", "Text must contain 1\u20132000 characters.");
    if (/-----BEGIN [A-Z ]*PRIVATE KEY|\b(?:sk-|gh[pousr]_|github_pat_|AKIA)[A-Za-z0-9_\-]{10,}|\bBearer\s+[A-Za-z0-9._\-]{12,}/i.test(raw.text)) throw fail("BROWSER_SECRET", "Credentials must be entered manually.");
    if (/^\s*\d{4,8}\s*$/.test(raw.text) || /(?:\d[ -]?){13,19}/.test(raw.text)) throw fail("BROWSER_SECRET", "Verification codes and card-like numbers must be entered manually.");
    result.text = raw.text;
  }
  if (raw.action === "scroll") {
    for (const key of ["x", "y"]) {
      if (!Number.isInteger(raw[key]) || Math.abs(raw[key]) > 2e3) throw fail("BROWSER_INPUT", "Scroll distance must be an integer between -2000 and 2000.");
      result[key] = raw[key];
    }
  }
  if (raw.action === "press") {
    if (!["Tab", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"].includes(raw.key)) throw fail("BROWSER_INPUT", "This key is not supported. Use an explicitly approved click to submit.");
    result.key = raw.key;
  }
  return result;
}

// src/client/dom-helper.ts
function pageHelper(request) {
  const blocked = 'script,style,noscript,template,input,textarea,select,[contenteditable],[hidden],[aria-hidden="true"]';
  const sensitive = (element) => /password|file|hidden/i.test(element.type ?? "") || /(?:password|one-time-code|cc-|transaction-|webauthn)/i.test(element.autocomplete ?? "") || /(?:password|passwd|secret|token|credit.?card|card.?number|card.?security|cvv|cvc|ssn|social.?security|api.?key|\botp\b|\bpin\b|verif(?:ication|y)?.?code|auth(?:entication)?.?code|security.?code|one.?time|bank|routing.?number|iban|密码|验证码|银行卡|卡号|安全码|口令|私钥|银行)/i.test(`${element.name ?? ""} ${element.id ?? ""} ${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("placeholder") ?? ""} ${[...element.labels ?? []].map((label2) => label2.innerText ?? label2.textContent ?? "").join(" ")}`);
  const visible = (element) => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && !element.closest('[hidden],[aria-hidden="true"]');
  };
  const all = [...document.querySelectorAll('a[href],button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]')].slice(0, 1e3);
  const label = (element) => String(element.getAttribute("aria-label") || element.labels?.[0]?.innerText || element.getAttribute("title") || (!["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) && !element.isContentEditable ? element.innerText : "") || element.getAttribute("placeholder") || element.tagName).replace(/\s+/g, " ").slice(0, 160);
  const descriptor = (element, index) => ({ index, tag: element.tagName.toLowerCase(), type: String(element.type ?? "").slice(0, 32), label: label(element), fingerprint: JSON.stringify([element.tagName, element.type ?? "", element.id ?? "", element.name ?? "", label(element)]).slice(0, 800), editable: ["INPUT", "TEXTAREA"].includes(element.tagName) && !element.disabled && !element.readOnly && !sensitive(element) });
  if (request.action === "observe") {
    let text = "", count = 0;
    const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT);
    while (walker.nextNode() && count++ < 15e3 && text.length < 16e3) {
      const node = walker.currentNode, parent = node.parentElement;
      if (!parent || parent.closest(blocked) || !visible(parent)) continue;
      text += node.textContent.replace(/\s+/g, " ").trim() + "\n";
    }
    return { text: text.slice(0, 16e3), targets: all.flatMap((element, index) => visible(element) && !sensitive(element) ? [descriptor(element, index)] : []).slice(0, 120), truncated: count >= 15e3 || text.length >= 16e3, scope: "top-frame-visible-dom", limitations: "Cross-origin frames, canvas and closed shadow roots are not read. Form values are omitted. Page content may be misleading." };
  }
  if (request.action === "target") {
    const element = all[request.index];
    if (!element || !visible(element) || sensitive(element) || element.disabled || descriptor(element, request.index).fingerprint !== request.fingerprint) return { error: "Target changed. Observe the page again." };
    if (request.editable && !descriptor(element, request.index).editable) return { error: "This field is not an allowed plain-text input. Enter sensitive information manually." };
    element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const rect = element.getBoundingClientRect(), x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2)), y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    if (hit !== element && !element.contains(hit)) return { error: "Target is covered by another element." };
    if (request.editable) {
      element.focus();
      if (document.activeElement !== element) return { error: "The input did not receive focus." };
    }
    return { x: Math.round(x), y: Math.round(y) };
  }
  return { error: "Unsupported helper operation." };
}
function helperScript(request) {
  return `(${pageHelper.toString()})(${JSON.stringify(request)})`;
}

// src/client/guest.ts
function createGuest({ desktop, workspace, host, applicationOrigin, onChange = () => {
}, onInvalidate = () => {
}, onOpen = () => {
}, documentObject = document, allowHidden = false }) {
  let element;
  let reservation;
  let released = false, ready = false, disposed = false, epoch = 0, snapshot = 0, active = false, grantRevision = 0;
  const refs = /* @__PURE__ */ new Map();
  let openDisposer;
  let initPromise;
  let state = { ready: false, loading: false, epoch: 0, url: "", title: "", error: null, canGoBack: false, canGoForward: false };
  const listeners = [];
  const publish = (patch) => {
    state = { ...state, ...patch };
    onChange(state);
  };
  const invalidate = (reason, navigation = false) => {
    epoch++;
    refs.clear();
    snapshot++;
    publish({ epoch });
    onInvalidate(reason, navigation);
  };
  const listen = (name, fn) => {
    element.addEventListener(name, fn);
    listeners.push([name, fn]);
  };
  const check = (command) => {
    if (disposed || !ready || !element) throw fail("BROWSER_UNAVAILABLE", "The embedded desktop guest is not ready.");
    if (command && !allowHidden && (host.isConnected === false || typeof host.getBoundingClientRect === "function" && (host.getBoundingClientRect().width <= 0 || host.getBoundingClientRect().height <= 0))) throw fail("BROWSER_HIDDEN", "The owned browser viewport is not visible.");
    if (command && (!active || command.grantRevision !== grantRevision || command.epoch !== epoch)) throw fail("BROWSER_STALE", "Browser control or document changed.");
  };
  async function release() {
    if (released || !reservation) return;
    released = true;
    await desktop.browser.release(reservation.lease);
  }
  async function mount() {
    if (disposed) return;
    if (desktop?.protocolVersion !== 1 || !desktop.browser?.acquire || !desktop.browser?.release) throw fail("BROWSER_DESKTOP", "A compatible DSH Desktop shell is required. The web app cannot embed Chromium.");
    reservation = await desktop.browser.acquire(workspace);
    if (disposed) {
      await release();
      return;
    }
    element = documentObject.createElement("webview");
    element.className = "dxb-webview";
    element.dataset.testid = "dxb-guest";
    element.setAttribute("name", reservation.lease);
    element.setAttribute("partition", reservation.partition);
    element.setAttribute("allowpopups", "");
    element.setAttribute("webpreferences", "backgroundThrottling=no");
    element.setAttribute("src", `about:blank#${reservation.lease}`);
    openDisposer = desktop.browser.onOpenRequested(reservation.lease, (url) => {
      try {
        onOpen(parseAddress(url, applicationOrigin));
      } catch {
      }
    });
    listen("did-start-navigation", (event) => {
      if (event.isMainFrame === false) return;
      invalidate("navigation", true);
      publish({ loading: true });
    });
    const update = () => {
      if (disposed || !ready) return;
      const url = element.getURL();
      publish({ url: url.startsWith("about:blank#") ? "" : url, title: element.getTitle().slice(0, 200), canGoBack: element.canGoBack(), canGoForward: element.canGoForward(), epoch });
    };
    listen("did-navigate", update);
    listen("did-navigate-in-page", update);
    listen("page-title-updated", update);
    listen("did-stop-loading", () => {
      update();
      publish({ loading: false });
    });
    listen("did-fail-load", (event) => {
      if (event.isMainFrame === false || event.errorCode === -3) return;
      invalidate("load-failed");
      publish({ loading: false, error: "The page failed to load." });
    });
    listen("render-process-gone", () => {
      ready = false;
      active = false;
      invalidate("guest-crashed");
      publish({ ready: false, error: "The embedded browser process stopped." });
    });
    const readyPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(fail("BROWSER_TIMEOUT", "The desktop guest did not become ready.")), 15e3);
      listen("dom-ready", () => {
        if (disposed) {
          clearTimeout(timer);
          resolve();
          return;
        }
        if (!ready) {
          const methods = ["executeJavaScript", "loadURL", "sendInputEvent", "insertText", "capturePage"];
          if (methods.some((method) => typeof element[method] !== "function")) {
            clearTimeout(timer);
            reject(fail("BROWSER_API", "This Desktop shell does not expose the required guest APIs."));
            return;
          }
          ready = true;
          publish({ ready: true, error: null, epoch });
          clearTimeout(timer);
          resolve();
        }
        update();
      });
    });
    host.append(element);
    await readyPromise;
  }
  async function perform(raw, { beforeInput = async () => {
  } } = {}) {
    check(raw);
    const { id, epoch: commandEpoch, grantRevision: revision, ...payload } = raw;
    const command = validateCommand(payload, applicationOrigin);
    const assertCurrent = () => {
      if (disposed || !active || revision !== grantRevision || !NAVIGATION.has(command.action) && epoch !== commandEpoch) throw fail("BROWSER_STALE", "Control was revoked or the page changed. Do not replay the action.");
    };
    const admitInput = async () => {
      assertCurrent();
      await beforeInput();
      assertCurrent();
    };
    assertCurrent();
    if (command.action === "observe") {
      const value = await element.executeJavaScript(helperScript({ action: "observe" }));
      assertCurrent();
      snapshot++;
      refs.clear();
      if (!value || typeof value.text !== "string" || !Array.isArray(value.targets)) throw fail("BROWSER_RESULT", "Page observation is unavailable.");
      const targets = value.targets.slice(0, 120).flatMap((target) => {
        if (!Number.isSafeInteger(target.index) || target.index < 0 || target.index > 1e3 || typeof target.fingerprint !== "string") return [];
        const ref = `e${epoch}:s${snapshot}:n${target.index}`;
        refs.set(ref, { index: target.index, fingerprint: target.fingerprint.slice(0, 800), editable: target.editable === true });
        return [{ ref, tag: String(target.tag).slice(0, 32), type: String(target.type).slice(0, 32), label: String(target.label).slice(0, 160), editable: target.editable === true }];
      });
      return { epoch, result: { text: value.text.slice(0, 16e3), targets, truncated: Boolean(value.truncated), scope: "top-frame-visible-dom", limitations: String(value.limitations ?? "").slice(0, 300), url: modelUrl(state.url), title: state.title } };
    }
    if (["click", "type"].includes(command.action)) {
      const target = refs.get(command.target);
      if (!target || command.action === "type" && !target.editable) throw fail("BROWSER_TARGET", "Observe the page again and choose an allowed target.");
      const point = await element.executeJavaScript(helperScript({ action: "target", ...target, editable: command.action === "type" }));
      assertCurrent();
      if (point?.error) throw fail("BROWSER_TARGET", String(point.error).slice(0, 300));
      if (!Number.isInteger(point?.x) || !Number.isInteger(point?.y) || point.x < 0 || point.y < 0 || point.x > 2e4 || point.y > 2e4) throw fail("BROWSER_TARGET", "The page returned invalid target coordinates.");
      await admitInput();
      assertCurrent();
      if (command.action === "click") {
        await element.sendInputEvent({ type: "mouseDown", x: point.x, y: point.y, button: "left", clickCount: 1 });
        await admitInput();
        assertCurrent();
        await element.sendInputEvent({ type: "mouseUp", x: point.x, y: point.y, button: "left", clickCount: 1 });
      } else await element.insertText(command.text);
    } else {
      await admitInput();
      assertCurrent();
      if (command.action === "scroll") await element.sendInputEvent({ type: "mouseWheel", x: 10, y: 10, deltaX: command.x, deltaY: command.y, canScroll: true });
      else if (command.action === "press") {
        await element.sendInputEvent({ type: "keyDown", keyCode: command.key });
        await admitInput();
        assertCurrent();
        await element.sendInputEvent({ type: "keyUp", keyCode: command.key });
      } else if (command.action === "navigate") {
        await element.loadURL(command.url);
      } else if (command.action === "back") element.goBack();
      else if (command.action === "forward") element.goForward();
      else if (command.action === "reload") element.reload();
    }
    assertCurrent();
    refs.clear();
    return { epoch, result: { action: command.action, status: NAVIGATION.has(command.action) ? "navigation-requested" : "input-sent", notice: "Input was sent to the visible guest. Observe again to verify its effect; never automatically retry a lost acknowledgement." } };
  }
  return {
    start() {
      return initPromise ??= mount().catch(async (error) => {
        publish({ error: error.message, ready: false });
        await release().catch(() => {
        });
        throw error;
      });
    },
    state: () => state,
    grant(revision) {
      grantRevision = revision;
      active = true;
    },
    revoke() {
      active = false;
      grantRevision++;
      refs.clear();
    },
    perform,
    async navigate(url) {
      check();
      active = false;
      refs.clear();
      await element.loadURL(parseAddress(url, applicationOrigin));
    },
    manual(action) {
      check();
      active = false;
      refs.clear();
      if (action === "back") element.goBack();
      else if (action === "forward") element.goForward();
      else if (action === "reload") element.reload();
      else if (action === "stop") element.stop();
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      active = false;
      refs.clear();
      openDisposer?.();
      for (const [name, fn] of listeners) element?.removeEventListener(name, fn);
      element?.remove();
      await release();
    }
  };
}

// src/client/controller.ts
function createBrowserController({ rpc, desktop = globalThis.dshDesktop, sessionId, clientTabId, host, applicationOrigin = globalThis.location?.origin, initialUrl, onOpen, guestFactory = createGuest, pollMs = 750, documentObject = globalThis.document }) {
  let registration, guest, disposed = false, visible = false, timer, pumping = false, granting = false, pumpWaiters = [], running = null, generation = 0, autoGrantTried = false;
  let navigatedByCommand = false;
  let autoRecoveries = 0;
  const MAX_AUTO_RECOVERIES = 3;
  const listeners = /* @__PURE__ */ new Set(), requests = /* @__PURE__ */ new Set();
  let state = { status: "loading", granted: false, visible: false, epoch: 0, grantRevision: 0, ready: false, url: "", title: "", error: null, busy: false, tabId: null };
  const publish = (patch) => {
    if (disposed) return;
    state = { ...state, ...patch };
    for (const callback of listeners) callback();
  };
  const auth = () => ({ tabId: registration.tabId, capability: registration.capability });
  const stopReason = (error) => ({ BROWSER_RUN: "turn-ended", BROWSER_SCOPE: "workspace-changed", BROWSER_STALE: "document-changed", BROWSER_CLOSED: "closed", BROWSER_REVOKED: "stopped" })[error?.code ?? ""] ?? "disconnected";
  const errorDetail = (error) => {
    const failure = error;
    return `${/^BROWSER_[A-Z_]{1,50}$/.test(failure?.code ?? "") ? `[${failure?.code}] ` : ""}${String(failure?.message ?? "Browser connection failed.")}`.slice(0, 300);
  };
  async function call(method, payload) {
    const abort = new AbortController();
    requests.add(abort);
    const timeout = setTimeout(() => abort.abort(), 12e3);
    try {
      const value = await rpc.call("/api", `browser/${method}`, payload, abort.signal);
      if (!value?.ok) throw value?.error ?? fail("BROWSER_RPC", "Browser connection failed.");
      return value.value;
    } finally {
      requests.delete(abort);
      clearTimeout(timeout);
    }
  }
  function localRevoke(reason = "manual") {
    generation++;
    guest?.revoke();
    publish({ granted: false, busy: false, status: reason });
  }
  async function takeover(reason = "manual") {
    localRevoke(reason);
    const ownGeneration = generation;
    if (registration && !disposed) {
      try {
        const result = await call("revoke", auth());
        if (!disposed && generation === ownGeneration) publish({ grantRevision: result.grantRevision });
      } catch {
        publish({ error: "Browser connection failed. AI control remains disabled." });
      }
    }
  }
  const sync = () => call("sync", { ...auth(), epoch: guest.state().epoch, visible: visible && !documentObject?.hidden, title: guest.state().title, url: guest.state().url });
  async function execute(command) {
    if (running || !state.granted || !visible && registration?.background !== true || documentObject?.hidden) {
      await takeover("manual");
      return;
    }
    const ownGeneration = generation;
    let inputAdmitted = false;
    navigatedByCommand = false;
    running = command;
    publish({ busy: true, status: "running" });
    try {
      const outcome = await guest.perform(command, { beforeInput: async () => {
        if (disposed || ownGeneration !== generation) throw fail("BROWSER_REVOKED", "Browser control ended before input dispatch.");
        const confirmation = await call("confirm", { ...auth(), commandId: command.id, grantRevision: command.grantRevision, epoch: guest.state().epoch });
        if (!confirmation.allowed || disposed || ownGeneration !== generation) throw fail("BROWSER_REVOKED", "Browser input authority expired.");
        inputAdmitted = true;
      } });
      if (disposed || ownGeneration !== generation) return;
      await call("ack", { ...auth(), commandId: command.id, grantRevision: command.grantRevision, epoch: outcome.epoch, result: outcome.result });
      if (!disposed && ownGeneration === generation) publish({ status: "ready", error: null });
    } catch (error) {
      if (!disposed && ownGeneration === generation) {
        const failure = error;
        try {
          await call("ack", { ...auth(), commandId: command.id, grantRevision: command.grantRevision, epoch: guest.state().epoch, error: String(failure.message ?? error).slice(0, 300) });
        } catch {
        }
        if (!inputAdmitted) publish({ error: String(failure.message ?? "The browser refused the command.").slice(0, 300), status: "ready" });
        else if (navigatedByCommand && registration?.autoGrant === true) publish({ status: "ready", error: null });
        else {
          await takeover("stopped");
          publish({ error: String(failure.message ?? "Browser operation stopped.").slice(0, 300) });
          recoverUnattended();
        }
      }
    } finally {
      if (running === command) {
        running = null;
        publish({ busy: false });
      }
    }
  }
  async function pump() {
    if (disposed || !registration || !guest || pumping || granting) return;
    pumping = true;
    const ownGeneration = generation;
    try {
      const current = await sync();
      if (disposed || ownGeneration !== generation) return;
      if (state.granted && (!current.granted || current.grantRevision !== state.grantRevision)) {
        await takeover(current.status);
        return;
      }
      publish({ grantRevision: current.grantRevision });
      const result = await call("poll", auth());
      if (disposed) return;
      if (ownGeneration !== generation) {
        if (result.command) await takeover("stale-command");
        return;
      }
      if (state.granted && !result.granted) {
        await takeover(result.status);
        return;
      }
      if (result.command) void execute(result.command);
    } catch (error) {
      if (!disposed && ownGeneration === generation) {
        await takeover(stopReason(error));
        publish({ error: errorDetail(error) });
        recoverUnattended();
      }
    } finally {
      pumping = false;
      for (const done of pumpWaiters.splice(0)) done();
      if (!disposed && !granting) timer = setTimeout(pump, pollMs);
    }
  }
  let regrantTimer;
  function scheduleRegrant() {
    clearTimeout(regrantTimer);
    regrantTimer = setTimeout(() => {
      if (disposed || !visible || documentObject?.hidden) return;
      void grantNow();
    }, 400);
  }
  function recoverUnattended() {
    if (registration?.autoGrant !== true || autoRecoveries >= MAX_AUTO_RECOVERIES) return;
    if (disposed || !visible || documentObject?.hidden) return;
    autoRecoveries += 1;
    scheduleRegrant();
  }
  const visibility = () => {
    if (documentObject?.hidden && registration?.background !== true) void takeover("hidden");
  };
  documentObject?.addEventListener("visibilitychange", visibility);
  async function grantNow() {
    if (disposed || granting || !guest?.state().ready || !visible && registration?.background !== true || documentObject?.hidden) return;
    granting = true;
    clearTimeout(timer);
    localRevoke("manual");
    const ownGeneration = generation;
    try {
      if (pumping) await new Promise((resolve) => pumpWaiters.push(resolve));
      if (disposed || ownGeneration !== generation || !visible || documentObject?.hidden) return;
      await call("revoke", auth());
      if (disposed || ownGeneration !== generation) return;
      const fresh = await sync();
      if (disposed || ownGeneration !== generation) return;
      const granted = await call("grant", { ...auth(), epoch: fresh.epoch, grantRevision: fresh.grantRevision });
      if (disposed || ownGeneration !== generation || !visible) {
        void takeover("hidden");
        return;
      }
      guest.grant(granted.grantRevision);
      autoRecoveries = 0;
      publish({ granted: true, grantRevision: granted.grantRevision, status: "ready", error: null });
    } catch (error) {
      if (!disposed && ownGeneration === generation) {
        const failure = error;
        await takeover("manual");
        publish({ error: String(failure.message ?? "AI access was not enabled.") });
      }
    } finally {
      granting = false;
      if (!disposed) {
        clearTimeout(timer);
        timer = setTimeout(pump, 0);
      }
    }
  }
  const autoGrant = () => {
    if (disposed || granting || state.granted || !guest?.state().ready || !visible && registration?.background !== true || documentObject?.hidden) return;
    void grantNow();
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start() {
      try {
        if (desktop?.protocolVersion !== 1 || !desktop.browser) throw fail("BROWSER_DESKTOP", "A compatible DSH Desktop shell is required. Web preview does not provide an embedded browser.");
        registration = await call("register", { sessionId, clientTabId });
        if (disposed) {
          await call("close", auth()).catch(() => {
          });
          return;
        }
        guest = guestFactory({
          desktop,
          workspace: registration.workspace,
          host,
          applicationOrigin,
          documentObject,
          allowHidden: registration.background === true,
          onOpen,
          onChange: (next) => {
            publish(next);
            if (next.ready && registration?.autoGrant === true && !state.granted && !autoGrantTried) {
              autoGrantTried = true;
              void autoGrant();
            }
          },
          onInvalidate: (reason, navigation) => {
            if (navigation && registration?.autoGrant === true) {
              if (running) navigatedByCommand = true;
              else if (state.granted) scheduleRegrant();
              return;
            }
            if ((state.granted || granting) && !(navigation && running && NAVIGATION.has(running.action))) void takeover(reason);
          }
        });
        publish({ tabId: registration.tabId, grantRevision: registration.grantRevision, autoGrant: registration.autoGrant === true, background: registration.background === true });
        await guest.start();
        if (disposed) return;
        if (initialUrl) await guest.navigate(initialUrl).catch(() => {
        });
        if (disposed) return;
        publish({ status: "manual" });
        void pump();
        if (registration.autoGrant === true) void autoGrant();
      } catch (error) {
        if (!disposed) {
          const failure = error;
          publish({ status: "unavailable", error: String(failure.message ?? "Embedded browser unavailable."), ready: false });
        }
      }
    },
    setVisible(value) {
      visible = Boolean(value);
      publish({ visible });
      if (!visible) {
        if (registration?.background !== true) void takeover("hidden");
        return;
      }
      if (registration?.autoGrant === true) void autoGrant();
    },
    grant: grantNow,
    takeover,
    async navigate(url) {
      void takeover();
      if (!disposed) {
        try {
          await guest.navigate(url);
          publish({ error: null });
        } catch (error) {
          const failure = error;
          publish({ error: failure.message });
        }
      }
    },
    async manual(action) {
      void takeover();
      if (!disposed) {
        try {
          guest.manual(action);
        } catch (error) {
          const failure = error;
          publish({ error: failure.message });
        }
      }
    },
    async dispose() {
      if (disposed) return;
      localRevoke("closed");
      disposed = true;
      clearTimeout(timer);
      documentObject?.removeEventListener("visibilitychange", visibility);
      for (const request of requests) request.abort();
      if (registration) await call("close", auth()).catch(() => {
      });
      await guest?.dispose();
      listeners.clear();
    }
  };
}

// src/client/components.tsx
var import_react = __toESM(require("react"), 1);
function BrowserIcon() {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: "19", height: "19", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement("circle", { cx: "12", cy: "12", r: "9" }), /* @__PURE__ */ import_react.default.createElement("ellipse", { cx: "12", cy: "12", rx: "4", ry: "9" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M3 12h18M5 7h14M5 17h14" }));
}
function BrowserEntry({ open, t }) {
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dxb-dock" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxb-entry", "data-testid": "dxb-entry", title: t("open"), onClick: open }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dxb-entry-icon", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement(BrowserIcon, null)), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxb-entry-label" }, t("title")), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxb-entry-go", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement("svg", { viewBox: "0 0 24 24", width: "14", height: "14", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "m9 6 6 6-6 6", strokeLinecap: "round", strokeLinejoin: "round" })))));
}
function BrowserTitle({ useTabInfo }) {
  const { tab } = useTabInfo();
  return /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement(BrowserIcon, null), tab.title);
}
function BrowserBody({ sessionId, useTabInfo, createController, t }) {
  const { tab } = useTabInfo(), host = (0, import_react.useRef)(null), controller = (0, import_react.useRef)(null);
  const [state, setState] = (0, import_react.useState)({ status: "loading", ready: false, granted: false, url: "", title: "", error: null }), [address, setAddress] = (0, import_react.useState)(""), [consent, setConsent] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    const owner = createController({ sessionId, clientTabId: tab.id, host: host.current, initialUrl: tab.navigation.params?.url, onOpen: (url) => tab.actions.openTab("dsh-x-browser", { params: { url }, revealIfOpened: false }) });
    controller.current = owner;
    const unsubscribe = owner.subscribe(() => setState(owner.getSnapshot()));
    owner.setVisible(tab.visible);
    const close = () => {
      void owner.dispose();
    };
    tab.signal.addEventListener("abort", close, { once: true });
    void owner.start();
    const unbind = tab.actions.bindCommands({ refresh: () => {
      void owner.manual("reload");
    } });
    return () => {
      unsubscribe();
      unbind();
      tab.signal.removeEventListener("abort", close);
      void owner.dispose();
      if (controller.current === owner) controller.current = null;
    };
  }, [sessionId, tab.id, tab.signal, createController]);
  (0, import_react.useLayoutEffect)(() => {
    controller.current?.setVisible(tab.visible);
    if (!tab.visible) setConsent(false);
  }, [tab.visible]);
  (0, import_react.useEffect)(() => {
    setAddress(state.url);
  }, [state.url]);
  const status = ["loading", "unavailable", "running", "ready", "disconnected", "hidden", "stopped", "closed", "turn-ended", "workspace-changed", "native-run-ended", "document-changed"].includes(state.status) ? state.status : "manual";
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxb-pane", "data-testid": "dxb-pane", "aria-label": t("title") }, /* @__PURE__ */ import_react.default.createElement("form", { className: "dxb-toolbar", onSubmit: (event) => {
    event.preventDefault();
    void controller.current?.navigate(address);
  } }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxb-nav" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxb-icon-button", title: t("back"), "aria-label": t("back"), disabled: !state.ready || !state.canGoBack, onClick: () => controller.current?.manual("back") }, "\u2039"), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxb-icon-button", title: t("forward"), "aria-label": t("forward"), disabled: !state.ready || !state.canGoForward, onClick: () => controller.current?.manual("forward") }, "\u203A"), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxb-icon-button", title: t(state.loading ? "stop" : "reload"), "aria-label": t(state.loading ? "stop" : "reload"), disabled: !state.ready, onClick: () => controller.current?.manual(state.loading ? "stop" : "reload") }, state.loading ? "\xD7" : "\u21BB")), /* @__PURE__ */ import_react.default.createElement("input", { "data-testid": "dxb-address", "aria-label": t("address"), placeholder: "https://", value: address, onChange: (event) => setAddress(event.target.value), spellCheck: false }), /* @__PURE__ */ import_react.default.createElement("button", { "data-testid": "dxb-go", type: "submit", disabled: !state.ready || !address.trim() }, t("go")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxb-icon-button", title: t("newTab"), "aria-label": t("newTab"), onClick: () => tab.actions.openTab("dsh-x-browser", { revealIfOpened: false }) }, "\uFF0B")), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxb-control", "data-active": state.granted || void 0 }, /* @__PURE__ */ import_react.default.createElement("span", { role: "status", "data-testid": "dxb-status", className: "dxb-status" }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dxb-dot" }), t(status)), state.granted ? /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxb-takeover", "data-testid": "dxb-takeover", onClick: () => {
    setConsent(false);
    void controller.current?.takeover();
  } }, t("takeover")) : state.autoGrant ? /* @__PURE__ */ import_react.default.createElement("span", { className: "dxb-auto", "data-testid": "dxb-auto" }, t("autoPending")) : state.ready ? /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxb-primary", "data-testid": "dxb-enable-ai", disabled: !tab.visible, onClick: () => setConsent(true) }, t("enable")) : null), consent && /* @__PURE__ */ import_react.default.createElement("section", { className: "dxb-consent", role: "dialog", "aria-label": t("enable") }, /* @__PURE__ */ import_react.default.createElement("p", null, t("consent")), /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => setConsent(false) }, t("cancel")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dxb-primary", "data-testid": "dxb-confirm-ai", onClick: () => {
    setConsent(false);
    void controller.current?.grant();
  } }, t("grant")))), state.error && /* @__PURE__ */ import_react.default.createElement("div", { className: "dxb-error", role: "alert" }, /* @__PURE__ */ import_react.default.createElement("p", null, t(state.status === "unavailable" ? "desktopOnly" : "error")), /* @__PURE__ */ import_react.default.createElement("details", null, /* @__PURE__ */ import_react.default.createElement("summary", null, t("details")), /* @__PURE__ */ import_react.default.createElement("p", null, state.error))), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxb-viewport" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxb-guest-host", ref: host }), !state.url && !state.error && /* @__PURE__ */ import_react.default.createElement("div", { className: "dxb-placeholder" }, /* @__PURE__ */ import_react.default.createElement(BrowserIcon, null), /* @__PURE__ */ import_react.default.createElement("p", null, t(state.ready ? "start" : "loading")))), /* @__PURE__ */ import_react.default.createElement("footer", { className: "dxb-footer" }, /* @__PURE__ */ import_react.default.createElement("span", null, t("experimental")), /* @__PURE__ */ import_react.default.createElement("details", null, /* @__PURE__ */ import_react.default.createElement("summary", null, t("details")), /* @__PURE__ */ import_react.default.createElement("p", null, t("privacy")), /* @__PURE__ */ import_react.default.createElement("p", null, t("limitations")))));
}

// src/client/locales.ts
var NS = "dshXBrowser";
var en = {
  title: "AI Browser",
  open: "Open embedded browser",
  description: "Browse beside your conversation. Desktop only; experimental.",
  address: "Website address",
  go: "Go",
  back: "Back",
  forward: "Forward",
  reload: "Reload",
  stop: "Stop loading",
  newTab: "New browser tab",
  enable: "Allow AI on this tab",
  takeover: "Take over / Stop AI",
  manual: "You are in control",
  ready: "AI access enabled",
  running: "AI is using this visible tab",
  loading: "Starting embedded Chromium\u2026",
  unavailable: "Embedded browser unavailable",
  disconnected: "AI stopped: connection lost",
  hidden: "AI stopped: tab hidden",
  stopped: "AI stopped",
  closed: "AI stopped: tab closed",
  "turn-ended": "AI stopped: authorized turn ended",
  "workspace-changed": "AI stopped: workspace changed",
  "native-run-ended": "AI stopped: native run ended",
  "document-changed": "AI stopped: page changed",
  consent: "Allow the current DSH conversation to read this page and request actions in this visible tab. Actions ask for approval. Page observations become conversation history and may be sent to your configured DSH model or an explicitly enabled OpenCode model for this run. Passwords, payment details and sign-in codes must be entered manually.",
  grant: "Allow page access",
  cancel: "Cancel",
  experimental: "Experimental \xB7 desktop validation required",
  autoPending: "AI access is automatic in this profile",
  desktopOnly: "This feature needs a compatible DSH Desktop app. Web preview cannot embed Chromium. No external browser was opened.",
  start: "Enter a website address to start browsing.",
  privacy: "Permissions, downloads, HTTP authentication and native pop-ups stay blocked by the Desktop shell.",
  limitations: "AI sees visible top-frame text and plain controls. Frames, canvas and closed shadow roots may need your help. Manual input is yours after Take over.",
  details: "Technical details",
  error: "The browser action could not finish. AI control is disabled; check the page before retrying."
};
var zh = {
  title: "AI \u6D4F\u89C8\u5668",
  open: "\u6253\u5F00\u5185\u5D4C\u6D4F\u89C8\u5668",
  description: "\u5728\u5BF9\u8BDD\u65C1\u8FB9\u6D4F\u89C8\u7F51\u9875\u3002\u4EC5\u9650\u684C\u9762\u7AEF\uFF0C\u5B9E\u9A8C\u529F\u80FD\u3002",
  address: "\u7F51\u9875\u5730\u5740",
  go: "\u524D\u5F80",
  back: "\u540E\u9000",
  forward: "\u524D\u8FDB",
  reload: "\u91CD\u65B0\u52A0\u8F7D",
  stop: "\u505C\u6B62\u52A0\u8F7D",
  newTab: "\u65B0\u5EFA\u6D4F\u89C8\u5668\u6807\u7B7E\u9875",
  enable: "\u5141\u8BB8 AI \u64CD\u4F5C\u6B64\u9875",
  takeover: "\u63A5\u7BA1 / \u505C\u6B62 AI",
  manual: "\u7531\u4F60\u63A7\u5236",
  ready: "\u5DF2\u5141\u8BB8 AI \u8BBF\u95EE",
  running: "AI \u6B63\u5728\u64CD\u4F5C\u6B64\u53EF\u89C1\u9875\u9762",
  loading: "\u6B63\u5728\u542F\u52A8\u5185\u5D4C Chromium\u2026",
  unavailable: "\u5185\u5D4C\u6D4F\u89C8\u5668\u4E0D\u53EF\u7528",
  disconnected: "AI \u5DF2\u505C\u6B62\uFF1A\u8FDE\u63A5\u4E2D\u65AD",
  hidden: "AI \u5DF2\u505C\u6B62\uFF1A\u6807\u7B7E\u9875\u5DF2\u9690\u85CF",
  stopped: "AI \u5DF2\u505C\u6B62",
  closed: "AI \u5DF2\u505C\u6B62\uFF1A\u6807\u7B7E\u9875\u5DF2\u5173\u95ED",
  "turn-ended": "AI \u5DF2\u505C\u6B62\uFF1A\u5DF2\u6388\u6743\u7684\u5BF9\u8BDD\u8F6E\u6B21\u7ED3\u675F",
  "workspace-changed": "AI \u5DF2\u505C\u6B62\uFF1A\u5DE5\u4F5C\u533A\u6539\u53D8",
  "native-run-ended": "AI \u5DF2\u505C\u6B62\uFF1A\u539F\u751F\u8FD0\u884C\u7ED3\u675F",
  "document-changed": "AI \u5DF2\u505C\u6B62\uFF1A\u9875\u9762\u6539\u53D8",
  consent: "\u5141\u8BB8\u5F53\u524D DSH \u5BF9\u8BDD\u8BFB\u53D6\u6B64\u9875\u9762\uFF0C\u5E76\u8BF7\u6C42\u64CD\u4F5C\u8FD9\u4E2A\u53EF\u89C1\u6807\u7B7E\u9875\u3002\u64CD\u4F5C\u524D\u4F1A\u8BF7\u6C42\u6279\u51C6\uFF1B\u9875\u9762\u89C2\u5BDF\u7ED3\u679C\u4F1A\u8FDB\u5165\u5BF9\u8BDD\u8BB0\u5F55\uFF0C\u5E76\u53EF\u80FD\u53D1\u9001\u7ED9\u4F60\u914D\u7F6E\u7684 DSH \u6A21\u578B\u6216\u672C\u6B21\u660E\u786E\u542F\u7528\u7684 OpenCode \u6A21\u578B\u3002\u5BC6\u7801\u3001\u652F\u4ED8\u8D44\u6599\u548C\u767B\u5F55\u9A8C\u8BC1\u7801\u8BF7\u624B\u52A8\u8F93\u5165\u3002",
  grant: "\u5141\u8BB8\u8BBF\u95EE\u9875\u9762",
  cancel: "\u53D6\u6D88",
  experimental: "\u5B9E\u9A8C\u529F\u80FD \xB7 \u5C1A\u9700\u684C\u9762\u5B9E\u673A\u9A8C\u8BC1",
  autoPending: "\u6B64 profile \u5DF2\u81EA\u52A8\u5141\u8BB8 AI \u8BBF\u95EE",
  desktopOnly: "\u6B64\u529F\u80FD\u9700\u8981\u517C\u5BB9\u7684 DSH \u684C\u9762\u5E94\u7528\u3002\u7F51\u9875\u7248\u9884\u89C8\u4E0D\u80FD\u5185\u5D4C Chromium\uFF0C\u4E5F\u4E0D\u4F1A\u6253\u5F00\u5916\u90E8\u6D4F\u89C8\u5668\u3002",
  start: "\u8F93\u5165\u7F51\u9875\u5730\u5740\uFF0C\u5F00\u59CB\u6D4F\u89C8\u3002",
  privacy: "\u684C\u9762\u5185\u6838\u7EE7\u7EED\u963B\u6B62\u6743\u9650\u7533\u8BF7\u3001\u4E0B\u8F7D\u3001HTTP \u8EAB\u4EFD\u9A8C\u8BC1\u53CA\u539F\u751F\u5F39\u7A97\u3002",
  limitations: "AI \u53EA\u80FD\u8BFB\u53D6\u9876\u5C42\u9875\u9762\u7684\u53EF\u89C1\u6587\u5B57\u548C\u666E\u901A\u63A7\u4EF6\u3002\u6846\u67B6\u3001\u753B\u5E03\u548C\u5C01\u95ED Shadow DOM \u53EF\u80FD\u9700\u8981\u4F60\u534F\u52A9\u3002\u64CD\u4F5C\u7F51\u9875\u524D\u53EF\u5148\u70B9\u300C\u63A5\u7BA1\u300D\u3002",
  details: "\u6280\u672F\u8BE6\u60C5",
  error: "\u6D4F\u89C8\u5668\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0CAI \u63A7\u5236\u5DF2\u505C\u7528\u3002\u91CD\u8BD5\u524D\u8BF7\u5148\u786E\u8BA4\u9875\u9762\u72B6\u6001\u3002"
};

// src/client/styles.ts
var CSS = `
.dxb-pane{--dxb-bg:var(--dsw-alias-bg-layer-1,#fff);--dxb-soft:var(--dsw-alias-bg-layer-2,#f5f6f8);--dxb-title:var(--dsw-specific-sidebar-fill,var(--dxb-soft));--dxb-line:var(--dsw-alias-border-l2,#e2e5e9);--dxb-line-soft:var(--dsw-alias-border-l1,#eceef1);--dxb-fg:var(--dsw-alias-label-primary,#20252e);--dxb-muted:var(--dsw-alias-label-secondary,#717885);--dxb-accent:var(--dsw-alias-brand-primary,#4666d5);--dxb-warn:var(--dsw-alias-state-warn-primary,#9b6815);--dxb-ok:var(--dsw-alias-state-success-primary,#2b865c);--dxb-idle:var(--dsw-alias-state-idle-primary,#87909e);display:flex;flex-direction:column;height:100%;min-height:180px;min-width:0;color:var(--dxb-fg);background:var(--dxb-bg);font:13px/1.5 var(--dsw-font-family,system-ui,sans-serif);container-type:inline-size}
.dxb-pane *{box-sizing:border-box}
.dxb-pane h1,.dxb-pane p{margin:0}
.dxb-pane button,.dxb-pane input{font:inherit;color:inherit}
.dxb-pane button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 10px;font-size:12px;line-height:1;border:1px solid var(--dxb-line);border-radius:6px;background:var(--dxb-bg);cursor:pointer;white-space:nowrap}
.dxb-pane button:hover:not(:disabled){background:var(--dxb-soft)}
.dxb-pane button:disabled{opacity:.45;cursor:not-allowed}
.dxb-pane button:focus-visible,.dxb-pane input:focus-visible{outline:2px solid var(--dxb-accent);outline-offset:2px}
.dxb-pane .dxb-primary{background:var(--dxb-accent);border-color:transparent;color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:550}
.dxb-pane .dxb-primary:hover:not(:disabled){background:color-mix(in srgb,var(--dxb-accent) 88%,#000)}
.dxb-icon-button{width:28px;padding:0;border-color:transparent;background:transparent;color:var(--dxb-muted);font-size:16px}
.dxb-icon-button:hover:not(:disabled){background:var(--dxb-soft);color:var(--dxb-fg)}
.dxb-dock{box-sizing:border-box;flex:none;width:calc(100% - var(--dsh-composer-side-clearance,16px) - var(--dsh-composer-side-clearance,16px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));max-width:calc(var(--dsh-composer-card-max-width,952px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));margin:0 auto;padding:0 var(--dsh-composer-dock-inset,8px)}
.dxb-entry{box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;height:32px;margin:0;padding:0 10px;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary,#20252e);font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:13px;font-weight:500;line-height:20px;text-align:left;white-space:nowrap;cursor:pointer}
.dxb-entry:hover{background:var(--dsw-alias-bg-layer-2,#f2f3f5)}
.dxb-entry:active{background:var(--dsw-alias-bg-layer-2,#e9ebee)}
.dxb-entry:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4666d5);outline-offset:-2px}
.dxb-entry-icon{display:grid;place-items:center;flex:none;color:var(--dsw-alias-label-secondary,#717885)}
.dxb-entry-icon svg{width:16px;height:16px}
.dxb-entry-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.dxb-entry-go{display:grid;place-items:center;flex:none;color:var(--dsw-alias-label-secondary,#717885);opacity:.75}
.dxb-toolbar{display:flex;align-items:center;gap:6px;min-height:44px;padding:8px 10px;padding-inline-start:max(10px,var(--dsh-frame-leading-clearance,0px));border-bottom:1px solid var(--dxb-line-soft);background:var(--dxb-title);flex:none}
.dxb-nav{display:flex;align-items:center;gap:2px;flex:none}
.dxb-toolbar input{height:28px;font:inherit;font-size:12px;border:1px solid var(--dxb-line);border-radius:6px;padding:0 10px;min-width:0;flex:1;background:var(--dxb-bg);color:inherit}
.dxb-control{display:flex;align-items:center;gap:8px;justify-content:space-between;min-height:40px;padding:6px 10px;border-bottom:1px solid var(--dxb-line-soft);background:var(--dxb-bg);flex-wrap:wrap;flex:none}
.dxb-status{display:inline-flex;align-items:center;gap:7px;min-width:0;font-size:12px;color:var(--dxb-muted)}
.dxb-dot{width:7px;height:7px;background:var(--dxb-idle);border-radius:50%;flex:none}
.dxb-control[data-active] .dxb-dot{background:var(--dxb-ok)}
.dxb-takeover{color:var(--dxb-warn);border-color:color-mix(in srgb,var(--dxb-warn) 45%,var(--dxb-line));background:color-mix(in srgb,var(--dxb-warn) 12%,var(--dxb-bg))}
.dxb-takeover:hover:not(:disabled){background:color-mix(in srgb,var(--dxb-warn) 18%,var(--dxb-bg))}
.dxb-consent{margin:10px;padding:12px;border:1px solid var(--dxb-line-soft);border-radius:8px;background:var(--dxb-soft);font-size:12px}
.dxb-consent p{margin:0 0 10px}
.dxb-consent>div{display:flex;gap:8px;justify-content:flex-end}
.dxb-error{padding:10px 12px;background:color-mix(in srgb,var(--dxb-warn) 10%,var(--dxb-bg));border-bottom:1px solid var(--dxb-line-soft);color:var(--dxb-warn);overflow-wrap:anywhere;max-height:180px;overflow:auto;font-size:12px}
.dxb-error p{margin:0 0 5px}
.dxb-viewport{flex:1;min-height:100px;position:relative;display:flex}
.dxb-guest-host{position:absolute;inset:0;display:flex}
.dxb-webview{display:flex;flex:1;width:100%;height:100%;border:0;background:var(--dxb-bg)}
.dxb-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;pointer-events:none;color:var(--dxb-muted)}
.dxb-footer{padding:6px 10px;border-top:1px solid var(--dxb-line-soft);font-size:11px;color:var(--dxb-muted);display:flex;gap:8px;align-items:baseline;justify-content:space-between;flex:none}
.dxb-footer details{max-width:70%}
.dxb-footer p{margin:7px 0}
.dxb-footer summary{cursor:pointer}
@container(max-width:420px){.dxb-toolbar{gap:4px;padding:6px 8px}.dxb-toolbar button{padding:0 8px}.dxb-icon-button{width:28px;padding:0}.dxb-control{align-items:flex-start}.dxb-footer{flex-direction:column}.dxb-footer details{max-width:100%}}
`;

// src/client/index.ts
var inject = ["slots", "locale", "connection", "sidebarRight", "sidebarRightTabs"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), "browser: dictionaries");
  const t = ctx.locale.bind(NS), controllers = /* @__PURE__ */ new Set(), factories = /* @__PURE__ */ new Map();
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = "dsh-x-browser";
    style.textContent = CSS;
    document.head.append(style);
    return () => style.remove();
  }, "browser: styles");
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: "dsh-x-browser", kind: "dsh-x-browser", multiple: true, keepMounted: true, title: () => t("title"), guide: [{ id: "new", order: 35, title: () => t("title"), description: () => t("description"), icon: BrowserIcon }] }), "browser: tab type");
  let paneSession;
  const createController = (options) => {
    paneSession = options.sessionId;
    const owner = createBrowserController({ ...options, rpc: ctx.connection.rpc });
    const dispose = owner.dispose;
    owner.dispose = async () => {
      controllers.delete(owner);
      await dispose();
    };
    controllers.add(owner);
    return owner;
  };
  const factoryFor = (sessionId) => {
    if (!factories.has(sessionId)) factories.set(sessionId, (options) => createController({ ...options, sessionId }));
    return factories.get(sessionId);
  };
  ctx.effect(() => () => {
    for (const owner of controllers) void owner.dispose();
    controllers.clear();
    factories.clear();
  }, "browser: owned guests");
  ctx.on("connection/reset", () => {
    for (const owner of controllers) void owner.takeover("disconnected");
  });
  ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: "dsh-x-browser", locale: NS, inject: (sessionId) => ({ createController: factoryFor(sessionId) }) }, BrowserBody)), "browser: body");
  ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({ name: "sidebar.right.pane.tab.title", key: "dsh-x-browser" }, BrowserTitle)), "browser: title");
  ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({ name: "conversation.input.dock", id: "dsh-x-browser", order: -9, locale: NS, inject: () => ({ open: () => ctx.sidebarRight.openTab("dsh-x-browser") }) }, BrowserEntry));
  ctx.effect(() => {
    let stopped = false, timer, busy = false;
    const tick = async () => {
      if (stopped || busy) return;
      const sessionId = ctx.sidebarRight.mounted?.getSnapshot?.() ?? paneSession;
      if (sessionId) {
        busy = true;
        try {
          const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 8e3);
          const reply = await ctx.connection.rpc.call("/api", "browser/open", { sessionId }, abort.signal).finally(() => clearTimeout(timeout));
          const value = reply?.ok ? reply.value : void 0;
          const url = value?.url;
          if (!stopped && typeof url === "string" && url) ctx.sidebarRight.openTab("dsh-x-browser", { params: { url }, revealIfOpened: value?.reveal !== false });
        } catch {
        } finally {
          busy = false;
        }
      }
      if (!stopped) timer = setTimeout(tick, 2e3);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, "browser: automatic tab opening");
}
return module.exports; } });
