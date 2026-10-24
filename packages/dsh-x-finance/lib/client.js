/*! TradingView Lightweight Charts™; Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/; see bundled licenses/lightweight-charts.NOTICE and LICENSE. */
window.__ModuleLoader__.load({ id: "dsh-x-finance", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
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

// src/watchlist.ts
var watchlistError = (code) => Object.assign(new Error(code), { code });
var MAX_WATCHLIST = 200;
var MAX_FIXED = 8;
var STORAGE_KEY = "dsh-x-finance:watchlist:v2";
var LEGACY_STORAGE_KEY = "dsh-x-finance:watchlist:v1";
var PREVIOUS_STORAGE_KEY = "dsh-x-stock:watchlist:v2";
var PREVIOUS_LEGACY_STORAGE_KEY = "dsh-x-stock:watchlist:v1";
var QUOTE_CHANNEL = "/api";
function normalizeAShare(exchange, code) {
  const market = String(exchange).trim().toUpperCase();
  const digits = String(code).trim();
  if (!["SH", "SZ", "BJ"].includes(market) || !/^\d{6}$/.test(digits)) throw watchlistError("invalid-code");
  return `${market}.${digits}`;
}
function validateSymbol(symbol) {
  if (typeof symbol !== "string" || !/^(SH|SZ|BJ)\.\d{6}$/.test(symbol)) throw watchlistError("invalid-symbol");
  return symbol;
}
function normalizeItem(raw) {
  const item = raw;
  if (!item || typeof item !== "object") throw watchlistError("invalid-item");
  const symbol = validateSymbol(item.symbol);
  const alias = typeof item.alias === "string" ? item.alias.trim().slice(0, 24) : "";
  return { symbol, alias, fixed: item.fixed === true };
}
function parseSaved(raw) {
  if (!raw) return { items: [], collapsed: false, barHidden: false };
  const value = JSON.parse(raw);
  if (value?.version === 1) {
    if (!Array.isArray(value.pins) || value.pins.length > MAX_WATCHLIST) throw watchlistError("invalid-saved");
    const items2 = value.pins.map(normalizeItem);
    if (new Set(items2.map((item) => item.symbol)).size !== items2.length) throw watchlistError("duplicate-saved");
    return { items: items2, collapsed: value.collapsed === true, barHidden: false };
  }
  if (value?.version !== 2 || !Array.isArray(value.items) || value.items.length > MAX_WATCHLIST) throw watchlistError("invalid-saved");
  const items = value.items.map(normalizeItem);
  if (new Set(items.map((item) => item.symbol)).size !== items.length) throw watchlistError("duplicate-saved");
  if (items.filter((item) => item.fixed).length > MAX_FIXED) throw watchlistError("invalid-saved");
  return { items, collapsed: value.collapsed === true, barHidden: value.barHidden === true };
}
var fixedItems = (items) => items.filter((item) => item.fixed);
function quoteStatus(quote, now = Date.now()) {
  if (!quote || quote.status === "unconfigured") return "unconfigured";
  if (quote.status === "unavailable") return "unavailable";
  if (!quote.quotedAt || !Number.isFinite(Date.parse(quote.quotedAt))) return "unknown-time";
  if (now - Date.parse(quote.quotedAt) > 18e4) return "stale";
  return quote.marketStatus === "closed" ? "closed" : "recent";
}
var SCOPE_ENDPOINT = "dsh-x-finance.scope";
function validateScope(scope) {
  if (typeof scope !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scope)) throw watchlistError("invalid-scope");
  return scope.toLowerCase();
}
var scopedStorageKey = (scope) => `${STORAGE_KEY}:${validateScope(scope)}`;
var legacyScopedStorageKey = (scope) => `${LEGACY_STORAGE_KEY}:${validateScope(scope)}`;
var previousScopedStorageKeys = (scope) => {
  const id = validateScope(scope);
  return [`${PREVIOUS_STORAGE_KEY}:${id}`, `${PREVIOUS_LEGACY_STORAGE_KEY}:${id}`];
};

// src/client/controller.ts
function createWatchlistController(storage, eventTarget) {
  const listeners = /* @__PURE__ */ new Set();
  let storageKey = null;
  let state = { items: [], collapsed: false, barHidden: false, storageError: "", scopeStatus: "loading", scopeId: null, placement: "waiting", selectedSymbol: null };
  const publish = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const persist = (patch) => {
    if (!storageKey || state.scopeStatus !== "ready") throw watchlistError("scope-loading");
    publish(patch);
    try {
      if (!storage) throw new Error();
      storage.setItem(storageKey, JSON.stringify({ version: 2, items: state.items, collapsed: state.collapsed, barHidden: state.barHidden }));
      publish({ storageError: "" });
    } catch {
      publish({ storageError: "storage-save" });
    }
  };
  const storageChanged = (event) => {
    if (!storageKey || state.scopeStatus !== "ready" || event.key !== storageKey) return;
    try {
      publish({ ...parseSaved(event.newValue), storageError: "" });
    } catch {
      publish({ storageError: "storage-sync" });
    }
  };
  eventTarget?.addEventListener("storage", storageChanged);
  return {
    source: { getSnapshot: () => state, subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    } },
    setScope(scope) {
      const key = scopedStorageKey(scope);
      if (key === storageKey && state.scopeStatus === "ready") return;
      storageKey = key;
      let saved = { items: [], collapsed: false, barHidden: false }, storageError = "";
      try {
        const read = (name) => storage?.getItem(name) ?? null;
        const raw = read(key) ?? read(legacyScopedStorageKey(validateScope(scope))) ?? previousScopedStorageKeys(scope).map(read).find(Boolean) ?? null;
        saved = parseSaved(raw);
      } catch {
        storageError = "storage-read";
      }
      publish({ ...saved, selectedSymbol: saved.items[0]?.symbol ?? null, storageError, scopeStatus: "ready", scopeId: scope });
    },
    scopeLoading: () => {
      storageKey = null;
      publish({ scopeStatus: "loading", scopeId: null, items: [], selectedSymbol: null, collapsed: false, barHidden: false });
    },
    scopeFailed: () => {
      storageKey = null;
      publish({ items: [], selectedSymbol: null, scopeStatus: "failed", scopeId: null, storageError: "scope-unavailable" });
    },
    select: (symbol) => publish({ selectedSymbol: symbol }),
    setPlacement: (placement) => {
      if (state.placement !== placement) publish({ placement });
    },
    add(raw) {
      const item = normalizeItem(raw);
      if (state.items.some((current) => current.symbol === item.symbol)) throw watchlistError("duplicate");
      if (state.items.length >= MAX_WATCHLIST) throw watchlistError("limit");
      if (item.fixed && fixedItems(state.items).length >= MAX_FIXED) throw watchlistError("fixed-limit");
      persist({ items: [...state.items, item] });
    },
    remove(symbol) {
      const items = state.items.filter((item) => item.symbol !== symbol);
      persist({ items, selectedSymbol: state.selectedSymbol === symbol ? items[0]?.symbol ?? null : state.selectedSymbol });
    },
    move(symbol, offset) {
      const items = [...state.items], index = items.findIndex((item) => item.symbol === symbol), target = index + offset;
      if (index < 0 || ![-1, 1].includes(offset) || target < 0 || target >= items.length) return;
      [items[index], items[target]] = [items[target], items[index]];
      persist({ items });
    },
    /** Fixing a stock for the bottom bar is a separate, bounded decision. */
    setFixed(symbol, fixed) {
      const wanted = fixed === true;
      const current = state.items.find((item) => item.symbol === symbol);
      if (!current || current.fixed === wanted) return;
      if (wanted && fixedItems(state.items).length >= MAX_FIXED) throw watchlistError("fixed-limit");
      persist({ items: state.items.map((item) => item.symbol === symbol ? { ...item, fixed: wanted } : item) });
    },
    toggleBar: () => persist({ barHidden: !state.barHidden }),
    collapse: (collapsed) => persist({ collapsed: Boolean(collapsed) }),
    dispose() {
      eventTarget?.removeEventListener("storage", storageChanged);
      listeners.clear();
    }
  };
}

// src/client/placement.ts
function mountWhenVacant(slots, options, Component, hooks) {
  return slots.inject("shell.bottom", () => {
    let disposeEntry, stopped = false;
    const occupied = () => slots.entries("shell.bottom").some((entry) => entry.component !== Component);
    const withdraw = (placement) => {
      const dispose = disposeEntry;
      disposeEntry = void 0;
      dispose?.();
      hooks.onPlacement(placement);
    };
    const reconcile = () => {
      if (stopped) return;
      if (!hooks.visible()) {
        if (disposeEntry) withdraw("waiting");
        return;
      }
      if (occupied()) {
        withdraw("occupied");
        return;
      }
      if (!disposeEntry) {
        disposeEntry = slots.register({ ...options, name: "shell.bottom", priority: Number.MAX_SAFE_INTEGER }, Component);
        hooks.onPlacement("mounted");
      }
    };
    const unsubscribeSlots = slots.subscribe("shell.bottom", reconcile);
    const unsubscribeState = hooks.subscribe(reconcile);
    reconcile();
    return () => {
      stopped = true;
      unsubscribeSlots();
      unsubscribeState();
      disposeEntry?.();
      hooks.onPlacement("waiting");
    };
  });
}

// src/market.ts
var MARKET_ENDPOINT = "dsh-x-finance.market";
var MARKET_PREFERENCE_ENDPOINT = "dsh-x-finance.market-preference";
var MARKET_CACHE_TTL_MS = 5 * 6e4;
var MARKET_BOARD_TTL_MS = 2 * 6e4;
var MARKET_HISTORY_MAX_LIMIT = 1e3;
var MARKET_LEVEL1 = [
  { code: "801010", name: "\u519C\u6797\u7267\u6E14" },
  { code: "801030", name: "\u57FA\u7840\u5316\u5DE5" },
  { code: "801040", name: "\u94A2\u94C1" },
  { code: "801050", name: "\u6709\u8272\u91D1\u5C5E" },
  { code: "801080", name: "\u7535\u5B50" },
  { code: "801880", name: "\u6C7D\u8F66" },
  { code: "801110", name: "\u5BB6\u7528\u7535\u5668" },
  { code: "801120", name: "\u98DF\u54C1\u996E\u6599" },
  { code: "801130", name: "\u7EBA\u7EC7\u670D\u9970" },
  { code: "801140", name: "\u8F7B\u5DE5\u5236\u9020" },
  { code: "801150", name: "\u533B\u836F\u751F\u7269" },
  { code: "801160", name: "\u516C\u7528\u4E8B\u4E1A" },
  { code: "801170", name: "\u4EA4\u901A\u8FD0\u8F93" },
  { code: "801180", name: "\u623F\u5730\u4EA7" },
  { code: "801200", name: "\u5546\u8D38\u96F6\u552E" },
  { code: "801210", name: "\u793E\u4F1A\u670D\u52A1" },
  { code: "801780", name: "\u94F6\u884C" },
  { code: "801790", name: "\u975E\u94F6\u91D1\u878D" },
  { code: "801230", name: "\u7EFC\u5408" },
  { code: "801710", name: "\u5EFA\u7B51\u6750\u6599" },
  { code: "801720", name: "\u5EFA\u7B51\u88C5\u9970" },
  { code: "801730", name: "\u7535\u529B\u8BBE\u5907" },
  { code: "801890", name: "\u673A\u68B0\u8BBE\u5907" },
  { code: "801740", name: "\u56FD\u9632\u519B\u5DE5" },
  { code: "801750", name: "\u8BA1\u7B97\u673A" },
  { code: "801760", name: "\u4F20\u5A92" },
  { code: "801770", name: "\u901A\u4FE1" },
  { code: "801950", name: "\u7164\u70AD" },
  { code: "801960", name: "\u77F3\u6CB9\u77F3\u5316" },
  { code: "801970", name: "\u73AF\u4FDD" },
  { code: "801980", name: "\u7F8E\u5BB9\u62A4\u7406" }
];
var MARKET_LEVEL1_CODES = MARKET_LEVEL1.map((item) => item.code);
var level1Names = new Map(MARKET_LEVEL1.map((item) => [item.code, item.name]));
var clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
var average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
var round1 = (value) => Math.round(value * 10) / 10;
function computeSentiment(input) {
  const indexAverage = average(input.indexChanges.filter(Number.isFinite));
  const sectorAverage = average(input.sectorChanges.filter(Number.isFinite));
  const sectors = input.sectorChanges.filter(Number.isFinite);
  const breadth = input.breadth;
  const breadthTotal = breadth ? breadth.up + breadth.down + breadth.flat : 0;
  const factors = [];
  let missing = false;
  if (indexAverage !== null) factors.push({ key: "index", score: round1(clamp(50 + indexAverage * 10)), weight: 0.2 });
  else missing = true;
  if (breadth && breadthTotal > 0) factors.push({ key: "breadth", score: round1(clamp(50 + (breadth.up - breadth.down) / breadthTotal * 50)), weight: 0.45 });
  else missing = true;
  if (sectors.length) factors.push({ key: "sector", score: round1(sectors.filter((value2) => value2 > 0).length / sectors.length * 100), weight: 0.25 });
  else missing = true;
  if (sectorAverage !== null) factors.push({ key: "momentum", score: round1(clamp(50 + sectorAverage * 10)), weight: 0.1 });
  else missing = true;
  if (!factors.length) return null;
  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const score = factors.reduce((sum, factor) => sum + factor.score * (factor.weight / totalWeight), 0);
  const value = clamp(score);
  return {
    score: Math.round(value),
    label: value < 25 ? "extreme-fear" : value < 45 ? "fear" : value <= 55 ? "neutral" : value < 75 ? "greed" : "extreme-greed",
    factors: factors.map((factor) => ({ ...factor, weight: factor.weight / totalWeight })),
    partial: missing
  };
}
function shanghaiParts(at2) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23"
  }).formatToParts(at2);
  const pick = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${pick("year")}-${pick("month")}-${pick("day")}`,
    hour: Number(pick("hour")),
    minute: Number(pick("minute")),
    weekday: pick("weekday")
  };
}
function marketClock(now, quotedAt) {
  const current = shanghaiParts(now);
  const weekend = current.weekday === "Sat" || current.weekday === "Sun";
  const minutes = current.hour * 60 + current.minute;
  const phase = weekend ? "weekend" : minutes < 9 * 60 + 15 ? "preopen" : minutes < 9 * 60 + 30 ? "auction" : minutes < 11 * 60 + 30 ? "open" : minutes < 13 * 60 ? "lunch" : minutes < 15 * 60 ? "open" : "closed";
  let quoteToday = false;
  let stale = true;
  if (typeof quotedAt === "string" && Number.isFinite(Date.parse(quotedAt))) {
    const quote = shanghaiParts(new Date(quotedAt));
    quoteToday = quote.date === current.date;
    stale = !quoteToday || now.getTime() - Date.parse(quotedAt) > 10 * 6e4;
  }
  return { phase, quoteToday, stale };
}

// src/client/resource.ts
var PROTOCOL = "dsh-x-finance";
var addressFor = (symbol) => `dsh-resource://${PROTOCOL}/quote/${validateSymbol(symbol)}`;
var fixedAddressFor = (symbols) => `dsh-resource://${PROTOCOL}/fixed/${symbols.join(",")}`;
var FIXED_POLL_MS = 5e3;
var IDLE_POLL_MS = 6e4;
var STALE_AFTER_MS = 18e4;
function wait(ms2, signal, target) {
  return new Promise((resolve) => {
    let timer;
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      target?.removeEventListener("visibilitychange", done);
      globalThis.removeEventListener?.("online", done);
      resolve();
    };
    if (signal.aborted) return resolve();
    signal.addEventListener("abort", done, { once: true });
    target?.addEventListener("visibilitychange", done, { once: true });
    globalThis.addEventListener?.("online", done, { once: true });
    if (Number.isFinite(ms2)) timer = setTimeout(done, ms2);
  });
}
function parseSymbols(path) {
  const [kind, rest = ""] = String(path).slice(1).split("/");
  const raw = kind === "fixed" ? rest.split(",") : [rest];
  const symbols = raw.filter(Boolean).map(validateSymbol);
  if (!symbols.length || symbols.length > MAX_FIXED || new Set(symbols).size !== symbols.length) throw new Error("invalid resource address");
  return { realtime: kind === "fixed", symbols };
}
function quoteResource(rpc, documentObject = globalThis.document, navigatorObject = globalThis.navigator) {
  return {
    protocol: PROTOCOL,
    async *open(address, { signal }) {
      const { realtime, symbols } = parseSymbols(new URL(address).pathname);
      while (!signal.aborted) {
        if (documentObject?.hidden || navigatorObject?.onLine === false) {
          yield { ok: false, error: { code: navigatorObject?.onLine === false ? "finance/offline" : "finance/hidden", message: "Updates paused", details: {} } };
          await wait(Infinity, signal, documentObject);
          continue;
        }
        let result;
        try {
          result = await rpc.call(QUOTE_CHANNEL, MARKET_ENDPOINT, { kind: "quotes", symbols }, signal);
        } catch {
          result = { ok: false, error: { code: "finance/connection", message: "Connection lost", details: {} } };
        }
        if (signal.aborted) return;
        if (result.ok && result.value?.status === "unconfigured") result = { ok: true, value: { status: "unconfigured", source: null, quotes: [] } };
        else if (result.ok) {
          const quotes = Array.isArray(result.value?.quotes) ? result.value.quotes : null;
          if (!quotes || symbols.some((symbol) => !quotes.some((quote) => quote?.symbol === symbol))) result = { ok: false, error: { code: "finance/invalid", message: "Invalid quote response", details: {} } };
          else result = { ok: true, value: { status: "ready", source: typeof result.value.source === "string" ? result.value.source : null, quotes: symbols.map((symbol) => quotes.find((quote) => quote.symbol === symbol)) } };
        }
        yield result;
        const unconfigured = result.ok && result.value?.status === "unconfigured";
        await wait(unconfigured ? Infinity : pollDelay(result, realtime), signal, documentObject);
      }
    }
  };
}
function pollDelay(result, realtime, now = Date.now()) {
  if (!realtime) return IDLE_POLL_MS;
  const times = (result?.ok ? result.value?.quotes ?? [] : []).map((quote) => Date.parse(quote?.quotedAt)).filter((time) => Number.isFinite(time));
  if (!times.length) return IDLE_POLL_MS;
  return now - Math.max(...times) > STALE_AFTER_MS ? IDLE_POLL_MS : FIXED_POLL_MS;
}

// src/client/components.tsx
var import_react16 = __toESM(require("react"), 1);

// src/client/workbench.tsx
var import_react7 = __toESM(require("react"), 1);

// src/chart-data.ts
var CHART_SCHEMA_VERSION = 1;
var MAX_IMPORT_BYTES = 2 * 1024 * 1024;
var MAX_BARS = 5e3;
var MAX_ABSOLUTE_PRICE = 1e12;
var MAX_QUANTITY = Number.MAX_SAFE_INTEGER;
var DEMO_SYMBOL = "DEMO:SYNTH";
var DEMO_PROVIDER_ID = "demo-synthetic";
var ROOT_FIELDS = /* @__PURE__ */ new Set(["schemaVersion", "symbol", "name", "currency", "exchangeTimezone", "interval", "adjustment", "adjustmentRevision", "adjustmentMethod", "datasetRevision", "pricePrecision", "volumeUnit", "volumeAdjustment", "volumeAdjustmentMethod", "amountAdjustment", "amountAdjustmentMethod", "source", "bars"]);
var BAR_FIELDS = /* @__PURE__ */ new Set(["sessionDate", "open", "high", "low", "close", "volume", "amount", "isFinal", "updatedAt", "revision"]);
var SOURCE_FIELDS = /* @__PURE__ */ new Set(["kind", "label", "provenance"]);
var ChartDataError = class extends Error {
  constructor(code, path, detail) {
    super(`${path}: ${detail}`);
    this.name = "ChartDataError";
    this.code = code;
    this.path = path;
  }
};
function fail(code, path, detail) {
  throw new ChartDataError(code, path, detail);
}
function record(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("OBJECT", path, "expected a JSON object");
}
function knownFields(value, fields, path) {
  for (const key of Object.keys(value)) if (!fields.has(key)) fail("UNKNOWN_FIELD", path, "contains an unsupported field");
}
function text(value, path, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail("TEXT", path, `expected nonempty text of at most ${max} characters`);
  return value.trim();
}
function choice(value, allowed, path) {
  if (!allowed.includes(value)) fail("ENUM", path, `expected ${allowed.join(" or ")}`);
  return value;
}
function finite(value, path, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) fail("NUMBER", path, nullable ? "expected a finite number or explicit null" : "expected a finite number");
  return Object.is(value, -0) ? 0 : value;
}
function nonnegative(value, path) {
  const number2 = finite(value, path, true);
  if (number2 !== null && number2 < 0) fail("NONNEGATIVE", path, "must be nonnegative or null");
  if (number2 !== null && number2 > MAX_QUANTITY) fail("QUANTITY_RANGE", path, `exceeds the supported local-import range of ${MAX_QUANTITY}`);
  return number2;
}
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function isSessionDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1900 || year > 2199 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
function timestamp(value, path) {
  if (value === void 0 || value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !isSessionDate(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) fail("TIMESTAMP", path, "expected an ISO UTC timestamp ending in Z or null");
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) fail("TIMESTAMP", path, "invalid time of day");
  return value;
}
function method(input, adjustment, field) {
  if (adjustment === "adjusted") return text(input[field], field, 500);
  if (input[field] !== void 0 && input[field] !== "none") fail("PROVENANCE", field, "must be omitted or none for unadjusted values");
  return "none";
}
function fingerprint(input) {
  const value = JSON.stringify(input);
  let a2 = 2166136261;
  let b2 = 2654435769;
  for (let i = 0; i < value.length; i++) {
    a2 = Math.imul(a2 ^ value.charCodeAt(i), 16777619);
    b2 = Math.imul(b2 ^ value.charCodeAt(i), 2246822507);
  }
  return `${(a2 >>> 0).toString(16).padStart(8, "0")}${(b2 >>> 0).toString(16).padStart(8, "0")}`;
}
function validateChartDataset(raw) {
  const input = raw;
  record(input, "dataset");
  knownFields(input, ROOT_FIELDS, "dataset");
  if (input.schemaVersion !== CHART_SCHEMA_VERSION) fail("SCHEMA_VERSION", "schemaVersion", "expected 1");
  const symbol = text(input.symbol, "symbol", 64);
  if (!/^[A-Za-z0-9][A-Za-z0-9.:_\-]{0,63}$/.test(symbol) || /^DEMO(?:$|[:._-])/i.test(symbol)) fail("SYMBOL", "symbol", "expected a security identifier outside the reserved DEMO namespace");
  const currency = text(input.currency, "currency", 3);
  if (!/^[A-Z]{3}$/.test(currency)) fail("CURRENCY", "currency", "expected an uppercase three-letter currency code");
  const exchangeTimezone = text(input.exchangeTimezone, "exchangeTimezone", 80);
  try {
    new Intl.DateTimeFormat("en", { timeZone: exchangeTimezone });
  } catch {
    fail("TIMEZONE", "exchangeTimezone", "expected a recognized IANA timezone");
  }
  choice(input.interval, ["1d"], "interval");
  const adjustment = choice(input.adjustment, ["none", "forward", "backward"], "adjustment");
  const adjustmentRevision = text(input.adjustmentRevision, "adjustmentRevision");
  const adjustmentMethod = method(input, adjustment === "none" ? "unadjusted" : "adjusted", "adjustmentMethod");
  const datasetRevision = text(input.datasetRevision, "datasetRevision");
  const pricePrecision = input.pricePrecision;
  if (!Number.isInteger(pricePrecision) || pricePrecision < 0 || pricePrecision > 8) fail("PRECISION", "pricePrecision", "expected an integer from 0 to 8");
  choice(input.volumeUnit, ["shares"], "volumeUnit");
  const volumeAdjustment = choice(input.volumeAdjustment, ["unadjusted", "adjusted"], "volumeAdjustment");
  const volumeAdjustmentMethod = method(input, volumeAdjustment, "volumeAdjustmentMethod");
  const amountAdjustment = choice(input.amountAdjustment, ["not-provided", "unadjusted", "adjusted"], "amountAdjustment");
  const amountAdjustmentMethod = method(input, amountAdjustment, "amountAdjustmentMethod");
  record(input.source, "source");
  knownFields(input.source, SOURCE_FIELDS, "source");
  if (input.source.kind !== void 0 && input.source.kind !== "local-import") fail("SOURCE_KIND", "source.kind", "imports may only declare local-import");
  const source = { kind: "local-import", label: text(input.source.label, "source.label"), provenance: text(input.source.provenance, "source.provenance", 1e3), verified: false };
  if (!Array.isArray(input.bars) || input.bars.length < 1 || input.bars.length > MAX_BARS) fail("BAR_LIMIT", "bars", `expected 1 to ${MAX_BARS} daily bars`);
  let previousDate = "";
  let hasNonPositivePrices = false;
  const bars = input.bars.map((value, index) => {
    const path = `bars[${index}]`;
    record(value, path);
    knownFields(value, BAR_FIELDS, path);
    if (!isSessionDate(value.sessionDate)) fail("DATE", `${path}.sessionDate`, "expected a valid YYYY-MM-DD date from 1900 to 2199");
    if (value.sessionDate <= previousDate) fail(value.sessionDate === previousDate ? "DUPLICATE_DATE" : "DATE_ORDER", `${path}.sessionDate`, "dates must be unique and strictly increasing");
    previousDate = value.sessionDate;
    const bar = { sessionDate: value.sessionDate };
    for (const key of ["open", "high", "low", "close"]) {
      bar[key] = finite(value[key], `${path}.${key}`);
      if (Math.abs(bar[key]) > MAX_ABSOLUTE_PRICE) fail("PRICE_RANGE", `${path}.${key}`, "absolute price exceeds the supported local-import range of 1e12");
      if (bar[key] <= 0) {
        if (adjustment === "none") fail("RAW_PRICE", `${path}.${key}`, "unadjusted stock prices must be positive");
        hasNonPositivePrices = true;
      }
    }
    if (bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close) || bar.low > bar.high) fail("OHLC_ORDER", path, "expected low <= open/close <= high");
    bar.volume = nonnegative(value.volume, `${path}.volume`);
    bar.amount = nonnegative(value.amount === void 0 ? null : value.amount, `${path}.amount`);
    if (amountAdjustment === "not-provided" && bar.amount !== null) fail("AMOUNT_PROVENANCE", `${path}.amount`, "amountAdjustment must describe supplied amounts");
    bar.isFinal = value.isFinal;
    if (typeof bar.isFinal !== "boolean") fail("FINAL_FLAG", `${path}.isFinal`, "expected a boolean");
    bar.updatedAt = timestamp(value.updatedAt, `${path}.updatedAt`);
    bar.revision = value.revision === void 0 ? datasetRevision : text(value.revision, `${path}.revision`);
    return bar;
  });
  const result = {
    schemaVersion: CHART_SCHEMA_VERSION,
    kind: "local",
    providerId: "local-import",
    symbol,
    name: input.name === void 0 ? symbol : text(input.name, "name"),
    currency,
    exchangeTimezone,
    interval: "1d",
    adjustment,
    adjustmentRevision,
    adjustmentMethod,
    datasetRevision,
    pricePrecision,
    volumeUnit: "shares",
    volumeAdjustment,
    volumeAdjustmentMethod,
    amountAdjustment,
    amountAdjustmentMethod,
    amountCurrency: currency,
    source,
    historyAnchor: bars[0].sessionDate,
    hasNonPositivePrices,
    logScaleAllowed: !hasNonPositivePrices,
    bars
  };
  result.id = `local:${fingerprint(result)}`;
  return freeze(result);
}
function parseChartImport(jsonText) {
  if (typeof jsonText !== "string") fail("JSON", "file", "expected JSON text");
  if (jsonText.length > MAX_IMPORT_BYTES || new TextEncoder().encode(jsonText).byteLength > MAX_IMPORT_BYTES) fail("FILE_SIZE", "file", "JSON import is limited to 2 MiB");
  let input;
  try {
    input = JSON.parse(jsonText);
  } catch {
    fail("JSON", "file", "invalid JSON");
  }
  return validateChartDataset(input);
}
function createImportExample() {
  return JSON.stringify({
    schemaVersion: 1,
    symbol: "EXAMPLE:LOCAL",
    name: "Local import example (synthetic)",
    currency: "USD",
    exchangeTimezone: "America/New_York",
    interval: "1d",
    adjustment: "none",
    adjustmentRevision: "none",
    datasetRevision: "example-v1",
    pricePrecision: 2,
    volumeUnit: "shares",
    volumeAdjustment: "unadjusted",
    amountAdjustment: "not-provided",
    source: { label: "Synthetic import template", provenance: "Invented examples only. Replace with daily OHLCV you are authorized to use, declare its source and adjustment methods; dates are exchange session dates." },
    bars: [
      { sessionDate: "2026-01-05", open: 10, high: 12, low: 9, close: 11, volume: 1e3, isFinal: true },
      { sessionDate: "2026-01-06", open: 11, high: 13, low: 10, close: 12, volume: null, isFinal: true },
      { sessionDate: "2026-01-07", open: 12, high: 13, low: 11, close: 11.5, volume: 0, isFinal: true }
    ]
  }, null, 2);
}
function createDemoDataset({ count: count2 = 260 } = {}) {
  if (!Number.isInteger(count2) || count2 < 1 || count2 > MAX_BARS) fail("BAR_LIMIT", "count", `expected 1 to ${MAX_BARS}`);
  let seed = 1424139035;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const round = (value) => Math.round(value * 100) / 100;
  let price2 = 80;
  const date = /* @__PURE__ */ new Date("2024-01-02T00:00:00Z");
  const bars = [];
  while (bars.length < count2) {
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      const i = bars.length;
      const open = round(price2 + (random() - 0.5) * 1.6);
      const close = round(Math.max(5, open + Math.sin(i / 9) * 0.8 + (random() - 0.48) * 2));
      const high = round(Math.max(open, close) + 0.2 + random() * 1.5);
      const low = round(Math.min(open, close) - 0.2 - random() * 1.5);
      const sessionDate = date.toISOString().slice(0, 10);
      const volume = Math.round(5e5 + random() * 15e5);
      bars.push({ sessionDate, open, high, low, close, volume, amount: null, isFinal: true, updatedAt: null, revision: "synthetic-v1" });
      price2 = close;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return freeze({
    schemaVersion: 1,
    kind: "demo",
    id: `demo:synthetic-v1:${count2}`,
    providerId: DEMO_PROVIDER_ID,
    symbol: DEMO_SYMBOL,
    name: "Synthetic DEMO",
    currency: "USD",
    exchangeTimezone: "UTC",
    interval: "1d",
    adjustment: "none",
    adjustmentRevision: "synthetic-unadjusted-v1",
    adjustmentMethod: "none",
    datasetRevision: "synthetic-v1",
    pricePrecision: 2,
    volumeUnit: "shares",
    volumeAdjustment: "unadjusted",
    volumeAdjustmentMethod: "none",
    amountAdjustment: "not-provided",
    amountAdjustmentMethod: "none",
    amountCurrency: "USD",
    source: { kind: "synthetic-demo", label: "DEMO \xB7 synthetic data", provenance: "Deterministic invented OHLCV, not a security, historical market feed or trading calendar. For chart interaction only.", verified: false },
    historyAnchor: bars[0].sessionDate,
    hasNonPositivePrices: false,
    logScaleAllowed: true,
    bars
  });
}

// src/history-dataset.ts
function historyDatasetId(history) {
  const first = history.bars[0]?.sessionDate ?? "";
  const last = history.bars.at(-1)?.sessionDate ?? "";
  return `market:${history.symbol}:${history.adjustment}:${first}:${last}:${history.bars.length}`;
}
function toChartDataset(history) {
  if (!history || !Array.isArray(history.bars) || !history.bars.length) throw new Error("history dataset is empty");
  const revision = `${history.symbol}:${history.adjustment}:${history.lastSessionDate}`;
  return {
    schemaVersion: 1,
    kind: "market",
    providerId: "market-feed",
    id: historyDatasetId(history),
    symbol: history.symbol,
    name: history.name,
    currency: history.currency,
    exchangeTimezone: history.exchangeTimezone,
    interval: "1d",
    adjustment: history.adjustment,
    adjustmentRevision: history.adjustmentLabel,
    adjustmentMethod: history.adjustmentLabel,
    datasetRevision: revision,
    pricePrecision: history.pricePrecision,
    volumeUnit: "shares",
    volumeAdjustment: "unadjusted",
    // A lot count converted to shares is not a split-adjusted series, but the
    // conversion is still a declared normalization the reader must see.
    volumeAdjustmentMethod: history.volumeBasis === "lots" ? "Source volume in lots converted to shares (\xD7100); no split adjustment applied" : history.volumeBasis === "unknown" ? "Source volume unit could not be established from turnover, so volume is omitted" : history.volumeBasis === "reported" ? "Index volume is the source aggregate and is not a share count" : "Source volume reported in shares; no adjustment applied",
    amountAdjustment: history.bars.some((bar) => bar.amount !== null) ? "unadjusted" : "not-provided",
    amountAdjustmentMethod: "none",
    amountCurrency: history.currency,
    source: {
      kind: "market-feed",
      label: `${history.source} \xB7 ${history.adjustmentLabel}`,
      provenance: "Daily OHLCV projected by the plugin Host from the opt-in local free source. Not an exchange-licensed feed; no SLA and no redistribution right.",
      verified: false
    },
    historyAnchor: history.bars[0].sessionDate,
    hasNonPositivePrices: false,
    logScaleAllowed: true,
    fetchedAt: history.fetchedAt,
    volumeBasis: history.volumeBasis,
    bars: history.bars.map((bar) => ({
      sessionDate: bar.sessionDate,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      amount: bar.amount,
      isFinal: bar.isFinal,
      updatedAt: null,
      revision
    }))
  };
}

// src/client/chart/StockChart.tsx
var import_react = __toESM(require("react"), 1);

// src/indicators.ts
var INDICATOR_ALGORITHM_VERSION = "dsh-independent-sma-ema-v1";
var MAX_INDICATOR_PERIOD = 500;
var DEFAULT_MA_PERIODS = Object.freeze([5, 10, 20]);
var DEFAULT_MACD = Object.freeze({ fast: 12, slow: 26, signal: 9, histScale: 2 });
var DEFAULT_KDJ = Object.freeze({ n: 9, k: 3, d: 3 });
function period(value, label = "period") {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_INDICATOR_PERIOD) throw new RangeError(`${label} must be an integer from 1 to ${MAX_INDICATOR_PERIOD}`);
  return value;
}
function valuesInput(values) {
  if (!Array.isArray(values)) throw new TypeError("Indicator input must be an array");
  for (const value of values) if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) throw new TypeError("Indicator values must be finite numbers or explicit null");
}
function number(value) {
  if (!Number.isFinite(value)) throw new RangeError("Indicator arithmetic exceeded the finite number range");
  return Object.is(value, -0) ? 0 : value;
}
function mean(values) {
  let sum = 0;
  let correction = 0;
  for (const value of values) {
    const adjusted = value - correction;
    const next = sum + adjusted;
    correction = next - sum - adjusted;
    sum = next;
  }
  if (Number.isFinite(sum)) return number(sum / values.length);
  let result = 0;
  for (const value of values) result += value / values.length;
  return number(result);
}
function validateMacdParams(raw = {}) {
  const input = raw;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("MACD parameters must be an object");
  for (const key of Object.keys(input)) if (!["fast", "slow", "signal", "histScale"].includes(key)) throw new TypeError("Unknown MACD parameter");
  const result = { ...DEFAULT_MACD, ...input };
  period(result.fast, "fast");
  period(result.slow, "slow");
  period(result.signal, "signal");
  if (result.fast >= result.slow) throw new RangeError("MACD fast must be smaller than slow");
  if (![1, 2].includes(result.histScale)) throw new RangeError("MACD histScale must be 1 or 2");
  return result;
}
function validateKdjParams(raw = {}) {
  const input = raw;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("KDJ parameters must be an object");
  for (const key of Object.keys(input)) if (!["n", "k", "d"].includes(key)) throw new TypeError("Unknown KDJ parameter");
  const result = { ...DEFAULT_KDJ, ...input };
  period(result.n, "n");
  period(result.k, "k");
  period(result.d, "d");
  return result;
}
function kdj(bars, input = {}) {
  if (!Array.isArray(bars)) throw new TypeError("KDJ input must be an array");
  const params = validateKdjParams(input);
  const rsv = [];
  const k2 = [];
  const d2 = [];
  const j2 = [];
  const window2 = [];
  let previousK = null;
  let previousD = null;
  const kWeight = 1 / params.k;
  const dWeight = 1 / params.d;
  for (const bar of bars) {
    const high = bar?.high, low = bar?.low, close = bar?.close;
    const usable = typeof high === "number" && typeof low === "number" && typeof close === "number" && Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(close) && high >= low;
    if (!usable) {
      window2.length = 0;
      previousK = null;
      previousD = null;
      rsv.push(null);
      k2.push(null);
      d2.push(null);
      j2.push(null);
      continue;
    }
    window2.push({ high, low });
    if (window2.length > params.n) window2.shift();
    if (window2.length < params.n) {
      rsv.push(null);
      k2.push(null);
      d2.push(null);
      j2.push(null);
      continue;
    }
    const highest = Math.max(...window2.map((item) => item.high));
    const lowest = Math.min(...window2.map((item) => item.low));
    const current = highest === lowest ? 50 : number((close - lowest) / (highest - lowest) * 100);
    const nextK = number((1 - kWeight) * (previousK ?? 50) + kWeight * current);
    const nextD = number((1 - dWeight) * (previousD ?? 50) + dWeight * nextK);
    previousK = nextK;
    previousD = nextD;
    rsv.push(current);
    k2.push(nextK);
    d2.push(nextD);
    j2.push(number(3 * nextK - 2 * nextD));
  }
  return { params, rsv, k: k2, d: d2, j: j2 };
}
function validateIndicatorConfig(raw = {}) {
  const input = raw;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Indicator configuration must be an object");
  for (const key of Object.keys(input)) if (!["maPeriods", "macd", "kdj", "historyAnchor"].includes(key)) throw new TypeError("Unknown indicator configuration");
  const maPeriods = input.maPeriods === void 0 ? [...DEFAULT_MA_PERIODS] : input.maPeriods;
  if (!Array.isArray(maPeriods) || maPeriods.length > 8) throw new RangeError("MA requires an array of at most 8 periods");
  for (const value of maPeriods) period(value, "MA period");
  if (new Set(maPeriods).size !== maPeriods.length) throw new RangeError("MA periods must be unique");
  if (input.historyAnchor !== void 0 && input.historyAnchor !== null && !isSessionDate(input.historyAnchor)) throw new TypeError("historyAnchor must be a session date");
  return { maPeriods: [...maPeriods], macd: validateMacdParams(input.macd), kdj: validateKdjParams(input.kdj), historyAnchor: input.historyAnchor ?? null };
}
function sma(values, size2) {
  valuesInput(values);
  const windowSize = period(size2);
  const output = [];
  const window2 = [];
  for (const value of values) {
    if (value === null) {
      window2.length = 0;
      output.push(null);
      continue;
    }
    window2.push(value);
    if (window2.length > windowSize) window2.shift();
    output.push(window2.length === windowSize ? mean(window2) : null);
  }
  return output;
}
function ema(values, size2) {
  valuesInput(values);
  const windowSize = period(size2);
  const output = [];
  const seed = [];
  const alpha = 2 / (windowSize + 1);
  let previous = null;
  for (const value of values) {
    if (value === null) {
      seed.length = 0;
      previous = null;
      output.push(null);
      continue;
    }
    if (previous === null) {
      seed.push(value);
      if (seed.length === windowSize) previous = mean(seed);
    } else {
      previous = value === previous ? previous : number(alpha * value + (1 - alpha) * previous);
    }
    output.push(previous);
  }
  return output;
}
function macd(values, input = {}) {
  valuesInput(values);
  const params = validateMacdParams(input);
  const fastEma = ema(values, params.fast);
  const slowEma = ema(values, params.slow);
  const dif = values.map((_2, index) => fastEma[index] === null || slowEma[index] === null ? null : number(fastEma[index] - slowEma[index]));
  const dea = ema(dif, params.signal);
  const histRaw = dif.map((value, index) => value === null || dea[index] === null ? null : number(value - dea[index]));
  const hist = histRaw.map((value) => value === null ? null : number(value * params.histScale));
  return { params, fastEma, slowEma, dif, dea, histRaw, hist };
}
function barInput(bars) {
  if (!Array.isArray(bars) || bars.length > MAX_BARS) throw new RangeError(`Indicator bars must be an array of at most ${MAX_BARS}`);
  let previousDate = "";
  for (const bar of bars) {
    if (!bar || !isSessionDate(bar.sessionDate) || bar.sessionDate <= previousDate) throw new TypeError("Indicator bars require unique increasing session dates");
    if (bar.close !== null && (typeof bar.close !== "number" || !Number.isFinite(bar.close))) throw new TypeError("Bar close must be finite or explicit null");
    previousDate = bar.sessionDate;
  }
}
function computeIndicators(bars, input = {}) {
  barInput(bars);
  const config = validateIndicatorConfig(input);
  const historyAnchor = bars[0]?.sessionDate ?? null;
  if (config.historyAnchor !== null && config.historyAnchor !== historyAnchor) throw new RangeError("historyAnchor must match the first supplied history bar");
  const values = bars.map((bar) => bar.close);
  const times = bars.map((bar) => bar.sessionDate);
  const ma = Object.fromEntries(config.maPeriods.map((size2) => [size2, sma(values, size2)]));
  const macdResult = macd(values, config.macd);
  const kdjResult = kdj(bars.map((bar) => ({ high: bar.high ?? null, low: bar.low ?? null, close: bar.close })), config.kdj);
  const rows = times.map((sessionDate, index) => ({
    sessionDate,
    ma: Object.fromEntries(config.maPeriods.map((size2) => [size2, ma[size2][index]])),
    dif: macdResult.dif[index],
    dea: macdResult.dea[index],
    histRaw: macdResult.histRaw[index],
    hist: macdResult.hist[index],
    k: kdjResult.k[index] ?? null,
    d: kdjResult.d[index] ?? null,
    j: kdjResult.j[index] ?? null
  }));
  const macdBars = config.macd.slow + config.macd.signal - 1;
  return {
    spec: {
      algorithmVersion: INDICATOR_ALGORITHM_VERSION,
      seedPolicy: "independent-sma",
      missingPolicy: "reset-and-reseed-on-null",
      input: "close",
      historyAnchor,
      maPeriods: config.maPeriods,
      macd: config.macd,
      kdj: config.kdj,
      kdjSeed: "previous-or-50"
    },
    times,
    ma,
    macd: macdResult,
    kdj: kdjResult,
    rows,
    warmup: { macdBars, kdjBars: config.kdj.n, availableBars: bars.length, complete: macdResult.hist.at(-1) != null }
  };
}

// src/client/format.ts
function formatLocale(locale) {
  const tag = locale === "zh" ? "zh-CN" : locale;
  try {
    return Intl.NumberFormat.supportedLocalesOf([tag])[0] ?? "en";
  } catch {
    return "en";
  }
}
var quoteDigits = (precision) => Number.isInteger(precision) && precision >= 0 && precision <= 6 ? precision : 2;
function createFormatters(getLocale) {
  const number2 = (value, options) => new Intl.NumberFormat(formatLocale(getLocale()), options).format(value);
  return {
    count: (value) => number2(value, { maximumFractionDigits: 0 }),
    compact: (value) => Number.isFinite(value) ? new Intl.NumberFormat(formatLocale(getLocale()), { notation: "compact", compactDisplay: "short", maximumFractionDigits: 2 }).format(value) : "\u2014",
    price: (value) => Number.isFinite(value) ? number2(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "\u2014",
    /** Formats at the source's quoted width; never rounds to a narrower one. */
    priceAt: (value, precision) => {
      if (!Number.isFinite(value)) return "\u2014";
      const digits = quoteDigits(precision);
      return number2(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    },
    change: (value) => Number.isFinite(value) ? number2(value / 100, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }) : "\u2014",
    percent: (value) => Number.isFinite(value) ? number2(value / 100, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "\u2014",
    signed: (value) => Number.isFinite(value) ? number2(value, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }) : "\u2014",
    signedAt: (value, precision) => {
      if (!Number.isFinite(value)) return "\u2014";
      const digits = quoteDigits(precision);
      return number2(value, { minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: "exceptZero" });
    },
    time(value, t) {
      const date = value ? new Date(value) : null;
      if (!date || !Number.isFinite(date.getTime())) return t("time.missing");
      return t("time.shanghai", { time: new Intl.DateTimeFormat(formatLocale(getLocale()), { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date) });
    },
    /**
     * A quote from another exchange is only meaningful in that exchange's own
     * local time. The zone comes from the reviewed instrument catalogue, never
     * from the browser locale, so a US index is not shown in Beijing time.
     */
    zoneTime(value, timeZone, t) {
      const date = value ? new Date(value) : null;
      if (!date || !Number.isFinite(date.getTime())) return t("time.missing");
      try {
        return new Intl.DateTimeFormat(formatLocale(getLocale()), {
          timeZone: typeof timeZone === "string" && timeZone ? timeZone : "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
          timeZoneName: "short"
        }).format(date);
      } catch {
        return t("time.missing");
      }
    }
  };
}

// ../../node_modules/.pnpm/lightweight-charts@5.2.1/node_modules/lightweight-charts/dist/lightweight-charts.production.mjs
var lightweight_charts_production_exports = {};
__export(lightweight_charts_production_exports, {
  AreaSeries: () => qe,
  BarSeries: () => Ze,
  BaselineSeries: () => Ue,
  CandlestickSeries: () => Qe,
  ColorType: () => $i,
  CrosshairMode: () => K,
  HistogramSeries: () => nr,
  LastPriceAnimationMode: () => Hi,
  LineSeries: () => ye,
  LineStyle: () => h,
  LineType: () => r,
  MismatchDirection: () => It,
  PriceLineSource: () => Ui,
  PriceScaleMode: () => bi,
  TickMarkType: () => ji,
  TrackingModeExitMode: () => Wi,
  createChart: () => le,
  createChartEx: () => ae,
  createImageWatermark: () => gr,
  createOptionsChart: () => Ee,
  createSeriesMarkers: () => Nr,
  createTextWatermark: () => dr,
  createUpDownMarkers: () => Kr,
  createYieldCurveChart: () => Ie,
  customSeriesDefaultOptions: () => Gr,
  defaultHorzScaleBehavior: () => oe,
  isBusinessDay: () => Ki,
  isUTCTimestamp: () => Gi,
  version: () => Zr
});

// ../../node_modules/.pnpm/fancy-canvas@2.1.0/node_modules/fancy-canvas/size.mjs
function size(_a) {
  var width = _a.width, height = _a.height;
  if (width < 0) {
    throw new Error("Negative width is not allowed for Size");
  }
  if (height < 0) {
    throw new Error("Negative height is not allowed for Size");
  }
  return {
    width,
    height
  };
}
function equalSizes(first, second) {
  return first.width === second.width && first.height === second.height;
}

// ../../node_modules/.pnpm/fancy-canvas@2.1.0/node_modules/fancy-canvas/device-pixel-ratio.mjs
var Observable = (
  /** @class */
  (function() {
    function Observable2(win) {
      var _this = this;
      this._resolutionListener = function() {
        return _this._onResolutionChanged();
      };
      this._resolutionMediaQueryList = null;
      this._observers = [];
      this._window = win;
      this._installResolutionListener();
    }
    Observable2.prototype.dispose = function() {
      this._uninstallResolutionListener();
      this._window = null;
    };
    Object.defineProperty(Observable2.prototype, "value", {
      get: function() {
        return this._window.devicePixelRatio;
      },
      enumerable: false,
      configurable: true
    });
    Observable2.prototype.subscribe = function(next) {
      var _this = this;
      var observer = { next };
      this._observers.push(observer);
      return {
        unsubscribe: function() {
          _this._observers = _this._observers.filter(function(o2) {
            return o2 !== observer;
          });
        }
      };
    };
    Observable2.prototype._installResolutionListener = function() {
      if (this._resolutionMediaQueryList !== null) {
        throw new Error("Resolution listener is already installed");
      }
      var dppx = this._window.devicePixelRatio;
      this._resolutionMediaQueryList = this._window.matchMedia("all and (resolution: ".concat(dppx, "dppx)"));
      this._resolutionMediaQueryList.addListener(this._resolutionListener);
    };
    Observable2.prototype._uninstallResolutionListener = function() {
      if (this._resolutionMediaQueryList !== null) {
        this._resolutionMediaQueryList.removeListener(this._resolutionListener);
        this._resolutionMediaQueryList = null;
      }
    };
    Observable2.prototype._reinstallResolutionListener = function() {
      this._uninstallResolutionListener();
      this._installResolutionListener();
    };
    Observable2.prototype._onResolutionChanged = function() {
      var _this = this;
      this._observers.forEach(function(observer) {
        return observer.next(_this._window.devicePixelRatio);
      });
      this._reinstallResolutionListener();
    };
    return Observable2;
  })()
);
function createObservable(win) {
  return new Observable(win);
}

// ../../node_modules/.pnpm/fancy-canvas@2.1.0/node_modules/fancy-canvas/canvas-element-bitmap-size.mjs
var DevicePixelContentBoxBinding = (
  /** @class */
  (function() {
    function DevicePixelContentBoxBinding2(canvasElement, transformBitmapSize, options) {
      var _a;
      this._canvasElement = null;
      this._bitmapSizeChangedListeners = [];
      this._suggestedBitmapSize = null;
      this._suggestedBitmapSizeChangedListeners = [];
      this._devicePixelRatioObservable = null;
      this._canvasElementResizeObserver = null;
      this._canvasElement = canvasElement;
      this._canvasElementClientSize = size({
        width: this._canvasElement.clientWidth,
        height: this._canvasElement.clientHeight
      });
      this._transformBitmapSize = transformBitmapSize !== null && transformBitmapSize !== void 0 ? transformBitmapSize : (function(size2) {
        return size2;
      });
      this._allowResizeObserver = (_a = options === null || options === void 0 ? void 0 : options.allowResizeObserver) !== null && _a !== void 0 ? _a : true;
      this._chooseAndInitObserver();
    }
    DevicePixelContentBoxBinding2.prototype.dispose = function() {
      var _a, _b;
      if (this._canvasElement === null) {
        throw new Error("Object is disposed");
      }
      (_a = this._canvasElementResizeObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
      this._canvasElementResizeObserver = null;
      (_b = this._devicePixelRatioObservable) === null || _b === void 0 ? void 0 : _b.dispose();
      this._devicePixelRatioObservable = null;
      this._suggestedBitmapSizeChangedListeners.length = 0;
      this._bitmapSizeChangedListeners.length = 0;
      this._canvasElement = null;
    };
    Object.defineProperty(DevicePixelContentBoxBinding2.prototype, "canvasElement", {
      get: function() {
        if (this._canvasElement === null) {
          throw new Error("Object is disposed");
        }
        return this._canvasElement;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(DevicePixelContentBoxBinding2.prototype, "canvasElementClientSize", {
      get: function() {
        return this._canvasElementClientSize;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(DevicePixelContentBoxBinding2.prototype, "bitmapSize", {
      get: function() {
        return size({
          width: this.canvasElement.width,
          height: this.canvasElement.height
        });
      },
      enumerable: false,
      configurable: true
    });
    DevicePixelContentBoxBinding2.prototype.resizeCanvasElement = function(clientSize) {
      this._canvasElementClientSize = size(clientSize);
      this.canvasElement.style.width = "".concat(this._canvasElementClientSize.width, "px");
      this.canvasElement.style.height = "".concat(this._canvasElementClientSize.height, "px");
      this._invalidateBitmapSize();
    };
    DevicePixelContentBoxBinding2.prototype.subscribeBitmapSizeChanged = function(listener) {
      this._bitmapSizeChangedListeners.push(listener);
    };
    DevicePixelContentBoxBinding2.prototype.unsubscribeBitmapSizeChanged = function(listener) {
      this._bitmapSizeChangedListeners = this._bitmapSizeChangedListeners.filter(function(l2) {
        return l2 !== listener;
      });
    };
    Object.defineProperty(DevicePixelContentBoxBinding2.prototype, "suggestedBitmapSize", {
      get: function() {
        return this._suggestedBitmapSize;
      },
      enumerable: false,
      configurable: true
    });
    DevicePixelContentBoxBinding2.prototype.subscribeSuggestedBitmapSizeChanged = function(listener) {
      this._suggestedBitmapSizeChangedListeners.push(listener);
    };
    DevicePixelContentBoxBinding2.prototype.unsubscribeSuggestedBitmapSizeChanged = function(listener) {
      this._suggestedBitmapSizeChangedListeners = this._suggestedBitmapSizeChangedListeners.filter(function(l2) {
        return l2 !== listener;
      });
    };
    DevicePixelContentBoxBinding2.prototype.applySuggestedBitmapSize = function() {
      if (this._suggestedBitmapSize === null) {
        return;
      }
      var oldSuggestedSize = this._suggestedBitmapSize;
      this._suggestedBitmapSize = null;
      this._resizeBitmap(oldSuggestedSize);
      this._emitSuggestedBitmapSizeChanged(oldSuggestedSize, this._suggestedBitmapSize);
    };
    DevicePixelContentBoxBinding2.prototype._resizeBitmap = function(newSize) {
      var oldSize = this.bitmapSize;
      if (equalSizes(oldSize, newSize)) {
        return;
      }
      this.canvasElement.width = newSize.width;
      this.canvasElement.height = newSize.height;
      this._emitBitmapSizeChanged(oldSize, newSize);
    };
    DevicePixelContentBoxBinding2.prototype._emitBitmapSizeChanged = function(oldSize, newSize) {
      var _this = this;
      this._bitmapSizeChangedListeners.forEach(function(listener) {
        return listener.call(_this, oldSize, newSize);
      });
    };
    DevicePixelContentBoxBinding2.prototype._suggestNewBitmapSize = function(newSize) {
      var oldSuggestedSize = this._suggestedBitmapSize;
      var finalNewSize = size(this._transformBitmapSize(newSize, this._canvasElementClientSize));
      var newSuggestedSize = equalSizes(this.bitmapSize, finalNewSize) ? null : finalNewSize;
      if (oldSuggestedSize === null && newSuggestedSize === null) {
        return;
      }
      if (oldSuggestedSize !== null && newSuggestedSize !== null && equalSizes(oldSuggestedSize, newSuggestedSize)) {
        return;
      }
      this._suggestedBitmapSize = newSuggestedSize;
      this._emitSuggestedBitmapSizeChanged(oldSuggestedSize, newSuggestedSize);
    };
    DevicePixelContentBoxBinding2.prototype._emitSuggestedBitmapSizeChanged = function(oldSize, newSize) {
      var _this = this;
      this._suggestedBitmapSizeChangedListeners.forEach(function(listener) {
        return listener.call(_this, oldSize, newSize);
      });
    };
    DevicePixelContentBoxBinding2.prototype._chooseAndInitObserver = function() {
      var _this = this;
      if (!this._allowResizeObserver) {
        this._initDevicePixelRatioObservable();
        return;
      }
      isDevicePixelContentBoxSupported().then(function(isSupported) {
        return isSupported ? _this._initResizeObserver() : _this._initDevicePixelRatioObservable();
      });
    };
    DevicePixelContentBoxBinding2.prototype._initDevicePixelRatioObservable = function() {
      var _this = this;
      if (this._canvasElement === null) {
        return;
      }
      var win = canvasElementWindow(this._canvasElement);
      if (win === null) {
        throw new Error("No window is associated with the canvas");
      }
      this._devicePixelRatioObservable = createObservable(win);
      this._devicePixelRatioObservable.subscribe(function() {
        return _this._invalidateBitmapSize();
      });
      this._invalidateBitmapSize();
    };
    DevicePixelContentBoxBinding2.prototype._invalidateBitmapSize = function() {
      var _a, _b;
      if (this._canvasElement === null) {
        return;
      }
      var win = canvasElementWindow(this._canvasElement);
      if (win === null) {
        return;
      }
      var ratio = (_b = (_a = this._devicePixelRatioObservable) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : win.devicePixelRatio;
      var canvasRects = this._canvasElement.getClientRects();
      var newSize = (
        // eslint-disable-next-line no-negated-condition
        canvasRects[0] !== void 0 ? predictedBitmapSize(canvasRects[0], ratio) : size({
          width: this._canvasElementClientSize.width * ratio,
          height: this._canvasElementClientSize.height * ratio
        })
      );
      this._suggestNewBitmapSize(newSize);
    };
    DevicePixelContentBoxBinding2.prototype._initResizeObserver = function() {
      var _this = this;
      if (this._canvasElement === null) {
        return;
      }
      this._canvasElementResizeObserver = new ResizeObserver(function(entries) {
        var entry = entries.find(function(entry2) {
          return entry2.target === _this._canvasElement;
        });
        if (!entry || !entry.devicePixelContentBoxSize || !entry.devicePixelContentBoxSize[0]) {
          return;
        }
        var entrySize = entry.devicePixelContentBoxSize[0];
        var newSize = size({
          width: entrySize.inlineSize,
          height: entrySize.blockSize
        });
        _this._suggestNewBitmapSize(newSize);
      });
      this._canvasElementResizeObserver.observe(this._canvasElement, { box: "device-pixel-content-box" });
    };
    return DevicePixelContentBoxBinding2;
  })()
);
function bindTo(canvasElement, target) {
  if (target.type === "device-pixel-content-box") {
    return new DevicePixelContentBoxBinding(canvasElement, target.transform, target.options);
  }
  throw new Error("Unsupported binding target");
}
function canvasElementWindow(canvasElement) {
  return canvasElement.ownerDocument.defaultView;
}
function isDevicePixelContentBoxSupported() {
  return new Promise(function(resolve) {
    var ro = new ResizeObserver(function(entries) {
      resolve(entries.every(function(entry) {
        return "devicePixelContentBoxSize" in entry;
      }));
      ro.disconnect();
    });
    ro.observe(document.body, { box: "device-pixel-content-box" });
  }).catch(function() {
    return false;
  });
}
function predictedBitmapSize(canvasRect, ratio) {
  return size({
    width: Math.round(canvasRect.left * ratio + canvasRect.width * ratio) - Math.round(canvasRect.left * ratio),
    height: Math.round(canvasRect.top * ratio + canvasRect.height * ratio) - Math.round(canvasRect.top * ratio)
  });
}

// ../../node_modules/.pnpm/fancy-canvas@2.1.0/node_modules/fancy-canvas/canvas-rendering-target.mjs
var CanvasRenderingTarget2D = (
  /** @class */
  (function() {
    function CanvasRenderingTarget2D2(context, mediaSize, bitmapSize) {
      if (mediaSize.width === 0 || mediaSize.height === 0) {
        throw new TypeError("Rendering target could only be created on a media with positive width and height");
      }
      this._mediaSize = mediaSize;
      if (bitmapSize.width === 0 || bitmapSize.height === 0) {
        throw new TypeError("Rendering target could only be created using a bitmap with positive integer width and height");
      }
      this._bitmapSize = bitmapSize;
      this._context = context;
    }
    CanvasRenderingTarget2D2.prototype.useMediaCoordinateSpace = function(f2) {
      try {
        this._context.save();
        this._context.setTransform(1, 0, 0, 1, 0, 0);
        this._context.scale(this._horizontalPixelRatio, this._verticalPixelRatio);
        return f2({
          context: this._context,
          mediaSize: this._mediaSize
        });
      } finally {
        this._context.restore();
      }
    };
    CanvasRenderingTarget2D2.prototype.useBitmapCoordinateSpace = function(f2) {
      try {
        this._context.save();
        this._context.setTransform(1, 0, 0, 1, 0, 0);
        return f2({
          context: this._context,
          mediaSize: this._mediaSize,
          bitmapSize: this._bitmapSize,
          horizontalPixelRatio: this._horizontalPixelRatio,
          verticalPixelRatio: this._verticalPixelRatio
        });
      } finally {
        this._context.restore();
      }
    };
    Object.defineProperty(CanvasRenderingTarget2D2.prototype, "_horizontalPixelRatio", {
      get: function() {
        return this._bitmapSize.width / this._mediaSize.width;
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(CanvasRenderingTarget2D2.prototype, "_verticalPixelRatio", {
      get: function() {
        return this._bitmapSize.height / this._mediaSize.height;
      },
      enumerable: false,
      configurable: true
    });
    return CanvasRenderingTarget2D2;
  })()
);
function tryCreateCanvasRenderingTarget2D(binding, contextOptions) {
  var mediaSize = binding.canvasElementClientSize;
  if (mediaSize.width === 0 || mediaSize.height === 0) {
    return null;
  }
  var bitmapSize = binding.bitmapSize;
  if (bitmapSize.width === 0 || bitmapSize.height === 0) {
    return null;
  }
  var context = binding.canvasElement.getContext("2d", contextOptions);
  if (context === null) {
    return null;
  }
  return new CanvasRenderingTarget2D(context, mediaSize, bitmapSize);
}

// ../../node_modules/.pnpm/lightweight-charts@5.2.1/node_modules/lightweight-charts/dist/lightweight-charts.production.mjs
/*!
 * @license
 * TradingView Lightweight Charts™ v5.2.1
 * Copyright (c) 2026 TradingView, Inc.
 * Licensed under Apache License 2.0 https://www.apache.org/licenses/LICENSE-2.0
 */
var e = { title: "", visible: true, hitTestTolerance: 3, lastValueVisible: true, priceLineVisible: true, priceLineSource: 0, priceLineWidth: 1, priceLineColor: "", priceLineStyle: 2, baseLineVisible: true, baseLineWidth: 1, baseLineColor: "#B2B5BE", baseLineStyle: 0, priceFormat: { type: "price", precision: 2, minMove: 0.01 } };
var r;
var h;
function a(t, i) {
  const n = (function(t2, i2) {
    switch (t2) {
      case 0:
      default:
        return [];
      case 1:
        return [i2, i2];
      case 2:
        return [2 * i2, 2 * i2];
      case 3:
        return [6 * i2, 6 * i2];
      case 4:
        return [i2, 4 * i2];
    }
  })(i, t.lineWidth);
  return t.setLineDash(n), n;
}
function l(t, i, n, s) {
  t.beginPath();
  const e2 = t.lineWidth % 2 ? 0.5 : 0;
  t.moveTo(n, i + e2), t.lineTo(s, i + e2), t.stroke();
}
function o(t, i) {
  if (!t) throw new Error("Assertion failed" + (i ? ": " + i : ""));
}
function _(t) {
  if (void 0 === t) throw new Error("Value is undefined");
  return t;
}
function u(t) {
  if (null === t) throw new Error("Value is null");
  return t;
}
function c(t) {
  return u(_(t));
}
!(function(t) {
  t[t.Simple = 0] = "Simple", t[t.WithSteps = 1] = "WithSteps", t[t.Curved = 2] = "Curved";
})(r || (r = {})), (function(t) {
  t[t.Solid = 0] = "Solid", t[t.Dotted = 1] = "Dotted", t[t.Dashed = 2] = "Dashed", t[t.LargeDashed = 3] = "LargeDashed", t[t.SparseDotted = 4] = "SparseDotted";
})(h || (h = {}));
var d = class {
  constructor() {
    this.t = [];
  }
  i(t, i, n) {
    const s = { h: t, l: i, o: true === n };
    this.t.push(s);
  }
  _(t) {
    const i = this.t.findIndex(((i2) => t === i2.h));
    i > -1 && this.t.splice(i, 1);
  }
  u(t) {
    this.t = this.t.filter(((i) => i.l !== t));
  }
  p(t, i, n) {
    const s = [...this.t];
    this.t = this.t.filter(((t2) => !t2.o)), s.forEach(((s2) => s2.h(t, i, n)));
  }
  v() {
    return this.t.length > 0;
  }
  m() {
    this.t = [];
  }
};
function f(t, ...i) {
  for (const n of i) for (const i2 in n) void 0 !== n[i2] && Object.prototype.hasOwnProperty.call(n, i2) && !["__proto__", "constructor", "prototype"].includes(i2) && ("object" != typeof n[i2] || void 0 === t[i2] || Array.isArray(n[i2]) ? t[i2] = n[i2] : f(t[i2], n[i2]));
  return t;
}
function p(t) {
  return "number" == typeof t && isFinite(t);
}
function v(t) {
  return "number" == typeof t && t % 1 == 0;
}
function m(t) {
  return "string" == typeof t;
}
function w(t) {
  return "boolean" == typeof t;
}
function M(t) {
  const i = t;
  if (!i || "object" != typeof i) return i;
  let n, s, e2;
  for (s in n = Array.isArray(i) ? [] : {}, i) i.hasOwnProperty(s) && (e2 = i[s], n[s] = e2 && "object" == typeof e2 ? M(e2) : e2);
  return n;
}
function g(t) {
  return null !== t;
}
function b(t) {
  return null === t ? void 0 : t;
}
var S = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
function x(t, i, n) {
  return void 0 === i && (i = S), `${n = void 0 !== n ? `${n} ` : ""}${t}px ${i}`;
}
var C = class {
  constructor(t) {
    this.M = { S: 1, C: 5, P: NaN, k: "", T: "", R: "", D: "", I: 0, V: 0, B: 0, A: 0, L: 0 }, this.O = t;
  }
  N() {
    const t = this.M, i = this.F(), n = this.W();
    return t.P === i && t.T === n || (t.P = i, t.T = n, t.k = x(i, n), t.A = 2.5 / 12 * i, t.I = t.A, t.V = i / 12 * t.C, t.B = i / 12 * t.C, t.L = 0), t.R = this.H(), t.D = this.U(), this.M;
  }
  H() {
    return this.O.N().layout.textColor;
  }
  U() {
    return this.O.$();
  }
  F() {
    return this.O.N().layout.fontSize;
  }
  W() {
    return this.O.N().layout.fontFamily;
  }
};
function y(t) {
  return t < 0 ? 0 : t > 255 ? 255 : Math.round(t) || 0;
}
function P(t) {
  return 0.199 * t[0] + 0.687 * t[1] + 0.114 * t[2];
}
var k = class {
  constructor(t, i) {
    this.j = /* @__PURE__ */ new Map(), this.q = t, i && (this.j = i);
  }
  Y(t, i) {
    if ("transparent" === t) return t;
    const n = this.K(t), s = n[3];
    return `rgba(${n[0]}, ${n[1]}, ${n[2]}, ${i * s})`;
  }
  G(t) {
    const i = this.K(t);
    return { Z: `rgb(${i[0]}, ${i[1]}, ${i[2]})`, X: P(i) > 160 ? "black" : "white" };
  }
  J(t) {
    return P(this.K(t));
  }
  tt(t, i, n) {
    const [s, e2, r2, h2] = this.K(t), [a2, l2, o2, _2] = this.K(i), u2 = [y(s + n * (a2 - s)), y(e2 + n * (l2 - e2)), y(r2 + n * (o2 - r2)), (c2 = h2 + n * (_2 - h2), c2 <= 0 || c2 > 1 ? Math.min(Math.max(c2, 0), 1) : Math.round(1e4 * c2) / 1e4)];
    var c2;
    return `rgba(${u2[0]}, ${u2[1]}, ${u2[2]}, ${u2[3]})`;
  }
  K(t) {
    const i = this.j.get(t);
    if (i) return i;
    const n = (function(t2) {
      const i2 = document.createElement("div");
      i2.style.display = "none", document.body.appendChild(i2), i2.style.color = t2;
      const n2 = window.getComputedStyle(i2).color;
      return document.body.removeChild(i2), n2;
    })(t), s = n.match(/^rgba?\s*\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*\.?\d+))?\)$/);
    if (!s) {
      if (this.q.length) for (const i2 of this.q) {
        const n2 = i2(t);
        if (n2) return this.j.set(t, n2), n2;
      }
      throw new Error(`Failed to parse color: ${t}`);
    }
    const e2 = [parseInt(s[1], 10), parseInt(s[2], 10), parseInt(s[3], 10), s[4] ? parseFloat(s[4]) : 1];
    return this.j.set(t, e2), e2;
  }
};
var T = class {
  constructor() {
    this.it = [];
  }
  nt(t) {
    this.it = t;
  }
  st(t, i, n) {
    this.it.forEach(((s) => {
      s.st(t, i, n);
    }));
  }
};
var R = class {
  st(t, i, n) {
    t.useBitmapCoordinateSpace(((t2) => this.et(t2, i, n)));
  }
};
var D = class extends R {
  constructor() {
    super(...arguments), this.rt = null;
  }
  ht(t) {
    this.rt = t;
  }
  et({ context: t, horizontalPixelRatio: i, verticalPixelRatio: n }) {
    if (null === this.rt || null === this.rt.lt) return;
    const s = this.rt.lt, e2 = this.rt, r2 = Math.max(1, Math.floor(i)) % 2 / 2, h2 = (h3) => {
      t.beginPath();
      for (let a2 = s.to - 1; a2 >= s.from; --a2) {
        const s2 = e2.ot[a2], l2 = Math.round(s2._t * i) + r2, o2 = s2.ut * n, _2 = h3 * n + r2;
        t.moveTo(l2, o2), t.arc(l2, o2, _2, 0, 2 * Math.PI);
      }
      t.fill();
    };
    e2.ct > 0 && (t.fillStyle = e2.dt, h2(e2.ft + e2.ct)), t.fillStyle = e2.vt, h2(e2.ft);
  }
};
function I() {
  return { ot: [{ _t: 0, ut: 0, wt: 0, Mt: 0 }], vt: "", dt: "", ft: 0, ct: 0, lt: null };
}
var V = { from: 0, to: 1 };
var B = class {
  constructor(t, i, n) {
    this.gt = new T(), this.bt = [], this.St = [], this.xt = true, this.O = t, this.Ct = i, this.yt = n, this.gt.nt(this.bt);
  }
  Pt(t) {
    this.kt(), this.xt = true;
  }
  Tt() {
    return this.xt && (this.Rt(), this.xt = false), this.gt;
  }
  kt() {
    const t = this.yt.Dt();
    t.length !== this.bt.length && (this.St = t.map(I), this.bt = this.St.map(((t2) => {
      const i = new D();
      return i.ht(t2), i;
    })), this.gt.nt(this.bt));
  }
  Rt() {
    const t = 2 === this.Ct.N().mode || !this.Ct.It(), i = this.yt.Vt(), n = this.Ct.Bt(), s = this.O.Et();
    this.kt(), i.forEach(((i2, e2) => {
      const r2 = this.St[e2], h2 = i2.At(n), a2 = i2.Lt();
      !t && null !== h2 && i2.It() && null !== a2 ? (r2.vt = h2.zt, r2.ft = h2.ft, r2.ct = h2.Ot, r2.ot[0].Mt = h2.Mt, r2.ot[0].ut = i2.Ft().Nt(h2.Mt, a2.Wt), r2.dt = h2.Ht ?? this.O.Ut(r2.ot[0].ut / i2.Ft().$t()), r2.ot[0].wt = n, r2.ot[0]._t = s.jt(n), r2.lt = V) : r2.lt = null;
    }));
  }
};
var E = class extends R {
  constructor(t) {
    super(), this.qt = t;
  }
  et({ context: t, bitmapSize: i, horizontalPixelRatio: n, verticalPixelRatio: s }) {
    if (null === this.qt) return;
    const e2 = this.qt.Yt.It, r2 = this.qt.Kt.It;
    if (!e2 && !r2) return;
    const h2 = Math.round(this.qt._t * n), o2 = Math.round(this.qt.ut * s);
    t.lineCap = "butt", e2 && h2 >= 0 && (t.lineWidth = Math.floor(this.qt.Yt.ct * n), t.strokeStyle = this.qt.Yt.R, t.fillStyle = this.qt.Yt.R, a(t, this.qt.Yt.Gt), (function(t2, i2, n2, s2) {
      t2.beginPath();
      const e3 = t2.lineWidth % 2 ? 0.5 : 0;
      t2.moveTo(i2 + e3, n2), t2.lineTo(i2 + e3, s2), t2.stroke();
    })(t, h2, 0, i.height)), r2 && o2 >= 0 && (t.lineWidth = Math.floor(this.qt.Kt.ct * s), t.strokeStyle = this.qt.Kt.R, t.fillStyle = this.qt.Kt.R, a(t, this.qt.Kt.Gt), l(t, o2, 0, i.width));
  }
};
var A = class {
  constructor(t, i) {
    this.xt = true, this.Zt = { Yt: { ct: 1, Gt: 0, R: "", It: false }, Kt: { ct: 1, Gt: 0, R: "", It: false }, _t: 0, ut: 0 }, this.Xt = new E(this.Zt), this.Jt = t, this.yt = i;
  }
  Pt() {
    this.xt = true;
  }
  Tt(t) {
    return this.xt && (this.Rt(), this.xt = false), this.Xt;
  }
  Rt() {
    const t = this.Jt.It(), i = this.yt.Qt().N().crosshair, n = this.Zt;
    if (2 === i.mode) return n.Kt.It = false, void (n.Yt.It = false);
    n.Kt.It = t && this.Jt.ti(this.yt), n.Yt.It = t && this.Jt.ii(), n.Kt.ct = i.horzLine.width, n.Kt.Gt = i.horzLine.style, n.Kt.R = i.horzLine.color, n.Yt.ct = i.vertLine.width, n.Yt.Gt = i.vertLine.style, n.Yt.R = i.vertLine.color, n._t = this.Jt.ni(), n.ut = this.Jt.si();
  }
};
function L(t, i, n, s, e2, r2) {
  t.fillRect(i + r2, n, s - 2 * r2, r2), t.fillRect(i + r2, n + e2 - r2, s - 2 * r2, r2), t.fillRect(i, n, r2, e2), t.fillRect(i + s - r2, n, r2, e2);
}
function z(t, i, n, s, e2, r2) {
  t.save(), t.globalCompositeOperation = "copy", t.fillStyle = r2, t.fillRect(i, n, s, e2), t.restore();
}
function O(t, i, n, s, e2, r2) {
  t.beginPath(), t.roundRect ? t.roundRect(i, n, s, e2, r2) : (t.lineTo(i + s - r2[1], n), 0 !== r2[1] && t.arcTo(i + s, n, i + s, n + r2[1], r2[1]), t.lineTo(i + s, n + e2 - r2[2]), 0 !== r2[2] && t.arcTo(i + s, n + e2, i + s - r2[2], n + e2, r2[2]), t.lineTo(i + r2[3], n + e2), 0 !== r2[3] && t.arcTo(i, n + e2, i, n + e2 - r2[3], r2[3]), t.lineTo(i, n + r2[0]), 0 !== r2[0] && t.arcTo(i, n, i + r2[0], n, r2[0]));
}
function N(t, i, n, s, e2, r2, h2 = 0, a2 = [0, 0, 0, 0], l2 = "") {
  if (t.save(), !h2 || !l2 || l2 === r2) return O(t, i, n, s, e2, a2), t.fillStyle = r2, t.fill(), void t.restore();
  const o2 = h2 / 2;
  var _2;
  O(t, i + o2, n + o2, s - h2, e2 - h2, (_2 = -o2, a2.map(((t2) => 0 === t2 ? t2 : t2 + _2)))), "transparent" !== r2 && (t.fillStyle = r2, t.fill()), "transparent" !== l2 && (t.lineWidth = h2, t.strokeStyle = l2, t.closePath(), t.stroke()), t.restore();
}
function F(t, i, n, s, e2, r2, h2) {
  t.save(), t.globalCompositeOperation = "copy";
  const a2 = t.createLinearGradient(0, 0, 0, e2);
  a2.addColorStop(0, r2), a2.addColorStop(1, h2), t.fillStyle = a2, t.fillRect(i, n, s, e2), t.restore();
}
var W = class {
  constructor(t, i) {
    this.ht(t, i);
  }
  ht(t, i) {
    this.qt = t, this.ei = i;
  }
  $t(t, i) {
    return this.qt.It ? t.P + t.A + t.I : 0;
  }
  st(t, i, n, s) {
    if (!this.qt.It || 0 === this.qt.ri.length) return;
    const e2 = this.qt.R, r2 = this.ei.Z, h2 = t.useBitmapCoordinateSpace(((t2) => {
      const h3 = t2.context;
      h3.font = i.k;
      const a2 = this.hi(t2, i, n, s), l2 = a2.ai;
      return a2.li ? N(h3, l2.oi, l2._i, l2.ui, l2.ci, r2, l2.di, [l2.ft, 0, 0, l2.ft], r2) : N(h3, l2.fi, l2._i, l2.ui, l2.ci, r2, l2.di, [0, l2.ft, l2.ft, 0], r2), this.qt.pi && (h3.fillStyle = e2, h3.fillRect(l2.fi, l2.mi, l2.wi - l2.fi, l2.Mi)), this.qt.gi && (h3.fillStyle = i.D, h3.fillRect(a2.li ? l2.bi - l2.di : 0, l2._i, l2.di, l2.Si - l2._i)), a2;
    }));
    t.useMediaCoordinateSpace((({ context: t2 }) => {
      const n2 = h2.xi;
      t2.font = i.k, t2.textAlign = h2.li ? "right" : "left", t2.textBaseline = "middle", t2.fillStyle = e2, t2.fillText(this.qt.ri, n2.Ci, (n2._i + n2.Si) / 2 + n2.yi);
    }));
  }
  hi(t, i, n, s) {
    const { context: e2, bitmapSize: r2, mediaSize: h2, horizontalPixelRatio: a2, verticalPixelRatio: l2 } = t, o2 = this.qt.pi || !this.qt.Pi ? i.C : 0, _2 = this.qt.ki ? i.S : 0, u2 = i.A + this.ei.Ti, c2 = i.I + this.ei.Ri, d2 = i.V, f2 = i.B, p2 = this.qt.ri, v2 = i.P, m2 = n.Di(e2, p2), w2 = Math.ceil(n.Ii(e2, p2)), M2 = v2 + u2 + c2, g2 = i.S + d2 + f2 + w2 + o2, b2 = Math.max(1, Math.floor(l2));
    let S2 = Math.round(M2 * l2);
    S2 % 2 != b2 % 2 && (S2 += 1);
    const x2 = _2 > 0 ? Math.max(1, Math.floor(_2 * a2)) : 0, C2 = Math.round(g2 * a2), y2 = Math.round(o2 * a2), P2 = this.ei.Vi ?? this.ei.Bi ?? this.ei.Ei, k2 = Math.round(P2 * l2) - Math.floor(0.5 * l2), T2 = Math.floor(k2 + b2 / 2 - S2 / 2), R2 = T2 + S2, D2 = "right" === s, I2 = D2 ? h2.width - _2 : _2, V2 = D2 ? r2.width - x2 : x2;
    let B2, E2, A2;
    return D2 ? (B2 = V2 - C2, E2 = V2 - y2, A2 = I2 - o2 - d2 - _2) : (B2 = V2 + C2, E2 = V2 + y2, A2 = I2 + o2 + d2), { li: D2, ai: { _i: T2, mi: k2, Si: R2, ui: C2, ci: S2, ft: 2 * a2, di: x2, oi: B2, fi: V2, wi: E2, Mi: b2, bi: r2.width }, xi: { _i: T2 / l2, Si: R2 / l2, Ci: A2, yi: m2 } };
  }
};
var H = class {
  constructor(t) {
    this.Ai = { Ei: 0, Z: "#000", Ri: 0, Ti: 0 }, this.Li = { ri: "", It: false, pi: true, Pi: false, Ht: "", R: "#FFF", gi: false, ki: false }, this.zi = { ri: "", It: false, pi: false, Pi: true, Ht: "", R: "#FFF", gi: true, ki: true }, this.xt = true, this.Oi = new (t || W)(this.Li, this.Ai), this.Ni = new (t || W)(this.zi, this.Ai);
  }
  ri() {
    return this.Fi(), this.Li.ri;
  }
  Ei() {
    return this.Fi(), this.Ai.Ei;
  }
  Pt() {
    this.xt = true;
  }
  $t(t, i = false) {
    return Math.max(this.Oi.$t(t, i), this.Ni.$t(t, i));
  }
  Wi() {
    return this.Ai.Vi ?? null;
  }
  Hi() {
    return this.Ai.Vi ?? this.Ai.Bi ?? this.Ei();
  }
  Ui(t) {
    this.Ai.Bi = t ?? void 0;
  }
  $i() {
    return this.Fi(), this.Li.It || this.zi.It;
  }
  ji() {
    return this.Fi(), this.Li.It;
  }
  Tt(t) {
    return this.Fi(), this.Li.pi = this.Li.pi && t.N().ticksVisible, this.zi.pi = this.zi.pi && t.N().ticksVisible, this.Oi.ht(this.Li, this.Ai), this.Ni.ht(this.zi, this.Ai), this.Oi;
  }
  qi() {
    return this.Fi(), this.Oi.ht(this.Li, this.Ai), this.Ni.ht(this.zi, this.Ai), this.Ni;
  }
  Fi() {
    this.xt && (this.Li.pi = true, this.zi.pi = false, this.Yi(this.Li, this.zi, this.Ai));
  }
};
var U = class extends H {
  constructor(t, i, n) {
    super(), this.Jt = t, this.Ki = i, this.Gi = n;
  }
  Yi(t, i, n) {
    if (t.It = false, 2 === this.Jt.N().mode) return;
    const s = this.Jt.N().horzLine;
    if (!s.labelVisible) return;
    const e2 = this.Ki.Lt();
    if (!this.Jt.It() || this.Ki.Zi() || null === e2) return;
    const r2 = this.Ki.Xi().G(s.labelBackgroundColor);
    n.Z = r2.Z, t.R = r2.X;
    const h2 = 2 / 12 * this.Ki.P();
    n.Ti = h2, n.Ri = h2;
    const a2 = this.Gi(this.Ki);
    n.Ei = a2.Ei, t.ri = this.Ki.Ji(a2.Mt, e2), t.It = true;
  }
};
var $ = /[1-9]/g;
var j = class {
  constructor() {
    this.qt = null;
  }
  ht(t) {
    this.qt = t;
  }
  st(t, i) {
    if (null === this.qt || false === this.qt.It || 0 === this.qt.ri.length) return;
    const n = t.useMediaCoordinateSpace((({ context: t2 }) => (t2.font = i.k, Math.round(i.Qi.Ii(t2, u(this.qt).ri, $)))));
    if (n <= 0) return;
    const s = i.tn, e2 = n + 2 * s, r2 = e2 / 2, h2 = this.qt.nn;
    let a2 = this.qt.Ei, l2 = Math.floor(a2 - r2) + 0.5;
    l2 < 0 ? (a2 += Math.abs(0 - l2), l2 = Math.floor(a2 - r2) + 0.5) : l2 + e2 > h2 && (a2 -= Math.abs(h2 - (l2 + e2)), l2 = Math.floor(a2 - r2) + 0.5);
    const o2 = l2 + e2, _2 = Math.ceil(0 + i.S + i.C + i.A + i.P + i.I);
    t.useBitmapCoordinateSpace((({ context: t2, horizontalPixelRatio: n2, verticalPixelRatio: s2 }) => {
      const e3 = u(this.qt);
      t2.fillStyle = e3.Z;
      const r3 = Math.round(l2 * n2), h3 = Math.round(0 * s2), a3 = Math.round(o2 * n2), c2 = Math.round(_2 * s2), d2 = Math.round(2 * n2);
      if (t2.beginPath(), t2.moveTo(r3, h3), t2.lineTo(r3, c2 - d2), t2.arcTo(r3, c2, r3 + d2, c2, d2), t2.lineTo(a3 - d2, c2), t2.arcTo(a3, c2, a3, c2 - d2, d2), t2.lineTo(a3, h3), t2.fill(), e3.pi) {
        const r4 = Math.round(e3.Ei * n2), a4 = h3, l3 = Math.round((a4 + i.C) * s2);
        t2.fillStyle = e3.R;
        const o3 = Math.max(1, Math.floor(n2)), _3 = Math.floor(0.5 * n2);
        t2.fillRect(r4 - _3, a4, o3, l3 - a4);
      }
    })), t.useMediaCoordinateSpace((({ context: t2 }) => {
      const n2 = u(this.qt), e3 = 0 + i.S + i.C + i.A + i.P / 2;
      t2.font = i.k, t2.textAlign = "left", t2.textBaseline = "middle", t2.fillStyle = n2.R;
      const r3 = i.Qi.Di(t2, "Apr0");
      t2.translate(l2 + s, e3 + r3), t2.fillText(n2.ri, 0, 0);
    }));
  }
};
var q = class {
  constructor(t, i, n) {
    this.xt = true, this.Xt = new j(), this.Zt = { It: false, Z: "#4c525e", R: "white", ri: "", nn: 0, Ei: NaN, pi: true }, this.Ct = t, this.sn = i, this.Gi = n;
  }
  Pt() {
    this.xt = true;
  }
  Tt() {
    return this.xt && (this.Rt(), this.xt = false), this.Xt.ht(this.Zt), this.Xt;
  }
  Rt() {
    const t = this.Zt;
    if (t.It = false, 2 === this.Ct.N().mode) return;
    const i = this.Ct.N().vertLine;
    if (!i.labelVisible) return;
    const n = this.sn.Et();
    if (n.Zi()) return;
    t.nn = n.nn();
    const s = this.Gi();
    if (null === s) return;
    t.Ei = s.Ei;
    const e2 = n.en(this.Ct.Bt());
    t.ri = n.rn(u(e2)), t.It = true;
    const r2 = this.sn.Xi().G(i.labelBackgroundColor);
    t.Z = r2.Z, t.R = r2.X, t.pi = n.N().ticksVisible;
  }
};
var Y = class {
  constructor() {
    this.hn = null, this.an = 0;
  }
  ln() {
    return this.an;
  }
  _n(t) {
    this.an = t;
  }
  Ft() {
    return this.hn;
  }
  un(t) {
    this.hn = t;
  }
  cn(t) {
    return [];
  }
  dn() {
    return [];
  }
  It() {
    return true;
  }
};
var K;
!(function(t) {
  t[t.Normal = 0] = "Normal", t[t.Magnet = 1] = "Magnet", t[t.Hidden = 2] = "Hidden", t[t.MagnetOHLC = 3] = "MagnetOHLC";
})(K || (K = {}));
var G = class extends Y {
  constructor(t, i) {
    super(), this.yt = null, this.fn = NaN, this.pn = 0, this.vn = false, this.mn = /* @__PURE__ */ new Map(), this.wn = false, this.Mn = /* @__PURE__ */ new WeakMap(), this.gn = /* @__PURE__ */ new WeakMap(), this.bn = NaN, this.Sn = NaN, this.xn = NaN, this.Cn = NaN, this.sn = t, this.yn = i;
    this.Pn = /* @__PURE__ */ ((t2, i2) => (n2) => {
      const s = i2(), e2 = t2();
      if (n2 === u(this.yt).kn()) return { Mt: e2, Ei: s };
      {
        const t3 = u(n2.Lt());
        return { Mt: n2.Tn(s, t3), Ei: s };
      }
    })((() => this.fn), (() => this.Sn));
    const n = /* @__PURE__ */ ((t2, i2) => () => {
      const n2 = this.sn.Et().Rn(t2()), s = i2();
      return n2 && Number.isFinite(s) ? { wt: n2, Ei: s } : null;
    })((() => this.pn), (() => this.ni()));
    this.Dn = new q(this, t, n);
  }
  N() {
    return this.yn;
  }
  In(t, i) {
    this.xn = t, this.Cn = i;
  }
  Vn() {
    this.xn = NaN, this.Cn = NaN;
  }
  Bn() {
    return this.xn;
  }
  En() {
    return this.Cn;
  }
  An(t, i, n) {
    this.wn || (this.wn = true), this.vn = true, this.Ln(t, i, n);
  }
  Bt() {
    return this.pn;
  }
  ni() {
    return this.bn;
  }
  si() {
    return this.Sn;
  }
  It() {
    return this.vn;
  }
  zn() {
    this.vn = false, this.On(), this.fn = NaN, this.bn = NaN, this.Sn = NaN, this.yt = null, this.Vn(), this.Nn();
  }
  Fn(t) {
    if (!this.yn.doNotSnapToHiddenSeriesIndices) return t;
    const i = this.sn, n = i.Et();
    let s = null, e2 = null;
    for (const n2 of i.Wn()) {
      const i2 = n2.Un().Hn(t, -1);
      if (i2) {
        if (i2.$n === t) return t;
        (null === s || i2.$n > s) && (s = i2.$n);
      }
      const r3 = n2.Un().Hn(t, 1);
      if (r3) {
        if (r3.$n === t) return t;
        (null === e2 || r3.$n < e2) && (e2 = r3.$n);
      }
    }
    const r2 = [s, e2].filter(g);
    if (0 === r2.length) return t;
    const h2 = n.jt(t), a2 = r2.map(((t2) => Math.abs(h2 - n.jt(t2))));
    return r2[a2.indexOf(Math.min(...a2))];
  }
  jn(t) {
    let i = this.Mn.get(t);
    i || (i = new A(this, t), this.Mn.set(t, i));
    let n = this.gn.get(t);
    return n || (n = new B(this.sn, this, t), this.gn.set(t, n)), [i, n];
  }
  ti(t) {
    return t === this.yt && this.yn.horzLine.visible;
  }
  ii() {
    return this.yn.vertLine.visible;
  }
  qn(t, i) {
    this.vn && this.yt === t || this.mn.clear();
    const n = [];
    return this.yt === t && n.push(this.Yn(this.mn, i, this.Pn)), n;
  }
  dn() {
    return this.vn ? [this.Dn] : [];
  }
  Kn() {
    return this.yt;
  }
  Nn() {
    this.sn.Gn().forEach(((t) => {
      this.Mn.get(t)?.Pt(), this.gn.get(t)?.Pt();
    })), this.mn.forEach(((t) => t.Pt())), this.Dn.Pt();
  }
  Zn(t) {
    return t && !t.kn().Zi() ? t.kn() : null;
  }
  Ln(t, i, n) {
    this.Xn(t, i, n) && this.Nn();
  }
  Xn(t, i, n) {
    const s = this.bn, e2 = this.Sn, r2 = this.fn, h2 = this.pn, a2 = this.yt, l2 = this.Zn(n);
    this.pn = t, this.bn = isNaN(t) ? NaN : this.sn.Et().jt(t), this.yt = n;
    const o2 = null !== l2 ? l2.Lt() : null;
    return null !== l2 && null !== o2 ? (this.fn = i, this.Sn = l2.Nt(i, o2)) : (this.fn = NaN, this.Sn = NaN), s !== this.bn || e2 !== this.Sn || h2 !== this.pn || r2 !== this.fn || a2 !== this.yt;
  }
  On() {
    const t = this.sn.Jn().map(((t2) => t2.Un().Qn())).filter(g), i = 0 === t.length ? null : Math.max(...t);
    this.pn = null !== i ? i : NaN;
  }
  Yn(t, i, n) {
    let s = t.get(i);
    return void 0 === s && (s = new U(this, i, n), t.set(i, s)), s;
  }
};
function Z(t) {
  return "left" === t || "right" === t;
}
var X = class _X {
  constructor(t) {
    this.ts = /* @__PURE__ */ new Map(), this.ns = [], this.ss = t;
  }
  es(t, i) {
    const n = (function(t2, i2) {
      return void 0 === t2 ? i2 : { rs: Math.max(t2.rs, i2.rs), hs: t2.hs || i2.hs };
    })(this.ts.get(t), i);
    this.ts.set(t, n);
  }
  ls() {
    return this.ss;
  }
  _s(t) {
    const i = this.ts.get(t);
    return void 0 === i ? { rs: this.ss } : { rs: Math.max(this.ss, i.rs), hs: i.hs };
  }
  us() {
    this.cs(), this.ns = [{ ds: 0 }];
  }
  fs(t) {
    this.cs(), this.ns = [{ ds: 1, Wt: t }];
  }
  ps(t) {
    this.vs(), this.ns.push({ ds: 5, Wt: t });
  }
  cs() {
    this.vs(), this.ns.push({ ds: 6 });
  }
  ws() {
    this.cs(), this.ns = [{ ds: 4 }];
  }
  Ms(t) {
    this.cs(), this.ns.push({ ds: 2, Wt: t });
  }
  gs(t) {
    this.cs(), this.ns.push({ ds: 3, Wt: t });
  }
  bs() {
    return this.ns;
  }
  Ss(t) {
    for (const i of t.ns) this.xs(i);
    this.ss = Math.max(this.ss, t.ss), t.ts.forEach(((t2, i) => {
      this.es(i, t2);
    }));
  }
  static Cs() {
    return new _X(2);
  }
  static ys() {
    return new _X(3);
  }
  xs(t) {
    switch (t.ds) {
      case 0:
        this.us();
        break;
      case 1:
        this.fs(t.Wt);
        break;
      case 2:
        this.Ms(t.Wt);
        break;
      case 3:
        this.gs(t.Wt);
        break;
      case 4:
        this.ws();
        break;
      case 5:
        this.ps(t.Wt);
        break;
      case 6:
        this.vs();
    }
  }
  vs() {
    const t = this.ns.findIndex(((t2) => 5 === t2.ds));
    -1 !== t && this.ns.splice(t, 1);
  }
};
var J = class {
  formatTickmarks(t) {
    return t.map(((t2) => this.format(t2)));
  }
};
var Q = ".";
function tt(t, i) {
  if (!p(t)) return "n/a";
  if (!v(i)) throw new TypeError("invalid length");
  if (i < 0 || i > 16) throw new TypeError("invalid length");
  if (0 === i) return t.toString();
  return ("0000000000000000" + t.toString()).slice(-i);
}
var it = class extends J {
  constructor(t, i) {
    if (super(), i || (i = 1), p(t) && v(t) || (t = 100), t < 0) throw new TypeError("invalid base");
    this.Ki = t, this.Ps = i, this.ks();
  }
  format(t) {
    const i = t < 0 ? "\u2212" : "";
    return t = Math.abs(t), i + this.Ts(t);
  }
  ks() {
    if (this.Rs = 0, this.Ki > 0 && this.Ps > 0) {
      let t = this.Ki;
      for (; t > 1; ) t /= 10, this.Rs++;
    }
  }
  Ts(t) {
    const i = this.Ki / this.Ps;
    let n = Math.floor(t), s = "";
    const e2 = void 0 !== this.Rs ? this.Rs : NaN;
    if (i > 1) {
      let r2 = +(Math.round(t * i) - n * i).toFixed(this.Rs);
      r2 >= i && (r2 -= i, n += 1), s = Q + tt(+r2.toFixed(this.Rs) * this.Ps, e2);
    } else n = Math.round(n * i) / i, e2 > 0 && (s = Q + tt(0, e2));
    return n.toFixed(0) + s;
  }
};
var nt = class extends it {
  constructor(t = 100) {
    super(t);
  }
  format(t) {
    return `${super.format(t)}%`;
  }
};
var st = class extends J {
  constructor(t) {
    super(), this.Ds = t;
  }
  format(t) {
    let i = "";
    return t < 0 && (i = "-", t = -t), t < 995 ? i + this.Is(t) : t < 999995 ? i + this.Is(t / 1e3) + "K" : t < 999999995 ? (t = 1e3 * Math.round(t / 1e3), i + this.Is(t / 1e6) + "M") : (t = 1e6 * Math.round(t / 1e6), i + this.Is(t / 1e9) + "B");
  }
  Is(t) {
    let i;
    const n = Math.pow(10, this.Ds);
    return i = (t = Math.round(t * n) / n) >= 1e-15 && t < 1 ? t.toFixed(this.Ds).replace(/\.?0+$/, "") : String(t), i.replace(/(\.[1-9]*)0+$/, ((t2, i2) => i2));
  }
};
var et = /[2-9]/g;
var rt = class {
  constructor(t = 50) {
    this.Vs = 0, this.Bs = 1, this.Es = 1, this.As = {}, this.Ls = /* @__PURE__ */ new Map(), this.zs = t;
  }
  Os() {
    this.Vs = 0, this.Ls.clear(), this.Bs = 1, this.Es = 1, this.As = {};
  }
  Ii(t, i, n) {
    return this.Ns(t, i, n).width;
  }
  Di(t, i, n) {
    const s = this.Ns(t, i, n);
    return ((s.actualBoundingBoxAscent || 0) - (s.actualBoundingBoxDescent || 0)) / 2;
  }
  Ns(t, i, n) {
    const s = n || et, e2 = String(i).replace(s, "0");
    if (this.Ls.has(e2)) return _(this.Ls.get(e2)).Fs;
    if (this.Vs === this.zs) {
      const t2 = this.As[this.Es];
      delete this.As[this.Es], this.Ls.delete(t2), this.Es++, this.Vs--;
    }
    t.save(), t.textBaseline = "middle";
    const r2 = t.measureText(e2);
    return t.restore(), 0 === r2.width && i.length || (this.Ls.set(e2, { Fs: r2, Ws: this.Bs }), this.As[this.Bs] = e2, this.Vs++, this.Bs++), r2;
  }
};
var ht = class {
  constructor(t) {
    this.Hs = null, this.M = null, this.Us = "right", this.$s = t;
  }
  js(t, i, n) {
    this.Hs = t, this.M = i, this.Us = n;
  }
  st(t) {
    null !== this.M && null !== this.Hs && this.Hs.st(t, this.M, this.$s, this.Us);
  }
};
var at = class {
  constructor(t, i, n) {
    this.qs = t, this.$s = new rt(50), this.Ys = i, this.O = n, this.F = -1, this.Xt = new ht(this.$s);
  }
  Tt() {
    const t = this.O.Ks(this.Ys);
    if (null === t) return null;
    const i = t.Gs(this.Ys) ? t.Zs() : this.Ys.Ft();
    if (null === i) return null;
    const n = t.Xs(i);
    if ("overlay" === n) return null;
    const s = this.O.Js();
    return s.P !== this.F && (this.F = s.P, this.$s.Os()), this.Xt.js(this.qs.qi(), s, n), this.Xt;
  }
};
var lt = class extends R {
  constructor() {
    super(...arguments), this.qt = null;
  }
  ht(t) {
    this.qt = t;
  }
  Qs(t, i) {
    if (!this.qt?.It) return null;
    const { ut: n, ct: s, te: e2 } = this.qt;
    return i >= n - s - 7 && i <= n + s + 7 ? { ie: this.qt, ne: Math.abs(i - n), se: 2, ee: "price-line", te: e2 } : null;
  }
  et({ context: t, bitmapSize: i, horizontalPixelRatio: n, verticalPixelRatio: s }) {
    if (null === this.qt) return;
    if (false === this.qt.It) return;
    const e2 = Math.round(this.qt.ut * s);
    e2 < 0 || e2 > i.height || (t.lineCap = "butt", t.strokeStyle = this.qt.R, t.lineWidth = Math.floor(this.qt.ct * n), a(t, this.qt.Gt), l(t, e2, 0, i.width));
  }
};
var ot = class {
  constructor(t) {
    this.re = { ut: 0, R: "rgba(0, 0, 0, 0)", ct: 1, Gt: 0, It: false }, this.he = new lt(), this.xt = true, this.ae = t, this.le = t.Qt(), this.he.ht(this.re);
  }
  Pt() {
    this.xt = true;
  }
  Tt() {
    return this.ae.It() ? (this.xt && (this.oe(), this.xt = false), this.he) : null;
  }
};
var _t = class extends ot {
  constructor(t) {
    super(t);
  }
  oe() {
    this.re.It = false;
    const t = this.ae.Ft(), i = t._e()._e;
    if (2 !== i && 3 !== i) return;
    const n = this.ae.N();
    if (!n.baseLineVisible || !this.ae.It()) return;
    const s = this.ae.Lt();
    null !== s && (this.re.It = true, this.re.ut = t.Nt(s.Wt, s.Wt), this.re.R = n.baseLineColor, this.re.ct = n.baseLineWidth, this.re.Gt = n.baseLineStyle);
  }
};
var ut = class extends R {
  constructor() {
    super(...arguments), this.qt = null;
  }
  ht(t) {
    this.qt = t;
  }
  ue() {
    return this.qt;
  }
  et({ context: t, horizontalPixelRatio: i, verticalPixelRatio: n }) {
    const s = this.qt;
    if (null === s) return;
    const e2 = Math.max(1, Math.floor(i)), r2 = e2 % 2 / 2, h2 = Math.round(s.ce.x * i) + r2, a2 = s.ce.y * n;
    t.fillStyle = s.de, t.beginPath();
    const l2 = Math.max(2, 1.5 * s.fe) * i;
    t.arc(h2, a2, l2, 0, 2 * Math.PI, false), t.fill(), t.fillStyle = s.pe, t.beginPath(), t.arc(h2, a2, s.ft * i, 0, 2 * Math.PI, false), t.fill(), t.lineWidth = e2, t.strokeStyle = s.ve, t.beginPath(), t.arc(h2, a2, s.ft * i + e2 / 2, 0, 2 * Math.PI, false), t.stroke();
  }
};
var ct = [{ me: 0, we: 0.25, Me: 4, ge: 10, be: 0.25, Se: 0, xe: 0.4, Ce: 0.8 }, { me: 0.25, we: 0.525, Me: 10, ge: 14, be: 0, Se: 0, xe: 0.8, Ce: 0 }, { me: 0.525, we: 1, Me: 14, ge: 14, be: 0, Se: 0, xe: 0, Ce: 0 }];
var dt = class {
  constructor(t) {
    this.Xt = new ut(), this.xt = true, this.ye = true, this.Pe = performance.now(), this.ke = this.Pe - 1, this.Te = t;
  }
  Re() {
    this.ke = this.Pe - 1, this.Pt();
  }
  De() {
    if (this.Pt(), 2 === this.Te.N().lastPriceAnimation) {
      const t = performance.now(), i = this.ke - t;
      if (i > 0) return void (i < 650 && (this.ke += 2600));
      this.Pe = t, this.ke = t + 2600;
    }
  }
  Pt() {
    this.xt = true;
  }
  Ie() {
    this.ye = true;
  }
  It() {
    return 0 !== this.Te.N().lastPriceAnimation;
  }
  Ve() {
    switch (this.Te.N().lastPriceAnimation) {
      case 0:
        return false;
      case 1:
        return true;
      case 2:
        return performance.now() <= this.ke;
    }
  }
  Tt() {
    return this.xt ? (this.Rt(), this.xt = false, this.ye = false) : this.ye && (this.Be(), this.ye = false), this.Xt;
  }
  Rt() {
    this.Xt.ht(null);
    const t = this.Te.Qt().Et(), i = t.Ee(), n = this.Te.Lt();
    if (null === i || null === n) return;
    const s = this.Te.Ae(true);
    if (s.Le || !i.ze(s.$n)) return;
    const e2 = { x: t.jt(s.$n), y: this.Te.Ft().Nt(s.Mt, n.Wt) }, r2 = s.R, h2 = this.Te.N().lineWidth, a2 = this.Oe(this.Ne(), r2);
    this.Xt.ht({ de: r2, fe: h2, pe: a2.pe, ve: a2.ve, ft: a2.ft, ce: e2 });
  }
  Be() {
    const t = this.Xt.ue();
    if (null !== t) {
      const i = this.Oe(this.Ne(), t.de);
      t.pe = i.pe, t.ve = i.ve, t.ft = i.ft;
    }
  }
  Ne() {
    return this.Ve() ? performance.now() - this.Pe : 2599;
  }
  Fe(t, i, n, s) {
    const e2 = n + (s - n) * i;
    return this.Te.Qt().Xi().Y(t, e2);
  }
  Oe(t, i) {
    const n = t % 2600 / 2600;
    let s;
    for (const t2 of ct) if (n >= t2.me && n <= t2.we) {
      s = t2;
      break;
    }
    o(void 0 !== s, "Last price animation internal logic error");
    const e2 = (n - s.me) / (s.we - s.me);
    return { pe: this.Fe(i, e2, s.be, s.Se), ve: this.Fe(i, e2, s.xe, s.Ce), ft: (r2 = e2, h2 = s.Me, a2 = s.ge, h2 + (a2 - h2) * r2) };
    var r2, h2, a2;
  }
};
var ft = class extends ot {
  constructor(t) {
    super(t);
  }
  oe() {
    const t = this.re;
    t.It = false;
    const i = this.ae.N();
    if (!i.priceLineVisible || !this.ae.It()) return;
    const n = this.ae.Ae(0 === i.priceLineSource);
    n.Le || (t.It = true, t.ut = n.Ei, t.R = this.ae.We(n.R), t.ct = i.priceLineWidth, t.Gt = i.priceLineStyle);
  }
};
var pt = class extends H {
  constructor(t) {
    super(), this.Jt = t;
  }
  Yi(t, i, n) {
    t.It = false, i.It = false;
    const s = this.Jt;
    if (!s.It()) return;
    const e2 = s.N(), r2 = e2.lastValueVisible, h2 = "" !== s.He(), a2 = 0 === e2.seriesLastValueMode, l2 = s.Ae(false);
    if (l2.Le) return;
    r2 && (t.ri = this.Ue(l2, r2, a2), t.It = 0 !== t.ri.length), (h2 || a2) && (i.ri = this.$e(l2, r2, h2, a2), i.It = i.ri.length > 0);
    const o2 = s.We(l2.R), _2 = this.Jt.Qt().Xi().G(o2);
    n.Z = _2.Z, n.Ei = l2.Ei, i.Ht = s.Qt().Ut(l2.Ei / s.Ft().$t()), t.Ht = o2, t.R = _2.X, i.R = _2.X;
  }
  $e(t, i, n, s) {
    let e2 = "";
    const r2 = this.Jt.He();
    return n && 0 !== r2.length && (e2 += `${r2} `), i && s && (e2 += this.Jt.Ft().je() ? t.qe : t.Ye), e2.trim();
  }
  Ue(t, i, n) {
    return i ? n ? this.Jt.Ft().je() ? t.Ye : t.qe : t.ri : "";
  }
};
function vt(t, i, n, s) {
  const e2 = Number.isFinite(i), r2 = Number.isFinite(n);
  return e2 && r2 ? t(i, n) : e2 || r2 ? e2 ? i : n : s;
}
var mt = class _mt {
  constructor(t, i) {
    this.Ke = t, this.Ge = i;
  }
  Ze(t) {
    return null !== t && (this.Ke === t.Ke && this.Ge === t.Ge);
  }
  Xe() {
    return new _mt(this.Ke, this.Ge);
  }
  Je() {
    return this.Ke;
  }
  Qe() {
    return this.Ge;
  }
  tr() {
    return this.Ge - this.Ke;
  }
  Zi() {
    return this.Ge === this.Ke || Number.isNaN(this.Ge) || Number.isNaN(this.Ke);
  }
  Ss(t) {
    return null === t ? this : new _mt(vt(Math.min, this.Je(), t.Je(), -1 / 0), vt(Math.max, this.Qe(), t.Qe(), 1 / 0));
  }
  ir(t) {
    if (!p(t)) return;
    if (0 === this.Ge - this.Ke) return;
    const i = 0.5 * (this.Ge + this.Ke);
    let n = this.Ge - i, s = this.Ke - i;
    n *= t, s *= t, this.Ge = i + n, this.Ke = i + s;
  }
  nr(t) {
    p(t) && (this.Ge += t, this.Ke += t);
  }
  sr() {
    return { minValue: this.Ke, maxValue: this.Ge };
  }
  static er(t) {
    return null === t ? null : new _mt(t.minValue, t.maxValue);
  }
};
var wt = class _wt {
  constructor(t, i) {
    this.rr = t, this.hr = i || null;
  }
  ar() {
    return this.rr;
  }
  lr() {
    return this.hr;
  }
  sr() {
    return { priceRange: null === this.rr ? null : this.rr.sr(), margins: this.hr || void 0 };
  }
  static er(t) {
    return null === t ? null : new _wt(mt.er(t.priceRange), t.margins);
  }
};
var Mt = [2, 4, 8, 16, 32, 64, 128, 256, 512];
var gt = "Custom series with conflation reducer must have a priceValueBuilder method";
var bt = class extends ot {
  constructor(t, i) {
    super(t), this._r = i;
  }
  oe() {
    const t = this.re;
    t.It = false;
    const i = this._r.N();
    if (!this.ae.It() || !i.lineVisible) return;
    const n = this._r.ur();
    null !== n && (t.It = true, t.ut = n, t.R = i.color, t.ct = i.lineWidth, t.Gt = i.lineStyle, t.te = this._r.N().id);
  }
};
var St = class extends H {
  constructor(t, i) {
    super(), this.Te = t, this._r = i;
  }
  Yi(t, i, n) {
    t.It = false, i.It = false;
    const s = this._r.N(), e2 = s.axisLabelVisible, r2 = "" !== s.title, h2 = this.Te;
    if (!e2 || !h2.It()) return;
    const a2 = this._r.ur();
    if (null === a2) return;
    r2 && (i.ri = s.title, i.It = true), i.Ht = h2.Qt().Ut(a2 / h2.Ft().$t()), t.ri = this.cr(s.price), t.It = true;
    const l2 = this.Te.Qt().Xi().G(s.axisLabelColor || s.color);
    n.Z = l2.Z;
    const o2 = s.axisLabelTextColor || l2.X;
    t.R = o2, i.R = o2, n.Ei = a2;
  }
  cr(t) {
    const i = this.Te.Lt();
    return null === i ? "" : this.Te.Ft().Ji(t, i.Wt);
  }
};
var xt = class {
  constructor(t, i) {
    this.Te = t, this.yn = i, this.dr = new bt(t, this), this.qs = new St(t, this), this.pr = new at(this.qs, t, t.Qt());
  }
  vr(t) {
    f(this.yn, t), this.Pt(), this.Te.Qt().mr();
  }
  N() {
    return this.yn;
  }
  wr() {
    return this.dr;
  }
  Mr() {
    return this.pr;
  }
  gr() {
    return this.qs;
  }
  Pt() {
    this.dr.Pt(), this.qs.Pt();
  }
  ur() {
    const t = this.Te, i = t.Ft();
    if (t.Qt().Et().Zi() || i.Zi()) return null;
    const n = t.Lt();
    return null === n ? null : i.Nt(this.yn.price, n.Wt);
  }
};
var Ct = class {
  constructor() {
    this.br = /* @__PURE__ */ new WeakMap();
  }
  Sr(t, i, n) {
    const s = 1 / i * n;
    if (t >= s) return 1;
    const e2 = s / t, r2 = Math.pow(2, Math.floor(Math.log2(e2)));
    return Math.min(r2, 512);
  }
  Cr(t, i, n, s = false, e2) {
    if (0 === t.length || i <= 1) return t;
    const r2 = this.yr(i);
    if (r2 <= 1) return t;
    const h2 = this.Pr(t);
    let a2 = h2.kr.get(r2);
    return void 0 !== a2 || (a2 = this.Tr(t, r2, n, s, e2, h2.kr), h2.kr.set(r2, a2)), a2;
  }
  Rr(t, i, n, s, e2 = false, r2) {
    if (n < 1 || 0 === t.length) return t;
    const h2 = this.Pr(t), a2 = h2.kr.get(n);
    if (!a2) return this.Cr(t, n, s, e2, r2);
    const l2 = this.Dr(t, i, n, a2, e2, s, r2);
    return h2.kr.set(n, l2), l2;
  }
  yr(t) {
    if (t <= 2) return 2;
    for (const i of Mt) if (t <= i) return i;
    return 512;
  }
  Ir(t) {
    if (0 === t.length) return 0;
    const i = t[0], n = t[t.length - 1];
    return 31 * t.length + 17 * i.$n + 13 * n.$n;
  }
  Tr(t, i, n, s = false, e2, r2 = /* @__PURE__ */ new Map()) {
    if (2 === i) return this.Vr(t, 2, n, s, e2);
    const h2 = i / 2;
    let a2 = r2.get(h2);
    return a2 || (a2 = this.Tr(t, h2, n, s, e2, r2), r2.set(h2, a2)), this.Br(a2, n, s, e2);
  }
  Vr(t, i, n, s = false, e2) {
    const r2 = this.Er(t, i, n, s, e2);
    return this.Ar(r2, s);
  }
  Br(t, i, n = false, s) {
    const e2 = this.Er(t, 2, i, n, s);
    return this.Ar(e2, n);
  }
  Er(t, i, n, s = false, e2) {
    const r2 = [];
    for (let h2 = 0; h2 < t.length; h2 += i) {
      if (t.length - h2 >= i) {
        const i2 = this.Lr(t[h2], t[h2 + 1], n, s, e2);
        i2.zr = false, r2.push(i2);
      } else if (0 === r2.length) r2.push(this.Or(t[h2], true));
      else {
        const i2 = r2[r2.length - 1];
        r2[r2.length - 1] = this.Nr(i2, t[h2], n, s, e2);
      }
    }
    return r2;
  }
  Fr(t, i) {
    return (t ?? 1) + (i ?? 1);
  }
  Lr(t, i, n, s = false, e2) {
    if (!s || !n || !e2) {
      const n2 = t.Wt[1] > i.Wt[1] ? t.Wt[1] : i.Wt[1], s2 = t.Wt[2] < i.Wt[2] ? t.Wt[2] : i.Wt[2];
      return { Wr: t.$n, Hr: i.$n, Ur: t.wt, $r: i.wt, jr: t.Wt[0], qr: n2, Yr: s2, Kr: i.Wt[3], Gr: this.Fr(t.Gr, i.Gr), Zr: void 0, zr: false };
    }
    const r2 = n(this.Xr(t, e2), this.Xr(i, e2)), h2 = e2(r2), a2 = h2.length ? h2[h2.length - 1] : 0;
    return { Wr: t.$n, Hr: i.$n, Ur: t.wt, $r: i.wt, jr: t.Wt[0], qr: Math.max(t.Wt[1], a2), Yr: Math.min(t.Wt[2], a2), Kr: a2, Gr: this.Fr(t.Gr, i.Gr), Zr: r2, zr: false };
  }
  Nr(t, i, n, s = false, e2) {
    if (!s || !n || !e2) return { Wr: t.Wr, Hr: i.$n, Ur: t.Ur, $r: i.wt, jr: t.jr, qr: t.qr > i.Wt[1] ? t.qr : i.Wt[1], Yr: t.Yr < i.Wt[2] ? t.Yr : i.Wt[2], Kr: i.Wt[3], Gr: t.Gr + (i.Gr ?? 1), Zr: t.Zr, zr: false };
    const r2 = t.Zr, h2 = this.Xr(i, e2), a2 = r2 ? { data: r2, index: t.Wr, originalTime: t.Ur, time: t.Ur, priceValues: e2(r2) } : null, l2 = a2 ? n(a2, h2) : h2.data, o2 = a2 ? e2(l2) : h2.priceValues, _2 = o2.length ? o2[o2.length - 1] : 0;
    return { Wr: t.Wr, Hr: i.$n, Ur: t.Ur, $r: i.wt, jr: t.jr, qr: Math.max(t.qr, _2), Yr: Math.min(t.Yr, _2), Kr: _2, Gr: t.Gr + (i.Gr ?? 1), Zr: l2, zr: false };
  }
  Jr(t, i, n, s, e2, r2, h2 = false, a2) {
    const l2 = i === s ? e2 : t[i];
    if (n - i == 1) return this.Or(l2, true);
    const o2 = i + 1 === s ? e2 : t[i + 1];
    let _2 = this.Lr(l2, o2, r2, h2, a2);
    for (let l3 = i + 2; l3 < n; l3++) {
      const i2 = l3 === s ? e2 : t[l3];
      _2 = this.Nr(_2, i2, r2, h2, a2);
    }
    return _2;
  }
  Xr(t, i) {
    const n = t.ue ?? {};
    return { data: t.ue, index: t.$n, originalTime: t.Qr, time: t.wt, priceValues: i(n) };
  }
  th(t, i = false) {
    const n = true === i, s = !!t.Zr;
    return { ...{ $n: t.Wr, wt: t.Ur, Qr: t.Ur, Wt: [n ? t.Kr : t.jr, t.qr, t.Yr, t.Kr], Gr: t.Gr }, ue: n ? s ? t.Zr : { wt: t.Ur } : void 0 };
  }
  Ar(t, i = false) {
    return t.map(((t2) => this.th(t2, i)));
  }
  Dr(t, i, n, s, e2 = false, r2, h2) {
    if (0 === s.length) return s;
    const a2 = t.length - 1, l2 = Math.floor(a2 / n) * n;
    if (Math.min(l2 + n, t.length) - l2 < n && t.length > n) {
      const s2 = t.slice();
      return s2[s2.length - 1] = i, this.Cr(s2, n, r2, e2, h2);
    }
    if (Math.floor((a2 - 1) / n) === Math.floor(a2 / n) || 1 === s.length) {
      const o2 = Math.min(l2 + n, t.length), _2 = o2 - l2;
      if (_2 <= 0) return s;
      const u2 = 1 === _2 ? this.Or(l2 === a2 ? i : t[l2], true) : this.Jr(t, l2, o2, a2, i, r2, e2, h2);
      return s[s.length - 1] = this.th(u2, e2), s;
    }
    {
      const s2 = t.slice();
      return s2[s2.length - 1] = i, this.Cr(s2, n, r2, e2, h2);
    }
  }
  Or(t, i = false) {
    return { Wr: t.$n, Hr: t.$n, Ur: t.wt, $r: t.wt, jr: t.Wt[0], qr: t.Wt[1], Yr: t.Wt[2], Kr: t.Wt[3], Gr: t.Gr ?? 1, Zr: t.ue, zr: i };
  }
  Pr(t) {
    const i = this.ih(t), n = this.Ir(t);
    return i.nh !== n && (i.kr.clear(), i.nh = n), i;
  }
  ih(t) {
    let i = this.br.get(t);
    return void 0 === i && (i = { nh: this.Ir(t), kr: /* @__PURE__ */ new Map() }, this.br.set(t, i)), i;
  }
};
var yt = class extends Y {
  constructor(t) {
    super(), this.sn = t;
  }
  Qt() {
    return this.sn;
  }
};
var Pt = { Bar: (t, i, n, s) => {
  const e2 = i.upColor, r2 = i.downColor, h2 = u(t(n, s)), a2 = c(h2.Wt[0]) <= c(h2.Wt[3]);
  return { sh: h2.R ?? (a2 ? e2 : r2) };
}, Candlestick: (t, i, n, s) => {
  const e2 = i.upColor, r2 = i.downColor, h2 = i.borderUpColor, a2 = i.borderDownColor, l2 = i.wickUpColor, o2 = i.wickDownColor, _2 = u(t(n, s)), d2 = c(_2.Wt[0]) <= c(_2.Wt[3]);
  return { sh: _2.R ?? (d2 ? e2 : r2), eh: _2.Ht ?? (d2 ? h2 : a2), rh: _2.hh ?? (d2 ? l2 : o2) };
}, Custom: (t, i, n, s) => ({ sh: u(t(n, s)).R ?? i.color }), Area: (t, i, n, s) => {
  const e2 = u(t(n, s));
  return { sh: e2.vt ?? i.lineColor, vt: e2.vt ?? i.lineColor, ah: e2.ah ?? i.topColor, oh: e2.oh ?? i.bottomColor };
}, Baseline: (t, i, n, s) => {
  const e2 = u(t(n, s));
  return { sh: e2.Wt[3] >= i.baseValue.price ? i.topLineColor : i.bottomLineColor, _h: e2._h ?? i.topLineColor, uh: e2.uh ?? i.bottomLineColor, dh: e2.dh ?? i.topFillColor1, fh: e2.fh ?? i.topFillColor2, ph: e2.ph ?? i.bottomFillColor1, mh: e2.mh ?? i.bottomFillColor2 };
}, Line: (t, i, n, s) => {
  const e2 = u(t(n, s));
  return { sh: e2.R ?? i.color, vt: e2.R ?? i.color };
}, Histogram: (t, i, n, s) => ({ sh: u(t(n, s)).R ?? i.color }) };
var kt = class {
  constructor(t) {
    this.wh = (t2, i) => void 0 !== i ? i.Wt : this.Te.Un().Mh(t2), this.Te = t, this.gh = Pt[t.bh()];
  }
  Sh(t, i) {
    return this.gh(this.wh, this.Te.N(), t, i);
  }
};
function Tt(t, i, n, s, e2 = 0, r2 = i.length) {
  let h2 = r2 - e2;
  for (; 0 < h2; ) {
    const r3 = h2 >> 1, a2 = e2 + r3;
    s(i[a2], n) === t ? (e2 = a2 + 1, h2 -= r3 + 1) : h2 = r3;
  }
  return e2;
}
var Rt = Tt.bind(null, true);
var Dt = Tt.bind(null, false);
var It;
!(function(t) {
  t[t.NearestLeft = -1] = "NearestLeft", t[t.None = 0] = "None", t[t.NearestRight = 1] = "NearestRight";
})(It || (It = {}));
var Vt = 30;
var Bt = class {
  constructor() {
    this.xh = [], this.Ch = /* @__PURE__ */ new Map(), this.yh = /* @__PURE__ */ new Map(), this.Ph = [];
  }
  kh() {
    return this.Th() > 0 ? this.xh[this.xh.length - 1] : null;
  }
  Rh() {
    return this.Th() > 0 ? this.Dh(0) : null;
  }
  Qn() {
    return this.Th() > 0 ? this.Dh(this.xh.length - 1) : null;
  }
  Th() {
    return this.xh.length;
  }
  Zi() {
    return 0 === this.Th();
  }
  ze(t) {
    return null !== this.Ih(t, 0);
  }
  Mh(t) {
    return this.Hn(t);
  }
  Hn(t, i = 0) {
    const n = this.Ih(t, i);
    return null === n ? null : { ...this.Vh(n), $n: this.Dh(n) };
  }
  Bh() {
    return this.xh;
  }
  Eh(t, i, n) {
    if (this.Zi()) return null;
    let s = null;
    for (const e2 of n) {
      s = Et(s, this.Ah(t, i, e2));
    }
    return s;
  }
  ht(t) {
    this.yh.clear(), this.Ch.clear(), this.xh = t, this.Ph = t.map(((t2) => t2.$n));
  }
  Lh() {
    return this.Ph;
  }
  Dh(t) {
    return this.xh[t].$n;
  }
  Vh(t) {
    return this.xh[t];
  }
  Ih(t, i) {
    const n = this.zh(t);
    if (null === n && 0 !== i) switch (i) {
      case -1:
        return this.Oh(t);
      case 1:
        return this.Nh(t);
      default:
        throw new TypeError("Unknown search mode");
    }
    return n;
  }
  Oh(t) {
    let i = this.Fh(t);
    return i > 0 && (i -= 1), i !== this.xh.length && this.Dh(i) < t ? i : null;
  }
  Nh(t) {
    const i = this.Wh(t);
    return i !== this.xh.length && t < this.Dh(i) ? i : null;
  }
  zh(t) {
    const i = this.Fh(t);
    return i === this.xh.length || t < this.xh[i].$n ? null : i;
  }
  Fh(t) {
    return Rt(this.xh, t, ((t2, i) => t2.$n < i));
  }
  Wh(t) {
    return Dt(this.xh, t, ((t2, i) => t2.$n > i));
  }
  Hh(t, i, n) {
    let s = null;
    for (let e2 = t; e2 < i; e2++) {
      const t2 = this.xh[e2].Wt[n];
      Number.isNaN(t2) || (null === s ? s = { Uh: t2, $h: t2 } : (t2 < s.Uh && (s.Uh = t2), t2 > s.$h && (s.$h = t2)));
    }
    return s;
  }
  Ah(t, i, n) {
    if (this.Zi()) return null;
    let s = null;
    const e2 = u(this.Rh()), r2 = u(this.Qn()), h2 = Math.max(t, e2), a2 = Math.min(i, r2), l2 = Math.ceil(h2 / Vt) * Vt, o2 = Math.max(l2, Math.floor(a2 / Vt) * Vt);
    {
      const t2 = this.Fh(h2), e3 = this.Wh(Math.min(a2, l2, i));
      s = Et(s, this.Hh(t2, e3, n));
    }
    let _2 = this.Ch.get(n);
    void 0 === _2 && (_2 = /* @__PURE__ */ new Map(), this.Ch.set(n, _2));
    for (let t2 = Math.max(l2 + 1, h2); t2 < o2; t2 += Vt) {
      const i2 = Math.floor(t2 / Vt);
      let e3 = _2.get(i2);
      if (void 0 === e3) {
        const t3 = this.Fh(i2 * Vt), s2 = this.Wh((i2 + 1) * Vt - 1);
        e3 = this.Hh(t3, s2, n), _2.set(i2, e3);
      }
      s = Et(s, e3);
    }
    {
      const t2 = this.Fh(o2), i2 = this.Wh(a2);
      s = Et(s, this.Hh(t2, i2, n));
    }
    return s;
  }
};
function Et(t, i) {
  if (null === t) return i;
  if (null === i) return t;
  return { Uh: Math.min(t.Uh, i.Uh), $h: Math.max(t.$h, i.$h) };
}
function At() {
  return new Bt();
}
var Lt = { setLineStyle: a };
var zt = class {
  constructor(t) {
    this.jh = t;
  }
  st(t, i, n) {
    this.jh.draw(t, Lt);
  }
  qh(t, i, n) {
    this.jh.drawBackground?.(t, Lt);
  }
};
var Ot = class {
  constructor(t) {
    this.Ls = null, this.Yh = t;
  }
  Tt() {
    const t = this.Yh.renderer();
    if (null === t) return null;
    if (this.Ls?.Kh === t) return this.Ls.Gh;
    const i = new zt(t);
    return this.Ls = { Kh: t, Gh: i }, i;
  }
  Zh() {
    return this.Yh.zOrder?.() ?? "normal";
  }
};
var Nt = class {
  constructor(t) {
    this.Xh = null, this.Jh = t;
  }
  Qh() {
    return this.Jh;
  }
  Nn() {
    this.Jh.updateAllViews?.();
  }
  jn() {
    const t = this.Jh.paneViews?.() ?? [];
    if (this.Xh?.Kh === t) return this.Xh.Gh;
    const i = t.map(((t2) => new Ot(t2)));
    return this.Xh = { Kh: t, Gh: i }, i;
  }
  Qs(t, i) {
    return this.Jh.hitTest?.(t, i) ?? null;
  }
};
var Ft = class extends Nt {
  cn() {
    return [];
  }
};
var Wt = class {
  constructor(t) {
    this.jh = t;
  }
  st(t, i, n) {
    this.jh.draw(t, Lt);
  }
  qh(t, i, n) {
    this.jh.drawBackground?.(t, Lt);
  }
};
var Ht = class {
  constructor(t) {
    this.Ls = null, this.Yh = t;
  }
  Tt() {
    const t = this.Yh.renderer();
    if (null === t) return null;
    if (this.Ls?.Kh === t) return this.Ls.Gh;
    const i = new Wt(t);
    return this.Ls = { Kh: t, Gh: i }, i;
  }
  Zh() {
    return this.Yh.zOrder?.() ?? "normal";
  }
};
function Ut(t) {
  return { ri: t.text(), Ei: t.coordinate(), Vi: t.fixedCoordinate?.(), R: t.textColor(), Z: t.backColor(), It: t.visible?.() ?? true, pi: t.tickVisible?.() ?? true };
}
var $t = class {
  constructor(t, i) {
    this.Xt = new j(), this.ta = t, this.ia = i;
  }
  Tt() {
    return this.Xt.ht({ nn: this.ia.nn(), ...Ut(this.ta) }), this.Xt;
  }
};
var jt = class extends H {
  constructor(t, i) {
    super(), this.ta = t, this.Ki = i;
  }
  Yi(t, i, n) {
    const s = Ut(this.ta);
    n.Z = s.Z, t.R = s.R;
    const e2 = 2 / 12 * this.Ki.P();
    n.Ti = e2, n.Ri = e2, n.Ei = s.Ei, n.Vi = s.Vi, t.ri = s.ri, t.It = s.It, t.pi = s.pi;
  }
};
var qt = class extends Nt {
  constructor(t, i) {
    super(t), this.na = null, this.sa = null, this.ea = null, this.ra = null, this.Te = i;
  }
  dn() {
    const t = this.Jh.timeAxisViews?.() ?? [];
    if (this.na?.Kh === t) return this.na.Gh;
    const i = this.Te.Qt().Et(), n = t.map(((t2) => new $t(t2, i)));
    return this.na = { Kh: t, Gh: n }, n;
  }
  qn() {
    const t = this.Jh.priceAxisViews?.() ?? [];
    if (this.sa?.Kh === t) return this.sa.Gh;
    const i = this.Te.Ft(), n = t.map(((t2) => new jt(t2, i)));
    return this.sa = { Kh: t, Gh: n }, n;
  }
  ha() {
    const t = this.Jh.priceAxisPaneViews?.() ?? [];
    if (this.ea?.Kh === t) return this.ea.Gh;
    const i = t.map(((t2) => new Ht(t2)));
    return this.ea = { Kh: t, Gh: i }, i;
  }
  aa() {
    const t = this.Jh.timeAxisPaneViews?.() ?? [];
    if (this.ra?.Kh === t) return this.ra.Gh;
    const i = t.map(((t2) => new Ht(t2)));
    return this.ra = { Kh: t, Gh: i }, i;
  }
  la(t, i) {
    return this.Jh.autoscaleInfo?.(t, i) ?? null;
  }
};
function Yt(t, i, n, s) {
  t.forEach(((t2) => {
    i(t2).forEach(((t3) => {
      t3.Zh() === n && s.push(t3);
    }));
  }));
}
function Kt(t) {
  return t.jn();
}
function Gt(t) {
  return t.ha();
}
function Zt(t) {
  return t.aa();
}
var Xt = ["Area", "Line", "Baseline"];
var Jt = class extends yt {
  constructor(t, i, n, s, e2) {
    super(t), this.qt = At(), this.dr = new ft(this), this.oa = [], this._a = new _t(this), this.ua = null, this.ca = null, this.da = null, this.fa = [], this.pa = new Ct(), this.va = /* @__PURE__ */ new Map(), this.ma = null, this.yn = n, this.wa = i;
    const r2 = new pt(this);
    if (this.mn = [r2], this.pr = new at(r2, this, t), Xt.includes(this.wa) && (this.ua = new dt(this)), this.Ma(), this.Yh = s(this, this.Qt(), e2), "Custom" === this.wa) {
      const t2 = this.Yh;
      t2.ga && this.ba(t2.ga);
    }
  }
  m() {
    null !== this.da && clearTimeout(this.da);
  }
  We(t) {
    return this.yn.priceLineColor || t;
  }
  Ae(t) {
    const i = { Le: true }, n = this.Ft();
    if (this.Qt().Et().Zi() || n.Zi() || this.qt.Zi()) return i;
    const s = this.Qt().Et().Ee(), e2 = this.Lt();
    if (null === s || null === e2) return i;
    let r2, h2;
    if (t) {
      const t2 = this.qt.kh();
      if (null === t2) return i;
      r2 = t2, h2 = t2.$n;
    } else {
      const t2 = this.qt.Hn(s.bi(), -1);
      if (null === t2) return i;
      if (r2 = this.qt.Mh(t2.$n), null === r2) return i;
      h2 = t2.$n;
    }
    const a2 = r2.Wt[3], l2 = this.Sa().Sh(h2, { Wt: r2 }), o2 = n.Nt(a2, e2.Wt);
    return { Le: false, Mt: a2, ri: n.Ji(a2, e2.Wt), qe: n.xa(a2), Ye: n.Ca(a2, e2.Wt), R: l2.sh, Ei: o2, $n: h2 };
  }
  Sa() {
    return null !== this.ca || (this.ca = new kt(this)), this.ca;
  }
  N() {
    return this.yn;
  }
  vr(t) {
    const i = this.Qt(), { priceScaleId: n, visible: s, priceFormat: e2 } = t;
    void 0 !== n && n !== this.yn.priceScaleId && i.ya(this, n), void 0 !== s && s !== this.yn.visible && i.Pa();
    const r2 = void 0 !== t.conflationThresholdFactor;
    f(this.yn, t), Object.prototype.hasOwnProperty.call(t, "autoscaleInfoProvider") && void 0 === t.autoscaleInfoProvider && (this.yn.autoscaleInfoProvider = void 0), r2 && (this.va.clear(), this.Qt().mr()), void 0 !== e2 && (this.Ma(), i.ka()), i.Ta(this), i.Ra(), this.Yh.Pt("options");
  }
  ht(t, i) {
    this.qt.ht(t), this.va.clear();
    const n = this.Qt().Et().N();
    n.enableConflation && n.precomputeConflationOnInit && this.Da(n.precomputeConflationPriority), this.Ia(), null !== this.ua && (i && i.Va ? this.ua.De() : 0 === t.length && this.ua.Re());
    const s = this.Qt().Ks(this);
    this.Qt().Ba(s), this.Qt().Ta(this), this.Qt().Ra(), this.Qt().mr();
  }
  Ia() {
    this.Yh.Pt("data");
  }
  Ea(t) {
    const i = new xt(this, t);
    return this.oa.push(i), this.Qt().Ta(this), i;
  }
  Aa(t) {
    const i = this.oa.indexOf(t);
    -1 !== i && this.oa.splice(i, 1), this.Qt().Ta(this);
  }
  La() {
    return this.oa;
  }
  bh() {
    return this.wa;
  }
  Lt() {
    const t = this.za();
    return null === t ? null : { Wt: t.Wt[3], Oa: t.wt };
  }
  za() {
    const t = this.Qt().Et().Ee();
    if (null === t) return null;
    const i = t.Na();
    return this.qt.Hn(i, 1);
  }
  Un() {
    return this.qt;
  }
  ba(t) {
    this.ma = t, this.va.clear();
  }
  Fa() {
    return !!this.Qt().Et().N().enableConflation && this.Wa() > 1;
  }
  Rr(t) {
    if (!this.Fa()) return;
    const i = this.Wa();
    if (!this.va.has(i)) return;
    const n = "Custom" === this.wa, s = n && this.ma || void 0, e2 = n && this.Yh.Ha ? (t2) => {
      const i2 = t2, n2 = this.Yh.Ha(i2);
      return Array.isArray(n2) ? n2 : ["number" == typeof n2 ? n2 : 0];
    } : void 0, r2 = this.pa.Rr(this.qt.Bh(), t, i, s, n, e2), h2 = At();
    h2.ht(r2), this.va.set(i, h2);
  }
  Ua() {
    const t = this.Qt().Et().N().enableConflation;
    if ("Custom" === this.wa && null === this.ma) return this.qt;
    if (!t) return this.qt;
    const i = this.Wa(), n = this.va.get(i);
    if (n) return n;
    this.$a(i);
    return this.va.get(i) ?? this.qt;
  }
  ja(t) {
    const i = this.qt.Mh(t);
    return null === i ? null : "Bar" === this.wa || "Candlestick" === this.wa || "Custom" === this.wa ? { jr: i.Wt[0], qr: i.Wt[1], Yr: i.Wt[2], Kr: i.Wt[3] } : i.Wt[3];
  }
  qa(t) {
    const i = [];
    Yt(this.fa, Kt, "top", i);
    const n = this.ua;
    return null !== n && n.It() ? (null === this.da && n.Ve() && (this.da = setTimeout((() => {
      this.da = null, this.Qt().Ya();
    }), 0)), n.Ie(), i.unshift(n), i) : i;
  }
  jn() {
    const t = [];
    this.Ka() || t.push(this._a), t.push(this.Yh, this.dr);
    const i = this.oa.map(((t2) => t2.wr()));
    return t.push(...i), Yt(this.fa, Kt, "normal", t), t;
  }
  Ga() {
    const t = this.Yh.Ga?.() ?? null;
    if (null === t) return null;
    const i = [];
    this.Ka() || i.push(this._a), i.push(...t.Za), Yt(this.fa, Kt, "normal", i);
    const n = [];
    n.push(...t.qa, this.dr);
    const s = this.oa.map(((t2) => t2.wr()));
    return n.push(...s), { Za: i, qa: n };
  }
  Xa() {
    return this.Ja(Kt, "bottom");
  }
  Qa(t) {
    return this.Ja(Gt, t);
  }
  tl(t) {
    return this.Ja(Zt, t);
  }
  il(t, i) {
    return this.fa.map(((n) => n.Qs(t, i))).filter(((t2) => null !== t2));
  }
  cn() {
    return [this.pr, ...this.oa.map(((t) => t.Mr()))];
  }
  qn(t, i) {
    if (i !== this.hn && !this.Ka()) return [];
    const n = [...this.mn];
    for (const t2 of this.oa) n.push(t2.gr());
    return this.fa.forEach(((t2) => {
      n.push(...t2.qn());
    })), n;
  }
  dn() {
    const t = [];
    return this.fa.forEach(((i) => {
      t.push(...i.dn());
    })), t;
  }
  la(t, i) {
    if (void 0 !== this.yn.autoscaleInfoProvider) {
      const n = this.yn.autoscaleInfoProvider((() => {
        const n2 = this.nl(t, i);
        return null === n2 ? null : n2.sr();
      }));
      return wt.er(n);
    }
    return this.nl(t, i);
  }
  Kh() {
    const t = this.yn.priceFormat;
    return t.base ?? 1 / t.minMove;
  }
  sl() {
    return this.el;
  }
  Nn() {
    this.Yh.Pt();
    for (const t of this.mn) t.Pt();
    for (const t of this.oa) t.Pt();
    this.dr.Pt(), this._a.Pt(), this.ua?.Pt(), this.fa.forEach(((t) => t.Nn()));
  }
  Ft() {
    return u(super.Ft());
  }
  At(t) {
    if (!(("Line" === this.wa || "Area" === this.wa || "Baseline" === this.wa) && this.yn.crosshairMarkerVisible)) return null;
    const i = this.qt.Mh(t);
    if (null === i) return null;
    return { Mt: i.Wt[3], ft: this.rl(), Ht: this.hl(), Ot: this.al(), zt: this.ll(t) };
  }
  He() {
    return this.yn.title;
  }
  It() {
    return this.yn.visible;
  }
  ol(t) {
    this.fa.push(new qt(t, this));
  }
  _l(t) {
    this.fa = this.fa.filter(((i) => i.Qh() !== t));
  }
  ul() {
    if ("Custom" === this.wa) return (t) => this.Yh.Ha(t);
  }
  cl() {
    if ("Custom" === this.wa) return (t) => this.Yh.dl(t);
  }
  fl() {
    return this.qt.Lh();
  }
  Ka() {
    return !Z(this.Ft().pl());
  }
  nl(t, i) {
    if (!v(t) || !v(i) || this.qt.Zi()) return null;
    const n = "Line" === this.wa || "Area" === this.wa || "Baseline" === this.wa || "Histogram" === this.wa ? [3] : [2, 1], s = this.qt.Eh(t, i, n);
    let e2 = null !== s ? new mt(s.Uh, s.$h) : null, r2 = null;
    if ("Histogram" === this.bh()) {
      const t2 = this.yn.base, i2 = new mt(t2, t2);
      e2 = null !== e2 ? e2.Ss(i2) : i2;
    }
    return this.fa.forEach(((n2) => {
      const s2 = n2.la(t, i);
      if (s2?.priceRange) {
        const t2 = new mt(s2.priceRange.minValue, s2.priceRange.maxValue);
        e2 = null !== e2 ? e2.Ss(t2) : t2;
      }
      s2?.margins && (r2 = s2.margins);
    })), new wt(e2, r2);
  }
  rl() {
    switch (this.wa) {
      case "Line":
      case "Area":
      case "Baseline":
        return this.yn.crosshairMarkerRadius;
    }
    return 0;
  }
  hl() {
    switch (this.wa) {
      case "Line":
      case "Area":
      case "Baseline": {
        const t = this.yn.crosshairMarkerBorderColor;
        if (0 !== t.length) return t;
      }
    }
    return null;
  }
  al() {
    switch (this.wa) {
      case "Line":
      case "Area":
      case "Baseline":
        return this.yn.crosshairMarkerBorderWidth;
    }
    return 0;
  }
  ll(t) {
    switch (this.wa) {
      case "Line":
      case "Area":
      case "Baseline": {
        const t2 = this.yn.crosshairMarkerBackgroundColor;
        if (0 !== t2.length) return t2;
      }
    }
    return this.Sa().Sh(t).sh;
  }
  Ma() {
    switch (this.yn.priceFormat.type) {
      case "custom": {
        const t = this.yn.priceFormat.formatter;
        this.el = { format: t, formatTickmarks: this.yn.priceFormat.tickmarksFormatter ?? ((i) => i.map(t)) };
        break;
      }
      case "volume":
        this.el = new st(this.yn.priceFormat.precision);
        break;
      case "percent":
        this.el = new nt(this.yn.priceFormat.precision);
        break;
      default: {
        const t = Math.pow(10, this.yn.priceFormat.precision);
        this.el = new it(t, this.yn.priceFormat.minMove * t);
      }
    }
    null !== this.hn && this.hn.vl();
  }
  Ja(t, i) {
    const n = [];
    return Yt(this.fa, t, i, n), n;
  }
  Wa() {
    const { ml: t, wl: i, Ml: n } = this.gl();
    return this.pa.Sr(t, i, n);
  }
  gl() {
    const t = this.Qt().Et(), i = t.ml(), n = window.devicePixelRatio || 1, s = t.N().conflationThresholdFactor;
    return { ml: i, wl: n, Ml: this.yn.conflationThresholdFactor ?? s ?? 1 };
  }
  bl(t) {
    const i = this.qt.Bh();
    let n;
    if ("Custom" === this.wa && null !== this.ma) {
      const s2 = this.ul();
      if (!s2) throw new Error(gt);
      n = this.pa.Cr(i, t, this.ma, true, ((t2) => s2(t2)));
    } else n = this.pa.Cr(i, t);
    const s = At();
    return s.ht(n), s;
  }
  $a(t) {
    const i = this.bl(t);
    this.va.set(t, i);
  }
  Da(t) {
    if ("Custom" === this.wa && (null === this.ma || !this.ul())) return;
    this.va.clear();
    const i = this.Qt().Et().Sl();
    for (const n of i) {
      const i2 = () => {
        this.xl(n);
      }, s = "object" == typeof window && window || "object" == typeof self && self;
      s?.yl?.Cl ? s.yl.Cl((() => {
        i2();
      }), { se: t }) : Promise.resolve().then((() => i2()));
    }
  }
  xl(t) {
    if (this.va.has(t)) return;
    if (0 === this.qt.Bh().length) return;
    const i = this.bl(t);
    this.va.set(t, i);
  }
};
var Qt = [3];
var ti = [0, 1, 2, 3];
var ii = class {
  constructor(t) {
    this.yn = t;
  }
  Pl(t, i, n) {
    let s = t;
    if (0 === this.yn.mode) return s;
    const e2 = n.kn(), r2 = e2.Lt();
    if (null === r2) return s;
    const h2 = e2.Nt(t, r2), a2 = n.kl().filter(((t2) => t2 instanceof Jt)).reduce(((t2, s2) => {
      if (n.Gs(s2) || !s2.It()) return t2;
      const e3 = s2.Ft(), r3 = s2.Un();
      if (e3.Zi() || !r3.ze(i)) return t2;
      const h3 = r3.Mh(i);
      if (null === h3) return t2;
      const a3 = c(s2.Lt()), l3 = 3 === this.yn.mode ? ti : Qt;
      return t2.concat(l3.map(((t3) => e3.Nt(h3.Wt[t3], a3.Wt))));
    }), []);
    if (0 === a2.length) return s;
    a2.sort(((t2, i2) => Math.abs(t2 - h2) - Math.abs(i2 - h2)));
    const l2 = a2[0];
    return s = e2.Tn(l2, r2), s;
  }
};
function ni(t, i, n) {
  return Math.min(Math.max(t, i), n);
}
function si(t, i, n) {
  return i - t <= n;
}
function ei(t) {
  const i = Math.ceil(t);
  return i % 2 == 0 ? i - 1 : i;
}
var ri = class extends R {
  constructor() {
    super(...arguments), this.qt = null;
  }
  ht(t) {
    this.qt = t;
  }
  et({ context: t, bitmapSize: i, horizontalPixelRatio: n, verticalPixelRatio: s }) {
    if (null === this.qt) return;
    const e2 = Math.max(1, Math.floor(n));
    t.lineWidth = e2, (function(t2, i2) {
      t2.save(), t2.lineWidth % 2 && t2.translate(0.5, 0.5), i2(), t2.restore();
    })(t, (() => {
      const r2 = u(this.qt);
      if (r2.Tl) {
        t.strokeStyle = r2.Rl, a(t, r2.Dl), t.beginPath();
        for (const s2 of r2.Il) {
          const r3 = Math.round(s2.Vl * n);
          t.moveTo(r3, -e2), t.lineTo(r3, i.height + e2);
        }
        t.stroke();
      }
      if (r2.Bl) {
        t.strokeStyle = r2.El, a(t, r2.Al), t.beginPath();
        for (const n2 of r2.Ll) {
          const r3 = Math.round(n2.Vl * s);
          t.moveTo(-e2, r3), t.lineTo(i.width + e2, r3);
        }
        t.stroke();
      }
    }));
  }
};
var hi = class {
  constructor(t) {
    this.Xt = new ri(), this.xt = true, this.yt = t;
  }
  Pt() {
    this.xt = true;
  }
  Tt() {
    if (this.xt) {
      const t = this.yt.Qt().N().grid, i = { Bl: t.horzLines.visible, Tl: t.vertLines.visible, El: t.horzLines.color, Rl: t.vertLines.color, Al: t.horzLines.style, Dl: t.vertLines.style, Ll: this.yt.kn().zl(), Il: (this.yt.Qt().Et().zl() || []).map(((t2) => ({ Vl: t2.coord }))) };
      this.Xt.ht(i), this.xt = false;
    }
    return this.Xt;
  }
};
var ai = class {
  constructor(t) {
    this.Yh = new hi(t);
  }
  wr() {
    return this.Yh;
  }
};
var li = { Ol: 4, Nl: 1e-4 };
function oi(t, i) {
  const n = 100 * (t - i) / i;
  return i < 0 ? -n : n;
}
function _i(t, i) {
  const n = oi(t.Je(), i), s = oi(t.Qe(), i);
  return new mt(n, s);
}
function ui(t, i) {
  const n = 100 * (t - i) / i + 100;
  return i < 0 ? -n : n;
}
function ci(t, i) {
  const n = ui(t.Je(), i), s = ui(t.Qe(), i);
  return new mt(n, s);
}
function di(t, i) {
  const n = Math.abs(t);
  if (n < 1e-15) return 0;
  const s = Math.log10(n + i.Nl) + i.Ol;
  return t < 0 ? -s : s;
}
function fi(t, i) {
  const n = Math.abs(t);
  if (n < 1e-15) return 0;
  const s = Math.pow(10, n - i.Ol) - i.Nl;
  return t < 0 ? -s : s;
}
function pi(t, i) {
  if (null === t) return null;
  const n = di(t.Je(), i), s = di(t.Qe(), i);
  return new mt(n, s);
}
function vi(t, i) {
  if (null === t) return null;
  const n = fi(t.Je(), i), s = fi(t.Qe(), i);
  return new mt(n, s);
}
function mi(t) {
  if (null === t) return li;
  const i = Math.abs(t.Qe() - t.Je());
  if (i >= 1 || i < 1e-15) return li;
  const n = Math.ceil(Math.abs(Math.log10(i))), s = li.Ol + n;
  return { Ol: s, Nl: 1 / Math.pow(10, s) };
}
var wi = class {
  constructor(t, i) {
    if (this.Fl = t, this.Wl = i, (function(t2) {
      if (t2 < 0) return false;
      if (t2 > 1e18) return true;
      for (let i2 = t2; i2 > 1; i2 /= 10) if (i2 % 10 != 0) return false;
      return true;
    })(this.Fl)) this.Hl = [2, 2.5, 2];
    else {
      this.Hl = [];
      for (let t2 = this.Fl; 1 !== t2; ) {
        if (t2 % 2 == 0) this.Hl.push(2), t2 /= 2;
        else {
          if (t2 % 5 != 0) throw new Error("unexpected base");
          this.Hl.push(2, 2.5), t2 /= 5;
        }
        if (this.Hl.length > 100) throw new Error("something wrong with base");
      }
    }
  }
  Ul(t, i, n) {
    const s = 0 === this.Fl ? 0 : 1 / this.Fl;
    let e2 = Math.pow(10, Math.max(0, Math.ceil(Math.log10(t - i)))), r2 = 0, h2 = this.Wl[0];
    for (; ; ) {
      const t2 = si(e2, s, 1e-14) && e2 > s + 1e-14, i2 = si(e2, n * h2, 1e-14), a3 = si(e2, 1, 1e-14);
      if (!(t2 && i2 && a3)) break;
      e2 /= h2, h2 = this.Wl[++r2 % this.Wl.length];
    }
    if (e2 <= s + 1e-14 && (e2 = s), e2 = Math.max(1, e2), this.Hl.length > 0 && (a2 = e2, l2 = 1, o2 = 1e-14, Math.abs(a2 - l2) < o2)) for (r2 = 0, h2 = this.Hl[0]; si(e2, n * h2, 1e-14) && e2 > s + 1e-14; ) e2 /= h2, h2 = this.Hl[++r2 % this.Hl.length];
    var a2, l2, o2;
    return e2;
  }
};
var Mi = class {
  constructor(t, i, n, s) {
    this.$l = [], this.Ki = t, this.Fl = i, this.jl = n, this.ql = s;
  }
  Ul(t, i) {
    if (t < i) throw new Error("high < low");
    const n = this.Ki.$t(), s = (t - i) * this.Yl() / n, e2 = new wi(this.Fl, [2, 2.5, 2]), r2 = new wi(this.Fl, [2, 2, 2.5]), h2 = new wi(this.Fl, [2.5, 2, 2]), a2 = [];
    return a2.push(e2.Ul(t, i, s), r2.Ul(t, i, s), h2.Ul(t, i, s)), (function(t2) {
      if (t2.length < 1) throw Error("array is empty");
      let i2 = t2[0];
      for (let n2 = 1; n2 < t2.length; ++n2) t2[n2] < i2 && (i2 = t2[n2]);
      return i2;
    })(a2);
  }
  Kl() {
    const t = this.Ki, i = t.Lt();
    if (null === i) return void (this.$l = []);
    const n = t.$t(), s = this.jl(n - 1, i), e2 = this.jl(0, i), r2 = this.Ki.N().entireTextOnly ? this.Gl() / 2 : 0, h2 = r2, a2 = n - 1 - r2, l2 = Math.max(s, e2), o2 = Math.min(s, e2);
    if (l2 === o2) return void (this.$l = []);
    const _2 = this.Ul(l2, o2);
    if (this.Zl(i, _2, l2, o2, h2, a2), t.Xl() && this.Jl(_2, o2, l2)) {
      const t2 = this.Ki.Ql();
      this.io(i, _2, h2, a2, t2, 2 * t2);
    }
    const u2 = this.$l.map(((t2) => t2.no)), c2 = this.Ki.so(u2);
    for (let t2 = 0; t2 < this.$l.length; t2++) this.$l[t2].eo = c2[t2];
  }
  zl() {
    return this.$l;
  }
  Gl() {
    return this.Ki.P();
  }
  Yl() {
    return Math.ceil(this.Gl() * this.Ki.N().tickMarkDensity);
  }
  Zl(t, i, n, s, e2, r2) {
    const h2 = this.$l, a2 = this.Ki;
    let l2 = n % i;
    l2 += l2 < 0 ? i : 0;
    const o2 = n >= s ? 1 : -1;
    let _2 = null, u2 = 0;
    for (let c2 = n - l2; c2 > s; c2 -= i) {
      const n2 = this.ql(c2, t, true);
      null !== _2 && Math.abs(n2 - _2) < this.Yl() || (n2 < e2 || n2 > r2 || (u2 < h2.length ? (h2[u2].Vl = n2, h2[u2].eo = a2.ro(c2), h2[u2].no = c2) : h2.push({ Vl: n2, eo: a2.ro(c2), no: c2 }), u2++, _2 = n2, a2.ho() && (i = this.Ul(c2 * o2, s))));
    }
    h2.length = u2;
  }
  io(t, i, n, s, e2, r2) {
    const h2 = this.$l, a2 = this.ao(t, n, e2, r2), l2 = this.ao(t, s, -r2, -e2), o2 = this.ql(0, t, true) - this.ql(i, t, true);
    h2.length > 0 && h2[0].Vl - a2.Vl < o2 / 2 && h2.shift(), h2.length > 0 && l2.Vl - h2[h2.length - 1].Vl < o2 / 2 && h2.pop(), h2.unshift(a2), h2.push(l2);
  }
  ao(t, i, n, s) {
    const e2 = (n + s) / 2, r2 = this.jl(i + n, t), h2 = this.jl(i + s, t), a2 = Math.min(r2, h2), l2 = Math.max(r2, h2), o2 = Math.max(0.1, this.Ul(l2, a2)), _2 = this.jl(i + e2, t), u2 = _2 - _2 % o2, c2 = this.ql(u2, t, true);
    return { eo: this.Ki.ro(u2), Vl: c2, no: u2 };
  }
  Jl(t, i, n) {
    let s = c(this.Ki.ar());
    return this.Ki.ho() && (s = vi(s, this.Ki.lo())), s.Je() - i < t && n - s.Qe() < t;
  }
};
function gi(t) {
  return t.slice().sort(((t2, i) => u(t2.ln()) - u(i.ln())));
}
var bi;
!(function(t) {
  t[t.Normal = 0] = "Normal", t[t.Logarithmic = 1] = "Logarithmic", t[t.Percentage = 2] = "Percentage", t[t.IndexedTo100 = 3] = "IndexedTo100";
})(bi || (bi = {}));
var Si = new nt();
var xi = new it(100, 1);
var Ci = class {
  constructor(t, i, n, s, e2) {
    this.oo = 0, this._o = null, this.rr = null, this.uo = null, this.co = { do: false, fo: null }, this.po = false, this.vo = 0, this.mo = 0, this.wo = new d(), this.Mo = new d(), this.bo = [], this.So = null, this.xo = null, this.Co = null, this.yo = null, this.Po = null, this.el = xi, this.ko = mi(null), this.To = t, this.yn = i, this.Ro = n, this.Do = s, this.Io = e2, this.Vo = new Mi(this, 100, this.Bo.bind(this), this.Eo.bind(this));
  }
  pl() {
    return this.To;
  }
  N() {
    return this.yn;
  }
  vr(t) {
    if (f(this.yn, t), this.vl(), void 0 !== t.mode && this.Ao({ _e: t.mode }), void 0 !== t.scaleMargins) {
      const i = _(t.scaleMargins.top), n = _(t.scaleMargins.bottom);
      if (i < 0 || i > 1) throw new Error(`Invalid top margin - expect value between 0 and 1, given=${i}`);
      if (n < 0 || n > 1) throw new Error(`Invalid bottom margin - expect value between 0 and 1, given=${n}`);
      if (i + n > 1) throw new Error(`Invalid margins - sum of margins must be less than 1, given=${i + n}`);
      this.Lo(), this.Co = null;
    }
  }
  zo() {
    return this.yn.autoScale;
  }
  Oo() {
    return this.po;
  }
  ho() {
    return 1 === this.yn.mode;
  }
  je() {
    return 2 === this.yn.mode;
  }
  No() {
    return 3 === this.yn.mode;
  }
  lo() {
    return this.ko;
  }
  _e() {
    return { hs: this.yn.autoScale, Fo: this.yn.invertScale, _e: this.yn.mode };
  }
  Ao(t) {
    const i = this._e();
    let n = null;
    void 0 !== t.hs && (this.yn.autoScale = t.hs), void 0 !== t._e && (this.yn.mode = t._e, 2 !== t._e && 3 !== t._e || (this.yn.autoScale = true), this.co.do = false), 1 === i._e && t._e !== i._e && (!(function(t2, i2) {
      if (null === t2) return false;
      const n2 = fi(t2.Je(), i2), s2 = fi(t2.Qe(), i2);
      return isFinite(n2) && isFinite(s2);
    })(this.rr, this.ko) ? this.yn.autoScale = true : (n = vi(this.rr, this.ko), null !== n && this.Wo(n))), 1 === t._e && t._e !== i._e && (n = pi(this.rr, this.ko), null !== n && this.Wo(n));
    const s = i._e !== this.yn.mode;
    s && (2 === i._e || this.je()) && this.vl(), s && (3 === i._e || this.No()) && this.vl(), void 0 !== t.Fo && i.Fo !== t.Fo && (this.yn.invertScale = t.Fo, this.Ho()), this.Mo.p(i, this._e());
  }
  Uo() {
    return this.Mo;
  }
  P() {
    return this.Ro.fontSize;
  }
  $t() {
    return this.oo;
  }
  $o(t) {
    this.oo !== t && (this.oo = t, this.Lo(), this.Co = null);
  }
  jo() {
    if (this._o) return this._o;
    const t = this.$t() - this.qo() - this.Yo();
    return this._o = t, t;
  }
  ar() {
    return this.Ko(), this.rr;
  }
  Wo(t, i) {
    const n = this.rr;
    (i || null === n && null !== t || null !== n && !n.Ze(t)) && (this.Co = null, this.rr = t);
  }
  Go(t) {
    this.Wo(t), this.Zo(null !== t);
  }
  Zi() {
    return this.Ko(), 0 === this.oo || !this.rr || this.rr.Zi();
  }
  Xo(t) {
    return this.Fo() ? t : this.$t() - 1 - t;
  }
  Nt(t, i) {
    return this.je() ? t = oi(t, i) : this.No() && (t = ui(t, i)), this.Eo(t, i);
  }
  Jo(t, i, n) {
    this.Ko();
    const s = this.Yo(), e2 = u(this.ar()), r2 = e2.Je(), h2 = e2.Qe(), a2 = this.jo() - 1, l2 = this.Fo(), o2 = a2 / (h2 - r2), _2 = void 0 === n ? 0 : n.from, c2 = void 0 === n ? t.length : n.to, d2 = this.Qo();
    for (let n2 = _2; n2 < c2; n2++) {
      const e3 = t[n2], h3 = e3.Mt;
      if (isNaN(h3)) continue;
      let a3 = h3;
      null !== d2 && (a3 = d2(e3.Mt, i));
      const _3 = s + o2 * (a3 - r2), u2 = l2 ? _3 : this.oo - 1 - _3;
      e3.ut = u2;
    }
  }
  t_(t, i, n) {
    this.Ko();
    const s = this.Yo(), e2 = u(this.ar()), r2 = e2.Je(), h2 = e2.Qe(), a2 = this.jo() - 1, l2 = this.Fo(), o2 = a2 / (h2 - r2), _2 = void 0 === n ? 0 : n.from, c2 = void 0 === n ? t.length : n.to, d2 = this.Qo();
    for (let n2 = _2; n2 < c2; n2++) {
      const e3 = t[n2];
      let h3 = e3.jr, a3 = e3.qr, _3 = e3.Yr, u2 = e3.Kr;
      null !== d2 && (h3 = d2(e3.jr, i), a3 = d2(e3.qr, i), _3 = d2(e3.Yr, i), u2 = d2(e3.Kr, i));
      let c3 = s + o2 * (h3 - r2), f2 = l2 ? c3 : this.oo - 1 - c3;
      e3.i_ = f2, c3 = s + o2 * (a3 - r2), f2 = l2 ? c3 : this.oo - 1 - c3, e3.n_ = f2, c3 = s + o2 * (_3 - r2), f2 = l2 ? c3 : this.oo - 1 - c3, e3.s_ = f2, c3 = s + o2 * (u2 - r2), f2 = l2 ? c3 : this.oo - 1 - c3, e3.e_ = f2;
    }
  }
  Tn(t, i) {
    const n = this.Bo(t, i);
    return this.r_(n, i);
  }
  r_(t, i) {
    let n = t;
    return this.je() ? n = (function(t2, i2) {
      return i2 < 0 && (t2 = -t2), t2 / 100 * i2 + i2;
    })(n, i) : this.No() && (n = (function(t2, i2) {
      return t2 -= 100, i2 < 0 && (t2 = -t2), t2 / 100 * i2 + i2;
    })(n, i)), n;
  }
  kl() {
    return this.bo;
  }
  Dt() {
    return this.xo || (this.xo = gi(this.bo)), this.xo;
  }
  h_(t) {
    -1 === this.bo.indexOf(t) && (this.bo.push(t), this.vl(), this.a_());
  }
  l_(t) {
    const i = this.bo.indexOf(t);
    if (-1 === i) throw new Error("source is not attached to scale");
    this.bo.splice(i, 1), 0 === this.bo.length && (this.Ao({ hs: true }), this.Wo(null)), this.vl(), this.a_();
  }
  Lt() {
    let t = null;
    for (const i of this.bo) {
      const n = i.Lt();
      null !== n && ((null === t || n.Oa < t.Oa) && (t = n));
    }
    return null === t ? null : t.Wt;
  }
  Fo() {
    return this.yn.invertScale;
  }
  zl() {
    const t = null === this.Lt();
    if (null !== this.Co && (t || this.Co.o_ === t)) return this.Co.zl;
    this.Vo.Kl();
    const i = this.Vo.zl();
    return this.Co = { zl: i, o_: t }, this.wo.p(), i;
  }
  __() {
    return this.wo;
  }
  u_(t) {
    this.je() || this.No() || null === this.yo && null === this.uo && (this.Zi() || (this.yo = this.oo - t, this.uo = u(this.ar()).Xe()));
  }
  c_(t) {
    if (this.je() || this.No()) return;
    if (null === this.yo) return;
    this.Ao({ hs: false }), (t = this.oo - t) < 0 && (t = 0);
    let i = (this.yo + 0.2 * (this.oo - 1)) / (t + 0.2 * (this.oo - 1));
    const n = u(this.uo).Xe();
    i = Math.max(i, 0.1), n.ir(i), this.Wo(n);
  }
  d_() {
    this.je() || this.No() || (this.yo = null, this.uo = null);
  }
  f_(t) {
    this.zo() || null === this.Po && null === this.uo && (this.Zi() || (this.Po = t, this.uo = u(this.ar()).Xe()));
  }
  p_(t) {
    if (this.zo()) return;
    if (null === this.Po) return;
    const i = u(this.ar()).tr() / (this.jo() - 1);
    let n = t - this.Po;
    this.Fo() && (n *= -1);
    const s = n * i, e2 = u(this.uo).Xe();
    e2.nr(s), this.Wo(e2, true), this.Co = null;
  }
  v_() {
    this.zo() || null !== this.Po && (this.Po = null, this.uo = null);
  }
  sl() {
    return this.el || this.vl(), this.el;
  }
  Ji(t, i) {
    switch (this.yn.mode) {
      case 2:
        return this.m_(oi(t, i));
      case 3:
        return this.sl().format(ui(t, i));
      default:
        return this.cr(t);
    }
  }
  ro(t) {
    switch (this.yn.mode) {
      case 2:
        return this.m_(t);
      case 3:
        return this.sl().format(t);
      default:
        return this.cr(t);
    }
  }
  so(t) {
    switch (this.yn.mode) {
      case 2:
        return this.w_(t);
      case 3:
        return this.sl().formatTickmarks(t);
      default:
        return this.M_(t);
    }
  }
  xa(t) {
    return this.cr(t, u(this.So).sl());
  }
  Ca(t, i) {
    return t = oi(t, i), this.m_(t, Si);
  }
  g_() {
    return this.bo;
  }
  b_(t) {
    this.co = { fo: t, do: false };
  }
  Nn() {
    this.bo.forEach(((t) => t.Nn()));
  }
  Xl() {
    return this.yn.ensureEdgeTickMarksVisible && this.zo();
  }
  Ql() {
    return this.P() / 2;
  }
  vl() {
    this.Co = null;
    let t = 1 / 0;
    this.So = null;
    for (const i2 of this.bo) i2.ln() < t && (t = i2.ln(), this.So = i2);
    let i = 100;
    null !== this.So && (i = Math.round(this.So.Kh())), this.el = xi, this.je() ? (this.el = Si, i = 100) : this.No() ? (this.el = new it(100, 1), i = 100) : null !== this.So && (this.el = this.So.sl()), this.Vo = new Mi(this, i, this.Bo.bind(this), this.Eo.bind(this)), this.Vo.Kl();
  }
  a_() {
    this.xo = null;
  }
  S_() {
    return null === this.So || this.je() || this.No() ? 1 : 1 / this.So.Kh();
  }
  Xi() {
    return this.Io;
  }
  Zo(t) {
    this.po = t;
  }
  qo() {
    return this.Fo() ? this.yn.scaleMargins.bottom * this.$t() + this.mo : this.yn.scaleMargins.top * this.$t() + this.vo;
  }
  Yo() {
    return this.Fo() ? this.yn.scaleMargins.top * this.$t() + this.vo : this.yn.scaleMargins.bottom * this.$t() + this.mo;
  }
  Ko() {
    this.co.do || (this.co.do = true, this.x_());
  }
  Lo() {
    this._o = null;
  }
  Eo(t, i) {
    if (this.Ko(), this.Zi()) return 0;
    t = this.ho() && t ? di(t, this.ko) : t;
    const n = u(this.ar()), s = this.Yo() + (this.jo() - 1) * (t - n.Je()) / n.tr();
    return this.Xo(s);
  }
  Bo(t, i) {
    if (this.Ko(), this.Zi()) return 0;
    const n = this.Xo(t), s = u(this.ar()), e2 = s.Je() + s.tr() * ((n - this.Yo()) / (this.jo() - 1));
    return this.ho() ? fi(e2, this.ko) : e2;
  }
  Ho() {
    this.Co = null, this.Vo.Kl();
  }
  x_() {
    if (this.Oo() && !this.zo()) return;
    const t = this.co.fo;
    if (null === t) return;
    let i = null;
    const n = this.g_();
    let s = 0, e2 = 0;
    for (const r3 of n) {
      if (!r3.It()) continue;
      const n2 = r3.Lt();
      if (null === n2) continue;
      const h3 = r3.la(t.Na(), t.bi());
      let a2 = h3 && h3.ar();
      if (null !== a2) {
        switch (this.yn.mode) {
          case 1:
            a2 = pi(a2, this.ko);
            break;
          case 2:
            a2 = _i(a2, n2.Wt);
            break;
          case 3:
            a2 = ci(a2, n2.Wt);
        }
        if (i = null === i ? a2 : i.Ss(u(a2)), null !== h3) {
          const t2 = h3.lr();
          null !== t2 && (s = Math.max(s, t2.above), e2 = Math.max(e2, t2.below));
        }
      }
    }
    if (this.Xl() && (s = Math.max(s, this.Ql()), e2 = Math.max(e2, this.Ql())), s === this.vo && e2 === this.mo || (this.vo = s, this.mo = e2, this.Co = null, this.Lo()), null !== i) {
      if (i.Je() === i.Qe()) {
        const t2 = 5 * this.S_();
        this.ho() && (i = vi(i, this.ko)), i = new mt(i.Je() - t2, i.Qe() + t2), this.ho() && (i = pi(i, this.ko));
      }
      if (this.ho()) {
        const t2 = vi(i, this.ko), n2 = mi(t2);
        if (r2 = n2, h2 = this.ko, r2.Ol !== h2.Ol || r2.Nl !== h2.Nl) {
          const s2 = null !== this.uo ? vi(this.uo, this.ko) : null;
          this.ko = n2, i = pi(t2, n2), null !== s2 && (this.uo = pi(s2, n2));
        }
      }
      this.Wo(i);
    } else null === this.rr && (this.Wo(new mt(-0.5, 0.5)), this.ko = mi(null));
    var r2, h2;
  }
  Qo() {
    return this.je() ? oi : this.No() ? ui : this.ho() ? (t) => di(t, this.ko) : null;
  }
  C_(t, i, n) {
    return void 0 === i ? (void 0 === n && (n = this.sl()), n.format(t)) : i(t);
  }
  y_(t, i, n) {
    return void 0 === i ? (void 0 === n && (n = this.sl()), n.formatTickmarks(t)) : i(t);
  }
  cr(t, i) {
    return this.C_(t, this.Do.priceFormatter, i);
  }
  M_(t, i) {
    const n = this.Do.priceFormatter;
    return this.y_(t, this.Do.tickmarksPriceFormatter ?? (n ? (t2) => t2.map(n) : void 0), i);
  }
  m_(t, i) {
    return this.C_(t, this.Do.percentageFormatter, i);
  }
  w_(t, i) {
    const n = this.Do.percentageFormatter;
    return this.y_(t, this.Do.tickmarksPercentageFormatter ?? (n ? (t2) => t2.map(n) : void 0), i);
  }
};
function yi(t) {
  return t instanceof Jt;
}
var Pi = class {
  constructor(t, i) {
    this.bo = [], this.P_ = /* @__PURE__ */ new Map(), this.oo = 0, this.k_ = 0, this.T_ = 1, this.xo = null, this.R_ = null, this.D_ = false, this.I_ = new d(), this.fa = [], this.ia = t, this.sn = i, this.V_ = new ai(this);
    const n = i.N();
    this.B_ = this.E_("left", n.leftPriceScale), this.A_ = this.E_("right", n.rightPriceScale), this.B_.Uo().i(this.L_.bind(this, this.B_), this), this.A_.Uo().i(this.L_.bind(this, this.A_), this), this.z_(n);
  }
  z_(t) {
    if (t.leftPriceScale && this.B_.vr(t.leftPriceScale), t.rightPriceScale && this.A_.vr(t.rightPriceScale), t.localization && (this.B_.vl(), this.A_.vl()), t.overlayPriceScales) {
      const i = Array.from(this.P_.values());
      for (const n of i) {
        const i2 = u(n[0].Ft());
        i2.vr(t.overlayPriceScales), t.localization && i2.vl();
      }
    }
  }
  O_(t) {
    switch (t) {
      case "left":
        return this.B_;
      case "right":
        return this.A_;
    }
    return this.P_.has(t) ? _(this.P_.get(t))[0].Ft() : null;
  }
  m() {
    this.Qt().N_().u(this), this.B_.Uo().u(this), this.A_.Uo().u(this), this.bo.forEach(((t) => {
      t.m && t.m();
    })), this.fa = this.fa.filter(((t) => {
      const i = t.Qh();
      return i.detached && i.detached(), false;
    })), this.I_.p();
  }
  F_() {
    return this.T_;
  }
  W_(t) {
    this.T_ = t;
  }
  Qt() {
    return this.sn;
  }
  nn() {
    return this.k_;
  }
  $t() {
    return this.oo;
  }
  H_(t) {
    this.k_ = t, this.U_();
  }
  $o(t) {
    this.oo = t, this.B_.$o(t), this.A_.$o(t), this.bo.forEach(((i) => {
      if (this.Gs(i)) {
        const n = i.Ft();
        null !== n && n.$o(t);
      }
    })), this.U_();
  }
  j_(t) {
    this.D_ = t;
  }
  q_() {
    return this.D_;
  }
  Y_() {
    return this.bo.filter(yi);
  }
  kl() {
    return this.bo;
  }
  Gs(t) {
    const i = t.Ft();
    return null === i || this.B_ !== i && this.A_ !== i;
  }
  h_(t, i, n) {
    this.K_(t, i, n ? t.ln() : this.bo.length);
  }
  l_(t, i) {
    const n = this.bo.indexOf(t);
    o(-1 !== n, "removeDataSource: invalid data source"), this.bo.splice(n, 1), i || this.bo.forEach(((t2, i2) => t2._n(i2)));
    const s = u(t.Ft()).pl();
    if (this.P_.has(s)) {
      const i2 = _(this.P_.get(s)), n2 = i2.indexOf(t);
      -1 !== n2 && (i2.splice(n2, 1), 0 === i2.length && this.P_.delete(s));
    }
    const e2 = t.Ft();
    e2 && e2.kl().indexOf(t) >= 0 && (e2.l_(t), this.G_(e2)), this.Z_();
  }
  Xs(t) {
    return t === this.B_ ? "left" : t === this.A_ ? "right" : "overlay";
  }
  X_() {
    return this.B_;
  }
  J_() {
    return this.A_;
  }
  Q_(t, i) {
    t.u_(i);
  }
  tu(t, i) {
    t.c_(i), this.U_();
  }
  iu(t) {
    t.d_();
  }
  nu(t, i) {
    t.f_(i);
  }
  su(t, i) {
    t.p_(i), this.U_();
  }
  eu(t) {
    t.v_();
  }
  U_() {
    this.bo.forEach(((t) => {
      t.Nn();
    }));
  }
  kn() {
    const [t, i] = this.ru();
    let n = null;
    return t.N().visible && 0 !== t.kl().length ? n = t : i.N().visible && 0 !== i.kl().length ? n = i : 0 !== this.bo.length && (n = this.bo[0].Ft()), null === n && (n = this.Zs() ?? t), n;
  }
  Zs() {
    const [t, i] = this.ru();
    return t.N().visible ? t : i.N().visible ? i : null;
  }
  G_(t) {
    null !== t && t.zo() && this.hu(t);
  }
  au(t) {
    const i = this.ia.Ee();
    t.Ao({ hs: true }), null !== i && t.b_(i), this.U_();
  }
  lu() {
    this.hu(this.B_), this.hu(this.A_);
  }
  ou() {
    this.G_(this.B_), this.G_(this.A_), this.bo.forEach(((t) => {
      this.Gs(t) && this.G_(t.Ft());
    })), this.U_(), this.sn.mr();
  }
  Dt() {
    return null === this.xo && (this.xo = gi(this.bo)), this.xo;
  }
  _u() {
    const t = this.Dt(), i = this.sn.cu()?.uu, n = this.sn.N().hoveredSeriesOnTop, s = this.R_;
    if (null !== s && s.Kh === t && s.du === i && s.fu === n) return s.pu;
    const e2 = (function(t2, i2, n2) {
      if (!n2) return t2;
      const s2 = t2.indexOf(i2);
      if (-1 === s2 || s2 === t2.length - 1) return t2;
      const e3 = [];
      for (let i3 = 0; i3 < t2.length; i3++) i3 !== s2 && e3.push(t2[i3]);
      return e3.push(t2[s2]), e3;
    })(t, i, n);
    return this.R_ = { Kh: t, du: i, fu: n, pu: e2 }, e2;
  }
  vu(t, i) {
    i = ni(i, 0, this.bo.length - 1);
    const n = this.bo.indexOf(t);
    o(-1 !== n, "setSeriesOrder: invalid data source"), this.bo.splice(n, 1), this.bo.splice(i, 0, t), this.bo.forEach(((t2, i2) => t2._n(i2))), this.Z_();
    for (const t2 of [this.B_, this.A_]) t2.a_(), t2.vl();
    this.sn.mr();
  }
  Vt() {
    return this.Dt().filter(yi);
  }
  mu() {
    return this.I_;
  }
  wu() {
    return this.V_;
  }
  ol(t) {
    this.fa.push(new Ft(t));
  }
  _l(t) {
    this.fa = this.fa.filter(((i) => i.Qh() !== t)), t.detached && t.detached(), this.sn.mr();
  }
  Mu() {
    return this.fa;
  }
  il(t, i) {
    return this.fa.map(((n) => n.Qs(t, i))).filter(((t2) => null !== t2));
  }
  hu(t) {
    const i = t.g_();
    if (i && i.length > 0 && !this.ia.Zi()) {
      const i2 = this.ia.Ee();
      null !== i2 && t.b_(i2);
    }
    t.Nn();
  }
  K_(t, i, n) {
    let s = this.O_(i);
    if (null === s && (s = this.E_(i, this.sn.N().overlayPriceScales)), this.bo.splice(n, 0, t), !Z(i)) {
      const n2 = this.P_.get(i) || [];
      n2.push(t), this.P_.set(i, n2);
    }
    t._n(n), s.h_(t), t.un(s), this.G_(s), this.Z_();
  }
  Z_() {
    this.xo = null, this.R_ = null;
  }
  ru() {
    return "left" === this.sn.N().defaultVisiblePriceScaleId ? [this.B_, this.A_] : [this.A_, this.B_];
  }
  L_(t, i, n) {
    i._e !== n._e && this.hu(t);
  }
  E_(t, i) {
    const n = { visible: true, autoScale: true, ...M(i) }, s = new Ci(t, n, this.sn.N().layout, this.sn.N().localization, this.sn.Xi());
    return s.$o(this.$t()), s;
  }
};
function ki(t, i) {
  return null === i || (2 === t.se && 2 !== i.se || (2 !== i.se || 2 === t.se) && (t.ne !== i.ne && t.ne < i.ne));
}
function Ti(t) {
  return { te: t.te, ie: t.ie };
}
function Ri(t) {
  return { ne: t.distance ?? 0, se: t.hitTestPriority ?? ("marker" === t.itemType ? 2 : 0), ee: t.itemType ?? "primitive", gu: t.cursorStyle, te: t.externalId };
}
function Di(t) {
  return { uu: t.uu, bu: Ti(t.Su), gu: t.Su.gu, ee: t.Su.ee ?? "primitive" };
}
function Ii(t, i, n, s) {
  let e2 = null;
  for (const r2 of t) {
    let t2 = r2.Qs?.(i, n, s) ?? null;
    if (null === t2) {
      const e3 = r2.Tt(s);
      t2 = null !== e3 && e3.Qs ? e3.Qs(i, n) : null;
    }
    if (null !== t2) {
      const i2 = { xu: r2, Su: t2 };
      (null === e2 || ki(i2.Su, e2.Su)) && (e2 = i2);
    }
  }
  return e2;
}
function Vi(t) {
  return void 0 !== t.jn;
}
function Bi(t, i, n) {
  const s = [t, ...t.Dt()].reverse(), e2 = (function(t2, i2, n2) {
    let s2, e3, r3;
    for (const l2 of t2) {
      const t3 = l2.il?.(i2, n2) ?? [];
      for (const i3 of t3) {
        const t4 = Ri(i3);
        h3 = i3.zOrder, a2 = s2?.zOrder, (!a2 || "top" === h3 && "top" !== a2 || "normal" === h3 && "bottom" === a2 || i3.zOrder === s2?.zOrder && void 0 !== e3 && ki(t4, e3) || i3.zOrder === s2?.zOrder && void 0 === e3) && (s2 = i3, e3 = t4, r3 = l2);
      }
    }
    var h3, a2;
    return s2 && r3 && e3 ? { Su: e3, Cu: s2, uu: r3 } : null;
  })(s, i, n);
  if ("top" === e2?.Cu.zOrder) return Di(e2);
  let r2 = null, h2 = null;
  for (const a2 of s) {
    if (e2 && e2.uu === a2 && "bottom" !== e2.Cu.zOrder && !e2.Cu.isBackground) return r2 ?? Di(e2);
    if (Vi(a2)) {
      const s2 = Ii(a2.jn(t), i, n, t);
      if (null !== s2) {
        const t2 = { uu: a2, xu: s2.xu, bu: Ti(s2.Su), gu: s2.Su.gu, ee: s2.Su.ee ?? "primitive" };
        (null === r2 || ki(s2.Su, h2)) && (r2 = t2, h2 = s2.Su);
      }
    }
    if (e2 && e2.uu === a2 && "bottom" !== e2.Cu.zOrder && e2.Cu.isBackground) return r2 ?? Di(e2);
  }
  return null !== r2 ? r2 : e2?.Cu ? Di(e2) : null;
}
var Ei = class {
  constructor(t, i, n = 50) {
    this.Vs = 0, this.Bs = 1, this.Es = 1, this.Ls = /* @__PURE__ */ new Map(), this.As = /* @__PURE__ */ new Map(), this.yu = t, this.Pu = i, this.zs = n;
  }
  ku(t) {
    const i = t.time, n = this.Pu.cacheKey(i), s = this.Ls.get(n);
    if (void 0 !== s) return s.Tu;
    if (this.Vs === this.zs) {
      const t2 = this.As.get(this.Es);
      this.As.delete(this.Es), this.Ls.delete(_(t2)), this.Es++, this.Vs--;
    }
    const e2 = this.yu(t);
    return this.Ls.set(n, { Tu: e2, Ws: this.Bs }), this.As.set(this.Bs, n), this.Vs++, this.Bs++, e2;
  }
};
var Ai = class {
  constructor(t, i) {
    o(t <= i, "right should be >= left"), this.Ru = t, this.Du = i;
  }
  Na() {
    return this.Ru;
  }
  bi() {
    return this.Du;
  }
  Iu() {
    return this.Du - this.Ru + 1;
  }
  ze(t) {
    return this.Ru <= t && t <= this.Du;
  }
  Ze(t) {
    return this.Ru === t.Na() && this.Du === t.bi();
  }
};
function Li(t, i) {
  return null === t || null === i ? t === i : t.Ze(i);
}
var zi = class {
  constructor() {
    this.Vu = /* @__PURE__ */ new Map(), this.Ls = null, this.Bu = false;
  }
  Eu(t) {
    this.Bu = t, this.Ls = null;
  }
  Au(t, i) {
    this.Lu(i), this.Ls = null;
    for (let n = i; n < t.length; ++n) {
      const i2 = t[n];
      let s = this.Vu.get(i2.timeWeight);
      void 0 === s && (s = [], this.Vu.set(i2.timeWeight, s)), s.push({ index: n, time: i2.time, weight: i2.timeWeight, originalTime: i2.originalTime });
    }
  }
  zu(t, i, n, s, e2) {
    const r2 = Math.ceil(i / t);
    return null !== this.Ls && this.Ls.Ou === r2 && e2 === this.Ls.Nu && n === this.Ls.Fu || (this.Ls = { Nu: e2, Fu: n, zl: this.Wu(r2, n, s), Ou: r2 }), this.Ls.zl;
  }
  Lu(t) {
    if (0 === t) return void this.Vu.clear();
    const i = [];
    this.Vu.forEach(((n, s) => {
      t <= n[0].index ? i.push(s) : n.splice(Rt(n, t, ((i2) => i2.index < t)), 1 / 0);
    }));
    for (const t2 of i) this.Vu.delete(t2);
  }
  Wu(t, i, n) {
    let s = [];
    const e2 = (t2) => !i || n.has(t2.index);
    for (const i2 of Array.from(this.Vu.keys()).sort(((t2, i3) => i3 - t2))) {
      if (!this.Vu.get(i2)) continue;
      const n2 = s;
      s = [];
      const r2 = n2.length;
      let h2 = 0;
      const a2 = _(this.Vu.get(i2)), l2 = a2.length;
      let o2 = 1 / 0, u2 = -1 / 0;
      for (let i3 = 0; i3 < l2; i3++) {
        const l3 = a2[i3], _2 = l3.index;
        for (; h2 < r2; ) {
          const t2 = n2[h2], i4 = t2.index;
          if (!(i4 < _2 && e2(t2))) {
            o2 = i4;
            break;
          }
          h2++, s.push(t2), u2 = i4, o2 = 1 / 0;
        }
        if (o2 - _2 >= t && _2 - u2 >= t && e2(l3)) s.push(l3), u2 = _2;
        else if (this.Bu) return n2;
      }
      for (; h2 < r2; h2++) e2(n2[h2]) && s.push(n2[h2]);
    }
    return s;
  }
};
var Oi = class _Oi {
  constructor(t) {
    this.Hu = t;
  }
  Uu() {
    return null === this.Hu ? null : new Ai(Math.floor(this.Hu.Na()), Math.ceil(this.Hu.bi()));
  }
  $u() {
    return this.Hu;
  }
  static ju() {
    return new _Oi(null);
  }
};
function Ni(t, i) {
  return t.weight > i.weight ? t : i;
}
var Fi = class {
  constructor(t, i, n, s) {
    this.k_ = 0, this.qu = null, this.Yu = [], this.Po = null, this.yo = null, this.Ku = new zi(), this.Gu = /* @__PURE__ */ new Map(), this.Zu = Oi.ju(), this.Xu = true, this.Ju = new d(), this.Qu = new d(), this.tc = new d(), this.nc = null, this.sc = null, this.ec = /* @__PURE__ */ new Map(), this.rc = -1, this.hc = [], this.ac = 1, this.yn = i, this.Do = n, this.lc = i.rightOffset, this.oc = i.barSpacing, this.sn = t, this._c(i), this.Pu = s, this.uc(), this.Ku.Eu(i.uniformDistribution), this.cc(), this.dc();
  }
  N() {
    return this.yn;
  }
  fc(t) {
    f(this.Do, t), this.vc(), this.uc();
  }
  vr(t, i) {
    f(this.yn, t), this.yn.fixLeftEdge && this.mc(), this.yn.fixRightEdge && this.wc(), void 0 !== t.barSpacing && this.sn.Ms(t.barSpacing), void 0 !== t.rightOffset && this.sn.gs(t.rightOffset), this._c(t), void 0 === t.minBarSpacing && void 0 === t.maxBarSpacing || this.sn.Ms(t.barSpacing ?? this.oc), void 0 !== t.ignoreWhitespaceIndices && t.ignoreWhitespaceIndices !== this.yn.ignoreWhitespaceIndices && this.dc(), this.vc(), this.uc(), void 0 === t.enableConflation && void 0 === t.conflationThresholdFactor || this.cc(), this.tc.p();
  }
  Rn(t) {
    return this.Yu[t]?.time ?? null;
  }
  en(t) {
    return this.Yu[t] ?? null;
  }
  Mc(t, i) {
    if (this.Yu.length < 1) return null;
    if (this.Pu.key(t) > this.Pu.key(this.Yu[this.Yu.length - 1].time)) return i ? this.Yu.length - 1 : null;
    const n = Rt(this.Yu, this.Pu.key(t), ((t2, i2) => this.Pu.key(t2.time) < i2));
    return this.Pu.key(t) < this.Pu.key(this.Yu[n].time) ? i ? n : null : n;
  }
  Zi() {
    return 0 === this.k_ || 0 === this.Yu.length || null === this.qu;
  }
  gc() {
    return this.Yu.length > 0;
  }
  Ee() {
    return this.bc(), this.Zu.Uu();
  }
  Sc() {
    return this.bc(), this.Zu.$u();
  }
  xc() {
    const t = this.Ee();
    if (null === t) return null;
    const i = { from: t.Na(), to: t.bi() };
    return this.Cc(i);
  }
  Cc(t) {
    const i = Math.round(t.from), n = Math.round(t.to), s = u(this.yc()), e2 = u(this.Pc());
    return { from: u(this.en(Math.max(s, i))), to: u(this.en(Math.min(e2, n))) };
  }
  kc(t) {
    return { from: u(this.Mc(t.from, true)), to: u(this.Mc(t.to, true)) };
  }
  nn() {
    return this.k_;
  }
  H_(t) {
    if (!isFinite(t) || t <= 0) return;
    if (this.k_ === t) return;
    const i = this.Sc(), n = this.k_;
    if (this.k_ = t, this.Xu = true, this.yn.lockVisibleTimeRangeOnResize && 0 !== n) {
      const i2 = this.oc * t / n;
      this.oc = i2;
    }
    if (this.yn.fixLeftEdge && null !== i && i.Na() <= 0) {
      const i2 = n - t;
      this.lc -= Math.round(i2 / this.oc) + 1, this.Xu = true;
    }
    this.Tc(), this.Rc();
  }
  jt(t) {
    if (this.Zi() || !v(t)) return 0;
    const i = this.Dc() + this.lc - t;
    return this.k_ - (i + 0.5) * this.oc - 1;
  }
  Ic(t, i) {
    const n = this.Dc(), s = void 0 === i ? 0 : i.from, e2 = void 0 === i ? t.length : i.to;
    for (let i2 = s; i2 < e2; i2++) {
      const s2 = t[i2].wt, e3 = n + this.lc - s2, r2 = this.k_ - (e3 + 0.5) * this.oc - 1;
      t[i2]._t = r2;
    }
  }
  Vc(t, i) {
    const n = Math.ceil(this.Bc(t));
    return i && this.yn.ignoreWhitespaceIndices && !this.Ec(n) ? this.Ac(n) : n;
  }
  gs(t) {
    this.Xu = true, this.lc = t, this.Rc(), this.sn.Lc(), this.sn.mr();
  }
  ml() {
    return this.oc;
  }
  Ms(t) {
    const i = this.oc;
    if (this.zc(t), void 0 !== this.yn.rightOffsetPixels && 0 !== i) {
      const t2 = this.lc * i / this.oc;
      this.lc = t2;
    }
    this.Rc(), this.sn.Lc(), this.sn.mr();
  }
  Oc() {
    return this.lc;
  }
  zl() {
    if (this.Zi()) return null;
    if (null !== this.sc) return this.sc;
    const t = this.oc, i = 5 * (this.sn.N().layout.fontSize + 4) / 8 * (this.yn.tickMarkMaxCharacterLength || 8), n = Math.round(i / t), s = u(this.Ee()), e2 = Math.max(s.Na(), s.Na() - n), r2 = Math.max(s.bi(), s.bi() - n), h2 = this.Ku.zu(t, i, this.yn.ignoreWhitespaceIndices, this.ec, this.rc), a2 = this.yc() + n, l2 = this.Pc() - n, o2 = this.Nc(), _2 = this.yn.fixLeftEdge || o2, c2 = this.yn.fixRightEdge || o2;
    let d2 = 0;
    for (const t2 of h2) {
      if (!(e2 <= t2.index && t2.index <= r2)) continue;
      let n2;
      d2 < this.hc.length ? (n2 = this.hc[d2], n2.coord = this.jt(t2.index), n2.label = this.Fc(t2), n2.weight = t2.weight) : (n2 = { needAlignCoordinate: false, coord: this.jt(t2.index), label: this.Fc(t2), weight: t2.weight }, this.hc.push(n2)), this.oc > i / 2 && !o2 ? n2.needAlignCoordinate = false : n2.needAlignCoordinate = _2 && t2.index <= a2 || c2 && t2.index >= l2, d2++;
    }
    return this.hc.length = d2, this.sc = this.hc, this.hc;
  }
  Wc() {
    let t;
    this.Xu = true, this.Ms(this.yn.barSpacing), t = void 0 !== this.yn.rightOffsetPixels ? this.yn.rightOffsetPixels / this.ml() : this.yn.rightOffset, this.gs(t);
  }
  Hc(t) {
    this.Xu = true, this.qu = t, this.Rc(), this.mc();
  }
  Uc(t, i) {
    const n = this.Bc(t), s = this.ml(), e2 = s + i * (s / 10);
    this.Ms(e2), this.yn.rightBarStaysOnScroll || this.gs(this.Oc() + (n - this.Bc(t)));
  }
  u_(t) {
    this.Po && this.v_(), null === this.yo && null === this.nc && (this.Zi() || (this.yo = t, this.$c()));
  }
  c_(t) {
    if (null === this.nc) return;
    const i = ni(this.k_ - t, 0, this.k_), n = ni(this.k_ - u(this.yo), 0, this.k_);
    0 !== i && 0 !== n && this.Ms(this.nc.ml * i / n);
  }
  d_() {
    null !== this.yo && (this.yo = null, this.jc());
  }
  f_(t) {
    null === this.Po && null === this.nc && (this.Zi() || (this.Po = t, this.$c()));
  }
  p_(t) {
    if (null === this.Po) return;
    const i = (this.Po - t) / this.ml();
    this.lc = u(this.nc).Oc + i, this.Xu = true, this.Rc();
  }
  v_() {
    null !== this.Po && (this.Po = null, this.jc());
  }
  qc() {
    this.Yc(this.yn.rightOffset);
  }
  Yc(t, i = 400) {
    if (!isFinite(t)) throw new RangeError("offset is required and must be finite number");
    if (!isFinite(i) || i <= 0) throw new RangeError("animationDuration (optional) must be finite positive number");
    const n = this.lc, s = performance.now();
    this.sn.ps({ Kc: (t2) => (t2 - s) / i >= 1, Gc: (e2) => {
      const r2 = (e2 - s) / i;
      return r2 >= 1 ? t : n + (t - n) * r2;
    } });
  }
  Pt(t, i) {
    this.Xu = true, this.Yu = t, this.Ku.Au(t, i), this.Rc();
  }
  Zc() {
    return this.Ju;
  }
  Xc() {
    return this.Qu;
  }
  Jc() {
    return this.tc;
  }
  Dc() {
    return this.qu || 0;
  }
  Qc(t, i) {
    const n = t.Iu(), s = i && this.yn.rightOffsetPixels || 0;
    this.zc((this.k_ - s) / n), this.lc = t.bi() - this.Dc(), i && (this.lc = s ? s / this.ml() : this.yn.rightOffset), this.Rc(), this.Xu = true, this.sn.Lc(), this.sn.mr();
  }
  td() {
    const t = this.yc(), i = this.Pc();
    if (null === t || null === i) return;
    const n = !this.yn.rightOffsetPixels && this.yn.rightOffset || 0;
    this.Qc(new Ai(t, i + n), true);
  }
  nd(t) {
    const i = new Ai(t.from, t.to);
    this.Qc(i);
  }
  rn(t) {
    return void 0 !== this.Do.timeFormatter ? this.Do.timeFormatter(t.originalTime) : this.Pu.formatHorzItem(t.time);
  }
  dc() {
    if (!this.yn.ignoreWhitespaceIndices) return;
    this.ec.clear();
    const t = this.sn.Jn();
    for (const i of t) for (const t2 of i.fl()) this.ec.set(t2, true);
    this.rc++;
  }
  sd() {
    return this.ac;
  }
  Sl() {
    const t = 1 / (window.devicePixelRatio || 1), i = this.yn.minBarSpacing;
    if (i >= t) return [1];
    const n = [1];
    let s = 2;
    for (; s <= 512; ) {
      i < t / s && n.push(s), s *= 2;
    }
    return n;
  }
  Nc() {
    const t = this.sn.N().handleScroll, i = this.sn.N().handleScale;
    return !(t.horzTouchDrag || t.mouseWheel || t.pressedMouseMove || t.vertTouchDrag || i.axisDoubleClickReset.time || i.axisPressedMouseMove.time || i.mouseWheel || i.pinch);
  }
  yc() {
    return 0 === this.Yu.length ? null : 0;
  }
  Pc() {
    return 0 === this.Yu.length ? null : this.Yu.length - 1;
  }
  ed(t) {
    return (this.k_ - 1 - t) / this.oc;
  }
  Bc(t) {
    const i = this.ed(t), n = this.Dc() + this.lc - i;
    return Math.round(1e6 * n) / 1e6;
  }
  zc(t) {
    const i = this.oc;
    this.oc = t, this.Tc(), i !== this.oc && (this.Xu = true, this.rd(), this.cc());
  }
  bc() {
    if (!this.Xu) return;
    if (this.Xu = false, this.Zi()) return void this.hd(Oi.ju());
    const t = this.Dc(), i = this.k_ / this.oc, n = this.lc + t, s = new Ai(n - i + 1, n);
    this.hd(new Oi(s));
  }
  Tc() {
    const t = ni(this.oc, this.ad(), this.ld());
    this.oc !== t && (this.oc = t, this.Xu = true);
  }
  ld() {
    return this.yn.maxBarSpacing > 0 ? this.yn.maxBarSpacing : 0.5 * this.k_;
  }
  ad() {
    return this.yn.fixLeftEdge && this.yn.fixRightEdge && 0 !== this.Yu.length ? this.k_ / this.Yu.length : this.yn.minBarSpacing;
  }
  cc() {
    if (!this.yn.enableConflation) return void (this.ac = 1);
    const t = 1 / (window.devicePixelRatio || 1) * (this.yn.conflationThresholdFactor ?? 1);
    if (this.oc >= t) return void (this.ac = 1);
    const i = t / this.oc, n = Math.pow(2, Math.floor(Math.log2(i)));
    this.ac = Math.min(n, 512);
  }
  Rc() {
    const t = this.od();
    null !== t && this.lc < t && (this.lc = t, this.Xu = true);
    const i = this._d();
    this.lc > i && (this.lc = i, this.Xu = true);
  }
  od() {
    const t = this.yc(), i = this.qu;
    if (null === t || null === i) return null;
    return t - i - 1 + (this.yn.fixLeftEdge ? this.k_ / this.oc : Math.min(2, this.Yu.length));
  }
  _d() {
    return this.yn.fixRightEdge ? 0 : this.k_ / this.oc - Math.min(2, this.Yu.length);
  }
  $c() {
    this.nc = { ml: this.ml(), Oc: this.Oc() };
  }
  jc() {
    this.nc = null;
  }
  Fc(t) {
    let i = this.Gu.get(t.weight);
    return void 0 === i && (i = new Ei(((t2) => this.ud(t2)), this.Pu), this.Gu.set(t.weight, i)), i.ku(t);
  }
  ud(t) {
    return this.Pu.formatTickmark(t, this.Do);
  }
  hd(t) {
    const i = this.Zu;
    this.Zu = t, Li(i.Uu(), this.Zu.Uu()) || this.Ju.p(), Li(i.$u(), this.Zu.$u()) || this.Qu.p(), this.rd();
  }
  rd() {
    this.sc = null;
  }
  vc() {
    this.rd(), this.Gu.clear();
  }
  uc() {
    this.Pu.updateFormatter(this.Do);
  }
  mc() {
    if (!this.yn.fixLeftEdge) return;
    const t = this.yc();
    if (null === t) return;
    const i = this.Ee();
    if (null === i) return;
    const n = i.Na() - t;
    if (n < 0) {
      const t2 = this.lc - n - 1;
      this.gs(t2);
    }
    this.Tc();
  }
  wc() {
    this.Rc(), this.Tc();
  }
  Ec(t) {
    return !this.yn.ignoreWhitespaceIndices || (this.ec.get(t) || false);
  }
  Ac(t) {
    const i = (function* (t2) {
      const i2 = Math.round(t2), n2 = i2 < t2;
      let s = 1;
      for (; ; ) n2 ? (yield i2 + s, yield i2 - s) : (yield i2 - s, yield i2 + s), s++;
    })(t), n = this.Pc();
    for (; n; ) {
      const t2 = i.next().value;
      if (this.ec.get(t2)) return t2;
      if (t2 < 0 || t2 > n) break;
    }
    return t;
  }
  _c(t) {
    if (void 0 !== t.rightOffsetPixels) {
      const i = t.rightOffsetPixels / (t.barSpacing || this.oc);
      this.sn.gs(i);
    }
  }
};
var Wi;
var Hi;
var Ui;
var $i;
var ji;
!(function(t) {
  t[t.OnTouchEnd = 0] = "OnTouchEnd", t[t.OnNextTap = 1] = "OnNextTap";
})(Wi || (Wi = {}));
var qi = class {
  constructor(t, i, n) {
    this.dd = [], this.fd = [], this.pd = null, this.k_ = 0, this.vd = null, this.md = new d(), this.wd = new d(), this.Md = null, this.gd = t, this.yn = i, this.Pu = n, this.Io = new k(this.yn.layout.colorParsers), this.bd = new C(this), this.ia = new Fi(this, i.timeScale, this.yn.localization, n), this.Ct = new G(this, i.crosshair), this.Sd = new ii(i.crosshair), i.addDefaultPane && (this.xd(0), this.dd[0].W_(2)), this.Cd = this.yd(0), this.Pd = this.yd(1);
  }
  ka() {
    this.kd(X.ys());
  }
  mr() {
    this.kd(X.Cs());
  }
  Ya() {
    this.kd(new X(1));
  }
  Ta(t) {
    const i = this.Td(t);
    this.kd(i);
  }
  cu() {
    return this.vd;
  }
  Rd(t) {
    if (this.vd?.uu === t?.uu && this.vd?.bu?.te === t?.bu?.te && this.vd?.bu?.ie === t?.bu?.ie && this.vd?.gu === t?.gu && this.vd?.ee === t?.ee) return;
    const i = this.vd;
    this.vd = t, null !== i && this.Ta(i.uu), null !== t && t.uu !== i?.uu && this.Ta(t.uu);
  }
  N() {
    return this.yn;
  }
  vr(t) {
    f(this.yn, t), this.dd.forEach(((i) => i.z_(t))), void 0 !== t.timeScale && this.ia.vr(t.timeScale), void 0 !== t.localization && this.ia.fc(t.localization), (t.leftPriceScale || t.rightPriceScale) && this.md.p(), this.Cd = this.yd(0), this.Pd = this.yd(1), this.ka();
  }
  Dd(t, i, n = 0) {
    const s = this.dd[n];
    if (void 0 === s) return;
    if ("left" === t) return f(this.yn, { leftPriceScale: i }), s.z_({ leftPriceScale: i }), this.md.p(), void this.ka();
    if ("right" === t) return f(this.yn, { rightPriceScale: i }), s.z_({ rightPriceScale: i }), this.md.p(), void this.ka();
    const e2 = this.Id(t, n);
    null !== e2 && (e2.Ft.vr(i), this.md.p());
  }
  Id(t, i) {
    const n = this.dd[i];
    if (void 0 === n) return null;
    const s = n.O_(t);
    return null !== s ? { Kn: n, Ft: s } : null;
  }
  Et() {
    return this.ia;
  }
  Gn() {
    return this.dd;
  }
  Vd() {
    return this.Ct;
  }
  Bd() {
    return this.wd;
  }
  Ed(t, i) {
    t.$o(i), this.Lc();
  }
  H_(t) {
    this.k_ = t, this.ia.H_(this.k_), this.dd.forEach(((i) => i.H_(t))), this.Lc();
  }
  Ad(t) {
    1 !== this.dd.length && (o(t >= 0 && t < this.dd.length, "Invalid pane index"), this.dd.splice(t, 1), this.ka());
  }
  Ld(t, i) {
    if (this.dd.length < 2) return;
    o(t >= 0 && t < this.dd.length, "Invalid pane index");
    const n = this.dd[t], s = this.dd.reduce(((t2, i2) => t2 + i2.F_()), 0), e2 = this.dd.reduce(((t2, i2) => t2 + i2.$t()), 0), r2 = e2 - 30 * (this.dd.length - 1);
    i = Math.min(r2, Math.max(30, i));
    const h2 = s / e2, a2 = n.$t();
    n.W_(i * h2);
    let l2 = i - a2, _2 = this.dd.length - 1;
    for (const t2 of this.dd) if (t2 !== n) {
      const i2 = Math.min(r2, Math.max(30, t2.$t() - l2 / _2));
      l2 -= t2.$t() - i2, _2 -= 1;
      const n2 = i2 * h2;
      t2.W_(n2);
    }
    this.ka();
  }
  zd(t, i) {
    o(t >= 0 && t < this.dd.length && i >= 0 && i < this.dd.length, "Invalid pane index");
    const n = this.dd[t], s = this.dd[i];
    this.dd[t] = s, this.dd[i] = n, this.ka();
  }
  Od(t, i) {
    if (o(t >= 0 && t < this.dd.length && i >= 0 && i < this.dd.length, "Invalid pane index"), t === i) return;
    const [n] = this.dd.splice(t, 1);
    this.dd.splice(i, 0, n), this.ka();
  }
  Q_(t, i, n) {
    t.Q_(i, n);
  }
  tu(t, i, n) {
    t.tu(i, n), this.Ra(), this.kd(this.Nd(t, 2));
  }
  iu(t, i) {
    t.iu(i), this.kd(this.Nd(t, 2));
  }
  nu(t, i, n) {
    i.zo() || t.nu(i, n);
  }
  su(t, i, n) {
    i.zo() || (t.su(i, n), this.Ra(), this.kd(this.Nd(t, 2)));
  }
  eu(t, i) {
    i.zo() || (t.eu(i), this.kd(this.Nd(t, 2)));
  }
  au(t, i) {
    t.au(i), this.kd(this.Nd(t, 2));
  }
  Fd(t) {
    this.ia.u_(t);
  }
  Wd(t, i) {
    const n = this.Et();
    if (n.Zi() || 0 === i) return;
    const s = n.nn();
    t = Math.max(1, Math.min(t, s)), n.Uc(t, i), this.Lc();
  }
  Hd(t) {
    this.Ud(0), this.$d(t), this.jd();
  }
  qd(t) {
    this.ia.c_(t), this.Lc();
  }
  Yd() {
    this.ia.d_(), this.mr();
  }
  Ud(t) {
    this.ia.f_(t);
  }
  $d(t) {
    this.ia.p_(t), this.Lc();
  }
  jd() {
    this.ia.v_(), this.mr();
  }
  Jn() {
    return this.fd;
  }
  Wn() {
    return null === this.pd && (this.pd = this.fd.filter(((t) => t.It()))), this.pd;
  }
  Pa() {
    this.pd = null;
  }
  Kd(t, i, n, s, e2) {
    this.Ct.In(t, i);
    let r2 = NaN, h2 = this.ia.Vc(t, true);
    const a2 = this.ia.Ee();
    null !== a2 && (h2 = Math.min(Math.max(a2.Na(), h2), a2.bi())), h2 = this.Ct.Fn(h2);
    const l2 = s.kn(), o2 = l2.Lt();
    if (null !== o2 && (r2 = l2.Tn(i, o2)), r2 = this.Sd.Pl(r2, h2, s), this.Ct.An(h2, r2, s), this.Ya(), !e2) {
      const e3 = Bi(s, t, i);
      this.Rd(e3 && { uu: e3.uu, bu: e3.bu, gu: e3.gu || null, ee: e3.ee }), this.wd.p(this.Ct.Bt(), { x: t, y: i }, n);
    }
  }
  Gd(t, i, n) {
    const s = n.kn(), e2 = s.Lt(), r2 = s.Nt(t, u(e2)), h2 = this.ia.Mc(i, true), a2 = this.ia.jt(u(h2));
    this.Kd(a2, r2, null, n, true);
  }
  Zd(t) {
    this.Vd().zn(), this.Ya(), t || this.wd.p(null, null, null);
  }
  Ra() {
    const t = this.Ct.Kn();
    if (null !== t) {
      const i = this.Ct.Bn(), n = this.Ct.En();
      this.Kd(i, n, null, t);
    }
    this.Ct.Nn();
  }
  Xd(t, i, n) {
    const s = this.ia.Rn(0);
    void 0 !== i && void 0 !== n && this.ia.Pt(i, n);
    const e2 = this.ia.Rn(0), r2 = this.ia.Dc(), h2 = this.ia.Ee();
    if (null !== h2 && null !== s && null !== e2) {
      const i2 = h2.ze(r2), a2 = this.Pu.key(s) > this.Pu.key(e2), l2 = null !== t && t > r2 && !a2, o2 = this.ia.N().allowShiftVisibleRangeOnWhitespaceReplacement, _2 = i2 && (!(void 0 === n) || o2) && this.ia.N().shiftVisibleRangeOnNewBar;
      if (l2 && !_2) {
        const i3 = t - r2;
        this.ia.gs(this.ia.Oc() - i3);
      }
    }
    this.ia.Hc(t);
  }
  Ba(t) {
    null !== t && t.ou();
  }
  Ks(t) {
    if ((function(t2) {
      return t2 instanceof Pi;
    })(t)) return t;
    const i = this.dd.find(((i2) => i2.Dt().includes(t)));
    return void 0 === i ? null : i;
  }
  Lc() {
    this.dd.forEach(((t) => t.ou())), this.Ra();
  }
  m() {
    this.dd.forEach(((t) => t.m())), this.dd.length = 0, this.yn.localization.priceFormatter = void 0, this.yn.localization.percentageFormatter = void 0, this.yn.localization.timeFormatter = void 0;
  }
  Jd() {
    return this.bd;
  }
  Js() {
    return this.bd.N();
  }
  N_() {
    return this.md;
  }
  Qd(t, i) {
    const n = this.xd(i);
    this.tf(t, n), this.fd.push(t), this.Pa(), 1 === this.fd.length ? this.ka() : this.mr();
  }
  if(t) {
    const i = this.Ks(t), n = this.fd.indexOf(t);
    o(-1 !== n, "Series not found");
    const s = u(i);
    this.fd.splice(n, 1), s.l_(t), t.m && t.m(), this.Pa(), this.ia.dc(), this.nf(s);
  }
  ya(t, i) {
    const n = u(this.Ks(t));
    n.l_(t, true), n.h_(t, i, true);
  }
  td() {
    const t = X.Cs();
    t.us(), this.kd(t);
  }
  sf(t) {
    const i = X.Cs();
    i.fs(t), this.kd(i);
  }
  ws() {
    const t = X.Cs();
    t.ws(), this.kd(t);
  }
  Ms(t) {
    const i = X.Cs();
    i.Ms(t), this.kd(i);
  }
  gs(t) {
    const i = X.Cs();
    i.gs(t), this.kd(i);
  }
  ps(t) {
    const i = X.Cs();
    i.ps(t), this.kd(i);
  }
  cs() {
    const t = X.Cs();
    t.cs(), this.kd(t);
  }
  ef() {
    const t = this.yn.defaultVisiblePriceScaleId, i = this.yn.leftPriceScale.visible;
    return i !== this.yn.rightPriceScale.visible ? i ? "left" : "right" : t;
  }
  rf(t, i) {
    o(i >= 0, "Index should be greater or equal to 0");
    if (i === this.hf(t)) return;
    const n = u(this.Ks(t));
    n.l_(t);
    const s = this.xd(i);
    this.tf(t, s);
    let e2 = false;
    0 === n.kl().length && (e2 = this.nf(n)), e2 || this.ka();
  }
  af() {
    return this.Pd;
  }
  $() {
    return this.Cd;
  }
  Ut(t) {
    const i = this.Pd, n = this.Cd;
    if (i === n) return i;
    if (t = Math.max(0, Math.min(100, Math.round(100 * t))), null === this.Md || this.Md.ah !== n || this.Md.oh !== i) this.Md = { ah: n, oh: i, lf: /* @__PURE__ */ new Map() };
    else {
      const i2 = this.Md.lf.get(t);
      if (void 0 !== i2) return i2;
    }
    const s = this.Io.tt(n, i, t / 100);
    return this.Md.lf.set(t, s), s;
  }
  _f(t) {
    return this.dd.indexOf(t);
  }
  Xi() {
    return this.Io;
  }
  uf() {
    return this.cf();
  }
  cf(t) {
    const i = new Pi(this.ia, this);
    this.dd.push(i);
    const n = t ?? this.dd.length - 1, s = X.ys();
    return s.es(n, { rs: 0, hs: true }), this.kd(s), i;
  }
  xd(t) {
    return o(t >= 0, "Index should be greater or equal to 0"), (t = Math.min(this.dd.length, t)) < this.dd.length ? this.dd[t] : this.cf(t);
  }
  hf(t) {
    return this.dd.findIndex(((i) => i.Y_().includes(t)));
  }
  Nd(t, i) {
    const n = new X(i);
    if (null !== t) {
      const s = this.dd.indexOf(t);
      n.es(s, { rs: i });
    }
    return n;
  }
  Td(t, i) {
    return void 0 === i && (i = 2), this.Nd(this.Ks(t), i);
  }
  kd(t) {
    this.gd && this.gd(t), this.dd.forEach(((t2) => t2.wu().wr().Pt()));
  }
  tf(t, i) {
    const n = t.N().priceScaleId, s = void 0 !== n ? n : this.ef();
    i.h_(t, s), Z(s) || t.vr(t.N());
  }
  yd(t) {
    const i = this.yn.layout;
    return "gradient" === i.background.type ? 0 === t ? i.background.topColor : i.background.bottomColor : i.background.color;
  }
  nf(t) {
    return !t.q_() && 0 === t.kl().length && this.dd.length > 1 && (this.dd.splice(this._f(t), 1), this.ka(), true);
  }
};
function Yi(t) {
  if (t >= 1) return 0;
  let i = 0;
  for (; i < 8; i++) {
    const n = Math.round(t);
    if (Math.abs(n - t) < 1e-8) return i;
    t *= 10;
  }
  return i;
}
function Ki(t) {
  return !p(t) && !m(t);
}
function Gi(t) {
  return p(t);
}
!(function(t) {
  t[t.Disabled = 0] = "Disabled", t[t.Continuous = 1] = "Continuous", t[t.OnDataUpdate = 2] = "OnDataUpdate";
})(Hi || (Hi = {})), (function(t) {
  t[t.LastBar = 0] = "LastBar", t[t.LastVisible = 1] = "LastVisible";
})(Ui || (Ui = {})), (function(t) {
  t.Solid = "solid", t.VerticalGradient = "gradient";
})($i || ($i = {})), (function(t) {
  t[t.Year = 0] = "Year", t[t.Month = 1] = "Month", t[t.DayOfMonth = 2] = "DayOfMonth", t[t.Time = 3] = "Time", t[t.TimeWithSeconds = 4] = "TimeWithSeconds";
})(ji || (ji = {}));
var Zi = (t) => t.getUTCFullYear();
function Xi(t, i, n) {
  return i.replace(/yyyy/g, ((t2) => tt(Zi(t2), 4))(t)).replace(/yy/g, ((t2) => tt(Zi(t2) % 100, 2))(t)).replace(/MMMM/g, ((t2, i2) => new Date(t2.getUTCFullYear(), t2.getUTCMonth(), 1).toLocaleString(i2, { month: "long" }))(t, n)).replace(/MMM/g, ((t2, i2) => new Date(t2.getUTCFullYear(), t2.getUTCMonth(), 1).toLocaleString(i2, { month: "short" }))(t, n)).replace(/MM/g, ((t2) => tt(((t3) => t3.getUTCMonth() + 1)(t2), 2))(t)).replace(/dd/g, ((t2) => tt(((t3) => t3.getUTCDate())(t2), 2))(t));
}
var Ji = class {
  constructor(t = "yyyy-MM-dd", i = "default") {
    this.df = t, this.ff = i;
  }
  ku(t) {
    return Xi(t, this.df, this.ff);
  }
};
var Qi = class {
  constructor(t) {
    this.pf = t || "%h:%m:%s";
  }
  ku(t) {
    return this.pf.replace("%h", tt(t.getUTCHours(), 2)).replace("%m", tt(t.getUTCMinutes(), 2)).replace("%s", tt(t.getUTCSeconds(), 2));
  }
};
var tn = { vf: "yyyy-MM-dd", mf: "%h:%m:%s", wf: " ", Mf: "default" };
var nn = class {
  constructor(t = {}) {
    const i = { ...tn, ...t };
    this.gf = new Ji(i.vf, i.Mf), this.bf = new Qi(i.mf), this.Sf = i.wf;
  }
  ku(t) {
    return `${this.gf.ku(t)}${this.Sf}${this.bf.ku(t)}`;
  }
};
function sn(t) {
  return 60 * t * 60 * 1e3;
}
function en(t) {
  return 60 * t * 1e3;
}
var rn = [{ xf: (hn = 1, 1e3 * hn), Cf: 10 }, { xf: en(1), Cf: 20 }, { xf: en(5), Cf: 21 }, { xf: en(30), Cf: 22 }, { xf: sn(1), Cf: 30 }, { xf: sn(3), Cf: 31 }, { xf: sn(6), Cf: 32 }, { xf: sn(12), Cf: 33 }];
var hn;
function an(t, i) {
  if (t.getUTCFullYear() !== i.getUTCFullYear()) return 70;
  if (t.getUTCMonth() !== i.getUTCMonth()) return 60;
  if (t.getUTCDate() !== i.getUTCDate()) return 50;
  for (let n = rn.length - 1; n >= 0; --n) if (Math.floor(i.getTime() / rn[n].xf) !== Math.floor(t.getTime() / rn[n].xf)) return rn[n].Cf;
  return 0;
}
function ln(t) {
  let i = t;
  if (m(t) && (i = _n(t)), !Ki(i)) throw new Error("time must be of type BusinessDay");
  const n = new Date(Date.UTC(i.year, i.month - 1, i.day, 0, 0, 0, 0));
  return { yf: Math.round(n.getTime() / 1e3), Pf: i };
}
function on(t) {
  if (!Gi(t)) throw new Error("time must be of type isUTCTimestamp");
  return { yf: t };
}
function _n(t) {
  const i = new Date(t);
  if (isNaN(i.getTime())) throw new Error(`Invalid date string=${t}, expected format=yyyy-mm-dd`);
  return { day: i.getUTCDate(), month: i.getUTCMonth() + 1, year: i.getUTCFullYear() };
}
function un(t) {
  m(t.time) && (t.time = _n(t.time));
}
var cn = class {
  options() {
    return this.yn;
  }
  setOptions(t) {
    this.yn = t, this.updateFormatter(t.localization);
  }
  preprocessData(t) {
    Array.isArray(t) ? (function(t2) {
      t2.forEach(un);
    })(t) : un(t);
  }
  createConverterToInternalObj(t) {
    return u((function(t2) {
      return 0 === t2.length ? null : Ki(t2[0].time) || m(t2[0].time) ? ln : on;
    })(t));
  }
  key(t) {
    return "object" == typeof t && "yf" in t ? t.yf : this.key(this.convertHorzItemToInternal(t));
  }
  cacheKey(t) {
    const i = t;
    return void 0 === i.Pf ? new Date(1e3 * i.yf).getTime() : new Date(Date.UTC(i.Pf.year, i.Pf.month - 1, i.Pf.day)).getTime();
  }
  convertHorzItemToInternal(t) {
    return Gi(i = t) ? on(i) : Ki(i) ? ln(i) : ln(_n(i));
    var i;
  }
  updateFormatter(t) {
    if (!this.yn) return;
    const i = t.dateFormat;
    this.yn.timeScale.timeVisible ? this.kf = new nn({ vf: i, mf: this.yn.timeScale.secondsVisible ? "%h:%m:%s" : "%h:%m", wf: "   ", Mf: t.locale }) : this.kf = new Ji(i, t.locale);
  }
  formatHorzItem(t) {
    const i = t;
    return this.kf.ku(new Date(1e3 * i.yf));
  }
  formatTickmark(t, i) {
    const n = (function(t2, i2, n2) {
      switch (t2) {
        case 0:
        case 10:
          return i2 ? n2 ? 4 : 3 : 2;
        case 20:
        case 21:
        case 22:
        case 30:
        case 31:
        case 32:
        case 33:
          return i2 ? 3 : 2;
        case 50:
          return 2;
        case 60:
          return 1;
        case 70:
          return 0;
      }
    })(t.weight, this.yn.timeScale.timeVisible, this.yn.timeScale.secondsVisible), s = this.yn.timeScale;
    if (void 0 !== s.tickMarkFormatter) {
      const e2 = s.tickMarkFormatter(t.originalTime, n, i.locale);
      if (null !== e2) return e2;
    }
    return (function(t2, i2, n2) {
      const s2 = {};
      switch (i2) {
        case 0:
          s2.year = "numeric";
          break;
        case 1:
          s2.month = "short";
          break;
        case 2:
          s2.day = "numeric";
          break;
        case 3:
          s2.hour12 = false, s2.hour = "2-digit", s2.minute = "2-digit";
          break;
        case 4:
          s2.hour12 = false, s2.hour = "2-digit", s2.minute = "2-digit", s2.second = "2-digit";
      }
      const e2 = void 0 === t2.Pf ? new Date(1e3 * t2.yf) : new Date(Date.UTC(t2.Pf.year, t2.Pf.month - 1, t2.Pf.day));
      return new Date(e2.getUTCFullYear(), e2.getUTCMonth(), e2.getUTCDate(), e2.getUTCHours(), e2.getUTCMinutes(), e2.getUTCSeconds(), e2.getUTCMilliseconds()).toLocaleString(n2, s2);
    })(t.time, n, i.locale);
  }
  maxTickMarkWeight(t) {
    let i = t.reduce(Ni, t[0]).weight;
    return i > 30 && i < 50 && (i = 30), i;
  }
  fillWeightsForPoints(t, i) {
    !(function(t2, i2 = 0) {
      if (0 === t2.length) return;
      let n = 0 === i2 ? null : t2[i2 - 1].time.yf, s = null !== n ? new Date(1e3 * n) : null, e2 = 0;
      for (let r2 = i2; r2 < t2.length; ++r2) {
        const i3 = t2[r2], h2 = new Date(1e3 * i3.time.yf);
        null !== s && (i3.timeWeight = an(h2, s)), e2 += i3.time.yf - (n || i3.time.yf), n = i3.time.yf, s = h2;
      }
      if (0 === i2 && t2.length > 1) {
        const i3 = Math.ceil(e2 / (t2.length - 1)), n2 = new Date(1e3 * (t2[0].time.yf - i3));
        t2[0].timeWeight = an(new Date(1e3 * t2[0].time.yf), n2);
      }
    })(t, i);
  }
  static Tf(t) {
    return f({ localization: { dateFormat: "dd MMM 'yy" } }, t ?? {});
  }
};
var dn = "undefined" != typeof window;
function fn() {
  return !!dn && window.navigator.userAgent.toLowerCase().indexOf("firefox") > -1;
}
function pn() {
  return !!dn && /iPhone|iPad|iPod/.test(window.navigator.platform);
}
function vn(t, i) {
  switch (t) {
    case "custom":
      return void 0 !== i ? "custom-object" : "series";
    case "price-line":
      return "custom-price-line";
    case "marker":
      return "series-marker";
    case "primitive":
      return "primitive";
    default:
      return "series";
  }
}
function mn(t) {
  return t + t % 2;
}
function wn(t) {
  dn && void 0 !== window.chrome && t.addEventListener("mousedown", ((t2) => {
    if (1 === t2.button) return t2.preventDefault(), false;
  }));
}
var Mn = class {
  constructor(t, i, n) {
    this.Rf = 0, this.Df = null, this.If = { _t: Number.NEGATIVE_INFINITY, ut: Number.POSITIVE_INFINITY }, this.Vf = 0, this.Bf = null, this.Ef = { _t: Number.NEGATIVE_INFINITY, ut: Number.POSITIVE_INFINITY }, this.Af = null, this.Lf = false, this.zf = null, this.Of = null, this.Nf = false, this.Ff = false, this.Wf = false, this.Hf = null, this.Uf = null, this.$f = null, this.jf = null, this.qf = null, this.Yf = null, this.Kf = null, this.Gf = 0, this.Zf = false, this.Xf = false, this.Jf = false, this.Qf = 0, this.tp = null, this.ip = !pn(), this.np = (t2) => {
      this.sp(t2);
    }, this.ep = (t2) => {
      if (this.rp(t2)) {
        const i2 = this.hp(t2);
        if (++this.Vf, this.Bf && this.Vf > 1) {
          const { ap: n2 } = this.lp(Sn(t2), this.Ef);
          n2 < 30 && !this.Wf && this.op(i2, this.up._p), this.cp();
        }
      } else {
        const i2 = this.hp(t2);
        if (++this.Rf, this.Df && this.Rf > 1) {
          const { ap: n2 } = this.lp(Sn(t2), this.If);
          n2 < 5 && !this.Ff && this.dp(i2, this.up.fp), this.pp();
        }
      }
    }, this.vp = t, this.up = i, this.yn = n, this.mp();
  }
  m() {
    null !== this.Hf && (this.Hf(), this.Hf = null), null !== this.Uf && (this.Uf(), this.Uf = null), null !== this.jf && (this.jf(), this.jf = null), null !== this.qf && (this.qf(), this.qf = null), null !== this.Yf && (this.Yf(), this.Yf = null), null !== this.$f && (this.$f(), this.$f = null), this.wp(), this.pp();
  }
  Mp(t) {
    this.jf && this.jf();
    const i = this.gp.bind(this);
    if (this.jf = () => {
      this.vp.removeEventListener("mousemove", i);
    }, this.vp.addEventListener("mousemove", i), this.rp(t)) return;
    const n = this.hp(t);
    this.dp(n, this.up.bp), this.ip = true;
  }
  pp() {
    null !== this.Df && clearTimeout(this.Df), this.Rf = 0, this.Df = null, this.If = { _t: Number.NEGATIVE_INFINITY, ut: Number.POSITIVE_INFINITY };
  }
  cp() {
    null !== this.Bf && clearTimeout(this.Bf), this.Vf = 0, this.Bf = null, this.Ef = { _t: Number.NEGATIVE_INFINITY, ut: Number.POSITIVE_INFINITY };
  }
  gp(t) {
    if (this.Jf || null !== this.Of) return;
    if (this.rp(t)) return;
    const i = this.hp(t);
    this.dp(i, this.up.Sp), this.ip = true;
  }
  xp(t) {
    const i = Cn(t.changedTouches, u(this.tp));
    if (null === i) return;
    if (this.Qf = xn(t), null !== this.Kf) return;
    if (this.Xf) return;
    this.Zf = true;
    const n = this.lp(Sn(i), u(this.Of)), { Cp: s, yp: e2, ap: r2 } = n;
    if (this.Nf || !(r2 < 5)) {
      if (!this.Nf) {
        const t2 = 0.5 * s, i2 = e2 >= t2 && !this.yn.Pp(), n2 = t2 > e2 && !this.yn.kp();
        i2 || n2 || (this.Xf = true), this.Nf = true, this.Wf = true, this.wp(), this.cp();
      }
      if (!this.Xf) {
        const n2 = this.hp(t, i);
        this.op(n2, this.up.Tp), bn(t);
      }
    }
  }
  Rp(t) {
    if (0 !== t.button) return;
    const i = this.lp(Sn(t), u(this.zf)), { ap: n } = i;
    if (n >= 5 && (this.Ff = true, this.pp()), this.Ff) {
      const i2 = this.hp(t);
      this.dp(i2, this.up.Dp);
    }
  }
  lp(t, i) {
    const n = Math.abs(i._t - t._t), s = Math.abs(i.ut - t.ut);
    return { Cp: n, yp: s, ap: n + s };
  }
  Ip(t) {
    let i = Cn(t.changedTouches, u(this.tp));
    if (null === i && 0 === t.touches.length && (i = t.changedTouches[0]), null === i) return;
    this.tp = null, this.Qf = xn(t), this.wp(), this.Of = null, this.Yf && (this.Yf(), this.Yf = null);
    const n = this.hp(t, i);
    if (this.op(n, this.up.Vp), ++this.Vf, this.Bf && this.Vf > 1) {
      const { ap: t2 } = this.lp(Sn(i), this.Ef);
      t2 < 30 && !this.Wf && this.op(n, this.up._p), this.cp();
    } else this.Wf || (this.op(n, this.up.Bp), this.up.Bp && bn(t));
    0 === this.Vf && bn(t), 0 === t.touches.length && this.Lf && (this.Lf = false, bn(t));
  }
  sp(t) {
    if (0 !== t.button) return;
    const i = this.hp(t);
    if (this.zf = null, this.Jf = false, this.qf && (this.qf(), this.qf = null), fn()) {
      this.vp.ownerDocument.documentElement.removeEventListener("mouseleave", this.np);
    }
    if (!this.rp(t)) if (this.dp(i, this.up.Ep), ++this.Rf, this.Df && this.Rf > 1) {
      const { ap: n } = this.lp(Sn(t), this.If);
      n < 5 && !this.Ff && this.dp(i, this.up.fp), this.pp();
    } else this.Ff || this.dp(i, this.up.Ap);
  }
  wp() {
    null !== this.Af && (clearTimeout(this.Af), this.Af = null);
  }
  Lp(t) {
    if (null !== this.tp) return;
    const i = t.changedTouches[0];
    this.tp = i.identifier, this.Qf = xn(t);
    const n = this.vp.ownerDocument.documentElement;
    this.Wf = false, this.Nf = false, this.Xf = false, this.Of = Sn(i), this.Yf && (this.Yf(), this.Yf = null);
    {
      const i2 = this.xp.bind(this), s2 = this.Ip.bind(this);
      this.Yf = () => {
        n.removeEventListener("touchmove", i2), n.removeEventListener("touchend", s2);
      }, n.addEventListener("touchmove", i2, { passive: false }), n.addEventListener("touchend", s2, { passive: false }), this.wp(), this.Af = setTimeout(this.zp.bind(this, t), 240);
    }
    const s = this.hp(t, i);
    this.op(s, this.up.Op), this.Bf || (this.Vf = 0, this.Bf = setTimeout(this.cp.bind(this), 500), this.Ef = Sn(i));
  }
  Np(t) {
    if (0 !== t.button) return;
    const i = this.vp.ownerDocument.documentElement;
    fn() && i.addEventListener("mouseleave", this.np), this.Ff = false, this.zf = Sn(t), this.qf && (this.qf(), this.qf = null);
    {
      const t2 = this.Rp.bind(this), n2 = this.sp.bind(this);
      this.qf = () => {
        i.removeEventListener("mousemove", t2), i.removeEventListener("mouseup", n2);
      }, i.addEventListener("mousemove", t2), i.addEventListener("mouseup", n2);
    }
    if (this.Jf = true, this.rp(t)) return;
    const n = this.hp(t);
    this.dp(n, this.up.Fp), this.Df || (this.Rf = 0, this.Df = setTimeout(this.pp.bind(this), 500), this.If = Sn(t));
  }
  mp() {
    this.vp.addEventListener("mouseenter", this.Mp.bind(this)), this.vp.addEventListener("touchcancel", this.wp.bind(this));
    {
      const t = this.vp.ownerDocument, i = (t2) => {
        this.up.Wp && (t2.composed && this.vp.contains(t2.composedPath()[0]) || t2.target && this.vp.contains(t2.target) || this.up.Wp());
      };
      this.Uf = () => {
        t.removeEventListener("touchstart", i);
      }, this.Hf = () => {
        t.removeEventListener("mousedown", i);
      }, t.addEventListener("mousedown", i), t.addEventListener("touchstart", i, { passive: true });
    }
    pn() && (this.$f = () => {
      this.vp.removeEventListener("dblclick", this.ep);
    }, this.vp.addEventListener("dblclick", this.ep)), this.vp.addEventListener("mouseleave", this.Hp.bind(this)), this.vp.addEventListener("touchstart", this.Lp.bind(this), { passive: true }), wn(this.vp), this.vp.addEventListener("mousedown", this.Np.bind(this)), this.Up(), this.vp.addEventListener("touchmove", (() => {
    }), { passive: false });
  }
  Up() {
    void 0 === this.up.$p && void 0 === this.up.jp && void 0 === this.up.qp || (this.vp.addEventListener("touchstart", ((t) => this.Yp(t.touches)), { passive: true }), this.vp.addEventListener("touchmove", ((t) => {
      if (2 === t.touches.length && null !== this.Kf && void 0 !== this.up.jp) {
        const i = gn(t.touches[0], t.touches[1]) / this.Gf;
        this.up.jp(this.Kf, i), bn(t);
      }
    }), { passive: false }), this.vp.addEventListener("touchend", ((t) => {
      this.Yp(t.touches);
    })));
  }
  Yp(t) {
    1 === t.length && (this.Zf = false), 2 !== t.length || this.Zf || this.Lf ? this.Kp() : this.Gp(t);
  }
  Gp(t) {
    const i = this.vp.getBoundingClientRect() || { left: 0, top: 0 };
    this.Kf = { _t: (t[0].clientX - i.left + (t[1].clientX - i.left)) / 2, ut: (t[0].clientY - i.top + (t[1].clientY - i.top)) / 2 }, this.Gf = gn(t[0], t[1]), void 0 !== this.up.$p && this.up.$p(), this.wp();
  }
  Kp() {
    null !== this.Kf && (this.Kf = null, void 0 !== this.up.qp && this.up.qp());
  }
  Hp(t) {
    if (this.jf && this.jf(), this.rp(t)) return;
    if (!this.ip) return;
    const i = this.hp(t);
    this.dp(i, this.up.Zp), this.ip = !pn();
  }
  zp(t) {
    const i = Cn(t.touches, u(this.tp));
    if (null === i) return;
    const n = this.hp(t, i);
    this.op(n, this.up.Xp), this.Wf = true, this.Lf = true;
  }
  rp(t) {
    return t.sourceCapabilities && void 0 !== t.sourceCapabilities.firesTouchEvents ? t.sourceCapabilities.firesTouchEvents : xn(t) < this.Qf + 500;
  }
  op(t, i) {
    i && i.call(this.up, t);
  }
  dp(t, i) {
    i && i.call(this.up, t);
  }
  hp(t, i) {
    const n = i || t, s = this.vp.getBoundingClientRect() || { left: 0, top: 0 };
    return { clientX: n.clientX, clientY: n.clientY, pageX: n.pageX, pageY: n.pageY, screenX: n.screenX, screenY: n.screenY, localX: n.clientX - s.left, localY: n.clientY - s.top, ctrlKey: t.ctrlKey, altKey: t.altKey, shiftKey: t.shiftKey, metaKey: t.metaKey, Jp: !t.type.startsWith("mouse") && "contextmenu" !== t.type && "click" !== t.type, Qp: t.type, tv: n.target, xu: t.view, iv: () => {
      "touchstart" !== t.type && bn(t);
    } };
  }
};
function gn(t, i) {
  const n = t.clientX - i.clientX, s = t.clientY - i.clientY;
  return Math.sqrt(n * n + s * s);
}
function bn(t) {
  t.cancelable && t.preventDefault();
}
function Sn(t) {
  return { _t: t.pageX, ut: t.pageY };
}
function xn(t) {
  return t.timeStamp || performance.now();
}
function Cn(t, i) {
  for (let n = 0; n < t.length; ++n) if (t[n].identifier === i) return t[n];
  return null;
}
var yn = class {
  constructor(t, i, n) {
    this.nv = null, this.sv = null, this.ev = true, this.rv = null, this.hv = t, this.av = t.lv()[i], this.ov = t.lv()[n], this._v = document.createElement("tr"), this._v.style.height = "1px", this.uv = document.createElement("td"), this.uv.style.position = "relative", this.uv.style.padding = "0", this.uv.style.margin = "0", this.uv.setAttribute("colspan", "3"), this.cv(), this._v.appendChild(this.uv), this.ev = this.hv.N().layout.panes.enableResize, this.ev ? this.dv() : (this.nv = null, this.sv = null);
  }
  m() {
    null !== this.sv && this.sv.m();
  }
  fv() {
    return this._v;
  }
  pv() {
    return size({ width: this.av.pv().width, height: 1 });
  }
  vv() {
    return size({ width: this.av.vv().width, height: 1 * window.devicePixelRatio });
  }
  mv(t, i, n) {
    const s = this.vv();
    t.fillStyle = this.hv.N().layout.panes.separatorColor, t.fillRect(i, n, s.width, s.height);
  }
  Pt() {
    this.cv(), this.hv.N().layout.panes.enableResize !== this.ev && (this.ev = this.hv.N().layout.panes.enableResize, this.ev ? this.dv() : (null !== this.nv && (this.uv.removeChild(this.nv.wv), this.uv.removeChild(this.nv.Mv), this.nv = null), null !== this.sv && (this.sv.m(), this.sv = null)));
  }
  dv() {
    const t = document.createElement("div"), i = t.style;
    i.position = "fixed", i.display = "none", i.zIndex = "49", i.top = "0", i.left = "0", i.width = "100%", i.height = "100%", i.cursor = "row-resize", this.uv.appendChild(t);
    const n = document.createElement("div"), s = n.style;
    s.position = "absolute", s.zIndex = "50", s.top = "-4px", s.height = "9px", s.width = "100%", s.backgroundColor = "", s.cursor = "row-resize", this.uv.appendChild(n);
    const e2 = { bp: this.gv.bind(this), Zp: this.bv.bind(this), Fp: this.Sv.bind(this), Op: this.Sv.bind(this), Dp: this.xv.bind(this), Tp: this.xv.bind(this), Ep: this.Cv.bind(this), Vp: this.Cv.bind(this) };
    this.sv = new Mn(n, e2, { Pp: () => false, kp: () => true }), this.nv = { Mv: n, wv: t };
  }
  cv() {
    this.uv.style.background = this.hv.N().layout.panes.separatorColor;
  }
  gv(t) {
    null !== this.nv && (this.nv.Mv.style.backgroundColor = this.hv.N().layout.panes.separatorHoverColor);
  }
  bv(t) {
    null !== this.nv && null === this.rv && (this.nv.Mv.style.backgroundColor = "");
  }
  Sv(t) {
    if (null === this.nv) return;
    const i = this.av.yv().F_() + this.ov.yv().F_(), n = i / (this.av.pv().height + this.ov.pv().height), s = 30 * n;
    i <= 2 * s || (this.rv = { Pv: t.pageY, kv: this.av.yv().F_(), Tv: i - s, Rv: i, Dv: n, Iv: s }, this.nv.wv.style.display = "block");
  }
  xv(t) {
    const i = this.rv;
    if (null === i) return;
    const n = (t.pageY - i.Pv) * i.Dv, s = ni(i.kv + n, i.Iv, i.Tv);
    this.av.yv().W_(s), this.ov.yv().W_(i.Rv - s), this.hv.Qt().ka();
  }
  Cv(t) {
    null !== this.rv && null !== this.nv && (this.rv = null, this.nv.wv.style.display = "none");
  }
};
function Pn(t, i) {
  return t.Vv - i.Vv;
}
function kn(t, i, n) {
  const s = (t.Vv - i.Vv) / (t.wt - i.wt);
  return Math.sign(s) * Math.min(Math.abs(s), n);
}
var Tn = class {
  constructor(t, i, n, s) {
    this.Bv = null, this.Ev = null, this.Av = null, this.Lv = null, this.zv = null, this.Ov = 0, this.Nv = 0, this.Fv = t, this.Wv = i, this.Hv = n, this.Ps = s;
  }
  Uv(t, i) {
    if (null !== this.Bv) {
      if (this.Bv.wt === i) return void (this.Bv.Vv = t);
      if (Math.abs(this.Bv.Vv - t) < this.Ps) return;
    }
    this.Lv = this.Av, this.Av = this.Ev, this.Ev = this.Bv, this.Bv = { wt: i, Vv: t };
  }
  me(t, i) {
    if (null === this.Bv || null === this.Ev) return;
    if (i - this.Bv.wt > 50) return;
    let n = 0;
    const s = kn(this.Bv, this.Ev, this.Wv), e2 = Pn(this.Bv, this.Ev), r2 = [s], h2 = [e2];
    if (n += e2, null !== this.Av) {
      const t2 = kn(this.Ev, this.Av, this.Wv);
      if (Math.sign(t2) === Math.sign(s)) {
        const i2 = Pn(this.Ev, this.Av);
        if (r2.push(t2), h2.push(i2), n += i2, null !== this.Lv) {
          const t3 = kn(this.Av, this.Lv, this.Wv);
          if (Math.sign(t3) === Math.sign(s)) {
            const i3 = Pn(this.Av, this.Lv);
            r2.push(t3), h2.push(i3), n += i3;
          }
        }
      }
    }
    let a2 = 0;
    for (let t2 = 0; t2 < r2.length; ++t2) a2 += h2[t2] / n * r2[t2];
    Math.abs(a2) < this.Fv || (this.zv = { Vv: t, wt: i }, this.Nv = a2, this.Ov = (function(t2, i2) {
      const n2 = Math.log(i2);
      return Math.log(1 * n2 / -t2) / n2;
    })(Math.abs(a2), this.Hv));
  }
  Gc(t) {
    const i = u(this.zv), n = t - i.wt;
    return i.Vv + this.Nv * (Math.pow(this.Hv, n) - 1) / Math.log(this.Hv);
  }
  Kc(t) {
    return null === this.zv || this.$v(t) === this.Ov;
  }
  $v(t) {
    const i = t - u(this.zv).wt;
    return Math.min(i, this.Ov);
  }
};
var Rn = class {
  constructor(t, i) {
    this.jv = void 0, this.qv = void 0, this.Yv = void 0, this.vn = false, this.Kv = t, this.Gv = i, this.Zv();
  }
  Pt() {
    this.Zv();
  }
  Xv() {
    this.jv && this.Kv.removeChild(this.jv), this.qv && this.Kv.removeChild(this.qv), this.jv = void 0, this.qv = void 0;
  }
  Jv() {
    return this.vn !== this.Qv() || this.Yv !== this.tm();
  }
  tm() {
    return this.Gv.Qt().Xi().J(this.Gv.N().layout.textColor) > 160 ? "dark" : "light";
  }
  Qv() {
    return this.Gv.N().layout.attributionLogo;
  }
  im() {
    const t = new URL(location.href);
    return t.hostname ? "&utm_source=" + t.hostname + t.pathname : "";
  }
  Zv() {
    this.Jv() && (this.Xv(), this.vn = this.Qv(), this.vn && (this.Yv = this.tm(), this.qv = document.createElement("style"), this.qv.innerText = "a#tv-attr-logo{--fill:#131722;--stroke:#fff;position:absolute;left:10px;bottom:10px;height:19px;width:35px;margin:0;padding:0;border:0;z-index:3;}a#tv-attr-logo[data-dark]{--fill:#D1D4DC;--stroke:#131722;}", this.jv = document.createElement("a"), this.jv.href = `https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart${this.im()}`, this.jv.title = "Charting by TradingView", this.jv.id = "tv-attr-logo", this.jv.target = "_blank", this.jv.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="35" height="19" fill="none"><g fill-rule="evenodd" clip-path="url(#a)" clip-rule="evenodd"><path fill="var(--stroke)" d="M2 0H0v10h6v9h21.4l.5-1.3 6-15 1-2.7H23.7l-.5 1.3-.2.6a5 5 0 0 0-7-.9V0H2Zm20 17h4l5.2-13 .8-2h-7l-1 2.5-.2.5-1.5 3.8-.3.7V17Zm-.8-10a3 3 0 0 0 .7-2.7A3 3 0 1 0 16.8 7h4.4ZM14 7V2H2v6h6v9h4V7h2Z"/><path fill="var(--fill)" d="M14 2H2v6h6v9h6V2Zm12 15h-7l6-15h7l-6 15Zm-7-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></g><defs><clipPath id="a"><path fill="var(--stroke)" d="M0 0h35v19H0z"/></clipPath></defs></svg>', this.jv.toggleAttribute("data-dark", "dark" === this.Yv), this.Kv.appendChild(this.qv), this.Kv.appendChild(this.jv)));
  }
};
function Dn(t, n) {
  const s = u(t.ownerDocument).createElement("canvas");
  t.appendChild(s);
  const e2 = bindTo(s, { type: "device-pixel-content-box", options: { allowResizeObserver: true }, transform: (t2, i) => ({ width: Math.max(t2.width, i.width), height: Math.max(t2.height, i.height) }) });
  return e2.resizeCanvasElement(n), e2;
}
function In(t) {
  t.width = 1, t.height = 1, t.getContext("2d")?.clearRect(0, 0, 1, 1);
}
function Vn(t, i, n, s) {
  t.qh && t.qh(i, n, s);
}
function Bn(t, i, n, s) {
  t.st(i, n, s);
}
function En(t, i, n, s) {
  An(t(n, s), i, s);
}
function An(t, i, n) {
  for (const s of t) {
    const t2 = s.Tt(n);
    null !== t2 && i(t2);
  }
}
function Ln(t, i) {
  return (n) => {
    if (!(function(t2) {
      return void 0 !== t2.Ft;
    })(n)) return [];
    return (n.Ft()?.pl() ?? "") !== i ? [] : n.Qa?.(t) ?? [];
  };
}
function zn(t, i, n, s) {
  if (!t.length) return;
  let e2 = 0;
  const r2 = t[0].$t(s, true);
  let h2 = 1 === i ? n / 2 - (t[0].Hi() - r2 / 2) : t[0].Hi() - r2 / 2 - n / 2;
  h2 = Math.max(0, h2);
  for (let r3 = 1; r3 < t.length; r3++) {
    const a2 = t[r3], l2 = t[r3 - 1], o2 = l2.$t(s, false), _2 = a2.Hi(), u2 = l2.Hi();
    if (1 === i ? _2 > u2 - o2 : _2 < u2 + o2) {
      const s2 = u2 - o2 * i;
      a2.Ui(s2);
      const r4 = s2 - i * o2 / 2;
      if ((1 === i ? r4 < 0 : r4 > n) && h2 > 0) {
        const s3 = 1 === i ? -1 - r4 : r4 - n, a3 = Math.min(s3, h2);
        for (let n2 = e2; n2 < t.length; n2++) t[n2].Ui(t[n2].Hi() + i * a3);
        h2 -= a3;
      }
    } else e2 = r3, h2 = 1 === i ? u2 - o2 - _2 : _2 - (u2 + o2);
  }
}
var On = class {
  constructor(i, n, s, e2) {
    this.Ki = null, this.nm = null, this.sm = false, this.rm = new rt(200), this.hm = null, this.am = 0, this.lm = false, this.om = () => {
      this.lm || this.yt._m().Qt().mr();
    }, this.um = () => {
      this.lm || this.yt._m().Qt().mr();
    }, this.yt = i, this.yn = n, this.Ro = n.layout, this.bd = s, this.dm = "left" === e2, this.fm = Ln("normal", e2), this.pm = Ln("top", e2), this.vm = Ln("bottom", e2), this.uv = document.createElement("div"), this.uv.style.height = "100%", this.uv.style.overflow = "hidden", this.uv.style.width = "25px", this.uv.style.left = "0", this.uv.style.position = "relative", this.wm = Dn(this.uv, size({ width: 16, height: 16 })), this.wm.subscribeSuggestedBitmapSizeChanged(this.om);
    const r2 = this.wm.canvasElement;
    r2.style.position = "absolute", r2.style.zIndex = "1", r2.style.left = "0", r2.style.top = "0", this.Mm = Dn(this.uv, size({ width: 16, height: 16 })), this.Mm.subscribeSuggestedBitmapSizeChanged(this.um);
    const h2 = this.Mm.canvasElement;
    h2.style.position = "absolute", h2.style.zIndex = "2", h2.style.left = "0", h2.style.top = "0";
    const a2 = { Fp: this.Sv.bind(this), Op: this.Sv.bind(this), Dp: this.xv.bind(this), Tp: this.xv.bind(this), Wp: this.gm.bind(this), Ep: this.Cv.bind(this), Vp: this.Cv.bind(this), fp: this.bm.bind(this), _p: this.bm.bind(this), bp: this.Sm.bind(this), Zp: this.bv.bind(this) };
    this.sv = new Mn(this.Mm.canvasElement, a2, { Pp: () => !this.yn.handleScroll.vertTouchDrag, kp: () => true });
  }
  m() {
    this.sv.m(), this.Mm.unsubscribeSuggestedBitmapSizeChanged(this.um), In(this.Mm.canvasElement), this.Mm.dispose(), this.wm.unsubscribeSuggestedBitmapSizeChanged(this.om), In(this.wm.canvasElement), this.wm.dispose(), null !== this.Ki && this.Ki.__().u(this), this.Ki = null;
  }
  fv() {
    return this.uv;
  }
  P() {
    return this.Ro.fontSize;
  }
  xm() {
    const t = this.bd.N();
    return this.hm !== t.k && (this.rm.Os(), this.hm = t.k), t;
  }
  Cm() {
    if (null === this.Ki) return 0;
    let t = 0;
    const i = this.xm(), n = u(this.wm.canvasElement.getContext("2d", { colorSpace: this.yt._m().N().layout.colorSpace }));
    n.save();
    const s = this.Ki.zl();
    n.font = this.ym(), s.length > 0 && (t = Math.max(this.rm.Ii(n, s[0].eo), this.rm.Ii(n, s[s.length - 1].eo)));
    const e2 = this.Pm();
    for (let i2 = e2.length; i2--; ) {
      const s2 = this.rm.Ii(n, e2[i2].ri());
      s2 > t && (t = s2);
    }
    const r2 = this.Ki.Lt();
    if (null !== r2 && null !== this.nm && (2 !== (h2 = this.yn.crosshair).mode && h2.horzLine.visible && h2.horzLine.labelVisible)) {
      const i2 = this.Ki.Tn(1, r2), s2 = this.Ki.Tn(this.nm.height - 2, r2);
      t = Math.max(t, this.rm.Ii(n, this.Ki.Ji(Math.floor(Math.min(i2, s2)) + 0.11111111111111, r2)), this.rm.Ii(n, this.Ki.Ji(Math.ceil(Math.max(i2, s2)) - 0.11111111111111, r2)));
    }
    var h2;
    n.restore();
    const a2 = t || 34;
    return mn(Math.ceil(i.S + i.C + i.V + i.B + 5 + a2));
  }
  km(t) {
    null !== this.nm && equalSizes(this.nm, t) || (this.nm = t, this.lm = true, this.wm.resizeCanvasElement(t), this.Mm.resizeCanvasElement(t), this.lm = false, this.uv.style.width = `${t.width}px`, this.uv.style.height = `${t.height}px`);
  }
  Tm() {
    return u(this.nm).width;
  }
  un(t) {
    this.Ki !== t && (null !== this.Ki && this.Ki.__().u(this), this.Ki = t, t.__().i(this.wo.bind(this), this));
  }
  Ft() {
    return this.Ki;
  }
  Os() {
    const t = this.yt.yv();
    this.yt._m().Qt().au(t, u(this.Ft()));
  }
  Rm(t) {
    if (null === this.nm) return;
    const i = { colorSpace: this.yt._m().N().layout.colorSpace };
    if (1 !== t) {
      this.Dm(), this.wm.applySuggestedBitmapSize();
      const t2 = tryCreateCanvasRenderingTarget2D(this.wm, i);
      null !== t2 && (t2.useBitmapCoordinateSpace(((t3) => {
        this.Im(t3), this.Vm(t3);
      })), this.yt.Bm(t2, this.vm), this.Em(t2), this.yt.Bm(t2, this.fm), this.Am(t2));
    }
    this.Mm.applySuggestedBitmapSize();
    const n = tryCreateCanvasRenderingTarget2D(this.Mm, i);
    null !== n && (n.useBitmapCoordinateSpace((({ context: t2, bitmapSize: i2 }) => {
      t2.clearRect(0, 0, i2.width, i2.height);
    })), this.Lm(n), this.yt.Bm(n, this.pm));
  }
  vv() {
    return this.wm.bitmapSize;
  }
  mv(t, i, n, s) {
    const e2 = this.vv();
    if (e2.width > 0 && e2.height > 0 && (t.drawImage(this.wm.canvasElement, i, n), s)) {
      const s2 = this.Mm.canvasElement;
      t.drawImage(s2, i, n);
    }
  }
  Pt() {
    this.Ki?.zl();
  }
  Sv(t) {
    if (null === this.Ki || this.Ki.Zi() || !this.yn.handleScale.axisPressedMouseMove.price) return;
    const i = this.yt._m().Qt(), n = this.yt.yv();
    this.sm = true, i.Q_(n, this.Ki, t.localY);
  }
  xv(t) {
    if (null === this.Ki || !this.yn.handleScale.axisPressedMouseMove.price) return;
    const i = this.yt._m().Qt(), n = this.yt.yv(), s = this.Ki;
    i.tu(n, s, t.localY);
  }
  gm() {
    if (null === this.Ki || !this.yn.handleScale.axisPressedMouseMove.price) return;
    const t = this.yt._m().Qt(), i = this.yt.yv(), n = this.Ki;
    this.sm && (this.sm = false, t.iu(i, n));
  }
  Cv(t) {
    if (null === this.Ki || !this.yn.handleScale.axisPressedMouseMove.price) return;
    const i = this.yt._m().Qt(), n = this.yt.yv();
    this.sm = false, i.iu(n, this.Ki);
  }
  bm(t) {
    this.yn.handleScale.axisDoubleClickReset.price && this.Os();
  }
  Sm(t) {
    if (null === this.Ki) return;
    !this.yt._m().Qt().N().handleScale.axisPressedMouseMove.price || this.Ki.je() || this.Ki.No() || this.zm(1);
  }
  bv(t) {
    this.zm(0);
  }
  Pm() {
    const t = [], i = null === this.Ki ? void 0 : this.Ki;
    return ((n) => {
      for (let s = 0; s < n.length; ++s) {
        const e2 = n[s].qn(this.yt.yv(), i);
        for (let i2 = 0; i2 < e2.length; i2++) t.push(e2[i2]);
      }
    })(this.yt.yv().Dt()), t;
  }
  Im({ context: t, bitmapSize: i }) {
    const { width: n, height: s } = i, e2 = this.yt.yv().Qt(), r2 = e2.$(), h2 = e2.af();
    r2 === h2 ? z(t, 0, 0, n, s, r2) : F(t, 0, 0, n, s, r2, h2);
  }
  Vm({ context: t, bitmapSize: i, horizontalPixelRatio: n }) {
    if (null === this.nm || null === this.Ki || !this.Ki.N().borderVisible) return;
    t.fillStyle = this.Ki.N().borderColor;
    const s = Math.max(1, Math.floor(this.xm().S * n));
    let e2;
    e2 = this.dm ? i.width - s : 0, t.fillRect(e2, 0, s, i.height);
  }
  Em(t) {
    if (null === this.nm || null === this.Ki) return;
    const i = this.Ki.zl(), n = this.Ki.N(), s = this.xm(), e2 = this.dm ? this.nm.width - s.C : 0;
    n.borderVisible && n.ticksVisible && t.useBitmapCoordinateSpace((({ context: t2, horizontalPixelRatio: r2, verticalPixelRatio: h2 }) => {
      t2.fillStyle = n.borderColor;
      const a2 = Math.max(1, Math.floor(h2)), l2 = Math.floor(0.5 * h2), o2 = Math.round(s.C * r2);
      t2.beginPath();
      for (const n2 of i) t2.rect(Math.floor(e2 * r2), Math.round(n2.Vl * h2) - l2, o2, a2);
      t2.fill();
    })), t.useMediaCoordinateSpace((({ context: t2 }) => {
      t2.font = this.ym(), t2.fillStyle = n.textColor ?? this.Ro.textColor, t2.textAlign = this.dm ? "right" : "left", t2.textBaseline = "middle";
      const r2 = this.dm ? Math.round(e2 - s.V) : Math.round(e2 + s.C + s.V), h2 = i.map(((i2) => this.rm.Di(t2, i2.eo)));
      for (let n2 = i.length; n2--; ) {
        const s2 = i[n2];
        t2.fillText(s2.eo, r2, s2.Vl + h2[n2]);
      }
    }));
  }
  Dm() {
    if (null === this.nm || null === this.Ki) return;
    let t = this.nm.height / 2;
    const i = [], n = this.Ki.Dt().slice(), s = this.yt.yv(), e2 = this.xm();
    this.Ki === s.Zs() && this.yt.yv().Dt().forEach(((t2) => {
      s.Gs(t2) && n.push(t2);
    }));
    const r2 = this.Ki.kl()[0], h2 = this.Ki;
    n.forEach(((n2) => {
      const e3 = n2.qn(s, h2);
      e3.forEach(((t2) => {
        t2.$i() && null === t2.Wi() && (t2.Ui(null), i.push(t2));
      })), r2 === n2 && e3.length > 0 && (t = e3[0].Ei());
    }));
    this.Ki.N().alignLabels && this.Om(i, e2, t);
  }
  Om(t, i, n) {
    if (null === this.nm) return;
    const s = t.filter(((t2) => t2.Ei() <= n)), e2 = t.filter(((t2) => t2.Ei() > n));
    s.sort(((t2, i2) => i2.Ei() - t2.Ei())), s.length && e2.length && e2.push(s[0]), e2.sort(((t2, i2) => t2.Ei() - i2.Ei()));
    for (const n2 of t) {
      const t2 = Math.floor(n2.$t(i) / 2), s2 = n2.Ei();
      s2 > -t2 && s2 < t2 && n2.Ui(t2), s2 > this.nm.height - t2 && s2 < this.nm.height + t2 && n2.Ui(this.nm.height - t2);
    }
    zn(s, 1, this.nm.height, i), zn(e2, -1, this.nm.height, i);
  }
  Am(t) {
    if (null === this.nm) return;
    const i = this.Pm(), n = this.xm(), s = this.dm ? "right" : "left";
    i.forEach(((i2) => {
      if (i2.ji()) {
        i2.Tt(u(this.Ki)).st(t, n, this.rm, s);
      }
    }));
  }
  Lm(t) {
    if (null === this.nm || null === this.Ki) return;
    const i = this.yt._m().Qt(), n = [], s = this.yt.yv(), e2 = i.Vd().qn(s, this.Ki);
    e2.length && n.push(e2);
    const r2 = this.xm(), h2 = this.dm ? "right" : "left";
    n.forEach(((i2) => {
      i2.forEach(((i3) => {
        i3.Tt(u(this.Ki)).st(t, r2, this.rm, h2);
      }));
    }));
  }
  zm(t) {
    this.uv.style.cursor = 1 === t ? "ns-resize" : "default";
  }
  wo() {
    const t = this.Cm();
    this.am < t && this.yt._m().Qt().ka(), this.am = t;
  }
  ym() {
    return x(this.Ro.fontSize, this.Ro.fontFamily);
  }
};
function Nn(t, i) {
  return t.Xa?.(i) ?? [];
}
function Fn(t, i) {
  return t.jn?.(i) ?? [];
}
function Wn(t, i) {
  return t.cn?.(i) ?? [];
}
function Hn(t, i) {
  return t.qa?.(i) ?? [];
}
var Un = class _Un {
  constructor(i, n) {
    this.nm = size({ width: 0, height: 0 }), this.Nm = null, this.Fm = null, this.Wm = null, this.Hm = null, this.Um = false, this.$m = new d(), this.jm = new d(), this.qm = 0, this.Ym = false, this.Km = null, this.Gm = false, this.Zm = null, this.Xm = null, this.lm = false, this.om = () => {
      this.lm || null === this.Jm || this.sn().mr();
    }, this.um = () => {
      this.lm || null === this.Jm || this.sn().mr();
    }, this.Gv = i, this.Jm = n, this.Jm.mu().i(this.Qm.bind(this), this, true), this.tw = document.createElement("td"), this.tw.style.padding = "0", this.tw.style.position = "relative";
    const s = document.createElement("div");
    s.style.width = "100%", s.style.height = "100%", s.style.position = "relative", s.style.overflow = "hidden", this.iw = document.createElement("td"), this.iw.style.padding = "0", this.nw = document.createElement("td"), this.nw.style.padding = "0", this.tw.appendChild(s), this.wm = Dn(s, size({ width: 16, height: 16 })), this.wm.subscribeSuggestedBitmapSizeChanged(this.om);
    const e2 = this.wm.canvasElement;
    e2.style.position = "absolute", e2.style.zIndex = "1", e2.style.left = "0", e2.style.top = "0", this.Mm = Dn(s, size({ width: 16, height: 16 })), this.Mm.subscribeSuggestedBitmapSizeChanged(this.um);
    const r2 = this.Mm.canvasElement;
    r2.style.position = "absolute", r2.style.zIndex = "2", r2.style.left = "0", r2.style.top = "0", this._v = document.createElement("tr"), this._v.appendChild(this.iw), this._v.appendChild(this.tw), this._v.appendChild(this.nw), this.sw(), this.sv = new Mn(this.Mm.canvasElement, this, { Pp: () => null === this.Km && !this.Gv.N().handleScroll.vertTouchDrag, kp: () => null === this.Km && !this.Gv.N().handleScroll.horzTouchDrag });
  }
  m() {
    null !== this.Nm && this.Nm.m(), null !== this.Fm && this.Fm.m(), this.Wm = null, this.Mm.unsubscribeSuggestedBitmapSizeChanged(this.um), In(this.Mm.canvasElement), this.Mm.dispose(), this.wm.unsubscribeSuggestedBitmapSizeChanged(this.om), In(this.wm.canvasElement), this.wm.dispose(), null !== this.Jm && (this.Jm.mu().u(this), this.Jm.m()), this.sv.m();
  }
  yv() {
    return u(this.Jm);
  }
  ew(t) {
    null !== this.Jm && this.Jm.mu().u(this), this.Jm = t, null !== this.Jm && this.Jm.mu().i(_Un.prototype.Qm.bind(this), this, true), this.sw(), this.Gv.lv().indexOf(this) === this.Gv.lv().length - 1 ? (this.Wm = this.Wm ?? new Rn(this.tw, this.Gv), this.Wm.Pt()) : (this.Wm?.Xv(), this.Wm = null);
  }
  _m() {
    return this.Gv;
  }
  fv() {
    return this._v;
  }
  sw() {
    if (null !== this.Jm && (this.rw(), 0 !== this.sn().Jn().length)) {
      if (null !== this.Nm) {
        const t = this.Jm.X_();
        this.Nm.un(u(t));
      }
      if (null !== this.Fm) {
        const t = this.Jm.J_();
        this.Fm.un(u(t));
      }
    }
  }
  hw() {
    null !== this.Nm && this.Nm.Pt(), null !== this.Fm && this.Fm.Pt();
  }
  F_() {
    return null !== this.Jm ? this.Jm.F_() : 0;
  }
  W_(t) {
    this.Jm && this.Jm.W_(t);
  }
  bp(t) {
    if (!this.Jm) return;
    this.aw();
    const i = t.localX, n = t.localY;
    this.lw(i, n, t);
  }
  Fp(t) {
    this.aw(), this.ow(), this.lw(t.localX, t.localY, t);
  }
  Sp(t) {
    if (!this.Jm) return;
    this.aw();
    const i = t.localX, n = t.localY;
    this.lw(i, n, t);
  }
  Ap(t) {
    null !== this.Jm && (this.aw(), this.lw(t.localX, t.localY, t), this._w(t));
  }
  fp(t) {
    null !== this.Jm && this.uw(this.jm, t);
  }
  _p(t) {
    this.fp(t);
  }
  Dp(t) {
    this.aw(), this.cw(t), this.lw(t.localX, t.localY, t);
  }
  Ep(t) {
    null !== this.Jm && (this.aw(), this.Ym = false, this.dw(t));
  }
  Bp(t) {
    null !== this.Jm && this._w(t);
  }
  Xp(t) {
    if (this.Ym = true, null === this.Km) {
      const i = { x: t.localX, y: t.localY };
      this.fw(i, i, t);
    }
  }
  Zp(t) {
    null !== this.Jm && (this.aw(), this.Jm.Qt().Rd(null), this.pw());
  }
  mw() {
    return this.$m;
  }
  ww() {
    return this.jm;
  }
  $p() {
    this.qm = 1, this.sn().cs();
  }
  jp(t, i) {
    if (!this.Gv.N().handleScale.pinch) return;
    const n = 5 * (i - this.qm);
    this.qm = i, this.sn().Wd(t._t, n);
  }
  Op(t) {
    this.Ym = false, this.Gm = null !== this.Km, this.ow();
    const i = this.sn().Vd();
    null !== this.Km && i.It() && (this.Zm = { x: i.ni(), y: i.si() }, this.Km = { x: t.localX, y: t.localY });
  }
  Tp(t) {
    if (null === this.Jm) return;
    const i = t.localX, n = t.localY;
    if (null === this.Km) this.cw(t);
    else {
      this.Gm = false;
      const s = u(this.Zm), e2 = s.x + (i - this.Km.x), r2 = s.y + (n - this.Km.y);
      this.lw(e2, r2, t);
    }
  }
  Vp(t) {
    0 === this._m().N().trackingMode.exitMode && (this.Gm = true), this.Mw(), this.dw(t);
  }
  Qs(t, i) {
    const n = this.Jm;
    return null === n ? null : Bi(n, t, i);
  }
  gw(i, n) {
    u("left" === n ? this.Nm : this.Fm).km(size({ width: i, height: this.nm.height }));
  }
  pv() {
    return this.nm;
  }
  km(t) {
    equalSizes(this.nm, t) || (this.nm = t, this.lm = true, this.wm.resizeCanvasElement(t), this.Mm.resizeCanvasElement(t), this.lm = false, this.tw.style.width = t.width + "px", this.tw.style.height = t.height + "px");
  }
  bw() {
    const t = u(this.Jm);
    t.G_(t.X_()), t.G_(t.J_());
    for (const i of t.kl()) if (t.Gs(i)) {
      const n = i.Ft();
      null !== n && t.G_(n), i.Nn();
    }
    for (const i of t.Mu()) i.Nn();
  }
  vv() {
    return this.wm.bitmapSize;
  }
  mv(t, i, n, s) {
    const e2 = this.vv();
    if (e2.width > 0 && e2.height > 0 && (t.drawImage(this.wm.canvasElement, i, n), s)) {
      const s2 = this.Mm.canvasElement;
      null !== t && t.drawImage(s2, i, n);
    }
  }
  Rm(t) {
    if (0 === t) return;
    if (null === this.Jm) return;
    t > 1 && this.bw(), null !== this.Nm && this.Nm.Rm(t), null !== this.Fm && this.Fm.Rm(t);
    const i = { colorSpace: this.Gv.N().layout.colorSpace };
    if (1 !== t) {
      this.wm.applySuggestedBitmapSize();
      const t2 = tryCreateCanvasRenderingTarget2D(this.wm, i);
      null !== t2 && (t2.useBitmapCoordinateSpace(((t3) => {
        this.Im(t3);
      })), this.Jm && (this.Sw(t2, Nn), this.xw(t2), this.Sw(t2, Fn), this.Sw(t2, Wn)));
    }
    this.Mm.applySuggestedBitmapSize();
    const n = tryCreateCanvasRenderingTarget2D(this.Mm, i);
    null !== n && (n.useBitmapCoordinateSpace((({ context: t2, bitmapSize: i2 }) => {
      t2.clearRect(0, 0, i2.width, i2.height);
    })), this.Cw(n), this.Sw(n, Hn), this.Sw(n, Wn));
  }
  yw() {
    return this.Nm;
  }
  Pw() {
    return this.Fm;
  }
  Bm(t, i) {
    this.Sw(t, i);
  }
  Qm() {
    null !== this.Jm && this.Jm.mu().u(this), this.Jm = null;
  }
  _w(t) {
    this.uw(this.$m, t);
  }
  uw(t, i) {
    const n = i.localX, s = i.localY;
    t.v() && t.p(this.sn().Et().Vc(n), { x: n, y: s }, i);
  }
  Im({ context: t, bitmapSize: i }) {
    const { width: n, height: s } = i, e2 = this.sn(), r2 = e2.$(), h2 = e2.af();
    r2 === h2 ? z(t, 0, 0, n, s, h2) : F(t, 0, 0, n, s, r2, h2);
  }
  xw(t) {
    const i = u(this.Jm), n = i.wu().wr().Tt(i);
    null !== n && n.st(t, false);
  }
  Cw(t) {
    this.kw(t, Fn, Bn, this.sn().Vd());
  }
  Sw(t, i) {
    const n = u(this.Jm), s = i === Fn ? this.Tw() : null, e2 = null === s ? null : this.Rw(s, n), r2 = n.Mu();
    if (null === e2 || null === s) {
      const s2 = n._u();
      return this.Dw(t, i, Vn, r2, s2), void this.Dw(t, i, Bn, r2, s2);
    }
    const h2 = n.Dt(), a2 = (t2) => t2 === s ? e2.Za : void 0;
    this.Dw(t, i, Vn, r2, h2, a2), this.Dw(t, i, Bn, r2, h2, a2), this.kw(t, i, Vn, s, e2.qa), this.kw(t, i, Bn, s, e2.qa);
  }
  Dw(t, i, n, s, e2, r2) {
    for (const e3 of s) this.kw(t, i, n, e3);
    if (void 0 !== r2) for (const s2 of e2) this.kw(t, i, n, s2, r2(s2));
    else for (const s2 of e2) this.kw(t, i, n, s2);
  }
  Tw() {
    const t = u(this.Jm), i = t.Qt().cu()?.uu;
    if (!t.Qt().N().hoveredSeriesOnTop || void 0 === i) return null;
    for (const n of t.Dt()) if (n === i) return n;
    return null;
  }
  Rw(t, i) {
    const n = t.Ga?.(i) ?? null;
    return null === n || 0 === n.qa.length ? null : n;
  }
  kw(t, i, n, s, e2) {
    const r2 = u(this.Jm), h2 = r2.Qt().cu(), a2 = null !== h2 && h2.uu === s, l2 = null !== h2 && a2 && void 0 !== h2.bu ? h2.bu.ie : void 0, o2 = (i2) => n(i2, t, a2, l2);
    void 0 === e2 ? En(i, o2, s, r2) : An(e2, o2, r2);
  }
  rw() {
    if (null === this.Jm) return;
    const t = this.Gv, i = this.Jm.X_().N().visible, n = this.Jm.J_().N().visible;
    i || null === this.Nm || (this.iw.removeChild(this.Nm.fv()), this.Nm.m(), this.Nm = null), n || null === this.Fm || (this.nw.removeChild(this.Fm.fv()), this.Fm.m(), this.Fm = null);
    const s = t.Qt().Jd();
    i && null === this.Nm && (this.Nm = new On(this, t.N(), s, "left"), this.iw.appendChild(this.Nm.fv())), n && null === this.Fm && (this.Fm = new On(this, t.N(), s, "right"), this.nw.appendChild(this.Fm.fv()));
  }
  Iw(t) {
    return t.Jp && this.Ym || null !== this.Km;
  }
  lw(t, i, n) {
    t = Math.max(0, Math.min(t, this.nm.width - 1)), i = Math.max(0, Math.min(i, this.nm.height - 1)), this.sn().Kd(t, i, n, u(this.Jm));
  }
  pw() {
    this.sn().Zd();
  }
  Mw() {
    this.Gm && (this.Km = null, this.pw());
  }
  fw(t, i, n) {
    this.Km = t, this.Gm = false, this.lw(i.x, i.y, n);
    const s = this.sn().Vd();
    this.Zm = { x: s.ni(), y: s.si() };
  }
  sn() {
    return this.Gv.Qt();
  }
  dw(t) {
    if (!this.Um) return;
    const i = this.sn(), n = this.yv();
    if (i.eu(n, n.kn()), this.Hm = null, this.Um = false, i.jd(), null !== this.Xm) {
      const t2 = performance.now(), n2 = i.Et();
      this.Xm.me(n2.Oc(), t2), this.Xm.Kc(t2) || i.ps(this.Xm);
    }
  }
  aw() {
    this.Km = null;
  }
  ow() {
    if (!this.Jm) return;
    if (this.sn().cs(), document.activeElement !== document.body && document.activeElement !== document.documentElement) u(document.activeElement).blur();
    else {
      const t = document.getSelection();
      null !== t && t.removeAllRanges();
    }
    !this.Jm.kn().Zi() && this.sn().Et().Zi();
  }
  cw(t) {
    if (null === this.Jm) return;
    const i = this.sn(), n = i.Et();
    if (n.Zi()) return;
    const s = this.Gv.N(), e2 = s.handleScroll, r2 = s.kineticScroll;
    if ((!e2.pressedMouseMove || t.Jp) && (!e2.horzTouchDrag && !e2.vertTouchDrag || !t.Jp)) return;
    const h2 = this.Jm.kn(), a2 = performance.now();
    if (null !== this.Hm || this.Iw(t) || (this.Hm = { x: t.clientX, y: t.clientY, yf: a2, Vw: t.localX, Bw: t.localY }), null !== this.Hm && !this.Um && (this.Hm.x !== t.clientX || this.Hm.y !== t.clientY)) {
      if (t.Jp && r2.touch || !t.Jp && r2.mouse) {
        const t2 = n.ml();
        this.Xm = new Tn(0.2 / t2, 7 / t2, 0.997, 15 / t2), this.Xm.Uv(n.Oc(), this.Hm.yf);
      } else this.Xm = null;
      h2.Zi() || i.nu(this.Jm, h2, t.localY), i.Ud(t.localX), this.Um = true;
    }
    this.Um && (h2.Zi() || i.su(this.Jm, h2, t.localY), i.$d(t.localX), null !== this.Xm && this.Xm.Uv(n.Oc(), a2));
  }
};
var $n = class {
  constructor(i, n, s, e2, r2) {
    this.xt = true, this.nm = size({ width: 0, height: 0 }), this.om = () => this.Rm(3), this.dm = "left" === i, this.bd = s.Jd, this.yn = n, this.Ew = e2, this.Aw = r2, this.uv = document.createElement("div"), this.uv.style.width = "25px", this.uv.style.height = "100%", this.uv.style.overflow = "hidden", this.wm = Dn(this.uv, size({ width: 16, height: 16 })), this.wm.subscribeSuggestedBitmapSizeChanged(this.om);
  }
  m() {
    this.wm.unsubscribeSuggestedBitmapSizeChanged(this.om), In(this.wm.canvasElement), this.wm.dispose();
  }
  fv() {
    return this.uv;
  }
  pv() {
    return this.nm;
  }
  km(t) {
    equalSizes(this.nm, t) || (this.nm = t, this.wm.resizeCanvasElement(t), this.uv.style.width = `${t.width}px`, this.uv.style.height = `${t.height}px`, this.xt = true);
  }
  Rm(t) {
    if (t < 3 && !this.xt) return;
    if (0 === this.nm.width || 0 === this.nm.height) return;
    this.xt = false, this.wm.applySuggestedBitmapSize();
    const i = tryCreateCanvasRenderingTarget2D(this.wm, { colorSpace: this.yn.layout.colorSpace });
    null !== i && i.useBitmapCoordinateSpace(((t2) => {
      this.Im(t2), this.Vm(t2);
    }));
  }
  vv() {
    return this.wm.bitmapSize;
  }
  mv(t, i, n) {
    const s = this.vv();
    s.width > 0 && s.height > 0 && t.drawImage(this.wm.canvasElement, i, n);
  }
  Vm({ context: t, bitmapSize: i, horizontalPixelRatio: n, verticalPixelRatio: s }) {
    if (!this.Ew()) return;
    t.fillStyle = this.yn.timeScale.borderColor;
    const e2 = Math.floor(this.bd.N().S * n), r2 = Math.floor(this.bd.N().S * s), h2 = this.dm ? i.width - e2 : 0;
    t.fillRect(h2, 0, e2, r2);
  }
  Im({ context: t, bitmapSize: i }) {
    z(t, 0, 0, i.width, i.height, this.Aw());
  }
};
function jn(t) {
  return (i) => i.tl?.(t) ?? [];
}
var qn = jn("normal");
var Yn = jn("top");
var Kn = jn("bottom");
var Gn = class {
  constructor(i, n) {
    this.Lw = null, this.zw = null, this.M = null, this.Ow = false, this.nm = size({ width: 0, height: 0 }), this.Nw = new d(), this.rm = new rt(5), this.lm = false, this.om = () => {
      this.lm || this.Gv.Qt().mr();
    }, this.um = () => {
      this.lm || this.Gv.Qt().mr();
    }, this.Gv = i, this.Pu = n, this.yn = i.N().layout, this.jv = document.createElement("tr"), this.Fw = document.createElement("td"), this.Fw.style.padding = "0", this.Ww = document.createElement("td"), this.Ww.style.padding = "0", this.uv = document.createElement("td"), this.uv.style.height = "25px", this.uv.style.padding = "0", this.Hw = document.createElement("div"), this.Hw.style.width = "100%", this.Hw.style.height = "100%", this.Hw.style.position = "relative", this.Hw.style.overflow = "hidden", this.uv.appendChild(this.Hw), this.wm = Dn(this.Hw, size({ width: 16, height: 16 })), this.wm.subscribeSuggestedBitmapSizeChanged(this.om);
    const s = this.wm.canvasElement;
    s.style.position = "absolute", s.style.zIndex = "1", s.style.left = "0", s.style.top = "0", this.Mm = Dn(this.Hw, size({ width: 16, height: 16 })), this.Mm.subscribeSuggestedBitmapSizeChanged(this.um);
    const e2 = this.Mm.canvasElement;
    e2.style.position = "absolute", e2.style.zIndex = "2", e2.style.left = "0", e2.style.top = "0", this.jv.appendChild(this.Fw), this.jv.appendChild(this.uv), this.jv.appendChild(this.Ww), this.Uw(), this.Gv.Qt().N_().i(this.Uw.bind(this), this), this.sv = new Mn(this.Mm.canvasElement, this, { Pp: () => true, kp: () => !this.Gv.N().handleScroll.horzTouchDrag });
  }
  m() {
    this.sv.m(), null !== this.Lw && this.Lw.m(), null !== this.zw && this.zw.m(), this.Mm.unsubscribeSuggestedBitmapSizeChanged(this.um), In(this.Mm.canvasElement), this.Mm.dispose(), this.wm.unsubscribeSuggestedBitmapSizeChanged(this.om), In(this.wm.canvasElement), this.wm.dispose();
  }
  fv() {
    return this.jv;
  }
  $w() {
    return this.Lw;
  }
  jw() {
    return this.zw;
  }
  Fp(t) {
    if (this.Ow) return;
    this.Ow = true;
    const i = this.Gv.Qt();
    !i.Et().Zi() && this.Gv.N().handleScale.axisPressedMouseMove.time && i.Fd(t.localX);
  }
  Op(t) {
    this.Fp(t);
  }
  Wp() {
    const t = this.Gv.Qt();
    !t.Et().Zi() && this.Ow && (this.Ow = false, this.Gv.N().handleScale.axisPressedMouseMove.time && t.Yd());
  }
  Dp(t) {
    const i = this.Gv.Qt();
    !i.Et().Zi() && this.Gv.N().handleScale.axisPressedMouseMove.time && i.qd(t.localX);
  }
  Tp(t) {
    this.Dp(t);
  }
  Ep() {
    this.Ow = false;
    const t = this.Gv.Qt();
    t.Et().Zi() && !this.Gv.N().handleScale.axisPressedMouseMove.time || t.Yd();
  }
  Vp() {
    this.Ep();
  }
  fp() {
    this.Gv.N().handleScale.axisDoubleClickReset.time && this.Gv.Qt().ws();
  }
  _p() {
    this.fp();
  }
  bp() {
    this.Gv.Qt().N().handleScale.axisPressedMouseMove.time && this.zm(1);
  }
  Zp() {
    this.zm(0);
  }
  pv() {
    return this.nm;
  }
  qw() {
    return this.Nw;
  }
  Yw(i, s, e2) {
    equalSizes(this.nm, i) || (this.nm = i, this.lm = true, this.wm.resizeCanvasElement(i), this.Mm.resizeCanvasElement(i), this.lm = false, this.uv.style.width = `${i.width}px`, this.uv.style.height = `${i.height}px`, this.Nw.p(i)), null !== this.Lw && this.Lw.km(size({ width: s, height: i.height })), null !== this.zw && this.zw.km(size({ width: e2, height: i.height }));
  }
  Kw() {
    const t = this.Gw();
    return Math.ceil(t.S + t.C + t.P + t.A + t.I + t.Zw);
  }
  Pt() {
    this.Gv.Qt().Et().zl();
  }
  vv() {
    return this.wm.bitmapSize;
  }
  mv(t, i, n, s) {
    const e2 = this.vv();
    if (e2.width > 0 && e2.height > 0 && (t.drawImage(this.wm.canvasElement, i, n), s)) {
      const s2 = this.Mm.canvasElement;
      t.drawImage(s2, i, n);
    }
  }
  Rm(t) {
    if (0 === t) return;
    const i = { colorSpace: this.yn.colorSpace };
    if (1 !== t) {
      this.wm.applySuggestedBitmapSize();
      const n2 = tryCreateCanvasRenderingTarget2D(this.wm, i);
      null !== n2 && (n2.useBitmapCoordinateSpace(((t2) => {
        this.Im(t2), this.Vm(t2), this.Xw(n2, Kn);
      })), this.Em(n2), this.Xw(n2, qn)), null !== this.Lw && this.Lw.Rm(t), null !== this.zw && this.zw.Rm(t);
    }
    this.Mm.applySuggestedBitmapSize();
    const n = tryCreateCanvasRenderingTarget2D(this.Mm, i);
    null !== n && (n.useBitmapCoordinateSpace((({ context: t2, bitmapSize: i2 }) => {
      t2.clearRect(0, 0, i2.width, i2.height);
    })), this.Jw([...this.Gv.Qt().Jn(), this.Gv.Qt().Vd()], n), this.Xw(n, Yn));
  }
  Xw(t, i) {
    const n = this.Gv.Qt().Jn();
    for (const s of n) En(i, ((i2) => Vn(i2, t, false, void 0)), s, void 0);
    for (const s of n) En(i, ((i2) => Bn(i2, t, false, void 0)), s, void 0);
  }
  Im({ context: t, bitmapSize: i }) {
    z(t, 0, 0, i.width, i.height, this.Gv.Qt().af());
  }
  Vm({ context: t, bitmapSize: i, verticalPixelRatio: n }) {
    if (this.Gv.N().timeScale.borderVisible) {
      t.fillStyle = this.Qw();
      const s = Math.max(1, Math.floor(this.Gw().S * n));
      t.fillRect(0, 0, i.width, s);
    }
  }
  Em(t) {
    const i = this.Gv.Qt().Et(), n = i.zl();
    if (!n || 0 === n.length) return;
    const s = this.Pu.maxTickMarkWeight(n), e2 = this.Gw(), r2 = i.N();
    r2.borderVisible && r2.ticksVisible && t.useBitmapCoordinateSpace((({ context: t2, horizontalPixelRatio: i2, verticalPixelRatio: s2 }) => {
      t2.strokeStyle = this.Qw(), t2.fillStyle = this.Qw();
      const r3 = Math.max(1, Math.floor(i2)), h2 = Math.floor(0.5 * i2);
      t2.beginPath();
      const a2 = Math.round(e2.C * s2);
      for (let s3 = n.length; s3--; ) {
        const e3 = Math.round(n[s3].coord * i2);
        t2.rect(e3 - h2, 0, r3, a2);
      }
      t2.fill();
    })), t.useMediaCoordinateSpace((({ context: t2 }) => {
      const i2 = e2.S + e2.C + e2.A + e2.P / 2;
      t2.textAlign = "center", t2.textBaseline = "middle", t2.fillStyle = this.H(), t2.font = this.ym();
      for (const e3 of n) if (e3.weight < s) {
        const n2 = e3.needAlignCoordinate ? this.tM(t2, e3.coord, e3.label) : e3.coord;
        t2.fillText(e3.label, n2, i2);
      }
      this.Gv.N().timeScale.allowBoldLabels && (t2.font = this.iM());
      for (const e3 of n) if (e3.weight >= s) {
        const n2 = e3.needAlignCoordinate ? this.tM(t2, e3.coord, e3.label) : e3.coord;
        t2.fillText(e3.label, n2, i2);
      }
    }));
  }
  tM(t, i, n) {
    const s = this.rm.Ii(t, n), e2 = s / 2, r2 = Math.floor(i - e2) + 0.5;
    return r2 < 0 ? i += Math.abs(0 - r2) : r2 + s > this.nm.width && (i -= Math.abs(this.nm.width - (r2 + s))), i;
  }
  Jw(t, i) {
    const n = this.Gw();
    for (const s of t) for (const t2 of s.dn()) t2.Tt().st(i, n);
  }
  Qw() {
    return this.Gv.N().timeScale.borderColor;
  }
  H() {
    return this.yn.textColor;
  }
  F() {
    return this.yn.fontSize;
  }
  ym() {
    return x(this.F(), this.yn.fontFamily);
  }
  iM() {
    return x(this.F(), this.yn.fontFamily, "bold");
  }
  Gw() {
    null === this.M && (this.M = { S: 1, L: NaN, A: NaN, I: NaN, tn: NaN, C: 5, P: NaN, k: "", Qi: new rt(), Zw: 0 });
    const t = this.M, i = this.ym();
    if (t.k !== i) {
      const n = this.F();
      t.P = n, t.k = i, t.A = 3 * n / 12, t.I = 3 * n / 12, t.tn = 9 * n / 12, t.L = 0, t.Zw = 4 * n / 12, t.Qi.Os();
    }
    return this.M;
  }
  zm(t) {
    this.uv.style.cursor = 1 === t ? "ew-resize" : "default";
  }
  Uw() {
    const t = this.Gv.Qt(), i = t.N();
    i.leftPriceScale.visible || null === this.Lw || (this.Fw.removeChild(this.Lw.fv()), this.Lw.m(), this.Lw = null), i.rightPriceScale.visible || null === this.zw || (this.Ww.removeChild(this.zw.fv()), this.zw.m(), this.zw = null);
    const n = { Jd: this.Gv.Qt().Jd() }, s = () => i.leftPriceScale.borderVisible && t.Et().N().borderVisible, e2 = () => t.af();
    i.leftPriceScale.visible && null === this.Lw && (this.Lw = new $n("left", i, n, s, e2), this.Fw.appendChild(this.Lw.fv())), i.rightPriceScale.visible && null === this.zw && (this.zw = new $n("right", i, n, s, e2), this.Ww.appendChild(this.zw.fv()));
  }
};
var Zn = !!dn && !!navigator.userAgentData && navigator.userAgentData.brands.some(((t) => t.brand.includes("Chromium"))) && !!dn && (navigator?.userAgentData?.platform ? "Windows" === navigator.userAgentData.platform : navigator.userAgent.toLowerCase().indexOf("win") >= 0);
var Xn = class {
  constructor(t, i, n) {
    var s;
    this.nM = [], this.sM = [], this.eM = 0, this.oo = 0, this.k_ = 0, this.rM = 0, this.hM = 0, this.aM = null, this.lM = false, this.$m = new d(), this.jm = new d(), this.wd = new d(), this.oM = null, this._M = null, this.Kv = t, this.yn = i, this.Pu = n, this.jv = document.createElement("div"), this.jv.classList.add("tv-lightweight-charts"), this.jv.style.overflow = "hidden", this.jv.style.direction = "ltr", this.jv.style.width = "100%", this.jv.style.height = "100%", (s = this.jv).style.userSelect = "none", s.style.webkitUserSelect = "none", s.style.msUserSelect = "none", s.style.MozUserSelect = "none", s.style.webkitTapHighlightColor = "transparent", this.uM = document.createElement("table"), this.uM.setAttribute("cellspacing", "0"), this.jv.appendChild(this.uM), this.cM = this.dM.bind(this), Jn(this.yn) && this.fM(true), this.sn = new qi(this.gd.bind(this), this.yn, n), this.Qt().Bd().i(this.pM.bind(this), this), this.vM = new Gn(this, this.Pu), this.uM.appendChild(this.vM.fv());
    const e2 = i.autoSize && this.mM();
    let r2 = this.yn.width, h2 = this.yn.height;
    if (e2 || 0 === r2 || 0 === h2) {
      const i2 = t.getBoundingClientRect();
      r2 = r2 || i2.width, h2 = h2 || i2.height;
    }
    this.wM(r2, h2), this.MM(), t.appendChild(this.jv), this.gM(), this.sn.Et().Jc().i(this.sn.ka.bind(this.sn), this), this.sn.N_().i(this.sn.ka.bind(this.sn), this);
  }
  Qt() {
    return this.sn;
  }
  N() {
    return this.yn;
  }
  lv() {
    return this.nM;
  }
  bM() {
    return this.vM;
  }
  m() {
    this.fM(false), 0 !== this.eM && window.cancelAnimationFrame(this.eM), this.sn.Bd().u(this), this.sn.Et().Jc().u(this), this.sn.N_().u(this), this.sn.m();
    for (const t of this.nM) this.uM.removeChild(t.fv()), t.mw().u(this), t.ww().u(this), t.m();
    this.nM = [];
    for (const t of this.sM) this.SM(t);
    this.sM = [], u(this.vM).m(), null !== this.jv.parentElement && this.jv.parentElement.removeChild(this.jv), this.wd.m(), this.$m.m(), this.jm.m(), this.xM();
  }
  wM(i, n, s = false) {
    if (this.oo === n && this.k_ === i) return;
    const e2 = (function(i2) {
      const n2 = Math.floor(i2.width), s2 = Math.floor(i2.height);
      return size({ width: n2 - n2 % 2, height: s2 - s2 % 2 });
    })(size({ width: i, height: n }));
    this.oo = e2.height, this.k_ = e2.width;
    const r2 = this.oo + "px", h2 = this.k_ + "px";
    if (this.CM() || (u(this.jv).style.height = r2, u(this.jv).style.width = h2), this.uM.style.height = r2, this.uM.style.width = h2, s) {
      0 !== this.eM && (window.cancelAnimationFrame(this.eM), this.eM = 0), this.lM = false;
      const t = X.ys();
      null !== this.aM && (t.Ss(this.aM), this.aM = null), this.yM(t, performance.now());
    } else this.sn.ka();
  }
  Rm(t) {
    void 0 === t && (t = X.ys());
    for (let i = 0; i < this.nM.length; i++) this.nM[i].Rm(t._s(i).rs);
    this.yn.timeScale.visible && this.vM.Rm(t.ls());
  }
  vr(t) {
    const i = Jn(this.yn);
    this.sn.vr(t);
    const n = Jn(this.yn);
    n !== i && this.fM(n), t.layout?.panes && this.PM(), this.gM(), this.kM(t);
  }
  mw() {
    return this.$m;
  }
  ww() {
    return this.jm;
  }
  Bd() {
    return this.wd;
  }
  TM(t = false) {
    null !== this.aM && (this.yM(this.aM, performance.now()), this.aM = null);
    const i = this.RM(null), n = document.createElement("canvas");
    n.width = i.width, n.height = i.height;
    const s = u(n.getContext("2d"));
    return this.RM(s, t), n;
  }
  DM(t) {
    if ("left" === t && !this.IM()) return 0;
    if ("right" === t && !this.VM()) return 0;
    if (0 === this.nM.length) return 0;
    return u("left" === t ? this.nM[0].yw() : this.nM[0].Pw()).Tm();
  }
  CM() {
    return this.yn.autoSize && null !== this.oM;
  }
  Mv() {
    return this.jv;
  }
  BM(t) {
    this._M = t, this._M ? this.Mv().style.setProperty("cursor", t) : this.Mv().style.removeProperty("cursor");
  }
  EM() {
    return this._M;
  }
  AM(t) {
    return _(this.nM[t]).pv();
  }
  PM() {
    this.sM.forEach(((t) => {
      t.Pt();
    }));
  }
  kM(t) {
    (void 0 !== t.autoSize || !this.oM || void 0 === t.width && void 0 === t.height) && (t.autoSize && !this.oM && this.mM(), false === t.autoSize && null !== this.oM && this.xM(), t.autoSize || void 0 === t.width && void 0 === t.height || this.wM(t.width || this.k_, t.height || this.oo));
  }
  RM(i, n) {
    let s = 0, e2 = 0;
    const r2 = this.nM[0], h2 = (t, s2) => {
      let e3 = 0;
      for (let r3 = 0; r3 < this.nM.length; r3++) {
        const h3 = this.nM[r3], a3 = u("left" === t ? h3.yw() : h3.Pw()), l2 = a3.vv();
        if (null !== i && a3.mv(i, s2, e3, n), e3 += l2.height, r3 < this.nM.length - 1) {
          const t2 = this.sM[r3], n2 = t2.vv();
          null !== i && t2.mv(i, s2, e3), e3 += n2.height;
        }
      }
    };
    if (this.IM()) {
      h2("left", 0);
      s += u(r2.yw()).vv().width;
    }
    for (let t = 0; t < this.nM.length; t++) {
      const r3 = this.nM[t], h3 = r3.vv();
      if (null !== i && r3.mv(i, s, e2, n), e2 += h3.height, t < this.nM.length - 1) {
        const n2 = this.sM[t], r4 = n2.vv();
        null !== i && n2.mv(i, s, e2), e2 += r4.height;
      }
    }
    if (s += r2.vv().width, this.VM()) {
      h2("right", s);
      s += u(r2.Pw()).vv().width;
    }
    const a2 = (t, n2, s2) => {
      u("left" === t ? this.vM.$w() : this.vM.jw()).mv(u(i), n2, s2);
    };
    if (this.yn.timeScale.visible) {
      const t = this.vM.vv();
      if (null !== i) {
        let s2 = 0;
        this.IM() && (a2("left", s2, e2), s2 = u(r2.yw()).vv().width), this.vM.mv(i, s2, e2, n), s2 += t.width, this.VM() && a2("right", s2, e2);
      }
      e2 += t.height;
    }
    return size({ width: s, height: e2 });
  }
  LM() {
    let i = 0, n = 0, s = 0;
    for (const t of this.nM) this.IM() && (n = Math.max(n, u(t.yw()).Cm(), this.yn.leftPriceScale.minimumWidth)), this.VM() && (s = Math.max(s, u(t.Pw()).Cm(), this.yn.rightPriceScale.minimumWidth)), i += t.F_();
    n = mn(n), s = mn(s);
    const e2 = this.k_, r2 = this.oo, h2 = Math.max(e2 - n - s, 0), a2 = 1 * this.sM.length, l2 = this.yn.timeScale.visible;
    let o2 = l2 ? Math.max(this.vM.Kw(), this.yn.timeScale.minimumHeight) : 0;
    var _2;
    o2 = (_2 = o2) + _2 % 2;
    const c2 = a2 + o2, d2 = r2 < c2 ? 0 : r2 - c2, f2 = d2 / i;
    let p2 = 0;
    const v2 = window.devicePixelRatio || 1;
    for (let i2 = 0; i2 < this.nM.length; ++i2) {
      const e3 = this.nM[i2];
      e3.ew(this.sn.Gn()[i2]);
      let r3 = 0, a3 = 0;
      a3 = i2 === this.nM.length - 1 ? Math.ceil((d2 - p2) * v2) / v2 : Math.round(e3.F_() * f2 * v2) / v2, r3 = Math.max(a3, 2), p2 += r3, e3.km(size({ width: h2, height: r3 })), this.IM() && e3.gw(n, "left"), this.VM() && e3.gw(s, "right"), e3.yv() && this.sn.Ed(e3.yv(), r3);
    }
    this.vM.Yw(size({ width: l2 ? h2 : 0, height: o2 }), l2 ? n : 0, l2 ? s : 0), this.sn.H_(h2), this.rM !== n && (this.rM = n), this.hM !== s && (this.hM = s);
  }
  fM(t) {
    t ? this.jv.addEventListener("wheel", this.cM, { passive: false }) : this.jv.removeEventListener("wheel", this.cM);
  }
  zM(t) {
    switch (t.deltaMode) {
      case t.DOM_DELTA_PAGE:
        return 120;
      case t.DOM_DELTA_LINE:
        return 32;
    }
    return Zn ? 1 / window.devicePixelRatio : 1;
  }
  dM(t) {
    if (!(0 !== t.deltaX && this.yn.handleScroll.mouseWheel || 0 !== t.deltaY && this.yn.handleScale.mouseWheel)) return;
    const i = this.zM(t), n = i * t.deltaX / 100, s = -i * t.deltaY / 100;
    if (t.cancelable && t.preventDefault(), 0 !== s && this.yn.handleScale.mouseWheel) {
      const i2 = Math.sign(s) * Math.min(1, Math.abs(s)), n2 = t.clientX - this.jv.getBoundingClientRect().left;
      this.Qt().Wd(n2, i2);
    }
    0 !== n && this.yn.handleScroll.mouseWheel && this.Qt().Hd(-80 * n);
  }
  yM(t, i) {
    const n = t.ls();
    3 === n && this.OM(), 3 !== n && 2 !== n || (this.NM(t), this.FM(t, i), this.vM.Pt(), this.nM.forEach(((t2) => {
      t2.hw();
    })), 3 === this.aM?.ls() && (this.aM.Ss(t), this.OM(), this.NM(this.aM), this.FM(this.aM, i), t = this.aM, this.aM = null)), this.Rm(t);
  }
  FM(t, i) {
    for (const n of t.bs()) this.xs(n, i);
  }
  NM(t) {
    const i = this.sn.Gn();
    for (let n = 0; n < i.length; n++) t._s(n).hs && i[n].lu();
  }
  xs(t, i) {
    const n = this.sn.Et();
    switch (t.ds) {
      case 0:
        n.td();
        break;
      case 1:
        n.nd(t.Wt);
        break;
      case 2:
        n.Ms(t.Wt);
        break;
      case 3:
        n.gs(t.Wt);
        break;
      case 4:
        n.Wc();
        break;
      case 5:
        t.Wt.Kc(i) || n.gs(t.Wt.Gc(i));
    }
  }
  gd(t) {
    null !== this.aM ? this.aM.Ss(t) : this.aM = t, this.lM || (this.lM = true, this.eM = window.requestAnimationFrame(((t2) => {
      if (this.lM = false, this.eM = 0, null !== this.aM) {
        const i = this.aM;
        this.aM = null, this.yM(i, t2);
        for (const n of i.bs()) if (5 === n.ds && !n.Wt.Kc(t2)) {
          this.Qt().ps(n.Wt);
          break;
        }
      }
    })));
  }
  OM() {
    this.MM();
  }
  SM(t) {
    this.uM.removeChild(t.fv()), t.m();
  }
  MM() {
    const t = this.sn.Gn(), i = t.length, n = this.nM.length;
    for (let t2 = i; t2 < n; t2++) {
      const t3 = _(this.nM.pop());
      this.uM.removeChild(t3.fv()), t3.mw().u(this), t3.ww().u(this), t3.m();
      const i2 = this.sM.pop();
      void 0 !== i2 && this.SM(i2);
    }
    for (let s = n; s < i; s++) {
      const i2 = new Un(this, t[s]);
      if (i2.mw().i(this.WM.bind(this, i2), this), i2.ww().i(this.HM.bind(this, i2), this), this.nM.push(i2), s > 0) {
        const t2 = new yn(this, s - 1, s);
        this.sM.push(t2), this.uM.insertBefore(t2.fv(), this.vM.fv());
      }
      this.uM.insertBefore(i2.fv(), this.vM.fv());
    }
    for (let n2 = 0; n2 < i; n2++) {
      const i2 = t[n2], s = this.nM[n2];
      s.yv() !== i2 ? s.ew(i2) : s.sw();
    }
    this.gM(), this.LM();
  }
  UM(t, i, n, s) {
    const e2 = /* @__PURE__ */ new Map();
    if (null !== t) {
      this.sn.Jn().forEach(((i2) => {
        const n2 = i2.Un().Hn(t);
        null !== n2 && e2.set(i2, n2);
      }));
    }
    let r2;
    if (null !== t) {
      const i2 = this.sn.Et().en(t)?.originalTime;
      void 0 !== i2 && (r2 = i2);
    }
    const h2 = this.Qt().cu(), a2 = this.$M(s), l2 = (function(t2, i2) {
      const n2 = null !== t2 && t2.uu instanceof Jt ? t2.uu : void 0, s2 = t2?.bu?.te, e3 = void 0 !== i2 && -1 !== i2 ? i2 : void 0;
      return null === t2 || void 0 === t2.ee ? { jM: n2, qM: s2 } : { jM: n2, qM: s2, YM: { ds: t2.ee, KM: (r3 = t2.uu, h3 = t2.ee, r3 instanceof Pi ? "pane-primitive" : "marker" === h3 || "primitive" === h3 ? "series-primitive" : "series"), GM: vn(t2.ee, s2), Y_: n2, ZM: s2, XM: e3 } };
      var r3, h3;
    })(h2, a2);
    return { Qr: r2, $n: t ?? void 0, JM: i ?? void 0, XM: -1 !== a2 ? a2 : void 0, jM: l2.jM, QM: e2, qM: l2.qM, YM: l2.YM, tg: n ?? void 0 };
  }
  $M(t) {
    let i = -1;
    if (t) i = this.nM.indexOf(t);
    else {
      const t2 = this.Qt().Vd().Kn();
      null !== t2 && (i = this.Qt().Gn().indexOf(t2));
    }
    return i;
  }
  WM(t, i, n, s) {
    this.$m.p((() => this.UM(i, n, s, t)));
  }
  HM(t, i, n, s) {
    this.jm.p((() => this.UM(i, n, s, t)));
  }
  pM(t, i, n) {
    this.BM(this.Qt().cu()?.gu ?? null), this.wd.p((() => this.UM(t, i, n)));
  }
  gM() {
    const t = this.yn.timeScale.visible ? "" : "none";
    this.vM.fv().style.display = t;
  }
  IM() {
    return this.nM[0].yv().X_().N().visible;
  }
  VM() {
    return this.nM[0].yv().J_().N().visible;
  }
  mM() {
    return "ResizeObserver" in window && (this.oM = new ResizeObserver(((t) => {
      const i = t[t.length - 1];
      if (!i) return;
      const n = i.contentRect.width, s = i.contentRect.height;
      this.wM(n, s, true);
    })), this.oM.observe(this.Kv, { box: "border-box" }), true);
  }
  xM() {
    null !== this.oM && this.oM.disconnect(), this.oM = null;
  }
};
function Jn(t) {
  return Boolean(t.handleScroll.mouseWheel || t.handleScale.mouseWheel);
}
function Qn(t) {
  return void 0 === t.open && void 0 === t.value;
}
function ts(t) {
  return (function(t2) {
    return void 0 !== t2.open;
  })(t) || (function(t2) {
    return void 0 !== t2.value;
  })(t);
}
function is(t, i, n, s) {
  const e2 = n.value, r2 = { $n: i, wt: t, Wt: [e2, e2, e2, e2], Qr: s };
  return void 0 !== n.color && (r2.R = n.color), r2;
}
function ns(t, i, n, s) {
  const e2 = n.value, r2 = { $n: i, wt: t, Wt: [e2, e2, e2, e2], Qr: s };
  return void 0 !== n.lineColor && (r2.vt = n.lineColor), void 0 !== n.topColor && (r2.ah = n.topColor), void 0 !== n.bottomColor && (r2.oh = n.bottomColor), r2;
}
function ss(t, i, n, s) {
  const e2 = n.value, r2 = { $n: i, wt: t, Wt: [e2, e2, e2, e2], Qr: s };
  return void 0 !== n.topLineColor && (r2._h = n.topLineColor), void 0 !== n.bottomLineColor && (r2.uh = n.bottomLineColor), void 0 !== n.topFillColor1 && (r2.dh = n.topFillColor1), void 0 !== n.topFillColor2 && (r2.fh = n.topFillColor2), void 0 !== n.bottomFillColor1 && (r2.ph = n.bottomFillColor1), void 0 !== n.bottomFillColor2 && (r2.mh = n.bottomFillColor2), r2;
}
function es(t, i, n, s) {
  const e2 = { $n: i, wt: t, Wt: [n.open, n.high, n.low, n.close], Qr: s };
  return void 0 !== n.color && (e2.R = n.color), e2;
}
function rs(t, i, n, s) {
  const e2 = { $n: i, wt: t, Wt: [n.open, n.high, n.low, n.close], Qr: s };
  return void 0 !== n.color && (e2.R = n.color), void 0 !== n.borderColor && (e2.Ht = n.borderColor), void 0 !== n.wickColor && (e2.hh = n.wickColor), e2;
}
function hs(t, i, n, s, e2) {
  const r2 = _(e2)(n), h2 = Math.max(...r2), a2 = Math.min(...r2), l2 = r2[r2.length - 1], o2 = [l2, h2, a2, l2], { time: u2, color: c2, ...d2 } = n;
  return { $n: i, wt: t, Wt: o2, Qr: s, ue: d2, R: c2 };
}
function as(t) {
  return void 0 !== t.Wt;
}
function ls(t, i) {
  return void 0 !== i.customValues && (t.ig = i.customValues), t;
}
function os(t) {
  return (i, n, s, e2, r2, h2) => (function(t2, i2) {
    return i2 ? i2(t2) : Qn(t2);
  })(s, h2) ? ls({ wt: i, $n: n, Qr: e2 }, s) : ls(t(i, n, s, e2, r2), s);
}
function _s(t) {
  return { Candlestick: os(rs), Bar: os(es), Area: os(ns), Baseline: os(ss), Histogram: os(is), Line: os(is), Custom: os(hs) }[t];
}
function us(t) {
  return { $n: 0, ng: /* @__PURE__ */ new Map(), Oa: t };
}
function cs(t, i) {
  if (void 0 !== t && 0 !== t.length) return { sg: i.key(t[0].wt), eg: i.key(t[t.length - 1].wt) };
}
function ds(t) {
  let i;
  return t.forEach(((t2) => {
    void 0 === i && (i = t2.Qr);
  })), _(i);
}
var fs = class {
  constructor(t) {
    this.rg = /* @__PURE__ */ new Map(), this.hg = /* @__PURE__ */ new Map(), this.ag = /* @__PURE__ */ new Map(), this.lg = [], this.Pu = t;
  }
  m() {
    this.rg.clear(), this.hg.clear(), this.ag.clear(), this.lg = [];
  }
  og(t, i) {
    let n = 0 !== this.rg.size, s = false;
    const e2 = this.hg.get(t);
    if (void 0 !== e2) if (1 === this.hg.size) n = false, s = true, this.rg.clear();
    else for (const i2 of this.lg) i2.pointData.ng.delete(t) && (s = true);
    let r2 = [];
    if (0 !== i.length) {
      const n2 = i.map(((t2) => t2.time)), e3 = this.Pu.createConverterToInternalObj(i), h3 = _s(t.bh()), a2 = t.ul(), l2 = t.cl();
      r2 = i.map(((i2, r3) => {
        const o2 = e3(i2.time), _2 = this.Pu.key(o2);
        let u2 = this.rg.get(_2);
        void 0 === u2 && (u2 = us(o2), this.rg.set(_2, u2), s = true);
        const c2 = h3(o2, u2.$n, i2, n2[r3], a2, l2);
        return u2.ng.set(t, c2), c2;
      }));
    }
    n && this._g(), this.ug(t, r2);
    let h2 = -1;
    if (s) {
      const t2 = [];
      this.rg.forEach(((i2) => {
        t2.push({ timeWeight: 0, time: i2.Oa, pointData: i2, originalTime: ds(i2.ng) });
      })), t2.sort(((t3, i2) => this.Pu.key(t3.time) - this.Pu.key(i2.time))), h2 = this.cg(t2);
    }
    return this.dg(t, h2, (function(t2, i2, n2) {
      const s2 = cs(t2, n2), e3 = cs(i2, n2);
      if (void 0 !== s2 && void 0 !== e3) return { fg: false, Va: s2.eg >= e3.eg && s2.sg >= e3.sg };
    })(this.hg.get(t), e2, this.Pu));
  }
  if(t) {
    return this.og(t, []);
  }
  pg(t, i, n) {
    if (n && t.Fa()) throw new Error("Historical updates are not supported when conflation is enabled. Conflation requires data to be processed in order.");
    const s = i;
    !(function(t2) {
      void 0 === t2.Qr && (t2.Qr = t2.time);
    })(s), this.Pu.preprocessData(i);
    const e2 = this.Pu.createConverterToInternalObj([i])(i.time), r2 = this.ag.get(t);
    if (!n && void 0 !== r2 && this.Pu.key(e2) < this.Pu.key(r2)) throw new Error(`Cannot update oldest data, last time=${r2}, new time=${e2}`);
    let h2 = this.rg.get(this.Pu.key(e2));
    if (n && void 0 === h2) throw new Error("Cannot update non-existing data point when historicalUpdate is true");
    const a2 = void 0 === h2;
    void 0 === h2 && (h2 = us(e2), this.rg.set(this.Pu.key(e2), h2));
    const l2 = _s(t.bh()), o2 = t.ul(), _2 = t.cl(), u2 = l2(e2, h2.$n, i, s.Qr, o2, _2), c2 = !n && !a2 && void 0 !== r2 && this.Pu.key(e2) === this.Pu.key(r2);
    h2.ng.set(t, u2), n ? this.vg(t, u2, h2.$n) : c2 && t.Fa() && as(u2) ? (t.Rr(u2), this.mg(t, u2)) : this.mg(t, u2);
    const d2 = { Va: as(u2), fg: n };
    if (!a2) return this.dg(t, -1, d2);
    const f2 = { timeWeight: 0, time: h2.Oa, pointData: h2, originalTime: ds(h2.ng) }, p2 = Rt(this.lg, this.Pu.key(f2.time), ((t2, i2) => this.Pu.key(t2.time) < i2));
    this.lg.splice(p2, 0, f2);
    for (let t2 = p2; t2 < this.lg.length; ++t2) ps(this.lg[t2].pointData, t2);
    return this.Pu.fillWeightsForPoints(this.lg, p2), this.dg(t, p2, d2);
  }
  wg(t, i) {
    const n = this.hg.get(t);
    if (void 0 === n || i <= 0) return [[], this.Mg()];
    i = Math.min(i, n.length);
    const s = n.splice(-i).reverse();
    0 === n.length ? this.ag.delete(t) : this.ag.set(t, n[n.length - 1].wt);
    for (const i2 of s) {
      const n2 = this.rg.get(this.Pu.key(i2.wt));
      if (n2 && (n2.ng.delete(t), 0 === n2.ng.size)) {
        this.rg.delete(this.Pu.key(n2.Oa)), this.lg.splice(n2.$n, 1);
        for (let t2 = n2.$n; t2 < this.lg.length; ++t2) ps(this.lg[t2].pointData, t2);
      }
    }
    return [s, this.dg(t, this.lg.length - 1, { fg: false, Va: false })];
  }
  mg(t, i) {
    let n = this.hg.get(t);
    void 0 === n && (n = [], this.hg.set(t, n));
    const s = 0 !== n.length ? n[n.length - 1] : null;
    null === s || this.Pu.key(i.wt) > this.Pu.key(s.wt) ? as(i) && n.push(i) : as(i) ? n[n.length - 1] = i : n.splice(-1, 1), this.ag.set(t, i.wt);
  }
  vg(t, i, n) {
    const s = this.hg.get(t);
    if (void 0 === s) return;
    const e2 = Rt(s, n, ((t2, i2) => t2.$n < i2));
    as(i) ? s[e2] = i : s.splice(e2, 1);
  }
  ug(t, i) {
    0 !== i.length ? (this.hg.set(t, i.filter(as)), this.ag.set(t, i[i.length - 1].wt)) : (this.hg.delete(t), this.ag.delete(t));
  }
  _g() {
    for (const t of this.lg) 0 === t.pointData.ng.size && this.rg.delete(this.Pu.key(t.time));
  }
  cg(t) {
    let i = -1;
    for (let n = 0; n < this.lg.length && n < t.length; ++n) {
      const s = this.lg[n], e2 = t[n];
      if (this.Pu.key(s.time) !== this.Pu.key(e2.time)) {
        i = n;
        break;
      }
      e2.timeWeight = s.timeWeight, ps(e2.pointData, n);
    }
    if (-1 === i && this.lg.length !== t.length && (i = Math.min(this.lg.length, t.length)), -1 === i) return -1;
    for (let n = i; n < t.length; ++n) ps(t[n].pointData, n);
    return this.Pu.fillWeightsForPoints(t, i), this.lg = t, i;
  }
  gg() {
    if (0 === this.hg.size) return null;
    let t = 0;
    return this.hg.forEach(((i) => {
      0 !== i.length && (t = Math.max(t, i[i.length - 1].$n));
    })), t;
  }
  dg(t, i, n) {
    const s = this.Mg();
    if (-1 !== i) this.hg.forEach(((i2, e2) => {
      s.Y_.set(e2, { ue: i2, bg: e2 === t ? n : void 0 });
    })), this.hg.has(t) || s.Y_.set(t, { ue: [], bg: n }), s.Et.Sg = this.lg, s.Et.xg = i;
    else {
      const i2 = this.hg.get(t);
      s.Y_.set(t, { ue: i2 || [], bg: n });
    }
    return s;
  }
  Mg() {
    return { Y_: /* @__PURE__ */ new Map(), Et: { Dc: this.gg() } };
  }
};
function ps(t, i) {
  t.$n = i, t.ng.forEach(((t2) => {
    t2.$n = i;
  }));
}
function vs(t, i) {
  return t._t < i;
}
function ms(t, i) {
  return i < t._t;
}
function ws(t, i, n, s) {
  return Rt(t, i, vs, n, s);
}
function Ms(t, i, n, s) {
  return Dt(t, i, ms, n, s);
}
function gs(t, i, n) {
  return { ne: t, se: i, ee: n };
}
function bs(t, i, n, s) {
  return t >= i - s && t <= n + s;
}
function Ss(t, i, n, s, e2, r2) {
  const h2 = e2 - n, a2 = r2 - s;
  if (0 === h2 && 0 === a2) return Math.hypot(t - n, i - s);
  const l2 = ((t - n) * h2 + (i - s) * a2) / (h2 * h2 + a2 * a2), o2 = Math.max(0, Math.min(1, l2)), _2 = n + h2 * o2, u2 = s + a2 * o2;
  return Math.hypot(t - _2, i - u2);
}
var xs = [0, 0];
function Cs(t, i, n) {
  return void 0 === i || i.wt !== t.wt - 1 ? t._t - n / 2 : (i._t + t._t) / 2;
}
function ys(t, i, n) {
  return void 0 === i || i.wt !== t.wt + 1 ? t._t + n / 2 : (t._t + i._t) / 2;
}
function Ps(t, i, n, s, e2, r2, h2) {
  if (null === i || i.from >= i.to || 0 === t.length) return null;
  const a2 = e2 / 2 + r2, l2 = ws(t, n - a2, i.from, i.to), o2 = Ms(t, n + a2, l2, i.to);
  if (l2 >= o2) return null;
  let _2 = Number.POSITIVE_INFINITY;
  for (let a3 = l2; a3 < o2; a3++) {
    const l3 = t[a3], o3 = a3 > i.from ? t[a3 - 1] : void 0, u2 = a3 < i.to - 1 ? t[a3 + 1] : void 0, c2 = Cs(l3, o3, e2) - r2, d2 = ys(l3, u2, e2) + r2;
    if (n < c2 || n > d2) continue;
    h2(l3, xs);
    const f2 = xs[0], p2 = xs[1], v2 = Math.min(f2, p2), m2 = Math.max(f2, p2), w2 = v2 - r2, M2 = m2 + r2;
    if (s >= v2 && s <= m2) _2 = Math.min(_2, 0);
    else if (s >= w2 && s <= M2) {
      const t2 = Math.min(Math.abs(s - v2), Math.abs(m2 - s));
      _2 = Math.min(_2, t2);
    }
  }
  return Number.isFinite(_2) ? gs(_2, 0, "series-range") : null;
}
function ks(t, i) {
  return t.wt < i;
}
function Ts(t, i) {
  return i < t.wt;
}
function Rs(t, i, n) {
  const s = i.Na(), e2 = i.bi(), r2 = Rt(t, s, ks), h2 = Dt(t, e2, Ts);
  if (!n) return { from: r2, to: h2 };
  let a2 = r2, l2 = h2;
  return r2 > 0 && r2 < t.length && t[r2].wt >= s && (a2 = r2 - 1), h2 > 0 && h2 < t.length && t[h2 - 1].wt <= e2 && (l2 = h2 + 1), { from: a2, to: l2 };
}
var Ds = class {
  constructor(t, i, n) {
    this.Cg = true, this.yg = true, this.Pg = true, this.kg = [], this.Tg = null, this.Rg = -1, this.ae = t, this.le = i, this.Dg = n;
  }
  Pt(t) {
    this.Cg = true, "data" === t && (this.yg = true), "options" === t && (this.Pg = true);
  }
  Tt() {
    return this.ae.It() ? (this.Ig(), null === this.Tg ? null : this.Vg) : null;
  }
  Qs(t, i) {
    return this.ae.It() ? (this.Ig(), null === this.Tg ? null : this.Bg(t, i)) : null;
  }
  Bg(t, i) {
    return null;
  }
  Eg() {
    this.kg = this.kg.map(((t) => ({ ...t, ...this.ae.Sa().Sh(t.wt) })));
  }
  Ag() {
    this.Tg = null;
  }
  Ig() {
    const t = this.le.Et(), i = t.N().enableConflation ? t.sd() : 0;
    i !== this.Rg && (this.yg = true, this.Rg = i), this.yg && (this.Lg(), this.yg = false), this.Pg && (this.Eg(), this.Pg = false), this.Cg && (this.zg(), this.Cg = false);
  }
  zg() {
    const t = this.ae.Ft(), i = this.le.Et();
    if (this.Ag(), i.Zi() || t.Zi()) return;
    const n = i.Ee();
    if (null === n) return;
    if (0 === this.ae.Un().Th()) return;
    const s = this.ae.Lt();
    null !== s && (this.Tg = Rs(this.kg, n, this.Dg), this.Og(t, i, s.Wt), this.Ng());
  }
};
var Is = class {
  constructor(t, i) {
    this.Fg = t, this.Ki = i;
  }
  st(t, i, n) {
    this.Fg.draw(t, this.Ki, i, n);
  }
};
function Vs(t) {
  switch (t) {
    case "point":
      return 2;
    case "range":
      return 0;
    default:
      return 1;
  }
}
var Bs = class extends Ds {
  constructor(t, i, n) {
    super(t, i, false), this.Yh = n, this.Fg = this.Yh.renderer(), this.Vg = new Is(this.Fg, ((t2) => this.Wg(t2)));
  }
  get ga() {
    return this.Yh.conflationReducer;
  }
  Ha(t) {
    return this.Yh.priceValueBuilder(t);
  }
  dl(t) {
    return this.Yh.isWhitespace(t);
  }
  Bg(t, i) {
    const n = this.Fg.hitTest?.(t, i, ((t2) => this.Wg(t2)));
    if (null != n) return { ne: (s = n).distance, se: Vs(s.type), ee: "custom", gu: s.cursorStyle, te: s.objectId, ie: s.hitTestData };
    var s;
    const e2 = Ps(this.kg, this.Tg, t, i, this.le.Et().ml(), this.ae.N().hitTestTolerance, ((t2, i2) => {
      const n2 = t2.Hg;
      let s2 = NaN, e3 = NaN;
      if (void 0 !== n2 && !this.Yh.isWhitespace(n2)) for (const t3 of this.Yh.priceValueBuilder(n2)) {
        const i3 = this.Wg(t3);
        null !== i3 && (s2 = Number.isNaN(s2) ? i3 : Math.min(s2, i3), e3 = Number.isNaN(e3) ? i3 : Math.max(e3, i3));
      }
      i2[0] = s2, i2[1] = e3;
    }));
    return null === e2 ? null : { ...e2, ee: "custom" };
  }
  Lg() {
    const t = this.ae.Sa();
    this.kg = this.ae.Ua().Bh().map(((i) => ({ wt: i.$n, _t: NaN, ...t.Sh(i.$n), Hg: i.ue })));
  }
  Og(t, i) {
    i.Ic(this.kg, b(this.Tg));
  }
  Ng() {
    this.Yh.update({ bars: this.kg.map(Es), barSpacing: this.le.Et().ml(), visibleRange: this.Tg, conflationFactor: this.le.Et().sd() }, this.ae.N());
  }
  Wg(t) {
    const i = this.ae.Lt();
    return null === i ? null : this.ae.Ft().Nt(t, i.Wt);
  }
};
function Es(t) {
  return { x: t._t, time: t.wt, originalData: t.Hg, barColor: t.sh };
}
var As = { color: "#2196f3" };
var Ls = (t, i, n) => {
  const s = c(n);
  return new Bs(t, i, s);
};
function zs(t) {
  const i = { value: t.Wt[3], time: t.Qr };
  return void 0 !== t.ig && (i.customValues = t.ig), i;
}
function Os(t) {
  const i = zs(t);
  return void 0 !== t.R && (i.color = t.R), i;
}
function Ns(t) {
  const i = zs(t);
  return void 0 !== t.vt && (i.lineColor = t.vt), void 0 !== t.ah && (i.topColor = t.ah), void 0 !== t.oh && (i.bottomColor = t.oh), i;
}
function Fs(t) {
  const i = zs(t);
  return void 0 !== t._h && (i.topLineColor = t._h), void 0 !== t.uh && (i.bottomLineColor = t.uh), void 0 !== t.dh && (i.topFillColor1 = t.dh), void 0 !== t.fh && (i.topFillColor2 = t.fh), void 0 !== t.ph && (i.bottomFillColor1 = t.ph), void 0 !== t.mh && (i.bottomFillColor2 = t.mh), i;
}
function Ws(t) {
  const i = { open: t.Wt[0], high: t.Wt[1], low: t.Wt[2], close: t.Wt[3], time: t.Qr };
  return void 0 !== t.ig && (i.customValues = t.ig), i;
}
function Hs(t) {
  const i = Ws(t);
  return void 0 !== t.R && (i.color = t.R), i;
}
function Us(t) {
  const i = Ws(t), { R: n, Ht: s, hh: e2 } = t;
  return void 0 !== n && (i.color = n), void 0 !== s && (i.borderColor = s), void 0 !== e2 && (i.wickColor = e2), i;
}
function $s(t) {
  return { Area: Ns, Line: Os, Baseline: Fs, Histogram: Os, Bar: Hs, Candlestick: Us, Custom: js }[t];
}
function js(t) {
  const i = t.Qr;
  return { ...t.ue, time: i };
}
var qs = { vertLine: { color: "#9598A1", width: 1, style: 3, visible: true, labelVisible: true, labelBackgroundColor: "#131722" }, horzLine: { color: "#9598A1", width: 1, style: 3, visible: true, labelVisible: true, labelBackgroundColor: "#131722" }, mode: 1, doNotSnapToHiddenSeriesIndices: false };
var Ys = { vertLines: { color: "#D6DCDE", style: 0, visible: true }, horzLines: { color: "#D6DCDE", style: 0, visible: true } };
var Ks = { background: { type: "solid", color: "#FFFFFF" }, textColor: "#191919", fontSize: 12, fontFamily: S, panes: { enableResize: true, separatorColor: "#E0E3EB", separatorHoverColor: "rgba(178, 181, 189, 0.2)" }, attributionLogo: true, colorSpace: "srgb", colorParsers: [] };
var Gs = { autoScale: true, mode: 0, invertScale: false, alignLabels: true, borderVisible: true, borderColor: "#2B2B43", entireTextOnly: false, visible: false, ticksVisible: false, scaleMargins: { bottom: 0.1, top: 0.2 }, minimumWidth: 0, ensureEdgeTickMarksVisible: false, tickMarkDensity: 2.5 };
var Zs = { rightOffset: 0, barSpacing: 6, minBarSpacing: 0.5, maxBarSpacing: 0, fixLeftEdge: false, fixRightEdge: false, lockVisibleTimeRangeOnResize: false, rightBarStaysOnScroll: false, borderVisible: true, borderColor: "#2B2B43", visible: true, timeVisible: false, secondsVisible: true, shiftVisibleRangeOnNewBar: true, allowShiftVisibleRangeOnWhitespaceReplacement: false, ticksVisible: false, uniformDistribution: false, minimumHeight: 0, allowBoldLabels: true, ignoreWhitespaceIndices: false, enableConflation: false, conflationThresholdFactor: 1, precomputeConflationOnInit: false, precomputeConflationPriority: "background" };
function Xs() {
  return { addDefaultPane: true, hoveredSeriesOnTop: true, width: 0, height: 0, autoSize: false, layout: Ks, crosshair: qs, grid: Ys, overlayPriceScales: { ...Gs }, leftPriceScale: { ...Gs, visible: false }, rightPriceScale: { ...Gs, visible: true }, defaultVisiblePriceScaleId: "right", timeScale: Zs, localization: { locale: dn ? navigator.language : "", dateFormat: "dd MMM 'yy" }, handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true }, handleScale: { axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true }, mouseWheel: true, pinch: true }, kineticScroll: { mouse: false, touch: true }, trackingMode: { exitMode: 1 } };
}
var Js = class {
  constructor(t, i, n) {
    this.hv = t, this.Ug = i, this.$g = n ?? 0;
  }
  applyOptions(t) {
    this.hv.Qt().Dd(this.Ug, t, this.$g);
  }
  options() {
    return this.Ki().N();
  }
  width() {
    return Z(this.Ug) ? this.hv.DM(this.Ug) : 0;
  }
  setVisibleRange(t) {
    this.setAutoScale(false), this.Ki().Go(new mt(t.from, t.to));
  }
  getVisibleRange() {
    let t, i, n = this.Ki().ar();
    if (null === n) return null;
    if (this.Ki().ho()) {
      const s = this.Ki().S_(), e2 = Yi(s);
      n = vi(n, this.Ki().lo()), t = Number((Math.round(n.Je() / s) * s).toFixed(e2)), i = Number((Math.round(n.Qe() / s) * s).toFixed(e2));
    } else t = n.Je(), i = n.Qe();
    return { from: t, to: i };
  }
  setAutoScale(t) {
    this.applyOptions({ autoScale: t });
  }
  Ki() {
    return u(this.hv.Qt().Id(this.Ug, this.$g)).Ft;
  }
};
var Qs = class {
  constructor(t, i, n, s) {
    this.hv = t, this.yt = n, this.jg = i, this.qg = s;
  }
  getHeight() {
    return this.yt.$t();
  }
  setHeight(t) {
    const i = this.hv.Qt(), n = i._f(this.yt);
    i.Ld(n, t);
  }
  getStretchFactor() {
    return this.yt.F_();
  }
  setStretchFactor(t) {
    this.yt.W_(t), this.hv.Qt().ka();
  }
  paneIndex() {
    return this.hv.Qt()._f(this.yt);
  }
  moveTo(t) {
    const i = this.paneIndex();
    i !== t && (o(t >= 0 && t < this.hv.lv().length, "Invalid pane index"), this.hv.Qt().Od(i, t));
  }
  getSeries() {
    return this.yt.Y_().map(((t) => this.jg(t))) ?? [];
  }
  getHTMLElement() {
    const t = this.hv.lv();
    return t && 0 !== t.length && t[this.paneIndex()] ? t[this.paneIndex()].fv() : null;
  }
  attachPrimitive(t) {
    this.yt.ol(t), t.attached && t.attached({ chart: this.qg, requestUpdate: () => this.yt.Qt().ka() });
  }
  detachPrimitive(t) {
    this.yt._l(t);
  }
  priceScale(t) {
    if (null === this.yt.O_(t)) throw new Error(`Cannot find price scale with id: ${t}`);
    return new Js(this.hv, t, this.paneIndex());
  }
  setPreserveEmptyPane(t) {
    this.yt.j_(t);
  }
  preserveEmptyPane() {
    return this.yt.q_();
  }
  addCustomSeries(t, i = {}, n = 0) {
    return this.qg.addCustomSeries(t, i, n);
  }
  addSeries(t, i = {}) {
    return this.qg.addSeries(t, i, this.paneIndex());
  }
};
var te = { color: "#FF0000", price: 0, lineStyle: 2, lineWidth: 1, lineVisible: true, axisLabelVisible: true, title: "", axisLabelColor: "", axisLabelTextColor: "" };
var ie = class {
  constructor(t) {
    this._r = t;
  }
  applyOptions(t) {
    this._r.vr(t);
  }
  options() {
    return this._r.N();
  }
  Yg() {
    return this._r;
  }
};
var ne = class {
  constructor(t, i, n, s, e2, r2) {
    this.Kg = new d(), this.ae = t, this.Gg = i, this.Zg = n, this.Pu = e2, this.qg = s, this.Xg = r2;
  }
  m() {
    this.Kg.m();
  }
  priceFormatter() {
    return this.ae.sl();
  }
  priceToCoordinate(t) {
    const i = this.ae.Lt();
    return null === i ? null : this.ae.Ft().Nt(t, i.Wt);
  }
  coordinateToPrice(t) {
    const i = this.ae.Lt();
    return null === i ? null : this.ae.Ft().Tn(t, i.Wt);
  }
  barsInLogicalRange(t) {
    if (null === t) return null;
    const i = new Oi(new Ai(t.from, t.to)).Uu(), n = this.ae.Un();
    if (n.Zi()) return null;
    const s = n.Hn(i.Na(), 1), e2 = n.Hn(i.bi(), -1), r2 = u(n.Rh()), h2 = u(n.Qn());
    if (null !== s && null !== e2 && s.$n > e2.$n) return { barsBefore: t.from - r2, barsAfter: h2 - t.to };
    const a2 = { barsBefore: null === s || s.$n === r2 ? t.from - r2 : s.$n - r2, barsAfter: null === e2 || e2.$n === h2 ? h2 - t.to : h2 - e2.$n };
    return null !== s && null !== e2 && (a2.from = s.Qr, a2.to = e2.Qr), a2;
  }
  setData(t) {
    this.Pu, this.ae.bh(), this.Gg.Jg(this.ae, t), this.Qg("full");
  }
  update(t, i = false) {
    this.ae.bh(), this.Gg.tb(this.ae, t, i), this.Qg("update");
  }
  pop(t = 1) {
    const i = this.Gg.ib(this.ae, t);
    0 !== i.length && this.Qg("update");
    const n = $s(this.seriesType());
    return i.map(((t2) => n(t2)));
  }
  dataByIndex(t, i) {
    const n = this.ae.Un().Hn(t, i);
    if (null === n) return null;
    return $s(this.seriesType())(n);
  }
  data() {
    const t = $s(this.seriesType());
    return this.ae.Un().Bh().map(((i) => t(i)));
  }
  subscribeDataChanged(t) {
    this.Kg.i(t);
  }
  unsubscribeDataChanged(t) {
    this.Kg._(t);
  }
  applyOptions(t) {
    this.ae.vr(t);
  }
  options() {
    return M(this.ae.N());
  }
  priceScale() {
    return this.Zg.priceScale(this.ae.Ft().pl(), this.getPane().paneIndex());
  }
  createPriceLine(t) {
    const i = f(M(te), t), n = this.ae.Ea(i);
    return new ie(n);
  }
  removePriceLine(t) {
    this.ae.Aa(t.Yg());
  }
  priceLines() {
    return this.ae.La().map(((t) => new ie(t)));
  }
  seriesType() {
    return this.ae.bh();
  }
  lastValueData(t) {
    const i = this.ae.Ae(t);
    return i.Le ? { noData: true } : { noData: false, price: i.Mt, color: i.R };
  }
  attachPrimitive(t) {
    this.ae.ol(t), t.attached && t.attached({ chart: this.qg, series: this, requestUpdate: () => this.ae.Qt().ka(), horzScaleBehavior: this.Pu });
  }
  detachPrimitive(t) {
    this.ae._l(t), t.detached && t.detached(), this.ae.Qt().ka();
  }
  getPane() {
    const t = this.ae, i = u(this.ae.Qt().Ks(t));
    return this.Xg(i);
  }
  moveToPane(t) {
    this.ae.Qt().rf(this.ae, t);
  }
  seriesOrder() {
    const t = this.ae.Qt().Ks(this.ae);
    return null === t ? -1 : t.Y_().indexOf(this.ae);
  }
  setSeriesOrder(t) {
    const i = this.ae.Qt().Ks(this.ae);
    null !== i && i.vu(this.ae, t);
  }
  Qg(t) {
    this.Kg.v() && this.Kg.p(t);
  }
};
var se = class {
  constructor(t, i, n) {
    this.nb = new d(), this.Qu = new d(), this.Nw = new d(), this.sn = t, this.ia = t.Et(), this.vM = i, this.ia.Zc().i(this.sb.bind(this)), this.ia.Xc().i(this.eb.bind(this)), this.vM.qw().i(this.rb.bind(this)), this.Pu = n;
  }
  m() {
    this.ia.Zc().u(this), this.ia.Xc().u(this), this.vM.qw().u(this), this.nb.m(), this.Qu.m(), this.Nw.m();
  }
  scrollPosition() {
    return this.ia.Oc();
  }
  scrollToPosition(t, i) {
    i ? this.ia.Yc(t, 1e3) : this.sn.gs(t);
  }
  scrollToRealTime() {
    this.ia.qc();
  }
  getVisibleRange() {
    const t = this.ia.xc();
    return null === t ? null : { from: t.from.originalTime, to: t.to.originalTime };
  }
  setVisibleRange(t) {
    const i = { from: this.Pu.convertHorzItemToInternal(t.from), to: this.Pu.convertHorzItemToInternal(t.to) }, n = this.ia.kc(i);
    this.sn.sf(n);
  }
  getVisibleLogicalRange() {
    const t = this.ia.Sc();
    return null === t ? null : { from: t.Na(), to: t.bi() };
  }
  setVisibleLogicalRange(t) {
    o(t.from <= t.to, "The from index cannot be after the to index."), this.sn.sf(t);
  }
  resetTimeScale() {
    this.sn.ws();
  }
  fitContent() {
    this.sn.td();
  }
  logicalToCoordinate(t) {
    const i = this.sn.Et();
    return i.Zi() ? null : i.jt(t);
  }
  coordinateToLogical(t) {
    return this.ia.Zi() ? null : this.ia.Vc(t);
  }
  timeToIndex(t, i) {
    const n = this.Pu.convertHorzItemToInternal(t);
    return this.ia.Mc(n, i);
  }
  timeToCoordinate(t) {
    const i = this.timeToIndex(t, false);
    return null === i ? null : this.ia.jt(i);
  }
  coordinateToTime(t) {
    const i = this.sn.Et(), n = i.Vc(t), s = i.en(n);
    return null === s ? null : s.originalTime;
  }
  width() {
    return this.vM.pv().width;
  }
  height() {
    return this.vM.pv().height;
  }
  subscribeVisibleTimeRangeChange(t) {
    this.nb.i(t);
  }
  unsubscribeVisibleTimeRangeChange(t) {
    this.nb._(t);
  }
  subscribeVisibleLogicalRangeChange(t) {
    this.Qu.i(t);
  }
  unsubscribeVisibleLogicalRangeChange(t) {
    this.Qu._(t);
  }
  subscribeSizeChange(t) {
    this.Nw.i(t);
  }
  unsubscribeSizeChange(t) {
    this.Nw._(t);
  }
  applyOptions(t) {
    this.ia.vr(t);
  }
  options() {
    return { ...M(this.ia.N()), barSpacing: this.ia.ml() };
  }
  sb() {
    this.nb.v() && this.nb.p(this.getVisibleRange());
  }
  eb() {
    this.Qu.v() && this.Qu.p(this.getVisibleLogicalRange());
  }
  rb(t) {
    this.Nw.p(t.width, t.height);
  }
};
function ee(t) {
  return (function(t2) {
    if (w(t2.handleScale)) {
      const i2 = t2.handleScale;
      t2.handleScale = { axisDoubleClickReset: { time: i2, price: i2 }, axisPressedMouseMove: { time: i2, price: i2 }, mouseWheel: i2, pinch: i2 };
    } else if (void 0 !== t2.handleScale) {
      const { axisPressedMouseMove: i2, axisDoubleClickReset: n } = t2.handleScale;
      w(i2) && (t2.handleScale.axisPressedMouseMove = { time: i2, price: i2 }), w(n) && (t2.handleScale.axisDoubleClickReset = { time: n, price: n });
    }
    const i = t2.handleScroll;
    w(i) && (t2.handleScroll = { horzTouchDrag: i, vertTouchDrag: i, mouseWheel: i, pressedMouseMove: i });
  })(t), t;
}
var re = class {
  constructor(t, i, n) {
    this.hb = /* @__PURE__ */ new Map(), this.ab = /* @__PURE__ */ new Map(), this.lb = new d(), this.ob = new d(), this._b = new d(), this.dd = /* @__PURE__ */ new WeakMap(), this.ub = new fs(i);
    const s = void 0 === n ? M(Xs()) : f(M(Xs()), ee(n));
    this.cb = i, this.hv = new Xn(t, s, i), this.hv.mw().i(((t2) => {
      this.lb.v() && this.lb.p(this.fb(t2()));
    }), this), this.hv.ww().i(((t2) => {
      this.ob.v() && this.ob.p(this.fb(t2()));
    }), this), this.hv.Bd().i(((t2) => {
      this._b.v() && this._b.p(this.fb(t2()));
    }), this);
    const e2 = this.hv.Qt();
    this.pb = new se(e2, this.hv.bM(), this.cb);
  }
  remove() {
    this.hv.mw().u(this), this.hv.ww().u(this), this.hv.Bd().u(this), this.pb.m(), this.hv.m(), this.hb.clear(), this.ab.clear(), this.lb.m(), this.ob.m(), this._b.m(), this.ub.m();
  }
  resize(t, i, n) {
    this.autoSizeActive() || this.hv.wM(t, i, n);
  }
  addCustomSeries(t, i = {}, n = 0) {
    const s = ((t2) => ({ type: "Custom", isBuiltIn: false, defaultOptions: { ...As, ...t2.defaultOptions() }, mb: Ls, wb: t2 }))(c(t));
    return this.Mb(s, i, n);
  }
  addSeries(t, i = {}, n = 0) {
    return this.Mb(t, i, n);
  }
  removeSeries(t) {
    const i = _(this.hb.get(t)), n = this.ub.if(i);
    this.hv.Qt().if(i), this.gb(n), this.hb.delete(t), this.ab.delete(i);
  }
  Jg(t, i) {
    this.gb(this.ub.og(t, i));
  }
  tb(t, i, n) {
    this.gb(this.ub.pg(t, i, n));
  }
  ib(t, i) {
    const [n, s] = this.ub.wg(t, i);
    return 0 !== n.length && this.gb(s), n;
  }
  subscribeClick(t) {
    this.lb.i(t);
  }
  unsubscribeClick(t) {
    this.lb._(t);
  }
  subscribeCrosshairMove(t) {
    this._b.i(t);
  }
  unsubscribeCrosshairMove(t) {
    this._b._(t);
  }
  subscribeDblClick(t) {
    this.ob.i(t);
  }
  unsubscribeDblClick(t) {
    this.ob._(t);
  }
  priceScale(t, i = 0) {
    return new Js(this.hv, t, i);
  }
  timeScale() {
    return this.pb;
  }
  applyOptions(t) {
    this.hv.vr(ee(t));
  }
  options() {
    return this.hv.N();
  }
  takeScreenshot(t = false, i = false) {
    let n, s;
    try {
      i || (n = this.hv.Qt().N().crosshair.mode, this.hv.vr({ crosshair: { mode: 2 } })), s = this.hv.TM(t);
    } finally {
      i || void 0 === n || this.hv.Qt().vr({ crosshair: { mode: n } });
    }
    return s;
  }
  addPane(t = false) {
    const i = this.hv.Qt().uf();
    return i.j_(t), this.bb(i);
  }
  removePane(t) {
    this.hv.Qt().Ad(t);
  }
  swapPanes(t, i) {
    this.hv.Qt().zd(t, i);
  }
  autoSizeActive() {
    return this.hv.CM();
  }
  chartElement() {
    return this.hv.Mv();
  }
  panes() {
    return this.hv.Qt().Gn().map(((t) => this.bb(t)));
  }
  paneSize(t = 0) {
    const i = this.hv.AM(t);
    return { height: i.height, width: i.width };
  }
  setCrosshairPosition(t, i, n) {
    const s = this.hb.get(n);
    if (void 0 === s) return;
    const e2 = this.hv.Qt().Ks(s);
    null !== e2 && this.hv.Qt().Gd(t, i, e2);
  }
  clearCrosshairPosition() {
    this.hv.Qt().Zd(true);
  }
  horzBehaviour() {
    return this.cb;
  }
  Mb(t, i = {}, n = 0) {
    o(void 0 !== t.mb), (function(t2) {
      if (void 0 === t2 || "custom" === t2.type) return;
      const i2 = t2;
      void 0 !== i2.minMove && void 0 === i2.precision && (i2.precision = Yi(i2.minMove));
    })(i.priceFormat), "Candlestick" === t.type && (function(t2) {
      void 0 !== t2.borderColor && (t2.borderUpColor = t2.borderColor, t2.borderDownColor = t2.borderColor), void 0 !== t2.wickColor && (t2.wickUpColor = t2.wickColor, t2.wickDownColor = t2.wickColor);
    })(i);
    const s = f(M(e), M(t.defaultOptions), i), r2 = t.mb, h2 = new Jt(this.hv.Qt(), t.type, s, r2, t.wb);
    this.hv.Qt().Qd(h2, n);
    const a2 = new ne(h2, this, this, this, this.cb, ((t2) => this.bb(t2)));
    return this.hb.set(a2, h2), this.ab.set(h2, a2), a2;
  }
  gb(t) {
    const i = this.hv.Qt();
    for (const i2 of t.Y_.keys()) i2.Ia();
    i.Xd(t.Et.Dc, t.Et.Sg, t.Et.xg), t.Y_.forEach(((t2, i2) => i2.ht(t2.ue, t2.bg))), i.Et().dc(), i.Lc();
  }
  Sb(t) {
    return _(this.ab.get(t));
  }
  xb(t) {
    return void 0 !== t && this.ab.has(t) ? this.Sb(t) : void 0;
  }
  fb(t) {
    const i = /* @__PURE__ */ new Map();
    t.QM.forEach(((t2, n2) => {
      const s2 = n2.bh(), e2 = $s(s2)(t2);
      if ("Custom" !== s2) o(ts(e2));
      else {
        const t3 = n2.cl();
        o(!t3 || false === t3(e2));
      }
      i.set(this.Sb(n2), e2);
    }));
    const n = this.xb(t.jM), s = void 0 === t.YM ? void 0 : { type: t.YM.ds, sourceKind: t.YM.KM, objectKind: t.YM.GM, series: this.xb(t.YM.Y_), objectId: t.YM.ZM, paneIndex: t.YM.XM };
    return { time: t.Qr, logical: t.$n, point: t.JM, paneIndex: t.XM, hoveredInfo: s, hoveredSeries: n, hoveredObjectId: t.qM, seriesData: i, sourceEvent: t.tg };
  }
  bb(t) {
    let i = this.dd.get(t);
    return i || (i = new Qs(this.hv, ((t2) => this.Sb(t2)), t, this), this.dd.set(t, i)), i;
  }
};
function he(t) {
  if (m(t)) {
    const i = document.getElementById(t);
    return o(null !== i, `Cannot find element in DOM with id=${t}`), i;
  }
  return t;
}
function ae(t, i, n) {
  const s = he(t), e2 = new re(s, i, n);
  return i.setOptions(e2.options()), e2;
}
function le(t, i) {
  return ae(t, new cn(), cn.Tf(i));
}
function oe() {
  return cn;
}
function _e(t, i, n, s) {
  return Math.hypot(n - t, s - i);
}
function ue(t, i, n, s, e2, r2, h2, a2 = 0) {
  if (0 === i.length || s.from >= i.length || s.to <= 0) return;
  const { context: l2, horizontalPixelRatio: o2, verticalPixelRatio: _2 } = t, u2 = i[s.from];
  let c2 = r2(t, u2), d2 = u2;
  if (s.to - s.from < 2) {
    const i2 = e2 / 2;
    l2.beginPath();
    const n2 = { _t: u2._t - i2, ut: u2.ut }, s2 = { _t: u2._t + i2, ut: u2.ut };
    l2.moveTo(n2._t * o2, n2.ut * _2), l2.lineTo(s2._t * o2, s2.ut * _2), h2(t, c2, n2, s2);
  } else {
    const e3 = a2 > 0;
    let f2 = 0;
    const p2 = (i2, n2) => {
      if (h2(t, c2, d2, n2), l2.beginPath(), c2 = i2, d2 = n2, e3) {
        const t2 = f2 % a2;
        l2.lineDashOffset = t2, f2 = t2;
      }
    };
    let v2 = d2;
    l2.beginPath(), l2.moveTo(u2._t * o2, u2.ut * _2);
    for (let h3 = s.from + 1; h3 < s.to; ++h3) {
      v2 = i[h3];
      const s2 = v2._t * o2, a3 = v2.ut * _2, u3 = r2(t, v2);
      switch (n) {
        case 0:
          if (l2.lineTo(s2, a3), e3) {
            const t2 = i[h3 - 1], n2 = t2._t * o2, e4 = t2.ut * _2;
            f2 += _e(n2, e4, s2, a3);
          }
          break;
        case 1: {
          const t2 = i[h3 - 1], n2 = t2.ut * _2;
          l2.lineTo(s2, n2), e3 && (f2 += Math.abs(v2._t - t2._t) * o2), u3 !== c2 && (p2(u3, v2), l2.lineTo(s2, n2)), l2.lineTo(s2, a3), e3 && (f2 += Math.abs(v2.ut - t2.ut) * _2);
          break;
        }
        case 2: {
          const [t2, n2] = pe(i, h3 - 1, h3), r3 = t2._t * o2, u4 = t2.ut * _2, c3 = n2._t * o2, d3 = n2.ut * _2;
          if (l2.bezierCurveTo(r3, u4, c3, d3, s2, a3), e3) {
            const t3 = i[h3 - 1], n3 = t3._t * o2, e4 = t3.ut * _2, l3 = _e(n3, e4, s2, a3), p3 = _e(n3, e4, r3, u4) + _e(r3, u4, c3, d3) + _e(c3, d3, s2, a3);
            f2 += (l3 + p3) / 2;
          }
          break;
        }
      }
      1 !== n && u3 !== c2 && (p2(u3, v2), l2.moveTo(s2, a3));
    }
    (d2 !== v2 || d2 === v2 && 1 === n) && h2(t, c2, d2, v2), e3 && (l2.lineDashOffset = 0);
  }
}
var ce = 6;
function de(t, i) {
  return { _t: t._t - i._t, ut: t.ut - i.ut };
}
function fe(t, i) {
  return { _t: t._t / i, ut: t.ut / i };
}
function pe(t, i, n) {
  const s = Math.max(0, i - 1), e2 = Math.min(t.length - 1, n + 1);
  var r2, h2;
  return [(r2 = t[i], h2 = fe(de(t[n], t[s]), ce), { _t: r2._t + h2._t, ut: r2.ut + h2.ut }), de(t[n], fe(de(t[e2], t[i]), ce))];
}
function ve(t, i) {
  const n = t.context;
  n.strokeStyle = i, n.stroke();
}
var me = class extends R {
  constructor() {
    super(...arguments), this.rt = null;
  }
  ht(t) {
    this.rt = t;
  }
  et(t) {
    if (null === this.rt) return;
    const { ot: i, lt: n, Cb: s, yb: e2, ct: r2, Gt: h2, Pb: l2 } = this.rt;
    if (null === n) return;
    const o2 = t.context;
    o2.lineCap = "butt", o2.lineWidth = r2 * t.verticalPixelRatio;
    const _2 = a(o2, h2);
    o2.lineJoin = "round";
    const u2 = this.kb.bind(this), c2 = (function(t2) {
      return t2.reduce(((t3, i2) => t3 + i2), 0);
    })(_2);
    void 0 !== e2 && ue(t, i, e2, n, s, u2, ve, c2), l2 && (function(t2, i2, n2, s2, e3) {
      if (s2.to - s2.from <= 0) return;
      const { horizontalPixelRatio: r3, verticalPixelRatio: h3, context: a2 } = t2;
      let l3 = null;
      const o3 = Math.max(1, Math.floor(r3)) % 2 / 2, _3 = n2 * h3 + o3;
      for (let n3 = s2.to - 1; n3 >= s2.from; --n3) {
        const s3 = i2[n3];
        if (s3) {
          const i3 = e3(t2, s3);
          i3 !== l3 && (null !== l3 && a2.fill(), a2.beginPath(), a2.fillStyle = i3, l3 = i3);
          const n4 = Math.round(s3._t * r3) + o3, u3 = s3.ut * h3;
          a2.moveTo(n4, u3), a2.arc(n4, u3, _3, 0, 2 * Math.PI);
        }
      }
      a2.fill();
    })(t, i, l2, n, u2);
  }
};
var we = class extends me {
  kb(t, i) {
    return i.vt;
  }
};
function Me(t, i, n, s, e2) {
  const r2 = 1 - e2;
  return r2 * r2 * r2 * t + 3 * r2 * r2 * e2 * i + 3 * r2 * e2 * e2 * n + e2 * e2 * e2 * s;
}
function ge(t, i, n, s, e2) {
  if (2 === n) {
    const [n2, r2] = pe(s, e2 - 1, e2);
    return [Math.min(t._t, i._t, n2._t, r2._t), Math.max(t._t, i._t, n2._t, r2._t)];
  }
  return [Math.min(t._t, i._t), Math.max(t._t, i._t)];
}
function be(t, i, n, s, e2, r2, h2, a2) {
  switch (e2) {
    case 1: {
      const e3 = Ss(t, i, n._t, n.ut, s._t, n.ut), r3 = Ss(t, i, s._t, n.ut, s._t, s.ut), h3 = Math.min(e3, r3);
      return h3 <= a2 ? h3 : null;
    }
    case 2: {
      const [e3, l2] = pe(r2, h2 - 1, h2), o2 = (function(t2, i2, n2) {
        let s2 = Number.POSITIVE_INFINITY, e4 = n2[0];
        for (let r3 = 1; r3 <= 12; r3++) {
          const h3 = r3 / 12, a3 = { _t: Me(n2[0]._t, n2[1]._t, n2[2]._t, n2[3]._t, h3), ut: Me(n2[0].ut, n2[1].ut, n2[2].ut, n2[3].ut, h3) };
          s2 = Math.min(s2, Ss(t2, i2, e4._t, e4.ut, a3._t, a3.ut)), e4 = a3;
        }
        return s2;
      })(t, i, [n, e3, l2, s]);
      return o2 <= a2 ? o2 : null;
    }
    default: {
      const e3 = Ss(t, i, n._t, n.ut, s._t, s.ut);
      return e3 <= a2 ? e3 : null;
    }
  }
}
var Se = class extends Ds {
  constructor(t, i) {
    super(t, i, true);
  }
  Og(t, i, n) {
    i.Ic(this.kg, b(this.Tg)), t.Jo(this.kg, n, b(this.Tg));
  }
  Tb(t, i) {
    return { wt: t, Mt: i, _t: NaN, ut: NaN };
  }
  Lg() {
    const t = this.ae.Sa();
    this.kg = this.ae.Ua().Bh().map(((i) => {
      let n;
      if ((i.Gr ?? 1) > 1) {
        const t2 = i.Wt[1], s = i.Wt[2], e2 = i.Wt[3];
        n = Math.abs(t2 - e2) > Math.abs(s - e2) ? t2 : s;
      } else n = i.Wt[3];
      return this.Rb(i.$n, n, t);
    }));
  }
};
var xe = class extends Se {
  Bg(t, i) {
    const n = this.ae.N();
    return (function(t2, i2, n2, s, e2, r2, h2, a2 = 0, l2 = 0) {
      if (null === i2 || i2.from >= i2.to || 0 === t2.length) return null;
      const o2 = Math.max(r2 / 2, h2 ?? 0) + l2;
      let _2 = Number.POSITIVE_INFINITY;
      if (void 0 !== h2) {
        const e3 = h2 + l2, r3 = ws(t2, n2 - e3, i2.from, i2.to), a3 = Ms(t2, n2 + e3, r3, i2.to);
        for (let i3 = r3; i3 < a3; i3++) {
          const e4 = t2[i3];
          if (!bs(n2, e4._t, e4._t, h2 + l2)) continue;
          const r4 = Math.hypot(n2 - e4._t, s - e4.ut);
          r4 <= h2 + l2 && (_2 = Math.min(_2, r4));
        }
      }
      if (i2.to - i2.from < 2) {
        const e3 = t2[i2.from], r3 = Math.max(a2 / 2, o2), h3 = Ss(n2, s, e3._t - r3, e3.ut, e3._t + r3, e3.ut);
        return h3 <= o2 && (_2 = Math.min(_2, h3)), Number.isFinite(_2) ? gs(_2, 2, "series-point") : null;
      }
      let u2 = Number.POSITIVE_INFINITY;
      const c2 = ws(t2, n2 - o2, i2.from, i2.to), d2 = Ms(t2, n2 + o2, c2, i2.to), f2 = Math.max(i2.from + 1, c2), p2 = Math.min(i2.to, d2 + 1);
      for (let i3 = f2; i3 < p2; i3++) {
        const r3 = t2[i3 - 1], h3 = t2[i3], [a3, l3] = ge(r3, h3, e2, t2, i3);
        if (!bs(n2, a3, l3, o2)) continue;
        const _3 = be(n2, s, r3, h3, e2, t2, i3, o2);
        null !== _3 && (u2 = Math.min(u2, _3));
      }
      return Number.isFinite(_2) ? gs(_2, 2, "series-point") : Number.isFinite(u2) ? gs(u2, 1, "series-line") : null;
    })(this.kg, this.Tg, t, i, n.lineType, n.lineVisible ? n.lineWidth : 1, n.pointMarkersVisible ? n.pointMarkersRadius || n.lineWidth / 2 + 2 : void 0, this.le.Et().ml(), n.hitTestTolerance);
  }
};
var Ce = class extends xe {
  constructor() {
    super(...arguments), this.Vg = new we();
  }
  Rb(t, i, n) {
    return { ...this.Tb(t, i), ...n.Sh(t) };
  }
  Ng() {
    const t = this.ae.N(), i = { ot: this.kg, Gt: t.lineStyle, yb: t.lineVisible ? t.lineType : void 0, ct: t.lineWidth, Pb: t.pointMarkersVisible ? t.pointMarkersRadius || t.lineWidth / 2 + 2 : void 0, lt: this.Tg, Cb: this.le.Et().ml() };
    this.Vg.ht(i);
  }
};
var ye = { type: "Line", isBuiltIn: true, defaultOptions: { color: "#2196f3", lineStyle: 0, lineWidth: 3, lineType: 0, lineVisible: true, crosshairMarkerVisible: true, crosshairMarkerRadius: 4, crosshairMarkerBorderColor: "", crosshairMarkerBorderWidth: 2, crosshairMarkerBackgroundColor: "", lastPriceAnimation: 0, pointMarkersVisible: false }, mb: (t, i) => new Ce(t, i) };
function Pe(t, i) {
  return t.weight > i.weight ? t : i;
}
var ke = class {
  constructor() {
    this.Db = new d(), this.Ib = /* @__PURE__ */ (function(t) {
      let i = false;
      return function(...n) {
        i || (i = true, queueMicrotask((() => {
          t(...n), i = false;
        })));
      };
    })((() => this.Db.p(this.Vb))), this.Vb = 0;
  }
  Bb() {
    return this.Db;
  }
  m() {
    this.Db.m();
  }
  options() {
    return this.yn;
  }
  setOptions(t) {
    this.yn = t;
  }
  preprocessData(t) {
  }
  updateFormatter(t) {
    this.yn && (this.yn.localization = t);
  }
  createConverterToInternalObj(t) {
    return this.Ib(), (t2) => (t2 > this.Vb && (this.Vb = t2), t2);
  }
  key(t) {
    return t;
  }
  cacheKey(t) {
    return t;
  }
  convertHorzItemToInternal(t) {
    return t;
  }
  formatHorzItem(t) {
    return this.Eb(t);
  }
  formatTickmark(t) {
    return this.Eb(t.time);
  }
  maxTickMarkWeight(t) {
    return t.reduce(Pe, t[0]).weight;
  }
  fillWeightsForPoints(t, i) {
    for (let s = i; s < t.length; ++s) t[s].timeWeight = (n = t[s].time) % 120 == 0 ? 10 : n % 60 == 0 ? 9 : n % 36 == 0 ? 8 : n % 12 == 0 ? 7 : n % 6 == 0 ? 6 : n % 3 == 0 ? 5 : n % 1 == 0 ? 4 : 0;
    var n;
    this.Vb = t[t.length - 1].time, this.Ib();
  }
  Eb(t) {
    if (this.yn.localization?.timeFormatter) return this.yn.localization.timeFormatter(t);
    if (t < 12) return `${t}M`;
    const i = Math.floor(t / 12), n = t % 12;
    return 0 === n ? `${i}Y` : `${i}Y${n}M`;
  }
};
var Te = { yieldCurve: { baseResolution: 1, minimumTimeRange: 120, startTimeRange: 0 }, timeScale: { ignoreWhitespaceIndices: true }, leftPriceScale: { visible: true }, rightPriceScale: { visible: false }, localization: { priceFormatter: (t) => t.toFixed(3) + "%" } };
var Re = { lastValueVisible: false, priceLineVisible: false };
var De = class extends re {
  constructor(t, i) {
    const n = f(Te, i || {}), s = new ke();
    super(t, s, n), s.setOptions(this.options()), this._initWhitespaceSeries();
  }
  addSeries(t, i = {}, n = 0) {
    if (t.isBuiltIn && false === ["Area", "Line"].includes(t.type)) throw new Error("Yield curve only support Area and Line series");
    const s = { ...Re, ...i };
    return super.addSeries(t, s, n);
  }
  _initWhitespaceSeries() {
    const t = this.horzBehaviour(), i = this.addSeries(ye);
    let n;
    function s(s2) {
      const e2 = (function(t2, i2) {
        return { me: Math.max(0, t2.startTimeRange), we: Math.max(0, t2.minimumTimeRange, i2 || 0), Ab: Math.max(1, t2.baseResolution) };
      })(t.options().yieldCurve, s2), r2 = (({ me: t2, we: i2, Ab: n2 }) => `${t2}~${i2}~${n2}`)(e2);
      r2 !== n && (n = r2, i.setData((function({ me: t2, we: i2, Ab: n2 }) {
        return Array.from({ length: Math.floor((i2 - t2) / n2) + 1 }, ((i3, s3) => ({ time: t2 + s3 * n2 })));
      })(e2)));
    }
    s(0), t.Bb().i(s);
  }
};
function Ie(t, i) {
  const n = he(t);
  return new De(n, i);
}
function Ve(t, i) {
  return t.weight > i.weight ? t : i;
}
var Be = class {
  options() {
    return this.yn;
  }
  setOptions(t) {
    this.yn = t;
  }
  preprocessData(t) {
  }
  updateFormatter(t) {
    this.yn && (this.yn.localization = t);
  }
  createConverterToInternalObj(t) {
    return (t2) => t2;
  }
  key(t) {
    return t;
  }
  cacheKey(t) {
    return t;
  }
  convertHorzItemToInternal(t) {
    return t;
  }
  formatHorzItem(t) {
    return t.toFixed(this.Ds());
  }
  formatTickmark(t, i) {
    return t.time.toFixed(this.Ds());
  }
  maxTickMarkWeight(t) {
    return t.reduce(Ve, t[0]).weight;
  }
  fillWeightsForPoints(t, i) {
    for (let s = i; s < t.length; ++s) t[s].timeWeight = (n = t[s].time) === 100 * Math.ceil(n / 100) ? 8 : n === 50 * Math.ceil(n / 50) ? 7 : n === 25 * Math.ceil(n / 25) ? 6 : n === 10 * Math.ceil(n / 10) ? 5 : n === 5 * Math.ceil(n / 5) ? 4 : n === Math.ceil(n) ? 3 : 2 * n === Math.ceil(2 * n) ? 1 : 0;
    var n;
  }
  Ds() {
    return this.yn.localization.precision;
  }
};
function Ee(t, i) {
  return ae(t, new Be(), i);
}
function Ae(t, i, n, s, e2) {
  const { context: r2, horizontalPixelRatio: h2, verticalPixelRatio: a2 } = i;
  r2.lineTo(e2._t * h2, t * a2), r2.lineTo(s._t * h2, t * a2), r2.closePath(), r2.fillStyle = n, r2.fill();
}
var Le = class extends R {
  constructor() {
    super(...arguments), this.rt = null;
  }
  ht(t) {
    this.rt = t;
  }
  et(t) {
    if (null === this.rt) return;
    const { ot: i, lt: n, Cb: s, ct: e2, Gt: r2, yb: h2 } = this.rt, l2 = this.rt.Lb ?? (this.rt.zb ? 0 : t.mediaSize.height);
    if (null === n) return;
    const o2 = t.context;
    o2.lineCap = "butt", o2.lineJoin = "round", o2.lineWidth = e2, a(o2, r2), o2.lineWidth = 1, ue(t, i, h2, n, s, this.Ob.bind(this), Ae.bind(null, l2));
  }
};
var ze = class {
  Nb(t, i) {
    const n = this.Fb, { Wb: s, Hb: e2, Ub: r2, $b: h2, Lb: a2, jb: l2, qb: o2 } = i;
    if (void 0 === this.Yb || void 0 === n || n.Wb !== s || n.Hb !== e2 || n.Ub !== r2 || n.$b !== h2 || n.Lb !== a2 || n.jb !== l2 || n.qb !== o2) {
      const { verticalPixelRatio: n2 } = t, _2 = a2 || l2 > 0 ? n2 : 1, u2 = l2 * _2, c2 = o2 === t.bitmapSize.height ? o2 : o2 * _2, d2 = (a2 ?? 0) * _2, f2 = t.context.createLinearGradient(0, u2, 0, c2);
      if (f2.addColorStop(0, s), null != a2) {
        const t2 = ni((d2 - u2) / (c2 - u2), 0, 1);
        f2.addColorStop(t2, e2), f2.addColorStop(t2, r2);
      }
      f2.addColorStop(1, h2), this.Yb = f2, this.Fb = i;
    }
    return this.Yb;
  }
};
var Oe = class extends Le {
  constructor() {
    super(...arguments), this.Kb = new ze();
  }
  Ob(t, i) {
    const n = this.rt;
    return this.Kb.Nb(t, { Wb: i.dh, Hb: i.fh, Ub: i.ph, $b: i.mh, Lb: n.Lb, jb: n.jb ?? 0, qb: n.qb ?? t.bitmapSize.height });
  }
};
var Ne = class extends me {
  constructor() {
    super(...arguments), this.Gb = new ze();
  }
  kb(t, i) {
    const n = this.rt;
    return this.Gb.Nb(t, { Wb: i._h, Hb: i._h, Ub: i.uh, $b: i.uh, Lb: n.Lb, jb: n.jb ?? 0, qb: n.qb ?? t.bitmapSize.height });
  }
};
var Fe = class {
  constructor(t, i, n, s) {
    this.Zb = t, this.Xb = i, this.Jb = n, this.Qb = s;
  }
  st(t, i, n) {
    this.Zb.st(t, i, n), !this.Jb() || i && this.Qb() || this.Xb.st(t, i, n);
  }
};
var We = class {
  constructor(t, i) {
    this.Xb = t, this.tS = i;
  }
  Tt() {
    return this.tS() ? this.Xb : null;
  }
};
var He = class extends xe {
  constructor(t, i) {
    super(t, i), this.iS = new Oe(), this.nS = new Ne(), this.sS = new We(this.nS, (() => this.Jb())), this.eS = [this], this.rS = [this.sS], this.hS = { Za: this.eS, qa: this.rS }, this.Vg = new Fe(this.iS, this.nS, (() => this.Jb()), (() => this.le.N().hoveredSeriesOnTop));
  }
  Ga() {
    return this.hS;
  }
  Rb(t, i, n) {
    return { ...this.Tb(t, i), ...n.Sh(t) };
  }
  Ng() {
    const t = this.ae.Lt();
    if (null === t) return;
    const i = this.ae.N(), n = this.ae.Ft().Nt(i.baseValue.price, t.Wt), s = this.le.Et().ml();
    if (null === this.Tg || 0 === this.kg.length) return;
    let e2, r2;
    if (i.relativeGradient) {
      e2 = this.kg[this.Tg.from].ut, r2 = this.kg[this.Tg.from].ut;
      for (let t2 = this.Tg.from; t2 < this.Tg.to; t2++) {
        const i2 = this.kg[t2];
        i2.ut < e2 && (e2 = i2.ut), i2.ut > r2 && (r2 = i2.ut);
      }
    }
    this.iS.ht({ ot: this.kg, ct: i.lineWidth, Gt: i.lineStyle, yb: i.lineType, Lb: n, jb: e2, qb: r2, zb: false, lt: this.Tg, Cb: s }), this.nS.ht({ ot: this.kg, ct: i.lineWidth, Gt: i.lineStyle, yb: i.lineVisible ? i.lineType : void 0, Pb: i.pointMarkersVisible ? i.pointMarkersRadius || i.lineWidth / 2 + 2 : void 0, Lb: n, jb: e2, qb: r2, lt: this.Tg, Cb: s });
  }
  Jb() {
    return this.ae.It() && null !== this.Tg && this.aS();
  }
  aS() {
    const t = this.ae.N();
    return t.lineVisible || t.pointMarkersVisible;
  }
};
var Ue = { type: "Baseline", isBuiltIn: true, defaultOptions: { baseValue: { type: "price", price: 0 }, relativeGradient: false, topFillColor1: "rgba(38, 166, 154, 0.28)", topFillColor2: "rgba(38, 166, 154, 0.05)", topLineColor: "rgba(38, 166, 154, 1)", bottomFillColor1: "rgba(239, 83, 80, 0.05)", bottomFillColor2: "rgba(239, 83, 80, 0.28)", bottomLineColor: "rgba(239, 83, 80, 1)", lineWidth: 3, lineStyle: 0, lineType: 0, lineVisible: true, crosshairMarkerVisible: true, crosshairMarkerRadius: 4, crosshairMarkerBorderColor: "", crosshairMarkerBorderWidth: 2, crosshairMarkerBackgroundColor: "", lastPriceAnimation: 0, pointMarkersVisible: false }, mb: (t, i) => new He(t, i) };
var $e = class extends Le {
  constructor() {
    super(...arguments), this.Kb = new ze();
  }
  Ob(t, i) {
    return this.Kb.Nb(t, { Wb: i.ah, Hb: "", Ub: "", $b: i.oh, jb: this.rt?.jb ?? 0, qb: t.bitmapSize.height });
  }
};
var je = class extends xe {
  constructor(t, i) {
    super(t, i), this.lS = new $e(), this.Xb = new we(), this.sS = new We(this.Xb, (() => this.Jb())), this.eS = [this], this.rS = [this.sS], this.hS = { Za: this.eS, qa: this.rS }, this.Vg = new Fe(this.lS, this.Xb, (() => this.Jb()), (() => this.le.N().hoveredSeriesOnTop));
  }
  Ga() {
    return this.hS;
  }
  Rb(t, i, n) {
    return { ...this.Tb(t, i), ...n.Sh(t) };
  }
  Ng() {
    const t = this.ae.N();
    if (null === this.Tg || 0 === this.kg.length) return;
    let i;
    if (t.relativeGradient) {
      i = this.kg[this.Tg.from].ut;
      for (let t2 = this.Tg.from; t2 < this.Tg.to; t2++) {
        const n = this.kg[t2];
        n.ut < i && (i = n.ut);
      }
    }
    this.lS.ht({ yb: t.lineType, ot: this.kg, Gt: t.lineStyle, ct: t.lineWidth, Lb: null, jb: i, zb: t.invertFilledArea, lt: this.Tg, Cb: this.le.Et().ml() }), this.Xb.ht({ yb: t.lineVisible ? t.lineType : void 0, ot: this.kg, Gt: t.lineStyle, ct: t.lineWidth, lt: this.Tg, Cb: this.le.Et().ml(), Pb: t.pointMarkersVisible ? t.pointMarkersRadius || t.lineWidth / 2 + 2 : void 0 });
  }
  Jb() {
    return this.ae.It() && null !== this.Tg && this.aS();
  }
  aS() {
    const t = this.ae.N();
    return t.lineVisible || t.pointMarkersVisible;
  }
};
var qe = { type: "Area", isBuiltIn: true, defaultOptions: { topColor: "rgba( 46, 220, 135, 0.4)", bottomColor: "rgba( 40, 221, 100, 0)", invertFilledArea: false, relativeGradient: false, lineColor: "#33D778", lineStyle: 0, lineWidth: 3, lineType: 0, lineVisible: true, crosshairMarkerVisible: true, crosshairMarkerRadius: 4, crosshairMarkerBorderColor: "", crosshairMarkerBorderWidth: 2, crosshairMarkerBackgroundColor: "", lastPriceAnimation: 0, pointMarkersVisible: false }, mb: (t, i) => new je(t, i) };
var Ye = class extends R {
  constructor() {
    super(...arguments), this.qt = null, this.oS = 0, this._S = 0;
  }
  ht(t) {
    this.qt = t;
  }
  et({ context: t, horizontalPixelRatio: i, verticalPixelRatio: n }) {
    if (null === this.qt || 0 === this.qt.Un.length || null === this.qt.lt) return;
    if (this.oS = this.uS(i), this.oS >= 2) {
      Math.max(1, Math.floor(i)) % 2 != this.oS % 2 && this.oS--;
    }
    this._S = this.qt.cS ? Math.min(this.oS, Math.floor(i)) : this.oS;
    let s = null;
    const e2 = this._S <= this.oS && this.qt.ml >= Math.floor(1.5 * i);
    for (let r2 = this.qt.lt.from; r2 < this.qt.lt.to; ++r2) {
      const h2 = this.qt.Un[r2];
      s !== h2.sh && (t.fillStyle = h2.sh, s = h2.sh);
      const a2 = Math.floor(0.5 * this._S), l2 = Math.round(h2._t * i), o2 = l2 - a2, _2 = this._S, u2 = o2 + _2 - 1, c2 = Math.min(h2.n_, h2.s_), d2 = Math.max(h2.n_, h2.s_), f2 = Math.round(c2 * n) - a2, p2 = Math.round(d2 * n) + a2, v2 = Math.max(p2 - f2, this._S);
      t.fillRect(o2, f2, _2, v2);
      const m2 = Math.ceil(1.5 * this.oS);
      if (e2) {
        if (this.qt.dS) {
          const i3 = l2 - m2;
          let s3 = Math.max(f2, Math.round(h2.i_ * n) - a2), e4 = s3 + _2 - 1;
          e4 > f2 + v2 - 1 && (e4 = f2 + v2 - 1, s3 = e4 - _2 + 1), t.fillRect(i3, s3, o2 - i3, e4 - s3 + 1);
        }
        const i2 = l2 + m2;
        let s2 = Math.max(f2, Math.round(h2.e_ * n) - a2), e3 = s2 + _2 - 1;
        e3 > f2 + v2 - 1 && (e3 = f2 + v2 - 1, s2 = e3 - _2 + 1), t.fillRect(u2 + 1, s2, i2 - u2, e3 - s2 + 1);
      }
    }
  }
  uS(t) {
    const i = Math.floor(t);
    return Math.max(i, Math.floor((function(t2, i2) {
      return Math.floor(0.3 * t2 * i2);
    })(u(this.qt).ml, t)));
  }
};
var Ke = class extends Ds {
  constructor(t, i) {
    super(t, i, false);
  }
  Bg(t, i) {
    return Ps(this.kg, this.Tg, t, i, this.le.Et().ml(), this.ae.N().hitTestTolerance, ((t2, i2) => {
      i2[0] = t2.n_, i2[1] = t2.s_;
    }));
  }
  Og(t, i, n) {
    i.Ic(this.kg, b(this.Tg)), t.t_(this.kg, n, b(this.Tg));
  }
  fS(t, i, n) {
    return { wt: t, jr: i.Wt[0], qr: i.Wt[1], Yr: i.Wt[2], Kr: i.Wt[3], _t: NaN, i_: NaN, n_: NaN, s_: NaN, e_: NaN };
  }
  Lg() {
    const t = this.ae.Sa();
    this.kg = this.ae.Ua().Bh().map(((i) => this.Rb(i.$n, i, t)));
  }
};
var Ge = class extends Ke {
  constructor() {
    super(...arguments), this.Vg = new Ye();
  }
  Rb(t, i, n) {
    return { ...this.fS(t, i, n), ...n.Sh(t) };
  }
  Ng() {
    const t = this.ae.N();
    this.Vg.ht({ Un: this.kg, ml: this.le.Et().ml(), dS: t.openVisible, cS: t.thinBars, lt: this.Tg });
  }
};
var Ze = { type: "Bar", isBuiltIn: true, defaultOptions: { upColor: "#26a69a", downColor: "#ef5350", openVisible: true, thinBars: true }, mb: (t, i) => new Ge(t, i) };
var Xe = class extends R {
  constructor() {
    super(...arguments), this.qt = null, this.oS = 0;
  }
  ht(t) {
    this.qt = t;
  }
  et(t) {
    if (null === this.qt || 0 === this.qt.Un.length || null === this.qt.lt) return;
    const { horizontalPixelRatio: i } = t;
    if (this.oS = (function(t2, i2) {
      if (t2 >= 2.5 && t2 <= 4) return Math.floor(3 * i2);
      const n2 = 1 - 0.2 * Math.atan(Math.max(4, t2) - 4) / (0.5 * Math.PI), s2 = Math.floor(t2 * n2 * i2), e2 = Math.floor(t2 * i2), r2 = Math.min(s2, e2);
      return Math.max(Math.floor(i2), r2);
    })(this.qt.ml, i), this.oS >= 2) {
      Math.floor(i) % 2 != this.oS % 2 && this.oS--;
    }
    const n = this.qt.Un;
    this.qt.pS && this.vS(t, n, this.qt.lt), this.qt.gi && this.Vm(t, n, this.qt.lt);
    const s = this.mS(i);
    (!this.qt.gi || this.oS > 2 * s) && this.wS(t, n, this.qt.lt);
  }
  vS(t, i, n) {
    if (null === this.qt) return;
    const { context: s, horizontalPixelRatio: e2, verticalPixelRatio: r2 } = t;
    let h2 = "", a2 = Math.min(Math.floor(e2), Math.floor(this.qt.ml * e2));
    a2 = Math.max(Math.floor(e2), Math.min(a2, this.oS));
    const l2 = Math.floor(0.5 * a2);
    let o2 = null;
    for (let t2 = n.from; t2 < n.to; t2++) {
      const n2 = i[t2];
      n2.rh !== h2 && (s.fillStyle = n2.rh, h2 = n2.rh);
      const _2 = Math.round(Math.min(n2.i_, n2.e_) * r2), u2 = Math.round(Math.max(n2.i_, n2.e_) * r2), c2 = Math.round(n2.n_ * r2), d2 = Math.round(n2.s_ * r2);
      let f2 = Math.round(e2 * n2._t) - l2;
      const p2 = f2 + a2 - 1;
      null !== o2 && (f2 = Math.max(o2 + 1, f2), f2 = Math.min(f2, p2));
      const v2 = p2 - f2 + 1;
      s.fillRect(f2, c2, v2, _2 - c2), s.fillRect(f2, u2 + 1, v2, d2 - u2), o2 = p2;
    }
  }
  mS(t) {
    let i = Math.floor(1 * t);
    this.oS <= 2 * i && (i = Math.floor(0.5 * (this.oS - 1)));
    const n = Math.max(Math.floor(t), i);
    return this.oS <= 2 * n ? Math.max(Math.floor(t), Math.floor(1 * t)) : n;
  }
  Vm(t, i, n) {
    if (null === this.qt) return;
    const { context: s, horizontalPixelRatio: e2, verticalPixelRatio: r2 } = t;
    let h2 = "";
    const a2 = this.mS(e2);
    let l2 = null;
    for (let t2 = n.from; t2 < n.to; t2++) {
      const n2 = i[t2];
      n2.eh !== h2 && (s.fillStyle = n2.eh, h2 = n2.eh);
      let o2 = Math.round(n2._t * e2) - Math.floor(0.5 * this.oS);
      const _2 = o2 + this.oS - 1, u2 = Math.round(Math.min(n2.i_, n2.e_) * r2), c2 = Math.round(Math.max(n2.i_, n2.e_) * r2);
      if (null !== l2 && (o2 = Math.max(l2 + 1, o2), o2 = Math.min(o2, _2)), this.qt.ml * e2 > 2 * a2) L(s, o2, u2, _2 - o2 + 1, c2 - u2 + 1, a2);
      else {
        const t3 = _2 - o2 + 1;
        s.fillRect(o2, u2, t3, c2 - u2 + 1);
      }
      l2 = _2;
    }
  }
  wS(t, i, n) {
    if (null === this.qt) return;
    const { context: s, horizontalPixelRatio: e2, verticalPixelRatio: r2 } = t;
    let h2 = "";
    const a2 = this.mS(e2);
    for (let t2 = n.from; t2 < n.to; t2++) {
      const n2 = i[t2];
      let l2 = Math.round(Math.min(n2.i_, n2.e_) * r2), o2 = Math.round(Math.max(n2.i_, n2.e_) * r2), _2 = Math.round(n2._t * e2) - Math.floor(0.5 * this.oS), u2 = _2 + this.oS - 1;
      if (n2.sh !== h2) {
        const t3 = n2.sh;
        s.fillStyle = t3, h2 = t3;
      }
      this.qt.gi && (_2 += a2, l2 += a2, u2 -= a2, o2 -= a2), l2 > o2 || s.fillRect(_2, l2, u2 - _2 + 1, o2 - l2 + 1);
    }
  }
};
var Je = class extends Ke {
  constructor() {
    super(...arguments), this.Vg = new Xe();
  }
  Rb(t, i, n) {
    return { ...this.fS(t, i, n), ...n.Sh(t) };
  }
  Ng() {
    const t = this.ae.N();
    this.Vg.ht({ Un: this.kg, ml: this.le.Et().ml(), pS: t.wickVisible, gi: t.borderVisible, lt: this.Tg });
  }
};
var Qe = { type: "Candlestick", isBuiltIn: true, defaultOptions: { upColor: "#26a69a", downColor: "#ef5350", wickVisible: true, borderVisible: true, borderColor: "#378658", borderUpColor: "#26a69a", borderDownColor: "#ef5350", wickColor: "#737375", wickUpColor: "#26a69a", wickDownColor: "#ef5350" }, mb: (t, i) => new Je(t, i) };
var tr = class extends R {
  constructor() {
    super(...arguments), this.qt = null, this.MS = [];
  }
  ht(t) {
    this.qt = t, this.MS = [];
  }
  et({ context: t, horizontalPixelRatio: i, verticalPixelRatio: n }) {
    if (null === this.qt || 0 === this.qt.ot.length || null === this.qt.lt) return;
    this.MS.length || this.gS(i);
    const s = Math.max(1, Math.floor(n)), e2 = Math.round(this.qt.bS * n) - Math.floor(s / 2), r2 = e2 + s;
    for (let i2 = this.qt.lt.from; i2 < this.qt.lt.to; i2++) {
      const h2 = this.qt.ot[i2], a2 = this.MS[i2 - this.qt.lt.from], l2 = Math.round(h2.ut * n);
      let o2, _2;
      t.fillStyle = h2.sh, l2 <= e2 ? (o2 = l2, _2 = r2) : (o2 = e2, _2 = l2 - Math.floor(s / 2) + s), t.fillRect(a2.Na, o2, a2.bi - a2.Na + 1, _2 - o2);
    }
  }
  gS(t) {
    if (null === this.qt || 0 === this.qt.ot.length || null === this.qt.lt) return void (this.MS = []);
    const i = Math.ceil(this.qt.ml * t) <= 1 ? 0 : Math.max(1, Math.floor(t)), n = Math.round(this.qt.ml * t) - i;
    this.MS = new Array(this.qt.lt.to - this.qt.lt.from);
    for (let i2 = this.qt.lt.from; i2 < this.qt.lt.to; i2++) {
      const s2 = this.qt.ot[i2], e2 = Math.round(s2._t * t);
      let r2, h2;
      if (n % 2) {
        const t2 = (n - 1) / 2;
        r2 = e2 - t2, h2 = e2 + t2;
      } else {
        const t2 = n / 2;
        r2 = e2 - t2, h2 = e2 + t2 - 1;
      }
      this.MS[i2 - this.qt.lt.from] = { Na: r2, bi: h2, SS: e2, ce: s2._t * t, wt: s2.wt };
    }
    for (let t2 = this.qt.lt.from + 1; t2 < this.qt.lt.to; t2++) {
      const n2 = this.MS[t2 - this.qt.lt.from], s2 = this.MS[t2 - this.qt.lt.from - 1];
      n2.wt === s2.wt + 1 && (n2.Na - s2.bi !== i + 1 && (s2.SS > s2.ce ? s2.bi = n2.Na - i - 1 : n2.Na = s2.bi + i + 1));
    }
    let s = Math.ceil(this.qt.ml * t);
    for (let t2 = this.qt.lt.from; t2 < this.qt.lt.to; t2++) {
      const i2 = this.MS[t2 - this.qt.lt.from];
      i2.bi < i2.Na && (i2.bi = i2.Na);
      const n2 = i2.bi - i2.Na + 1;
      s = Math.min(n2, s);
    }
    if (i > 0 && s < 4) for (let t2 = this.qt.lt.from; t2 < this.qt.lt.to; t2++) {
      const i2 = this.MS[t2 - this.qt.lt.from];
      i2.bi - i2.Na + 1 > s && (i2.SS > i2.ce ? i2.bi -= 1 : i2.Na += 1);
    }
  }
};
var ir = class extends Se {
  constructor() {
    super(...arguments), this.Vg = new tr();
  }
  Bg(t, i) {
    const n = this.ae.Ft().Nt(this.ae.N().base, u(this.ae.Lt()).Wt);
    return null === n ? null : Ps(this.kg, this.Tg, t, i, this.le.Et().ml(), this.ae.N().hitTestTolerance, ((t2, i2) => {
      i2[0] = t2.ut, i2[1] = n;
    }));
  }
  Rb(t, i, n) {
    return { ...this.Tb(t, i), ...n.Sh(t) };
  }
  Ng() {
    const t = { ot: this.kg, ml: this.le.Et().ml(), lt: this.Tg, bS: this.ae.Ft().Nt(this.ae.N().base, u(this.ae.Lt()).Wt) };
    this.Vg.ht(t);
  }
};
var nr = { type: "Histogram", isBuiltIn: true, defaultOptions: { color: "#26a69a", base: 0 }, mb: (t, i) => new ir(t, i) };
var sr = class {
  constructor(t, i) {
    this.yt = t, this.xS = i, this.CS();
  }
  detach() {
    this.yt.detachPrimitive(this.xS);
  }
  getPane() {
    return this.yt;
  }
  applyOptions(t) {
    this.xS.vr?.(t);
  }
  CS() {
    this.yt.attachPrimitive(this.xS);
  }
};
var er = { visible: true, horzAlign: "center", vertAlign: "center", lines: [] };
var rr = { color: "rgba(0, 0, 0, 0.5)", fontSize: 48, fontFamily: S, fontStyle: "", text: "" };
var hr = class {
  constructor(t) {
    this.yS = /* @__PURE__ */ new Map(), this.qt = t;
  }
  draw(t) {
    t.useMediaCoordinateSpace(((t2) => {
      if (!this.qt.visible) return;
      const { context: i, mediaSize: n } = t2;
      let s = 0;
      for (const t3 of this.qt.lines) {
        if (0 === t3.text.length) continue;
        i.font = t3.k;
        const e3 = this.PS(i, t3.text);
        e3 > n.width ? t3.Uc = n.width / e3 : t3.Uc = 1, s += t3.lineHeight * t3.Uc;
      }
      let e2 = 0;
      switch (this.qt.vertAlign) {
        case "top":
          e2 = 0;
          break;
        case "center":
          e2 = Math.max((n.height - s) / 2, 0);
          break;
        case "bottom":
          e2 = Math.max(n.height - s, 0);
      }
      for (const t3 of this.qt.lines) {
        i.save(), i.fillStyle = t3.color;
        let s2 = 0;
        switch (this.qt.horzAlign) {
          case "left":
            i.textAlign = "left", s2 = t3.lineHeight / 2;
            break;
          case "center":
            i.textAlign = "center", s2 = n.width / 2;
            break;
          case "right":
            i.textAlign = "right", s2 = n.width - 1 - t3.lineHeight / 2;
        }
        i.translate(s2, e2), i.textBaseline = "top", i.font = t3.k, i.scale(t3.Uc, t3.Uc), i.fillText(t3.text, 0, t3.kS), i.restore(), e2 += t3.lineHeight * t3.Uc;
      }
    }));
  }
  PS(t, i) {
    const n = this.TS(t.font);
    let s = n.get(i);
    return void 0 === s && (s = t.measureText(i).width, n.set(i, s)), s;
  }
  TS(t) {
    let i = this.yS.get(t);
    return void 0 === i && (i = /* @__PURE__ */ new Map(), this.yS.set(t, i)), i;
  }
};
var ar = class {
  constructor(t) {
    this.yn = or(t);
  }
  Pt(t) {
    this.yn = or(t);
  }
  renderer() {
    return new hr(this.yn);
  }
};
function lr(t) {
  return { ...t, k: x(t.fontSize, t.fontFamily, t.fontStyle), lineHeight: t.lineHeight || 1.2 * t.fontSize, kS: 0, Uc: 0 };
}
function or(t) {
  return { ...t, lines: t.lines.map(lr) };
}
function _r(t) {
  return { ...rr, ...t };
}
function ur(t) {
  return { ...er, ...t, lines: t.lines?.map(_r) ?? [] };
}
var cr = class {
  constructor(t) {
    this.yn = ur(t), this.RS = [new ar(this.yn)];
  }
  updateAllViews() {
    this.RS.forEach(((t) => t.Pt(this.yn)));
  }
  paneViews() {
    return this.RS;
  }
  attached({ requestUpdate: t }) {
    this.DS = t;
  }
  detached() {
    this.DS = void 0;
  }
  vr(t) {
    this.yn = ur({ ...this.yn, ...t }), this.DS && this.DS();
  }
};
function dr(t, i) {
  return new sr(t, new cr(i));
}
var fr = { alpha: 1, padding: 0 };
var pr = class {
  constructor(t) {
    this.qt = t;
  }
  draw(t) {
    t.useMediaCoordinateSpace(((t2) => {
      const i = t2.context, n = this.IS(this.qt, t2.mediaSize);
      n && this.qt.VS && (i.globalAlpha = this.qt.alpha ?? 1, i.drawImage(this.qt.VS, n._t, n.ut, n.nn, n.$t));
    }));
  }
  IS(t, i) {
    const { maxHeight: n, maxWidth: s, BS: e2, ES: r2, padding: h2 } = t, a2 = Math.round(i.width / 2), l2 = Math.round(i.height / 2), o2 = h2 ?? 0;
    let _2 = i.width - 2 * o2, u2 = i.height - 2 * o2;
    n && (u2 = Math.min(u2, n)), s && (_2 = Math.min(_2, s));
    const c2 = _2 / r2, d2 = u2 / e2, f2 = Math.min(c2, d2), p2 = r2 * f2, v2 = e2 * f2;
    return { _t: a2 - 0.5 * p2, ut: l2 - 0.5 * v2, $t: v2, nn: p2 };
  }
};
var vr = class {
  constructor(t) {
    this.AS = null, this.LS = 0, this.zS = 0, this.yn = t, this.M = mr(this.yn, this.AS, this.LS, this.zS);
  }
  OS(t) {
    void 0 !== t.NS && (this.LS = t.NS), void 0 !== t.FS && (this.zS = t.FS), void 0 !== t.WS && (this.AS = t.WS), this.Pt();
  }
  HS(t) {
    this.yn = t, this.Pt();
  }
  zOrder() {
    return "bottom";
  }
  Pt() {
    this.M = mr(this.yn, this.AS, this.LS, this.zS);
  }
  renderer() {
    return new pr(this.M);
  }
};
function mr(t, i, n, s) {
  return { ...t, VS: i, ES: n, BS: s };
}
function wr(t) {
  return { ...fr, ...t };
}
var Mr = class {
  constructor(t, i) {
    this.US = null, this.$S = t, this.yn = wr(i), this.RS = [new vr(this.yn)];
  }
  updateAllViews() {
    this.RS.forEach(((t) => t.Pt()));
  }
  paneViews() {
    return this.RS;
  }
  attached(t) {
    const { requestUpdate: i } = t;
    this.jS = i, this.US = new Image(), this.US.onload = () => {
      const t2 = this.US?.naturalHeight ?? 1, i2 = this.US?.naturalWidth ?? 1;
      this.RS.forEach(((n) => n.OS({ FS: t2, NS: i2, WS: this.US }))), this.jS && this.jS();
    }, this.US.src = this.$S;
  }
  detached() {
    this.jS = void 0, this.US = null;
  }
  vr(t) {
    this.yn = wr({ ...this.yn, ...t }), this.qS(), this.DS && this.DS();
  }
  DS() {
    this.jS && this.jS();
  }
  qS() {
    this.RS.forEach(((t) => t.HS(this.yn)));
  }
};
function gr(t, i, n) {
  return new sr(t, new Mr(i, n));
}
var br = class {
  constructor(t, i) {
    this.ae = t, this.Jh = i, this.CS();
  }
  detach() {
    this.ae.detachPrimitive(this.Jh);
  }
  getSeries() {
    return this.ae;
  }
  applyOptions(t) {
    this.Jh && this.Jh.vr && this.Jh.vr(t);
  }
  CS() {
    this.ae.attachPrimitive(this.Jh);
  }
};
var Sr = { autoScale: true, zOrder: "normal" };
function xr(t, i) {
  return ei(Math.min(Math.max(t, 12), 30) * i);
}
function Cr(t, i) {
  const n = "circle" === t ? 0.8 : "square" === t ? 0.7 : 1;
  return ei(Math.max(i, 12) * n);
}
function yr(t) {
  return (function(t2) {
    const i = Math.ceil(t2);
    return i % 2 != 0 ? i - 1 : i;
  })(xr(t, 1));
}
function Pr(t) {
  return Math.max(xr(t, 0.1), 3);
}
function kr(t, i, n) {
  return i ? t : n ? Math.ceil(t / 2) : 0;
}
function Tr(t, i, n, s) {
  const e2 = (Cr("arrowUp", s) - 1) / 2 * n.YS, r2 = (ei(s / 2) - 1) / 2 * n.YS;
  i.beginPath(), t ? (i.moveTo(n._t - e2, n.ut), i.lineTo(n._t, n.ut - e2), i.lineTo(n._t + e2, n.ut), i.lineTo(n._t + r2, n.ut), i.lineTo(n._t + r2, n.ut + e2), i.lineTo(n._t - r2, n.ut + e2), i.lineTo(n._t - r2, n.ut)) : (i.moveTo(n._t - e2, n.ut), i.lineTo(n._t, n.ut + e2), i.lineTo(n._t + e2, n.ut), i.lineTo(n._t + r2, n.ut), i.lineTo(n._t + r2, n.ut - e2), i.lineTo(n._t - r2, n.ut - e2), i.lineTo(n._t - r2, n.ut)), i.fill();
}
function Rr(t, i, n, s, e2, r2) {
  const h2 = (Cr("arrowUp", s) - 1) / 2, a2 = (ei(s / 2) - 1) / 2;
  if (e2 >= i - a2 - 2 && e2 <= i + a2 + 2 && r2 >= (t ? n : n - h2) - 2 && r2 <= (t ? n + h2 : n) + 2) return true;
  return (() => {
    if (e2 < i - h2 - 3 || e2 > i + h2 + 3 || r2 < (t ? n - h2 - 3 : n) || r2 > (t ? n : n + h2 + 3)) return false;
    const s2 = Math.abs(e2 - i);
    return Math.abs(r2 - n) + 3 >= s2 / 2;
  })();
}
var Dr = class {
  constructor() {
    this.qt = null, this.$s = new rt(), this.F = -1, this.W = "", this.hm = "", this.KS = "normal";
  }
  ht(t) {
    this.qt = t;
  }
  js(t, i, n) {
    this.F === t && this.W === i || (this.F = t, this.W = i, this.hm = x(t, i), this.$s.Os()), this.KS = n;
  }
  Qs(t, i) {
    if (null === this.qt || null === this.qt.lt) return null;
    for (let n = this.qt.lt.from; n < this.qt.lt.to; n++) {
      const s = this.qt.ot[n];
      if (s && Vr(s, t, i)) return { zOrder: "normal", externalId: s.te ?? "", itemType: "marker" };
    }
    return null;
  }
  draw(t) {
    "aboveSeries" !== this.KS && t.useBitmapCoordinateSpace(((t2) => {
      this.et(t2);
    }));
  }
  drawBackground(t) {
    "aboveSeries" === this.KS && t.useBitmapCoordinateSpace(((t2) => {
      this.et(t2);
    }));
  }
  et({ context: t, horizontalPixelRatio: i, verticalPixelRatio: n }) {
    if (null !== this.qt && null !== this.qt.lt) {
      t.textBaseline = "middle", t.font = this.hm;
      for (let s = this.qt.lt.from; s < this.qt.lt.to; s++) {
        const e2 = this.qt.ot[s];
        void 0 !== e2.ri && (e2.ri.nn = this.$s.Ii(t, e2.ri.GS), e2.ri.$t = this.F, e2.ri._t = e2._t - e2.ri.nn / 2), Ir(e2, t, i, n);
      }
    }
  }
};
function Ir(t, i, n, s) {
  i.fillStyle = t.R, void 0 !== t.ri && (function(t2, i2, n2, s2, e2, r2) {
    t2.save(), t2.scale(e2, r2), t2.fillText(i2, n2, s2), t2.restore();
  })(i, t.ri.GS, t.ri._t, t.ri.ut, n, s), (function(t2, i2, n2) {
    if (0 === t2.Th) return;
    switch (t2.ZS) {
      case "arrowDown":
        return void Tr(false, i2, n2, t2.Th);
      case "arrowUp":
        return void Tr(true, i2, n2, t2.Th);
      case "circle":
        return void (function(t3, i3, n3) {
          const s2 = (Cr("circle", n3) - 1) / 2;
          t3.beginPath(), t3.arc(i3._t, i3.ut, s2 * i3.YS, 0, 2 * Math.PI, false), t3.fill();
        })(i2, n2, t2.Th);
      case "square":
        return void (function(t3, i3, n3) {
          const s2 = Cr("square", n3), e2 = (s2 - 1) * i3.YS / 2, r2 = i3._t - e2, h2 = i3.ut - e2;
          t3.fillRect(r2, h2, s2 * i3.YS, s2 * i3.YS);
        })(i2, n2, t2.Th);
    }
    t2.ZS;
  })(t, i, (function(t2, i2, n2) {
    const s2 = Math.max(1, Math.floor(i2)) % 2 / 2;
    return { _t: Math.round(t2._t * i2) + s2, ut: t2.ut * n2, YS: i2 };
  })(t, n, s));
}
function Vr(t, i, n) {
  return !(void 0 === t.ri || !(function(t2, i2, n2, s, e2, r2) {
    const h2 = s / 2;
    return e2 >= t2 && e2 <= t2 + n2 && r2 >= i2 - h2 && r2 <= i2 + h2;
  })(t.ri._t, t.ri.ut, t.ri.nn, t.ri.$t, i, n)) || (function(t2, i2, n2) {
    if (0 === t2.Th) return false;
    switch (t2.ZS) {
      case "arrowDown":
        return Rr(true, t2._t, t2.ut, t2.Th, i2, n2);
      case "arrowUp":
        return Rr(false, t2._t, t2.ut, t2.Th, i2, n2);
      case "circle":
        return (function(t3, i3, n3, s, e2) {
          const r2 = 2 + Cr("circle", n3) / 2, h2 = t3 - s, a2 = i3 - e2;
          return Math.sqrt(h2 * h2 + a2 * a2) <= r2;
        })(t2._t, t2.ut, t2.Th, i2, n2);
      case "square":
        return (function(t3, i3, n3, s, e2) {
          const r2 = Cr("square", n3), h2 = (r2 - 1) / 2, a2 = t3 - h2, l2 = i3 - h2;
          return s >= a2 && s <= a2 + r2 && e2 >= l2 && e2 <= l2 + r2;
        })(t2._t, t2.ut, t2.Th, i2, n2);
    }
  })(t, i, n);
}
function Br(t) {
  return "atPriceTop" === t || "atPriceBottom" === t || "atPriceMiddle" === t;
}
function Er(t, i, n, s, e2, r2, h2, a2) {
  const l2 = (function(t2, i2, n2) {
    if (Br(i2.position) && void 0 !== i2.price) return i2.price;
    if ("value" in (s2 = t2) && "number" == typeof s2.value) return t2.value;
    var s2;
    if ((function(t3) {
      return "open" in t3 && "high" in t3 && "low" in t3 && "close" in t3;
    })(t2)) {
      if ("inBar" === i2.position) return t2.close;
      if ("aboveBar" === i2.position) return n2 ? t2.low : t2.high;
      if ("belowBar" === i2.position) return n2 ? t2.high : t2.low;
    }
  })(n, i, h2.priceScale().options().invertScale);
  if (void 0 === l2) return;
  const o2 = Br(i.position), _2 = a2.timeScale(), c2 = p(i.size) ? Math.max(i.size, 0) : 1, d2 = yr(_2.options().barSpacing) * c2, f2 = d2 / 2;
  t.Th = d2;
  switch (i.position) {
    case "inBar":
    case "atPriceMiddle":
      return t.ut = u(h2.priceToCoordinate(l2)), void (void 0 !== t.ri && (t.ri.ut = t.ut + f2 + r2 + 0.6 * e2));
    case "aboveBar":
    case "atPriceTop": {
      const i2 = o2 ? 0 : s.XS;
      return t.ut = u(h2.priceToCoordinate(l2)) - f2 - i2, void 0 !== t.ri && (t.ri.ut = t.ut - f2 - 0.6 * e2, s.XS += 1.2 * e2), void (o2 || (s.XS += d2 + r2));
    }
    case "belowBar":
    case "atPriceBottom": {
      const i2 = o2 ? 0 : s.JS;
      return t.ut = u(h2.priceToCoordinate(l2)) + f2 + i2, void 0 !== t.ri && (t.ri.ut = t.ut + f2 + r2 + 0.6 * e2, s.JS += 1.2 * e2), void (o2 || (s.JS += d2 + r2));
    }
  }
}
var Ar = class {
  constructor(t, i, n) {
    this.QS = [], this.xt = true, this.tx = true, this.Xt = new Dr(), this.Te = t, this.Gv = i, this.qt = { ot: [], lt: null }, this.yn = n;
  }
  renderer() {
    if (!this.Te.options().visible) return null;
    this.xt && this.Ig();
    const t = this.Gv.options().layout;
    return this.Xt.js(t.fontSize, t.fontFamily, this.yn.zOrder), this.Xt.ht(this.qt), this.Xt;
  }
  ix(t) {
    this.QS = t, this.Pt("data");
  }
  Pt(t) {
    this.xt = true, "data" === t && (this.tx = true);
  }
  nx(t) {
    this.xt = true, this.yn = t;
  }
  zOrder() {
    return "aboveSeries" === this.yn.zOrder ? "top" : this.yn.zOrder;
  }
  Ig() {
    const t = this.Gv.timeScale(), i = this.QS;
    this.tx && (this.qt.ot = i.map(((t2) => ({ wt: t2.time, _t: 0, ut: 0, Th: 0, ZS: t2.shape, R: t2.color, te: t2.id, sx: t2.sx, ri: void 0 }))), this.tx = false);
    const n = this.Gv.options().layout;
    this.qt.lt = null;
    const s = t.getVisibleLogicalRange();
    if (null === s) return;
    const e2 = new Ai(Math.floor(s.from), Math.ceil(s.to));
    if (null === this.Te.dataByIndex(0, 1)) return;
    if (0 === this.qt.ot.length) return;
    let r2 = NaN;
    const h2 = Pr(t.options().barSpacing), a2 = { XS: h2, JS: h2 };
    this.qt.lt = Rs(this.qt.ot, e2, true);
    for (let s2 = this.qt.lt.from; s2 < this.qt.lt.to; s2++) {
      const e3 = i[s2];
      e3.time !== r2 && (a2.XS = h2, a2.JS = h2, r2 = e3.time);
      const l2 = this.qt.ot[s2];
      l2._t = u(t.logicalToCoordinate(e3.time)), void 0 !== e3.text && e3.text.length > 0 && (l2.ri = { GS: e3.text, _t: 0, ut: 0, nn: 0, $t: 0 });
      const o2 = this.Te.dataByIndex(e3.time, 0);
      null !== o2 && Er(l2, e3, o2, a2, n.fontSize, h2, this.Te, this.Gv);
    }
    this.xt = false;
  }
};
function Lr(t) {
  return { ...Sr, ...t };
}
var zr = class {
  constructor(t) {
    this.Yh = null, this.QS = [], this.hx = [], this.lx = null, this.Te = null, this.Gv = null, this.ox = true, this._x = null, this.ux = null, this.vx = null, this.mx = true, this.yn = Lr(t);
  }
  attached(t) {
    this.wx(), this.Gv = t.chart, this.Te = t.series, this.Yh = new Ar(this.Te, u(this.Gv), this.yn), this.jS = t.requestUpdate, this.Te.subscribeDataChanged(((t2) => this.Qg(t2))), this.mx = true, this.DS();
  }
  DS() {
    this.jS && this.jS();
  }
  detached() {
    this.Te && this.lx && this.Te.unsubscribeDataChanged(this.lx), this.Gv = null, this.Te = null, this.Yh = null, this.lx = null;
  }
  ix(t) {
    this.mx = true, this.QS = t, this.wx(), this.ox = true, this.ux = null, this.DS();
  }
  Mx() {
    return this.QS;
  }
  paneViews() {
    return this.Yh ? [this.Yh] : [];
  }
  updateAllViews() {
    this.gx();
  }
  hitTest(t, i) {
    return this.Yh ? this.Yh.renderer()?.Qs(t, i) ?? null : null;
  }
  autoscaleInfo(t, i) {
    if (this.yn.autoScale && this.Yh) {
      const t2 = this.bx();
      if (t2) return { priceRange: null, margins: t2 };
    }
    return null;
  }
  vr(t) {
    this.yn = Lr({ ...this.yn, ...t }), this.DS && this.DS();
  }
  bx() {
    const t = u(this.Gv).timeScale().options().barSpacing;
    if (this.ox || t !== this.vx) {
      if (this.vx = t, this.QS.length > 0) {
        const i = Pr(t), n = 1.5 * yr(t) + 2 * i, s = this.Sx();
        this._x = { above: kr(n, s.aboveBar, s.inBar), below: kr(n, s.belowBar, s.inBar) };
      } else this._x = null;
      this.ox = false;
    }
    return this._x;
  }
  Sx() {
    return null === this.ux && (this.ux = this.QS.reduce(((t, i) => (t[i.position] || (t[i.position] = true), t)), { inBar: false, aboveBar: false, belowBar: false, atPriceTop: false, atPriceBottom: false, atPriceMiddle: false })), this.ux;
  }
  wx() {
    if (!this.mx || !this.Gv || !this.Te) return;
    const t = this.Gv.timeScale(), i = this.Te?.data();
    if (null == t.getVisibleLogicalRange() || !this.Te || 0 === i.length) return void (this.hx = []);
    const n = t.timeToIndex(u(i[0].time), true);
    this.hx = this.QS.map(((i2, s) => {
      const e2 = t.timeToIndex(i2.time, true), r2 = e2 < n ? 1 : -1, h2 = u(this.Te).dataByIndex(e2, r2), a2 = { time: t.timeToIndex(u(h2).time, false), position: i2.position, shape: i2.shape, color: i2.color, id: i2.id, sx: s, text: i2.text, size: i2.size, price: i2.price, Qr: i2.time };
      if ("atPriceTop" === i2.position || "atPriceBottom" === i2.position || "atPriceMiddle" === i2.position) {
        if (void 0 === i2.price) throw new Error(`Price is required for position ${i2.position}`);
        return { ...a2, position: i2.position, price: i2.price };
      }
      return { ...a2, position: i2.position, price: i2.price };
    })), this.mx = false;
  }
  gx(t) {
    this.Yh && (this.wx(), this.Yh.ix(this.hx), this.Yh.nx(this.yn), this.Yh.Pt(t));
  }
  Qg(t) {
    this.mx = true, this.DS();
  }
};
var Or = class extends br {
  constructor(t, i, n) {
    super(t, i), n && this.setMarkers(n);
  }
  setMarkers(t) {
    this.Jh.ix(t);
  }
  markers() {
    return this.Jh.Mx();
  }
};
function Nr(t, i, n) {
  const s = new Or(t, new zr(n ?? {}));
  return i && s.setMarkers(i), s;
}
var Fr = class {
  constructor(t) {
    this.QS = /* @__PURE__ */ new Map(), this.xx = t;
  }
  Cx(t, i, n) {
    if (this.yx(i), void 0 !== n) {
      const s = window.setTimeout((() => {
        this.QS.delete(i), this.Px();
      }), n), e2 = { ...t, kx: s, Tx: Date.now() + n };
      this.QS.set(i, e2);
    } else this.QS.set(i, { ...t, kx: void 0, Tx: void 0 });
    this.Px();
  }
  yx(t) {
    const i = this.QS.get(t);
    i && void 0 !== i.kx && window.clearTimeout(i.kx), this.QS.delete(t), this.Px();
  }
  Rx() {
    for (const [t] of this.QS) this.yx(t);
  }
  Dx() {
    const t = Date.now(), i = [];
    for (const [n, s] of this.QS) !s.Tx || s.Tx > t ? i.push({ time: s.time, sign: s.sign, value: s.value }) : this.yx(n);
    return i;
  }
  Ix(t) {
    this.xx = t;
  }
  Px() {
    this.xx && this.xx();
  }
};
var Wr = { positiveColor: "#22AB94", negativeColor: "#F7525F", updateVisibilityDuration: 5e3 };
var Hr = class {
  constructor(t, i, n, s) {
    this.qt = t, this.Vx = i, this.Bx = n, this.Ex = s;
  }
  draw(t) {
    t.useBitmapCoordinateSpace(((t2) => {
      const i = t2.context, n = Math.max(1, Math.floor(t2.horizontalPixelRatio)) % 2 / 2, s = 4 * t2.verticalPixelRatio + n;
      this.qt.forEach(((e2) => {
        const r2 = Math.round(e2._t * t2.horizontalPixelRatio) + n;
        i.beginPath();
        const h2 = this.Ax(e2.Lx);
        i.fillStyle = h2, i.arc(r2, e2.ut * t2.verticalPixelRatio, s, 0, 2 * Math.PI, false), i.fill(), e2.Lx && (i.strokeStyle = h2, i.lineWidth = Math.floor(2 * t2.horizontalPixelRatio), i.beginPath(), i.moveTo((e2._t - 4.7) * t2.horizontalPixelRatio + n, (e2.ut - 7 * e2.Lx) * t2.verticalPixelRatio), i.lineTo(e2._t * t2.horizontalPixelRatio + n, (e2.ut - 7 * e2.Lx - 7 * e2.Lx * 0.5) * t2.verticalPixelRatio), i.lineTo((e2._t + 4.7) * t2.horizontalPixelRatio + n, (e2.ut - 7 * e2.Lx) * t2.verticalPixelRatio), i.stroke());
      }));
    }));
  }
  Ax(t) {
    return 0 === t ? this.Vx : t > 0 ? this.Ex : this.Bx;
  }
};
var Ur = class {
  constructor(t, i, n) {
    this.qt = [], this.Te = t, this.ia = i, this.yn = n;
  }
  Pt(t) {
    this.qt = t.map(((t2) => {
      const i = this.Te.priceToCoordinate(t2.value);
      if (null === i) return null;
      return { _t: u(this.ia.timeToCoordinate(t2.time)), ut: i, Lx: t2.sign };
    })).filter(g);
  }
  renderer() {
    const t = (function(t2, i) {
      return /* @__PURE__ */ (function(t3, i2) {
        return "Area" === i2;
      })(0, i) ? t2.lineColor : t2.color;
    })(this.Te.options(), this.Te.seriesType());
    return new Hr(this.qt, t, this.yn.negativeColor, this.yn.positiveColor);
  }
};
function $r(t, i) {
  return "Line" === i || "Area" === i;
}
var jr = class {
  constructor(t) {
    this.Gv = void 0, this.Te = void 0, this.RS = [], this.Pu = null, this.zx = /* @__PURE__ */ new Map(), this.Ox = new Fr((() => this.DS())), this.yn = { ...Wr, ...t };
  }
  vr(t) {
    this.yn = { ...this.yn, ...t }, this.DS();
  }
  ix(t) {
    this.Ox.Rx();
    const i = this.Pu;
    i && t.forEach(((t2) => {
      this.Ox.Cx(t2, i.key(t2.time));
    }));
  }
  Mx() {
    return this.Ox.Dx();
  }
  DS() {
    this.jS?.();
  }
  attached(t) {
    const { chart: i, series: n, requestUpdate: s, horzScaleBehavior: e2 } = t;
    this.Gv = i, this.Te = n, this.Pu = e2;
    const r2 = this.Te.seriesType();
    if ("Area" !== r2 && "Line" !== r2) throw new Error("UpDownMarkersPrimitive is only supported for Area and Line series types");
    this.RS = [new Ur(this.Te, this.Gv.timeScale(), this.yn)], this.jS = s, this.DS();
  }
  detached() {
    this.Gv = void 0, this.Te = void 0, this.jS = void 0;
  }
  _m() {
    return _(this.Gv);
  }
  Y_() {
    return _(this.Te);
  }
  updateAllViews() {
    this.RS.forEach(((t) => t.Pt(this.Mx())));
  }
  paneViews() {
    return this.RS;
  }
  ht(t) {
    if (!this.Te) throw new Error("Primitive not attached to series");
    const i = this.Te.seriesType();
    this.zx.clear();
    const n = this.Pu;
    n && t.forEach(((t2) => {
      ts(t2) && $r(0, i) && this.zx.set(n.key(t2.time), t2.value);
    })), _(this.Te).setData(t);
  }
  Pt(t, i) {
    if (!this.Te || !this.Pu) throw new Error("Primitive not attached to series");
    const n = this.Te.seriesType(), s = this.Pu.key(t.time);
    if (Qn(t) && this.zx.delete(s), ts(t) && $r(0, n)) {
      const i2 = this.zx.get(s);
      i2 && this.Ox.Cx({ time: t.time, value: t.value, sign: qr(t.value, i2) }, s, this.yn.updateVisibilityDuration);
    }
    _(this.Te).update(t, i);
  }
  Nx() {
    this.Ox.Rx();
  }
};
function qr(t, i) {
  return t === i ? 0 : t - i > 0 ? 1 : -1;
}
var Yr = class extends br {
  setData(t) {
    return this.Jh.ht(t);
  }
  update(t, i) {
    return this.Jh.Pt(t, i);
  }
  markers() {
    return this.Jh.Mx();
  }
  setMarkers(t) {
    return this.Jh.ix(t);
  }
  clearMarkers() {
    return this.Jh.Nx();
  }
};
function Kr(t, i = {}) {
  return new Yr(t, new jr(i));
}
var Gr = { ...e, color: "#2196f3" };
function Zr() {
  return "5.2.1";
}

// src/client/chart/model.ts
function businessDay(sessionDate) {
  const [year, month, day] = sessionDate.split("-").map(Number);
  return { year, month, day };
}
function sessionKey(time) {
  if (typeof time === "string") return time;
  return time && typeof time === "object" ? `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}` : null;
}
var MA_COLORS = { 5: "#b07b00", 10: "#9957d4", 20: "#2582cb" };
var UP_COLOR = "#cf3b4c";
var DOWN_COLOR = "#168463";
function buildChartData(dataset, indicators) {
  const rows = new Map(indicators.rows.map((row) => [row.sessionDate, row]));
  const result = { candles: [], volume: [], ma5: [], ma10: [], ma20: [], dif: [], dea: [], hist: [], k: [], d: [], j: [] };
  for (const bar of dataset.bars) {
    const time = businessDay(bar.sessionDate), row = rows.get(bar.sessionDate);
    result.candles.push({ time, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
    result.volume.push(Number.isFinite(bar.volume) ? { time, value: bar.volume, color: bar.close >= bar.open ? UP_COLOR : DOWN_COLOR } : { time });
    for (const period2 of [5, 10, 20]) result[`ma${period2}`].push(Number.isFinite(row?.ma?.[period2]) ? { time, value: row.ma[period2] } : { time });
    for (const key of ["dif", "dea", "hist", "k", "d", "j"]) result[key].push(Number.isFinite(row?.[key]) ? { time, value: row[key], ...key === "hist" ? { color: row[key] >= 0 ? UP_COLOR : DOWN_COLOR } : {} } : { time });
  }
  return result;
}
function createSelectionStore() {
  let bars = [], state = { sessionDate: null, locked: false }, listeners = /* @__PURE__ */ new Set();
  const publish = (sessionDate, locked) => {
    if (state.sessionDate === sessionDate && state.locked === locked) return;
    state = { sessionDate, locked };
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setBars(next, reset = false) {
      bars = next;
      if (reset || !bars.some((bar) => bar.sessionDate === state.sessionDate)) publish(bars.at(-1)?.sessionDate ?? null, false);
    },
    hover(date) {
      if (!state.locked && bars.some((bar) => bar.sessionDate === date)) publish(date, false);
    },
    click(date) {
      if (state.locked) publish(state.sessionDate, false);
      else if (bars.some((bar) => bar.sessionDate === date)) publish(date, true);
    },
    select(date) {
      if (bars.some((bar) => bar.sessionDate === date)) publish(date, true);
    },
    unlock() {
      publish(state.sessionDate, false);
    },
    move(key) {
      if (!bars.length) return null;
      const found = bars.findIndex((bar) => bar.sessionDate === state.sessionDate), current = found < 0 ? bars.length - 1 : found;
      const index = key === "Home" ? 0 : key === "End" ? bars.length - 1 : Math.max(0, Math.min(bars.length - 1, current + (key === "ArrowLeft" ? -1 : 1)));
      publish(bars[index].sessionDate, true);
      return bars[index];
    },
    dispose() {
      listeners.clear();
      bars = [];
    }
  };
}
function preserveLogicalRange(range, previousBars, nextBars) {
  if (!range || !previousBars.length || !nextBars.length) return range;
  const anchor = Math.max(0, Math.min(previousBars.length - 1, Math.floor(range.from)));
  const mapped = nextBars.findIndex((bar) => bar.sessionDate === previousBars[anchor].sessionDate);
  return mapped < 0 ? range : { from: range.from + mapped - anchor, to: range.to + mapped - anchor };
}

// src/client/chart/theme.ts
var PALETTES = {
  light: { background: "#ffffff", text: "#26334a", grid: "#edf0f5", border: "#d9dfea", crosshair: "#78879b" },
  dark: { background: "#151c2a", text: "#d6dfef", grid: "#253044", border: "#38465e", crosshair: "#8e9cb5" }
};
function resolveChartTheme(element, requested = "auto") {
  if (requested === "dark" || requested === "light") return requested;
  const view = element.ownerDocument.defaultView;
  const css = view?.getComputedStyle(element);
  const background = css?.getPropertyValue("--dsw-alias-bg-layer-1").trim();
  if (background) {
    const probe = element.ownerDocument.createElement("span");
    probe.style.color = background;
    probe.style.display = "none";
    element.appendChild(probe);
    const rgb = view.getComputedStyle(probe).color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    probe.remove();
    if (rgb?.length === 3) return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 < 128 ? "dark" : "light";
  }
  for (let node = element; node; node = node.parentElement) {
    if (node.classList.contains("dark") || /dark/i.test(node.getAttribute("data-theme") ?? "")) return "dark";
    if (node.classList.contains("light") || /light/i.test(node.getAttribute("data-theme") ?? "")) return "light";
  }
  return view?.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function observeChartTheme(element, requested, callback) {
  const view = element.ownerDocument.defaultView, media = view?.matchMedia?.("(prefers-color-scheme: dark)");
  let previous;
  const update = () => {
    const value = resolveChartTheme(element, requested);
    if (previous !== value) {
      previous = value;
      callback(value);
    }
  };
  const observer = view?.MutationObserver ? new view.MutationObserver(update) : null;
  for (let node = element.parentElement; node; node = node.parentElement) observer?.observe(node, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
  media?.addEventListener?.("change", update);
  update();
  return () => {
    observer?.disconnect();
    media?.removeEventListener?.("change", update);
  };
}

// src/client/chart/adapter.ts
var samePoint = (a2, b2) => JSON.stringify(a2) === JSON.stringify(b2);
var identity = (dataset) => [dataset.kind, dataset.id, dataset.symbol, dataset.interval, dataset.adjustment, dataset.adjustmentRevision].join("|");
function createStockChartAdapter(element, {
  selection,
  onViewport = () => {
  },
  locale = "en",
  theme = "light",
  library = lightweight_charts_production_exports,
  ResizeObserverClass = element.ownerDocument.defaultView?.ResizeObserver
} = {}) {
  const { createChart, CandlestickSeries, HistogramSeries, LineSeries, CrosshairMode } = library;
  let disposed = false, bars = [], data = null, datasetId = null, suppressRange = false, following = true, newBars = false, maximized = false, restoreHeights = null;
  const palette = PALETTES[theme] ?? PALETTES.light;
  const chart = createChart(element, {
    width: Math.max(1, element.clientWidth),
    height: Math.max(360, element.clientHeight || 500),
    layout: {
      background: { type: "solid", color: palette.background },
      textColor: palette.text,
      fontFamily: "system-ui, sans-serif",
      attributionLogo: true,
      panes: { enableResize: true, separatorColor: palette.border, separatorHoverColor: palette.crosshair }
    },
    grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
    crosshair: { mode: CrosshairMode.Normal, vertLine: { color: palette.crosshair }, horzLine: { color: palette.crosshair } },
    rightPriceScale: { borderColor: palette.border, minimumWidth: 64, mode: 0 },
    timeScale: { borderColor: palette.border, rightOffset: 5, minBarSpacing: 2, shiftVisibleRangeOnNewBar: false, allowShiftVisibleRangeOnWhitespaceReplacement: false },
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
    localization: { locale }
  });
  const common = { priceLineVisible: false, lastValueVisible: false };
  const series = {
    candles: chart.addSeries(CandlestickSeries, { ...common, upColor: UP_COLOR, downColor: DOWN_COLOR, borderUpColor: UP_COLOR, borderDownColor: DOWN_COLOR, wickUpColor: UP_COLOR, wickDownColor: DOWN_COLOR }, 0),
    volume: chart.addSeries(HistogramSeries, { ...common, priceFormat: { type: "volume" } }, 1),
    hist: chart.addSeries(HistogramSeries, { ...common, base: 0 }, 2),
    dif: chart.addSeries(LineSeries, { ...common, color: "#df9635", lineWidth: 2, crosshairMarkerVisible: true }, 2),
    dea: chart.addSeries(LineSeries, { ...common, color: "#8d70e4", lineWidth: 2, crosshairMarkerVisible: true }, 2),
    k: chart.addSeries(LineSeries, { ...common, color: "#df9635", lineWidth: 1, crosshairMarkerVisible: true }, 3),
    d: chart.addSeries(LineSeries, { ...common, color: "#8d70e4", lineWidth: 1, crosshairMarkerVisible: true }, 3),
    j: chart.addSeries(LineSeries, { ...common, color: "#2582cb", lineWidth: 1, crosshairMarkerVisible: true }, 3)
  };
  for (const period2 of [5, 10, 20]) series[`ma${period2}`] = chart.addSeries(LineSeries, { ...common, color: MA_COLORS[period2], lineWidth: 1, crosshairMarkerVisible: false }, 0);
  series.volume.priceScale().applyOptions({ scaleMargins: { top: 0.18, bottom: 0 }, autoScale: true });
  series.hist.priceScale().applyOptions({ scaleMargins: { top: 0.15, bottom: 0.15 }, autoScale: true });
  series.j.priceScale().applyOptions({ scaleMargins: { top: 0.15, bottom: 0.15 }, autoScale: true });
  chart.panes()[0].setStretchFactor(6);
  chart.panes()[1].setStretchFactor(1.4);
  chart.panes()[2].setStretchFactor(2);
  chart.panes()[3].setStretchFactor(2);
  const timeScale = chart.timeScale();
  const report = () => onViewport({ following, newBars });
  const rangeChanged = (range) => {
    if (disposed || suppressRange || !range || !bars.length) return;
    const next = range.to >= bars.length - 1;
    if (next !== following || next && newBars) {
      following = next;
      if (next) newBars = false;
      report();
    }
  };
  const hover = (event) => {
    if (!disposed) selection?.hover(sessionKey(event.time));
  };
  const click = (event) => {
    if (!disposed) {
      element.focus({ preventScroll: true });
      selection?.click(sessionKey(event.time));
    }
  };
  chart.subscribeCrosshairMove(hover);
  chart.subscribeClick(click);
  timeScale.subscribeVisibleLogicalRangeChange(rangeChanged);
  const resize = () => {
    if (!disposed) chart.resize(Math.max(1, element.clientWidth), Math.max(360, element.clientHeight || 500));
  };
  const observer = ResizeObserverClass ? new ResizeObserverClass(resize) : null;
  observer?.observe(element);
  const view = element.ownerDocument.defaultView;
  if (!observer) view?.addEventListener("resize", resize);
  return {
    setData(dataset, indicators) {
      if (disposed) return;
      const next = buildChartData(dataset, indicators), nextId = identity(dataset), reset = datasetId !== nextId;
      const range = timeScale.getVisibleLogicalRange(), oldBars = bars, wasFollowing = following;
      const appended = !reset && bars.length > 0 && dataset.bars.at(-1)?.sessionDate > bars.at(-1)?.sessionDate;
      suppressRange = true;
      for (const [key, target] of Object.entries(series)) {
        const previous = data?.[key], points = next[key];
        const tailOnly = !reset && previous?.length && points.length >= previous.length && previous.slice(0, -1).every((point, index) => samePoint(point, points[index])) && sessionKey(previous.at(-1).time) === sessionKey(points[previous.length - 1]?.time);
        if (tailOnly) {
          for (let i = previous.length - 1; i < points.length; i++) if (!samePoint(previous[i], points[i])) target.update(points[i]);
        } else target.setData(points);
      }
      bars = dataset.bars;
      data = next;
      datasetId = nextId;
      const precision = dataset.pricePrecision ?? 2;
      for (const key of ["candles", "ma5", "ma10", "ma20"]) series[key].applyOptions({ priceFormat: { type: "price", precision, minMove: 10 ** -precision } });
      const indicatorPrecision = Math.max(3, precision);
      for (const key of ["dif", "dea", "hist", "k", "d", "j"]) series[key].applyOptions({ priceFormat: { type: "price", precision: indicatorPrecision, minMove: 10 ** -indicatorPrecision } });
      selection?.setBars(bars, reset);
      if (reset) {
        following = true;
        newBars = false;
        if (bars.length) timeScale.setVisibleLogicalRange({ from: Math.max(-1, bars.length - 120), to: bars.length + 4 });
      } else if (range) {
        timeScale.setVisibleLogicalRange(preserveLogicalRange(range, oldBars, bars));
        if (appended && wasFollowing) timeScale.scrollToRealTime();
        if (appended && !wasFollowing) newBars = true;
      }
      suppressRange = false;
      report();
    },
    setConfig(config) {
      if (disposed) return;
      for (const period2 of [5, 10, 20]) series[`ma${period2}`].applyOptions({ visible: config.maVisible[period2] });
      series.dif.applyOptions({ visible: config.difVisible });
      series.dea.applyOptions({ visible: config.deaVisible });
      const kdj2 = config.kdjVisible !== false;
      for (const key of ["k", "d", "j"]) series[key].applyOptions({ visible: kdj2 });
      chart.panes()[3]?.setStretchFactor(kdj2 ? 2 : 1e-3);
    },
    setLocale(nextLocale) {
      if (!disposed) chart.applyOptions({ localization: { locale: nextLocale } });
    },
    setTheme(value) {
      if (disposed) return;
      const p2 = PALETTES[value] ?? PALETTES.light;
      chart.applyOptions({ layout: { background: { type: "solid", color: p2.background }, textColor: p2.text, attributionLogo: true, panes: { enableResize: true, separatorColor: p2.border, separatorHoverColor: p2.crosshair } }, grid: { vertLines: { color: p2.grid }, horzLines: { color: p2.grid } }, rightPriceScale: { borderColor: p2.border }, timeScale: { borderColor: p2.border }, crosshair: { vertLine: { color: p2.crosshair }, horzLine: { color: p2.crosshair } } });
    },
    setFocused(focused) {
      if (!disposed) chart.applyOptions({ handleScale: { mouseWheel: focused } });
    },
    selectDate(date) {
      if (disposed) return;
      const index = bars.findIndex((bar2) => bar2.sessionDate === date), bar = bars[index];
      if (!bar) return;
      selection?.select(date);
      const range = timeScale.getVisibleLogicalRange();
      if (range && (index < range.from || index > range.to)) {
        const width = range.to - range.from;
        timeScale.setVisibleLogicalRange({ from: index - width / 2, to: index + width / 2 });
      }
      chart.setCrosshairPosition(bar.close, businessDay(date), series.candles);
    },
    latest() {
      if (!disposed) {
        following = true;
        newBars = false;
        timeScale.scrollToRealTime();
        report();
      }
    },
    reset() {
      if (!disposed) {
        timeScale.fitContent();
        for (const key of ["candles", "volume", "hist"]) series[key].priceScale().applyOptions({ autoScale: true });
        following = true;
        newBars = false;
        report();
      }
    },
    zoom(factor) {
      if (disposed) return;
      const range = timeScale.getVisibleLogicalRange();
      if (!range) return;
      const width = Math.max(10, (range.to - range.from) * factor);
      timeScale.setVisibleLogicalRange({ from: range.to - width, to: range.to });
    },
    maximizeMacd() {
      if (disposed) return false;
      const panes = chart.panes();
      if (!maximized) {
        restoreHeights = panes.map((pane) => pane.getHeight());
        [2, 1, 7, 1].slice(0, panes.length).forEach((factor, index) => panes[index].setStretchFactor(factor));
      } else restoreHeights?.forEach((height, index) => panes[index].setStretchFactor(height));
      maximized = !maximized;
      return maximized;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      if (!observer) view?.removeEventListener("resize", resize);
      chart.unsubscribeCrosshairMove(hover);
      chart.unsubscribeClick(click);
      timeScale.unsubscribeVisibleLogicalRangeChange(rangeChanged);
      chart.remove();
      bars = [];
      data = null;
    }
  };
}

// src/client/chart/config.ts
var DEFAULT_CHART_CONFIG = Object.freeze({
  maVisible: Object.freeze({ 5: true, 10: true, 20: true }),
  macd: Object.freeze({ fast: 12, slow: 26, signal: 9, histScale: 2 }),
  difVisible: true,
  deaVisible: true,
  kdjVisible: true
});
function normalizeChartConfig(raw = {}) {
  const value = raw;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("chart.parameters-invalid");
  if (value.macd !== void 0 && (!value.macd || typeof value.macd !== "object" || Array.isArray(value.macd))) throw new Error("chart.parameters-invalid");
  const macd2 = Object.fromEntries(Object.entries(DEFAULT_CHART_CONFIG.macd).map(([key, fallback]) => [key, Object.hasOwn(value.macd ?? {}, key) ? value.macd[key] : fallback]));
  if (![macd2.fast, macd2.slow, macd2.signal].every((n) => Number.isInteger(n) && n >= 1 && n <= 250) || macd2.fast >= macd2.slow || ![1, 2].includes(macd2.histScale)) throw new Error("chart.parameters-invalid");
  return {
    maVisible: Object.fromEntries([5, 10, 20].map((n) => [n, value.maVisible?.[n] !== false])),
    macd: macd2,
    difVisible: value.difVisible !== false,
    deaVisible: value.deaVisible !== false,
    kdjVisible: value.kdjVisible !== false
  };
}

// src/client/chart/StockChart.tsx
function chartFormatters(locale, precision, format) {
  const tag = formatLocale(locale || "en");
  const price2 = new Intl.NumberFormat(tag, { minimumFractionDigits: precision, maximumFractionDigits: precision });
  const indicator = new Intl.NumberFormat(tag, { minimumFractionDigits: 3, maximumFractionDigits: Math.max(3, precision) });
  const quantity = new Intl.NumberFormat(tag, { maximumFractionDigits: 2 });
  return {
    price: (value) => Number.isFinite(value) ? price2.format(value) : "\u2014",
    indicator: (value) => Number.isFinite(value) ? indicator.format(value) : "\u2014",
    quantity: (value) => Number.isFinite(value) ? quantity.format(value) : "\u2014",
    count: (value) => format?.count ? format.count(value) : quantity.format(value)
  };
}
function Readout({ selection, dataset, indicators, config, t, format }) {
  const selected = (0, import_react.useSyncExternalStore)(selection.subscribe, selection.getSnapshot, selection.getSnapshot);
  const bars = (0, import_react.useMemo)(() => new Map(dataset.bars.map((bar2) => [bar2.sessionDate, bar2])), [dataset.bars]);
  const rows = (0, import_react.useMemo)(() => new Map(indicators.rows.map((row2) => [row2.sessionDate, row2])), [indicators]);
  const bar = bars.get(selected.sessionDate) ?? dataset.bars.at(-1), row = rows.get(bar?.sessionDate);
  const values = [
    ...["open", "high", "low", "close"].map((key) => [t(`chart.${key}`), format.price(bar?.[key])]),
    [t(dataset.volumeBasis === "reported" ? "chart.volume-reported" : "chart.volume"), format.quantity(bar?.volume)],
    [t("chart.amount", { currency: dataset.currency }), format.quantity(bar?.amount)],
    ...[5, 10, 20].filter((period2) => config.maVisible[period2]).map((period2) => [`MA${period2}`, format.price(row?.ma[period2])]),
    ["DIF", format.indicator(row?.dif)],
    ["DEA", format.indicator(row?.dea)],
    [t("chart.hist", { scale: config.macd.histScale }), format.indicator(row?.hist)],
    ...config.kdjVisible ? [["K", format.indicator(row?.k)], ["D", format.indicator(row?.d)], ["J", format.indicator(row?.j)]] : []
  ];
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxs-chart-readout", "aria-label": t("chart.readout") }, /* @__PURE__ */ import_react.default.createElement("header", null, /* @__PURE__ */ import_react.default.createElement("strong", { "data-selected-date": bar?.sessionDate }, bar?.sessionDate ?? "\u2014"), /* @__PURE__ */ import_react.default.createElement("span", { className: "dxs-chart-status", "data-locked": selected.locked }, t(selected.locked ? "chart.locked" : "chart.unlocked")), bar && /* @__PURE__ */ import_react.default.createElement("span", { className: "dxs-chart-status" }, t(bar.isFinal ? "chart.final" : "chart.provisional")), selected.locked && /* @__PURE__ */ import_react.default.createElement("button", { onClick: () => selection.unlock() }, t("chart.unlock"))), /* @__PURE__ */ import_react.default.createElement("dl", null, values.map(([label, value]) => /* @__PURE__ */ import_react.default.createElement("div", { key: label }, /* @__PURE__ */ import_react.default.createElement("dt", null, label), /* @__PURE__ */ import_react.default.createElement("dd", null, value)))));
}
var DataTable = (0, import_react.memo)(function DataTable2({ dataset, indicators, config, selection, t, format, onSelect }) {
  const [page, setPage] = (0, import_react.useState)(() => Math.max(0, Math.ceil(dataset.bars.length / 100) - 1));
  const selected = (0, import_react.useSyncExternalStore)(selection.subscribe, selection.getSnapshot, selection.getSnapshot);
  const rowsByTime = (0, import_react.useMemo)(() => new Map(indicators.rows.map((row) => [row.sessionDate, row])), [indicators]);
  const pages = Math.max(1, Math.ceil(dataset.bars.length / 100)), actualPage = Math.min(page, pages - 1), start = actualPage * 100;
  return /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-chart-table-controls" }, /* @__PURE__ */ import_react.default.createElement("button", { disabled: actualPage === 0, onClick: () => setPage(actualPage - 1) }, t("chart.table-older")), /* @__PURE__ */ import_react.default.createElement("button", { disabled: actualPage >= pages - 1, onClick: () => setPage(actualPage + 1) }, t("chart.table-newer")), /* @__PURE__ */ import_react.default.createElement("span", null, t("chart.table-page", { from: format.count(start + 1), to: format.count(Math.min(start + 100, dataset.bars.length)), total: format.count(dataset.bars.length) }))), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-chart-table-scroll", tabIndex: 0, "aria-label": t("chart.table-caption", { symbol: dataset.symbol }) }, /* @__PURE__ */ import_react.default.createElement("table", { className: "dxs-chart-table" }, /* @__PURE__ */ import_react.default.createElement("caption", null, t("chart.table-caption", { symbol: dataset.symbol })), /* @__PURE__ */ import_react.default.createElement("thead", null, /* @__PURE__ */ import_react.default.createElement("tr", null, /* @__PURE__ */ import_react.default.createElement("th", { scope: "col" }, t("chart.date")), ["open", "high", "low", "close", "volume"].map((key) => /* @__PURE__ */ import_react.default.createElement("th", { key, scope: "col" }, t(key === "volume" && dataset.volumeBasis === "reported" ? "chart.volume-reported" : `chart.${key}`))), /* @__PURE__ */ import_react.default.createElement("th", { scope: "col" }, t("chart.amount", { currency: dataset.currency })), [5, 10, 20].map((period2) => /* @__PURE__ */ import_react.default.createElement("th", { key: period2, scope: "col" }, "MA", period2)), /* @__PURE__ */ import_react.default.createElement("th", { scope: "col" }, "DIF"), /* @__PURE__ */ import_react.default.createElement("th", { scope: "col" }, "DEA"), /* @__PURE__ */ import_react.default.createElement("th", { scope: "col" }, t("chart.hist", { scale: config.macd.histScale })), /* @__PURE__ */ import_react.default.createElement("th", { scope: "col" }, "K"), /* @__PURE__ */ import_react.default.createElement("th", { scope: "col" }, "D"), /* @__PURE__ */ import_react.default.createElement("th", { scope: "col" }, "J"), /* @__PURE__ */ import_react.default.createElement("th", { scope: "col" }, t("chart.final")))), /* @__PURE__ */ import_react.default.createElement("tbody", null, dataset.bars.slice(start, start + 100).map((bar) => {
    const row = rowsByTime.get(bar.sessionDate);
    return /* @__PURE__ */ import_react.default.createElement("tr", { key: bar.sessionDate, "aria-selected": bar.sessionDate === selected.sessionDate }, /* @__PURE__ */ import_react.default.createElement("th", { scope: "row" }, /* @__PURE__ */ import_react.default.createElement("button", { "aria-label": t("chart.select-row", { date: bar.sessionDate }), onClick: () => onSelect(bar.sessionDate) }, bar.sessionDate)), ["open", "high", "low", "close"].map((key) => /* @__PURE__ */ import_react.default.createElement("td", { key }, format.price(bar[key]))), /* @__PURE__ */ import_react.default.createElement("td", null, format.quantity(bar.volume)), /* @__PURE__ */ import_react.default.createElement("td", null, format.quantity(bar.amount)), [5, 10, 20].map((period2) => /* @__PURE__ */ import_react.default.createElement("td", { key: period2 }, format.price(row?.ma[period2]))), ["dif", "dea", "hist", "k", "d", "j"].map((key) => /* @__PURE__ */ import_react.default.createElement("td", { key }, format.indicator(row?.[key]))), /* @__PURE__ */ import_react.default.createElement("td", null, t(bar.isFinal ? "chart.final" : "chart.provisional")));
  })))));
});
function MacdSettings({ current, t, onApply, onClose }) {
  const [draft, setDraft] = (0, import_react.useState)({ ...current }), [error, setError] = (0, import_react.useState)(false);
  const submit = (event) => {
    event.preventDefault();
    try {
      const { macd: macd2 } = normalizeChartConfig({ macd: Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, Number(value)])) });
      onApply(macd2);
      onClose();
    } catch {
      setError(true);
    }
  };
  return /* @__PURE__ */ import_react.default.createElement("form", { className: "dxs-chart-settings", onSubmit: submit, noValidate: true }, /* @__PURE__ */ import_react.default.createElement("h4", null, t("chart.settings-title")), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-chart-settings-grid" }, ["fast", "slow", "signal"].map((key) => /* @__PURE__ */ import_react.default.createElement("label", { key }, t(`chart.${key}`), /* @__PURE__ */ import_react.default.createElement("input", { "aria-label": t(`chart.${key}`), type: "number", min: "1", max: "250", step: "1", value: draft[key], onChange: (event) => {
    setError(false);
    setDraft({ ...draft, [key]: event.target.value });
  } }))), /* @__PURE__ */ import_react.default.createElement("label", null, t("chart.hist-scale"), /* @__PURE__ */ import_react.default.createElement("select", { value: draft.histScale, onChange: (event) => setDraft({ ...draft, histScale: event.target.value }) }, /* @__PURE__ */ import_react.default.createElement("option", { value: "1" }, "\xD71"), /* @__PURE__ */ import_react.default.createElement("option", { value: "2" }, "\xD72")))), error && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-error", role: "alert" }, t("chart.parameters-invalid")), /* @__PURE__ */ import_react.default.createElement("footer", null, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => {
    setDraft({ ...DEFAULT_CHART_CONFIG.macd });
    setError(false);
  } }, t("chart.defaults")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: onClose }, t("chart.cancel")), /* @__PURE__ */ import_react.default.createElement("button", { type: "submit" }, t("chart.apply"))));
}
function StockChart({ dataset, t, format, locale = "en", theme = "auto", config: suppliedConfig, onConfigChange, createAdapter = createStockChartAdapter }) {
  const [localConfig, setLocalConfig] = (0, import_react.useState)(() => normalizeChartConfig()), [settings, setSettings] = (0, import_react.useState)(false), [showTable, setShowTable] = (0, import_react.useState)(false);
  const [viewport, setViewport] = (0, import_react.useState)({ following: true, newBars: false }), [activeTheme, setActiveTheme] = (0, import_react.useState)("light"), [maximized, setMaximized] = (0, import_react.useState)(false), [renderError, setRenderError] = (0, import_react.useState)(false);
  const config = (0, import_react.useMemo)(() => normalizeChartConfig(suppliedConfig ?? localConfig), [suppliedConfig, localConfig]);
  const { fast, slow, signal, histScale } = config.macd;
  const indicators = (0, import_react.useMemo)(() => {
    try {
      return computeIndicators(dataset.bars, { maPeriods: [5, 10, 20], macd: { fast, slow, signal, histScale }, historyAnchor: dataset.historyAnchor });
    } catch {
      return { failed: true, rows: dataset.bars.map((bar) => ({ sessionDate: bar.sessionDate, ma: { 5: null, 10: null, 20: null }, dif: null, dea: null, hist: null, k: null, d: null, j: null })), warmup: { macdBars: slow + signal - 1 } };
    }
  }, [dataset.bars, dataset.historyAnchor, fast, slow, signal, histScale]);
  const numbers = (0, import_react.useMemo)(() => chartFormatters(locale, dataset.pricePrecision ?? 2, format), [locale, dataset.pricePrecision, format]);
  const selection = (0, import_react.useMemo)(createSelectionStore, []), element = (0, import_react.useRef)(null), section = (0, import_react.useRef)(null), adapter = (0, import_react.useRef)(null);
  const helpId = (0, import_react.useId)(), tableId = (0, import_react.useId)(), settingsId = (0, import_react.useId)();
  const applyConfig = (next) => {
    const normalized = normalizeChartConfig(next);
    setLocalConfig(normalized);
    onConfigChange?.(normalized);
  };
  (0, import_react.useEffect)(() => {
    try {
      adapter.current = createAdapter(element.current, { selection, onViewport: (next) => setViewport((previous) => previous.following === next.following && previous.newBars === next.newBars ? previous : next), locale: formatLocale(locale), theme: activeTheme });
      setRenderError(false);
      setMaximized(false);
    } catch {
      setRenderError(true);
    }
    return () => {
      adapter.current?.dispose();
      adapter.current = null;
    };
  }, [createAdapter, selection, dataset.id]);
  (0, import_react.useEffect)(() => {
    try {
      adapter.current?.setData(dataset, indicators);
    } catch {
      adapter.current?.dispose();
      adapter.current = null;
      setRenderError(true);
    }
  }, [dataset, indicators]);
  (0, import_react.useEffect)(() => {
    adapter.current?.setConfig(config);
  }, [config, dataset.id]);
  (0, import_react.useEffect)(() => {
    adapter.current?.setLocale(formatLocale(locale));
  }, [locale, dataset.id]);
  (0, import_react.useEffect)(() => observeChartTheme(section.current, theme, (value) => {
    setActiveTheme(value);
    adapter.current?.setTheme(value);
  }), [theme]);
  (0, import_react.useEffect)(() => () => selection.dispose(), [selection]);
  const selectDate = (date) => {
    selection.select(date);
    adapter.current?.selectDate(date);
  };
  const keyboard = (event) => {
    if (event.currentTarget !== event.currentTarget.ownerDocument.activeElement || event.ctrlKey || event.metaKey || event.altKey) return;
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const bar = selection.move(event.key);
      if (bar) adapter.current?.selectDate(bar.sessionDate);
    } else if (event.key === "Escape") {
      event.preventDefault();
      selection.unlock();
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      adapter.current?.zoom(0.8);
    } else if (event.key === "-") {
      event.preventDefault();
      adapter.current?.zoom(1.25);
    }
  };
  const toggleMacd = () => setMaximized(adapter.current?.maximizeMacd() ?? false);
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dxs-chart", ref: section, "data-chart-theme": activeTheme, "aria-label": t("chart.title") }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-chart-toolbar" }, /* @__PURE__ */ import_react.default.createElement("h3", null, t("chart.price-pane")), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-chart-group" }, [5, 10, 20].map((period2) => /* @__PURE__ */ import_react.default.createElement("label", { key: period2 }, /* @__PURE__ */ import_react.default.createElement("input", { type: "checkbox", checked: config.maVisible[period2], onChange: (event) => applyConfig({ ...config, maVisible: { ...config.maVisible, [period2]: event.target.checked } }) }), /* @__PURE__ */ import_react.default.createElement("span", null, /* @__PURE__ */ import_react.default.createElement("i", { className: "dxs-chart-swatch", style: { background: MA_COLORS[period2] } }), "MA", period2))), /* @__PURE__ */ import_react.default.createElement("label", null, /* @__PURE__ */ import_react.default.createElement("input", { type: "checkbox", checked: config.kdjVisible, onChange: (event) => applyConfig({ ...config, kdjVisible: event.target.checked }) }), /* @__PURE__ */ import_react.default.createElement("span", null, t("chart.kdj")))), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-chart-actions" }, /* @__PURE__ */ import_react.default.createElement("button", { "aria-label": t("chart.zoom-in"), onClick: () => adapter.current?.zoom(0.8) }, "+"), /* @__PURE__ */ import_react.default.createElement("button", { "aria-label": t("chart.zoom-out"), onClick: () => adapter.current?.zoom(1.25) }, "\u2212"), /* @__PURE__ */ import_react.default.createElement("button", { onClick: () => adapter.current?.latest() }, t(viewport.newBars ? "chart.new-bars" : "chart.latest")), /* @__PURE__ */ import_react.default.createElement("button", { onClick: () => adapter.current?.reset() }, t("chart.reset-view")))), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-chart-pane-labels" }, /* @__PURE__ */ import_react.default.createElement("span", null, t(`chart.interval.${dataset.interval ?? "1d"}`)), /* @__PURE__ */ import_react.default.createElement("span", null, t(dataset.volumeBasis === "reported" ? "chart.volume-pane-reported" : "chart.volume-pane")), /* @__PURE__ */ import_react.default.createElement("strong", { onDoubleClick: toggleMacd }, t("chart.macd-pane", { fast, slow, signal, scale: histScale })), config.kdjVisible ? /* @__PURE__ */ import_react.default.createElement("span", null, t("chart.kdj-pane")) : null, ["dif", "dea"].map((key) => /* @__PURE__ */ import_react.default.createElement("button", { className: "dxs-chart-line", key, "aria-pressed": config[`${key}Visible`], "aria-label": t("chart.hide-line", { line: key.toUpperCase() }), onClick: () => applyConfig({ ...config, [`${key}Visible`]: !config[`${key}Visible`] }) }, key.toUpperCase())), /* @__PURE__ */ import_react.default.createElement("button", { "aria-expanded": settings, "aria-controls": settingsId, onClick: () => setSettings(!settings) }, t("chart.settings")), /* @__PURE__ */ import_react.default.createElement("button", { "aria-pressed": maximized, onClick: toggleMacd }, t(maximized ? "chart.restore-panes" : "chart.expand-macd"))), settings && /* @__PURE__ */ import_react.default.createElement("div", { id: settingsId }, /* @__PURE__ */ import_react.default.createElement(MacdSettings, { current: config.macd, t, onApply: (macd2) => applyConfig({ ...config, macd: macd2 }), onClose: () => setSettings(false) })), /* @__PURE__ */ import_react.default.createElement(Readout, { selection, dataset, indicators, config, t, format: numbers }), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-chart-plot", hidden: renderError }, /* @__PURE__ */ import_react.default.createElement("div", { ref: element, className: "dxs-chart-canvas", tabIndex: 0, role: "group", "aria-label": t("chart.canvas"), "aria-describedby": helpId, onKeyDown: keyboard, onFocus: (event) => adapter.current?.setFocused(event.target === event.currentTarget), onBlur: () => adapter.current?.setFocused(false), onPointerDown: (event) => {
    if (!event.target.closest("a")) event.currentTarget.focus({ preventScroll: true });
  } }), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-chart-watermark", "data-kind": dataset.kind }, t(dataset.kind === "demo" ? "chart.demo-watermark" : dataset.kind === "market" ? "chart.market-watermark" : "chart.local-watermark"))), renderError && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-chart-error", role: "alert" }, t("chart.render-error")), indicators.failed && /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-chart-error", role: "alert" }, t("chart.indicator-error")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-chart-help", id: helpId }, t("chart.help")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-chart-warning" }, t("chart.warmup", { required: numbers.count(indicators.warmup.macdBars), available: numbers.count(dataset.bars.length) })), /* @__PURE__ */ import_react.default.createElement("p", { className: "dxs-chart-method" }, t("chart.method", { scale: histScale })), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-chart-table-controls" }, /* @__PURE__ */ import_react.default.createElement("button", { "aria-expanded": showTable || renderError, "aria-controls": tableId, onClick: () => setShowTable(!showTable) }, t(showTable || renderError ? "chart.table-hide" : "chart.table-show"))), (showTable || renderError) && /* @__PURE__ */ import_react.default.createElement("div", { id: tableId }, /* @__PURE__ */ import_react.default.createElement(DataTable, { dataset, indicators, config, selection, t, format: numbers, onSelect: selectDate })), /* @__PURE__ */ import_react.default.createElement("div", { className: "dxs-chart-credit" }, /* @__PURE__ */ import_react.default.createElement("a", { href: "https://www.tradingview.com/", target: "_blank", rel: "noopener noreferrer" }, t("chart.attribution"))));
}

// src/client/market/history.ts
var import_react2 = require("react");
var INITIAL = { status: "loading", value: null, error: "", refreshing: false };
function useMarketHistory(rpc, symbol, adjustment, limit = 250) {
  const [state, setState] = (0, import_react2.useState)(INITIAL);
  const [tick, setTick] = (0, import_react2.useState)(0);
  (0, import_react2.useEffect)(() => {
    if (!symbol) {
      setState({ status: "unavailable", value: null, error: "finance/history-unavailable", refreshing: false });
      return;
    }
    let disposed = false;
    const controller = new AbortController();
    const run = async () => {
      setState((previous) => previous.value?.symbol === symbol && previous.value.adjustment === adjustment ? { ...previous, refreshing: true, error: "" } : { status: "loading", value: null, error: "", refreshing: false });
      const fail2 = (code) => setState({
        status: code === "finance/history-unavailable" ? "unavailable" : "error",
        value: null,
        error: code,
        refreshing: false
      });
      try {
        if (!rpc?.call) return fail2("finance/connection");
        const result = await rpc.call("/api", MARKET_ENDPOINT, { kind: "history", symbol, adjustment, limit }, controller.signal);
        if (disposed || controller.signal.aborted) return;
        if (!result?.ok) return fail2(typeof result?.error?.code === "string" ? result.error.code : "finance/market-unavailable");
        if (result.value?.status === "unconfigured") {
          setState({ status: "unconfigured", value: null, error: "", refreshing: false });
          return;
        }
        const history = result.value?.history;
        if (!history || history.symbol !== symbol || !Array.isArray(history.bars) || !history.bars.length) return fail2("finance/invalid");
        setState({ status: "ready", value: history, error: "", refreshing: false });
      } catch (failure) {
        if (disposed || controller.signal.aborted) return;
        fail2(typeof failure?.code === "string" ? failure.code : "finance/market-unavailable");
      }
    };
    void run();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [rpc, symbol, adjustment, limit, tick]);
  return { ...state, refresh: () => {
    setTick((value) => value + 1);
  } };
}

// src/client/market/intraday.ts
var import_react3 = require("react");
var INITIAL2 = { status: "loading", value: null, error: "", refreshing: false };
var POLL_MS = 3e4;
function useMarketIntraday(rpc, symbol) {
  const [state, setState] = (0, import_react3.useState)(INITIAL2);
  const [tick, setTick] = (0, import_react3.useState)(0);
  (0, import_react3.useEffect)(() => {
    if (!symbol) {
      setState({ status: "unavailable", value: null, error: "finance/intraday-unavailable", refreshing: false });
      return;
    }
    let disposed = false;
    let timer = 0;
    const controller = new AbortController();
    const run = async () => {
      setState((previous) => previous.value?.symbol === symbol ? { ...previous, refreshing: true, error: "" } : { status: "loading", value: null, error: "", refreshing: false });
      const fail2 = (code) => setState({
        status: code === "finance/intraday-unavailable" ? "unavailable" : "error",
        value: null,
        error: code,
        refreshing: false
      });
      try {
        if (!rpc?.call) return fail2("finance/connection");
        const result = await rpc.call("/api", MARKET_ENDPOINT, { kind: "intraday", symbol }, controller.signal);
        if (disposed || controller.signal.aborted) return;
        if (!result?.ok) return fail2(typeof result?.error?.code === "string" ? result.error.code : "finance/market-unavailable");
        if (result.value?.status === "unconfigured") {
          setState({ status: "unconfigured", value: null, error: "", refreshing: false });
          return;
        }
        const intraday = result.value?.intraday;
        if (!intraday || intraday.symbol !== symbol || !Array.isArray(intraday.points) || !intraday.points.length) return fail2("finance/invalid");
        setState({ status: "ready", value: intraday, error: "", refreshing: false });
      } catch (failure) {
        if (disposed || controller.signal.aborted) return;
        fail2(typeof failure?.code === "string" ? failure.code : "finance/market-unavailable");
      }
    };
    const arm = () => {
      timer = window.setTimeout(() => {
        if (disposed) return;
        if (typeof document !== "undefined" && document.hidden) {
          arm();
          return;
        }
        void run();
        arm();
      }, POLL_MS);
    };
    void run();
    arm();
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [rpc, symbol, tick]);
  return { ...state, refresh: () => setTick((value) => value + 1) };
}

// src/client/QuantReplay.tsx
var import_react4 = __toESM(require("react"), 1);

// src/quant.ts
function crossReplay(points) {
  if (!Array.isArray(points)) throw new TypeError("replay points must be an array");
  let previous = null;
  let open = null;
  let latest = "warmup";
  const closed = [];
  for (const point of points) {
    const fast = point?.fast, slow = point?.slow, close = point?.close;
    if (fast == null || slow == null) {
      previous = null;
      continue;
    }
    if (fast === slow) {
      latest = "flat";
      continue;
    }
    const side = fast > slow ? "above" : "below";
    latest = side;
    if (previous && side !== previous && close != null && Number.isFinite(close) && close !== 0) {
      if (side === "above") {
        latest = "golden";
        if (!open) open = { entryDate: point.sessionDate, entryClose: close };
      } else if (open && open.entryClose !== 0) {
        latest = "death";
        closed.push({
          entryDate: open.entryDate,
          exitDate: point.sessionDate,
          entryClose: open.entryClose,
          exitClose: close,
          returnRatio: (close - open.entryClose) / open.entryClose
        });
        open = null;
      }
    }
    previous = side;
  }
  return { closed, open, latest };
}
function replaySummary(replay) {
  const ratios = replay.closed.map((item) => item.returnRatio).filter(Number.isFinite);
  const wins = ratios.filter((value) => value > 0).length;
  const average2 = ratios.length ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : null;
  return { samples: ratios.length, wins, average: average2, open: replay.open != null, latest: replay.latest };
}

// src/client/QuantReplay.tsx
var RULES = [
  { id: "kdj", fast: "k", slow: "d", label: "quant.kdj" },
  { id: "macd", fast: "dif", slow: "dea", label: "quant.macd" }
];
function QuantReplay({ dataset, macd: macd2, t, locale }) {
  const percent = (0, import_react4.useMemo)(() => new Intl.NumberFormat(formatLocale(locale || "en"), {
    style: "percent",
    maximumFractionDigits: 2,
    signDisplay: "exceptZero"
  }), [locale]);
  const rows = (0, import_react4.useMemo)(() => {
    try {
      const indicators = computeIndicators(dataset.bars, { macd: macd2, historyAnchor: dataset.historyAnchor });
      return RULES.map((rule) => {
        const points = dataset.bars.map((bar, index) => ({
          sessionDate: bar.sessionDate,
          close: bar.close,
          fast: indicators.rows[index]?.[rule.fast] ?? null,
          slow: indicators.rows[index]?.[rule.slow] ?? null
        }));
        return { ...rule, summary: replaySummary(crossReplay(points)) };
      });
    } catch {
      return null;
    }
  }, [dataset, macd2]);
  if (!rows) return /* @__PURE__ */ import_react4.default.createElement("section", { className: "dxs-quant" }, /* @__PURE__ */ import_react4.default.createElement("p", { role: "alert" }, t("quant.unavailable")));
  return /* @__PURE__ */ import_react4.default.createElement("section", { className: "dxs-quant", "aria-label": t("quant.title") }, /* @__PURE__ */ import_react4.default.createElement("h3", null, t("quant.title")), /* @__PURE__ */ import_react4.default.createElement("p", { className: "dxs-muted" }, t("quant.notice", { interval: t(`chart.interval.${dataset.interval ?? "1d"}`) })), /* @__PURE__ */ import_react4.default.createElement("div", { className: "dxs-quant-grid" }, rows.map((row) => /* @__PURE__ */ import_react4.default.createElement("article", { key: row.id }, /* @__PURE__ */ import_react4.default.createElement("h4", null, t(row.label)), /* @__PURE__ */ import_react4.default.createElement("p", null, t("quant.latest", { state: t(`quant.state.${row.summary.latest}`) })), row.summary.samples ? /* @__PURE__ */ import_react4.default.createElement("p", null, t("quant.samples", { count: String(row.summary.samples), wins: String(row.summary.wins), average: percent.format(row.summary.average ?? 0) })) : /* @__PURE__ */ import_react4.default.createElement("p", null, t("quant.none")), row.summary.open ? /* @__PURE__ */ import_react4.default.createElement("p", { className: "dxs-muted" }, t("quant.open")) : null))));
}

// src/client/quant/QuantPanel.tsx
var import_react5 = __toESM(require("react"), 1);

// src/analytics.ts
var QUANT_MAX_BARS = 5e3;
var QUANT_TRADING_DAYS = 252;
var QUANT_RULE_KEYS = ["ma5-20", "ma10-60", "macd", "kdj"];
var SESSION = /^\d{4}-\d{2}-\d{2}$/;
function normalizeQuantBars(input) {
  if (!Array.isArray(input)) return [];
  const unique = /* @__PURE__ */ new Map();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const bar = raw;
    if (typeof bar.sessionDate !== "string" || !SESSION.test(bar.sessionDate)) continue;
    const values = [bar.open, bar.high, bar.low, bar.close];
    if (!values.every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)) continue;
    const [open, high, low, close] = values;
    if (high < low || low > Math.min(open, close) || high < Math.max(open, close)) continue;
    unique.set(bar.sessionDate, {
      sessionDate: bar.sessionDate,
      open,
      high,
      low,
      close,
      isFinal: bar.isFinal === true
    });
  }
  return [...unique.values()].sort((left, right) => left.sessionDate.localeCompare(right.sessionDate)).slice(-QUANT_MAX_BARS);
}
function mean2(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function stdev(values) {
  if (values.length < 2) return null;
  const average2 = mean2(values);
  const variance = values.reduce((sum, value) => sum + (value - average2) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}
function simpleReturns(values) {
  const returns = [];
  for (let index = 1; index < values.length; index++) {
    const previous = values[index - 1];
    if (previous > 0) returns.push(values[index] / previous - 1);
  }
  return returns;
}
function calendarDays(from, to) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) ? (end - start) / 864e5 : 0;
}
function annualized(first, last, from, to) {
  if (!(first > 0) || !(last > 0)) return null;
  const days = calendarDays(from, to);
  if (days < 30) return null;
  return (last / first) ** (365.25 / days) - 1;
}
function maxDrawdownOf(series) {
  if (!series.length) return { value: null, peakDate: null, troughDate: null };
  let peak = series[0].value;
  let peakDate = series[0].date;
  let worst2 = 0;
  let worstPeak = null;
  let worstTrough = null;
  for (const point of series) {
    if (point.value > peak) {
      peak = point.value;
      peakDate = point.date;
    }
    if (peak > 0) {
      const drawdown = point.value / peak - 1;
      if (drawdown < worst2) {
        worst2 = drawdown;
        worstPeak = peakDate;
        worstTrough = point.date;
      }
    }
  }
  return { value: worst2, peakDate: worstPeak, troughDate: worstTrough };
}
function averageTrueRange(bars, period2 = 14) {
  if (bars.length <= period2) return null;
  const trueRanges = [];
  for (let index = 1; index < bars.length; index++) {
    const bar = bars[index], previous = bars[index - 1];
    trueRanges.push(Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previous.close),
      Math.abs(bar.low - previous.close)
    ));
  }
  if (trueRanges.length < period2) return null;
  let value = mean2(trueRanges.slice(0, period2));
  for (let index = period2; index < trueRanges.length; index++) {
    value = (value * (period2 - 1) + trueRanges[index]) / period2;
  }
  return value;
}
function relativeStrengthIndex(bars, period2 = 14) {
  if (bars.length <= period2) return null;
  let gain = 0, loss = 0;
  for (let index = 1; index <= period2; index++) {
    const difference = bars[index].close - bars[index - 1].close;
    if (difference >= 0) gain += difference;
    else loss -= difference;
  }
  let averageGain = gain / period2;
  let averageLoss = loss / period2;
  for (let index = period2 + 1; index < bars.length; index++) {
    const difference = bars[index].close - bars[index - 1].close;
    averageGain = (averageGain * (period2 - 1) + Math.max(difference, 0)) / period2;
    averageLoss = (averageLoss * (period2 - 1) + Math.max(-difference, 0)) / period2;
  }
  if (averageGain === 0 && averageLoss === 0) return 50;
  if (averageLoss === 0) return 100;
  if (averageGain === 0) return 0;
  return 100 - 100 / (1 + averageGain / averageLoss);
}
function bollingerPercentB(bars, period2 = 20, multiplier = 2) {
  if (bars.length < period2) return null;
  const closes = bars.slice(-period2).map((bar) => bar.close);
  const middle = mean2(closes);
  const deviation = stdev(closes);
  if (deviation === null || deviation === 0) return null;
  const upper = middle + multiplier * deviation;
  const lower = middle - multiplier * deviation;
  return (closes.at(-1) - lower) / (upper - lower);
}
function monthlyReturns(bars) {
  const groups = /* @__PURE__ */ new Map();
  for (const bar of bars) {
    const key = bar.sessionDate.slice(0, 7);
    const rows = groups.get(key) ?? [];
    rows.push(bar);
    groups.set(key, rows);
  }
  const lastDate = bars.at(-1)?.sessionDate ?? "";
  return [...groups.entries()].map(([key, rows]) => {
    const first = rows[0], last = rows.at(-1);
    return {
      year: Number(key.slice(0, 4)),
      month: Number(key.slice(5, 7)),
      returnRatio: last.close / first.close - 1,
      bars: rows.length,
      partial: last.sessionDate === lastDate && last.isFinal === false
    };
  });
}
function computeQuantStats(input) {
  const bars = normalizeQuantBars(input);
  const empty = {
    samples: 0,
    from: null,
    to: null,
    totalReturn: null,
    cagr: null,
    annualVolatility: null,
    sharpe: null,
    maxDrawdown: null,
    drawdownPeakDate: null,
    drawdownTroughDate: null,
    dailyWinRate: null,
    bestDay: null,
    worstDay: null,
    averageDaily: null,
    atr14: null,
    rsi14: null,
    bollingerPercentB: null,
    ma20: null,
    ma60: null,
    ma120: null,
    priceVsMa20: null,
    priceVsMa60: null,
    momentum20: null,
    momentum60: null,
    momentum120: null,
    high52w: null,
    low52w: null,
    drawdownFromHigh: null,
    monthly: []
  };
  if (!bars.length) return empty;
  const closes = bars.map((bar) => bar.close);
  const last = bars.at(-1);
  const returns = simpleReturns(closes);
  const deviation = stdev(returns);
  const drawdown = maxDrawdownOf(bars.map((bar) => ({ date: bar.sessionDate, value: bar.close })));
  const ma = (period2) => closes.length >= period2 ? mean2(closes.slice(-period2)) : null;
  const ma20 = ma(20), ma60 = ma(60), ma120 = ma(120);
  const momentum = (period2) => closes.length > period2 ? last.close / closes[closes.length - 1 - period2] - 1 : null;
  const window2 = bars.slice(-Math.min(252, bars.length));
  const high52w = Math.max(...window2.map((bar) => bar.high));
  const low52w = Math.min(...window2.map((bar) => bar.low));
  return {
    samples: bars.length,
    from: bars[0].sessionDate,
    to: last.sessionDate,
    totalReturn: closes.length > 1 ? last.close / closes[0] - 1 : null,
    cagr: closes.length > 1 ? annualized(closes[0], last.close, bars[0].sessionDate, last.sessionDate) : null,
    annualVolatility: deviation === null ? null : deviation * Math.sqrt(QUANT_TRADING_DAYS),
    sharpe: deviation === null || deviation === 0 ? null : mean2(returns) / deviation * Math.sqrt(QUANT_TRADING_DAYS),
    maxDrawdown: drawdown.value,
    drawdownPeakDate: drawdown.peakDate,
    drawdownTroughDate: drawdown.troughDate,
    dailyWinRate: returns.length ? returns.filter((value) => value > 0).length / returns.length : null,
    bestDay: returns.length ? Math.max(...returns) : null,
    worstDay: returns.length ? Math.min(...returns) : null,
    averageDaily: returns.length ? mean2(returns) : null,
    atr14: averageTrueRange(bars),
    rsi14: relativeStrengthIndex(bars),
    bollingerPercentB: bollingerPercentB(bars),
    ma20,
    ma60,
    ma120,
    priceVsMa20: ma20 === null ? null : last.close / ma20 - 1,
    priceVsMa60: ma60 === null ? null : last.close / ma60 - 1,
    momentum20: momentum(20),
    momentum60: momentum(60),
    momentum120: momentum(120),
    high52w,
    low52w,
    drawdownFromHigh: last.close / high52w - 1,
    monthly: monthlyReturns(bars)
  };
}
function correlationWith(left, right) {
  const first = normalizeQuantBars(left);
  const second = normalizeQuantBars(right);
  if (first.length < 21 || second.length < 21) return null;
  const byDate = new Map(second.map((bar) => [bar.sessionDate, bar.close]));
  const aligned = [];
  for (const bar of first) {
    const other = byDate.get(bar.sessionDate);
    if (other !== void 0) aligned.push({ date: bar.sessionDate, left: bar.close, right: other });
  }
  if (aligned.length < 21) return null;
  const leftReturns = [], rightReturns = [];
  for (let index = 1; index < aligned.length; index++) {
    const previous = aligned[index - 1], current = aligned[index];
    leftReturns.push(current.left / previous.left - 1);
    rightReturns.push(current.right / previous.right - 1);
  }
  if (leftReturns.length < 20) return null;
  const leftMean = mean2(leftReturns), rightMean = mean2(rightReturns);
  let covariance = 0, leftVariance = 0, rightVariance = 0;
  for (let index = 0; index < leftReturns.length; index++) {
    const dl = leftReturns[index] - leftMean;
    const dr2 = rightReturns[index] - rightMean;
    covariance += dl * dr2;
    leftVariance += dl * dl;
    rightVariance += dr2 * dr2;
  }
  if (leftVariance === 0 || rightVariance === 0) return null;
  return { value: covariance / Math.sqrt(leftVariance * rightVariance), samples: leftReturns.length };
}
function validateRule(raw) {
  return QUANT_RULE_KEYS.includes(raw) ? raw : "ma5-20";
}
function costBps(raw, fallback) {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : fallback;
}
function crossSignals(fast, slow) {
  const signals = [];
  let previous = null;
  for (let index = 0; index < fast.length; index++) {
    const fastValue = fast[index], slowValue = slow[index];
    if (fastValue == null || slowValue == null) {
      previous = null;
      signals.push(null);
      continue;
    }
    if (fastValue === slowValue) {
      signals.push(null);
      continue;
    }
    const side = fastValue > slowValue ? "above" : "below";
    signals.push(previous !== null && side !== previous ? side === "above" ? "buy" : "sell" : null);
    previous = side;
  }
  return signals;
}
function ruleSignals(bars, rule) {
  const closes = bars.map((bar) => bar.close);
  if (rule === "ma5-20") return crossSignals(sma(closes, 5), sma(closes, 20));
  if (rule === "ma10-60") return crossSignals(sma(closes, 10), sma(closes, 60));
  if (rule === "macd") {
    const value2 = macd(closes);
    return crossSignals(value2.dif, value2.dea);
  }
  const value = kdj(bars);
  return crossSignals(value.k, value.d);
}
function runBacktest(input, options = {}) {
  const bars = normalizeQuantBars(input);
  const rule = validateRule(options.rule);
  const commissionBps = costBps(options.commissionBps, 5);
  const slippageBps = costBps(options.slippageBps, 5);
  const signals = ruleSignals(bars, rule);
  const buyFactor = (1 + commissionBps / 1e4) * (1 + slippageBps / 1e4);
  const sellFactor = (1 - commissionBps / 1e4) * (1 - slippageBps / 1e4);
  const trades = [];
  const points = [];
  let equity = 1;
  let position2 = null;
  let pending = null;
  let inMarket = 0;
  for (let index = 0; index < bars.length; index++) {
    const bar = bars[index];
    if (pending === "buy" && !position2) {
      const price2 = bar.open * buyFactor;
      position2 = { entryDate: bar.sessionDate, entryPrice: price2, entryGross: bar.open, entryIndex: index };
    } else if (pending === "sell" && position2) {
      const price2 = bar.open * sellFactor;
      equity *= price2 / position2.entryPrice;
      trades.push({
        entryDate: position2.entryDate,
        exitDate: bar.sessionDate,
        entryPrice: position2.entryGross,
        exitPrice: bar.open,
        returnRatio: price2 / position2.entryPrice - 1,
        bars: index - position2.entryIndex,
        open: false
      });
      position2 = null;
    }
    pending = null;
    if (position2) inMarket++;
    points.push({
      date: bar.sessionDate,
      strategy: position2 ? equity * (bar.close / position2.entryPrice) : equity,
      buyHold: bar.close / bars[0].close
    });
    if (index < bars.length - 1) {
      if (!position2 && signals[index] === "buy") pending = "buy";
      else if (position2 && signals[index] === "sell") pending = "sell";
    }
  }
  if (position2) {
    const last = bars.at(-1);
    const price2 = last.close * sellFactor;
    equity *= price2 / position2.entryPrice;
    trades.push({
      entryDate: position2.entryDate,
      exitDate: last.sessionDate,
      entryPrice: position2.entryGross,
      exitPrice: last.close,
      returnRatio: price2 / position2.entryPrice - 1,
      bars: bars.length - 1 - position2.entryIndex,
      open: true
    });
    points[points.length - 1] = { ...points.at(-1), strategy: equity };
  }
  const wins = trades.filter((trade) => trade.returnRatio > 0);
  const losses = trades.filter((trade) => trade.returnRatio < 0);
  const gains = wins.reduce((sum, trade) => sum + trade.returnRatio, 0);
  const totalLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.returnRatio, 0));
  const drawdown = maxDrawdownOf(points.map((point) => ({ date: point.date, value: point.strategy })));
  const strategyReturns = simpleReturns(points.map((point) => point.strategy));
  const deviation = stdev(strategyReturns);
  return {
    rule,
    commissionBps,
    slippageBps,
    bars: bars.length,
    trades,
    points,
    totalReturn: points.length ? points.at(-1).strategy - 1 : null,
    buyHoldReturn: points.length ? points.at(-1).buyHold - 1 : null,
    cagr: points.length > 1 ? annualized(points[0].strategy, points.at(-1).strategy, points[0].date, points.at(-1).date) : null,
    maxDrawdown: drawdown.value,
    sharpe: deviation === null || deviation === 0 ? null : mean2(strategyReturns) / deviation * Math.sqrt(QUANT_TRADING_DAYS),
    winRate: trades.length ? wins.length / trades.length : null,
    tradeCount: trades.length,
    averageTrade: trades.length ? trades.reduce((sum, trade) => sum + trade.returnRatio, 0) / trades.length : null,
    profitFactor: totalLoss > 0 ? gains / totalLoss : null,
    exposure: bars.length ? inMarket / bars.length : null
  };
}

// src/client/quant/QuantPanel.tsx
var RULES2 = ["ma5-20", "ma10-60", "macd", "kdj"];
var MONTHS = Array.from({ length: 12 }, (_2, index) => index + 1);
var count = (format, value) => typeof format?.count === "function" ? format.count(value) : String(value);
var price = (format, value) => value === null || !Number.isFinite(value) ? "\u2014" : typeof format?.price === "function" ? format.price(value) : String(value);
var pct = (format, ratio) => ratio === null || !Number.isFinite(ratio) ? "\u2014" : typeof format?.change === "function" ? format.change(ratio * 100) : `${(ratio * 100).toFixed(2)}%`;
var plainPct = (format, ratio) => ratio === null || !Number.isFinite(ratio) ? "\u2014" : typeof format?.percent === "function" ? format.percent(ratio * 100) : `${(ratio * 100).toFixed(2)}%`;
var decimal = (format, value) => price(format, value);
var signed = (format, value) => value === null || !Number.isFinite(value) ? "\u2014" : typeof format?.signed === "function" ? format.signed(value) : String(value);
var toneOf = (value) => value === null || !Number.isFinite(value) ? "" : value > 0 ? "dxs-up" : value < 0 ? "dxs-down" : "";
function Stat({ label, value, note, tone: tone3 }) {
  return /* @__PURE__ */ import_react5.default.createElement("div", { className: "dxs-quant-stat" }, /* @__PURE__ */ import_react5.default.createElement("div", { className: "dxs-quant-stat-label" }, label), /* @__PURE__ */ import_react5.default.createElement("div", { className: `dxs-quant-stat-value ${tone3 ?? ""}` }, value), note ? /* @__PURE__ */ import_react5.default.createElement("div", { className: "dxs-quant-stat-note" }, note) : null);
}
function EquityChart({ points, t, format }) {
  if (!Array.isArray(points) || points.length < 2) return /* @__PURE__ */ import_react5.default.createElement("p", { className: "dxs-quant-muted" }, t("quant.empty"));
  const width = 720, height = 200, padding = 10;
  const values = points.flatMap((point) => [point.strategy, point.buyHold]).filter((value) => Number.isFinite(value));
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const x2 = (index) => padding + index / (points.length - 1) * (width - 2 * padding);
  const y2 = (value) => height - padding - (value - min) / span * (height - 2 * padding);
  const path = (key) => points.map((point, index) => `${index ? "L" : "M"}${x2(index).toFixed(2)} ${y2(point[key]).toFixed(2)}`).join(" ");
  const last = points.at(-1);
  return /* @__PURE__ */ import_react5.default.createElement("div", { className: "dxs-quant-chart" }, /* @__PURE__ */ import_react5.default.createElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `${t("quant.equity")} \xB7 ${t("quant.equity-strategy")} ${pct(format, last.strategy - 1)} \xB7 ${t("quant.equity-buyhold")} ${pct(format, last.buyHold - 1)}` }, min < 1 && max > 1 ? /* @__PURE__ */ import_react5.default.createElement("line", { className: "is-baseline", x1: padding, x2: width - padding, y1: y2(1), y2: y2(1) }) : null, /* @__PURE__ */ import_react5.default.createElement("text", { className: "is-axis", x: padding + 2, y: padding + 10 }, format.price(max)), /* @__PURE__ */ import_react5.default.createElement("text", { className: "is-axis", x: padding + 2, y: height - padding - 2 }, format.price(min)), /* @__PURE__ */ import_react5.default.createElement("path", { className: "is-buyhold", d: path("buyHold") }), /* @__PURE__ */ import_react5.default.createElement("path", { className: "is-strategy", d: path("strategy") })), /* @__PURE__ */ import_react5.default.createElement("div", { className: "dxs-quant-legend" }, /* @__PURE__ */ import_react5.default.createElement("span", null, /* @__PURE__ */ import_react5.default.createElement("i", { className: "is-strategy" }), t("quant.equity-strategy")), /* @__PURE__ */ import_react5.default.createElement("span", null, /* @__PURE__ */ import_react5.default.createElement("i", { className: "is-buyhold" }), t("quant.equity-buyhold"))));
}
function QuantPanel({ dataset, benchmark, t, format }) {
  const stats = (0, import_react5.useMemo)(() => computeQuantStats(dataset.bars), [dataset]);
  const correlation = (0, import_react5.useMemo)(
    () => benchmark ? correlationWith(dataset.bars, benchmark.bars) : null,
    [dataset, benchmark]
  );
  const [rule, setRule] = (0, import_react5.useState)("ma5-20");
  const [commission, setCommission] = (0, import_react5.useState)(5);
  const [slippage, setSlippage] = (0, import_react5.useState)(5);
  const backtest = (0, import_react5.useMemo)(
    () => runBacktest(dataset.bars, { rule, commissionBps: commission, slippageBps: slippage }),
    [dataset, rule, commission, slippage]
  );
  const years = (0, import_react5.useMemo)(() => {
    const unique = [...new Set(stats.monthly.map((item) => item.year))].sort((left, right) => right - left);
    return unique;
  }, [stats.monthly]);
  const byMonth = (0, import_react5.useMemo)(() => new Map(stats.monthly.map((item) => [`${item.year}-${item.month}`, item])), [stats.monthly]);
  const trades = (0, import_react5.useMemo)(() => [...backtest.trades].reverse().slice(0, 100), [backtest.trades]);
  const lastClose = dataset.bars.at(-1)?.close ?? null;
  const cost = (raw) => {
    const value = Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
  };
  if (stats.samples < 2) {
    return /* @__PURE__ */ import_react5.default.createElement("section", { className: "dxs-quant", "aria-label": t("quant.title") }, /* @__PURE__ */ import_react5.default.createElement("header", { className: "dxs-quant-head" }, /* @__PURE__ */ import_react5.default.createElement("div", null, /* @__PURE__ */ import_react5.default.createElement("h3", null, t("quant.title")), /* @__PURE__ */ import_react5.default.createElement("p", null, t("quant.subtitle")))), /* @__PURE__ */ import_react5.default.createElement("p", { className: "dxs-quant-muted" }, t("quant.empty")));
  }
  return /* @__PURE__ */ import_react5.default.createElement("section", { className: "dxs-quant", "aria-label": t("quant.title") }, /* @__PURE__ */ import_react5.default.createElement("header", { className: "dxs-quant-head" }, /* @__PURE__ */ import_react5.default.createElement("div", null, /* @__PURE__ */ import_react5.default.createElement("h3", null, t("quant.title")), /* @__PURE__ */ import_react5.default.createElement("p", null, t("quant.subtitle")), /* @__PURE__ */ import_react5.default.createElement("p", { className: "dxs-quant-muted" }, t("quant.sample", { count: count(format, stats.samples), from: stats.from, to: stats.to })), stats.samples < 120 ? /* @__PURE__ */ import_react5.default.createElement("p", { className: "dxs-quant-muted" }, t("quant.insufficient")) : null), /* @__PURE__ */ import_react5.default.createElement("span", { className: "dxs-quant-badge" }, t("quant.stats"))), /* @__PURE__ */ import_react5.default.createElement("div", { className: "dxs-quant-stats" }, /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.total-return"), value: pct(format, stats.totalReturn), tone: toneOf(stats.totalReturn) }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.cagr"), value: pct(format, stats.cagr), note: t("quant.cagr-note") }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.volatility"), value: plainPct(format, stats.annualVolatility) }), /* @__PURE__ */ import_react5.default.createElement(
    Stat,
    {
      label: t("quant.drawdown"),
      value: pct(format, stats.maxDrawdown),
      note: stats.drawdownPeakDate && stats.drawdownTroughDate ? `${stats.drawdownPeakDate} \u2192 ${stats.drawdownTroughDate}` : void 0
    }
  ), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.sharpe"), value: signed(format, stats.sharpe), note: t("quant.sharpe-note") }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.winrate"), value: plainPct(format, stats.dailyWinRate) }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.best-day"), value: pct(format, stats.bestDay), tone: toneOf(stats.bestDay) }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.worst-day"), value: pct(format, stats.worstDay), tone: toneOf(stats.worstDay) }), /* @__PURE__ */ import_react5.default.createElement(
    Stat,
    {
      label: t("quant.atr"),
      value: decimal(format, stats.atr14),
      note: stats.atr14 !== null && lastClose ? t("quant.atr-note", { value: plainPct(format, stats.atr14 / lastClose) }) : void 0
    }
  ), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.rsi"), value: decimal(format, stats.rsi14) }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.boll"), value: decimal(format, stats.bollingerPercentB) }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.ma20"), value: pct(format, stats.priceVsMa20), note: stats.ma20 !== null ? t("quant.ma-note", { value: price(format, stats.ma20) }) : void 0 }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.ma60"), value: pct(format, stats.priceVsMa60), note: stats.ma60 !== null ? t("quant.ma-note", { value: price(format, stats.ma60) }) : void 0 }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.momentum"), value: `${pct(format, stats.momentum20)} / ${pct(format, stats.momentum60)} / ${pct(format, stats.momentum120)}` }), /* @__PURE__ */ import_react5.default.createElement(
    Stat,
    {
      label: t("quant.range52"),
      value: stats.high52w !== null && stats.low52w !== null ? `${price(format, stats.low52w)} \u2013 ${price(format, stats.high52w)}` : "\u2014",
      note: stats.drawdownFromHigh !== null ? t("quant.range52-note", { value: pct(format, stats.drawdownFromHigh) }) : void 0
    }
  ), /* @__PURE__ */ import_react5.default.createElement(
    Stat,
    {
      label: benchmark ? t("quant.correlation", { name: benchmark.name || benchmark.symbol }) : t("quant.correlation-none"),
      value: correlation ? signed(format, correlation.value) : "\u2014",
      note: correlation ? t("quant.correlation-note", { count: count(format, correlation.samples) }) : t("quant.correlation-none")
    }
  )), /* @__PURE__ */ import_react5.default.createElement("div", { className: "dxs-quant-card" }, /* @__PURE__ */ import_react5.default.createElement("header", { className: "dxs-quant-card-head" }, /* @__PURE__ */ import_react5.default.createElement("div", null, /* @__PURE__ */ import_react5.default.createElement("h4", null, t("quant.monthly")), /* @__PURE__ */ import_react5.default.createElement("p", null, t("quant.monthly-note")))), /* @__PURE__ */ import_react5.default.createElement("div", { className: "dxs-quant-table-wrap" }, /* @__PURE__ */ import_react5.default.createElement("table", { className: "dxs-quant-monthly" }, /* @__PURE__ */ import_react5.default.createElement("caption", null, t("quant.monthly")), /* @__PURE__ */ import_react5.default.createElement("thead", null, /* @__PURE__ */ import_react5.default.createElement("tr", null, /* @__PURE__ */ import_react5.default.createElement("th", { scope: "col" }, t("quant.monthly-year")), MONTHS.map((month) => /* @__PURE__ */ import_react5.default.createElement("th", { key: month, scope: "col" }, month)))), /* @__PURE__ */ import_react5.default.createElement("tbody", null, years.map((year) => /* @__PURE__ */ import_react5.default.createElement("tr", { key: year }, /* @__PURE__ */ import_react5.default.createElement("th", { scope: "row" }, year), MONTHS.map((month) => {
    const item = byMonth.get(`${year}-${month}`);
    if (!item) return /* @__PURE__ */ import_react5.default.createElement("td", { key: month, className: "is-empty" }, "\u2014");
    return /* @__PURE__ */ import_react5.default.createElement(
      "td",
      {
        key: month,
        className: item.returnRatio > 0 ? "dxs-up" : item.returnRatio < 0 ? "dxs-down" : "",
        title: item.partial ? t("quant.monthly-partial") : void 0
      },
      pct(format, item.returnRatio),
      item.partial ? /* @__PURE__ */ import_react5.default.createElement("span", { className: "dxs-quant-partial", "aria-label": t("quant.monthly-partial") }, "*") : null
    );
  }))))))), /* @__PURE__ */ import_react5.default.createElement("div", { className: "dxs-quant-card" }, /* @__PURE__ */ import_react5.default.createElement("header", { className: "dxs-quant-card-head" }, /* @__PURE__ */ import_react5.default.createElement("div", null, /* @__PURE__ */ import_react5.default.createElement("h4", null, t("quant.backtest")), /* @__PURE__ */ import_react5.default.createElement("p", null, t("quant.backtest-note")))), /* @__PURE__ */ import_react5.default.createElement("div", { className: "dxs-quant-controls" }, /* @__PURE__ */ import_react5.default.createElement("label", { className: "dxs-quant-field" }, t("quant.rule"), /* @__PURE__ */ import_react5.default.createElement("select", { value: rule, onChange: (event) => setRule(event.target.value) }, RULES2.map((value) => /* @__PURE__ */ import_react5.default.createElement("option", { key: value, value }, t(`quant.rule.${value}`))))), /* @__PURE__ */ import_react5.default.createElement("label", { className: "dxs-quant-field" }, t("quant.commission"), /* @__PURE__ */ import_react5.default.createElement("input", { type: "number", min: 0, max: 100, step: 1, value: commission, onChange: (event) => setCommission(cost(event.target.value)) })), /* @__PURE__ */ import_react5.default.createElement("label", { className: "dxs-quant-field" }, t("quant.slippage"), /* @__PURE__ */ import_react5.default.createElement("input", { type: "number", min: 0, max: 100, step: 1, value: slippage, onChange: (event) => setSlippage(cost(event.target.value)) }))), /* @__PURE__ */ import_react5.default.createElement("div", { className: "dxs-quant-metrics" }, /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.strategy-return"), value: pct(format, backtest.totalReturn), tone: toneOf(backtest.totalReturn) }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.buyhold-return"), value: pct(format, backtest.buyHoldReturn) }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.drawdown"), value: pct(format, backtest.maxDrawdown) }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.sharpe"), value: signed(format, backtest.sharpe), note: t("quant.sharpe-note") }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.trade-count"), value: count(format, backtest.tradeCount) }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.trade-winrate"), value: plainPct(format, backtest.winRate) }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.profit-factor"), value: decimal(format, backtest.profitFactor), note: backtest.profitFactor === null && backtest.tradeCount > 0 ? t("quant.profit-factor-note") : void 0 }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.exposure"), value: plainPct(format, backtest.exposure) }), /* @__PURE__ */ import_react5.default.createElement(Stat, { label: t("quant.average-trade"), value: pct(format, backtest.averageTrade) })), /* @__PURE__ */ import_react5.default.createElement("h5", { className: "dxs-quant-subtitle" }, t("quant.equity")), /* @__PURE__ */ import_react5.default.createElement(EquityChart, { points: backtest.points, t, format }), /* @__PURE__ */ import_react5.default.createElement("details", { className: "dxs-quant-details" }, /* @__PURE__ */ import_react5.default.createElement("summary", null, t("quant.trades"), " \xB7 ", count(format, backtest.tradeCount)), trades.length ? /* @__PURE__ */ import_react5.default.createElement("div", { className: "dxs-quant-table-wrap dxs-quant-trades" }, /* @__PURE__ */ import_react5.default.createElement("table", null, /* @__PURE__ */ import_react5.default.createElement("caption", null, t("quant.trades")), /* @__PURE__ */ import_react5.default.createElement("thead", null, /* @__PURE__ */ import_react5.default.createElement("tr", null, /* @__PURE__ */ import_react5.default.createElement("th", { scope: "col" }, t("quant.trade-entry")), /* @__PURE__ */ import_react5.default.createElement("th", { scope: "col" }, t("quant.trade-exit")), /* @__PURE__ */ import_react5.default.createElement("th", { scope: "col" }, t("quant.trade-return")), /* @__PURE__ */ import_react5.default.createElement("th", { scope: "col" }, t("quant.trade-bars")))), /* @__PURE__ */ import_react5.default.createElement("tbody", null, trades.map((trade) => /* @__PURE__ */ import_react5.default.createElement("tr", { key: `${trade.entryDate}:${trade.exitDate}` }, /* @__PURE__ */ import_react5.default.createElement("td", null, trade.entryDate, /* @__PURE__ */ import_react5.default.createElement("small", null, price(format, trade.entryPrice))), /* @__PURE__ */ import_react5.default.createElement("td", null, trade.exitDate, /* @__PURE__ */ import_react5.default.createElement("small", null, price(format, trade.exitPrice)), trade.open ? /* @__PURE__ */ import_react5.default.createElement("em", { className: "dxs-quant-open" }, t("quant.trade-open")) : null), /* @__PURE__ */ import_react5.default.createElement("td", { className: trade.returnRatio > 0 ? "dxs-up" : trade.returnRatio < 0 ? "dxs-down" : "" }, pct(format, trade.returnRatio)), /* @__PURE__ */ import_react5.default.createElement("td", null, count(format, trade.bars))))))) : /* @__PURE__ */ import_react5.default.createElement("p", { className: "dxs-quant-muted" }, t("quant.no-trades"))), /* @__PURE__ */ import_react5.default.createElement("details", { className: "dxs-quant-details" }, /* @__PURE__ */ import_react5.default.createElement("summary", null, t("quant.assumptions")), /* @__PURE__ */ import_react5.default.createElement("ul", null, /* @__PURE__ */ import_react5.default.createElement("li", null, t("quant.assumption-1")), /* @__PURE__ */ import_react5.default.createElement("li", null, t("quant.assumption-2")), /* @__PURE__ */ import_react5.default.createElement("li", null, t("quant.assumption-3")), /* @__PURE__ */ import_react5.default.createElement("li", null, t("quant.assumption-4")))), /* @__PURE__ */ import_react5.default.createElement("details", { className: "dxs-quant-details" }, /* @__PURE__ */ import_react5.default.createElement("summary", null, t("quant.formula")), /* @__PURE__ */ import_react5.default.createElement("ul", null, /* @__PURE__ */ import_react5.default.createElement("li", null, t("quant.formula-1")), /* @__PURE__ */ import_react5.default.createElement("li", null, t("quant.formula-2")), /* @__PURE__ */ import_react5.default.createElement("li", null, t("quant.formula-3")), /* @__PURE__ */ import_react5.default.createElement("li", null, t("quant.formula-4")))), /* @__PURE__ */ import_react5.default.createElement("p", { className: "dxs-quant-muted" }, t("quant.not-advice"))));
}

// src/client/chart/IntradayChart.tsx
var import_react6 = __toESM(require("react"), 1);

// src/client/chart/intraday-scale.ts
var OPEN = 9 * 60 + 15;
var MORNING_END = 11 * 60 + 30;
var AFTERNOON = 13 * 60;
var MORNING_SPAN = MORNING_END - OPEN;
function sessionOffset(time) {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  if (minutes >= OPEN && minutes <= MORNING_END) return minutes - OPEN;
  if (minutes >= AFTERNOON && minutes <= 15 * 60) return MORNING_SPAN + 1 + (minutes - AFTERNOON);
  return null;
}
function clockFromOffset(offset) {
  const minutes = offset <= MORNING_SPAN ? OPEN + offset : AFTERNOON + (offset - MORNING_SPAN - 1);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
function exchangeStamp(sessionDate, time) {
  const offset = sessionOffset(time);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate);
  if (offset === null || !match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 1e3 + offset * 60;
}
function formatExchangeClock(stamp) {
  const date = new Date(stamp * 1e3);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1e3;
  return clockFromOffset(Math.round((stamp - midnight) / 60));
}
function intradayRange(prices, previousClose) {
  let furthest = 0;
  for (const price2 of prices) furthest = Math.max(furthest, Math.abs(price2 - previousClose) / previousClose);
  const percent = Math.max(furthest * 1.08, 2e-3) * 100;
  return {
    priceMin: previousClose * (1 - percent / 100),
    priceMax: previousClose * (1 + percent / 100),
    percent
  };
}
function formatLots(value) {
  const abs = Math.abs(value);
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)}\u4EBF`;
  if (abs >= 1e4) return `${(value / 1e4).toFixed(2)}\u4E07`;
  return String(Math.round(value));
}

// src/client/chart/IntradayChart.tsx
function IntradayChart({ session, t }) {
  const element = (0, import_react6.useRef)(null);
  const [failed, setFailed] = (0, import_react6.useState)(false);
  const last = session.points.at(-1);
  const previous = session.previousClose;
  const up = previous == null || last.price >= previous;
  (0, import_react6.useEffect)(() => {
    const node = element.current;
    if (!node) return;
    let chart;
    try {
      const palette = PALETTES[resolveChartTheme(node)] ?? PALETTES.light;
      const clock = (time) => typeof time === "number" ? formatExchangeClock(time) : "";
      chart = le(node, {
        width: Math.max(1, node.clientWidth),
        height: 360,
        layout: { background: { type: $i.Solid, color: palette.background }, textColor: palette.text, fontFamily: "system-ui, sans-serif", attributionLogo: true },
        grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
        leftPriceScale: { visible: previous != null, borderColor: palette.border },
        rightPriceScale: { visible: true, borderColor: palette.border },
        localization: { timeFormatter: clock },
        timeScale: { borderColor: palette.border, timeVisible: true, secondsVisible: false, tickMarkFormatter: clock },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }
      });
      const range = typeof previous === "number" ? intradayRange(session.points.flatMap((point) => point.average == null ? [point.price] : [point.price, point.average]), previous) : null;
      const price2 = chart.addSeries(ye, {
        color: up ? UP_COLOR : DOWN_COLOR,
        lineWidth: 2,
        priceLineVisible: false,
        priceScaleId: range ? "left" : "right",
        autoscaleInfoProvider: range ? () => ({ priceRange: { minValue: range.priceMin, maxValue: range.priceMax } }) : void 0
      }, 0);
      const average2 = chart.addSeries(ye, {
        color: "#df9635",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        priceScaleId: range ? "left" : "right",
        autoscaleInfoProvider: range ? () => ({ priceRange: { minValue: range.priceMin, maxValue: range.priceMax } }) : void 0
      }, 0);
      if (range) chart.addSeries(ye, {
        priceScaleId: "right",
        color: "transparent",
        lineVisible: false,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceFormat: { type: "custom", minMove: 0.01, formatter: (value) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%` },
        autoscaleInfoProvider: () => ({ priceRange: { minValue: -range.percent, maxValue: range.percent } })
      }, 0).setData(session.points.map((point) => ({ time: exchangeStamp(session.sessionDate, point.time), value: (point.price - previous) / previous * 100 })));
      const volume = chart.addSeries(nr, {
        priceFormat: { type: "custom", formatter: (value) => formatLots(value) }
      }, 1);
      chart.panes()[0].setStretchFactor(3);
      chart.panes()[1].setStretchFactor(1);
      const at2 = (time) => exchangeStamp(session.sessionDate, time);
      price2.setData(session.points.map((point) => ({ time: at2(point.time), value: point.price })));
      average2.setData(session.points.filter((point) => point.average != null).map((point) => ({ time: at2(point.time), value: point.average })));
      volume.setData(session.points.map((point, index) => {
        const prior = index ? session.points[index - 1].price : previous;
        const rising = prior == null || point.price >= prior;
        const time = at2(point.time);
        return point.volume == null ? { time } : { time, value: point.volume, color: rising ? UP_COLOR : DOWN_COLOR };
      }));
      if (previous != null) price2.createPriceLine({ price: previous, color: palette.crosshair, lineWidth: 1, lineStyle: h.Dashed, title: t("intraday.previous") });
      chart.timeScale().fitContent();
      setFailed(false);
    } catch {
      setFailed(true);
    }
    return () => {
      try {
        chart?.remove();
      } catch {
      }
    };
  }, [session, up, previous]);
  return /* @__PURE__ */ import_react6.default.createElement("div", { className: "dxs-intraday" }, /* @__PURE__ */ import_react6.default.createElement("p", { className: "dxs-intraday-legend" }, /* @__PURE__ */ import_react6.default.createElement("span", null, /* @__PURE__ */ import_react6.default.createElement("i", { style: { background: up ? UP_COLOR : DOWN_COLOR } }), t("intraday.price")), /* @__PURE__ */ import_react6.default.createElement("span", null, /* @__PURE__ */ import_react6.default.createElement("i", { style: { background: "#df9635" } }), t("intraday.average")), /* @__PURE__ */ import_react6.default.createElement("span", null, /* @__PURE__ */ import_react6.default.createElement("i", { className: "is-dashed" }), t("intraday.previous")), /* @__PURE__ */ import_react6.default.createElement("span", null, t(previous == null ? "intraday.axis-price" : "intraday.axis"))), failed ? /* @__PURE__ */ import_react6.default.createElement("p", { role: "alert" }, t("intraday.chart-failed")) : /* @__PURE__ */ import_react6.default.createElement("div", { className: "dxs-intraday-plot" }, /* @__PURE__ */ import_react6.default.createElement("div", { ref: element, className: "dxs-intraday-canvas", role: "img", "aria-label": t("intraday.canvas", { date: session.sessionDate }) }), /* @__PURE__ */ import_react6.default.createElement("span", { className: "dxs-intraday-volume" }, t("intraday.volume"))));
}

// src/resample.ts
var DAY = 864e5;
function utcDate(sessionDate) {
  const [year, month, day] = sessionDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}
function formatUtc(ms2) {
  const date = new Date(ms2);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}
function weekStart(sessionDate) {
  const utc = utcDate(sessionDate);
  const weekday = new Date(utc).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return formatUtc(utc + mondayOffset * DAY);
}
function shanghaiSessionDate(now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const pick = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}
function finite2(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function sumOrNull(values) {
  if (!values.every(finite2)) return null;
  let sum = 0;
  for (const value of values) sum += value;
  return Number.isFinite(sum) ? sum : null;
}
function periodEnded(interval, key, today, last, complete) {
  if (interval === "1w") {
    const friday = formatUtc(utcDate(key) + 4 * DAY);
    return today > friday || today === friday && complete && last.sessionDate === friday;
  }
  if (interval === "1M") return today.slice(0, 7) > key;
  return today.slice(0, 4) > key;
}
function resampleBars(bars, interval, now = /* @__PURE__ */ new Date()) {
  if (!Array.isArray(bars)) throw new TypeError("resample bars must be an array");
  if (interval === "1d") return bars;
  const today = shanghaiSessionDate(now);
  const groups = [];
  for (const bar of bars) {
    if (!bar || typeof bar.sessionDate !== "string" || !finite2(bar.open) || !finite2(bar.high) || !finite2(bar.low) || !finite2(bar.close)) throw new TypeError("resample requires finite OHLC daily bars");
    const key = interval === "1w" ? weekStart(bar.sessionDate) : interval === "1M" ? bar.sessionDate.slice(0, 7) : bar.sessionDate.slice(0, 4);
    const current = groups.at(-1);
    if (!current || current.key !== key) groups.push({ key, bars: [bar] });
    else current.bars.push(bar);
  }
  return groups.map((group, index) => {
    const members = group.bars;
    const last = members.at(-1);
    const complete = members.every((bar) => bar.isFinal === true);
    const later = index < groups.length - 1;
    return {
      sessionDate: last.sessionDate,
      open: members[0].open,
      high: Math.max(...members.map((bar) => bar.high)),
      low: Math.min(...members.map((bar) => bar.low)),
      close: last.close,
      volume: sumOrNull(members.map((bar) => bar.volume)),
      amount: sumOrNull(members.map((bar) => bar.amount)),
      isFinal: complete && (later || periodEnded(interval, group.key, today, last, complete)),
      updatedAt: null,
      revision: `${interval}:${group.key}`
    };
  });
}
function resampleDataset(dataset, interval, now = /* @__PURE__ */ new Date()) {
  if (!dataset || dataset.interval !== "1d") throw new TypeError("only daily datasets can be resampled");
  if (interval === "1d") return dataset;
  const bars = resampleBars(dataset.bars, interval, now);
  if (!bars.length) throw new TypeError("resample produced no bars");
  return {
    ...dataset,
    id: `${dataset.id}:${interval}`,
    interval,
    datasetRevision: `${dataset.datasetRevision}:${interval}`,
    historyAnchor: bars[0].sessionDate,
    bars
  };
}

// src/client/workbench.tsx
var chartSettingsKey = (scope) => `dsh-x-finance:chart:v1:${validateScope(scope)}`;
var historySettingsKey = (scope) => `dsh-x-finance:history:v1:${validateScope(scope)}`;
var previousIdKey = (kind, scope) => `dsh-x-stock:${kind}:v1:${validateScope(scope)}`;
var readSettings = (key, fallback) => {
  const storage = globalThis.localStorage;
  return storage?.getItem(key) ?? storage?.getItem(fallback) ?? "null";
};
var ADJUSTMENTS = ["forward", "none", "backward"];
var VIEWS = ["intraday", "1d", "1w", "1M", "1y"];
function normalizeView(raw) {
  return VIEWS.includes(raw) ? raw : "1d";
}
function normalizeAdjustment(raw) {
  return ADJUSTMENTS.includes(raw) ? raw : "forward";
}
function IntradayPanel({ session, t, locale }) {
  const last = session.points.at(-1);
  const price2 = new Intl.NumberFormat(formatLocale(locale), { minimumFractionDigits: session.pricePrecision, maximumFractionDigits: session.pricePrecision });
  const quantity = new Intl.NumberFormat(formatLocale(locale), { maximumFractionDigits: 2 });
  const previous = session.previousClose;
  const change = typeof previous === "number" ? (last.price - previous) / previous : null;
  const percent = change == null ? null : new Intl.NumberFormat(formatLocale(locale), { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(change);
  return /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxs-data-banner is-market", role: "status" }, t("intraday.notice")), /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxs-dataset-heading" }, /* @__PURE__ */ import_react7.default.createElement("strong", null, session.name, " \xB7 ", session.symbol), /* @__PURE__ */ import_react7.default.createElement("span", null, session.sessionDate, " ", last.time, " \u5317\u4EAC\u65F6\u95F4 \xB7 ", price2.format(last.price), " ", session.currency)), /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxs-muted" }, previous == null ? t("intraday.no-previous") : t("intraday.change", { change: percent }), ` \xB7 ${t("intraday.previous")}: ${previous == null ? "\u2014" : price2.format(previous)}`, ` \xB7 ${t("intraday.average")}: ${last.average == null ? "\u2014" : price2.format(last.average)}`, ` \xB7 ${t("intraday.volume")}: ${last.volume == null ? "\u2014" : quantity.format(last.volume)}`, ` \xB7 ${t(session.closed ? "intraday.closed" : "intraday.open")}`), /* @__PURE__ */ import_react7.default.createElement(IntradayChart, { session, t }));
}
function StockWorkbench({ symbol, scope, t, format, locale, rpc }) {
  const [local, setLocal] = (0, import_react7.useState)(null), [error, setError] = (0, import_react7.useState)(""), [busy, setBusy] = (0, import_react7.useState)(false);
  const [mode, setMode] = (0, import_react7.useState)("market");
  const [saveError, setSaveError] = (0, import_react7.useState)(false);
  const [adjustment, setAdjustment] = (0, import_react7.useState)(() => {
    try {
      return normalizeAdjustment(JSON.parse(readSettings(historySettingsKey(scope), previousIdKey("history", scope)))?.adjustment);
    } catch {
      return "forward";
    }
  });
  const [view, setView] = (0, import_react7.useState)(() => {
    try {
      return normalizeView(JSON.parse(readSettings(historySettingsKey(scope), previousIdKey("history", scope)))?.interval);
    } catch {
      return "1d";
    }
  });
  const interval = view === "intraday" ? "1d" : view;
  const generation = (0, import_react7.useRef)(0);
  const [config, setConfig] = (0, import_react7.useState)(() => {
    try {
      return normalizeChartConfig(JSON.parse(readSettings(chartSettingsKey(scope), previousIdKey("chart", scope))));
    } catch {
      return normalizeChartConfig();
    }
  });
  (0, import_react7.useEffect)(() => () => {
    generation.current++;
  }, []);
  const changeConfig = (next) => {
    const valid2 = normalizeChartConfig(next);
    setConfig(valid2);
    try {
      if (!globalThis.localStorage) throw new Error();
      globalThis.localStorage.setItem(chartSettingsKey(scope), JSON.stringify(valid2));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  };
  const changeAdjustment = (next) => {
    setAdjustment(next);
    try {
      if (!globalThis.localStorage) throw new Error();
      globalThis.localStorage.setItem(historySettingsKey(scope), JSON.stringify({ version: 1, adjustment: next, interval: view }));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  };
  const changeInterval = (next) => {
    setView(next);
    try {
      if (!globalThis.localStorage) throw new Error();
      globalThis.localStorage.setItem(historySettingsKey(scope), JSON.stringify({ version: 1, adjustment, interval: next }));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  };
  const showIntraday = view === "intraday" && mode === "market";
  const history = useMarketHistory(rpc, showIntraday ? null : symbol ?? null, adjustment, MARKET_HISTORY_MAX_LIMIT);
  const intraday = useMarketIntraday(rpc, showIntraday ? symbol ?? null : null);
  const benchmarkSymbol = mode === "market" && view !== "intraday" && symbol ? symbol === "SH.000300" ? "SH.000001" : "SH.000300" : null;
  const benchmarkHistory = useMarketHistory(rpc, benchmarkSymbol, "none", MARKET_HISTORY_MAX_LIMIT);
  const marketDataset = (() => {
    if (history.status !== "ready" || !history.value) return null;
    try {
      return toChartDataset(history.value);
    } catch {
      return null;
    }
  })();
  const benchmarkDataset = (() => {
    if (benchmarkHistory.status !== "ready" || !benchmarkHistory.value) return null;
    try {
      return toChartDataset(benchmarkHistory.value);
    } catch {
      return null;
    }
  })();
  const clear = () => {
    generation.current++;
    setBusy(false);
    setError("");
    setLocal(null);
  };
  const showDemo = () => {
    clear();
    setMode("demo");
  };
  const showMarket = () => {
    clear();
    setMode("market");
  };
  const read = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const request = ++generation.current;
    setBusy(true);
    setError("");
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error();
      const value = parseChartImport(await file.text());
      if (request !== generation.current) return;
      if (symbol && value.symbol !== symbol) {
        setError("workbench.mismatch");
        return;
      }
      computeIndicators(value.bars, { macd: config.macd });
      setLocal(value);
      setMode("local");
    } catch {
      if (request === generation.current) setError("workbench.error");
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  const example = () => {
    const url = URL.createObjectURL(new Blob([createImportExample()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "dsh-stock-daily-example.synthetic.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  };
  const demoDataset = (0, import_react7.useMemo)(() => mode === "demo" ? createDemoDataset() : null, [mode]);
  const sourceDataset = mode === "local" ? local : mode === "demo" ? demoDataset : marketDataset;
  const dataset = (0, import_react7.useMemo)(() => {
    if (!sourceDataset) return null;
    try {
      return resampleDataset(sourceDataset, interval);
    } catch {
      return null;
    }
  }, [sourceDataset, interval]);
  const last = dataset?.bars.at(-1);
  const notice = dataset?.kind === "market" ? "workbench.market-notice" : dataset?.kind === "demo" ? "workbench.demo-notice" : "workbench.local-notice";
  return /* @__PURE__ */ import_react7.default.createElement("section", { className: "dxs-workbench", "aria-label": t("workbench.title") }, /* @__PURE__ */ import_react7.default.createElement("header", null, /* @__PURE__ */ import_react7.default.createElement("h2", null, t("workbench.title")), /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxs-muted" }, t("workbench.daily"))), /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxs-data-actions" }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxs-view-tabs", role: "group", "aria-label": t("workbench.interval.aria") }, VIEWS.map((value) => /* @__PURE__ */ import_react7.default.createElement("button", { key: value, type: "button", "aria-pressed": view === value, onClick: () => changeInterval(value) }, t(`chart.interval.${value}`)))), /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxs-view-tabs", role: "group", "aria-label": t("workbench.source.aria") }, /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", "aria-pressed": mode === "market", onClick: showMarket }, t("workbench.source.market")), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", "aria-pressed": mode === "demo", onClick: showDemo }, t("workbench.source.demo")), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", "aria-pressed": mode === "local", onClick: () => setMode("local"), disabled: !local }, t("workbench.source.local"))), mode === "market" && view !== "intraday" ? /* @__PURE__ */ import_react7.default.createElement("label", { className: "dxs-adjustment" }, t("workbench.adjustment"), /* @__PURE__ */ import_react7.default.createElement("select", { value: adjustment, onChange: (event) => changeAdjustment(normalizeAdjustment(event.target.value)) }, ADJUSTMENTS.map((value) => /* @__PURE__ */ import_react7.default.createElement("option", { key: value, value }, t(`workbench.adjustment.${value}`))))) : null, mode === "market" ? /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", onClick: view === "intraday" ? intraday.refresh : history.refresh, disabled: view === "intraday" ? intraday.refreshing : history.refreshing }, (view === "intraday" ? intraday.refreshing : history.refreshing) ? t("workbench.refreshing") : t("workbench.refresh")) : null, /* @__PURE__ */ import_react7.default.createElement("label", { className: "dxs-file-label" }, t("workbench.import"), /* @__PURE__ */ import_react7.default.createElement("input", { type: "file", accept: ".json,application/json", onChange: read })), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", onClick: example }, t("workbench.example")), mode !== "market" && dataset ? /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", onClick: () => {
    clear();
    setMode("market");
  } }, t("workbench.clear")) : null), mode === "market" ? /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxs-muted" }, t("workbench.market-hint")) : null, mode !== "market" ? /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxs-muted" }, t("workbench.private")) : null, /* @__PURE__ */ import_react7.default.createElement("details", null, /* @__PURE__ */ import_react7.default.createElement("summary", null, t("workbench.format")), /* @__PURE__ */ import_react7.default.createElement("p", null, t("workbench.format-help"))), busy && /* @__PURE__ */ import_react7.default.createElement("p", { role: "status" }, t("workbench.loading")), error && /* @__PURE__ */ import_react7.default.createElement("p", { role: "alert", className: "dxs-error" }, t(error)), saveError && /* @__PURE__ */ import_react7.default.createElement("p", { role: "status" }, t("workbench.save-error")), view === "intraday" && mode !== "market" ? /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxs-chart-empty" }, /* @__PURE__ */ import_react7.default.createElement("h3", null, t("intraday.unavailable-title")), /* @__PURE__ */ import_react7.default.createElement("p", null, t("intraday.only-market"))) : null, showIntraday && (intraday.status === "loading" || intraday.status === "ready" && intraday.refreshing) && !intraday.value ? /* @__PURE__ */ import_react7.default.createElement("p", { role: "status", className: "dxs-muted" }, t("intraday.loading")) : null, showIntraday && !intraday.value && intraday.status === "unconfigured" ? /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxs-chart-empty" }, /* @__PURE__ */ import_react7.default.createElement("h3", null, t("intraday.off-title")), /* @__PURE__ */ import_react7.default.createElement("p", null, t("intraday.off"))) : null, showIntraday && !intraday.value && intraday.status === "unavailable" ? /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxs-chart-empty" }, /* @__PURE__ */ import_react7.default.createElement("h3", null, t("intraday.unavailable-title")), /* @__PURE__ */ import_react7.default.createElement("p", null, t("intraday.unavailable"))) : null, showIntraday && !intraday.value && intraday.status === "error" ? /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxs-chart-empty", role: "alert" }, /* @__PURE__ */ import_react7.default.createElement("h3", null, t("intraday.error-title")), /* @__PURE__ */ import_react7.default.createElement("p", null, t("intraday.error")), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", onClick: intraday.refresh }, t("workbench.retry"))) : null, showIntraday && intraday.value ? /* @__PURE__ */ import_react7.default.createElement(IntradayPanel, { session: intraday.value, t, locale }) : null, mode === "market" && view !== "intraday" && (history.status === "loading" || history.status === "ready" && history.refreshing) && !dataset ? /* @__PURE__ */ import_react7.default.createElement("p", { role: "status", className: "dxs-muted" }, t("workbench.market-loading")) : null, mode === "market" && view !== "intraday" && !dataset && history.status === "unconfigured" ? /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxs-chart-empty" }, /* @__PURE__ */ import_react7.default.createElement("h3", null, t("workbench.market-off-title")), /* @__PURE__ */ import_react7.default.createElement("p", null, t("workbench.market-off"))) : null, mode === "market" && view !== "intraday" && !dataset && history.status === "unavailable" ? /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxs-chart-empty" }, /* @__PURE__ */ import_react7.default.createElement("h3", null, t("workbench.market-unavailable-title")), /* @__PURE__ */ import_react7.default.createElement("p", null, t("workbench.market-unavailable"))) : null, mode === "market" && view !== "intraday" && !dataset && history.status === "error" ? /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxs-chart-empty", role: "alert" }, /* @__PURE__ */ import_react7.default.createElement("h3", null, t("workbench.market-error-title")), /* @__PURE__ */ import_react7.default.createElement("p", null, t("workbench.market-error")), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", onClick: history.refresh }, t("workbench.retry"))) : null, mode === "local" && !local ? /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxs-chart-empty" }, /* @__PURE__ */ import_react7.default.createElement("h3", null, t("workbench.empty")), /* @__PURE__ */ import_react7.default.createElement("p", null, t("workbench.hint")), /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxs-muted" }, t("workbench.no-realtime"))) : null, dataset && view !== "intraday" ? /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement("div", { className: `dxs-data-banner ${dataset.kind === "market" ? "is-market" : ""}`, role: "status" }, t(notice)), /* @__PURE__ */ import_react7.default.createElement("div", { className: "dxs-dataset-heading" }, /* @__PURE__ */ import_react7.default.createElement("strong", null, dataset.name || dataset.symbol, " \xB7 ", dataset.symbol), /* @__PURE__ */ import_react7.default.createElement("span", null, t(dataset.bars.at(-1)?.isFinal ? "workbench.historical-close" : "workbench.provisional-close"), ": ", new Intl.NumberFormat(formatLocale(locale), { minimumFractionDigits: dataset.pricePrecision, maximumFractionDigits: dataset.pricePrecision }).format(last.close), " ", dataset.currency, " \xB7 ", last.sessionDate)), /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxs-muted" }, t("workbench.source"), ": ", dataset.source.label, " \xB7 ", t("workbench.adjustment"), ": ", t(`workbench.adjustment.${dataset.adjustment}`), dataset.kind === "market" ? ` \xB7 ${t("workbench.bars", { count: format?.count ? format.count(dataset.bars.length) : dataset.bars.length, from: dataset.bars[0].sessionDate, to: last.sessionDate })}` : "", dataset.kind === "market" ? ` \xB7 ${t(`workbench.volume.${dataset.volumeBasis}`)}` : ""), /* @__PURE__ */ import_react7.default.createElement(StockChart, { dataset, t, format, locale, config, onConfigChange: changeConfig }), /* @__PURE__ */ import_react7.default.createElement(QuantReplay, { dataset, macd: config.macd, t, locale }), sourceDataset ? /* @__PURE__ */ import_react7.default.createElement(QuantPanel, { dataset: sourceDataset, benchmark: benchmarkDataset, t, format }) : null) : null, /* @__PURE__ */ import_react7.default.createElement("p", { className: "dxs-attribution" }, /* @__PURE__ */ import_react7.default.createElement("a", { href: "https://www.tradingview.com/", target: "_blank", rel: "noreferrer" }, "TradingView"), " \xB7 ", t("workbench.attribution")));
}

// src/client/market/MarketView.tsx
var import_react10 = __toESM(require("react"), 1);

// src/client/market/treemap.ts
var area = (value) => Number.isFinite(value) && value > 0 ? value : 0;
function worst(row, side, scale) {
  let sum = 0, max = 0, min = Infinity;
  for (const item of row) {
    const value = item.value * scale;
    sum += value;
    if (value > max) max = value;
    if (value < min) min = value;
  }
  if (!sum || !min) return Infinity;
  return Math.max(side * side * max / (sum * sum), sum * sum / (side * side * min));
}
function layoutRow(row, node, scale, output) {
  const total = row.reduce((sum, item) => sum + item.value * scale, 0);
  if (total <= 0) return node;
  if (node.width >= node.height) {
    const width = Math.min(node.width, total / node.height);
    let top = node.y;
    for (const item of row) {
      const height2 = width > 0 ? item.value * scale / width : 0;
      output.push({ key: item.key, x: node.x, y: top, width, height: height2 });
      top += height2;
    }
    return { x: node.x + width, y: node.y, width: Math.max(0, node.width - width), height: node.height };
  }
  const height = Math.min(node.height, total / node.width);
  let left = node.x;
  for (const item of row) {
    const width = height > 0 ? item.value * scale / height : 0;
    output.push({ key: item.key, x: left, y: node.y, width, height });
    left += width;
  }
  return { x: node.x, y: node.y + height, width: node.width, height: Math.max(0, node.height - height) };
}
function squarify(items, x2, y2, width, height) {
  if (!(width > 0) || !(height > 0)) return [];
  const values = items.filter((item) => area(item.value) > 0).map((item) => ({ ...item, value: area(item.value) })).sort((left, right) => right.value - left.value);
  const total = values.reduce((sum, item) => sum + item.value, 0);
  if (!total) return [];
  const scale = width * height / total;
  const output = [];
  let node = { x: x2, y: y2, width, height };
  let row = [];
  let index = 0;
  while (index < values.length) {
    const item = values[index];
    const side = Math.min(node.width, node.height);
    if (!row.length || worst(row, side, scale) >= worst([...row, item], side, scale)) {
      row.push(item);
      index++;
    } else {
      node = layoutRow(row, node, scale, output);
      row = [];
    }
  }
  if (row.length) layoutRow(row, node, scale, output);
  return output;
}
function layoutNested(groups, width, height, header = 18) {
  const normalized = groups.map((group) => ({
    ...group,
    value: area(group.value) || group.children.reduce((sum, child) => sum + area(child.value), 0) || 1
  })).filter((group) => group.value > 0);
  const rects = squarify(normalized.map((group) => ({ key: group.key, value: group.value })), 0, 0, width, height);
  const byKey = new Map(normalized.map((group) => [group.key, group]));
  return rects.map((rect) => {
    const group = byKey.get(rect.key);
    const showHeader = rect.width >= 54 && rect.height >= 30;
    const headerHeight = showHeader ? Math.min(header, rect.height * 0.28) : 0;
    const children = group.children.filter((child) => area(child.value) > 0);
    const inner = children.length && rect.height - headerHeight > 4 ? squarify(children, rect.x, rect.y + headerHeight, rect.width, rect.height - headerHeight) : [];
    return { ...rect, headerHeight, children: inner };
  });
}
function changeTone(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 5e-3) return "flat";
  const magnitude = Math.abs(value);
  const level = magnitude < 0.2 ? 1 : magnitude < 0.7 ? 2 : magnitude < 1.5 ? 3 : magnitude < 3 ? 4 : 5;
  return `${value > 0 ? "up" : "down"}-${level}`;
}
function tileSize(rect) {
  const pixels = rect.width * rect.height;
  if (pixels >= 9e3) return "xl";
  if (pixels >= 3e3) return "lg";
  if (pixels >= 900) return "md";
  if (pixels >= 240) return "sm";
  return "xs";
}

// src/client/market/data.ts
var import_react8 = require("react");
var INITIAL3 = { status: "loading", value: null, error: "", refreshing: false };
function useMarketResource(rpc, kind, board, options = {}) {
  const { pollMs = 6e4, enabled = true } = options;
  const [tick, setTick] = (0, import_react8.useState)(0);
  const [state, setState] = (0, import_react8.useState)(INITIAL3);
  const alive = (0, import_react8.useRef)(true);
  (0, import_react8.useEffect)(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  (0, import_react8.useEffect)(() => {
    if (!enabled) return;
    let disposed = false;
    let timer;
    let controller;
    let delay = pollMs;
    const schedule = () => {
      if (disposed || delay <= 0) return;
      timer = setTimeout(run, delay);
    };
    async function run() {
      if (disposed) return;
      if (typeof document !== "undefined" && document.hidden) {
        schedule();
        return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        schedule();
        return;
      }
      clearTimeout(timer);
      delay = pollMs;
      controller?.abort();
      const local = new AbortController();
      controller = local;
      setState((previous) => previous.value ? { ...previous, refreshing: true, error: "" } : { ...previous, status: "loading", refreshing: false });
      try {
        if (!rpc?.call) throw new Error("finance/connection");
        const request = kind === "board" ? { kind, board } : { kind };
        const result = await rpc.call("/api", MARKET_ENDPOINT, request, local.signal);
        if (disposed || local.signal.aborted) return;
        if (!result?.ok) {
          setState((previous) => ({
            ...previous,
            status: previous.value ? "ready" : "error",
            error: typeof result?.error?.code === "string" ? result.error.code : "finance/market-unavailable",
            refreshing: false
          }));
          return;
        }
        const payload = result.value;
        if (payload?.status === "unconfigured") {
          delay = 0;
          setState({ status: "unconfigured", value: null, error: "", refreshing: false });
          return;
        }
        const value = kind === "overview" ? payload?.overview : kind === "breadth" ? payload?.breadth : kind === "global" ? payload?.global : payload?.board;
        if (!value) throw new Error("finance/invalid");
        setState({ status: "ready", value, error: "", refreshing: false });
      } catch {
        if (disposed || local.signal.aborted) return;
        setState((previous) => ({
          ...previous,
          status: previous.value ? "ready" : "error",
          error: "finance/market-unavailable",
          refreshing: false
        }));
      } finally {
        if (!disposed) schedule();
      }
    }
    const resume = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      clearTimeout(timer);
      void run();
    };
    void run();
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", resume);
    globalThis.addEventListener?.("online", resume);
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", resume);
      globalThis.removeEventListener?.("online", resume);
    };
  }, [rpc, kind, board, enabled, pollMs, tick]);
  const refresh = () => {
    if (alive.current) setTick((value) => value + 1);
  };
  return { ...state, refresh };
}
function useMarketOverview(rpc, options = {}) {
  return useMarketResource(rpc, "overview", void 0, { pollMs: 6e4, ...options });
}
function useGlobalMarket(rpc, options = {}) {
  return useMarketResource(rpc, "global", void 0, { pollMs: 6e4, ...options });
}
function useMarketBreadth(rpc, options = {}) {
  return useMarketResource(rpc, "breadth", void 0, { pollMs: 3e5, ...options });
}
function useBoardDetail(rpc, code, options = {}) {
  return useMarketResource(rpc, "board", code, { pollMs: 12e4, ...options });
}
function useMarketPreference(rpc) {
  const [state, setState] = (0, import_react8.useState)({ status: "loading", enabled: false, forced: false, busy: false, error: "" });
  (0, import_react8.useEffect)(() => {
    let disposed = false;
    const controller = new AbortController();
    const read = async () => {
      try {
        const result = await rpc?.call("/api", MARKET_PREFERENCE_ENDPOINT, { action: "get" }, controller.signal);
        if (disposed || controller.signal.aborted) return;
        if (!result?.ok) throw new Error();
        setState({ status: "ready", enabled: result.value?.enabled === true, forced: result.value?.forced === true, busy: false, error: "" });
      } catch {
        if (disposed || controller.signal.aborted) return;
        setState({ status: "error", enabled: false, forced: false, busy: false, error: "finance/market-preference" });
      }
    };
    void read();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [rpc]);
  const setEnabled = async (enabled) => {
    setState((previous) => ({ ...previous, busy: true, error: "" }));
    try {
      const result = await rpc?.call("/api", MARKET_PREFERENCE_ENDPOINT, { action: "set", enabled });
      if (!result?.ok) throw new Error();
      const value = result.value;
      const next = { status: "ready", enabled: value?.enabled === true, forced: value?.forced === true, busy: false, error: "" };
      setState(next);
      return next;
    } catch {
      setState((previous) => ({ ...previous, busy: false, error: "finance/market-preference" }));
      throw new Error("market-preference");
    }
  };
  return { ...state, setEnabled };
}

// src/client/market/gate.tsx
var import_react9 = __toESM(require("react"), 1);
function SourceSwitch({ preference, onChange, t, large = false }) {
  const ready = preference.status === "ready";
  const disabled = !ready || preference.busy || preference.forced;
  const title = preference.status === "error" ? t("market.source.unavailable") : preference.forced ? t("market.source.forced") : t("market.source.switch-aria");
  return /* @__PURE__ */ import_react9.default.createElement("label", { className: `dxs-mkt-source-switch ${large ? "is-large" : ""}`, title }, /* @__PURE__ */ import_react9.default.createElement("input", { type: "checkbox", role: "switch", checked: preference.enabled, disabled, onChange: (event) => onChange(event.target.checked), "aria-label": t("market.source.switch-aria") }), /* @__PURE__ */ import_react9.default.createElement("span", { className: "dxs-mkt-switch-track", "aria-hidden": "true" }, /* @__PURE__ */ import_react9.default.createElement("span", null)), /* @__PURE__ */ import_react9.default.createElement("span", { className: "dxs-mkt-switch-label" }, t("market.source.switch")));
}
function MarketUnconfigured({ t, preference, onChange, onRetry, title, body }) {
  return /* @__PURE__ */ import_react9.default.createElement("section", { className: "dxs-mkt-card dxs-mkt-setup" }, /* @__PURE__ */ import_react9.default.createElement("h3", null, title ?? t("market.unconfigured-title")), /* @__PURE__ */ import_react9.default.createElement("p", null, body ?? t("market.unconfigured-body")), /* @__PURE__ */ import_react9.default.createElement("div", { className: "dxs-mkt-setup-switch" }, /* @__PURE__ */ import_react9.default.createElement(SourceSwitch, { preference, onChange, t, large: true }), /* @__PURE__ */ import_react9.default.createElement("span", null, preference.enabled ? t("market.source.enabled") : t("market.source.disabled"))), /* @__PURE__ */ import_react9.default.createElement("p", { className: "dxs-mkt-muted" }, t("market.source.persist")), preference.status === "error" ? /* @__PURE__ */ import_react9.default.createElement("p", { role: "alert", className: "dxs-mkt-error" }, t("market.source.unavailable")) : null, preference.error && preference.status === "ready" ? /* @__PURE__ */ import_react9.default.createElement("p", { role: "alert", className: "dxs-mkt-error" }, t("market.source.preference-error")) : null, /* @__PURE__ */ import_react9.default.createElement("details", { className: "dxs-mkt-manual-config" }, /* @__PURE__ */ import_react9.default.createElement("summary", null, t("market.unconfigured-manual")), /* @__PURE__ */ import_react9.default.createElement("p", { className: "dxs-mkt-muted" }, t("market.unconfigured-config")), /* @__PURE__ */ import_react9.default.createElement("pre", null, `- id: dsh-x-finance
  name: dsh-x-finance
  config:
    marketSource: true`)), /* @__PURE__ */ import_react9.default.createElement("button", { type: "button", onClick: onRetry }, t("market.unconfigured-retry")));
}
function MarketErrorCard({ t, onRetry, preference, onChange, title }) {
  return /* @__PURE__ */ import_react9.default.createElement("section", { className: "dxs-mkt-card dxs-mkt-setup", role: "alert" }, /* @__PURE__ */ import_react9.default.createElement("h3", null, title ?? t("market.error")), /* @__PURE__ */ import_react9.default.createElement("p", null, t("market.error-hint")), /* @__PURE__ */ import_react9.default.createElement("div", { className: "dxs-mkt-setup-switch" }, /* @__PURE__ */ import_react9.default.createElement(SourceSwitch, { preference, onChange, t, large: true }), /* @__PURE__ */ import_react9.default.createElement("span", null, preference.enabled ? t("market.source.enabled") : t("market.source.disabled"))), /* @__PURE__ */ import_react9.default.createElement("button", { type: "button", onClick: onRetry }, t("market.retry")));
}

// src/client/market/MarketView.tsx
var GEO_WIDTH = 1e3;
var GEO_HEIGHT = 420;
var STOCK_HEIGHT = 280;
function useElementSize(fallbackWidth, fallbackHeight) {
  const ref = (0, import_react10.useRef)(null);
  const [size2, setSize] = (0, import_react10.useState)({ width: fallbackWidth, height: fallbackHeight });
  (0, import_react10.useEffect)(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, size: size2 };
}
function position(rect, width, height) {
  return {
    left: `${rect.x / width * 100}%`,
    top: `${rect.y / height * 100}%`,
    width: `${rect.width / width * 100}%`,
    height: `${rect.height / height * 100}%`
  };
}
var changeClass = (value) => changeTone(value);
var TILE_COLORS = {
  flat: "#5b636b",
  "up-1": "#6e3941",
  "up-2": "#843a45",
  "up-3": "#9c3b48",
  "up-4": "#b63a49",
  "up-5": "#cf3445",
  "down-1": "#2c5a4a",
  "down-2": "#296b55",
  "down-3": "#247c60",
  "down-4": "#1d8b69",
  "down-5": "#159b73"
};
var tileColor = (value) => TILE_COLORS[changeClass(value)];
var textTone = (value) => typeof value === "number" && value > 0 ? "dxs-up" : typeof value === "number" && value < 0 ? "dxs-down" : "";
function Kpi({ label, value, note, tone: tone3, children }) {
  return /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-kpi" }, /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-kpi-label" }, label), /* @__PURE__ */ import_react10.default.createElement("div", { className: `dxs-mkt-kpi-value ${tone3 ?? ""}` }, value), note ? /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-kpi-note" }, note) : null, children);
}
function statusKey(clock) {
  if (!clock) return "market.status.no-quote";
  if (clock.phase === "weekend") return "market.status.weekend";
  if (clock.phase === "preopen") return "market.status.preopen";
  if (!clock.quoteToday) return "market.status.no-quote";
  return `market.status.${clock.phase}`;
}
function MarketStatus({ quotedAt, now, t, format, showTime = true }) {
  const clock = marketClock(now(), quotedAt);
  const live = clock.quoteToday && clock.phase === "open" && !clock.stale;
  return /* @__PURE__ */ import_react10.default.createElement("div", { className: `dxs-mkt-status ${live ? "is-live" : "is-closed"}`, title: t("market.status.hint") }, /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-mkt-dot", "aria-hidden": "true" }), /* @__PURE__ */ import_react10.default.createElement("strong", null, t(statusKey(clock))), showTime && quotedAt ? /* @__PURE__ */ import_react10.default.createElement("span", null, t("market.quote-time", { time: format.time(quotedAt, t) })) : null, clock.quoteToday && clock.stale && (clock.phase === "open" || clock.phase === "auction") ? /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-mkt-warn" }, t("market.stale")) : null);
}
function SentimentPanel({ data, breadth, t, format }) {
  const sentiment = (0, import_react10.useMemo)(() => data ? computeSentiment({
    indexChanges: data.indices.filter((index) => !index.code.startsWith("HK.")).map((index) => index.changePercent),
    breadth: breadth ? { up: breadth.up, down: breadth.down, flat: breadth.flat } : null,
    sectorChanges: data.sectors.filter((sector) => sector.level === 1).map((sector) => sector.changePercent)
  }) : null, [data, breadth]);
  if (!sentiment) return /* @__PURE__ */ import_react10.default.createElement("section", { className: "dxs-mkt-card" }, /* @__PURE__ */ import_react10.default.createElement("h3", null, t("market.sentiment.title")), /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-muted" }, t("market.breadth.empty")));
  return /* @__PURE__ */ import_react10.default.createElement("section", { className: "dxs-mkt-card dxs-mkt-sentiment" }, /* @__PURE__ */ import_react10.default.createElement("header", { className: "dxs-mkt-card-head" }, /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("h3", null, t("market.sentiment.title")), /* @__PURE__ */ import_react10.default.createElement("p", null, t("market.sentiment.subtitle"))), /* @__PURE__ */ import_react10.default.createElement("div", { className: `dxs-mkt-sentiment-score ${sentiment.score >= 56 ? "dxs-up" : sentiment.score <= 44 ? "dxs-down" : ""}` }, /* @__PURE__ */ import_react10.default.createElement("strong", null, format.count(sentiment.score)), /* @__PURE__ */ import_react10.default.createElement("span", null, t(`market.sentiment.label.${sentiment.label}`)))), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-gauge", role: "img", "aria-label": `${format.count(sentiment.score)} \xB7 ${t(`market.sentiment.label.${sentiment.label}`)}` }, /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-gauge-track" }, /* @__PURE__ */ import_react10.default.createElement("span", { style: { left: `${Math.max(0, Math.min(100, sentiment.score))}%` } })), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-gauge-labels" }, /* @__PURE__ */ import_react10.default.createElement("span", null, t("market.sentiment.fear")), /* @__PURE__ */ import_react10.default.createElement("span", null, t("market.sentiment.label.neutral")), /* @__PURE__ */ import_react10.default.createElement("span", null, t("market.sentiment.greed")))), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-factors" }, sentiment.factors.map((factor) => /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-factor", key: factor.key }, /* @__PURE__ */ import_react10.default.createElement("span", null, t(`market.sentiment.factor.${factor.key}`)), /* @__PURE__ */ import_react10.default.createElement("strong", null, format.count(factor.score)), /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-mkt-factor-weight" }, format.count(Math.round(factor.weight * 100)), "%"), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-factor-bar", "aria-hidden": "true" }, /* @__PURE__ */ import_react10.default.createElement("i", { className: factor.score >= 50 ? "is-up" : "is-down", style: { width: `${factor.score}%` } }))))), /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-muted" }, t("market.sentiment.weights")), /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-muted" }, t("market.sentiment.method")), sentiment.partial ? /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-note" }, t("market.sentiment.waiting")) : null);
}
function IndexCard({ index, t, format, onOpen }) {
  const high = Number.isFinite(index.high) ? index.high : null;
  const low = Number.isFinite(index.low) ? index.low : null;
  const marker = high !== null && low !== null && high > low ? Math.max(0, Math.min(100, (index.price - low) / (high - low) * 100)) : null;
  const tone3 = textTone(index.changePercent);
  const open = typeof onOpen === "function" ? () => onOpen(index.code, index.name) : void 0;
  return /* @__PURE__ */ import_react10.default.createElement(
    "article",
    {
      className: `dxs-mkt-index ${open ? "is-clickable" : ""}`,
      role: open ? "button" : void 0,
      tabIndex: open ? 0 : void 0,
      "aria-label": open ? t("market.drill.index-title", { name: index.name }) : void 0,
      onClick: open,
      onKeyDown: open ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      } : void 0
    },
    /* @__PURE__ */ import_react10.default.createElement("header", null, /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("h4", null, index.name), /* @__PURE__ */ import_react10.default.createElement("span", null, index.code)), /* @__PURE__ */ import_react10.default.createElement("span", { className: `dxs-mkt-change ${tone3}` }, format.change(index.changePercent))),
    /* @__PURE__ */ import_react10.default.createElement("div", { className: `dxs-mkt-index-price ${tone3}` }, format.price(index.price)),
    /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-index-sub" }, /* @__PURE__ */ import_react10.default.createElement("span", { className: tone3 }, format.signed(index.change)), /* @__PURE__ */ import_react10.default.createElement("span", null, index.amount !== null ? t("market.indices.amount", { amount: format.compact(index.amount) }) : "\u2014")),
    marker !== null ? /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-range", role: "img", "aria-label": t("market.indices.range") }, /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-range-track" }, /* @__PURE__ */ import_react10.default.createElement("span", { style: { left: `${marker}%` } })), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-range-labels" }, /* @__PURE__ */ import_react10.default.createElement("span", null, t("market.indices.low", { value: format.price(low) })), /* @__PURE__ */ import_react10.default.createElement("span", null, t("market.indices.high", { value: format.price(high) })))) : null,
    /* @__PURE__ */ import_react10.default.createElement("dl", { className: "dxs-mkt-ohlc" }, /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("dt", null, t("market.indices.open-label")), /* @__PURE__ */ import_react10.default.createElement("dd", null, format.price(index.open))), /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("dt", null, t("market.indices.previous-label")), /* @__PURE__ */ import_react10.default.createElement("dd", null, format.price(index.previousClose)))),
    /* @__PURE__ */ import_react10.default.createElement("footer", null, /* @__PURE__ */ import_react10.default.createElement("span", null, t("market.quote-time", { time: index.code.startsWith("HK.") ? format.zoneTime(index.quotedAt, "Asia/Hong_Kong", t) : format.time(index.quotedAt, t) })), open ? /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-mkt-index-open" }, t("market.drill.open-chart"), " \u2192") : null)
  );
}
function buildGroups(sectors, t) {
  const level1 = sectors.filter((sector) => sector.level === 1);
  const level2 = sectors.filter((sector) => sector.level === 2);
  const groups = /* @__PURE__ */ new Map();
  for (const sector of level1) {
    groups.set(sector.code, {
      key: sector.code,
      code: sector.code,
      name: sector.name,
      changePercent: sector.changePercent,
      value: sector.marketCap ?? sector.amount ?? 1,
      children: []
    });
  }
  const other = {
    key: "other",
    code: "",
    name: t("market.heatmap.other"),
    changePercent: 0,
    value: 0,
    children: []
  };
  for (const sector of level2) {
    const parent = sector.parent && groups.get(sector.parent) ? groups.get(sector.parent) : other;
    parent.children.push({
      key: sector.code,
      code: sector.code,
      name: sector.name,
      changePercent: sector.changePercent,
      value: sector.marketCap ?? sector.amount ?? 1,
      amount: sector.amount,
      marketCap: sector.marketCap,
      topStock: sector.topStock
    });
  }
  if (other.children.length) {
    other.value = other.children.reduce((sum, child) => sum + child.value, 0) || 1;
    other.changePercent = other.children.reduce((sum, child) => sum + child.changePercent, 0) / other.children.length;
    groups.set(other.key, other);
  }
  for (const group of groups.values()) {
    if (!group.children.length) group.value = group.value || 1;
    else if (group.value <= 1) {
      const childTotal = group.children.reduce((sum, child) => sum + child.value, 0);
      if (childTotal > 0) group.value = childTotal;
    }
  }
  return [...groups.values()];
}
function Heatmap({ data, selected, onSelect, t, format }) {
  const groups = (0, import_react10.useMemo)(() => buildGroups(data.sectors, t), [data.sectors, t]);
  const { ref, size: size2 } = useElementSize(GEO_WIDTH, GEO_HEIGHT);
  const layout = (0, import_react10.useMemo)(() => layoutNested(groups.map((group) => ({
    key: group.key,
    value: group.value,
    children: group.children.map((child) => ({ key: child.key, value: child.value }))
  })), size2.width, size2.height), [groups, size2]);
  const byGroup = new Map(groups.map((group) => [group.key, group]));
  const byChild = new Map(groups.flatMap((group) => group.children.map((child) => [child.key, child])));
  const level2Count = groups.reduce((sum, group) => sum + group.children.length, 0);
  return /* @__PURE__ */ import_react10.default.createElement("section", { className: "dxs-mkt-card dxs-mkt-heatmap" }, /* @__PURE__ */ import_react10.default.createElement("header", { className: "dxs-mkt-card-head" }, /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("h3", null, t("market.heatmap.title")), /* @__PURE__ */ import_react10.default.createElement("p", null, t("market.heatmap.subtitle", { level1: format.count(groups.filter((group) => group.code).length), level2: format.count(level2Count) }))), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-legend", "aria-label": t("market.heatmap.legend") }, /* @__PURE__ */ import_react10.default.createElement("span", null, t("market.heatmap.legend")), /* @__PURE__ */ import_react10.default.createElement("i", { style: { background: TILE_COLORS["down-5"] } }), /* @__PURE__ */ import_react10.default.createElement("i", { style: { background: TILE_COLORS["down-3"] } }), /* @__PURE__ */ import_react10.default.createElement("i", { style: { background: TILE_COLORS.flat } }), /* @__PURE__ */ import_react10.default.createElement("i", { style: { background: TILE_COLORS["up-3"] } }), /* @__PURE__ */ import_react10.default.createElement("i", { style: { background: TILE_COLORS["up-5"] } }))), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-map", ref, role: "group", "aria-label": t("market.heatmap.aria") }, layout.map((group) => {
    const model = byGroup.get(group.key);
    if (!model) return null;
    const selectedGroup = Boolean(selected && selected.code === model.code);
    return /* @__PURE__ */ import_react10.default.createElement(import_react10.default.Fragment, { key: group.key }, /* @__PURE__ */ import_react10.default.createElement("div", { className: `dxs-mkt-group-box ${selectedGroup ? "is-selected" : ""}`, style: position(group, size2.width, size2.height), "aria-hidden": "true" }), group.headerHeight > 0 ? /* @__PURE__ */ import_react10.default.createElement(
      "button",
      {
        type: "button",
        className: `dxs-mkt-group-label ${changeClass(model.changePercent)} ${selectedGroup ? "is-selected" : ""}`,
        style: { ...position({ ...group, height: group.headerHeight }, size2.width, size2.height), width: `${group.width / size2.width * 100}%`, background: tileColor(model.changePercent) },
        onClick: () => model.code && onSelect({ code: model.code, name: model.name }),
        disabled: !model.code,
        "aria-label": t("market.heatmap.group", { name: model.name, change: format.change(model.changePercent) }),
        title: t("market.heatmap.group", { name: model.name, change: format.change(model.changePercent) })
      },
      /* @__PURE__ */ import_react10.default.createElement("span", null, model.name),
      /* @__PURE__ */ import_react10.default.createElement("span", null, format.change(model.changePercent))
    ) : null, group.children.map((child) => {
      const item = byChild.get(child.key);
      if (!item) return null;
      const sizeClass = tileSize(child);
      const showName = child.width >= 38 && child.height >= 15;
      const showPct = child.width >= 48 && child.height >= 28;
      const active = Boolean(selected && selected.code === item.code);
      return /* @__PURE__ */ import_react10.default.createElement(
        "button",
        {
          type: "button",
          key: child.key,
          className: `dxs-mkt-tile ${changeClass(item.changePercent)} size-${sizeClass} ${active ? "is-selected" : ""}`,
          style: { ...position(child, size2.width, size2.height), background: tileColor(item.changePercent) },
          "aria-pressed": active,
          "aria-label": t("market.heatmap.tile", { name: item.name, change: format.change(item.changePercent), amount: item.amount !== null ? format.compact(item.amount) : "\u2014" }),
          title: t("market.heatmap.tile", { name: item.name, change: format.change(item.changePercent), amount: item.amount !== null ? format.compact(item.amount) : "\u2014" }),
          onClick: () => onSelect({ code: item.code, name: item.name })
        },
        showName ? /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-mkt-tile-name" }, item.name) : null,
        showPct ? /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-mkt-tile-pct" }, format.change(item.changePercent)) : null,
        sizeClass === "xl" && item.topStock ? /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-mkt-tile-leader" }, item.topStock.name, " ", format.change(item.topStock.changePercent)) : null,
        sizeClass === "xl" && item.amount !== null ? /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-mkt-tile-amount" }, t("market.movers.turnover"), " ", format.compact(item.amount)) : null
      );
    }));
  })), /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-muted" }, t("market.heatmap.hint")), /* @__PURE__ */ import_react10.default.createElement("details", { className: "dxs-mkt-table-details" }, /* @__PURE__ */ import_react10.default.createElement("summary", null, t("market.heatmap.table")), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-table-wrap" }, /* @__PURE__ */ import_react10.default.createElement("table", null, /* @__PURE__ */ import_react10.default.createElement("caption", null, t("market.heatmap.table-caption")), /* @__PURE__ */ import_react10.default.createElement("thead", null, /* @__PURE__ */ import_react10.default.createElement("tr", null, /* @__PURE__ */ import_react10.default.createElement("th", null, t("market.heatmap.table.name")), /* @__PURE__ */ import_react10.default.createElement("th", null, t("market.heatmap.table.change")), /* @__PURE__ */ import_react10.default.createElement("th", null, t("market.heatmap.table.amount")), /* @__PURE__ */ import_react10.default.createElement("th", null, t("market.heatmap.table.cap")), /* @__PURE__ */ import_react10.default.createElement("th", null, t("market.heatmap.table.leader")))), /* @__PURE__ */ import_react10.default.createElement("tbody", null, groups.flatMap((group) => group.children.length ? group.children.map((child) => /* @__PURE__ */ import_react10.default.createElement("tr", { key: child.code }, /* @__PURE__ */ import_react10.default.createElement("td", null, child.name, /* @__PURE__ */ import_react10.default.createElement("small", null, group.name)), /* @__PURE__ */ import_react10.default.createElement("td", { className: textTone(child.changePercent) }, format.change(child.changePercent)), /* @__PURE__ */ import_react10.default.createElement("td", null, child.amount !== null ? format.compact(child.amount) : "\u2014"), /* @__PURE__ */ import_react10.default.createElement("td", null, child.marketCap !== null ? format.compact(child.marketCap) : "\u2014"), /* @__PURE__ */ import_react10.default.createElement("td", null, child.topStock ? `${child.topStock.name} ${format.change(child.topStock.changePercent)}` : "\u2014"))) : []))))));
}
function bucketLabel(bucket, t) {
  if (bucket.from === null && bucket.to !== null) return t("market.breadth.bucket.lt", { to: bucket.to });
  if (bucket.to === null && bucket.from !== null) return t("market.breadth.bucket.gt", { from: bucket.from });
  if (bucket.from === 0 && bucket.to === 0) return t("market.breadth.bucket.zero");
  return t("market.breadth.bucket", { from: bucket.from, to: bucket.to });
}
function DistributionBar({ breadth, t, format }) {
  const max = Math.max(1, ...breadth.distribution.map((bucket) => bucket.count));
  const total = Math.max(1, breadth.up + breadth.down + breadth.flat);
  const tone3 = (bucket) => bucket.from !== null && bucket.from < 0 ? "is-down" : bucket.from === 0 && bucket.to === 0 ? "is-flat" : "is-up";
  return /* @__PURE__ */ import_react10.default.createElement("section", { className: "dxs-mkt-card dxs-mkt-breadth" }, /* @__PURE__ */ import_react10.default.createElement("header", { className: "dxs-mkt-card-head" }, /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("h3", null, t("market.breadth.title")), /* @__PURE__ */ import_react10.default.createElement("p", null, t("market.breadth.subtitle", { covered: format.count(breadth.covered), expected: format.count(breadth.expected) }))), /* @__PURE__ */ import_react10.default.createElement("div", { className: `dxs-mkt-change ${breadth.up >= breadth.down ? "dxs-up" : "dxs-down"}` }, t("market.breadth.up-share", { value: format.percent(breadth.up / total * 100) }))), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-breadth-totals" }, /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("strong", { className: "dxs-up" }, format.count(breadth.up)), /* @__PURE__ */ import_react10.default.createElement("span", null, t("market.breadth.up"))), /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("strong", { className: "dxs-down" }, format.count(breadth.down)), /* @__PURE__ */ import_react10.default.createElement("span", null, t("market.breadth.down"))), /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("strong", null, format.count(breadth.flat)), /* @__PURE__ */ import_react10.default.createElement("span", null, t("market.breadth.flat"))), /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("strong", null, format.compact(breadth.amount)), /* @__PURE__ */ import_react10.default.createElement("span", null, t("market.kpi.amount")))), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-stack", role: "img", "aria-label": `${t("market.breadth.up")} ${breadth.up} \xB7 ${t("market.breadth.down")} ${breadth.down} \xB7 ${t("market.breadth.flat")} ${breadth.flat}` }, /* @__PURE__ */ import_react10.default.createElement("span", { className: "is-up", style: { width: `${breadth.up / total * 100}%` } }), /* @__PURE__ */ import_react10.default.createElement("span", { className: "is-flat", style: { width: `${breadth.flat / total * 100}%` } }), /* @__PURE__ */ import_react10.default.createElement("span", { className: "is-down", style: { width: `${breadth.down / total * 100}%` } })), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-distribution", "aria-hidden": "true" }, breadth.distribution.map((bucket) => /* @__PURE__ */ import_react10.default.createElement("div", { className: `dxs-mkt-bucket ${tone3(bucket)}`, key: `${bucket.from}-${bucket.to}` }, /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-mkt-bucket-count" }, bucket.count ? format.count(bucket.count) : ""), /* @__PURE__ */ import_react10.default.createElement("i", { style: { height: `${Math.max(2, bucket.count / max * 100)}%` } })))), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-muted dxs-mkt-bucket-labels", "aria-hidden": "true" }, breadth.distribution.map((bucket) => /* @__PURE__ */ import_react10.default.createElement("span", { key: `${bucket.from}-${bucket.to}` }, bucketLabel(bucket, t)))), /* @__PURE__ */ import_react10.default.createElement("details", { className: "dxs-mkt-table-details" }, /* @__PURE__ */ import_react10.default.createElement("summary", null, t("market.breadth.table")), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-table-wrap" }, /* @__PURE__ */ import_react10.default.createElement("table", null, /* @__PURE__ */ import_react10.default.createElement("caption", null, t("market.breadth.title")), /* @__PURE__ */ import_react10.default.createElement("thead", null, /* @__PURE__ */ import_react10.default.createElement("tr", null, /* @__PURE__ */ import_react10.default.createElement("th", null, t("market.breadth.range")), /* @__PURE__ */ import_react10.default.createElement("th", null, t("market.breadth.count")))), /* @__PURE__ */ import_react10.default.createElement("tbody", null, breadth.distribution.map((bucket) => /* @__PURE__ */ import_react10.default.createElement("tr", { key: `${bucket.from}-${bucket.to}` }, /* @__PURE__ */ import_react10.default.createElement("td", null, bucketLabel(bucket, t)), /* @__PURE__ */ import_react10.default.createElement("td", null, format.count(bucket.count)))))))), breadth.partial ? /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-note" }, t("market.partial", { covered: format.count(breadth.covered), expected: format.count(breadth.expected) })) : null, /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-muted" }, t("market.breadth.suspended", { count: format.count(breadth.suspended) })));
}
function StockTable({ stocks, t, format, caption, onOpen }) {
  if (!stocks.length) return /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-muted" }, t("market.movers.empty"));
  return /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-table-wrap" }, /* @__PURE__ */ import_react10.default.createElement("table", null, /* @__PURE__ */ import_react10.default.createElement("caption", null, caption), /* @__PURE__ */ import_react10.default.createElement("thead", null, /* @__PURE__ */ import_react10.default.createElement("tr", null, /* @__PURE__ */ import_react10.default.createElement("th", null, t("market.movers.name")), /* @__PURE__ */ import_react10.default.createElement("th", null, t("market.movers.price")), /* @__PURE__ */ import_react10.default.createElement("th", null, t("market.movers.change")), /* @__PURE__ */ import_react10.default.createElement("th", null, t("market.movers.turnover")))), /* @__PURE__ */ import_react10.default.createElement("tbody", null, stocks.map((stock) => /* @__PURE__ */ import_react10.default.createElement("tr", { key: stock.code, className: onOpen ? "is-drillable" : void 0 }, /* @__PURE__ */ import_react10.default.createElement("td", null, onOpen ? /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", className: "dxs-mkt-link", onClick: () => onOpen(stock.code, stock.name), title: t("market.drill.title", { name: stock.name }) }, /* @__PURE__ */ import_react10.default.createElement("span", null, stock.name), /* @__PURE__ */ import_react10.default.createElement("small", null, stock.code)) : /* @__PURE__ */ import_react10.default.createElement(import_react10.default.Fragment, null, /* @__PURE__ */ import_react10.default.createElement("span", null, stock.name), /* @__PURE__ */ import_react10.default.createElement("small", null, stock.code))), /* @__PURE__ */ import_react10.default.createElement("td", null, format.price(stock.price)), /* @__PURE__ */ import_react10.default.createElement("td", { className: textTone(stock.changePercent) }, format.change(stock.changePercent)), /* @__PURE__ */ import_react10.default.createElement("td", null, format.compact(stock.amount)))))));
}
function Movers({ breadth, t, format, onOpen }) {
  return /* @__PURE__ */ import_react10.default.createElement("section", { className: "dxs-mkt-movers-grid" }, /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-card" }, /* @__PURE__ */ import_react10.default.createElement("header", { className: "dxs-mkt-card-head" }, /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("h3", null, t("market.movers.title")), /* @__PURE__ */ import_react10.default.createElement("p", null, t("market.movers.subtitle")))), /* @__PURE__ */ import_react10.default.createElement(StockTable, { stocks: breadth.topGainers, t, format, caption: t("market.movers.title"), onOpen })), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-card" }, /* @__PURE__ */ import_react10.default.createElement("header", { className: "dxs-mkt-card-head" }, /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("h3", null, t("market.movers.losers")), /* @__PURE__ */ import_react10.default.createElement("p", null, t("market.movers.subtitle")))), /* @__PURE__ */ import_react10.default.createElement(StockTable, { stocks: breadth.topLosers, t, format, caption: t("market.movers.losers"), onOpen })), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-card" }, /* @__PURE__ */ import_react10.default.createElement("header", { className: "dxs-mkt-card-head" }, /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("h3", null, t("market.movers.amount")), /* @__PURE__ */ import_react10.default.createElement("p", null, t("market.movers.subtitle")))), /* @__PURE__ */ import_react10.default.createElement(StockTable, { stocks: breadth.topAmount, t, format, caption: t("market.movers.amount"), onOpen })));
}
function SectorDetail({ rpc, selection, onClose, t, format, onOpen }) {
  const detail = useBoardDetail(rpc, selection.code);
  const [active, setActive] = (0, import_react10.useState)(null);
  const { ref, size: size2 } = useElementSize(GEO_WIDTH, STOCK_HEIGHT);
  const board = detail.value;
  const tiles = (0, import_react10.useMemo)(() => {
    if (!board) return [];
    return squarify(board.stocks.map((stock) => ({ key: stock.code, value: stock.marketCap ?? stock.amount ?? 1 })), 0, 0, size2.width, size2.height);
  }, [board, size2]);
  const stocks = new Map((board?.stocks ?? []).map((stock) => [stock.code, stock]));
  return /* @__PURE__ */ import_react10.default.createElement("section", { className: "dxs-mkt-card dxs-mkt-detail", "aria-live": "polite" }, /* @__PURE__ */ import_react10.default.createElement("header", { className: "dxs-mkt-card-head" }, /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("h3", null, t("market.detail.title")), /* @__PURE__ */ import_react10.default.createElement("p", null, t("market.detail.subtitle", { name: board?.name ?? selection.name, code: selection.code }))), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", onClick: onClose }, t("market.detail.close"))), detail.status === "loading" && !board ? /* @__PURE__ */ import_react10.default.createElement("p", { role: "status", className: "dxs-mkt-muted" }, t("market.detail.loading")) : null, detail.status === "error" && !board ? /* @__PURE__ */ import_react10.default.createElement("p", { role: "alert", className: "dxs-mkt-error" }, t("market.detail.error"), " ", /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", onClick: detail.refresh }, t("market.detail.retry"))) : null, board ? /* @__PURE__ */ import_react10.default.createElement(import_react10.default.Fragment, null, detail.error ? /* @__PURE__ */ import_react10.default.createElement("p", { role: "status", className: "dxs-mkt-note" }, t("market.error"), " \xB7 ", t("market.error-hint")) : null, /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-detail-stats" }, t("market.detail.stats", { change: format.change(board.changePercent), amount: board.amount !== null ? format.compact(board.amount) : "\u2014", cap: board.marketCap !== null ? format.compact(board.marketCap) : "\u2014" })), /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-muted" }, t("market.detail.total", { count: format.count(board.total), shown: format.count(board.stocks.length) })), tiles.length ? /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-stock-map", ref, role: "group", "aria-label": t("market.detail.chart-aria", { name: board.name }) }, tiles.map((tile) => {
    const stock = stocks.get(tile.key);
    if (!stock) return null;
    const sizeClass = tileSize(tile);
    const showName = tile.width >= 38 && tile.height >= 15;
    const showPct = tile.width >= 48 && tile.height >= 28;
    return /* @__PURE__ */ import_react10.default.createElement(
      "button",
      {
        type: "button",
        key: tile.key,
        className: `dxs-mkt-tile ${changeClass(stock.changePercent)} size-${sizeClass} ${active === stock.code ? "is-selected" : ""}`,
        style: { ...position(tile, size2.width, size2.height), background: tileColor(stock.changePercent) },
        "aria-pressed": active === stock.code,
        "aria-label": t("market.heatmap.tile", { name: stock.name, change: format.change(stock.changePercent), amount: format.compact(stock.amount) }),
        title: `${stock.name} ${stock.code} ${format.price(stock.price)} ${format.change(stock.changePercent)}`,
        onClick: () => setActive(stock.code)
      },
      showName ? /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-mkt-tile-name" }, stock.name) : null,
      showPct ? /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-mkt-tile-pct" }, format.change(stock.changePercent)) : null
    );
  })) : /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-muted" }, t("market.detail.empty")), active && stocks.get(active) ? /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-selected-stock" }, stocks.get(active).name, " \xB7 ", active, " \xB7 ", format.price(stocks.get(active).price), " \xB7 ", /* @__PURE__ */ import_react10.default.createElement("span", { className: textTone(stocks.get(active).changePercent) }, format.change(stocks.get(active).changePercent)), onOpen ? /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", className: "dxs-mkt-open-stock", onClick: () => onOpen(stocks.get(active).code, stocks.get(active).name) }, t("market.drill.open")) : null) : null, /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-table-wrap dxs-mkt-detail-table" }, /* @__PURE__ */ import_react10.default.createElement("table", null, /* @__PURE__ */ import_react10.default.createElement("caption", null, t("market.detail.title")), /* @__PURE__ */ import_react10.default.createElement("thead", null, /* @__PURE__ */ import_react10.default.createElement("tr", null, /* @__PURE__ */ import_react10.default.createElement("th", null, t("market.detail.stock")), /* @__PURE__ */ import_react10.default.createElement("th", null, t("market.detail.price")), /* @__PURE__ */ import_react10.default.createElement("th", null, t("market.detail.change")), /* @__PURE__ */ import_react10.default.createElement("th", null, t("market.detail.amount")), /* @__PURE__ */ import_react10.default.createElement("th", null, t("market.detail.cap")), onOpen ? /* @__PURE__ */ import_react10.default.createElement("th", null, /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-sr-only" }, t("market.drill.column"))) : null)), /* @__PURE__ */ import_react10.default.createElement("tbody", null, board.stocks.map((stock) => /* @__PURE__ */ import_react10.default.createElement("tr", { key: stock.code, className: `${active === stock.code ? "is-selected" : ""} ${onOpen ? "is-drillable" : ""}`, tabIndex: 0, onClick: () => setActive(stock.code), onKeyDown: (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setActive(stock.code);
    }
  } }, /* @__PURE__ */ import_react10.default.createElement("td", null, /* @__PURE__ */ import_react10.default.createElement("span", null, stock.name), /* @__PURE__ */ import_react10.default.createElement("small", null, stock.code)), /* @__PURE__ */ import_react10.default.createElement("td", null, format.price(stock.price)), /* @__PURE__ */ import_react10.default.createElement("td", { className: textTone(stock.changePercent) }, format.change(stock.changePercent)), /* @__PURE__ */ import_react10.default.createElement("td", null, format.compact(stock.amount)), /* @__PURE__ */ import_react10.default.createElement("td", null, stock.marketCap !== null ? format.compact(stock.marketCap) : "\u2014"), onOpen ? /* @__PURE__ */ import_react10.default.createElement("td", null, /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", className: "dxs-mkt-drill", onClick: (event) => {
    event.stopPropagation();
    onOpen(stock.code, stock.name);
  }, "aria-label": t("market.drill.aria", { name: stock.name }) }, t("market.drill.open"))) : null))))), /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-muted" }, t("market.detail.notice"))) : null);
}
var canDrillIndex = (code) => /^(SH|SZ|BJ)\.\d{6}$/.test(code) && code !== "SH.932000";
function MarketView({ rpc, t, format, locale, now = () => /* @__PURE__ */ new Date(), onOpenStock, scope }) {
  const overview = useMarketOverview(rpc);
  const breadth = useMarketBreadth(rpc);
  const preference = useMarketPreference(rpc);
  const [selected, setSelected] = (0, import_react10.useState)(null);
  const [indexChart, setIndexChart] = (0, import_react10.useState)(null);
  const chartRef = (0, import_react10.useRef)(null);
  (0, import_react10.useEffect)(() => {
    if (indexChart) chartRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [indexChart]);
  const changeSource = async (enabled) => {
    try {
      await preference.setEnabled(enabled);
      overview.refresh();
      breadth.refresh();
    } catch {
    }
  };
  const data = overview.value;
  const breadthValue = breadth.value;
  const sectorChanges = data?.sectors.filter((sector) => sector.level === 1).map((sector) => sector.changePercent) ?? [];
  const strongest = data ? [...data.sectors].filter((sector) => sector.level === 1).sort((left, right) => right.changePercent - left.changePercent)[0] ?? null : null;
  const sentiment = data ? computeSentiment({
    indexChanges: data.indices.filter((index) => !index.code.startsWith("HK.")).map((index) => index.changePercent),
    breadth: breadthValue ? { up: breadthValue.up, down: breadthValue.down, flat: breadthValue.flat } : null,
    sectorChanges
  }) : null;
  const positiveSectors = sectorChanges.filter((value) => value > 0).length;
  const sectorAverage = sectorChanges.length ? sectorChanges.reduce((sum, value) => sum + value, 0) / sectorChanges.length : null;
  if (overview.status === "unconfigured") return /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt" }, /* @__PURE__ */ import_react10.default.createElement(MarketUnconfigured, { t, preference, onChange: changeSource, onRetry: overview.refresh }));
  if (overview.status === "error" && !data) return /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt" }, /* @__PURE__ */ import_react10.default.createElement(MarketErrorCard, { t, onRetry: overview.refresh, preference, onChange: changeSource }));
  if (overview.status === "loading" && !data) return /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt" }, /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-card dxs-mkt-loading", role: "status" }, /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-mkt-dot is-live" }), t("market.loading")));
  if (!data) return /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt" }, /* @__PURE__ */ import_react10.default.createElement(MarketErrorCard, { t, onRetry: overview.refresh, preference, onChange: changeSource }));
  return /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt" }, /* @__PURE__ */ import_react10.default.createElement("header", { className: "dxs-mkt-head" }, /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-eyebrow" }, t("market.source")), /* @__PURE__ */ import_react10.default.createElement("h2", null, t("market.title")), /* @__PURE__ */ import_react10.default.createElement("p", null, t("market.subtitle"))), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-head-actions" }, /* @__PURE__ */ import_react10.default.createElement(MarketStatus, { quotedAt: data.quotedAt, now, t, format }), /* @__PURE__ */ import_react10.default.createElement(SourceSwitch, { preference, onChange: changeSource, t }), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-updated" }, t("market.updated", { time: format.time(data.fetchedAt, t) })), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", onClick: () => {
    overview.refresh();
    breadth.refresh();
  }, disabled: overview.refreshing }, overview.refreshing ? t("market.refreshing") : t("market.refresh")))), overview.error ? /* @__PURE__ */ import_react10.default.createElement("p", { role: "status", className: "dxs-mkt-note" }, t("market.error"), " \xB7 ", t("market.error-hint")) : null, breadth.error ? /* @__PURE__ */ import_react10.default.createElement("p", { role: "status", className: "dxs-mkt-note" }, t("market.error"), " \xB7 ", t("market.error-hint")) : null, /* @__PURE__ */ import_react10.default.createElement("section", { className: "dxs-mkt-kpis" }, /* @__PURE__ */ import_react10.default.createElement(Kpi, { label: t("market.kpi.sentiment"), value: sentiment ? `${format.count(sentiment.score)} \xB7 ${t(`market.sentiment.label.${sentiment.label}`)}` : "\u2014", note: t("market.sentiment.subtitle"), tone: sentiment ? sentiment.score >= 56 ? "dxs-up" : sentiment.score <= 44 ? "dxs-down" : "" : "" }), /* @__PURE__ */ import_react10.default.createElement(Kpi, { label: t("market.kpi.breadth"), value: breadthValue ? /* @__PURE__ */ import_react10.default.createElement(import_react10.default.Fragment, null, /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-up" }, format.count(breadthValue.up)), /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-mkt-slash" }, "/"), /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-down" }, format.count(breadthValue.down))) : "\u2014", note: breadthValue ? t("market.kpi.flat-suspended", { flat: format.count(breadthValue.flat), suspended: format.count(breadthValue.suspended) }) : t("market.kpi.waiting") }), /* @__PURE__ */ import_react10.default.createElement(Kpi, { label: t("market.kpi.amount"), value: breadthValue ? format.compact(breadthValue.amount) : "\u2014", note: breadthValue ? t("market.breadth.subtitle", { covered: format.count(breadthValue.covered), expected: format.count(breadthValue.expected) }) : t("market.kpi.waiting") }), /* @__PURE__ */ import_react10.default.createElement(Kpi, { label: t("market.kpi.sectors"), value: sectorChanges.length ? `${format.count(positiveSectors)}/${format.count(sectorChanges.length)}` : "\u2014", note: sectorChanges.length ? t("market.kpi.sector-note", { avg: sectorAverage !== null ? format.change(sectorAverage) : "\u2014" }) : t("market.kpi.waiting") }), /* @__PURE__ */ import_react10.default.createElement(Kpi, { label: t("market.kpi.strongest"), value: strongest ? strongest.name : t("market.kpi.strongest-empty"), note: strongest ? format.change(strongest.changePercent) : void 0, tone: strongest ? textTone(strongest.changePercent) : "" }), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-kpi dxs-mkt-kpi-status" }, /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-kpi-label" }, t("market.kpi.status")), /* @__PURE__ */ import_react10.default.createElement(MarketStatus, { quotedAt: data.quotedAt, now, t, format, showTime: false }), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-kpi-note" }, t("market.status.hint")))), /* @__PURE__ */ import_react10.default.createElement(SentimentPanel, { data, breadth: breadthValue, t, format }), /* @__PURE__ */ import_react10.default.createElement("section", { className: "dxs-mkt-card" }, /* @__PURE__ */ import_react10.default.createElement("header", { className: "dxs-mkt-card-head" }, /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("h3", null, t("market.indices.title")), /* @__PURE__ */ import_react10.default.createElement("p", null, t("market.indices.subtitle")))), data.indices.length ? /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-index-grid" }, data.indices.map((index) => /* @__PURE__ */ import_react10.default.createElement(IndexCard, { key: index.code, index, t, format, onOpen: canDrillIndex(index.code) ? (code, name) => setIndexChart({ code, name }) : void 0 }))) : /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-muted" }, t("market.indices.empty")), /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-muted" }, t("market.drill.index-hint")), data.indices.some((index) => index.code.startsWith("HK.")) ? /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-muted" }, t("market.indices.hk-note")) : null, data.indices.some((index) => index.code === "SH.932000") ? /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-muted" }, t("market.indices.csi2000-note")) : /* @__PURE__ */ import_react10.default.createElement("p", { className: "dxs-mkt-muted" }, t("market.indices.csi2000-missing"))), indexChart ? /* @__PURE__ */ import_react10.default.createElement("section", { ref: chartRef, className: "dxs-mkt-card dxs-mkt-index-chart", "aria-label": t("market.drill.index-chart", { name: indexChart.name }) }, /* @__PURE__ */ import_react10.default.createElement("header", { className: "dxs-mkt-card-head" }, /* @__PURE__ */ import_react10.default.createElement("div", null, /* @__PURE__ */ import_react10.default.createElement("h3", null, indexChart.name, " \xB7 ", indexChart.code), /* @__PURE__ */ import_react10.default.createElement("p", null, t("market.drill.index-chart-note"))), /* @__PURE__ */ import_react10.default.createElement("div", { className: "dxs-mkt-index-chart-actions" }, /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", onClick: () => chartRef.current?.querySelector(".dxs-quant")?.scrollIntoView?.({ block: "start" }) }, t("market.drill.quant-jump")), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", onClick: () => setIndexChart(null) }, t("market.detail.close")))), /* @__PURE__ */ import_react10.default.createElement(StockWorkbench, { key: `index:${indexChart.code}`, symbol: indexChart.code, scope, rpc, t, format, locale })) : null, /* @__PURE__ */ import_react10.default.createElement(Heatmap, { data, selected, onSelect: setSelected, t, format }), selected ? /* @__PURE__ */ import_react10.default.createElement(SectorDetail, { key: selected.code, rpc, selection: selected, onClose: () => setSelected(null), t, format, onOpen: onOpenStock }) : null, breadthValue ? /* @__PURE__ */ import_react10.default.createElement(DistributionBar, { breadth: breadthValue, t, format }) : /* @__PURE__ */ import_react10.default.createElement("section", { className: "dxs-mkt-card dxs-mkt-loading", role: "status" }, /* @__PURE__ */ import_react10.default.createElement("span", { className: "dxs-mkt-dot is-live" }), breadth.status === "error" ? t("market.error") : t("market.breadth.waiting"), breadth.status === "error" ? /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", onClick: breadth.refresh }, t("market.retry")) : null), breadthValue ? /* @__PURE__ */ import_react10.default.createElement(Movers, { breadth: breadthValue, t, format, onOpen: onOpenStock }) : null, /* @__PURE__ */ import_react10.default.createElement("footer", { className: "dxs-mkt-footer" }, /* @__PURE__ */ import_react10.default.createElement("details", null, /* @__PURE__ */ import_react10.default.createElement("summary", null, t("market.source.details")), /* @__PURE__ */ import_react10.default.createElement("p", null, t("market.source.limits")), /* @__PURE__ */ import_react10.default.createElement("p", null, t("market.source.model")), /* @__PURE__ */ import_react10.default.createElement("p", null, t("market.source.no-persist")), /* @__PURE__ */ import_react10.default.createElement("p", null, t("market.source.persist"))), /* @__PURE__ */ import_react10.default.createElement("p", null, t("market.not-advice"))));
}

// src/client/market/GlobalView.tsx
var import_react11 = __toESM(require("react"), 1);
var REGIONS = ["americas", "asiaPacific", "europe"];
var toneOf2 = (value) => typeof value === "number" && value > 0 ? "dxs-up" : typeof value === "number" && value < 0 ? "dxs-down" : "";
function summarize(quotes, region) {
  const rows = quotes.filter((quote) => quote.region === region);
  const changes = rows.map((quote) => quote.changePercent).filter((value) => typeof value === "number");
  return {
    count: rows.length,
    up: changes.filter((value) => value > 0).length,
    down: changes.filter((value) => value < 0).length,
    average: changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null
  };
}
function displayName(quote, locale) {
  return String(locale ?? "").toLowerCase().startsWith("zh") ? quote.name : quote.nameEn;
}
function Kpi2({ label, value, note, tone: tone3 }) {
  return /* @__PURE__ */ import_react11.default.createElement("div", { className: "dxs-mkt-kpi" }, /* @__PURE__ */ import_react11.default.createElement("div", { className: "dxs-mkt-kpi-label" }, label), /* @__PURE__ */ import_react11.default.createElement("div", { className: `dxs-mkt-kpi-value ${tone3 ?? ""}` }, value), note ? /* @__PURE__ */ import_react11.default.createElement("div", { className: "dxs-mkt-kpi-note" }, note) : null);
}
function GlobalCard({ quote, locale, t, format }) {
  const name = displayName(quote, locale);
  const tone3 = toneOf2(quote.changePercent);
  const hasRange = quote.high !== null && quote.low !== null && quote.high > quote.low;
  const marker = hasRange ? Math.max(0, Math.min(100, (quote.price - quote.low) / (quote.high - quote.low) * 100)) : null;
  return /* @__PURE__ */ import_react11.default.createElement("article", { className: "dxs-mkt-index dxs-glb-card" }, /* @__PURE__ */ import_react11.default.createElement("header", null, /* @__PURE__ */ import_react11.default.createElement("div", { className: "dxs-glb-identity" }, /* @__PURE__ */ import_react11.default.createElement("h4", { title: name }, name), /* @__PURE__ */ import_react11.default.createElement("span", null, quote.code)), /* @__PURE__ */ import_react11.default.createElement("span", { className: `dxs-mkt-change ${tone3}` }, format.change(quote.changePercent))), /* @__PURE__ */ import_react11.default.createElement("div", { className: `dxs-mkt-index-price ${tone3}` }, format.price(quote.price)), /* @__PURE__ */ import_react11.default.createElement("div", { className: "dxs-mkt-index-sub dxs-glb-sub" }, /* @__PURE__ */ import_react11.default.createElement("span", { className: tone3 }, format.signed(quote.change)), /* @__PURE__ */ import_react11.default.createElement("span", { className: "dxs-glb-time" }, t("global.quote-time", { time: format.zoneTime(quote.quotedAt, quote.timeZone, t) }))), marker !== null ? /* @__PURE__ */ import_react11.default.createElement("div", { className: "dxs-mkt-range", role: "img", "aria-label": `${t("global.range")} \xB7 ${t("global.low", { value: format.price(quote.low) })} \xB7 ${t("global.high", { value: format.price(quote.high) })}` }, /* @__PURE__ */ import_react11.default.createElement("div", { className: "dxs-mkt-range-track" }, /* @__PURE__ */ import_react11.default.createElement("span", { style: { left: `${marker}%` } })), /* @__PURE__ */ import_react11.default.createElement("div", { className: "dxs-mkt-range-labels" }, /* @__PURE__ */ import_react11.default.createElement("span", null, t("global.low", { value: format.price(quote.low) })), /* @__PURE__ */ import_react11.default.createElement("span", null, t("global.high", { value: format.price(quote.high) })))) : null, /* @__PURE__ */ import_react11.default.createElement("dl", { className: "dxs-mkt-ohlc" }, /* @__PURE__ */ import_react11.default.createElement("div", null, /* @__PURE__ */ import_react11.default.createElement("dt", null, t("global.open")), /* @__PURE__ */ import_react11.default.createElement("dd", null, format.price(quote.open))), /* @__PURE__ */ import_react11.default.createElement("div", null, /* @__PURE__ */ import_react11.default.createElement("dt", null, t("global.previous")), /* @__PURE__ */ import_react11.default.createElement("dd", null, format.price(quote.previousClose)))));
}
function RegionSection({ region, quotes, locale, t, format }) {
  const summary = summarize(quotes, region);
  return /* @__PURE__ */ import_react11.default.createElement("section", { className: "dxs-mkt-card dxs-glb-section" }, /* @__PURE__ */ import_react11.default.createElement("header", { className: "dxs-mkt-card-head" }, /* @__PURE__ */ import_react11.default.createElement("div", null, /* @__PURE__ */ import_react11.default.createElement("h3", null, t(`global.region.${region}`)), /* @__PURE__ */ import_react11.default.createElement("p", null, t("global.section.count", { count: format.count(summary.count) }), " \xB7 ", t("global.section.average", { value: format.change(summary.average) }))), /* @__PURE__ */ import_react11.default.createElement("div", { className: "dxs-glb-updown" }, /* @__PURE__ */ import_react11.default.createElement("span", { className: "dxs-up" }, t("market.breadth.up"), " ", format.count(summary.up)), /* @__PURE__ */ import_react11.default.createElement("span", { className: "dxs-down" }, t("market.breadth.down"), " ", format.count(summary.down)))), quotes.length ? /* @__PURE__ */ import_react11.default.createElement("div", { className: "dxs-mkt-index-grid dxs-glb-grid" }, quotes.map((quote) => /* @__PURE__ */ import_react11.default.createElement(GlobalCard, { key: quote.code, quote, locale, t, format }))) : /* @__PURE__ */ import_react11.default.createElement("p", { className: "dxs-mkt-muted" }, t("global.empty")));
}
function AllIndicesTable({ quotes, locale, t, format }) {
  if (!quotes.length) return null;
  return /* @__PURE__ */ import_react11.default.createElement("details", { className: "dxs-mkt-table-details" }, /* @__PURE__ */ import_react11.default.createElement("summary", null, t("global.table")), /* @__PURE__ */ import_react11.default.createElement("div", { className: "dxs-mkt-table-wrap" }, /* @__PURE__ */ import_react11.default.createElement("table", null, /* @__PURE__ */ import_react11.default.createElement("caption", null, t("global.table.caption")), /* @__PURE__ */ import_react11.default.createElement("thead", null, /* @__PURE__ */ import_react11.default.createElement("tr", null, /* @__PURE__ */ import_react11.default.createElement("th", null, t("global.table.name")), /* @__PURE__ */ import_react11.default.createElement("th", null, t("global.table.region")), /* @__PURE__ */ import_react11.default.createElement("th", null, t("global.table.price")), /* @__PURE__ */ import_react11.default.createElement("th", null, t("global.table.change")), /* @__PURE__ */ import_react11.default.createElement("th", null, t("global.table.percent")), /* @__PURE__ */ import_react11.default.createElement("th", null, t("global.table.open")), /* @__PURE__ */ import_react11.default.createElement("th", null, t("global.table.high")), /* @__PURE__ */ import_react11.default.createElement("th", null, t("global.table.low")), /* @__PURE__ */ import_react11.default.createElement("th", null, t("global.table.previous")), /* @__PURE__ */ import_react11.default.createElement("th", null, t("global.table.time")))), /* @__PURE__ */ import_react11.default.createElement("tbody", null, quotes.map((quote) => /* @__PURE__ */ import_react11.default.createElement("tr", { key: quote.code }, /* @__PURE__ */ import_react11.default.createElement("td", null, /* @__PURE__ */ import_react11.default.createElement("span", null, displayName(quote, locale)), /* @__PURE__ */ import_react11.default.createElement("small", null, quote.code)), /* @__PURE__ */ import_react11.default.createElement("td", null, t(`global.region.${quote.region}`)), /* @__PURE__ */ import_react11.default.createElement("td", null, format.price(quote.price)), /* @__PURE__ */ import_react11.default.createElement("td", { className: toneOf2(quote.changePercent) }, format.signed(quote.change)), /* @__PURE__ */ import_react11.default.createElement("td", { className: toneOf2(quote.changePercent) }, format.change(quote.changePercent)), /* @__PURE__ */ import_react11.default.createElement("td", null, format.price(quote.open)), /* @__PURE__ */ import_react11.default.createElement("td", null, format.price(quote.high)), /* @__PURE__ */ import_react11.default.createElement("td", null, format.price(quote.low)), /* @__PURE__ */ import_react11.default.createElement("td", null, format.price(quote.previousClose)), /* @__PURE__ */ import_react11.default.createElement("td", null, format.zoneTime(quote.quotedAt, quote.timeZone, t))))))));
}
function GlobalView({ rpc, t, format, locale }) {
  const global = useGlobalMarket(rpc);
  const preference = useMarketPreference(rpc);
  const data = global.value;
  const changeSource = async (enabled) => {
    try {
      await preference.setEnabled(enabled);
      global.refresh();
    } catch {
    }
  };
  const ordered = (0, import_react11.useMemo)(() => {
    if (!data) return [];
    return [...data.quotes].sort((left, right) => REGIONS.indexOf(left.region) - REGIONS.indexOf(right.region));
  }, [data]);
  const summary = (0, import_react11.useMemo)(() => {
    const quotes = data?.quotes ?? [];
    const changes = quotes.map((quote) => quote.changePercent).filter((value) => typeof value === "number");
    const ranked = quotes.filter((quote) => typeof quote.changePercent === "number").sort((left, right) => (right.changePercent ?? 0) - (left.changePercent ?? 0));
    return {
      up: changes.filter((value) => value > 0).length,
      down: changes.filter((value) => value < 0).length,
      total: quotes.length,
      strongest: ranked[0] ?? null,
      weakest: ranked.at(-1) ?? null
    };
  }, [data]);
  if (global.status === "unconfigured") {
    return /* @__PURE__ */ import_react11.default.createElement("div", { className: "dxs-mkt dxs-glb" }, /* @__PURE__ */ import_react11.default.createElement(
      MarketUnconfigured,
      {
        t,
        preference,
        onChange: changeSource,
        onRetry: global.refresh,
        title: t("global.unconfigured-title"),
        body: t("global.unconfigured-body")
      }
    ));
  }
  if ((global.status === "error" || global.error) && !data) {
    return /* @__PURE__ */ import_react11.default.createElement("div", { className: "dxs-mkt dxs-glb" }, /* @__PURE__ */ import_react11.default.createElement(MarketErrorCard, { t, onRetry: global.refresh, preference, onChange: changeSource, title: t("global.error") }));
  }
  if (!data) {
    return /* @__PURE__ */ import_react11.default.createElement("div", { className: "dxs-mkt dxs-glb" }, /* @__PURE__ */ import_react11.default.createElement("section", { className: "dxs-mkt-card dxs-mkt-setup", role: "status" }, /* @__PURE__ */ import_react11.default.createElement("h3", null, global.error ? t("global.error") : t("global.loading")), global.error ? /* @__PURE__ */ import_react11.default.createElement(import_react11.default.Fragment, null, /* @__PURE__ */ import_react11.default.createElement("p", null, t("market.error-hint")), /* @__PURE__ */ import_react11.default.createElement("button", { type: "button", onClick: global.refresh }, t("market.retry"))) : null));
  }
  const regionsWithQuotes = REGIONS.filter((region) => data.quotes.some((quote) => quote.region === region)).length;
  return /* @__PURE__ */ import_react11.default.createElement("div", { className: "dxs-mkt dxs-glb" }, /* @__PURE__ */ import_react11.default.createElement("header", { className: "dxs-mkt-head" }, /* @__PURE__ */ import_react11.default.createElement("div", null, /* @__PURE__ */ import_react11.default.createElement("h2", null, t("global.title")), /* @__PURE__ */ import_react11.default.createElement("p", null, t("global.subtitle"))), /* @__PURE__ */ import_react11.default.createElement("div", { className: "dxs-mkt-head-actions" }, /* @__PURE__ */ import_react11.default.createElement("span", { className: "dxs-mkt-updated" }, t("market.updated", { time: format.time(data.fetchedAt, t) })), /* @__PURE__ */ import_react11.default.createElement(SourceSwitch, { preference, onChange: changeSource, t }), /* @__PURE__ */ import_react11.default.createElement("button", { type: "button", onClick: global.refresh, disabled: global.refreshing }, global.refreshing ? t("market.refreshing") : t("market.refresh")))), global.error ? /* @__PURE__ */ import_react11.default.createElement("p", { role: "status", className: "dxs-mkt-note" }, t("market.error"), " \xB7 ", t("market.error-hint")) : null, /* @__PURE__ */ import_react11.default.createElement("p", { className: "dxs-mkt-muted dxs-glb-coverage" }, t("global.coverage", { count: format.count(summary.total), regions: format.count(regionsWithQuotes) })), /* @__PURE__ */ import_react11.default.createElement("section", { className: "dxs-mkt-kpis dxs-glb-kpis" }, /* @__PURE__ */ import_react11.default.createElement(
    Kpi2,
    {
      label: t("global.kpi.updown"),
      value: /* @__PURE__ */ import_react11.default.createElement(import_react11.default.Fragment, null, /* @__PURE__ */ import_react11.default.createElement("span", { className: "dxs-up" }, format.count(summary.up)), /* @__PURE__ */ import_react11.default.createElement("span", { className: "dxs-mkt-slash" }, "/"), /* @__PURE__ */ import_react11.default.createElement("span", { className: "dxs-down" }, format.count(summary.down))),
      note: t("global.kpi.coverage", { count: format.count(summary.total) })
    }
  ), /* @__PURE__ */ import_react11.default.createElement(
    Kpi2,
    {
      label: t("global.kpi.strongest"),
      value: summary.strongest ? displayName(summary.strongest, locale) : "\u2014",
      note: summary.strongest ? format.change(summary.strongest.changePercent) : void 0,
      tone: summary.strongest ? toneOf2(summary.strongest.changePercent) : ""
    }
  ), /* @__PURE__ */ import_react11.default.createElement(
    Kpi2,
    {
      label: t("global.kpi.weakest"),
      value: summary.weakest ? displayName(summary.weakest, locale) : "\u2014",
      note: summary.weakest ? format.change(summary.weakest.changePercent) : void 0,
      tone: summary.weakest ? toneOf2(summary.weakest.changePercent) : ""
    }
  ), /* @__PURE__ */ import_react11.default.createElement(
    Kpi2,
    {
      label: t("global.kpi.regions"),
      value: `${format.count(regionsWithQuotes)}/${format.count(REGIONS.length)}`,
      note: t("global.kpi.regions-note")
    }
  )), REGIONS.map((region) => /* @__PURE__ */ import_react11.default.createElement(
    RegionSection,
    {
      key: region,
      region,
      locale,
      quotes: data.quotes.filter((quote) => quote.region === region),
      t,
      format
    }
  )), /* @__PURE__ */ import_react11.default.createElement(AllIndicesTable, { quotes: ordered, locale, t, format }), /* @__PURE__ */ import_react11.default.createElement("footer", { className: "dxs-mkt-footer" }, /* @__PURE__ */ import_react11.default.createElement("p", null, t("global.timezone-note")), /* @__PURE__ */ import_react11.default.createElement("p", null, t("global.source.note")), /* @__PURE__ */ import_react11.default.createElement("p", null, t("market.not-advice"))));
}

// src/client/SearchBox.tsx
var import_react12 = __toESM(require("react"), 1);

// src/instrument-search.ts
var SEARCH_RPC_ENDPOINT = "dsh-x-finance.search";
var SEARCH_MAX_QUERY = 24;

// src/client/chart/locales.ts
var chartZh = {
  "chart.title": "K \u7EBF \xB7 \u6210\u4EA4\u91CF \xB7 MACD \xB7 KDJ",
  "chart.canvas": "K \u7EBF\u56FE\uFF0C\u6210\u4EA4\u91CF\u3001MACD \u4E0E KDJ \u5171\u7528\u65E5\u671F\u8F74",
  "chart.help": "\u70B9\u51FB\u56FE\u8868\u9501\u5B9A\u8BFB\u6570\uFF0C\u518D\u70B9\u6216\u6309 Esc \u89E3\u9501\u3002\u56FE\u8868\u83B7\u7126\u540E\u7528 \u2190 \u2192 \u9010\u6839\u67E5\u770B\uFF0CHome / End \u5230\u9996\u672B\u6839\uFF1B\u6EDA\u8F6E\u7F29\u653E\u3002\u62D6\u52A8\u5206\u9694\u7EBF\u8C03\u6574\u526F\u56FE\u9AD8\u5EA6\u3002",
  "chart.demo-watermark": "DEMO \xB7 \u5408\u6210\u6570\u636E",
  "chart.local-watermark": "\u672C\u5730\u5386\u53F2 \xB7 \u975E\u5B9E\u65F6",
  "chart.market-watermark": "\u514D\u8D39\u6E90\u65E5K \xB7 \u975E\u5B9E\u65F6",
  "chart.price-pane": "K \u7EBF / MA",
  "chart.interval.intraday": "\u5206\u65F6",
  "chart.interval.1d": "\u65E5K",
  "chart.interval.1w": "\u5468K",
  "chart.interval.1M": "\u6708K",
  "chart.interval.1y": "\u5E74K",
  "chart.kdj": "KDJ",
  "chart.kdj-pane": "KDJ\uFF089, 3, 3\uFF09",
  "chart.volume-pane": "\u6210\u4EA4\u91CF\uFF08\u80A1\uFF09",
  "chart.volume-pane-reported": "\u6210\u4EA4\u91CF\uFF08\u6307\u6570\u53E3\u5F84\uFF09",
  "chart.macd-pane": "MACD\uFF08{fast}, {slow}, {signal}\uFF09\xB7 \u67F1 \xD7{scale}",
  "chart.latest": "\u56DE\u5230\u6700\u65B0",
  "chart.new-bars": "\u6709\u65B0\u589E\u6570\u636E \xB7 \u56DE\u5230\u6700\u65B0",
  "chart.reset-view": "\u91CD\u7F6E\u89C6\u56FE",
  "chart.zoom-in": "\u653E\u5927\u65F6\u95F4\u8F74",
  "chart.zoom-out": "\u7F29\u5C0F\u65F6\u95F4\u8F74",
  "chart.settings": "MACD \u8BBE\u7F6E",
  "chart.settings-title": "MACD \u53C2\u6570",
  "chart.fast": "\u5FEB\u5468\u671F",
  "chart.slow": "\u6162\u5468\u671F",
  "chart.signal": "\u4FE1\u53F7\u5468\u671F",
  "chart.hist-scale": "\u67F1\u500D\u7387",
  "chart.parameters-invalid": "\u5468\u671F\u987B\u4E3A 1\u2013250 \u7684\u6574\u6570\uFF0C\u5FEB\u5468\u671F\u987B\u5C0F\u4E8E\u6162\u5468\u671F\uFF0C\u67F1\u500D\u7387\u4E3A 1 \u6216 2\u3002",
  "chart.apply": "\u5E94\u7528",
  "chart.cancel": "\u53D6\u6D88",
  "chart.defaults": "\u6062\u590D\u9ED8\u8BA4\u53C2\u6570",
  "chart.expand-macd": "\u653E\u5927 MACD \u526F\u56FE",
  "chart.restore-panes": "\u6062\u590D\u526F\u56FE\u9AD8\u5EA6",
  "chart.hide-line": "\u663E\u793A {line}",
  "chart.readout": "\u9009\u4E2D\u4EA4\u6613\u65E5\u6570\u636E",
  "chart.locked": "\u5DF2\u9501\u5B9A",
  "chart.unlocked": "\u968F\u5341\u5B57\u7EBF",
  "chart.unlock": "\u89E3\u9501\u8BFB\u6570",
  "chart.date": "\u4EA4\u6613\u65E5",
  "chart.open": "\u5F00",
  "chart.high": "\u9AD8",
  "chart.low": "\u4F4E",
  "chart.close": "\u6536",
  "chart.volume": "\u91CF\uFF08\u80A1\uFF09",
  "chart.volume-reported": "\u91CF\uFF08\u6307\u6570\u53E3\u5F84\uFF09",
  "chart.amount": "\u989D\uFF08{currency}\uFF09",
  "chart.hist": "\u67F1 \xD7{scale}",
  "chart.final": "\u5DF2\u6536\u76D8",
  "chart.provisional": "\u672A\u6536\u76D8",
  "chart.warmup": "\u6307\u6807\u5728\u5B8C\u6574\u9884\u70ED\u524D\u663E\u793A \u2014\u3002MACD \u9700\u8981 {required} \u6839\uFF0C\u5F53\u524D {available} \u6839\u3002",
  "chart.method": "\u8BA1\u7B97\u53E3\u5F84\uFF1A\u72EC\u7ACB SMA \u64AD\u79CD EMA\uFF1BDIF = \u5FEB EMA \u2212 \u6162 EMA\uFF0CDEA = DIF \u7684 EMA\uFF0C\u67F1 = {scale} \xD7 (DIF \u2212 DEA)\u3002KDJ\uFF1A9 \u6839 RSV\uFF0CK/D \u4ECE 50 \u5E73\u6ED1\uFF081/3\uFF09\uFF0CJ = 3K \u2212 2D\uFF1B\u6700\u9AD8\u4EF7\u7B49\u4E8E\u6700\u4F4E\u4EF7\u65F6 RSV \u8BB0 50\u3002\u57FA\u4E8E\u5DF2\u52A0\u8F7D\u5168\u90E8\u5386\u53F2\u8BA1\u7B97\uFF0C\u4E0D\u968F\u7F29\u653E\u91CD\u7B97\u3002",
  "chart.table-show": "\u67E5\u770B\u6570\u636E\u8868",
  "chart.table-hide": "\u6536\u8D77\u6570\u636E\u8868",
  "chart.table-caption": "{symbol} \xB7 \u5DF2\u52A0\u8F7D\u65E5 K \u4E0E\u6307\u6807\u6570\u636E",
  "chart.table-page": "\u7B2C {from}\u2013{to} \u884C\uFF0C\u5171 {total} \u884C",
  "chart.table-older": "\u66F4\u65E9\u6570\u636E",
  "chart.table-newer": "\u8F83\u65B0\u6570\u636E",
  "chart.select-row": "\u5728\u56FE\u8868\u4E2D\u9009\u62E9 {date}",
  "chart.render-error": "\u56FE\u8868\u672A\u80FD\u7ED8\u5236\u3002\u4ECD\u53EF\u5728\u6570\u636E\u8868\u67E5\u770B\u672C\u5730\u6570\u636E\u3002",
  "chart.indicator-error": "\u8BE5\u6570\u636E\u65E0\u6CD5\u5B89\u5168\u8BA1\u7B97\u6307\u6807\uFF1B\u6307\u6807\u7559\u7A7A\uFF0C\u539F\u59CB OHLCV \u4ECD\u53EF\u67E5\u770B\u3002",
  "chart.attribution": "\u56FE\u8868\u7531 TradingView Lightweight Charts \u63D0\u4F9B"
};
var chartEn = {
  "chart.title": "Candles \xB7 Volume \xB7 MACD \xB7 KDJ",
  "chart.canvas": "Candlestick chart with volume, MACD and KDJ on one date axis",
  "chart.help": "Click to lock readings; click again or press Esc to unlock. With the chart focused, use \u2190 \u2192 to move, Home / End for the first / last bar, and the wheel to zoom. Drag pane dividers to resize.",
  "chart.demo-watermark": "DEMO \xB7 SYNTHETIC DATA",
  "chart.local-watermark": "LOCAL HISTORY \xB7 NOT LIVE",
  "chart.market-watermark": "FREE-SOURCE DAILY \xB7 NOT LIVE",
  "chart.price-pane": "Candles / MA",
  "chart.interval.intraday": "Intraday",
  "chart.interval.1d": "Daily",
  "chart.interval.1w": "Weekly",
  "chart.interval.1M": "Monthly",
  "chart.interval.1y": "Yearly",
  "chart.kdj": "KDJ",
  "chart.kdj-pane": "KDJ (9, 3, 3)",
  "chart.volume-pane": "Volume (shares)",
  "chart.volume-pane-reported": "Volume (index units)",
  "chart.macd-pane": "MACD ({fast}, {slow}, {signal}) \xB7 histogram \xD7{scale}",
  "chart.latest": "Return to latest",
  "chart.new-bars": "New data \xB7 Return to latest",
  "chart.reset-view": "Reset view",
  "chart.zoom-in": "Zoom in on time axis",
  "chart.zoom-out": "Zoom out on time axis",
  "chart.settings": "MACD settings",
  "chart.settings-title": "MACD parameters",
  "chart.fast": "Fast period",
  "chart.slow": "Slow period",
  "chart.signal": "Signal period",
  "chart.hist-scale": "Histogram scale",
  "chart.parameters-invalid": "Periods must be integers from 1\u2013250, fast must be less than slow, and histogram scale must be 1 or 2.",
  "chart.apply": "Apply",
  "chart.cancel": "Cancel",
  "chart.defaults": "Restore default parameters",
  "chart.expand-macd": "Enlarge MACD pane",
  "chart.restore-panes": "Restore pane heights",
  "chart.hide-line": "Show {line}",
  "chart.readout": "Selected trading day",
  "chart.locked": "Locked",
  "chart.unlocked": "Follows crosshair",
  "chart.unlock": "Unlock readings",
  "chart.date": "Session date",
  "chart.open": "O",
  "chart.high": "H",
  "chart.low": "L",
  "chart.close": "C",
  "chart.volume": "Vol (shares)",
  "chart.volume-reported": "Vol (index units)",
  "chart.amount": "Amount ({currency})",
  "chart.hist": "Histogram \xD7{scale}",
  "chart.final": "Final",
  "chart.provisional": "Provisional",
  "chart.warmup": "Indicators show \u2014 until fully warmed up. MACD needs {required} bars; {available} are loaded.",
  "chart.method": "Method: independent SMA-seeded EMAs; DIF = fast EMA \u2212 slow EMA, DEA = EMA of DIF, histogram = {scale} \xD7 (DIF \u2212 DEA). KDJ: 9-bar RSV, K/D smoothed from 50 by 1/3, J = 3K \u2212 2D; RSV is 50 when high equals low. Calculated over all loaded history, independent of zoom.",
  "chart.table-show": "View data table",
  "chart.table-hide": "Hide data table",
  "chart.table-caption": "{symbol} \xB7 Loaded daily candles and indicators",
  "chart.table-page": "Rows {from}\u2013{to} of {total}",
  "chart.table-older": "Older data",
  "chart.table-newer": "Newer data",
  "chart.select-row": "Select {date} on the chart",
  "chart.render-error": "The chart could not render. You can still inspect local data in the table.",
  "chart.indicator-error": "Indicators could not be calculated safely for this data. They are left blank; original OHLCV remains available.",
  "chart.attribution": "Charts by TradingView Lightweight Charts"
};

// src/client/workbench-locales.ts
var workbenchZh = {
  "workbench.title": "\u56FE\u8868\u5DE5\u4F5C\u53F0",
  "workbench.empty": "\u6682\u65E0\u5386\u53F2\u884C\u60C5",
  "workbench.hint": "\u53EF\u4EE5\u663E\u5F0F\u6253\u5F00\u5408\u6210\u6F14\u793A\uFF0C\u6216\u5728\u672C\u6D4F\u89C8\u5668\u5BFC\u5165\u4F60\u6709\u6743\u4F7F\u7528\u7684\u65E5K JSON\u3002\u5BFC\u5165\u5185\u5BB9\u4E0D\u4F1A\u4E0A\u4F20\uFF0C\u4E5F\u4E0D\u4F1A\u5199\u5165\u5E95\u680F\u5B9E\u65F6\u884C\u60C5\u3002",
  "workbench.demo": "\u6253\u5F00\u5408\u6210 DEMO",
  "workbench.import": "\u5BFC\u5165\u672C\u5730\u65E5K JSON",
  "workbench.example": "\u4E0B\u8F7D\u683C\u5F0F\u793A\u4F8B",
  "workbench.clear": "\u5173\u95ED\u56FE\u8868\u6570\u636E",
  "workbench.demo-notice": "DEMO \xB7 \u5408\u6210\u6570\u636E\uFF0C\u4E0D\u662F\u771F\u5B9E\u80A1\u7968\u6216\u5B9E\u65F6\u884C\u60C5",
  "workbench.local-notice": "\u672C\u5730\u5BFC\u5165 \xB7 \u5386\u53F2\u6570\u636E\uFF0C\u6765\u6E90\u4E3A\u6587\u4EF6\u81EA\u884C\u58F0\u660E\uFF0C\u5C1A\u672A\u72EC\u7ACB\u9A8C\u8BC1\uFF1B\u4E0D\u662F\u5B9E\u65F6\u884C\u60C5",
  "workbench.private": "\u6587\u4EF6\u4EC5\u5728\u5F53\u524D\u9875\u9762\u5185\u5B58\u4E2D\u5904\u7406\uFF1B\u79BB\u5F00\u6B64\u80A1\u7968\u6216\u5237\u65B0\u4F1A\u6E05\u9664\u3002\u53EA\u4FDD\u5B58\u56FE\u8868\u663E\u793A\u504F\u597D\u3002",
  "workbench.loading": "\u6B63\u5728\u672C\u5730\u6821\u9A8C\u6587\u4EF6\u2026",
  "workbench.error": "\u6587\u4EF6\u683C\u5F0F\u6216\u6570\u636E\u65E0\u6548\u3002\u8BF7\u6309\u793A\u4F8B\u63D0\u4F9B\u4E0D\u8D85\u8FC72 MiB\u30015,000\u6839\u3001\u65E5\u671F\u9012\u589E\u4E14\u65E0\u91CD\u590D\u7684\u65E5K\u6570\u636E\u3002",
  "workbench.mismatch": "\u5BFC\u5165\u4EE3\u7801\u4E0E\u5F53\u524D\u9009\u62E9\u7684\u80A1\u7968\u4E0D\u4E00\u81F4\uFF0C\u8BF7\u9009\u62E9\u5BF9\u5E94\u80A1\u7968\u540E\u518D\u5BFC\u5165\u3002",
  "workbench.save-error": "\u56FE\u8868\u504F\u597D\u672A\u4FDD\u5B58\uFF0C\u6D4F\u89C8\u5668\u5B58\u50A8\u4E0D\u53EF\u7528\u3002",
  "workbench.historical-close": "\u672B\u6839\u5386\u53F2\u6536\u76D8",
  "workbench.source": "\u58F0\u660E\u6765\u6E90",
  "workbench.adjustment": "\u590D\u6743",
  "workbench.adjustment.none": "\u4E0D\u590D\u6743",
  "workbench.adjustment.forward": "\u524D\u590D\u6743",
  "workbench.adjustment.backward": "\u540E\u590D\u6743",
  "workbench.daily": "K\u7EBF \xB7 \u6210\u4EA4\u91CF \xB7 MA / MACD / KDJ",
  "workbench.no-realtime": "\u5F53\u524D\u6CA1\u6709\u5DF2\u63A5\u5165\u7684\u5B9E\u65F6\u6216\u5206\u949FK\u6570\u636E\u6E90\u3002",
  "workbench.interval.aria": "K\u7EBF\u5468\u671F",
  "intraday.notice": "\u5206\u65F6\u6765\u81EA\u4E1C\u65B9\u8D22\u5BCC\u516C\u5F00\u63A5\u53E3\uFF08\u975E\u5B98\u65B9\uFF09\uFF0C\u4E0D\u662F\u5B9E\u65F6\uFF0C\u4E5F\u4E0D\u6784\u6210\u6295\u8D44\u5EFA\u8BAE\u3002\u6A2A\u8F74\u662F\u5317\u4EAC\u65F6\u95F4\uFF0C\u5348\u4F11\u4E0D\u5360\u4F4D\u7F6E\u3002",
  "intraday.loading": "\u6B63\u5728\u83B7\u53D6\u5206\u65F6\u2026",
  "intraday.off-title": "\u5206\u65F6\u672A\u5F00\u542F",
  "intraday.off": "\u5206\u65F6\u4E0E\u65E5K\u5171\u7528\u672C\u673A\u514D\u8D39\u6E90\u3002\u5728\u300C\u5E02\u573A\u300D\u9875\u6253\u5F00\u300C\u514D\u8D39\u6E90\u300D\u540E\u5373\u53EF\u52A0\u8F7D\u3002",
  "intraday.unavailable-title": "\u6682\u65E0\u5206\u65F6",
  "intraday.unavailable": "\u8BE5\u80A1\u7968\u6CA1\u6709\u53EF\u7528\u7684\u5F53\u65E5\u5206\u65F6\uFF0C\u4E0D\u4F1A\u7528\u65E5K\u8865\u51FA\u4E00\u6761\u7EBF\u3002",
  "intraday.error-title": "\u5206\u65F6\u83B7\u53D6\u5931\u8D25",
  "intraday.error": "\u5206\u65F6\u6682\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\uFF1B\u4E0D\u4F1A\u7528\u65E7\u7EBF\u6216\u731C\u6D4B\u503C\u66FF\u4EE3\u3002",
  "intraday.only-market": "\u5206\u65F6\u53EA\u6765\u81EA\u514D\u8D39\u6E90\u3002\u5408\u6210\u6570\u636E\u548C\u672C\u5730\u5BFC\u5165\u6CA1\u6709\u5206\u65F6\u3002",
  "intraday.previous": "\u6628\u6536",
  "intraday.price": "\u4EF7\u683C",
  "intraday.average": "\u5747\u4EF7",
  "intraday.volume": "\u6210\u4EA4\u91CF\uFF08\u624B\uFF09",
  "intraday.axis": "\u5DE6\u8F74\u4EF7\u683C\uFF0C\u53F3\u8F74\u662F\u8F83\u6628\u6536\u7684\u6DA8\u8DCC\u5E45",
  "intraday.axis-price": "\u53F3\u8F74\u662F\u4EF7\u683C\uFF08\u6E90\u6CA1\u6709\u6628\u6536\uFF0C\u6240\u4EE5\u6CA1\u6709\u6DA8\u8DCC\u5E45\uFF09",
  "intraday.change": "\u76F8\u5BF9\u6628\u6536 {change}",
  "intraday.no-previous": "\u6E90\u6CA1\u6709\u7ED9\u51FA\u6628\u6536\uFF0C\u4E0D\u8BA1\u7B97\u6DA8\u8DCC\u3002",
  "intraday.canvas": "{date} \u5206\u65F6",
  "intraday.chart-failed": "\u5206\u65F6\u56FE\u672A\u80FD\u7ED8\u5236\uFF0C\u6570\u5B57\u4ECD\u53EF\u67E5\u770B\u3002",
  "intraday.open": "\u4EA4\u6613\u4E2D\uFF0C\u6700\u65B0\u4E00\u70B9\u672A\u6536\u76D8",
  "intraday.closed": "\u8BE5\u4EA4\u6613\u65E5\u5206\u65F6\u5DF2\u7ED3\u675F",
  "quant.title": "\u91CF\u5316\u56DE\u653E",
  "quant.notice": "\u5728\u5F53\u524D{interval}\u4E0A\uFF0C\u6309\u6536\u76D8\u4EF7\u505A\u4EA4\u53C9\u56DE\u653E\uFF1A\u5FEB\u7EBF\u4E0A\u7A7F\u6162\u7EBF\u7684\u90A3\u6839\u6536\u76D8\u8BB0\u4E3A\u8D77\u70B9\uFF0C\u4E0B\u4E00\u6B21\u4E0B\u7A7F\u7684\u90A3\u6839\u6536\u76D8\u8BB0\u4E3A\u7EC8\u70B9\u3002\u4E0D\u542B\u624B\u7EED\u8D39\u3001\u6ED1\u70B9\u3001\u4ED3\u4F4D\u6216\u4E0B\u5355\uFF0C\u4E0D\u662F\u9884\u6D4B\uFF0C\u4E5F\u4E0D\u6784\u6210\u6295\u8D44\u5EFA\u8BAE\u3002",
  "quant.kdj": "KDJ\uFF089, 3, 3\uFF09",
  "quant.macd": "MACD",
  "quant.latest": "\u6700\u8FD1\u72B6\u6001\uFF1A{state}",
  "quant.state.golden": "\u91D1\u53C9",
  "quant.state.death": "\u6B7B\u53C9",
  "quant.state.above": "\u5FEB\u7EBF\u5728\u6162\u7EBF\u4E4B\u4E0A",
  "quant.state.below": "\u5FEB\u7EBF\u5728\u6162\u7EBF\u4E4B\u4E0B",
  "quant.state.flat": "\u6301\u5E73",
  "quant.state.warmup": "\u5C1A\u672A\u5F62\u6210",
  "quant.samples": "\u5DF2\u7ED3\u675F {count} \u6BB5\uFF0C\u4E0A\u6DA8 {wins} \u6BB5\uFF0C\u5E73\u5747\u6536\u76CA {average}",
  "quant.open": "\u53E6\u6709\u4E00\u6BB5\u5C1A\u672A\u7ED3\u675F\uFF0C\u4E0D\u8BA1\u5165\u5E73\u5747\u6536\u76CA\u3002",
  "quant.none": "\u5DF2\u7ED3\u675F\u7684\u6837\u672C\u4E0D\u8DB3\uFF0C\u4E0D\u8BA1\u7B97\u80DC\u7387\u6216\u5E73\u5747\u6536\u76CA\u3002",
  "quant.unavailable": "\u8FD9\u7EC4K\u7EBF\u65E0\u6CD5\u505A\u91CF\u5316\u56DE\u653E\u3002",
  "workbench.attribution": "\u56FE\u8868\u7531 TradingView Lightweight Charts \u63D0\u4F9B\uFF08Apache-2.0\uFF09\uFF1Bfancy-canvas\uFF08MIT\uFF09\u3002",
  "workbench.format": "\u683C\u5F0F\u4E0E\u9650\u5236",
  "workbench.format-help": "schemaVersion 1\uFF1Binterval 1d\uFF1Bbars\u542BsessionDate/open/high/low/close/volume/isFinal\u3002\u5FC5\u987B\u58F0\u660EpricePrecision\u3001\u5E01\u79CD\u3001\u4EA4\u6613\u6240\u65F6\u533A\u3001\u590D\u6743\u53CA\u91CF\u989D\u53E3\u5F84\u3002\u4EF7\u683C\u7EDD\u5BF9\u503C\u4E0D\u8D85\u8FC71e12\uFF0C\u91CF\u989D\u4E0D\u8D85\u8FC7\u5B89\u5168\u6574\u6570\u4E0A\u9650\u3002\u65E5\u671F\u4E0D\u91CD\u590D\u4E14\u5347\u5E8F\uFF0C\u7F3A\u5931\u91CF\u4E3Anull\uFF0C\u4E0D\u586B0\uFF1B\u5B8C\u6574\u683C\u5F0F\u89C1\u4E0B\u8F7D\u793A\u4F8B\u3002\u793A\u4F8B\u4E3A\u5408\u6210\u6570\u636E\uFF0C\u4E0D\u80FD\u5F53\u771F\u5B9E\u884C\u60C5\u3002",
  "workbench.source.aria": "\u56FE\u8868\u6570\u636E\u6765\u6E90",
  "workbench.source.market": "\u514D\u8D39\u6E90\u65E5K",
  "workbench.source.demo": "\u5408\u6210 DEMO",
  "workbench.source.local": "\u672C\u5730\u5BFC\u5165",
  "workbench.market-notice": "\u514D\u8D39\u6E90\u65E5K \xB7 \u5386\u53F2\u65E5\u7EBF\uFF0C\u975E\u5B9E\u65F6\uFF1B\u6765\u6E90\u4E3A\u817E\u8BAF\u516C\u5F00\u63A5\u53E3\uFF08\u975E\u5B98\u65B9\uFF09\uFF0C\u65E0 SLA\uFF0C\u4E0D\u6784\u6210\u6295\u8D44\u5EFA\u8BAE",
  "workbench.market-hint": "\u65E5 K \u6765\u81EA\u4E0E\u300C\u5E02\u573A\u300D\u9875\u540C\u4E00\u4E2A\u672C\u673A\u514D\u8D39\u6E90\uFF08\u817E\u8BAF\u516C\u5F00\u63A5\u53E3\uFF0C\u975E\u5B98\u65B9\u3001\u65E0 SLA\uFF09\u3002\u5207\u6362\u590D\u6743\u65B9\u5F0F\u4F1A\u91CD\u65B0\u8BF7\u6C42\uFF1B\u5173\u95ED\u514D\u8D39\u6E90\u540E\u4E0D\u4F1A\u53D1\u51FA\u8BF7\u6C42\u3002",
  "workbench.market-loading": "\u6B63\u5728\u83B7\u53D6\u65E5 K \u6570\u636E\u2026",
  "workbench.refreshing": "\u66F4\u65B0\u4E2D\u2026",
  "workbench.refresh": "\u5237\u65B0\u65E5K",
  "workbench.retry": "\u91CD\u8BD5",
  "workbench.market-off-title": "\u65E5 K \u6570\u636E\u672A\u5F00\u542F",
  "workbench.market-off": "\u65E5 K \u4E0E\u300C\u5E02\u573A\u300D\u9875\u5171\u7528\u540C\u4E00\u4E2A\u672C\u673A\u514D\u8D39\u6E90\u3002\u5728\u300C\u5E02\u573A\u300D\u9875\u6253\u5F00\u300C\u514D\u8D39\u6E90\u300D\u5F00\u5173\u540E\u5373\u53EF\u52A0\u8F7D\uFF0C\u6216\u4F7F\u7528\u4E0B\u65B9 DEMO / \u672C\u5730\u5BFC\u5165\u3002",
  "workbench.market-unavailable-title": "\u6682\u65E0\u65E5 K \u6570\u636E",
  "workbench.market-unavailable": "\u8BE5\u80A1\u7968\u6216\u6307\u6570\u6CA1\u6709\u53EF\u7528\u7684\u65E5\u7EBF\u6570\u636E\uFF0C\u6216\u5F53\u524D\u884C\u60C5\u6E90\u4E0D\u63D0\u4F9B\u5386\u53F2\u884C\u60C5\u3002\u4E0D\u4F1A\u7ED8\u5236\u793A\u610F K \u7EBF\u3002",
  "workbench.market-error-title": "\u65E5 K \u83B7\u53D6\u5931\u8D25",
  "workbench.market-error": "\u65E5 K \u6682\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\uFF1B\u4E0D\u4F1A\u7528\u65E7\u6570\u636E\u6216\u731C\u6D4B\u503C\u66FF\u4EE3\u3002",
  "workbench.bars": "{count} \u6839 \xB7 {from} \u81F3 {to}",
  "workbench.volume.shares": "\u6210\u4EA4\u91CF\uFF1A\u80A1",
  "workbench.volume.lots": "\u6210\u4EA4\u91CF\uFF1A\u624B\uFF08\u5DF2\u6298\u7B97\u4E3A\u80A1\uFF09",
  "workbench.volume.unknown": "\u6210\u4EA4\u91CF\u5355\u4F4D\u65E0\u6CD5\u786E\u8BA4\uFF0C\u5DF2\u7559\u7A7A",
  "workbench.volume.reported": "\u6210\u4EA4\u91CF\uFF1A\u6307\u6570\u53E3\u5F84\uFF08\u4E0D\u662F\u80A1\u6570\uFF09",
  "workbench.provisional-close": "\u6700\u65B0\uFF08\u672A\u6536\u76D8\uFF09"
};
var workbenchEn = {
  "workbench.title": "Chart workbench",
  "workbench.empty": "No historical market data",
  "workbench.hint": "Explicitly open a synthetic demo, or import daily JSON data you are entitled to use in this browser. Imports are not uploaded or copied into live watchlist quotes.",
  "workbench.demo": "Open synthetic DEMO",
  "workbench.import": "Import local daily JSON",
  "workbench.example": "Download format example",
  "workbench.clear": "Close chart data",
  "workbench.demo-notice": "DEMO \xB7 Synthetic data, not a real security or live quotes",
  "workbench.local-notice": "Local import \xB7 Historical data with self-declared, unverified provenance; not live quotes",
  "workbench.private": "Files are processed only in page memory and cleared when you leave this stock or reload. Only chart display preferences are saved.",
  "workbench.loading": "Validating the file locally\u2026",
  "workbench.error": "Invalid file or data. Follow the example: at most 2 MiB and 5,000 daily bars, with strictly increasing unique dates.",
  "workbench.mismatch": "The imported symbol does not match the selected stock. Select the matching stock before importing.",
  "workbench.save-error": "Chart preferences were not saved because browser storage is unavailable.",
  "workbench.historical-close": "Last historical close",
  "workbench.source": "Declared source",
  "workbench.adjustment": "Adjustment",
  "workbench.adjustment.none": "Unadjusted",
  "workbench.adjustment.forward": "Forward adjusted",
  "workbench.adjustment.backward": "Backward adjusted",
  "workbench.daily": "Candles \xB7 Volume \xB7 MA / MACD / KDJ",
  "workbench.no-realtime": "No live or intraday bar provider is connected.",
  "workbench.interval.aria": "Candle period",
  "intraday.notice": "Intraday prices come from East Money's public endpoint (unofficial). Not live and not investment advice. The time axis is Beijing time, with the lunch break removed.",
  "intraday.loading": "Loading the intraday line\u2026",
  "intraday.off-title": "Intraday is off",
  "intraday.off": "The intraday line shares the local free source with daily bars. Turn the free source on from the Market tab.",
  "intraday.unavailable-title": "No intraday line",
  "intraday.unavailable": "This symbol has no intraday line for the session. Daily bars are not drawn in its place.",
  "intraday.error-title": "Intraday data failed",
  "intraday.error": "The intraday line is unavailable right now. Nothing is replaced with a stale line or a guessed value.",
  "intraday.only-market": "The intraday line comes only from the free source. Synthetic and imported data have none.",
  "intraday.previous": "Previous close",
  "intraday.price": "Price",
  "intraday.average": "Average",
  "intraday.volume": "Volume (lots)",
  "intraday.axis": "Left axis: price. Right axis: percent versus the previous close",
  "intraday.axis-price": "Right axis: price. The source gave no previous close, so there is no percent scale",
  "intraday.change": "{change} versus the previous close",
  "intraday.no-previous": "The source did not provide a previous close, so no change is calculated.",
  "intraday.canvas": "Intraday line for {date}",
  "intraday.chart-failed": "The intraday chart could not be drawn. The figures below are still available.",
  "intraday.open": "Session in progress; the latest point is not final",
  "intraday.closed": "This session's intraday line has ended",
  "quant.title": "Quantitative replay",
  "quant.notice": "On the current {interval} bars, a close-to-close replay: the close of a fast-line cross above the slow line starts a sample, and the close of the next cross below ends it. No commission, slippage, position or order. Not a forecast and not investment advice.",
  "quant.kdj": "KDJ (9, 3, 3)",
  "quant.macd": "MACD",
  "quant.latest": "Latest state: {state}",
  "quant.state.golden": "Golden cross",
  "quant.state.death": "Death cross",
  "quant.state.above": "Fast line above slow line",
  "quant.state.below": "Fast line below slow line",
  "quant.state.flat": "Flat",
  "quant.state.warmup": "Not ready",
  "quant.samples": "{count} closed samples, {wins} up, average return {average}",
  "quant.open": "One sample is still open and is excluded from the average.",
  "quant.none": "Not enough closed samples to report a win count or average return.",
  "quant.unavailable": "These bars cannot be replayed.",
  "workbench.attribution": "Charts by TradingView Lightweight Charts (Apache-2.0); fancy-canvas (MIT).",
  "workbench.format": "Format and limits",
  "workbench.format-help": "schemaVersion 1; interval 1d; bars contain sessionDate/open/high/low/close/volume/isFinal. Declare pricePrecision, currency, exchange timezone, and price/volume/amount adjustment conventions. Absolute prices are capped at 1e12; volume/amount at Number.MAX_SAFE_INTEGER. Dates must be unique and ascending; missing volume is null, not zero. Download the complete example. Example values are synthetic, not market data.",
  "workbench.source.aria": "Chart data source",
  "workbench.source.market": "Free-source daily",
  "workbench.source.demo": "Synthetic DEMO",
  "workbench.source.local": "Local import",
  "workbench.market-notice": "Free-source daily bars \xB7 historical, not live; Tencent public endpoint (unofficial), no SLA, not investment advice",
  "workbench.market-hint": "Daily bars come from the same local free source as the Market tab (Tencent public endpoint, unofficial, no SLA). Changing the adjustment refetches; with the free source off, nothing is requested.",
  "workbench.market-loading": "Loading daily bars\u2026",
  "workbench.refreshing": "Refreshing\u2026",
  "workbench.refresh": "Refresh daily bars",
  "workbench.retry": "Retry",
  "workbench.market-off-title": "Daily data is off",
  "workbench.market-off": "Daily bars share the local free source with the Market tab. Turn the free source on there to load them, or use the DEMO / local import below.",
  "workbench.market-unavailable-title": "No daily data",
  "workbench.market-unavailable": "This stock or index has no available daily bars, or the current source provides no history. No illustrative candles are drawn.",
  "workbench.market-error-title": "Daily data failed",
  "workbench.market-error": "Daily bars are unavailable right now. Nothing is replaced with stale data or a guessed value.",
  "workbench.bars": "{count} bars \xB7 {from} to {to}",
  "workbench.volume.shares": "Volume: shares",
  "workbench.volume.lots": "Volume: lots, converted to shares",
  "workbench.volume.unknown": "Volume unit unconfirmed; left blank",
  "workbench.volume.reported": "Volume: index units, not shares",
  "workbench.provisional-close": "Latest (not final)"
};

// src/client/market-locales.ts
var marketZh = {
  "page.view.watchlist": "\u81EA\u9009",
  "page.view.market": "\u5E02\u573A",
  "page.view.aria": "\u80A1\u7968\u9875\u9762\u89C6\u56FE",
  "page.view.market-hint": "\u67E5\u770B\u5E02\u573A\u5168\u666F",
  "market.title": "\u5E02\u573A\u5168\u666F",
  "market.subtitle": "\u6307\u6570\u3001\u6DA8\u8DCC\u5BB6\u6570\u3001\u7533\u4E07\u884C\u4E1A\u70ED\u529B\u4E0E\u60C5\u7EEA\u5FEB\u7167",
  "market.refresh": "\u5237\u65B0",
  "market.refreshing": "\u66F4\u65B0\u4E2D\u2026",
  "market.updated": "\u66F4\u65B0\u4E8E {time}",
  "market.quote-time": "\u884C\u60C5\u65F6\u95F4 {time}",
  "market.source": "\u817E\u8BAF\u884C\u60C5 \xB7 \u672C\u673A\u514D\u8D39\u6E90\uFF08\u975E\u5B98\u65B9\uFF09",
  "market.source.short": "\u514D\u8D39\u6E90",
  "market.source.details": "\u6570\u636E\u4E0E\u9650\u5236",
  "market.source.switch": "\u514D\u8D39\u6E90",
  "market.source.switch-aria": "\u5E02\u573A\u514D\u8D39\u6E90\u5F00\u5173",
  "market.source.enabled": "\u5DF2\u5F00\u542F",
  "market.source.disabled": "\u672A\u5F00\u542F",
  "market.source.forced": "\u7531\u5BBF\u4E3B\u914D\u7F6E\u5F3A\u5236\u5F00\u542F\uFF1B\u79FB\u9664 profile \u4E2D dsh-x-finance \u7684 marketSource \u540E\u624D\u80FD\u5173\u95ED",
  "market.source.unavailable": "\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u5F00\u5173\uFF1B\u8BF7\u4F7F\u7528\u4E0B\u9762\u7684\u624B\u52A8\u914D\u7F6E\u3002",
  "market.source.preference-error": "\u65E0\u6CD5\u4FDD\u5B58\u5E02\u573A\u6E90\u5F00\u5173\uFF0C\u8BF7\u68C0\u67E5 profile \u76EE\u5F55\u6743\u9650\u3002",
  "market.source.persist": "\u5F00\u5173\u4FDD\u5B58\u5728\u5F53\u524D profile \u7684 .dsh-x-finance\uFF0C\u4E0D\u8DE8\u8BBE\u5907\u540C\u6B65\uFF1B\u5173\u95ED\u540E\u505C\u6B62\u5E02\u573A\u8BF7\u6C42\u3002",
  "market.source.limits": "\u514D\u8D39\u6E90\u65E0 SLA\uFF0C\u53EF\u80FD\u5EF6\u8FDF\u3001\u9650\u6D41\u6216\u4E2D\u65AD\uFF1B\u4E0D\u662F\u4EA4\u6613\u6240\u6388\u6743\u884C\u60C5\uFF0C\u4E0D\u5F97\u518D\u5206\u53D1\u6216\u7528\u4E8E\u5546\u4E1A\u5C55\u793A\u3002",
  "market.source.model": "\u60C5\u7EEA\u6307\u6570\u7531\u672C\u63D2\u4EF6\u6309\u516C\u5F00\u5FEB\u7167\u8BA1\u7B97\uFF0C\u4E0D\u662F\u4EA4\u6613\u6240\u6216\u4F9B\u5E94\u5546\u5B98\u65B9\u6307\u6807\u3002",
  "market.source.no-persist": "\u5E02\u573A\u5FEB\u7167\u53EA\u5728\u5BBF\u4E3B\u5185\u5B58\u7F13\u5B58\uFF0C\u4E0D\u5199\u5165\u4F1A\u8BDD\u3001\u81EA\u9009\u6216\u78C1\u76D8\uFF1B\u4E0D\u4E0A\u4F20\u6A21\u578B\u3002",
  "market.not-advice": "\u53EA\u8BFB\u5E02\u573A\u6458\u8981\uFF0C\u4E0D\u6784\u6210\u6295\u8D44\u5EFA\u8BAE\uFF0C\u4E5F\u4E0D\u63D0\u4F9B\u4EA4\u6613\u6216\u4E0B\u5355\u3002",
  "market.unconfigured-title": "\u5E02\u573A\u6570\u636E\u672A\u5F00\u542F",
  "market.unconfigured-body": "\u5E02\u573A\u5168\u666F\u9700\u8981\u672C\u673A\u514D\u8D39\u884C\u60C5\u6E90\uFF08\u817E\u8BAF\uFF0C\u975E\u5B98\u65B9\uFF09\u3002\u5B83\u9ED8\u8BA4\u5173\u95ED\uFF0C\u56E0\u4E3A\u65E0 SLA\u3001\u53EF\u80FD\u9650\u6D41\uFF0C\u4E5F\u4E0D\u4EE3\u8868\u4EA4\u6613\u6240\u6388\u6743\u884C\u60C5\u3002\u6253\u5F00\u4E0B\u9762\u7684\u5F00\u5173\u5373\u53EF\u5728\u672C\u673A\u5F00\u542F\uFF0C\u4E5F\u53EF\u4EE5\u4F7F\u7528\u624B\u52A8\u914D\u7F6E\u3002",
  "market.unconfigured-config": "\u5728\u5F53\u524D profile \u7684 cordis.patch.yml \u4E2D\u4E3A dsh-x-finance \u8BBE\u7F6E marketSource: true\uFF08\u4F1A\u5F3A\u5236\u5F00\u542F\u5E76\u7981\u7528\u5F00\u5173\uFF09\uFF0C\u6216\u542F\u52A8\u5BBF\u4E3B\u524D\u8BBE\u7F6E DSH_X_FINANCE_MARKET_SOURCE=1\u3002",
  "market.unconfigured-manual": "\u624B\u52A8\u914D\u7F6E\uFF08\u53EF\u9009\uFF0C\u9002\u5408 headless \u6216\u56FA\u5B9A\u5F00\u542F\uFF09",
  "market.unconfigured-retry": "\u91CD\u65B0\u68C0\u6D4B",
  "market.loading": "\u6B63\u5728\u83B7\u53D6\u5E02\u573A\u5FEB\u7167\u2026",
  "market.loading-short": "\u52A0\u8F7D\u4E2D",
  "market.error": "\u5E02\u573A\u6570\u636E\u6682\u4E0D\u53EF\u7528",
  "market.error-hint": "\u4FDD\u7559\u6700\u8FD1\u4E00\u6B21\u6210\u529F\u5FEB\u7167\uFF1B\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  "market.retry": "\u91CD\u8BD5",
  "market.partial": "\u90E8\u5206\u9875\u9762\u672A\u66F4\u65B0 \xB7 \u8986\u76D6 {covered}/{expected}",
  "market.stale": "\u884C\u60C5\u5EF6\u8FDF",
  "market.no-data": "\u2014",
  "market.status.weekend": "\u5468\u672B\u4F11\u5E02",
  "market.status.preopen": "\u672A\u5F00\u76D8",
  "market.status.auction": "\u96C6\u5408\u7ADE\u4EF7",
  "market.status.open": "\u4EA4\u6613\u4E2D",
  "market.status.lunch": "\u5348\u95F4\u4F11\u5E02",
  "market.status.closed": "\u5DF2\u6536\u76D8",
  "market.status.no-quote": "\u6682\u65E0\u4ECA\u65E5\u884C\u60C5",
  "market.status.hint": "\u6309\u4E0A\u6D77\u5DE5\u4F5C\u65E5\u65F6\u6BB5\u4E0E\u6700\u65B0\u884C\u60C5\u65F6\u95F4\u63A8\u65AD\uFF0C\u4E0D\u8BC6\u522B\u6CD5\u5B9A\u8282\u5047\u65E5\u3002",
  "market.kpi.sentiment": "\u60C5\u7EEA\u6307\u6570",
  "market.kpi.breadth": "\u6DA8\u8DCC\u5BB6\u6570",
  "market.kpi.amount": "\u5168\u5E02\u573A\u6210\u4EA4\u989D",
  "market.kpi.sectors": "\u884C\u4E1A\u6269\u6563",
  "market.kpi.strongest": "\u6700\u5F3A\u884C\u4E1A",
  "market.kpi.status": "\u5E02\u573A\u72B6\u6001",
  "market.kpi.up": "\u4E0A\u6DA8",
  "market.kpi.down": "\u4E0B\u8DCC",
  "market.kpi.flat": "\u5E73\u76D8",
  "market.kpi.flat-suspended": "\u5E73\u76D8 {flat} \xB7 \u505C\u724C {suspended}",
  "market.kpi.positive": "{count}/{total} \u4E2A\u884C\u4E1A\u4E0A\u6DA8",
  "market.kpi.sector-note": "\u7533\u4E07\u4E00\u7EA7 \xB7 \u5747\u6DA8 {avg}",
  "market.kpi.waiting": "\u7B49\u5F85\u5E7F\u5EA6\u6570\u636E",
  "market.kpi.strongest-empty": "\u6682\u65E0",
  "market.sentiment.title": "\u5E02\u573A\u8D2A\u5A6A\u6050\u60E7\u6307\u6570",
  "market.sentiment.subtitle": "\u672C\u5730\u53EF\u89E3\u91CA\u6A21\u578B \xB7 \u975E\u5B98\u65B9\u6307\u6807",
  "market.sentiment.waiting": "\u7B49\u5F85\u4E2A\u80A1\u5E7F\u5EA6\uFF0C\u5148\u6309\u53EF\u7528\u56E0\u5B50\u8BA1\u7B97",
  "market.sentiment.partial": "\u90E8\u5206\u56E0\u5B50",
  "market.sentiment.label.extreme-fear": "\u6781\u5EA6\u6050\u60E7",
  "market.sentiment.label.fear": "\u6050\u60E7",
  "market.sentiment.label.neutral": "\u4E2D\u6027",
  "market.sentiment.label.greed": "\u8D2A\u5A6A",
  "market.sentiment.label.extreme-greed": "\u6781\u5EA6\u8D2A\u5A6A",
  "market.sentiment.factor.index": "\u6307\u6570\u52A8\u91CF",
  "market.sentiment.factor.breadth": "\u4E2A\u80A1\u6269\u6563",
  "market.sentiment.factor.sector": "\u884C\u4E1A\u6269\u6563",
  "market.sentiment.factor.momentum": "\u884C\u4E1A\u52A8\u91CF",
  "market.sentiment.weights": "\u6743\u91CD\uFF1A\u6307\u6570 20% \xB7 \u4E2A\u80A1\u6269\u6563 45% \xB7 \u884C\u4E1A\u6269\u6563 25% \xB7 \u884C\u4E1A\u52A8\u91CF 10%",
  "market.sentiment.method": "\u4E2A\u80A1\u6269\u6563 = \u4E0A\u6DA8\u4E0E\u4E0B\u8DCC\u5BB6\u6570\u4E4B\u5DEE\uFF1B\u884C\u4E1A\u6269\u6563 = \u4E0A\u6DA8\u884C\u4E1A\u5360\u6BD4\uFF1B\u52A8\u91CF\u6309\u5E73\u5747\u6DA8\u8DCC\u5E45\u6620\u5C04\u5230 0\u2013100\u3002",
  "market.sentiment.fear": "\u6050\u60E7",
  "market.sentiment.greed": "\u8D2A\u5A6A",
  "market.indices.title": "\u5927\u76D8\u4E0E\u6E2F\u80A1\u6307\u6570",
  "market.indices.subtitle": "\u6700\u65B0\u5FEB\u7167 \xB7 \u4EA4\u6613\u6240\u5F53\u5730\u65F6\u95F4",
  "market.indices.empty": "\u6682\u65E0\u6307\u6570\u5FEB\u7167",
  "market.indices.hk-note": "\u6E2F\u80A1\u6307\u6570\u6309\u9999\u6E2F\u65F6\u95F4\u663E\u793A\uFF1B\u6E90\u672A\u58F0\u660E\u6210\u4EA4\u989D\u5E01\u79CD\uFF0C\u6545\u7559\u7A7A\u3002",
  "market.indices.csi2000-note": "\u4E2D\u8BC12000 \u7531\u4E1C\u65B9\u8D22\u5BCC\u516C\u5F00\u63A5\u53E3\u8865\u5145\u3002",
  "market.indices.csi2000-missing": "\u4E2D\u8BC12000 \u6682\u672A\u7531\u4E1C\u65B9\u8D22\u5BCC\u8FD4\u56DE\uFF1B\u672C\u6B21\u4E0D\u663E\u793A\u8BE5\u5361\u7247\u3002",
  "market.indices.amount": "\u6210\u4EA4\u989D {amount}",
  "market.indices.range": "\u4ECA\u65E5\u533A\u95F4",
  "market.indices.open-label": "\u5F00",
  "market.indices.high": "\u9AD8 {value}",
  "market.indices.low": "\u4F4E {value}",
  "market.indices.previous-label": "\u6628\u6536",
  "market.heatmap.title": "A \u80A1\u5168\u666F\u70ED\u529B\u56FE",
  "market.heatmap.subtitle": "{level1} \u4E2A\u4E00\u7EA7\u884C\u4E1A \xB7 {level2} \u4E2A\u4E8C\u7EA7\u884C\u4E1A \xB7 \u9762\u79EF\u6309\u603B\u5E02\u503C",
  "market.heatmap.aria": "\u7533\u4E07\u884C\u4E1A\u70ED\u529B\u56FE\uFF0C\u70B9\u51FB\u884C\u4E1A\u67E5\u770B\u6210\u5206\u80A1",
  "market.heatmap.legend": "\u8DCC / \u5E73 / \u6DA8",
  "market.heatmap.group": "{name} {change}",
  "market.heatmap.tile": "{name} {change}\uFF0C\u6210\u4EA4\u989D {amount}",
  "market.heatmap.table": "\u67E5\u770B\u884C\u4E1A\u6570\u636E\u8868",
  "market.heatmap.table-caption": "\u7533\u4E07\u884C\u4E1A\u5FEB\u7167",
  "market.heatmap.table.name": "\u884C\u4E1A",
  "market.heatmap.table.change": "\u6DA8\u8DCC\u5E45",
  "market.heatmap.table.amount": "\u6210\u4EA4\u989D",
  "market.heatmap.table.cap": "\u603B\u5E02\u503C",
  "market.heatmap.table.leader": "\u9F99\u5934",
  "market.heatmap.table.empty": "\u6682\u65E0\u884C\u4E1A\u6570\u636E",
  "market.heatmap.loading": "\u6B63\u5728\u52A0\u8F7D\u884C\u4E1A\u5FEB\u7167\u2026",
  "market.heatmap.other": "\u5176\u4ED6",
  "market.heatmap.hint": "\u70B9\u51FB\u884C\u4E1A\u67E5\u770B\u6210\u4EA4\u989D\u524D 200 \u53EA\u6210\u5206\u80A1\uFF1B\u989C\u8272\u8D8A\u6DF1\uFF0C\u6DA8\u8DCC\u5E45\u8D8A\u5927\u3002",
  "market.breadth.title": "\u6DA8\u8DCC\u5206\u5E03",
  "market.breadth.subtitle": "\u8986\u76D6 {covered}/{expected} \u53EA A \u80A1",
  "market.breadth.up": "\u4E0A\u6DA8",
  "market.breadth.down": "\u4E0B\u8DCC",
  "market.breadth.flat": "\u5E73\u76D8",
  "market.breadth.suspended": "\u505C\u724C {count}",
  "market.breadth.amount": "\u6210\u4EA4\u989D {amount}",
  "market.breadth.up-share": "\u4E0A\u6DA8\u5360\u6BD4 {value}",
  "market.breadth.waiting": "\u6B63\u5728\u7EDF\u8BA1\u5168\u5E02\u573A\u6DA8\u8DCC\u5BB6\u6570\u2026",
  "market.breadth.table": "\u5206\u5E03\u660E\u7EC6",
  "market.breadth.range": "\u533A\u95F4",
  "market.breadth.count": "\u5BB6\u6570",
  "market.breadth.bucket": "{from}% ~ {to}%",
  "market.breadth.bucket.lt": "\u4F4E\u4E8E {to}%",
  "market.breadth.bucket.gt": "\u9AD8\u4E8E {from}%",
  "market.breadth.bucket.zero": "0%",
  "market.breadth.empty": "\u6682\u65E0\u5E7F\u5EA6\u6570\u636E",
  "market.movers.title": "\u6DA8\u5E45\u524D\u5217",
  "market.movers.losers": "\u8DCC\u5E45\u524D\u5217",
  "market.movers.amount": "\u6210\u4EA4\u989D\u524D\u5217",
  "market.movers.subtitle": "\u6309\u6DA8\u8DCC\u5E45\u6392\u5E8F \xB7 \u542B\u65B0\u80A1/ST",
  "market.movers.name": "\u540D\u79F0",
  "market.movers.price": "\u6700\u65B0",
  "market.movers.change": "\u6DA8\u8DCC\u5E45",
  "market.movers.turnover": "\u6210\u4EA4\u989D",
  "market.movers.empty": "\u6682\u65E0\u6570\u636E",
  "market.movers.waiting": "\u6B63\u5728\u52A0\u8F7D\u4E2A\u80A1\u5FEB\u7167\u2026",
  "market.detail.title": "\u884C\u4E1A\u6210\u5206",
  "market.detail.subtitle": "{name} \xB7 {code}",
  "market.detail.total": "\u5171 {count} \u53EA \xB7 \u5C55\u793A\u6210\u4EA4\u989D\u524D {shown} \u53EA",
  "market.detail.loading": "\u6B63\u5728\u52A0\u8F7D\u6210\u5206\u80A1\u2026",
  "market.detail.error": "\u6210\u5206\u80A1\u6682\u4E0D\u53EF\u7528",
  "market.detail.retry": "\u91CD\u8BD5",
  "market.detail.close": "\u6536\u8D77",
  "market.detail.open": "\u67E5\u770B\u6210\u5206\u80A1",
  "market.detail.stock": "\u80A1\u7968",
  "market.detail.price": "\u6700\u65B0",
  "market.detail.change": "\u6DA8\u8DCC",
  "market.detail.amount": "\u6210\u4EA4\u989D",
  "market.detail.cap": "\u5E02\u503C",
  "market.detail.empty": "\u6682\u65E0\u6210\u5206\u80A1\u6570\u636E",
  "market.detail.chart-aria": "{name} \u6210\u5206\u80A1\u70ED\u529B\u56FE",
  "market.detail.leader": "\u9F99\u5934 {name} {change}",
  "market.detail.notice": "\u4EC5\u5C55\u793A\u6210\u4EA4\u989D\u524D 200 \u53EA\uFF0C\u4E0D\u4EE3\u8868\u884C\u4E1A\u5168\u90E8\u6210\u5206\u80A1\uFF1B\u6570\u636E\u6765\u81EA\u514D\u8D39\u6E90\u3002",
  "market.detail.stats": "\u6DA8\u8DCC\u5E45 {change} \xB7 \u6210\u4EA4\u989D {amount} \xB7 \u603B\u5E02\u503C {cap}",
  "market.drill.title": "\u67E5\u770B {name} \u7684\u8BE6\u60C5\u4E0E\u65E5 K",
  "market.drill.index-title": "\u67E5\u770B {name} \u7684\u65E5 K",
  "market.drill.open-chart": "\u65E5 K \u4E0E\u91CF\u5316",
  "market.drill.quant-jump": "\u8DF3\u5230\u91CF\u5316\u5206\u6790",
  "market.drill.index-hint": "\u70B9\u51FB A \u80A1\u6307\u6570\u5361\u7247\uFF08\u542B\u70B9\u4F4D\uFF09\u53EF\u5C55\u5F00\u65E5 K \u4E0E\u91CF\u5316\u5206\u6790\uFF1B\u6E2F\u80A1\u6307\u6570\u4E0E\u4E2D\u8BC12000 \u4EC5\u663E\u793A\u884C\u60C5\uFF0C\u4E0D\u5199\u5165 A \u80A1\u81EA\u9009\u3002",
  "market.drill.index-chart": "{name} \u65E5 K",
  "market.drill.index-chart-note": "\u6307\u6570\u65E5 K \u6765\u81EA\u540C\u4E00\u4E2A\u672C\u673A\u514D\u8D39\u6E90\uFF1B\u6210\u4EA4\u91CF\u4E3A\u6307\u6570\u6210\u4EA4\u91CF\u53E3\u5F84\uFF0C\u4E0D\u4EE3\u8868\u53EF\u4EA4\u6613\u4EFD\u989D\u3002",
  "market.drill.open": "\u67E5\u770B\u8BE6\u60C5",
  "market.drill.aria": "\u67E5\u770B {name} \u7684\u8BE6\u60C5\u4E0E\u65E5 K",
  "market.drill.column": "\u64CD\u4F5C",
  "market.drill.hint": "\u70B9\u51FB\u6DA8\u5E45/\u6210\u4EA4\u989D\u699C\u6216\u6210\u5206\u80A1\u53EF\u76F4\u63A5\u8FDB\u5165\u8BE5\u80A1\u8BE6\u60C5\u4E0E\u65E5 K\uFF1B\u672A\u52A0\u5165\u81EA\u9009\u7684\u80A1\u7968\u4F1A\u5148\u52A0\u5165\u81EA\u9009\uFF08\u4E0D\u56FA\u5B9A\uFF09\u5E76\u6253\u5F00\u3002",
  "market.drill.added": "\u5DF2\u52A0\u5165\u81EA\u9009\u5E76\u6253\u5F00 {name} \u7684\u65E5 K\u3002",
  "market.drill.opened": "\u5DF2\u6253\u5F00 {name} \u7684\u8BE6\u60C5\u4E0E\u65E5 K\u3002",
  "market.drill.no-symbol": "\u8BE5\u6761\u76EE\u6CA1\u6709\u53EF\u4E0B\u94BB\u7684\u80A1\u7968\u4EE3\u7801\u3002"
};
var marketEn = {
  "page.view.watchlist": "Watchlist",
  "page.view.market": "Market",
  "page.view.aria": "Stock page view",
  "page.view.market-hint": "Open market panorama",
  "market.title": "Market panorama",
  "market.subtitle": "Indices, breadth, Shenwan industry heat and a sentiment snapshot",
  "market.refresh": "Refresh",
  "market.refreshing": "Refreshing\u2026",
  "market.updated": "Updated {time}",
  "market.quote-time": "Quote {time}",
  "market.source": "Tencent quotes \xB7 local free source (unofficial)",
  "market.source.short": "Free source",
  "market.source.details": "Data and limits",
  "market.source.switch": "Free source",
  "market.source.switch-aria": "Market free source switch",
  "market.source.enabled": "On",
  "market.source.disabled": "Off",
  "market.source.forced": "Forced on by host config; remove marketSource from the profile to disable",
  "market.source.unavailable": "This host does not support the switch; use the manual configuration below.",
  "market.source.preference-error": "Could not save the market source switch. Check profile directory permissions.",
  "market.source.persist": "The switch is stored in this profile\u2019s .dsh-x-finance and does not sync across devices; turning it off stops market requests.",
  "market.source.limits": "No SLA. The free source may be delayed, rate-limited or unavailable. It is not an exchange-licensed feed; do not redistribute it or use it in a commercial display.",
  "market.source.model": "The sentiment score is calculated by this plugin from the public snapshot. It is not an official exchange or vendor index.",
  "market.source.no-persist": "Market snapshots are cached in host memory only. They are not written to the session, watchlist or disk, and are not sent to the model.",
  "market.not-advice": "Read-only market summary. Not investment advice, and no trading or order placement.",
  "market.unconfigured-title": "Market data is off",
  "market.unconfigured-body": "The panorama needs the local free market source (Tencent, unofficial). It is off by default: no SLA, it may be rate-limited, and it is not an exchange-licensed feed. Turn on the switch below for local use, or use manual configuration.",
  "market.unconfigured-config": "Set marketSource: true for dsh-x-finance in this profile\u2019s cordis.patch.yml (this forces the source on and disables the switch), or start the host with DSH_X_FINANCE_MARKET_SOURCE=1.",
  "market.unconfigured-manual": "Manual configuration (optional, for headless or forced-on setups)",
  "market.unconfigured-retry": "Check again",
  "market.loading": "Loading the market snapshot\u2026",
  "market.loading-short": "Loading",
  "market.error": "Market data is unavailable",
  "market.error-hint": "The last successful snapshot is kept. Please retry later.",
  "market.retry": "Retry",
  "market.partial": "Some pages did not update \xB7 {covered}/{expected} covered",
  "market.stale": "Delayed quote",
  "market.no-data": "\u2014",
  "market.status.weekend": "Closed \xB7 weekend",
  "market.status.preopen": "Pre-open",
  "market.status.auction": "Call auction",
  "market.status.open": "Trading",
  "market.status.lunch": "Lunch break",
  "market.status.closed": "Closed",
  "market.status.no-quote": "No quote today",
  "market.status.hint": "Inferred from Shanghai weekday hours and the newest quote. Statutory holidays are not detected.",
  "market.kpi.sentiment": "Sentiment",
  "market.kpi.breadth": "Advancers / decliners",
  "market.kpi.amount": "Market turnover",
  "market.kpi.sectors": "Industry breadth",
  "market.kpi.strongest": "Strongest industry",
  "market.kpi.status": "Market status",
  "market.kpi.up": "Up",
  "market.kpi.down": "Down",
  "market.kpi.flat": "Flat",
  "market.kpi.flat-suspended": "Flat {flat} \xB7 suspended {suspended}",
  "market.kpi.positive": "{count}/{total} industries up",
  "market.kpi.sector-note": "Shenwan L1 \xB7 avg {avg}",
  "market.kpi.waiting": "Waiting for breadth",
  "market.kpi.strongest-empty": "None",
  "market.sentiment.title": "Market greed / fear index",
  "market.sentiment.subtitle": "Local explainable model \xB7 unofficial",
  "market.sentiment.waiting": "Waiting for stock breadth; using available factors",
  "market.sentiment.partial": "Partial factors",
  "market.sentiment.label.extreme-fear": "Extreme fear",
  "market.sentiment.label.fear": "Fear",
  "market.sentiment.label.neutral": "Neutral",
  "market.sentiment.label.greed": "Greed",
  "market.sentiment.label.extreme-greed": "Extreme greed",
  "market.sentiment.factor.index": "Index momentum",
  "market.sentiment.factor.breadth": "Stock breadth",
  "market.sentiment.factor.sector": "Industry breadth",
  "market.sentiment.factor.momentum": "Industry momentum",
  "market.sentiment.weights": "Weights: index 20% \xB7 stock breadth 45% \xB7 industry breadth 25% \xB7 industry momentum 10%",
  "market.sentiment.method": "Stock breadth uses advancers minus decliners; industry breadth is the share of rising industries; momentum maps average change to 0\u2013100.",
  "market.sentiment.fear": "Fear",
  "market.sentiment.greed": "Greed",
  "market.indices.title": "Mainland & HK indices",
  "market.indices.subtitle": "Latest snapshot \xB7 exchange local time",
  "market.indices.empty": "No index snapshot",
  "market.indices.hk-note": "HK indices show Hong Kong time; turnover stays blank because the source does not state its currency.",
  "market.indices.csi2000-note": "CSI 2000 is supplemented by East Money\u2019s public endpoint.",
  "market.indices.csi2000-missing": "CSI 2000 was not returned by East Money this time, so its card is omitted.",
  "market.indices.amount": "Turnover {amount}",
  "market.indices.range": "Day range",
  "market.indices.open-label": "O",
  "market.indices.high": "H {value}",
  "market.indices.low": "L {value}",
  "market.indices.previous-label": "Prev",
  "market.heatmap.title": "A-share heatmap",
  "market.heatmap.subtitle": "{level1} level-1 \xB7 {level2} level-2 industries \xB7 area by market cap",
  "market.heatmap.aria": "Shenwan industry heatmap. Select an industry to inspect constituents.",
  "market.heatmap.legend": "Down / flat / up",
  "market.heatmap.group": "{name} {change}",
  "market.heatmap.tile": "{name} {change}, turnover {amount}",
  "market.heatmap.table": "View industry data table",
  "market.heatmap.table-caption": "Shenwan industry snapshot",
  "market.heatmap.table.name": "Industry",
  "market.heatmap.table.change": "Change",
  "market.heatmap.table.amount": "Turnover",
  "market.heatmap.table.cap": "Market cap",
  "market.heatmap.table.leader": "Leader",
  "market.heatmap.table.empty": "No industry data",
  "market.heatmap.loading": "Loading the industry snapshot\u2026",
  "market.heatmap.other": "Other",
  "market.heatmap.hint": "Select an industry to see its top 200 constituents by turnover. Deeper colour means a larger move.",
  "market.breadth.title": "Advance / decline distribution",
  "market.breadth.subtitle": "{covered}/{expected} A-shares covered",
  "market.breadth.up": "Advancers",
  "market.breadth.down": "Decliners",
  "market.breadth.flat": "Flat",
  "market.breadth.suspended": "Suspended {count}",
  "market.breadth.amount": "Turnover {amount}",
  "market.breadth.up-share": "Advance share {value}",
  "market.breadth.waiting": "Counting the full-market advance / decline split\u2026",
  "market.breadth.table": "Distribution details",
  "market.breadth.range": "Range",
  "market.breadth.count": "Count",
  "market.breadth.bucket": "{from}% to {to}%",
  "market.breadth.bucket.lt": "Below {to}%",
  "market.breadth.bucket.gt": "Above {from}%",
  "market.breadth.bucket.zero": "0%",
  "market.breadth.empty": "No breadth data",
  "market.movers.title": "Top gainers",
  "market.movers.losers": "Top losers",
  "market.movers.amount": "Top turnover",
  "market.movers.subtitle": "Sorted by change \xB7 includes new listings / ST",
  "market.movers.name": "Name",
  "market.movers.price": "Last",
  "market.movers.change": "Change",
  "market.movers.turnover": "Turnover",
  "market.movers.empty": "No data",
  "market.movers.waiting": "Loading the stock snapshot\u2026",
  "market.detail.title": "Industry constituents",
  "market.detail.subtitle": "{name} \xB7 {code}",
  "market.detail.total": "{count} stocks \xB7 top {shown} by turnover",
  "market.detail.loading": "Loading constituents\u2026",
  "market.detail.error": "Constituents are unavailable",
  "market.detail.retry": "Retry",
  "market.detail.close": "Collapse",
  "market.detail.open": "View constituents",
  "market.detail.stock": "Stock",
  "market.detail.price": "Last",
  "market.detail.change": "Change",
  "market.detail.amount": "Turnover",
  "market.detail.cap": "Market cap",
  "market.detail.empty": "No constituent data",
  "market.detail.chart-aria": "{name} constituent heatmap",
  "market.detail.leader": "Leader {name} {change}",
  "market.detail.notice": "Shows only the top 200 by turnover, not every constituent. Data comes from the free source.",
  "market.detail.stats": "Change {change} \xB7 turnover {amount} \xB7 market cap {cap}",
  "market.drill.title": "Open details and daily bars for {name}",
  "market.drill.index-title": "Open daily bars for {name}",
  "market.drill.open-chart": "Chart & quant",
  "market.drill.quant-jump": "Jump to quant",
  "market.drill.index-hint": "Select a mainland index card (including the value) to expand its daily chart and quantitative panel; HK indices and CSI 2000 show quotes only and never enter the A-share watchlist.",
  "market.drill.index-chart": "{name} daily bars",
  "market.drill.index-chart-note": "Index daily bars come from the same local free source; volume is the index volume, not tradable units.",
  "market.drill.open": "Details",
  "market.drill.aria": "Open details and daily bars for {name}",
  "market.drill.column": "Action",
  "market.drill.hint": "Select a gainer/turnover row or a constituent to open its details and daily chart. A stock that is not on the watchlist yet is added to it (unfixed) and opened.",
  "market.drill.added": "Added {name} to the watchlist and opened its daily chart.",
  "market.drill.opened": "Opened details and daily bars for {name}.",
  "market.drill.no-symbol": "This entry has no stock code to drill into."
};

// src/client/gold-locales.ts
var goldZh = {
  "gold.title": "\u9EC4\u91D1",
  "gold.subtitle": "\u4F26\u6566\u91D1\u3001\u7EBD\u7EA6\u671F\u91D1\u4E0E\u4E0A\u6D77\u91D1\u4EF7\u7684\u5FEB\u7167\u548C\u533A\u95F4\u53D8\u5316",
  "gold.view.tab": "\u9EC4\u91D1",
  "gold.source": "\u65B0\u6D6A\u8D22\u7ECF \xB7 \u672C\u673A\u514D\u8D39\u6E90\uFF08\u975E\u5B98\u65B9\uFF09",
  "gold.refresh": "\u5237\u65B0",
  "gold.refreshing": "\u66F4\u65B0\u4E2D\u2026",
  "gold.updated": "\u66F4\u65B0\u4E8E {time}",
  "gold.quoting": "\u884C\u60C5\u65F6\u95F4 {time}",
  "gold.loading": "\u6B63\u5728\u8BFB\u53D6\u9EC4\u91D1\u884C\u60C5\u2026",
  "gold.unavailable": "\u9EC4\u91D1\u884C\u60C5\u6682\u4E0D\u53EF\u7528",
  "gold.unavailable-hint": "\u4E0B\u65B9\u4E3A\u4E0A\u4E00\u6B21\u6210\u529F\u8BFB\u53D6\u7684\u6570\u636E\uFF0C\u5DF2\u6807\u6CE8\u65E7\u6570\u636E\uFF1B\u6062\u590D\u540E\u81EA\u52A8\u5237\u65B0\u3002",
  "gold.off-title": "\u9EC4\u91D1\u884C\u60C5\u672A\u5F00\u542F",
  "gold.off-notice": "\u9EC4\u91D1\u9762\u677F\u4E0E A \u80A1\u5171\u7528\u540C\u4E00\u4E2A\u672C\u673A\u514D\u8D39\u6E90\uFF08\u516C\u5F00\u63A5\u53E3\uFF0C\u975E\u5B98\u65B9\u3001\u65E0 SLA\uFF09\u3002\u5F00\u542F\u540E\u624D\u4F1A\u8BF7\u6C42\u65B0\u6D6A\u884C\u60C5\uFF1B\u5173\u95ED\u65F6\u4E0D\u4F1A\u53D1\u51FA\u4EFB\u4F55\u8BF7\u6C42\u3002",
  "gold.stale": "\u65E7",
  "gold.unit.usd-ounce": "\u7F8E\u5143/\u76CE\u53F8",
  "gold.unit.cny-gram": "\u5143/\u514B",
  "gold.unit.cny-usd": "\u4EBA\u6C11\u5E01/\u7F8E\u5143",
  "gold.key.XAU": "\u4F26\u6566\u91D1",
  "gold.key.GC": "\u7EBD\u7EA6\u671F\u91D1",
  "gold.key.SI": "\u7EBD\u7EA6\u767D\u94F6",
  "gold.key.AU9999": "\u6CAA\u91D199",
  "gold.key.AUTD": "\u9EC4\u91D1\u5EF6\u671F",
  "gold.key.USDCNH": "\u79BB\u5CB8\u4EBA\u6C11\u5E01",
  "gold.metric.open": "\u5F00\u76D8",
  "gold.metric.high": "\u6700\u9AD8",
  "gold.metric.low": "\u6700\u4F4E",
  "gold.metric.previous": "\u6628\u6536",
  "gold.metric.amplitude": "\u632F\u5E45",
  "gold.derived.title": "\u6298\u7B97\u4E0E\u4EF7\u5DEE",
  "gold.derived.london": "\u4F26\u6566\u91D1\u6298\u7B97",
  "gold.derived.premium": "\u6CAA\u4F26\u4EF7\u5DEE",
  "gold.derived.ratio": "\u91D1\u94F6\u6BD4",
  "gold.derived.formula": "\u6298\u7B97 = \u4F26\u6566\u91D1\uFF08\u7F8E\u5143/\u76CE\u53F8\uFF09\xD7 \u79BB\u5CB8\u4EBA\u6C11\u5E01 \xF7 31.1035\uFF1B\u4EF7\u5DEE\u53EA\u505A\u53E3\u5F84\u5BF9\u7167\uFF0C\u4E0D\u4EE3\u8868\u53EF\u5957\u5229\u3002",
  "gold.ranges.title": "\u533A\u95F4\u53D8\u5316",
  "gold.range.5d": "5\u65E5",
  "gold.range.20d": "20\u65E5",
  "gold.range.60d": "60\u65E5",
  "gold.range.ytd": "\u5E74\u521D\u81F3\u4ECA",
  "gold.range.high52w": "52\u5468\u9AD8",
  "gold.range.low52w": "52\u5468\u4F4E",
  "gold.range.drawdown": "\u8DDD\u9AD8\u70B9",
  "gold.range.incomplete": "\u90E8\u5206\u65E5\u7EBF\u6682\u4E0D\u53EF\u7528\uFF0C\u5BF9\u5E94\u533A\u95F4\u7559\u7A7A\uFF0C\u4E0D\u4F30\u7B97\u586B\u8865\u3002",
  "gold.series.note": "\u533A\u95F4\u6DA8\u8DCC\u6309\u65E5\u7EBF\u6536\u76D8\u8BA1\u7B97\u5E76\u542B\u5F53\u65E5\uFF1B\u65E5\u7EBF\u6765\u81EA\u65B0\u6D6A\u5168\u7403\u671F\u8D27\u63A5\u53E3\uFF0C\u975E\u4EA4\u6613\u6240\u6388\u6743\u6570\u636E\u3002",
  "gold.notes.summary": "\u53E3\u5F84\u4E0E\u9650\u5236",
  "gold.notes.unit": "\u4F26\u6566\u91D1\u4E0E\u7EBD\u7EA6\u671F\u91D1\u6309\u7F8E\u5143/\u76CE\u53F8\u62A5\u4EF7\uFF0C\u6CAA\u91D1\u4E0E\u9EC4\u91D1\u5EF6\u671F\u6309\u5143/\u514B\uFF1B\u6E90\u672A\u58F0\u660E\u7684\u5E01\u79CD\u4E0D\u63A8\u65AD\u3002",
  "gold.notes.hours": "\u9EC4\u91D1\u63A5\u8FD1 24 \u5C0F\u65F6\u4EA4\u6613\uFF0CA \u80A1\u6BCF\u5929\u53EA\u6709 4 \u5C0F\u65F6\uFF0C\u4E24\u4E2A\u5E02\u573A\u7684\u65F6\u95F4\u4E0D\u80FD\u76F4\u63A5\u5BF9\u9F50\u3002",
  "gold.notes.delay": "\u516C\u5F00\u63A5\u53E3\u53EF\u80FD\u5EF6\u8FDF\u3001\u9650\u6D41\u6216\u4E2D\u65AD\uFF1B\u4E0D\u662F\u4EA4\u6613\u6240\u6388\u6743\u884C\u60C5\uFF0C\u4E0D\u5F97\u518D\u5206\u53D1\u6216\u7528\u4E8E\u5546\u4E1A\u5C55\u793A\u3002",
  "gold.notes.advice": "\u8FD9\u91CC\u53EA\u5C55\u793A\u53EF\u6838\u5BF9\u7684\u4EF7\u683C\u4E0E\u533A\u95F4\u6570\u5B57\uFF0C\u4E0D\u751F\u6210\u89E3\u8BFB\u6216\u6295\u8D44\u5EFA\u8BAE\u3002",
  "gold.notes.events": "\u5B8F\u89C2\u4E8B\u4EF6\u4E0E\u70ED\u70B9\u8BF7\u5728\u5BF9\u8BDD\u91CC\u76F4\u63A5\u63D0\u95EE\uFF1B\u63D2\u4EF6\u4E0D\u6293\u53D6\u65B0\u95FB\uFF0C\u4E5F\u4E0D\u7ED9\u4E8B\u4EF6\u5F52\u56E0\u3002"
};
var goldEn = {
  "gold.title": "Gold",
  "gold.subtitle": "Snapshots and range moves for London gold, COMEX gold and Shanghai gold",
  "gold.view.tab": "Gold",
  "gold.source": "Sina Finance \xB7 local free source (unofficial)",
  "gold.refresh": "Refresh",
  "gold.refreshing": "Updating\u2026",
  "gold.updated": "Updated {time}",
  "gold.quoting": "Quote time {time}",
  "gold.loading": "Loading gold quotes\u2026",
  "gold.unavailable": "Gold quotes are unavailable",
  "gold.unavailable-hint": "Showing the last successful read, marked stale; polling resumes automatically.",
  "gold.off-title": "Gold quotes are off",
  "gold.off-notice": "The gold panel shares the single local free-source switch with A-shares (public endpoints, unofficial, no SLA). Nothing is requested until it is on.",
  "gold.stale": "stale",
  "gold.unit.usd-ounce": "USD/oz",
  "gold.unit.cny-gram": "CNY/g",
  "gold.unit.cny-usd": "CNY/USD",
  "gold.key.XAU": "London gold",
  "gold.key.GC": "COMEX gold",
  "gold.key.SI": "COMEX silver",
  "gold.key.AU9999": "SGE Au99.99",
  "gold.key.AUTD": "SGE Au(T+D)",
  "gold.key.USDCNH": "Offshore CNY",
  "gold.metric.open": "Open",
  "gold.metric.high": "High",
  "gold.metric.low": "Low",
  "gold.metric.previous": "Prev close",
  "gold.metric.amplitude": "Range",
  "gold.derived.title": "Restatement and spread",
  "gold.derived.london": "London gold in CNY/g",
  "gold.derived.premium": "Shanghai premium",
  "gold.derived.ratio": "Gold/silver ratio",
  "gold.derived.formula": "Restatement = London gold (USD/oz) \xD7 offshore CNY \xF7 31.1035. The spread is a unit comparison, not an arbitrage claim.",
  "gold.ranges.title": "Range moves",
  "gold.range.5d": "5D",
  "gold.range.20d": "20D",
  "gold.range.60d": "60D",
  "gold.range.ytd": "YTD",
  "gold.range.high52w": "52W high",
  "gold.range.low52w": "52W low",
  "gold.range.drawdown": "From high",
  "gold.range.incomplete": "Some daily series are unavailable; those ranges stay empty rather than estimated.",
  "gold.series.note": "Range moves use daily closes including today; the series comes from Sina\u2019s global futures endpoint, not a licensed feed.",
  "gold.notes.summary": "Units and limits",
  "gold.notes.unit": "London and COMEX gold are quoted in USD/oz; SGE gold and Au(T+D) in CNY/g. A currency the source does not state is never inferred.",
  "gold.notes.hours": "Gold trades almost around the clock while A-shares trade four hours a day; the two sessions do not align directly.",
  "gold.notes.delay": "A public endpoint can delay, throttle or break; it is not licensed exchange data and must not be redistributed or shown commercially.",
  "gold.notes.advice": "Only checkable prices and ranges are shown here; no interpretation and no investment advice.",
  "gold.notes.events": "Ask about macro events in the conversation; the plugin does not fetch news or attribute moves to events."
};

// src/client/global-locales.ts
var globalZh = {
  "global.view.tab": "\u5168\u7403",
  "global.title": "\u5168\u7403\u5E02\u573A",
  "global.subtitle": "\u7F8E\u56FD\u3001\u65E5\u672C\u3001\u97E9\u56FD\u3001\u6B27\u6D32\u4E0E\u4E9A\u592A\u4E3B\u8981\u80A1\u6307",
  "global.loading": "\u6B63\u5728\u83B7\u53D6\u5168\u7403\u6307\u6570\u5FEB\u7167\u2026",
  "global.quote-time": "\u884C\u60C5\u65F6\u95F4 {time}",
  "global.time-unknown": "\u884C\u60C5\u65F6\u95F4\u672A\u77E5",
  "global.coverage": "\u5171 {count} \u4E2A\u6307\u6570 \xB7 {regions} \u4E2A\u5730\u533A",
  "global.kpi.updown": "\u4E0A\u6DA8 / \u4E0B\u8DCC",
  "global.kpi.coverage": "{count} \u4E2A\u6307\u6570\u6709\u62A5\u4EF7",
  "global.kpi.strongest": "\u6700\u5F3A\u6307\u6570",
  "global.kpi.weakest": "\u6700\u5F31\u6307\u6570",
  "global.kpi.regions": "\u8986\u76D6\u5730\u533A",
  "global.kpi.regions-note": "\u4EC5\u7EDF\u8BA1\u6E90\u5B9E\u9645\u8FD4\u56DE\u7684\u6307\u6570",
  "global.section.count": "{count} \u4E2A\u6307\u6570",
  "global.section.average": "\u7B49\u6743\u5747\u6DA8 {value}",
  "global.empty": "\u8BE5\u5730\u533A\u6682\u65E0\u884C\u60C5",
  "global.range": "\u4ECA\u65E5\u533A\u95F4",
  "global.high": "\u9AD8 {value}",
  "global.low": "\u4F4E {value}",
  "global.open": "\u5F00",
  "global.previous": "\u6628\u6536",
  "global.table": "\u67E5\u770B\u5168\u90E8\u6307\u6570\u6570\u636E\u8868",
  "global.table.caption": "\u5168\u7403\u4E3B\u8981\u80A1\u6307",
  "global.table.name": "\u6307\u6570",
  "global.table.region": "\u5730\u533A",
  "global.table.price": "\u6700\u65B0",
  "global.table.change": "\u6DA8\u8DCC",
  "global.table.percent": "\u6DA8\u8DCC\u5E45",
  "global.table.open": "\u5F00",
  "global.table.high": "\u9AD8",
  "global.table.low": "\u4F4E",
  "global.table.previous": "\u6628\u6536",
  "global.table.time": "\u884C\u60C5\u65F6\u95F4\uFF08\u5F53\u5730\uFF09",
  "global.timezone-note": "\u884C\u60C5\u65F6\u95F4\u6309\u5404\u4EA4\u6613\u6240\u5F53\u5730\u65F6\u95F4\u663E\u793A\uFF1B\u4F11\u5E02\u6216\u5EF6\u8FDF\u65F6\u663E\u793A\u6700\u8FD1\u4E00\u7B14\u62A5\u4EF7\u3002",
  "global.unconfigured-title": "\u5168\u7403\u884C\u60C5\u672A\u5F00\u542F",
  "global.unconfigured-body": "\u5168\u7403\u6307\u6570\u4E0E A \u80A1\u5E02\u573A\u9875\u5171\u7528\u540C\u4E00\u4E2A\u672C\u673A\u514D\u8D39\u6E90\uFF08\u4E1C\u65B9\u8D22\u5BCC/\u817E\u8BAF\u516C\u5F00\u63A5\u53E3\uFF0C\u975E\u5B98\u65B9\u3001\u65E0 SLA\uFF09\u3002\u5F00\u542F\u540E\u624D\u4F1A\u8BF7\u6C42\uFF0C\u5173\u95ED\u540E\u7ACB\u5373\u505C\u6B62\u3002",
  "global.source.note": "\u5168\u7403\u6307\u6570\u6765\u81EA\u4E1C\u65B9\u8D22\u5BCC\u516C\u5F00\u63A5\u53E3\uFF08\u975E\u5B98\u65B9\u3001\u65E0 SLA\uFF09\uFF0C\u4E0E A \u80A1\u5E02\u573A\u9875\u5171\u7528\u540C\u4E00\u4E2A\u5F00\u5173\uFF1B\u4E0D\u6784\u6210\u6295\u8D44\u5EFA\u8BAE\u3002",
  "global.error": "\u5168\u7403\u6307\u6570\u6682\u4E0D\u53EF\u7528",
  "global.region.americas": "\u7F8E\u6D32",
  "global.region.asiaPacific": "\u4E9A\u592A",
  "global.region.europe": "\u6B27\u6D32"
};
var globalEn = {
  "global.view.tab": "Global",
  "global.title": "Global markets",
  "global.subtitle": "Major indices across the US, Japan, Korea, Europe and Asia-Pacific",
  "global.loading": "Loading the global index snapshot\u2026",
  "global.quote-time": "Quote {time}",
  "global.time-unknown": "Quote time unknown",
  "global.coverage": "{count} indices \xB7 {regions} regions",
  "global.kpi.updown": "Up / down",
  "global.kpi.coverage": "{count} indices quoted",
  "global.kpi.strongest": "Strongest index",
  "global.kpi.weakest": "Weakest index",
  "global.kpi.regions": "Regions covered",
  "global.kpi.regions-note": "Only indices actually returned by the source",
  "global.section.count": "{count} indices",
  "global.section.average": "Equal-weight avg {value}",
  "global.empty": "No quotes for this region yet",
  "global.range": "Day range",
  "global.high": "H {value}",
  "global.low": "L {value}",
  "global.open": "Open",
  "global.previous": "Prev",
  "global.table": "View the full index table",
  "global.table.caption": "Major global indices",
  "global.table.name": "Index",
  "global.table.region": "Region",
  "global.table.price": "Last",
  "global.table.change": "Change",
  "global.table.percent": "Change %",
  "global.table.open": "Open",
  "global.table.high": "High",
  "global.table.low": "Low",
  "global.table.previous": "Prev close",
  "global.table.time": "Quote time (local)",
  "global.timezone-note": "Quote times are shown in each exchange\u2019s local time; after the close this is the latest available quote.",
  "global.unconfigured-title": "Global quotes are off",
  "global.unconfigured-body": "Global indices share the same local free source as the A-share market tab (East Money/Tencent public endpoints, unofficial, no SLA). Requests start only after you turn it on and stop when you turn it off.",
  "global.source.note": "Global indices come from East Money\u2019s public endpoint (unofficial, no SLA) and share the A-share market switch. Not investment advice.",
  "global.error": "Global indices are unavailable",
  "global.region.americas": "Americas",
  "global.region.asiaPacific": "Asia-Pacific",
  "global.region.europe": "Europe"
};

// src/client/quant-locales.ts
var quantZh = {
  "quant.title": "\u91CF\u5316\u5206\u6790",
  "quant.subtitle": "\u57FA\u4E8E\u65E5 K \xB7 \u53EA\u8BFB \xB7 \u4E0D\u6784\u6210\u6295\u8D44\u5EFA\u8BAE",
  "quant.sample": "\u6837\u672C {count} \u6839 \xB7 {from} \u2192 {to}",
  "quant.insufficient": "\u6837\u672C\u4E0D\u8DB3\uFF0C\u90E8\u5206\u6307\u6807\u7559\u7A7A",
  "quant.stats": "\u533A\u95F4\u7EDF\u8BA1",
  "quant.total-return": "\u533A\u95F4\u6536\u76CA",
  "quant.cagr": "\u5E74\u5316\u6536\u76CA",
  "quant.cagr-note": "\u6309\u81EA\u7136\u65E5\u590D\u5408",
  "quant.volatility": "\u5E74\u5316\u6CE2\u52A8",
  "quant.drawdown": "\u6700\u5927\u56DE\u64A4",
  "quant.sharpe": "\u590F\u666E\u6BD4\u7387",
  "quant.sharpe-note": "\u65E0\u98CE\u9669\u5229\u7387\u6309 0",
  "quant.winrate": "\u65E5\u80DC\u7387",
  "quant.best-day": "\u6700\u4F73\u5355\u65E5",
  "quant.worst-day": "\u6700\u5DEE\u5355\u65E5",
  "quant.atr": "ATR(14)",
  "quant.atr-note": "\u5360\u6700\u65B0\u4EF7 {value}",
  "quant.rsi": "RSI(14)",
  "quant.boll": "\u5E03\u6797 %B(20,2)",
  "quant.ma20": "\u4EF7\u683C / MA20",
  "quant.ma60": "\u4EF7\u683C / MA60",
  "quant.ma-note": "MA {value}",
  "quant.momentum": "\u52A8\u91CF 20/60/120",
  "quant.range52": "52 \u5468\u533A\u95F4",
  "quant.range52-note": "\u8DDD\u9AD8\u70B9 {value}",
  "quant.correlation": "\u76F8\u5173\u6027 \xB7 {name}",
  "quant.correlation-note": "\u65E5\u6536\u76CA \xB7 {count} \u4E2A\u91CD\u53E0\u4EA4\u6613\u65E5",
  "quant.correlation-none": "\u65E0\u57FA\u51C6\u6570\u636E",
  "quant.monthly": "\u6708\u5EA6\u6536\u76CA",
  "quant.monthly-note": "\u6309\u5F53\u6708\u9996\u672B\u6536\u76D8\u8BA1\u7B97\uFF1B\u672A\u6536\u76D8\u6708\u4EFD\u4EE5 * \u6807\u6CE8",
  "quant.monthly-year": "\u5E74\u4EFD",
  "quant.monthly-partial": "\u672A\u6536\u76D8",
  "quant.backtest": "\u89C4\u5219\u56DE\u6D4B",
  "quant.backtest-note": "\u6536\u76D8\u51FA\u4FE1\u53F7\u3001\u4E0B\u4E00\u4EA4\u6613\u65E5\u5F00\u76D8\u6210\u4EA4\uFF1B\u4EC5\u505A\u591A\u3001\u6EE1\u4ED3\u3001\u65E0\u6760\u6746",
  "quant.rule": "\u89C4\u5219",
  "quant.rule.ma5-20": "MA5 / MA20",
  "quant.rule.ma10-60": "MA10 / MA60",
  "quant.rule.macd": "MACD(12,26,9)",
  "quant.rule.kdj": "KDJ(9,3,3)",
  "quant.commission": "\u624B\u7EED\u8D39\uFF08bp/\u8FB9\uFF09",
  "quant.slippage": "\u6ED1\u70B9\uFF08bp/\u8FB9\uFF09",
  "quant.strategy-return": "\u7B56\u7565\u6536\u76CA",
  "quant.buyhold-return": "\u4E70\u5165\u6301\u6709",
  "quant.trade-count": "\u4EA4\u6613\u6B21\u6570",
  "quant.trade-winrate": "\u80DC\u7387",
  "quant.profit-factor": "\u76C8\u4E8F\u6BD4",
  "quant.profit-factor-note": "\u65E0\u4E8F\u635F\u4EA4\u6613\u65F6\u7559\u7A7A",
  "quant.exposure": "\u5728\u573A\u65F6\u95F4",
  "quant.average-trade": "\u5E73\u5747\u6BCF\u7B14",
  "quant.equity": "\u8D44\u91D1\u66F2\u7EBF",
  "quant.equity-strategy": "\u7B56\u7565",
  "quant.equity-buyhold": "\u4E70\u5165\u6301\u6709",
  "quant.trades": "\u4EA4\u6613\u660E\u7EC6",
  "quant.trade-entry": "\u5165\u573A",
  "quant.trade-exit": "\u51FA\u573A",
  "quant.trade-return": "\u51C0\u6536\u76CA",
  "quant.trade-bars": "\u6301\u6709\u6839\u6570",
  "quant.trade-open": "\u672A\u5E73\u4ED3",
  "quant.no-trades": "\u8BE5\u89C4\u5219\u5728\u6837\u672C\u5185\u6CA1\u6709\u4EA4\u6613",
  "quant.assumptions": "\u5047\u8BBE\u4E0E\u9650\u5236",
  "quant.assumption-1": "\u6536\u76D8\u4FE1\u53F7\u5728\u4E0B\u4E00\u6839\u5F00\u76D8\u6210\u4EA4\uFF1B\u4E70\u5356\u5404\u8BA1\u4E00\u6B21\u624B\u7EED\u8D39\u4E0E\u6ED1\u70B9\u3002",
  "quant.assumption-2": "\u4EC5\u505A\u591A\u3001\u6EE1\u4ED3\u3001\u65E0\u6760\u6746\uFF1B\u4E0D\u8BA1\u5206\u7EA2\u3001\u7A0E\u8D39\u3001\u878D\u8D44\u6210\u672C\uFF0C\u4E5F\u4E0D\u6A21\u62DF\u505C\u724C\u65E0\u6CD5\u6210\u4EA4\u3002",
  "quant.assumption-3": "\u6700\u540E\u4E00\u7B14\u672A\u5E73\u4ED3\u4EA4\u6613\u6309\u6700\u540E\u6536\u76D8\u4EF7\u5356\u51FA\u5E76\u8BA1\u5165\u8D39\u7528\u3002",
  "quant.assumption-4": "\u4E70\u5165\u6301\u6709\u4E3A\u540C\u671F\u6536\u76D8\u4EF7\u6DA8\u5E45\uFF0C\u672A\u8BA1\u8D39\u7528\u3002",
  "quant.formula": "\u516C\u5F0F\u4E0E\u53E3\u5F84",
  "quant.formula-1": "\u5E74\u5316\u6536\u76CA\u6309\u81EA\u7136\u65E5\u590D\u5408\uFF1B\u5E74\u5316\u6CE2\u52A8\u4E0E\u590F\u666E\u6309 252 \u4E2A\u4EA4\u6613\u65E5\uFF1B\u590F\u666E\u65E0\u98CE\u9669\u5229\u7387\u4E3A 0\u3002",
  "quant.formula-2": "\u6700\u5927\u56DE\u64A4\u6309\u6536\u76D8\u4EF7\u5CF0\u8C37\uFF1BATR \u4E0E RSI \u4F7F\u7528 Wilder \u5E73\u6ED1\uFF1B\u5E03\u6797\u5E26\u4E3A 20 \u65E5\u30012 \u500D\u6837\u672C\u6807\u51C6\u5DEE\u3002",
  "quant.formula-3": "\u76F8\u5173\u6027\u4E3A\u4E0E\u57FA\u51C6\u91CD\u53E0\u4EA4\u6613\u65E5\u7684\u65E5\u6536\u76CA Pearson \u7CFB\u6570\uFF1B\u5C11\u4E8E 20 \u4E2A\u6536\u76CA\u6837\u672C\u65F6\u7559\u7A7A\u3002",
  "quant.formula-4": "\u6240\u6709\u6307\u6807\u53EA\u4F7F\u7528\u6837\u672C\u5185\u6570\u636E\uFF0C\u4E0D\u9884\u6D4B\u672A\u6765\uFF0C\u4E0D\u6784\u6210\u6295\u8D44\u5EFA\u8BAE\u3002",
  "quant.empty": "\u6837\u672C\u4E0D\u8DB3\uFF0C\u65E0\u6CD5\u8BA1\u7B97",
  "quant.not-advice": "\u5386\u53F2\u56DE\u653E\u4E0D\u4EE3\u8868\u672A\u6765\u6536\u76CA\uFF1B\u6570\u636E\u6765\u81EA\u672C\u673A\u514D\u8D39\u6E90\uFF0C\u975E\u4EA4\u6613\u6240\u6388\u6743\u884C\u60C5\u3002"
};
var quantEn = {
  "quant.title": "Quantitative analysis",
  "quant.subtitle": "Daily bars \xB7 read-only \xB7 not investment advice",
  "quant.sample": "{count} bars \xB7 {from} \u2192 {to}",
  "quant.insufficient": "Not enough samples; some metrics stay blank",
  "quant.stats": "Range statistics",
  "quant.total-return": "Range return",
  "quant.cagr": "Annualised return",
  "quant.cagr-note": "Compounded by calendar days",
  "quant.volatility": "Annualised volatility",
  "quant.drawdown": "Max drawdown",
  "quant.sharpe": "Sharpe ratio",
  "quant.sharpe-note": "Risk-free rate assumed 0",
  "quant.winrate": "Daily win rate",
  "quant.best-day": "Best day",
  "quant.worst-day": "Worst day",
  "quant.atr": "ATR(14)",
  "quant.atr-note": "{value} of last price",
  "quant.rsi": "RSI(14)",
  "quant.boll": "Bollinger %B(20,2)",
  "quant.ma20": "Price / MA20",
  "quant.ma60": "Price / MA60",
  "quant.ma-note": "MA {value}",
  "quant.momentum": "Momentum 20/60/120",
  "quant.range52": "52-week range",
  "quant.range52-note": "{value} from high",
  "quant.correlation": "Correlation \xB7 {name}",
  "quant.correlation-note": "Daily returns \xB7 {count} overlapping sessions",
  "quant.correlation-none": "No benchmark data",
  "quant.monthly": "Monthly returns",
  "quant.monthly-note": "First-to-last close within each month; a moving month is marked *",
  "quant.monthly-year": "Year",
  "quant.monthly-partial": "Moving month",
  "quant.backtest": "Rule replay",
  "quant.backtest-note": "Signal at the close, fill at the next open; long-only, fully invested, no leverage",
  "quant.rule": "Rule",
  "quant.rule.ma5-20": "MA5 / MA20",
  "quant.rule.ma10-60": "MA10 / MA60",
  "quant.rule.macd": "MACD(12,26,9)",
  "quant.rule.kdj": "KDJ(9,3,3)",
  "quant.commission": "Commission (bp/side)",
  "quant.slippage": "Slippage (bp/side)",
  "quant.strategy-return": "Strategy return",
  "quant.buyhold-return": "Buy & hold",
  "quant.trade-count": "Trades",
  "quant.trade-winrate": "Win rate",
  "quant.profit-factor": "Profit factor",
  "quant.profit-factor-note": "Blank when there are no losing trades",
  "quant.exposure": "Time in market",
  "quant.average-trade": "Average trade",
  "quant.equity": "Equity curve",
  "quant.equity-strategy": "Strategy",
  "quant.equity-buyhold": "Buy & hold",
  "quant.trades": "Trades",
  "quant.trade-entry": "Entry",
  "quant.trade-exit": "Exit",
  "quant.trade-return": "Net return",
  "quant.trade-bars": "Bars held",
  "quant.trade-open": "Open",
  "quant.no-trades": "This rule produced no trades in the sample",
  "quant.assumptions": "Assumptions and limits",
  "quant.assumption-1": "A close signal fills at the next open; commission and slippage apply on both sides.",
  "quant.assumption-2": "Long-only, fully invested, no leverage; no dividends, taxes or financing, and no suspended-market fill simulation.",
  "quant.assumption-3": "A position still open at the end is sold at the last close and charged the exit costs.",
  "quant.assumption-4": "Buy & hold is the close-to-close change over the same window, before costs.",
  "quant.formula": "Formulas and conventions",
  "quant.formula-1": "Annualised return compounds by calendar days; volatility and Sharpe use 252 trading days; Sharpe assumes a 0 risk-free rate.",
  "quant.formula-2": "Drawdown uses closing peaks and troughs; ATR and RSI use Wilder smoothing; Bollinger uses 20 days and 2 sample standard deviations.",
  "quant.formula-3": "Correlation is the Pearson coefficient of aligned daily returns; fewer than 20 return samples stays blank.",
  "quant.formula-4": "Every metric uses only the loaded sample, does not forecast, and is not investment advice.",
  "quant.empty": "Not enough samples to compute",
  "quant.not-advice": "A historical replay is not a forecast; data comes from the local free source, not a licensed exchange feed."
};

// src/quote-messages.ts
var quoteZh = {
  "quote.title": "\u67E5\u8BE2\u80A1\u7968\u62A5\u4EF7",
  "quote.preparing": "\u6B63\u5728\u51C6\u5907\u67E5\u8BE2",
  "quote.running": "\u6B63\u5728\u67E5\u8BE2",
  "quote.done": "\u67E5\u8BE2\u5B8C\u6210",
  "quote.failed": "\u67E5\u8BE2\u5931\u8D25",
  "quote.inspect": "\u67E5\u770B\u8C03\u7528\u8BB0\u5F55",
  "quote.price": "\u4EF7\u683C",
  "quote.open": "\u5F00\u76D8\u4EF7",
  "quote.high": "\u6700\u9AD8\u4EF7",
  "quote.low": "\u6700\u4F4E\u4EF7",
  "quote.previousClose": "\u524D\u6536\u76D8\u4EF7",
  "quote.change": "\u6DA8\u8DCC\u989D",
  "quote.changePercent": "\u6DA8\u8DCC\u5E45",
  "quote.notice": "\u62A5\u4EF7\u53EF\u80FD\u5EF6\u8FDF\u6216\u6765\u81EA\u6700\u8FD1\u4EA4\u6613\u65F6\u6BB5\uFF1B\u83B7\u53D6\u65F6\u95F4\u4E0D\u662F\u62A5\u4EF7\u65F6\u95F4\u3002\u63A5\u53E3\u672A\u63D0\u4F9B\u5E01\u79CD\uFF0C\u4E0D\u80FD\u636E\u6B64\u63A8\u65AD\u5E01\u79CD\u3002\u4E0D\u6784\u6210\u6295\u8D44\u5EFA\u8BAE\u3002",
  "quote.legacy": "\u6B64\u5386\u53F2\u7ED3\u679C\u672A\u5305\u542B\u7ED3\u6784\u5316\u5C55\u793A\u4FE1\u606F\u3002\u4EE5\u4E0B\u4FDD\u7559\u539F\u59CB\u8BB0\u5F55\u3002",
  "quote.error.SYMBOL_LENGTH": "\u80A1\u7968\u4EE3\u7801\u5FC5\u987B\u662F 1\u201332 \u4E2A\u5B57\u7B26\u3002",
  "quote.error.SYMBOL_FORMAT": "\u80A1\u7968\u4EE3\u7801\u53EA\u5141\u8BB8\u82F1\u6587\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u70B9\u548C\u8FDE\u5B57\u7B26\uFF0C\u4F8B\u5982 AAPL \u6216 BRK.B\u3002",
  "quote.error.INVALID_RESPONSE": "\u884C\u60C5\u54CD\u5E94\u683C\u5F0F\u65E0\u6548\u3002",
  "quote.error.PROVIDER_REJECTED": "Finnhub \u62D2\u7EDD\u4E86\u884C\u60C5\u8BF7\u6C42\uFF0C\u8BF7\u68C0\u67E5 API \u5BC6\u94A5\u3001\u8BA2\u9605\u6743\u9650\u548C\u4EE3\u7801\u3002",
  "quote.error.NO_QUOTE": "\u6CA1\u6709\u6709\u6548\u62A5\u4EF7\uFF0C\u8BF7\u68C0\u67E5\u4EE3\u7801\u3001\u5E02\u573A\u8986\u76D6\u8303\u56F4\u548C\u8BA2\u9605\u6743\u9650\u3002",
  "quote.error.INVALID_NUMBER": "\u884C\u60C5\u54CD\u5E94\u5305\u542B\u65E0\u6548\u6570\u503C\u3002",
  "quote.error.INVALID_TIME": "\u884C\u60C5\u54CD\u5E94\u5305\u542B\u65E0\u6548\u62A5\u4EF7\u65F6\u95F4\u3002",
  "quote.error.INVALID_RANGE": "\u884C\u60C5\u6700\u9AD8\u4EF7\u4F4E\u4E8E\u6700\u4F4E\u4EF7\u3002",
  "quote.error.TOO_LARGE": "\u884C\u60C5\u54CD\u5E94\u8D85\u8FC7\u5927\u5C0F\u9650\u5236\u3002",
  "quote.error.NOT_JSON": "\u884C\u60C5\u670D\u52A1\u6CA1\u6709\u8FD4\u56DE JSON\u3002",
  "quote.error.EMPTY": "\u884C\u60C5\u54CD\u5E94\u4E3A\u7A7A\u3002",
  "quote.error.INVALID_JSON": "\u884C\u60C5\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6548 JSON\u3002",
  "quote.error.CANCELLED": "\u884C\u60C5\u67E5\u8BE2\u5DF2\u53D6\u6D88\u3002",
  "quote.error.MISSING_KEY": "\u8BF7\u5728\u8FD0\u884C\u73AF\u5883\u8BBE\u7F6E FINNHUB_API_KEY\uFF1B\u4E0D\u8981\u628A\u5BC6\u94A5\u53D1\u7ED9\u6A21\u578B\u6216\u5199\u8FDB\u4ED3\u5E93\u3002",
  "quote.error.TIMEOUT_CONFIG": "\u884C\u60C5\u8D85\u65F6\u5FC5\u987B\u4E3A 1\u201330000 \u6BEB\u79D2\u3002",
  "quote.error.TIMEOUT": "\u884C\u60C5\u67E5\u8BE2\u8D85\u65F6\u3002",
  "quote.error.RATE_LIMIT": "Finnhub \u8BF7\u6C42\u9650\u6D41\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  "quote.error.AUTH": "Finnhub \u8BA4\u8BC1\u5931\u8D25\u6216\u8BA2\u9605\u65E0\u6743\u8BBF\u95EE\u8BE5\u884C\u60C5\u3002",
  "quote.error.HTTP": "\u884C\u60C5\u670D\u52A1\u8FD4\u56DE\u4E86 HTTP \u9519\u8BEF\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  "quote.error.CONNECTION": "\u884C\u60C5\u67E5\u8BE2\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u6216\u7A0D\u540E\u91CD\u8BD5\u3002",
  "quote.error.UNKNOWN": "\u67E5\u8BE2\u672A\u5B8C\u6210\u3002\u8BF7\u68C0\u67E5\u5DE5\u5177\u53C2\u6570\u3001\u6743\u9650\u6216\u8FDE\u63A5\u72B6\u6001\u540E\u91CD\u8BD5\u3002"
};
var quoteEn = {
  "quote.title": "Look up a stock quote",
  "quote.preparing": "Preparing quote request",
  "quote.running": "Looking up quote",
  "quote.done": "Quote retrieved",
  "quote.failed": "Quote failed",
  "quote.inspect": "Inspect call",
  "quote.price": "Price",
  "quote.open": "Open",
  "quote.high": "High",
  "quote.low": "Low",
  "quote.previousClose": "Previous close",
  "quote.change": "Change",
  "quote.changePercent": "Change (%)",
  "quote.notice": "Quotes may be delayed or from the most recent trading session. Retrieval time is not quote time. The API does not provide a currency, so none is inferred. This is not investment advice.",
  "quote.legacy": "This historical result has no structured display information. Its original record is preserved below.",
  "quote.error.SYMBOL_LENGTH": "Stock symbols must contain 1\u201332 characters.",
  "quote.error.SYMBOL_FORMAT": "Use only English letters, digits, dots, and hyphens, such as AAPL or BRK.B.",
  "quote.error.INVALID_RESPONSE": "The quote response has an invalid format.",
  "quote.error.PROVIDER_REJECTED": "Finnhub rejected the request. Check the API key, subscription access, and symbol.",
  "quote.error.NO_QUOTE": "No valid quote. Check the symbol, market coverage, and subscription access.",
  "quote.error.INVALID_NUMBER": "The quote response contains an invalid number.",
  "quote.error.INVALID_TIME": "The quote response contains an invalid quote time.",
  "quote.error.INVALID_RANGE": "The quoted high is below the low.",
  "quote.error.TOO_LARGE": "The quote response exceeds the size limit.",
  "quote.error.NOT_JSON": "The quote service did not return JSON.",
  "quote.error.EMPTY": "The quote response is empty.",
  "quote.error.INVALID_JSON": "The quote service returned invalid JSON.",
  "quote.error.CANCELLED": "Quote lookup cancelled.",
  "quote.error.MISSING_KEY": "Set FINNHUB_API_KEY in the runtime environment. Do not send the key to a model or save it in the repository.",
  "quote.error.TIMEOUT_CONFIG": "The quote timeout must be an integer from 1 to 30000 milliseconds.",
  "quote.error.TIMEOUT": "Quote lookup timed out.",
  "quote.error.RATE_LIMIT": "Finnhub rate limit reached. Please try again later.",
  "quote.error.AUTH": "Finnhub authentication failed or the subscription cannot access this quote.",
  "quote.error.HTTP": "The quote service returned an HTTP error. Please try again later.",
  "quote.error.CONNECTION": "Quote lookup failed. Check the network or try again later.",
  "quote.error.UNKNOWN": "The lookup did not complete. Check the arguments, permissions, or connection and try again."
};
function quoteErrorKey(error) {
  if (error?.name !== "DshXFinanceError" || !error.code?.startsWith("DSH_X_FINANCE_")) return "quote.error.UNKNOWN";
  const key = `quote.error.${error.code.slice("DSH_X_FINANCE_".length)}`;
  return Object.hasOwn(quoteEn, key) ? key : "quote.error.UNKNOWN";
}

// src/client/locales.ts
var NS = "dsh-x-finance";
var zh = {
  ...quoteZh,
  ...chartZh,
  ...workbenchZh,
  ...marketZh,
  ...goldZh,
  ...globalZh,
  ...quantZh,
  "title": "\u91D1\u878D",
  // The watchlist is the long list on this page; only explicitly fixed stocks
  // reach the bottom bar, so the two never share a label.
  "bar.title": "\u56FA\u5B9A {count}",
  "bar.aria": "\u56FA\u5B9A\u80A1\u7968\u6761",
  "bar.expand": "\u5C55\u5F00\u56FA\u5B9A\u80A1\u7968\u6761",
  "bar.collapse": "\u6536\u8D77\u56FA\u5B9A\u80A1\u7968\u6761",
  "bar.order": "\u6309\u81EA\u9009\u6E05\u5355\u987A\u5E8F\u6392\u5217\u7684\u56FA\u5B9A\u80A1\u7968",
  "bar.hide": "\u9690\u85CF\u56FA\u5B9A\u680F",
  "bar.hide-hint": "\u9690\u85CF\u56FA\u5B9A\u680F\uFF08\u5FEB\u6377\u952E {shortcut}\uFF0C\u53EF\u5728\u80A1\u7968\u9875\u6062\u590D\uFF09",
  "bar.source-off": "\u56FA\u5B9A\u680F\u884C\u60C5\u672A\u5F00\u542F\uFF1A\u5B83\u548C\u5E02\u573A\u9875\u5171\u7528\u540C\u4E00\u4E2A\u672C\u673A\u514D\u8D39\u6E90\u3002",
  "source.enable": "\u5F00\u542F\u514D\u8D39\u6E90",
  "source.enabling": "\u6B63\u5728\u5F00\u542F\u2026",
  "source.enable-hint": "\u5E02\u573A\u9875\u3001\u540D\u79F0\u641C\u7D22\u3001\u81EA\u9009\u8BE6\u60C5\u548C\u56FA\u5B9A\u680F\u5171\u7528\u8FD9\u4E00\u4E2A\u672C\u673A\u514D\u8D39\u6E90\u5F00\u5173\u3002",
  "source.enable-error": "\u65E0\u6CD5\u5F00\u542F\u514D\u8D39\u6E90\uFF0C\u8BF7\u68C0\u67E5 profile \u76EE\u5F55\u6743\u9650\uFF0C\u6216\u624B\u52A8\u914D\u7F6E marketSource\u3002",
  "source.unavailable": "\u65E0\u6CD5\u8BFB\u53D6\u514D\u8D39\u6E90\u5F00\u5173\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u6216\u624B\u52A8\u914D\u7F6E\u3002",
  "source.off-title": "\u884C\u60C5\u672A\u5F00\u542F",
  "source.off-notice": "\u81EA\u9009\u8BE6\u60C5\u548C\u5E95\u90E8\u56FA\u5B9A\u680F\u4E0E\u300C\u5E02\u573A\u300D\u9875\u5171\u7528\u540C\u4E00\u4E2A\u672C\u673A\u514D\u8D39\u6E90\uFF08\u817E\u8BAF\u516C\u5F00\u63A5\u53E3\uFF0C\u975E\u5B98\u65B9\u3001\u65E0 SLA\uFF09\u3002\u5F00\u542F\u540E\u624D\u4F1A\u8BF7\u6C42\u884C\u60C5\uFF1B\u5173\u95ED\u65F6\u4E0D\u4F1A\u53D1\u51FA\u4EFB\u4F55\u884C\u60C5\u8BF7\u6C42\u3002",
  "chip.title": "{symbol} \xB7 {status} \xB7 \u70B9\u51FB\u67E5\u770B\u8BE6\u60C5",
  "stale": "\u65E7",
  "status.loading": "\u83B7\u53D6\u4E2D",
  "status.failed": "\u66F4\u65B0\u5931\u8D25 \xB7 \u65E7\u62A5\u4EF7",
  "status.unconfigured": "\u672A\u914D\u7F6E\u884C\u60C5",
  "status.unavailable": "\u6682\u65E0\u62A5\u4EF7",
  "status.unknown-time": "\u62A5\u4EF7\u65F6\u95F4\u672A\u77E5",
  "status.stale": "\u65E7\u62A5\u4EF7 \xB7 \u53EF\u80FD\u5EF6\u8FDF/\u4F11\u5E02",
  "status.closed": "\u4F11\u5E02 \xB7 \u6700\u8FD1\u62A5\u4EF7",
  "status.recent": "\u6700\u8FD1\u62A5\u4EF7 \xB7 \u53EF\u80FD\u5EF6\u8FDF",
  "add.title": "\u6DFB\u52A0\u81EA\u9009",
  "add.search": "\u6309\u540D\u79F0\u641C\u7D22\uFF08\u542B ETF\uFF09",
  "add.search.placeholder": "\u6BD4\u4E9A\u8FEA / 300ETF / 600519",
  "add.search.checking": "\u6B63\u5728\u68C0\u67E5\u540D\u79F0\u641C\u7D22\u2026",
  "add.search.notice": "\u641C\u7D22\u4F7F\u7528\u672C\u673A\u514D\u8D39\u6E90\uFF08\u817E\u8BAF\u516C\u5F00\u63A5\u53E3\uFF0C\u975E\u5B98\u65B9\uFF09\uFF1B\u5173\u952E\u8BCD\u53EA\u53D1\u5F80\u8BE5\u63A5\u53E3\uFF0C\u4E0D\u7ECF\u8FC7\u6A21\u578B\uFF0C\u4E5F\u4E0D\u4F1A\u5199\u5165\u81EA\u9009\u6216\u78C1\u76D8\u3002",
  "add.search.disabled": "\u540D\u79F0\u641C\u7D22\u672A\u5F00\u542F\uFF1A\u5B83\u548C\u5E02\u573A\u5168\u666F\u5171\u7528\u540C\u4E00\u4E2A\u672C\u673A\u514D\u8D39\u6E90\u5F00\u5173\u3002",
  "add.search.enable": "\u5F00\u542F\u514D\u8D39\u6E90",
  "add.search.enabling": "\u6B63\u5728\u5F00\u542F\u2026",
  "add.search.enable-error": "\u65E0\u6CD5\u5F00\u542F\u514D\u8D39\u6E90\uFF0C\u8BF7\u68C0\u67E5 profile \u76EE\u5F55\u6743\u9650\uFF0C\u6216\u624B\u52A8\u914D\u7F6E marketSource\u3002",
  "add.search.unavailable": "\u540D\u79F0\u641C\u7D22\u4E0D\u53EF\u7528\uFF1B\u4ECD\u53EF\u624B\u52A8\u586B\u5199\u4EA4\u6613\u6240\u548C\u4EE3\u7801\u3002",
  "add.search.loading": "\u641C\u7D22\u4E2D\u2026",
  "add.search.empty": "\u6CA1\u6709\u5339\u914D\u7684 A \u80A1\u3001ETF\u3001LOF \u6216 REIT\u3002",
  "add.search.results": "\u540D\u79F0\u641C\u7D22\u7ED3\u679C",
  "add.selected": "\u5DF2\u9009\u62E9 {name} \xB7 {symbol} \xB7 {kind}\uFF0C\u53EF\u586B\u5199\u522B\u540D\u540E\u6DFB\u52A0\u3002",
  "add.kind.stock": "\u80A1\u7968",
  "add.kind.etf": "ETF",
  "add.kind.fund": "LOF",
  "add.kind.reit": "REIT",
  "add.exchange": "\u4EA4\u6613\u6240",
  "exchange.SH": "\u4E0A\u6D77 \xB7 SH",
  "exchange.SZ": "\u6DF1\u5733 \xB7 SZ",
  "exchange.BJ": "\u5317\u4EAC \xB7 BJ",
  "add.code": "\u516D\u4F4D\u80A1\u7968\u4EE3\u7801",
  "add.alias": "\u663E\u793A\u522B\u540D\uFF08\u9009\u586B\uFF09",
  "add.alias.placeholder": "\u81EA\u5DF1\u719F\u6089\u7684\u540D\u79F0",
  "add.fix": "\u540C\u65F6\u56FA\u5B9A\u5230\u5E95\u90E8\uFF08\u6700\u591A {max} \u53EA\uFF09",
  "add.submit": "\u6DFB\u52A0\u5230\u81EA\u9009 \xB7 \u5F53\u524D {count} \u53EA",
  "add.notice": "\u4EE3\u7801\u4EC5\u505A\u683C\u5F0F\u6821\u9A8C\uFF1B\u641C\u7D22\u7ED3\u679C\u6765\u81EA\u516C\u5F00\u76EE\u5F55\uFF0C\u672A\u4E0E\u4EA4\u6613\u6240\u6838\u5BF9\u540D\u79F0\u6216\u4E0A\u5E02\u72B6\u6001\u3002\u81EA\u9009\u6E05\u5355\u4E0E\u56FA\u5B9A\u72B6\u6001\u4EC5\u4FDD\u5B58\u5728\u6B64\u6D4F\u89C8\u5668\uFF0C\u4E0D\u8DE8\u8BBE\u5907\u540C\u6B65\u3002",
  "detail.aria": "{symbol} \u80A1\u7968\u8BE6\u60C5",
  "detail.alias": " \xB7 \u81EA\u5B9A\u4E49\u522B\u540D",
  "detail.fixed": " \xB7 \u5DF2\u56FA\u5B9A\u5230\u5E95\u90E8",
  "detail.source": "\u6570\u636E\u6765\u6E90",
  "detail.no-source": "\u5C1A\u672A\u5F00\u542F\u884C\u60C5\u6765\u6E90",
  "detail.quoted-at": "\u62A5\u4EF7\u65F6\u95F4",
  "detail.fetched-at": "\u83B7\u53D6\u65F6\u95F4",
  "time.missing": "\u672A\u63D0\u4F9B",
  "time.shanghai": "{time}\uFF08\u4E0A\u6D77\uFF09",
  "detail.time-notice": "\u83B7\u53D6\u65F6\u95F4\u4E0D\u4EE3\u8868\u62A5\u4EF7\u65F6\u95F4\u3002\u4E0D\u4F1A\u6839\u636E\u5F53\u524D\u65F6\u949F\u731C\u6D4B\u4F11\u5E02\u3001\u8282\u5047\u65E5\u6216\u505C\u724C\u3002",
  "detail.chart": "\u8D70\u52BF\u4E0E\u6210\u4EA4",
  "detail.no-history": "\u6682\u65E0\u5386\u53F2\u884C\u60C5",
  "detail.chart-notice": "\u63A5\u5165\u652F\u6301\u5206\u65F6\u3001K \u7EBF\u4E0E\u6210\u4EA4\u91CF\u7684\u6570\u636E\u6E90\u540E\u5C55\u793A\u3002\u5F53\u524D\u6CA1\u6709\u53EF\u9A8C\u8BC1\u7684\u6570\u636E\uFF0C\u4E0D\u7ED8\u5236\u793A\u610F\u8D70\u52BF\u3002",
  "detail.fundamentals": "\u57FA\u672C\u9762",
  "detail.no-fundamentals": "\u6682\u65E0\u5DF2\u9A8C\u8BC1\u7684\u8D22\u62A5\u4E0E\u4F30\u503C\u6570\u636E",
  "detail.fundamentals-notice": "\u63A5\u5165\u540E\u5C06\u6807\u660E\u62A5\u544A\u671F\u3001\u62AB\u9732\u65E5\u671F\u53CA\u6765\u6E90\u3002",
  "detail.analysis": "\u5206\u6790",
  "detail.no-analysis": "\u6570\u636E\u4E0D\u8DB3\uFF0C\u6682\u4E0D\u751F\u6210\u5206\u6790\u7ED3\u8BBA",
  "detail.analysis-notice": "\u9700\u8981\u53EF\u9760\u7684\u884C\u60C5\u3001\u8D22\u52A1\u4E0E\u516C\u544A\u4F9D\u636E\uFF1B\u5206\u6790\u5E94\u533A\u5206\u4E8B\u5B9E\u3001\u63A8\u65AD\u548C\u98CE\u9669\u3002\u4E0D\u63D0\u4F9B\u4EA4\u6613\u6267\u884C\u3002",
  "page.subtitle": "\u624B\u52A8\u81EA\u9009 \xB7 A \u80A1\u8BE6\u60C5\u4E0E\u5206\u6790",
  "page.back": "\u8FD4\u56DE\u5BF9\u8BDD",
  "page.notice": "\u884C\u60C5\u6765\u81EA\u300C\u5E02\u573A\u300D\u9875\u540C\u4E00\u4E2A\u672C\u673A\u514D\u8D39\u6E90\uFF08\u817E\u8BAF\u516C\u5F00\u884C\u60C5\uFF0C\u975E\u5B98\u65B9\u3001\u65E0 SLA\uFF09\u3002\u53EA\u6709\u6807\u8BB0\u4E3A\u300C\u56FA\u5B9A\u300D\u7684\u80A1\u7968\u4F1A\u51FA\u73B0\u5728\u5E95\u90E8\u680F\uFF0C\u81EA\u9009\u6E05\u5355\u672C\u8EAB\u4E0D\u4F1A\u3002",
  "page.occupied": "\u5E95\u90E8\u63D2\u69FD\u5DF2\u6709\u5176\u4ED6\u63D2\u4EF6\u5360\u7528\uFF0C\u56FA\u5B9A\u680F\u5DF2\u8BA9\u51FA\u4F4D\u7F6E\u3002\u4F60\u4ECD\u53EF\u5728\u6B64\u7BA1\u7406\u548C\u67E5\u770B\u80A1\u7968\u3002",
  "page.bar-hidden": "\u56FA\u5B9A\u680F\u5DF2\u9690\u85CF\u3002",
  "page.bar-show": "\u663E\u793A\u56FA\u5B9A\u680F",
  "page.bar-hide": "\u9690\u85CF\u56FA\u5B9A\u680F",
  "page.bar-shortcut": "\u5FEB\u6377\u952E {shortcut}",
  "page.scope-loading": "\u6B63\u5728\u786E\u8BA4\u6B64 profile \u7684\u81EA\u9009\u5B58\u50A8\u2026",
  "page.scope-retry": "\u91CD\u8BD5\u8FDE\u63A5\u81EA\u9009\u5B58\u50A8",
  "page.manage": "\u81EA\u9009\u7BA1\u7406",
  "page.notes": "\u8BF4\u660E",
  "page.my-watchlist": "\u6211\u7684\u81EA\u9009",
  "page.counts": "\u5171 {count} \u53EA \xB7 \u5DF2\u56FA\u5B9A {fixed}/{max}",
  "page.fixed-hint": "\u81EA\u9009\u53EA\u662F\u6E05\u5355\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u51FA\u73B0\u5728\u5E95\u90E8\uFF1B\u70B9\u300C\u56FA\u5B9A\u300D\u624D\u4F1A\u8FDB\u5165\u56FA\u5B9A\u680F\uFF08\u6700\u591A {max} \u53EA\uFF0C\u53EF\u6EDA\u52A8\u67E5\u770B\uFF09\u3002",
  "page.empty": "\u8FD8\u6CA1\u6709\u81EA\u9009\u80A1\u7968\u3002\u6DFB\u52A0\u4E00\u53EA\u5F00\u59CB\u3002",
  "page.move-up": "\u4E0A\u79FB {symbol}",
  "page.move-down": "\u4E0B\u79FB {symbol}",
  "page.fixed": "\u56FA\u5B9A",
  "page.fix": "\u56FA\u5B9A",
  "page.unfix": "\u53D6\u6D88\u56FA\u5B9A",
  "page.fix-aria": "\u56FA\u5B9A {symbol} \u5230\u5E95\u90E8\u680F",
  "page.unfix-aria": "\u53D6\u6D88\u56FA\u5B9A {symbol}",
  "page.remove-aria": "\u79FB\u9664 {symbol}",
  "page.remove": "\u79FB\u9664",
  "page.select": "\u9009\u4E00\u53EA\u80A1\u7968\uFF0C\u770B\u6E05\u5B83\u7684\u60C5\u51B5",
  "page.select-hint": "\u8FD9\u91CC\u5C06\u5C55\u793A\u62A5\u4EF7\u3001\u8D70\u52BF\u3001\u57FA\u672C\u9762\u548C\u6709\u4F9D\u636E\u7684\u5206\u6790\u3002\u5E95\u90E8\u56FA\u5B9A\u680F\u53EA\u8D1F\u8D23\u5DE5\u4F5C\u65F6\u7684\u5FEB\u6377\u67E5\u770B\u3002",
  "error.invalid-code": "\u8BF7\u9009\u62E9\u4EA4\u6613\u6240\u5E76\u8F93\u5165\u516D\u4F4D\u80A1\u7968\u4EE3\u7801\u3002",
  "error.invalid-symbol": "A \u80A1\u4EE3\u7801\u987B\u5305\u542B\u4EA4\u6613\u6240\u548C\u516D\u4F4D\u6570\u5B57\u3002",
  "error.invalid-item": "\u65E0\u6548\u7684\u81EA\u9009\u9879\u3002",
  "error.invalid-saved": "\u4FDD\u5B58\u7684\u81EA\u9009\u6E05\u5355\u683C\u5F0F\u4E0D\u517C\u5BB9\u3002",
  "error.duplicate-saved": "\u4FDD\u5B58\u7684\u81EA\u9009\u6E05\u5355\u542B\u91CD\u590D\u4EE3\u7801\u3002",
  "error.invalid-scope": "\u5BBF\u4E3B\u81EA\u9009\u5B58\u50A8\u6807\u8BC6\u65E0\u6548\u3002",
  "error.scope-loading": "\u6B63\u5728\u786E\u8BA4\u6B64 profile \u7684\u5B58\u50A8\u4F4D\u7F6E\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  "error.storage-save": "\u65E0\u6CD5\u4FDD\u5B58\u5230\u6B64\u6D4F\u89C8\u5668\uFF1B\u5F53\u524D\u4FEE\u6539\u4EC5\u5728\u672C\u6B21\u4F7F\u7528\u6709\u6548\u3002",
  "error.storage-sync": "\u53E6\u4E00\u7A97\u53E3\u7684\u6E05\u5355\u683C\u5F0F\u65E0\u6548\uFF0C\u5DF2\u4FDD\u7559\u5F53\u524D\u6E05\u5355\u3002",
  "error.storage-read": "\u65E0\u6CD5\u8BFB\u53D6\u6B64 profile \u7684\u672C\u5730\u6E05\u5355\uFF1B\u672C\u6B21\u4FEE\u6539\u524D\u4E0D\u4F1A\u8986\u76D6\u539F\u8BB0\u5F55\u3002",
  "error.scope-unavailable": "\u65E0\u6CD5\u786E\u8BA4\u6B64 profile \u7684\u5B58\u50A8\u4F4D\u7F6E\uFF1B\u5DF2\u6682\u505C\u8BFB\u53D6\u548C\u4FDD\u5B58\u6E05\u5355\u3002",
  "error.duplicate": "\u8FD9\u53EA\u80A1\u7968\u5DF2\u7ECF\u5728\u81EA\u9009\u91CC\u3002",
  "error.limit": "\u81EA\u9009\u6700\u591A {max} \u53EA\uFF0C\u8BF7\u5148\u79FB\u9664\u4E00\u53EA\u3002",
  "error.fixed-limit": "\u5E95\u90E8\u56FA\u5B9A\u680F\u6700\u591A {max} \u53EA\uFF0C\u8BF7\u5148\u53D6\u6D88\u4E00\u53EA\u7684\u56FA\u5B9A\u3002",
  "error.offline": "\u79BB\u7EBF \xB7 \u5DF2\u6682\u505C\u66F4\u65B0",
  "error.hidden": "\u7A97\u53E3\u9690\u85CF \xB7 \u5DF2\u6682\u505C\u66F4\u65B0",
  "error.connection": "\u8FDE\u63A5\u4E2D\u65AD \xB7 \u4FDD\u7559\u6700\u8FD1\u62A5\u4EF7",
  "error.invalid": "\u884C\u60C5\u54CD\u5E94\u65E0\u6548",
  "error.forbidden": "\u53EA\u5141\u8BB8\u5BBF\u4E3B\u6240\u6709\u8005\u8BFB\u53D6\u884C\u60C5\u3002",
  "error.not-found": "\u672A\u77E5\u80A1\u7968\u63A5\u53E3\u3002",
  "error.invalid-input": "\u8BF7\u8F93\u5165\u6700\u591A {max} \u4E2A\u4E0D\u91CD\u590D\u7684 A \u80A1\u4EE3\u7801\u3002",
  "error.invalid-query": "\u8BF7\u8F93\u5165 1\u201324 \u4E2A\u5B57\u7B26\u7684\u540D\u79F0\u3001\u62FC\u97F3\u6216\u4EE3\u7801\u3002",
  "error.search-unavailable": "\u540D\u79F0\u641C\u7D22\u6682\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  "error.cancelled": "\u884C\u60C5\u8BF7\u6C42\u5DF2\u53D6\u6D88\u3002",
  "error.unavailable": "\u884C\u60C5\u6682\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  "error.market-unavailable": "\u884C\u60C5\u6682\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  "error.history-unavailable": "\u8BE5\u80A1\u7968\u6682\u65E0\u5386\u53F2\u65E5 K \u6570\u636E\u3002",
  "error.unknown": "\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002"
};
var en2 = {
  ...quoteEn,
  ...chartEn,
  ...workbenchEn,
  ...marketEn,
  ...goldEn,
  ...globalEn,
  ...quantEn,
  "title": "Finance",
  "bar.title": "Fixed {count}",
  "bar.aria": "Fixed stocks bar",
  "bar.expand": "Expand the fixed stocks bar",
  "bar.collapse": "Collapse the fixed stocks bar",
  "bar.order": "Fixed stocks in watchlist order",
  "bar.hide": "Hide the fixed bar",
  "bar.hide-hint": "Hide the fixed bar ({shortcut}; restore it on the stock page)",
  "bar.source-off": "The fixed bar has no quotes yet: it shares the local free source with the market page.",
  "source.enable": "Turn on free source",
  "source.enabling": "Turning on\u2026",
  "source.enable-hint": "The market page, name search, stock details and the fixed bar share this one local free-source switch.",
  "source.enable-error": "Could not turn on the free source. Check profile directory permissions or configure marketSource manually.",
  "source.unavailable": "Could not read the free-source switch. Try again shortly or configure it manually.",
  "source.off-title": "Quotes are not on",
  "source.off-notice": "Stock details and the bottom fixed bar share the same local free source as the Market tab (Tencent public endpoint, unofficial, no SLA). Nothing is requested until you turn it on, and nothing is requested after you turn it off.",
  "chip.title": "{symbol} \xB7 {status} \xB7 View details",
  "stale": "Stale",
  "status.loading": "Loading",
  "status.failed": "Update failed \xB7 Previous quote",
  "status.unconfigured": "Quotes not configured",
  "status.unavailable": "No quote available",
  "status.unknown-time": "Quote time unknown",
  "status.stale": "Previous quote \xB7 Possibly delayed / market closed",
  "status.closed": "Market closed \xB7 Latest quote",
  "status.recent": "Latest quote \xB7 Possibly delayed",
  "add.title": "Add to the watchlist",
  "add.search": "Search by name (incl. ETFs)",
  "add.search.placeholder": "BYD / 300ETF / 600519",
  "add.search.checking": "Checking name search\u2026",
  "add.search.notice": "Search uses the local free source (Tencent public endpoint, unofficial). Keywords go only to that endpoint: never to the model, the watchlist or disk.",
  "add.search.disabled": "Name search is off: it shares the local free-source switch with the market panorama.",
  "add.search.enable": "Turn on free source",
  "add.search.enabling": "Turning on\u2026",
  "add.search.enable-error": "Could not turn on the free source. Check profile directory permissions or configure marketSource manually.",
  "add.search.unavailable": "Name search is unavailable; you can still enter the exchange and code manually.",
  "add.search.loading": "Searching\u2026",
  "add.search.empty": "No matching A-share, ETF, LOF or REIT.",
  "add.search.results": "Name search results",
  "add.selected": "Selected {name} \xB7 {symbol} \xB7 {kind}. Add an alias before adding it.",
  "add.kind.stock": "Stock",
  "add.kind.etf": "ETF",
  "add.kind.fund": "LOF",
  "add.kind.reit": "REIT",
  "add.exchange": "Exchange",
  "exchange.SH": "Shanghai \xB7 SH",
  "exchange.SZ": "Shenzhen \xB7 SZ",
  "exchange.BJ": "Beijing \xB7 BJ",
  "add.code": "Six-digit stock code",
  "add.alias": "Display alias (optional)",
  "add.alias.placeholder": "A name you recognize",
  "add.fix": "Also fix it to the bottom bar (max {max})",
  "add.submit": "Add to watchlist \xB7 {count} in list",
  "add.notice": "Only the code format is checked; search results come from a public directory and are not verified against an exchange. The watchlist and its fixed marks are saved in this browser only and do not sync across devices.",
  "detail.aria": "{symbol} stock details",
  "detail.alias": " \xB7 Custom alias",
  "detail.fixed": " \xB7 Fixed to the bottom bar",
  "detail.source": "Data source",
  "detail.no-source": "No quote source is on",
  "detail.quoted-at": "Quote time",
  "detail.fetched-at": "Retrieved at",
  "time.missing": "Not provided",
  "time.shanghai": "{time} (Shanghai)",
  "detail.time-notice": "Retrieval time is not quote time. Market closures, holidays, and suspensions are not inferred from the current clock.",
  "detail.chart": "Price and volume",
  "detail.no-history": "No historical market data",
  "detail.chart-notice": "Intraday charts, candlesticks, and volume will appear when a supporting data source is connected. No illustrative chart is drawn without verifiable data.",
  "detail.fundamentals": "Fundamentals",
  "detail.no-fundamentals": "No verified financial statements or valuation data",
  "detail.fundamentals-notice": "Reporting periods, disclosure dates, and sources will be shown when connected.",
  "detail.analysis": "Analysis",
  "detail.no-analysis": "Insufficient data for analysis",
  "detail.analysis-notice": "Reliable prices, financials, and announcements are required. Analysis should distinguish facts, inferences, and risks. Trading is not supported.",
  "page.subtitle": "Manual watchlist \xB7 A-share details and analysis",
  "page.back": "Back to conversation",
  "page.notice": "Quotes come from the same local free source as the Market tab (Tencent public endpoint, unofficial, no SLA). Only stocks marked \u201CFixed\u201D appear in the bottom bar; the watchlist itself never does.",
  "page.occupied": "Another plugin occupies the bottom slot, so the fixed bar has yielded its place. You can still manage and view stocks here.",
  "page.bar-hidden": "The fixed bar is hidden.",
  "page.bar-show": "Show the fixed bar",
  "page.bar-hide": "Hide the fixed bar",
  "page.bar-shortcut": "Shortcut {shortcut}",
  "page.scope-loading": "Checking watchlist storage for this profile\u2026",
  "page.scope-retry": "Retry connecting to watchlist storage",
  "page.manage": "Manage watchlist",
  "page.notes": "Notes",
  "page.my-watchlist": "My watchlist",
  "page.counts": "{count} in total \xB7 {fixed}/{max} fixed",
  "page.fixed-hint": "The watchlist is only a list and never shows up at the bottom by itself; press \u201CFix\u201D to put a stock in the bottom bar (max {max}, scrollable).",
  "page.empty": "No stocks yet. Add one to get started.",
  "page.move-up": "Move {symbol} up",
  "page.move-down": "Move {symbol} down",
  "page.fixed": "Fixed",
  "page.fix": "Fix",
  "page.unfix": "Unfix",
  "page.fix-aria": "Fix {symbol} to the bottom bar",
  "page.unfix-aria": "Unfix {symbol}",
  "page.remove-aria": "Remove {symbol}",
  "page.remove": "Remove",
  "page.select": "Select a stock to explore",
  "page.select-hint": "Quotes, charts, fundamentals, and evidence-based analysis will appear here. The bottom fixed bar provides a quick glance while you work.",
  "error.invalid-code": "Choose an exchange and enter a six-digit stock code.",
  "error.invalid-symbol": "An A-share code must include an exchange and six digits.",
  "error.invalid-item": "Invalid watchlist item.",
  "error.invalid-saved": "The saved watchlist format is incompatible.",
  "error.duplicate-saved": "The saved watchlist contains duplicate codes.",
  "error.invalid-scope": "Invalid host watchlist storage identifier.",
  "error.scope-loading": "Checking storage for this profile. Please try again shortly.",
  "error.storage-save": "Could not save to this browser. Changes are available only for this session.",
  "error.storage-sync": "The list from another window is invalid. The current list has been kept.",
  "error.storage-read": "Could not read this profile\u2019s local list. The saved record will remain untouched until you make a change.",
  "error.scope-unavailable": "Could not identify storage for this profile. Reading and saving the list are paused.",
  "error.duplicate": "This stock is already in the watchlist.",
  "error.limit": "The watchlist holds up to {max} stocks. Remove one first.",
  "error.fixed-limit": "The bottom bar holds up to {max} fixed stocks. Unfix one first.",
  "error.offline": "Offline \xB7 Updates paused",
  "error.hidden": "Window hidden \xB7 Updates paused",
  "error.connection": "Connection lost \xB7 Keeping the latest quote",
  "error.invalid": "Invalid quote response",
  "error.forbidden": "Only the host owner can read quotes.",
  "error.not-found": "Unknown stock endpoint.",
  "error.invalid-input": "Enter up to {max} unique A-share codes.",
  "error.invalid-query": "Enter 1\u201324 characters: a name fragment, pinyin initials or a code.",
  "error.search-unavailable": "Name search is temporarily unavailable. Please try again later.",
  "error.cancelled": "Quote request cancelled.",
  "error.unavailable": "Quotes are temporarily unavailable. Please try again later.",
  "error.market-unavailable": "Quotes are temporarily unavailable. Please try again later.",
  "error.history-unavailable": "No daily history is available for this stock.",
  "error.unknown": "The action could not be completed. Please try again."
};
function errorKey(code) {
  const key = typeof code === "string" ? `error.${code.replace(/^finance\//, "")}` : "error.unknown";
  return Object.hasOwn(en2, key) ? key : "error.unknown";
}

// src/client/SearchBox.tsx
var KINDS = ["stock", "etf", "fund", "reit"];
var valid = (match) => match && typeof match.symbol === "string" && typeof match.name === "string" && KINDS.includes(match.kind);
function InstrumentSearch({ rpc, onPick, t, delay = 250 }) {
  const [query, setQuery] = (0, import_react12.useState)("");
  const [availability, setAvailability] = (0, import_react12.useState)("checking");
  const [checkTick, setCheckTick] = (0, import_react12.useState)(0);
  const [state, setState] = (0, import_react12.useState)("idle");
  const [error, setError] = (0, import_react12.useState)("");
  const [results, setResults] = (0, import_react12.useState)([]);
  const [open, setOpen] = (0, import_react12.useState)(false);
  const [active, setActive] = (0, import_react12.useState)(-1);
  const [enabling, setEnabling] = (0, import_react12.useState)(false);
  const [enableError, setEnableError] = (0, import_react12.useState)("");
  const request = (0, import_react12.useRef)(0);
  const listId = (0, import_react12.useId)();
  const optionId = (index) => `${listId}-option-${index}`;
  (0, import_react12.useEffect)(() => {
    let disposed = false;
    const controller = new AbortController();
    const read = async () => {
      setAvailability("checking");
      try {
        if (!rpc?.call) throw new Error();
        const result = await rpc.call("/api", SEARCH_RPC_ENDPOINT, { action: "status" }, controller.signal);
        if (disposed || controller.signal.aborted) return;
        if (!result?.ok) throw new Error();
        setAvailability(result.value?.enabled !== true ? "disabled" : result.value?.available === false ? "unavailable" : "enabled");
      } catch {
        if (!disposed && !controller.signal.aborted) setAvailability("unavailable");
      }
    };
    void read();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [rpc, checkTick]);
  (0, import_react12.useEffect)(() => {
    const text2 = query.trim();
    if (availability !== "enabled" || !text2) {
      request.current++;
      setResults([]);
      setOpen(false);
      setActive(-1);
      setState("idle");
      return;
    }
    const id = ++request.current;
    const local = new AbortController();
    const timer = setTimeout(async () => {
      if (id !== request.current) return;
      setState("loading");
      setError("");
      try {
        const result = await rpc.call("/api", SEARCH_RPC_ENDPOINT, { action: "search", query: text2 }, local.signal);
        if (id !== request.current || local.signal.aborted) return;
        if (!result?.ok) {
          setState("error");
          setError(errorKey(result?.error?.code));
          return;
        }
        if (result.value?.status === "disabled") {
          setAvailability("disabled");
          setState("idle");
          return;
        }
        const list = (Array.isArray(result.value?.results) ? result.value.results : []).filter(valid);
        setResults(list);
        setState("ready");
        setOpen(true);
        setActive(list.length ? 0 : -1);
      } catch {
        if (id !== request.current || local.signal.aborted) return;
        setState("error");
        setError("error.search-unavailable");
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      local.abort();
    };
  }, [query, availability, delay, rpc]);
  const choose = (match) => {
    onPick?.(match);
    setQuery("");
    setResults([]);
    setOpen(false);
    setActive(-1);
    setState("idle");
  };
  const keyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!results.length) return;
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(event.key === "ArrowDown" ? 0 : results.length - 1);
        return;
      }
      setActive((previous) => {
        const current = previous < 0 ? 0 : previous;
        return event.key === "ArrowDown" ? (current + 1) % results.length : (current - 1 + results.length) % results.length;
      });
      return;
    }
    if (event.key === "Enter" && open && active >= 0 && results[active]) {
      event.preventDefault();
      choose(results[active]);
      return;
    }
    if (event.key === "Escape") setOpen(false);
  };
  const enable = async () => {
    setEnabling(true);
    setEnableError("");
    try {
      if (!rpc?.call) throw new Error();
      const result = await rpc.call("/api", MARKET_PREFERENCE_ENDPOINT, { action: "set", enabled: true });
      if (!result?.ok) throw new Error();
      setCheckTick((value) => value + 1);
    } catch {
      setEnableError("add.search.enable-error");
    } finally {
      setEnabling(false);
    }
  };
  return /* @__PURE__ */ import_react12.default.createElement("div", { className: "dxs-search" }, /* @__PURE__ */ import_react12.default.createElement("label", { htmlFor: `${listId}-input` }, t("add.search")), /* @__PURE__ */ import_react12.default.createElement(
    "input",
    {
      id: `${listId}-input`,
      type: "search",
      name: "instrument-search",
      autoComplete: "off",
      spellCheck: false,
      role: "combobox",
      "aria-expanded": open && results.length > 0,
      "aria-controls": listId,
      "aria-autocomplete": "list",
      "aria-activedescendant": open && active >= 0 && results[active] ? optionId(active) : void 0,
      placeholder: t("add.search.placeholder"),
      maxLength: SEARCH_MAX_QUERY,
      value: query,
      disabled: availability === "unavailable",
      onChange: (event) => {
        setQuery(event.target.value);
        setEnableError("");
      },
      onKeyDown: keyDown
    }
  ), availability === "checking" && /* @__PURE__ */ import_react12.default.createElement("p", { className: "dxs-muted", role: "status" }, t("add.search.checking")), availability === "enabled" && /* @__PURE__ */ import_react12.default.createElement("p", { className: "dxs-muted dxs-search-note" }, t("add.search.notice")), availability === "unavailable" && /* @__PURE__ */ import_react12.default.createElement("p", { className: "dxs-muted" }, t("add.search.unavailable")), availability === "disabled" && /* @__PURE__ */ import_react12.default.createElement("p", { className: "dxs-muted" }, t("add.search.disabled"), " ", /* @__PURE__ */ import_react12.default.createElement("button", { type: "button", disabled: enabling, onClick: enable }, t(enabling ? "add.search.enabling" : "add.search.enable"))), enableError && /* @__PURE__ */ import_react12.default.createElement("p", { role: "alert", className: "dxs-error" }, t(enableError)), state === "loading" && /* @__PURE__ */ import_react12.default.createElement("p", { className: "dxs-muted", role: "status" }, t("add.search.loading")), state === "error" && /* @__PURE__ */ import_react12.default.createElement("p", { role: "alert", className: "dxs-error" }, t(error)), open && results.length > 0 && /* @__PURE__ */ import_react12.default.createElement("ul", { id: listId, className: "dxs-search-results", role: "listbox", "aria-label": t("add.search.results") }, results.map((match, index) => /* @__PURE__ */ import_react12.default.createElement(
    "li",
    {
      key: match.symbol,
      id: optionId(index),
      role: "option",
      "aria-selected": index === active,
      onMouseDown: (event) => event.preventDefault(),
      onClick: () => choose(match),
      onMouseEnter: () => setActive(index)
    },
    /* @__PURE__ */ import_react12.default.createElement("strong", null, match.name),
    /* @__PURE__ */ import_react12.default.createElement("span", { className: "dxs-search-symbol" }, match.symbol),
    /* @__PURE__ */ import_react12.default.createElement("span", { className: "dxs-search-kind" }, t(`add.kind.${match.kind}`))
  ))), state === "ready" && results.length === 0 && /* @__PURE__ */ import_react12.default.createElement("p", { className: "dxs-muted", role: "status" }, t("add.search.empty")));
}

// src/client/shortcut.ts
var APPLE_PLATFORM = /Macintosh|Mac OS X|iPhone|iPad|iPod|MacIntel|MacARM|MacPPC/i;
function isApplePlatform(nav) {
  const hinted = nav?.userAgentData?.platform ?? "";
  if (/^mac/i.test(hinted)) return true;
  return APPLE_PLATFORM.test(`${nav?.platform ?? ""} ${nav?.userAgent ?? ""}`);
}
function fixedBarShortcutKeys(nav = globalThis.navigator) {
  return isApplePlatform(nav) ? ["\u2325", "\u21E7", "S"] : ["Alt", "Shift", "S"];
}
function fixedBarShortcutLabel(nav = globalThis.navigator) {
  const keys = fixedBarShortcutKeys(nav);
  return isApplePlatform(nav) ? keys.join("") : keys.join("+");
}
function isFixedBarShortcut(event) {
  if (!event || event.repeat || !event.altKey || !event.shiftKey || event.code !== "KeyS") return false;
  const target = event.target;
  if (target?.isContentEditable) return false;
  return !["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);
}

// src/client/source-button.tsx
var import_react13 = __toESM(require("react"), 1);
function SourceButton({ preference, t, large = false }) {
  const [busy, setBusy] = (0, import_react13.useState)(false), [failed, setFailed] = (0, import_react13.useState)(false);
  if (preference.status !== "ready" || preference.enabled) return null;
  const enable = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await preference.setEnabled(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", className: large ? "dxs-source-enable dxs-primary is-large" : "dxs-source-enable", disabled: busy || preference.forced, onClick: enable, title: failed ? t("source.enable-error") : t("source.enable-hint") }, busy ? t("source.enabling") : t("source.enable"));
}

// src/client/gold/GoldView.tsx
var import_react15 = __toESM(require("react"), 1);

// src/client/gold/data.ts
var import_react14 = require("react");

// src/gold.ts
var GOLD_ENDPOINT = "dsh-x-finance.gold";
var GOLD_MAX_BYTES = 4 * 1024 * 1024;
var GOLD_HISTORY_TTL_MS = 10 * 6e4;
var INSTRUMENTS = [
  { key: "XAU", prefixes: ["hf_XAU"], unit: "usd-ounce" },
  { key: "GC", prefixes: ["hf_GC"], unit: "usd-ounce" },
  { key: "SI", prefixes: ["hf_SI"], unit: "usd-ounce" },
  { key: "AU9999", prefixes: ["gds_AU9999"], unit: "cny-gram" },
  { key: "AUTD", prefixes: ["gds_AUTD"], unit: "cny-gram" },
  { key: "USDCNH", prefixes: ["fx_susdcnh"], unit: "cny-usd" }
];
var GOLD_QUOTE_KEYS = INSTRUMENTS.map((item) => item.prefixes[0]);

// src/client/gold/data.ts
var INITIAL4 = { status: "idle", value: null, error: "", refreshing: false };
function useGoldPanel(rpc, options = {}) {
  const { enabled = true, pollMs = 3e4 } = options;
  const [tick, setTick] = (0, import_react14.useState)(0);
  const [state, setState] = (0, import_react14.useState)(INITIAL4);
  const alive = (0, import_react14.useRef)(true);
  (0, import_react14.useEffect)(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  (0, import_react14.useEffect)(() => {
    if (!enabled) {
      setState(INITIAL4);
      return;
    }
    let disposed = false;
    let timer;
    let controller;
    let delay = pollMs;
    const schedule = () => {
      if (!disposed && delay > 0) timer = setTimeout(run, delay);
    };
    async function run() {
      if (disposed) return;
      if (typeof document !== "undefined" && document.hidden) {
        schedule();
        return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        schedule();
        return;
      }
      clearTimeout(timer);
      delay = pollMs;
      controller?.abort();
      const local = new AbortController();
      controller = local;
      setState((previous) => previous.value ? { ...previous, refreshing: true, error: "" } : { status: "loading", value: null, error: "", refreshing: false });
      try {
        if (!rpc?.call) throw new Error("finance/connection");
        const result = await rpc.call("/api", GOLD_ENDPOINT, {}, local.signal);
        if (disposed || local.signal.aborted) return;
        if (!result?.ok) {
          setState((previous) => ({
            ...previous,
            status: previous.value ? "ready" : "error",
            error: typeof result?.error?.code === "string" ? result.error.code : "finance/gold-unavailable",
            refreshing: false
          }));
          return;
        }
        const payload = result.value;
        if (payload?.status === "unconfigured") {
          delay = 0;
          setState({ status: "unconfigured", value: null, error: "", refreshing: false });
          return;
        }
        const snapshot = payload?.snapshot;
        if (!snapshot || !Array.isArray(snapshot.instruments)) throw new Error("finance/invalid");
        setState({ status: "ready", value: snapshot, error: "", refreshing: false });
      } catch {
        if (disposed || local.signal.aborted) return;
        setState((previous) => ({
          ...previous,
          status: previous.value ? "ready" : "error",
          error: "finance/gold-unavailable",
          refreshing: false
        }));
      } finally {
        if (!disposed) schedule();
      }
    }
    const resume = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      clearTimeout(timer);
      void run();
    };
    void run();
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", resume);
    globalThis.addEventListener?.("online", resume);
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", resume);
      globalThis.removeEventListener?.("online", resume);
    };
  }, [rpc, enabled, pollMs, tick]);
  const refresh = () => {
    if (alive.current) setTick((value) => value + 1);
  };
  return { ...state, refresh };
}

// src/client/gold/GoldView.tsx
var tone = (value) => typeof value === "number" && Number.isFinite(value) ? value > 0 ? "dxs-up" : value < 0 ? "dxs-down" : "" : "";
var priceDigits = (instrument) => quoteDigits(instrument.precision ?? (instrument.unit === "cny-usd" ? 4 : 2));
function priceText(instrument, locale) {
  const digits = priceDigits(instrument);
  return new Intl.NumberFormat(formatLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(instrument.price);
}
function InstrumentCard({ instrument, t, format, locale }) {
  const changeTone2 = tone(instrument.changePercent);
  const change = instrument.change;
  const digits = priceDigits(instrument);
  return /* @__PURE__ */ import_react15.default.createElement("article", { className: "dxs-gold-card", "aria-label": t(`gold.key.${instrument.key}`) }, /* @__PURE__ */ import_react15.default.createElement("header", null, /* @__PURE__ */ import_react15.default.createElement("h3", { title: instrument.name }, t(`gold.key.${instrument.key}`)), /* @__PURE__ */ import_react15.default.createElement("span", { className: "dxs-gold-badge" }, t(`gold.unit.${instrument.unit}`))), /* @__PURE__ */ import_react15.default.createElement("div", { className: `dxs-gold-price ${changeTone2}` }, priceText(instrument, locale)), /* @__PURE__ */ import_react15.default.createElement("p", { className: `dxs-gold-change ${changeTone2}` }, format.change(instrument.changePercent), change == null ? "" : ` \xB7 ${format.signedAt(change, digits)}`), /* @__PURE__ */ import_react15.default.createElement("dl", { className: "dxs-gold-metrics" }, /* @__PURE__ */ import_react15.default.createElement("dt", null, t("gold.metric.open")), /* @__PURE__ */ import_react15.default.createElement("dd", null, format.priceAt(instrument.open, digits)), /* @__PURE__ */ import_react15.default.createElement("dt", null, t("gold.metric.high")), /* @__PURE__ */ import_react15.default.createElement("dd", null, format.priceAt(instrument.high, digits)), /* @__PURE__ */ import_react15.default.createElement("dt", null, t("gold.metric.low")), /* @__PURE__ */ import_react15.default.createElement("dd", null, format.priceAt(instrument.low, digits)), /* @__PURE__ */ import_react15.default.createElement("dt", null, t("gold.metric.previous")), /* @__PURE__ */ import_react15.default.createElement("dd", null, format.priceAt(instrument.previousClose, digits)), /* @__PURE__ */ import_react15.default.createElement("dt", null, t("gold.metric.amplitude")), /* @__PURE__ */ import_react15.default.createElement("dd", null, format.percent(instrument.amplitudePercent))), /* @__PURE__ */ import_react15.default.createElement("p", { className: "dxs-muted dxs-gold-time" }, t("gold.quoting", { time: format.time(instrument.quotedAt, t) })));
}
function DerivedSummary({ derived, t, format }) {
  const premiumTone = tone(derived.shanghaiPremium);
  return /* @__PURE__ */ import_react15.default.createElement("section", { className: "dxs-gold-summary", "aria-label": t("gold.derived.title") }, /* @__PURE__ */ import_react15.default.createElement("h2", null, t("gold.derived.title")), /* @__PURE__ */ import_react15.default.createElement("div", { className: "dxs-gold-derived" }, /* @__PURE__ */ import_react15.default.createElement("div", null, /* @__PURE__ */ import_react15.default.createElement("span", null, t("gold.derived.london")), /* @__PURE__ */ import_react15.default.createElement("strong", null, format.price(derived.londonCnyPerGram), " ", /* @__PURE__ */ import_react15.default.createElement("small", null, t("gold.unit.cny-gram")))), /* @__PURE__ */ import_react15.default.createElement("div", null, /* @__PURE__ */ import_react15.default.createElement("span", null, t("gold.derived.premium")), /* @__PURE__ */ import_react15.default.createElement("strong", { className: premiumTone }, format.signed(derived.shanghaiPremium), " ", /* @__PURE__ */ import_react15.default.createElement("small", null, t("gold.unit.cny-gram"))), /* @__PURE__ */ import_react15.default.createElement("em", { className: premiumTone }, format.change(derived.shanghaiPremiumPercent))), /* @__PURE__ */ import_react15.default.createElement("div", null, /* @__PURE__ */ import_react15.default.createElement("span", null, t("gold.derived.ratio")), /* @__PURE__ */ import_react15.default.createElement("strong", null, derived.goldSilverRatio == null ? "\u2014" : format.price(derived.goldSilverRatio)))), /* @__PURE__ */ import_react15.default.createElement("p", { className: "dxs-muted" }, t("gold.derived.formula")));
}
function Ranges({ series, t, format }) {
  const rows = [
    { key: "XAU", data: series.find((entry) => entry.key === "XAU") },
    { key: "GC", data: series.find((entry) => entry.key === "GC") }
  ];
  const cell = (value) => value == null ? "\u2014" : format.price(value);
  return /* @__PURE__ */ import_react15.default.createElement("section", { className: "dxs-gold-ranges", "aria-label": t("gold.ranges.title") }, /* @__PURE__ */ import_react15.default.createElement("h2", null, t("gold.ranges.title")), /* @__PURE__ */ import_react15.default.createElement("div", { className: "dxs-gold-table-wrap" }, /* @__PURE__ */ import_react15.default.createElement("table", { className: "dxs-gold-table" }, /* @__PURE__ */ import_react15.default.createElement("thead", null, /* @__PURE__ */ import_react15.default.createElement("tr", null, /* @__PURE__ */ import_react15.default.createElement("th", { scope: "col" }, t("gold.title")), /* @__PURE__ */ import_react15.default.createElement("th", { scope: "col" }, t("gold.range.5d")), /* @__PURE__ */ import_react15.default.createElement("th", { scope: "col" }, t("gold.range.20d")), /* @__PURE__ */ import_react15.default.createElement("th", { scope: "col" }, t("gold.range.60d")), /* @__PURE__ */ import_react15.default.createElement("th", { scope: "col" }, t("gold.range.ytd")), /* @__PURE__ */ import_react15.default.createElement("th", { scope: "col" }, t("gold.range.high52w")), /* @__PURE__ */ import_react15.default.createElement("th", { scope: "col" }, t("gold.range.low52w")), /* @__PURE__ */ import_react15.default.createElement("th", { scope: "col" }, t("gold.range.drawdown")))), /* @__PURE__ */ import_react15.default.createElement("tbody", null, rows.map((row) => {
    const range = (label) => row.data?.ranges.find((entry) => entry.label === label)?.changePercent ?? null;
    return /* @__PURE__ */ import_react15.default.createElement("tr", { key: row.key }, /* @__PURE__ */ import_react15.default.createElement("th", { scope: "row" }, t(`gold.key.${row.key}`)), /* @__PURE__ */ import_react15.default.createElement("td", { className: tone(range("5d")) }, format.change(range("5d"))), /* @__PURE__ */ import_react15.default.createElement("td", { className: tone(range("20d")) }, format.change(range("20d"))), /* @__PURE__ */ import_react15.default.createElement("td", { className: tone(range("60d")) }, format.change(range("60d"))), /* @__PURE__ */ import_react15.default.createElement("td", { className: tone(range("ytd")) }, format.change(range("ytd"))), /* @__PURE__ */ import_react15.default.createElement("td", null, cell(row.data?.high52w)), /* @__PURE__ */ import_react15.default.createElement("td", null, cell(row.data?.low52w)), /* @__PURE__ */ import_react15.default.createElement("td", { className: tone(row.data?.drawdownPercent) }, format.change(row.data?.drawdownPercent)));
  })))), /* @__PURE__ */ import_react15.default.createElement("p", { className: "dxs-muted" }, t("gold.series.note")));
}
function GoldView({ rpc, t, format, locale, preference }) {
  const sourceEnabled = preference.status === "ready" && preference.enabled;
  const { status, value, error, refreshing, refresh } = useGoldPanel(rpc, { enabled: sourceEnabled });
  const stale = status === "ready" && Boolean(error);
  return /* @__PURE__ */ import_react15.default.createElement("div", { className: "dxs-stage dxs-gold" }, /* @__PURE__ */ import_react15.default.createElement("section", { className: "dxs-gold-head" }, /* @__PURE__ */ import_react15.default.createElement("div", null, /* @__PURE__ */ import_react15.default.createElement("h2", null, t("gold.title")), /* @__PURE__ */ import_react15.default.createElement("p", { className: "dxs-muted" }, t("gold.subtitle"))), /* @__PURE__ */ import_react15.default.createElement("div", { className: "dxs-gold-head-actions" }, stale ? /* @__PURE__ */ import_react15.default.createElement("span", { className: "dxs-gold-stale" }, t("gold.stale")) : null, /* @__PURE__ */ import_react15.default.createElement("button", { type: "button", onClick: refresh, disabled: !sourceEnabled || refreshing }, refreshing ? t("gold.refreshing") : t("gold.refresh")))), preference.status === "error" ? /* @__PURE__ */ import_react15.default.createElement("p", { role: "alert", className: "dxs-banner dxs-error" }, t("source.unavailable")) : null, !sourceEnabled && preference.status === "ready" ? /* @__PURE__ */ import_react15.default.createElement("div", { className: "dxs-banner is-warn dxs-source-card" }, /* @__PURE__ */ import_react15.default.createElement("div", null, /* @__PURE__ */ import_react15.default.createElement("strong", null, t("gold.off-title")), /* @__PURE__ */ import_react15.default.createElement("p", { className: "dxs-muted" }, t("gold.off-notice"))), /* @__PURE__ */ import_react15.default.createElement(SourceButton, { preference, t, large: true })) : null, preference.status === "loading" ? /* @__PURE__ */ import_react15.default.createElement("p", { className: "dxs-muted" }, t("gold.loading")) : null, sourceEnabled && status === "loading" && !value ? /* @__PURE__ */ import_react15.default.createElement("p", { className: "dxs-muted" }, t("gold.loading")) : null, sourceEnabled && status === "error" ? /* @__PURE__ */ import_react15.default.createElement("p", { role: "alert", className: "dxs-banner dxs-error" }, t("gold.unavailable")) : null, stale ? /* @__PURE__ */ import_react15.default.createElement("p", { role: "status", className: "dxs-banner is-warn" }, t("gold.unavailable"), " ", /* @__PURE__ */ import_react15.default.createElement("span", { className: "dxs-muted" }, t("gold.unavailable-hint"))) : null, value ? /* @__PURE__ */ import_react15.default.createElement(import_react15.default.Fragment, null, /* @__PURE__ */ import_react15.default.createElement("p", { className: "dxs-muted dxs-gold-meta" }, value.source, " \xB7 ", t("gold.updated", { time: format.time(value.fetchedAt, t) })), /* @__PURE__ */ import_react15.default.createElement("div", { className: "dxs-gold-grid" }, value.instruments.map((instrument) => /* @__PURE__ */ import_react15.default.createElement(InstrumentCard, { key: instrument.key, instrument, t, format, locale }))), /* @__PURE__ */ import_react15.default.createElement(DerivedSummary, { derived: value.derived, t, format }), /* @__PURE__ */ import_react15.default.createElement(Ranges, { series: value.series, t, format }), value.seriesIncomplete ? /* @__PURE__ */ import_react15.default.createElement("p", { className: "dxs-muted" }, t("gold.range.incomplete")) : null, /* @__PURE__ */ import_react15.default.createElement("details", { className: "dxs-gold-notes" }, /* @__PURE__ */ import_react15.default.createElement("summary", null, t("gold.notes.summary")), /* @__PURE__ */ import_react15.default.createElement("p", null, t("gold.notes.unit")), /* @__PURE__ */ import_react15.default.createElement("p", null, t("gold.notes.hours")), /* @__PURE__ */ import_react15.default.createElement("p", null, t("gold.notes.delay")), /* @__PURE__ */ import_react15.default.createElement("p", null, t("gold.notes.advice")), /* @__PURE__ */ import_react15.default.createElement("p", null, t("gold.notes.events")))) : null);
}

// src/client/components.tsx
var tone2 = (value) => value > 0 ? "dxs-up" : value < 0 ? "dxs-down" : "";
function ShortcutHint({ t }) {
  const keys = fixedBarShortcutKeys();
  const label = fixedBarShortcutLabel();
  return /* @__PURE__ */ import_react16.default.createElement("span", { className: "dxs-shortcut" }, /* @__PURE__ */ import_react16.default.createElement("span", { className: "dxs-sr-only" }, t("page.bar-shortcut", { shortcut: label })), /* @__PURE__ */ import_react16.default.createElement("span", { "aria-hidden": "true" }, keys.map((key) => /* @__PURE__ */ import_react16.default.createElement("kbd", { key }, key))));
}
var quoteFor = (snapshot, symbol) => snapshot?.value?.quotes?.find((quote) => quote?.symbol === symbol);
var sourceOf = (snapshot) => snapshot?.value?.source ?? null;
function Status({ snapshot, quote, t, format }) {
  if (snapshot.status === "loading") return /* @__PURE__ */ import_react16.default.createElement("span", { className: "dxs-muted" }, t("status.loading"));
  if (snapshot.status === "failed") return /* @__PURE__ */ import_react16.default.createElement("span", { className: "dxs-muted" }, snapshot.failure?.code ? t(errorKey(snapshot.failure.code), { max: format.count(MAX_WATCHLIST) }) : t("status.failed"));
  return /* @__PURE__ */ import_react16.default.createElement("span", { className: "dxs-muted" }, t(`status.${quoteStatus(quote)}`));
}
function StockChip({ item, quote, snapshot, open, t, format }) {
  const status = quoteStatus(quote);
  return /* @__PURE__ */ import_react16.default.createElement("button", { className: "dxs-chip", onClick: () => open(item.symbol), title: t("chip.title", { symbol: item.symbol, status: t(`status.${status}`) }) }, /* @__PURE__ */ import_react16.default.createElement("strong", null, item.alias || quote?.name || item.symbol), /* @__PURE__ */ import_react16.default.createElement("span", null, format.priceAt(quote?.price, quote?.pricePrecision)), quote?.price != null ? /* @__PURE__ */ import_react16.default.createElement("span", { className: tone2(quote.changePercent) }, format.change(quote.changePercent)) : /* @__PURE__ */ import_react16.default.createElement(Status, { snapshot, quote, t, format }), quote?.price != null && (snapshot.status === "failed" || status === "stale") ? /* @__PURE__ */ import_react16.default.createElement("span", { className: "dxs-muted" }, t("stale")) : null);
}
function FixedStrip({ items, symbols, useResource, open, t, format }) {
  const snapshot = useResource(fixedAddressFor(symbols));
  return /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-strip", "aria-label": t("bar.order") }, items.map((item) => /* @__PURE__ */ import_react16.default.createElement(StockChip, { key: item.symbol, item, quote: quoteFor(snapshot, item.symbol), snapshot, open, t, format })));
}
function StockBar({ useWatchlist, useResource, rpc, collapse, open, hideBar, t, format }) {
  const state = useWatchlist((value) => value);
  const preference = useMarketPreference(rpc);
  const fixed = fixedItems(state.items);
  if (!fixed.length) return null;
  const sourceOff = preference.status === "ready" && !preference.enabled;
  return /* @__PURE__ */ import_react16.default.createElement("section", { className: "dxs dxs-bar", "aria-label": t("bar.aria") }, /* @__PURE__ */ import_react16.default.createElement("button", { onClick: () => collapse(!state.collapsed), "aria-expanded": !state.collapsed, "aria-label": t(state.collapsed ? "bar.expand" : "bar.collapse") }, state.collapsed ? "\u25B8" : "\u25BE", " ", t("bar.title", { count: format.count(fixed.length) })), !state.collapsed && (sourceOff ? /* @__PURE__ */ import_react16.default.createElement("p", { className: "dxs-strip dxs-bar-hint" }, /* @__PURE__ */ import_react16.default.createElement("span", { className: "dxs-muted" }, t("bar.source-off")), /* @__PURE__ */ import_react16.default.createElement(SourceButton, { preference, t })) : /* @__PURE__ */ import_react16.default.createElement(FixedStrip, { key: `${preference.enabled ? "on" : "off"}:${fixed.map((item) => item.symbol).join(",")}`, items: fixed, symbols: fixed.map((item) => item.symbol), useResource, open, t, format })), /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-bar-actions" }, sourceOff ? null : /* @__PURE__ */ import_react16.default.createElement(SourceButton, { preference, t }), /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", className: "dxs-icon-button", onClick: () => hideBar(), title: t("bar.hide-hint", { shortcut: fixedBarShortcutLabel() }), "aria-label": t("bar.hide") }, "\u2715"), /* @__PURE__ */ import_react16.default.createElement("button", { onClick: () => open(state.selectedSymbol) }, t("title"))));
}
function StockIcon({ size: size2 = 20 }) {
  return /* @__PURE__ */ import_react16.default.createElement("svg", { width: size2, height: size2, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ import_react16.default.createElement("path", { d: "M4 4v16h16M7 15l4-5 4 3 5-7", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }));
}
function AddStock({ add, count: count2, fixedCount, ready, rpc, t, format }) {
  const [exchange, setExchange] = (0, import_react16.useState)("SH"), [code, setCode] = (0, import_react16.useState)(""), [alias, setAlias] = (0, import_react16.useState)(""), [fix, setFix] = (0, import_react16.useState)(false), [error, setError] = (0, import_react16.useState)("");
  const [picked, setPicked] = (0, import_react16.useState)(null);
  const submit = (event) => {
    event.preventDefault();
    try {
      add({ symbol: normalizeAShare(exchange, code), alias, fixed: fix });
      setCode("");
      setAlias("");
      setFix(false);
      setError("");
      setPicked(null);
    } catch (failure) {
      setError(errorKey(failure.code));
    }
  };
  const pick = (match) => {
    const [market, digits] = String(match.symbol).split(".");
    setExchange(market);
    setCode(digits);
    setAlias((current) => current.trim() ? current : match.name);
    setPicked(match);
    setError("");
  };
  return /* @__PURE__ */ import_react16.default.createElement("form", { className: "dxs-form", onSubmit: submit, noValidate: true }, /* @__PURE__ */ import_react16.default.createElement("h2", null, t("add.title")), /* @__PURE__ */ import_react16.default.createElement(InstrumentSearch, { rpc, onPick: pick, t }), picked && /* @__PURE__ */ import_react16.default.createElement("p", { className: "dxs-picked", role: "status" }, t("add.selected", { name: picked.name, symbol: picked.symbol, kind: t(`add.kind.${picked.kind}`) })), /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-form-grid" }, /* @__PURE__ */ import_react16.default.createElement("label", { className: "dxs-field" }, t("add.exchange"), /* @__PURE__ */ import_react16.default.createElement("select", { name: "exchange", value: exchange, onChange: (event) => {
    setExchange(event.target.value);
    setPicked(null);
  } }, ["SH", "SZ", "BJ"].map((value) => /* @__PURE__ */ import_react16.default.createElement("option", { key: value, value }, t(`exchange.${value}`))))), /* @__PURE__ */ import_react16.default.createElement("label", { className: "dxs-field" }, t("add.code"), /* @__PURE__ */ import_react16.default.createElement("input", { name: "code", value: code, onChange: (event) => {
    setCode(event.target.value);
    setPicked(null);
  }, inputMode: "numeric", maxLength: 6, placeholder: "600519", required: true, pattern: "[0-9]{6}" }))), /* @__PURE__ */ import_react16.default.createElement("label", { className: "dxs-field" }, t("add.alias"), /* @__PURE__ */ import_react16.default.createElement("input", { name: "alias", value: alias, onChange: (event) => setAlias(event.target.value), maxLength: 24, placeholder: t("add.alias.placeholder") })), /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-form-submit" }, /* @__PURE__ */ import_react16.default.createElement("label", { className: "dxs-check" }, /* @__PURE__ */ import_react16.default.createElement("input", { type: "checkbox", name: "fixed", checked: fix, disabled: fixedCount >= MAX_FIXED, onChange: (event) => setFix(event.target.checked) }), " ", t("add.fix", { max: format.count(MAX_FIXED) })), /* @__PURE__ */ import_react16.default.createElement("button", { type: "submit", className: "dxs-primary", disabled: !ready || count2 >= MAX_WATCHLIST }, t("add.submit", { count: format.count(count2) }))), error && /* @__PURE__ */ import_react16.default.createElement("p", { role: "alert", className: "dxs-error" }, t(error, { max: format.count(error === "error.fixed-limit" ? MAX_FIXED : MAX_WATCHLIST) })));
}
function Detail({ item, useResource, t, format, scope, locale, rpc }) {
  const snapshot = useResource(addressFor(item.symbol)), quote = quoteFor(snapshot, item.symbol);
  const changeTone2 = tone2(quote?.changePercent);
  return /* @__PURE__ */ import_react16.default.createElement("article", { "aria-label": t("detail.aria", { symbol: item.symbol }) }, /* @__PURE__ */ import_react16.default.createElement("section", { className: "dxs-section dxs-instrument-summary" }, /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-quote-identity" }, /* @__PURE__ */ import_react16.default.createElement("h2", null, item.alias || quote?.name || item.symbol), /* @__PURE__ */ import_react16.default.createElement("p", { className: "dxs-symbol-line" }, /* @__PURE__ */ import_react16.default.createElement("span", { className: "dxs-symbol" }, item.symbol), item.alias ? t("detail.alias") : "", item.fixed ? t("detail.fixed") : "")), /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-quote-figures" }, /* @__PURE__ */ import_react16.default.createElement("div", { className: `dxs-price ${changeTone2}` }, format.priceAt(quote?.price, quote?.pricePrecision)), /* @__PURE__ */ import_react16.default.createElement("div", { className: `dxs-change ${changeTone2}` }, format.change(quote?.changePercent)), /* @__PURE__ */ import_react16.default.createElement("p", { className: "dxs-status-line" }, /* @__PURE__ */ import_react16.default.createElement(Status, { snapshot, quote, t, format }))), /* @__PURE__ */ import_react16.default.createElement("details", { className: "dxs-quote-metadata" }, /* @__PURE__ */ import_react16.default.createElement("summary", null, t("detail.source")), /* @__PURE__ */ import_react16.default.createElement("dl", null, /* @__PURE__ */ import_react16.default.createElement("dt", null, t("detail.source")), /* @__PURE__ */ import_react16.default.createElement("dd", null, sourceOf(snapshot) || t("detail.no-source")), /* @__PURE__ */ import_react16.default.createElement("dt", null, t("detail.quoted-at")), /* @__PURE__ */ import_react16.default.createElement("dd", null, format.time(quote?.quotedAt, t)), /* @__PURE__ */ import_react16.default.createElement("dt", null, t("detail.fetched-at")), /* @__PURE__ */ import_react16.default.createElement("dd", null, format.time(quote?.fetchedAt, t))), /* @__PURE__ */ import_react16.default.createElement("p", { className: "dxs-muted" }, t("detail.time-notice")))), /* @__PURE__ */ import_react16.default.createElement(StockWorkbench, { key: `${scope}:${item.symbol}`, symbol: item.symbol, scope, t, format, locale, rpc }), /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-secondary" }, /* @__PURE__ */ import_react16.default.createElement("details", { className: "dxs-section" }, /* @__PURE__ */ import_react16.default.createElement("summary", null, t("detail.fundamentals")), /* @__PURE__ */ import_react16.default.createElement("p", null, t("detail.no-fundamentals")), /* @__PURE__ */ import_react16.default.createElement("p", { className: "dxs-muted" }, t("detail.fundamentals-notice"))), /* @__PURE__ */ import_react16.default.createElement("details", { className: "dxs-section" }, /* @__PURE__ */ import_react16.default.createElement("summary", null, t("detail.analysis")), /* @__PURE__ */ import_react16.default.createElement("p", null, t("detail.no-analysis")), /* @__PURE__ */ import_react16.default.createElement("p", { className: "dxs-muted" }, t("detail.analysis-notice")))));
}
function StockPage({ useWatchlist, useResource, rpc, add, remove, move, select, setFixed, toggleBar, back, retryScope, t, format, getLocale = () => "en" }) {
  const state = useWatchlist((value) => value);
  const preference = useMarketPreference(rpc);
  const item = state.items.find((entry) => entry.symbol === state.selectedSymbol) ?? state.items[0];
  const fixedCount = fixedItems(state.items).length;
  const [view, setView] = (0, import_react16.useState)("watchlist");
  const [fixError, setFixError] = (0, import_react16.useState)("");
  const [drillNotice, setDrillNotice] = (0, import_react16.useState)("");
  const previousSelection = (0, import_react16.useRef)(state.selectedSymbol);
  (0, import_react16.useEffect)(() => {
    if (state.selectedSymbol && state.selectedSymbol !== previousSelection.current) setView("watchlist");
    previousSelection.current = state.selectedSymbol;
  }, [state.selectedSymbol]);
  const openStock = (symbol, name) => {
    if (typeof symbol !== "string" || !/^(SH|SZ|BJ)\.\d{6}$/.test(symbol)) {
      setDrillNotice(t("market.drill.no-symbol"));
      return;
    }
    const known = state.items.some((entry) => entry.symbol === symbol);
    try {
      if (!known) {
        add({ symbol, alias: name, fixed: false });
      } else {
        select(symbol);
      }
      setDrillNotice(t(known ? "market.drill.opened" : "market.drill.added", { name: name || symbol }));
      setView("watchlist");
    } catch (failure) {
      setDrillNotice(errorKey(failure?.code));
    }
  };
  const toggleFix = (entry) => {
    try {
      setFixed(entry.symbol, !entry.fixed);
      setFixError("");
    } catch (failure) {
      setFixError(errorKey(failure.code));
    }
  };
  const sourceOff = preference.status === "ready" && !preference.enabled;
  return /* @__PURE__ */ import_react16.default.createElement("main", { className: "dxs dxs-page" }, /* @__PURE__ */ import_react16.default.createElement("header", { className: "dxs-titlebar", "data-window-drag": true }, /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-brand" }, /* @__PURE__ */ import_react16.default.createElement(StockIcon, { size: 16 }), /* @__PURE__ */ import_react16.default.createElement("h1", null, t("title")), /* @__PURE__ */ import_react16.default.createElement("span", { className: "dxs-context" }, view === "market" ? t("market.subtitle") : view === "global" ? t("global.subtitle") : view === "gold" ? t("gold.subtitle") : t("page.subtitle"))), /* @__PURE__ */ import_react16.default.createElement("nav", { className: "dxs-view-tabs", "aria-label": t("page.view.aria") }, /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", "aria-pressed": view === "watchlist", onClick: () => setView("watchlist") }, t("page.view.watchlist")), /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", "aria-pressed": view === "market", onClick: () => setView("market") }, t("page.view.market")), /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", "aria-pressed": view === "global", onClick: () => setView("global") }, t("global.view.tab")), /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", "aria-pressed": view === "gold", onClick: () => setView("gold") }, t("gold.view.tab"))), /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-header-actions" }, /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", onClick: back }, t("page.back")))), /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-body" }, drillNotice ? /* @__PURE__ */ import_react16.default.createElement("p", { role: "status", className: "dxs-banner" }, drillNotice) : null, view === "gold" ? /* @__PURE__ */ import_react16.default.createElement(GoldView, { rpc, t, format, locale: getLocale(), preference }) : view === "global" ? /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-stage dxs-stage-market" }, /* @__PURE__ */ import_react16.default.createElement(GlobalView, { rpc, t, format, locale: getLocale() })) : view === "market" ? /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-stage dxs-stage-market" }, /* @__PURE__ */ import_react16.default.createElement(MarketView, { rpc, t, format, locale: getLocale(), scope: state.scopeId, onOpenStock: openStock }), /* @__PURE__ */ import_react16.default.createElement("p", { className: "dxs-muted dxs-stage-hint" }, t("market.drill.hint"))) : /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, sourceOff ? /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-banner is-warn dxs-source-card" }, /* @__PURE__ */ import_react16.default.createElement("div", null, /* @__PURE__ */ import_react16.default.createElement("strong", null, t("source.off-title", { max: format.count(MAX_FIXED) })), /* @__PURE__ */ import_react16.default.createElement("p", { className: "dxs-muted" }, t("source.off-notice")), preference.status === "error" ? /* @__PURE__ */ import_react16.default.createElement("p", { role: "alert", className: "dxs-error" }, t("source.unavailable")) : null), /* @__PURE__ */ import_react16.default.createElement(SourceButton, { preference, t, large: true })) : preference.status === "error" ? /* @__PURE__ */ import_react16.default.createElement("p", { role: "alert", className: "dxs-banner dxs-error" }, t("source.unavailable")) : null, state.placement === "occupied" && /* @__PURE__ */ import_react16.default.createElement("p", { role: "status", className: "dxs-banner" }, t("page.occupied")), state.barHidden && /* @__PURE__ */ import_react16.default.createElement("p", { role: "status", className: "dxs-banner" }, t("page.bar-hidden"), " ", /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", onClick: () => toggleBar() }, t("page.bar-show"))), state.scopeStatus === "loading" && /* @__PURE__ */ import_react16.default.createElement("p", { role: "status", className: "dxs-banner" }, t("page.scope-loading")), state.scopeStatus === "failed" && /* @__PURE__ */ import_react16.default.createElement("p", { className: "dxs-banner" }, /* @__PURE__ */ import_react16.default.createElement("button", { onClick: retryScope }, t("page.scope-retry"))), state.storageError && /* @__PURE__ */ import_react16.default.createElement("p", { role: "alert", className: "dxs-banner dxs-error" }, t(errorKey(state.storageError), { max: format.count(MAX_WATCHLIST) })), /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-layout" }, /* @__PURE__ */ import_react16.default.createElement("aside", { className: "dxs-rail", "aria-label": t("page.manage") }, /* @__PURE__ */ import_react16.default.createElement("header", { className: "dxs-rail-head" }, /* @__PURE__ */ import_react16.default.createElement("h2", null, t("page.my-watchlist")), /* @__PURE__ */ import_react16.default.createElement("p", { className: "dxs-counts" }, t("page.counts", { count: format.count(state.items.length), fixed: format.count(fixedCount), max: format.count(MAX_FIXED) }))), /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-rail-list" }, !state.items.length && /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-empty" }, /* @__PURE__ */ import_react16.default.createElement("p", { className: "dxs-muted" }, t("page.empty")), /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", onClick: () => setView("market") }, t("page.view.market-hint"))), /* @__PURE__ */ import_react16.default.createElement("ol", { className: "dxs-list" }, state.items.map((entry, index) => /* @__PURE__ */ import_react16.default.createElement("li", { key: entry.symbol, className: item?.symbol === entry.symbol ? "is-selected" : void 0 }, /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", className: "dxs-select", "aria-pressed": item?.symbol === entry.symbol, onClick: () => select(entry.symbol) }, /* @__PURE__ */ import_react16.default.createElement("span", { className: "dxs-row-name" }, /* @__PURE__ */ import_react16.default.createElement("strong", null, entry.alias || entry.symbol), entry.fixed ? /* @__PURE__ */ import_react16.default.createElement("span", { className: "dxs-fixed-mark" }, t("page.fixed")) : null), /* @__PURE__ */ import_react16.default.createElement("span", { className: "dxs-row-meta" }, entry.alias ? /* @__PURE__ */ import_react16.default.createElement("span", { className: "dxs-muted" }, entry.symbol) : null)), /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-controls" }, /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", className: "dxs-icon-button", disabled: index === 0, "aria-label": t("page.move-up", { symbol: entry.symbol }), onClick: () => move(entry.symbol, -1) }, "\u2191"), /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", className: "dxs-icon-button", disabled: index === state.items.length - 1, "aria-label": t("page.move-down", { symbol: entry.symbol }), onClick: () => move(entry.symbol, 1) }, "\u2193"), /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", className: "dxs-icon-button", "aria-pressed": entry.fixed, "aria-label": t(entry.fixed ? "page.unfix-aria" : "page.fix-aria", { symbol: entry.symbol }), title: entry.fixed ? t("page.unfix") : t("page.fix"), onClick: () => toggleFix(entry) }, entry.fixed ? "\u2605" : "\u2606"), /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", className: "dxs-icon-button dxs-remove", "aria-label": t("page.remove-aria", { symbol: entry.symbol }), title: t("page.remove"), onClick: () => remove(entry.symbol) }, "\u2715"))))), fixError && /* @__PURE__ */ import_react16.default.createElement("p", { role: "alert", className: "dxs-error" }, t(fixError, { max: format.count(MAX_FIXED) }))), /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-rail-foot" }, /* @__PURE__ */ import_react16.default.createElement("p", { className: "dxs-bar-toggle" }, state.barHidden ? /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", onClick: () => toggleBar() }, t("page.bar-show")) : /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", onClick: () => toggleBar() }, t("page.bar-hide")), /* @__PURE__ */ import_react16.default.createElement(ShortcutHint, { t })), /* @__PURE__ */ import_react16.default.createElement(AddStock, { add, count: state.items.length, fixedCount, ready: state.scopeStatus === "ready", rpc, t, format }), /* @__PURE__ */ import_react16.default.createElement("details", { className: "dxs-fineprint" }, /* @__PURE__ */ import_react16.default.createElement("summary", null, t("page.notes")), !sourceOff ? /* @__PURE__ */ import_react16.default.createElement("p", null, t("page.notice")) : null, /* @__PURE__ */ import_react16.default.createElement("p", null, t("page.fixed-hint", { max: format.count(MAX_FIXED) })), /* @__PURE__ */ import_react16.default.createElement("p", null, t("add.notice"))))), /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-stage" }, state.scopeStatus === "ready" && (item ? /* @__PURE__ */ import_react16.default.createElement(Detail, { key: `${state.scopeId}:${preference.enabled}:${item.symbol}`, item, useResource, t, format, scope: state.scopeId, locale: getLocale(), rpc }) : /* @__PURE__ */ import_react16.default.createElement("div", { className: "dxs-stage-empty" }, /* @__PURE__ */ import_react16.default.createElement("h2", null, t("page.select")), /* @__PURE__ */ import_react16.default.createElement("p", { className: "dxs-muted" }, t("page.select-hint")), /* @__PURE__ */ import_react16.default.createElement(StockWorkbench, { key: state.scopeId, scope: state.scopeId, t, format, locale: getLocale(), rpc }))))))));
}

// src/client/chart/styles.ts
var CHART_CSS = `
.dxs-chart{--dxc-bg:#fff;--dxc-fg:#26334a;--dxc-muted:#5d6b80;--dxc-border:#d9dfea;--dxc-soft:#f5f7fb;--dxc-focus:#3768d6;color:var(--dxc-fg);min-width:0;border:1px solid var(--dxc-border);border-radius:12px;overflow:hidden;background:var(--dxc-bg)}
.dxs-chart[data-chart-theme=dark]{--dxc-bg:#151c2a;--dxc-fg:#d6dfef;--dxc-muted:#a3b2ca;--dxc-border:#38465e;--dxc-soft:#202a3d;--dxc-focus:#88aaff}
.dxs-chart button,.dxs-chart input,.dxs-chart select{background:var(--dxc-bg);color:var(--dxc-fg);border-color:var(--dxc-border)}.dxs-chart button:hover{background:var(--dxc-soft)}.dxs-chart button:focus-visible,.dxs-chart input:focus-visible,.dxs-chart select:focus-visible{outline-color:var(--dxc-focus)}
.dxs-chart-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dxc-border)}.dxs-chart-toolbar h3{font-size:13px;margin:0 10px 0 0}.dxs-chart-group{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dxs-chart-group label{display:inline-flex;gap:5px;align-items:center;white-space:nowrap}.dxs-chart-group input[type=checkbox]{width:auto;accent-color:var(--dxc-focus)}.dxs-chart-toolbar .dxs-chart-actions{margin-left:auto;display:flex;gap:5px;flex-wrap:wrap}
.dxs-chart-pane-labels{display:flex;flex-wrap:wrap;gap:8px 18px;padding:7px 12px;color:var(--dxc-muted);font-size:11px;border-bottom:1px solid var(--dxc-border)}.dxs-chart-pane-labels button{font-size:11px;padding:2px 5px}.dxs-chart-line[aria-pressed=false]{opacity:.55;text-decoration:line-through}.dxs-chart-swatch{display:inline-block;width:12px;height:2px;vertical-align:middle;margin-right:4px}
.dxs-chart-readout{padding:9px 12px;min-height:77px;display:flex;gap:5px 16px;align-content:center;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--dxc-border);font-variant-numeric:tabular-nums}.dxs-chart-readout header{display:flex;align-items:center;gap:8px;width:100%;font-size:12px}.dxs-chart-readout dl{display:flex;gap:5px 14px;flex-wrap:wrap;margin:0;font-size:12px}.dxs-chart-readout dl div{display:flex;gap:4px}.dxs-chart-readout dt{color:var(--dxc-muted)}.dxs-chart-readout dd{margin:0}.dxs-chart-readout button{padding:2px 6px;font-size:11px}.dxs-chart-status{font-size:11px;padding:1px 5px;border:1px solid var(--dxc-border);border-radius:4px}.dxs-chart-status[data-locked=true]{background:var(--dxc-soft)}
.dxs-chart-plot{position:relative;min-width:0}.dxs-chart-canvas{height:clamp(460px,calc(100dvh - 420px),720px);width:100%;position:relative;outline:none;touch-action:pan-y}.dxs-chart-canvas:focus-visible{outline:2px solid var(--dxc-focus);outline-offset:-2px}.dxs-chart-watermark{position:absolute;top:20%;left:12%;right:12%;text-align:center;pointer-events:none;z-index:2;color:var(--dxc-muted);opacity:.26;line-height:1.4;font-size:clamp(17px,3vw,34px);font-weight:750;letter-spacing:2px;user-select:none}.dxs-chart-watermark[data-kind=local]{top:10px;left:12px;right:auto;text-align:left;font-size:10px;opacity:.8;letter-spacing:.6px}.dxs-chart-help,.dxs-chart-method,.dxs-chart-warning{font-size:11px;color:var(--dxc-muted);padding:0 12px;margin:8px 0!important}.dxs-chart-warning{font-weight:600}.dxs-chart-error{padding:20px;color:var(--dsw-alias-state-error-primary,#cf3b4c)}
.dxs-chart-settings{margin:10px 12px;padding:12px;border:1px solid var(--dxc-border);border-radius:8px;background:var(--dxc-soft)}.dxs-chart-settings h4{margin:0 0 10px}.dxs-chart-settings-grid{display:grid;grid-template-columns:repeat(4,minmax(90px,1fr));gap:10px}.dxs-chart-settings-grid label{font-size:12px;display:grid;gap:4px}.dxs-chart-settings footer{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}.dxs-chart-settings footer button:first-child{margin-right:auto}
.dxs-chart-table-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border-top:1px solid var(--dxc-border)}.dxs-chart-table-controls span{font-size:11px;color:var(--dxc-muted)}.dxs-chart-table-scroll{overflow:auto;max-height:380px;border-top:1px solid var(--dxc-border)}.dxs-chart-table{border-collapse:collapse;white-space:nowrap;font-size:11px;min-width:100%;font-variant-numeric:tabular-nums}.dxs-chart-table caption{text-align:left;padding:10px;font-weight:600}.dxs-chart-table th,.dxs-chart-table td{padding:7px 9px;text-align:right;border-bottom:1px solid var(--dxc-border)}.dxs-chart-table thead th{position:sticky;top:0;background:var(--dxc-soft);z-index:1}.dxs-chart-table tbody th{text-align:left}.dxs-chart-table tbody tr[aria-selected=true]{background:var(--dxc-soft)}.dxs-chart-toolbar button,.dxs-chart-settings footer button,.dxs-chart-table-controls button{height:28px;padding:0 10px;font-size:12px;border-radius:6px}.dxs-chart-table button,.dxs-chart-pane-labels button,.dxs-chart-readout button{height:24px;padding:0 8px;font-size:12px;border-radius:6px}.dxs-chart-credit{padding:6px 12px;text-align:right;font-size:10px}.dxs-chart-credit a{color:var(--dxc-muted)}
.dxs-intraday-legend{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin:0 0 6px;font-size:12px;color:var(--dxs-muted)}.dxs-intraday-legend i{display:inline-block;width:14px;height:2px;margin-right:5px;vertical-align:middle;background:var(--dxs-muted)}.dxs-intraday-legend i.is-dashed{background:linear-gradient(90deg,var(--dxs-muted) 40%,transparent 40% 60%,var(--dxs-muted) 60%)}.dxs-intraday-plot{position:relative}.dxs-intraday-canvas{height:360px;width:100%}.dxs-intraday-volume{position:absolute;left:8px;bottom:28px;font-size:11px;color:var(--dxs-muted);pointer-events:none}
.dxs-quant{margin-top:12px;padding:12px;border:1px solid var(--dxs-line-soft);border-radius:12px;background:var(--dxs-bg)}.dxs-quant h3,.dxs-quant h4{margin:0 0 4px;font-size:13px}.dxs-quant p{margin:4px 0}.dxs-quant-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:8px}.dxs-quant article{padding:10px;border-radius:8px;background:var(--dxs-soft)}
@media(max-width:650px){.dxs-chart-canvas{height:560px}.dxs-quant-grid{grid-template-columns:1fr}.dxs-chart-toolbar{padding:8px}.dxs-chart-toolbar .dxs-chart-actions{margin-left:0}.dxs-chart-readout{padding:8px;min-height:110px}.dxs-chart-settings-grid{grid-template-columns:repeat(2,minmax(90px,1fr))}.dxs-chart-help{font-size:10px}.dxs-chart-pane-labels{gap:6px 12px}}
`;

// src/client/market/styles.ts
var MARKET_CSS = `
.dxs-view-tabs{display:flex;align-items:center;gap:2px;height:28px;padding:2px;border:1px solid var(--dsw-alias-border-l1,#eceef1);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f4f4f5);flex:none}
.dxs .dxs-view-tabs button{height:24px;border:0;border-radius:6px;background:transparent;padding:0 10px;font-size:12px;color:var(--dsw-alias-label-secondary,#717885);line-height:1;white-space:nowrap;box-shadow:none}
.dxs .dxs-view-tabs button:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary,#202124) 7%,transparent)}
.dxs .dxs-view-tabs button[aria-pressed="true"]{background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#202124);font-weight:600;box-shadow:0 1px 2px #00000014}
.dxs-mkt{display:flex;flex-direction:column;gap:12px;min-width:0;padding:2px 0 24px;color:var(--dsw-alias-label-primary,#202124)}
.dxs-mkt *{box-sizing:border-box}
.dxs-mkt button{font:inherit}
.dxs-mkt-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;min-height:36px;margin:0 0 12px;padding:0}
.dxs-mkt-head>div:first-child{display:flex;align-items:baseline;gap:8px;min-width:0;flex-wrap:wrap}
.dxs-mkt-eyebrow{display:none}
.dxs-mkt-head h2{font-size:13px;font-weight:600;line-height:1.3;margin:0}
.dxs-mkt-head p{margin:0;color:var(--dsw-alias-label-secondary,#666);font-size:12px}
.dxs-mkt-head-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.dxs-mkt-updated{font-size:10px;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap}
.dxs-mkt-status{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:999px;background:var(--dsw-alias-bg-layer-2,#f4f4f5);padding:3px 9px;font-size:10px;line-height:1.6;white-space:nowrap}
.dxs-mkt-status strong{font-size:11px}
.dxs-mkt-status.is-live{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#bc2737) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#bc2737) 8%,var(--dsw-alias-bg-layer-1,#fff))}
.dxs-mkt-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-secondary,#888);flex:none}
.dxs-mkt-status.is-live .dxs-mkt-dot,.dxs-mkt-dot.is-live{background:var(--dsw-alias-state-error-primary,#bc2737);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-error-primary,#bc2737) 18%,transparent)}
.dxs-mkt-warn{color:var(--dsw-alias-state-warn-primary,#a15c00);font-weight:600}
.dxs-mkt-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
.dxs-mkt-kpi{position:relative;min-width:0;min-height:84px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);padding:9px 11px;overflow:hidden}
.dxs-mkt-kpi-label{font-size:9px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dxs-mkt-kpi-value{font-size:20px;font-weight:680;line-height:1.32;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dxs-mkt-kpi-note{font-size:10px;line-height:1.4;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dxs-mkt-kpi-status .dxs-mkt-status{margin-top:5px;max-width:100%;overflow:hidden}
.dxs-mkt-kpi-status .dxs-mkt-kpi-note{white-space:normal}
.dxs-mkt-slash{margin:0 4px;color:var(--dsw-alias-label-secondary,#888)}
.dxs-mkt-card{min-width:0;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);padding:12px 14px}
.dxs-mkt-card h3{font-size:14px;line-height:1.3;margin:0}
.dxs-mkt-card p{margin:3px 0;color:var(--dsw-alias-label-secondary,#666);font-size:11px}
.dxs-mkt-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:9px}
.dxs-mkt-muted{color:var(--dsw-alias-label-secondary,#666);font-size:10px;line-height:1.5}
.dxs-mkt-note{margin:8px 0;padding:7px 10px;border-left:3px solid var(--dsw-alias-brand-primary,#4169e1);border-radius:0 7px 7px 0;background:var(--dsw-alias-bg-layer-2,#f4f4f5);font-size:11px;line-height:1.5}
.dxs-mkt-error{color:var(--dsw-alias-state-error-primary,#bc2737)}
.dxs-up{color:var(--dsw-alias-state-error-primary,#bc2737)}
.dxs-down{color:var(--dsw-alias-state-success-primary,#16784e)}
.dxs-mkt-change{font-variant-numeric:tabular-nums;font-weight:650;white-space:nowrap}
.dxs-mkt-sentiment-score{display:flex;flex-direction:column;align-items:flex-end;line-height:1.1}
.dxs-mkt-sentiment-score strong{font-size:34px;font-variant-numeric:tabular-nums}
.dxs-mkt-sentiment-score span{font-size:12px;font-weight:600}
.dxs-mkt-gauge{margin:4px 0 8px}
.dxs-mkt-gauge-track{position:relative;height:10px;border-radius:999px;background:linear-gradient(90deg,#16784e 0%,#6b7c74 46%,#9a6a60 54%,#bc2737 100%)}
.dxs-mkt-gauge-track span{position:absolute;top:50%;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-bg-layer-1,#fff);border:3px solid var(--dsw-alias-label-primary,#202124);transform:translate(-50%,-50%);box-shadow:0 1px 4px rgba(0,0,0,.3)}
.dxs-mkt-gauge-labels{display:flex;justify-content:space-between;margin-top:4px;color:var(--dsw-alias-label-secondary,#666);font-size:9px}
.dxs-mkt-factors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 18px;margin-top:8px}
.dxs-mkt-factor{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px;align-items:center;font-size:11px}
.dxs-mkt-factor>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxs-mkt-factor strong{font-size:13px;font-variant-numeric:tabular-nums}
.dxs-mkt-factor-weight{font-size:10px;color:var(--dsw-alias-label-secondary,#666)}
.dxs-mkt-factor-bar{grid-column:1/-1;height:4px;border-radius:2px;background:var(--dsw-alias-bg-layer-2,#f4f4f5);overflow:hidden}
.dxs-mkt-factor-bar i{display:block;height:100%;border-radius:2px}
.dxs-mkt-factor-bar i.is-up{background:var(--dsw-alias-state-error-primary,#bc2737)}
.dxs-mkt-factor-bar i.is-down{background:var(--dsw-alias-state-success-primary,#16784e)}
.dxs-mkt-index-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
.dxs-mkt-index{min-width:0;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:9px;background:var(--dsw-alias-bg-layer-2,#f7f7f8);padding:9px 10px}
.dxs-mkt-index header{display:flex;justify-content:space-between;align-items:flex-start;gap:5px}
.dxs-mkt-index h4{font-size:11px;line-height:1.3;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxs-mkt-index header span{font-size:9px;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap}
.dxs-mkt-index-price{font-size:21px;font-weight:680;line-height:1.2;font-variant-numeric:tabular-nums;margin-top:5px}
.dxs-mkt-index-sub{display:flex;justify-content:space-between;gap:5px;font-size:10px;color:var(--dsw-alias-label-secondary,#666);font-variant-numeric:tabular-nums}
.dxs-mkt-range{margin-top:7px}
.dxs-mkt-range-track{position:relative;height:5px;border-radius:3px;background:linear-gradient(90deg,var(--dsw-alias-state-success-primary,#16784e),#8a928c,var(--dsw-alias-state-error-primary,#bc2737));opacity:.85}
.dxs-mkt-range-track span{position:absolute;top:50%;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-primary,#202124);transform:translate(-50%,-50%);border:1px solid var(--dsw-alias-bg-layer-1,#fff)}
.dxs-mkt-range-labels{display:flex;justify-content:space-between;color:var(--dsw-alias-label-secondary,#666);font-size:8px;margin-top:3px;font-variant-numeric:tabular-nums}
.dxs-mkt-ohlc{display:flex;justify-content:space-between;gap:6px;margin:6px 0 0;font-size:9px;color:var(--dsw-alias-label-secondary,#666);font-variant-numeric:tabular-nums}
.dxs-mkt-ohlc div{display:flex;gap:2px;min-width:0}
.dxs-mkt-ohlc dt,.dxs-mkt-ohlc dd{margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dxs-mkt-index footer{display:flex;justify-content:space-between;gap:6px;font-size:8px;color:var(--dsw-alias-label-secondary,#666);margin-top:5px;min-width:0}
.dxs-mkt-index footer>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxs-mkt-index-open{flex:none;color:var(--dsw-alias-brand-primary,#4169e1);white-space:nowrap}
.dxs-mkt-index.is-clickable{cursor:pointer;transition:border-color .15s,box-shadow .15s}
.dxs-mkt-index-chart-actions{display:flex;align-items:center;gap:6px;flex:none}
.dxs-mkt-index.is-clickable:hover{border-color:var(--dsw-alias-brand-primary,#4169e1);box-shadow:0 2px 8px rgba(0,0,0,.08)}
.dxs-mkt-index.is-clickable:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4169e1);outline-offset:2px}
.dxs-mkt-legend{display:flex;align-items:center;gap:3px;color:var(--dsw-alias-label-secondary,#666);font-size:9px;white-space:nowrap}
.dxs-mkt-legend i{display:block;width:14px;height:8px;border-radius:2px}
.dxs-mkt-map{position:relative;width:100%;height:clamp(340px,42vw,560px);border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#f4f4f5)}
.dxs-mkt-group-box{position:absolute;z-index:0;border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#202124) 22%,transparent);border-radius:3px;pointer-events:none}
.dxs-mkt-group-box.is-selected{border-color:var(--dsw-alias-brand-primary,#4169e1);box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary,#4169e1)}
.dxs .dxs-mkt-group-label{position:absolute;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:4px;margin:0;border:0;border-radius:3px 3px 0 0;padding:1px 5px;color:#fff;text-align:left;font-size:10px;line-height:1.5;overflow:hidden;white-space:nowrap;cursor:pointer}
.dxs .dxs-mkt-group-label span:first-child{font-weight:650;overflow:hidden;text-overflow:ellipsis}
.dxs .dxs-mkt-group-label span:last-child{font-variant-numeric:tabular-nums;opacity:.92}
.dxs .dxs-mkt-group-label:disabled{cursor:default}
.dxs .dxs-mkt-tile{position:absolute;z-index:1;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:0;margin:0;border:1px solid rgba(255,255,255,.14);border-radius:2px;padding:2px 4px;color:#fff;text-align:left;line-height:1.12;overflow:hidden;cursor:pointer;text-shadow:0 1px 2px rgba(0,0,0,.32);transition:filter .12s ease}
.dxs .dxs-mkt-tile:hover{filter:brightness(1.14);z-index:3}
.dxs .dxs-mkt-tile:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4169e1);outline-offset:1px;z-index:4}
.dxs .dxs-mkt-tile.is-selected{outline:2px solid #fff;outline-offset:-2px;z-index:3}
.dxs-mkt-tile-name{display:block;max-width:100%;font-size:10px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxs-mkt-tile-pct{display:block;font-size:11px;font-variant-numeric:tabular-nums;opacity:.94}
.dxs-mkt-tile-leader{display:block;max-width:100%;font-size:8px;opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxs .dxs-mkt-tile.size-xs{padding:1px 2px}
.dxs .dxs-mkt-tile.size-xs .dxs-mkt-tile-name{font-size:7px;font-weight:500}
.dxs .dxs-mkt-tile.size-sm .dxs-mkt-tile-name{font-size:8px}
.dxs .dxs-mkt-tile.size-md .dxs-mkt-tile-name{font-size:9px}
.dxs .dxs-mkt-tile.size-lg .dxs-mkt-tile-name{font-size:11px}
.dxs .dxs-mkt-tile.size-lg .dxs-mkt-tile-pct{font-size:13px}
.dxs .dxs-mkt-tile.size-xl{justify-content:center;align-items:center;text-align:center;padding:8px}
.dxs .dxs-mkt-tile.size-xl .dxs-mkt-tile-name{font-size:15px;font-weight:700;white-space:normal;line-height:1.2}
.dxs .dxs-mkt-tile.size-xl .dxs-mkt-tile-pct{font-size:20px}
.dxs .dxs-mkt-tile.size-xl .dxs-mkt-tile-leader{font-size:10px;white-space:normal}
.dxs-mkt-tile-amount{display:block;font-size:9px;opacity:.8;font-variant-numeric:tabular-nums}
.dxs-mkt-table-details{margin-top:7px}
.dxs-mkt-table-details summary,.dxs-mkt-footer summary{cursor:pointer;color:var(--dsw-alias-label-secondary,#666);font-size:10px}
.dxs-mkt-table-wrap{max-width:100%;overflow:auto;margin-top:6px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px}
.dxs-mkt table{width:100%;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}
.dxs-mkt caption{text-align:left;padding:6px 8px;color:var(--dsw-alias-label-secondary,#666);font-size:10px}
.dxs-mkt th{position:sticky;top:0;z-index:1;background:var(--dsw-alias-bg-layer-2,#f4f4f5);padding:5px 8px;text-align:left;color:var(--dsw-alias-label-secondary,#666);font-size:9px;font-weight:650;white-space:nowrap}
.dxs-mkt td{padding:4px 8px;border-top:1px solid var(--dsw-alias-border-l2,#eee);white-space:nowrap}
.dxs-mkt td>span{display:block;max-width:180px;overflow:hidden;text-overflow:ellipsis}
.dxs-mkt td>small{display:block;color:var(--dsw-alias-label-secondary,#888);font-size:9px}
.dxs-mkt tbody tr:hover td{background:var(--dsw-alias-bg-layer-2,#f7f7f8)}
.dxs-mkt tbody tr.is-selected td{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4169e1) 10%,transparent)}
.dxs-mkt-breadth-totals{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:4px 0 8px}
.dxs-mkt-breadth-totals div{display:flex;flex-direction:column;min-width:0}
.dxs-mkt-breadth-totals strong{font-size:18px;line-height:1.2;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}
.dxs-mkt-breadth-totals span{font-size:9px;color:var(--dsw-alias-label-secondary,#666)}
.dxs-mkt-stack{display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#eee);margin:4px 0 12px}
.dxs-mkt-stack span{display:block;height:100%}
.dxs-mkt-stack .is-up,.dxs-mkt-bucket.is-up i{background:var(--dsw-alias-state-error-primary,#bc2737)}
.dxs-mkt-stack .is-down,.dxs-mkt-bucket.is-down i{background:var(--dsw-alias-state-success-primary,#16784e)}
.dxs-mkt-stack .is-flat,.dxs-mkt-bucket.is-flat i{background:#6b7280}
.dxs-mkt-distribution{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:4px;height:108px;align-items:end}
.dxs-mkt-bucket{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:3px;min-width:0}
.dxs-mkt-bucket-count{font-size:8px;color:var(--dsw-alias-label-secondary,#666);font-variant-numeric:tabular-nums;min-height:11px;white-space:nowrap}
.dxs-mkt-bucket i{display:block;width:100%;min-height:2px;border-radius:2px 2px 0 0}
.dxs-mkt-bucket-labels{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:4px;text-align:center;font-size:8px;margin-top:3px}
.dxs-mkt-movers-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.dxs-mkt-movers-grid .dxs-mkt-card{padding:10px 12px}
.dxs-mkt-detail{border-color:var(--dsw-alias-brand-primary,#4169e1)}
.dxs-mkt-detail-stats{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary,#202124)!important;font-variant-numeric:tabular-nums}
.dxs-mkt-stock-map{position:relative;width:100%;height:280px;border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#f4f4f5);margin:6px 0}
.dxs-mkt-selected-stock{font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}
.dxs-mkt-detail-table{max-height:360px;margin-top:8px}
.dxs-mkt-detail-table tbody tr{cursor:pointer;outline-offset:-2px}
.dxs-mkt-detail-table tbody tr:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4169e1)}
.dxs-mkt-setup{max-width:760px;padding:18px}
.dxs-mkt-setup h3{font-size:17px;margin-bottom:6px}
.dxs-mkt-setup p{font-size:12px;line-height:1.6}
.dxs-mkt-setup pre{margin:10px 0;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f4f4f5);font-size:11px;line-height:1.5;overflow:auto}
.dxs-mkt-loading{display:flex;align-items:center;gap:8px;min-height:54px;color:var(--dsw-alias-label-secondary,#666);font-size:12px}
.dxs-mkt-footer{display:flex;flex-direction:column;gap:4px;border-top:1px solid var(--dsw-alias-border-l2,#ddd);padding-top:8px;color:var(--dsw-alias-label-secondary,#666);font-size:10px}
.dxs-mkt-footer p{margin:3px 0;line-height:1.5}
.dxs-mkt-source-switch{display:inline-flex;align-items:center;gap:6px;font-size:10px;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;user-select:none;white-space:nowrap}
.dxs-mkt-source-switch input{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.dxs-mkt-switch-track{position:relative;display:block;width:28px;height:16px;flex:none;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#bbb);background:var(--dsw-alias-bg-layer-2,#eee);transition:background .15s ease,border-color .15s ease}
.dxs-mkt-switch-track span{position:absolute;top:1px;left:1px;width:12px;height:12px;border-radius:50%;background:var(--dsw-alias-label-secondary,#888);transition:transform .15s ease,background .15s ease}
.dxs-mkt-source-switch input:checked+.dxs-mkt-switch-track{background:var(--dsw-alias-brand-primary,#4169e1);border-color:var(--dsw-alias-brand-primary,#4169e1)}
.dxs-mkt-source-switch input:checked+.dxs-mkt-switch-track span{transform:translateX(12px);background:#fff}
.dxs-mkt-source-switch input:focus-visible+.dxs-mkt-switch-track{outline:2px solid var(--dsw-alias-brand-primary,#4169e1);outline-offset:2px}
.dxs-mkt-source-switch input:disabled+.dxs-mkt-switch-track{opacity:.45}
.dxs-mkt-source-switch input:disabled~.dxs-mkt-switch-label{opacity:.55}
.dxs-mkt-source-switch.is-large{font-size:13px;gap:9px;color:var(--dsw-alias-label-primary,#202124)}
.dxs-mkt-source-switch.is-large .dxs-mkt-switch-track{width:40px;height:22px}
.dxs-mkt-source-switch.is-large .dxs-mkt-switch-track span{width:18px;height:18px}
.dxs-mkt-source-switch.is-large input:checked+.dxs-mkt-switch-track span{transform:translateX(18px)}
.dxs-mkt-setup-switch{display:flex;align-items:center;gap:12px;margin:16px 0 4px;flex-wrap:wrap}
.dxs-mkt-manual-config{margin:10px 0}
.dxs-mkt-manual-config summary{cursor:pointer;color:var(--dsw-alias-label-secondary,#666);font-size:10px}
.dxs-mkt-manual-config pre{margin:8px 0;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f4f4f5);font-size:11px;line-height:1.5;overflow:auto}
@media(max-width:1180px){
.dxs-mkt-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}
.dxs-mkt-index-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.dxs-mkt-movers-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:820px){
.dxs-mkt-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
.dxs-mkt-index-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.dxs-mkt-factors{grid-template-columns:1fr}
.dxs-mkt-movers-grid{grid-template-columns:1fr}
.dxs-mkt-map{height:420px}
.dxs-mkt-head{flex-direction:column}
.dxs-mkt-head-actions{justify-content:flex-start}
}
@media(max-width:540px){
.dxs-mkt-kpis,.dxs-mkt-index-grid{grid-template-columns:1fr}
.dxs-mkt-card{padding:10px}
.dxs-mkt-map{height:360px}
.dxs-mkt-distribution{height:88px}
.dxs-mkt-bucket-labels{font-size:6px}
.dxs-mkt-breadth-totals{grid-template-columns:repeat(2,minmax(0,1fr))}
.dxs-mkt-index-price{font-size:19px}
.dxs-mkt-sentiment-score strong{font-size:28px}
}
@media(prefers-reduced-motion:reduce){
.dxs .dxs-mkt-tile{transition:none}
}

.dxs .dxs-mkt-link{display:inline-flex;flex-direction:column;align-items:flex-start;gap:0;height:auto;margin:0;padding:0;border:0;background:none;text-align:left;color:inherit;cursor:pointer;min-width:0}
.dxs-mkt-link:hover h4,.dxs-mkt-link:hover span{text-decoration:underline}
.dxs-mkt-link:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4169e1);outline-offset:2px;border-radius:4px}
.dxs-mkt-index header .dxs-mkt-link h4{font-size:11px;line-height:1.3;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxs-mkt-index header .dxs-mkt-link span{font-size:9px;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap}
.dxs-mkt tbody tr.is-drillable{cursor:pointer}
.dxs .dxs-mkt-drill{height:28px;padding:0 10px;font-size:12px;border:1px solid var(--dsw-alias-border-l2,#bbb);border-radius:6px;background:var(--dsw-alias-bg-layer-1,#fff);white-space:nowrap}
.dxs-mkt-drill:hover{border-color:var(--dsw-alias-brand-primary,#4169e1);color:var(--dsw-alias-brand-primary,#4169e1)}
.dxs .dxs-mkt-open-stock{height:28px;margin-left:10px;padding:0 10px;font-size:12px;border:1px solid var(--dsw-alias-brand-primary,#4169e1);border-radius:6px;color:var(--dsw-alias-brand-primary,#4169e1);background:var(--dsw-alias-bg-layer-1,#fff);white-space:nowrap}
.dxs-mkt-open-stock:hover{background:var(--dsw-alias-brand-primary,#4169e1);color:#fff}
.dxs-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.dxs-data-actions .dxs-view-tabs{align-self:center}
.dxs-adjustment{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary,#666)}
.dxs-adjustment select{width:auto;min-width:0;height:28px;padding:0 8px;font-size:12px}
.dxs-data-banner.is-market{border-color:var(--dsw-alias-brand-primary,#4169e1);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4169e1) 7%,transparent)}
`;

// src/client/watchlist-styles.ts
var WATCHLIST_CSS = `
.dxs-page{background:var(--dxs-soft)}
.dxs-body{display:flex;flex-direction:column;padding:0}
.dxs-titlebar{background:var(--dxs-bg)}
.dxs .dxs-header-actions button{border-color:transparent;background:transparent;color:var(--dxs-muted)}
.dxs .dxs-header-actions button:hover:not(:disabled){background:var(--dxs-soft);color:var(--dxs-fg)}
.dxs-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;margin:0;padding:10px 16px;border-radius:0;background:var(--dxs-bg);border-bottom:1px solid var(--dxs-line-soft)}
.dxs-banner.is-warn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#a15c00) 8%,var(--dxs-bg))}
.dxs-banner strong{font-size:13px}
.dxs-banner p{margin:2px 0 0}
.dxs-banner .dxs-source-enable{flex:none}
.dxs-layout{flex:1;min-height:0;grid-template-columns:minmax(268px,320px) minmax(0,1fr);gap:0;margin:0;align-items:stretch}
.dxs-layout>aside.dxs-rail,.dxs-stage{min-width:0;min-height:0}
.dxs-layout>aside.dxs-rail{max-height:none;overflow:hidden}
.dxs-rail{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--dxs-bg);border-right:1px solid var(--dxs-line-soft)}
.dxs-rail-head{flex:none;padding:14px 14px 6px}
.dxs-rail-head h2{margin:0;font-size:14px;font-weight:650}
.dxs-counts{margin:2px 0 0;color:var(--dxs-muted);font-size:12px;font-variant-numeric:tabular-nums}
.dxs-rail-list{flex:1;min-height:0;overflow:auto;padding:4px 8px 8px}
.dxs-list{margin:0}
.dxs-list li{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;margin:1px 0;border-radius:8px}
.dxs-list li.is-selected{background:color-mix(in srgb,var(--dxs-accent) 10%,var(--dxs-bg))}
.dxs-list li.is-selected::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:2px;background:var(--dxs-accent)}
.dxs .dxs-list .dxs-select{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:1px;width:100%;height:auto;min-height:46px;margin:0;padding:7px 10px 7px 12px;border:0;border-radius:8px;background:transparent;box-shadow:none;text-align:left;white-space:normal;line-height:1.25}
.dxs .dxs-list .dxs-select:hover:not(:disabled){background:transparent}
.dxs .dxs-list li:hover:not(.is-selected){background:color-mix(in srgb,var(--dxs-fg) 4%,var(--dxs-bg))}
.dxs-row-name{display:flex;align-items:center;gap:6px;min-width:0;max-width:100%}
.dxs-row-name strong{font-size:13px;font-weight:640;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dxs-row-meta{display:flex;align-items:center;gap:6px;min-height:16px;font-size:11px;font-variant-numeric:tabular-nums}
.dxs-row-meta:empty{display:none}
.dxs-fixed-mark{display:inline-flex;align-items:center;height:16px;margin:0;padding:0 5px;border-radius:999px;background:color-mix(in srgb,var(--dxs-accent) 12%,var(--dxs-bg));color:var(--dxs-accent);font-size:10px;font-weight:650;line-height:1}
.dxs .dxs-list .dxs-controls{position:static;transform:none;display:flex;gap:1px;margin:0;padding:0 4px 0 0;border-radius:8px;background:transparent;opacity:1;pointer-events:auto}
.dxs .dxs-list .dxs-controls button,.dxs .dxs-list .dxs-controls .dxs-icon-button{width:24px;height:24px;padding:0;border-color:transparent;background:transparent;color:var(--dxs-muted);font-size:12px;border-radius:6px}
.dxs .dxs-list .dxs-controls button:hover:not(:disabled){background:var(--dxs-soft);color:var(--dxs-fg)}
.dxs .dxs-list .dxs-controls button[aria-pressed=true]{border-color:transparent;color:var(--dxs-accent);background:color-mix(in srgb,var(--dxs-accent) 12%,var(--dxs-bg))}
.dxs .dxs-list .dxs-remove:hover:not(:disabled){color:var(--dxs-up);background:color-mix(in srgb,var(--dxs-up) 10%,var(--dxs-bg))}
.dxs-empty{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:8px 6px 12px;padding:14px 12px;border:1px dashed var(--dxs-line);border-radius:10px;background:color-mix(in srgb,var(--dxs-soft) 65%,var(--dxs-bg))}
.dxs-empty p{margin:0}
.dxs .dxs-empty button{border-color:transparent;background:transparent;color:var(--dxs-accent);padding:0;height:auto}
.dxs-rail-foot{flex:none;border-top:1px solid var(--dxs-line-soft);padding:10px 12px 12px;background:var(--dxs-bg)}
.dxs-bar-toggle{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px}
.dxs-shortcut{display:inline-flex;align-items:center;gap:3px}
.dxs-shortcut kbd{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:18px;margin:0;padding:0 4px;border:1px solid var(--dxs-line);border-bottom-width:2px;border-radius:4px;background:var(--dxs-soft);color:var(--dxs-muted);font:inherit;font-size:10px;line-height:1}
.dxs .dxs-bar-toggle button{height:24px;padding:0 2px;border:0;background:transparent;color:var(--dxs-muted)}
.dxs .dxs-bar-toggle button:hover:not(:disabled){color:var(--dxs-fg);background:transparent}
.dxs-rail-foot .dxs-search-results{position:static;bottom:auto;box-shadow:none}
.dxs-form{margin-top:0;gap:8px}
.dxs-form h2{margin:0;font-size:11px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;color:var(--dxs-muted)}
.dxs-form-grid{display:grid;grid-template-columns:minmax(96px,112px) minmax(0,1fr);gap:8px}
.dxs-field{display:grid;gap:4px;min-width:0;font-size:11px;color:var(--dxs-muted)}
.dxs-form-submit{display:flex;flex-direction:column;gap:8px}
.dxs .dxs-form-submit .dxs-primary{width:100%}
.dxs-picked{margin:0;padding:6px 8px;border-radius:8px;background:color-mix(in srgb,var(--dxs-accent) 8%,var(--dxs-bg));color:var(--dxs-fg);font-size:12px}
.dxs-search{gap:4px}
.dxs-search-note{margin:0;font-size:11px;line-height:1.45}
.dxs-rail-foot .dxs-search-results{position:static;z-index:auto;margin-top:4px;box-shadow:none}
.dxs-fineprint{font-size:11px;color:var(--dxs-muted)}
.dxs-fineprint summary{cursor:pointer;width:fit-content}
.dxs-fineprint p{margin:6px 0 0;line-height:1.45}
.dxs-stage{min-width:0;min-height:0;overflow:auto;padding:18px 22px 36px;background:var(--dxs-soft)}
.dxs-stage-market{padding-top:14px}
.dxs-stage-hint{margin:8px 0 0}
.dxs-stage-empty{display:flex;flex-direction:column;gap:8px}
.dxs-stage-empty h2{margin:0;font-size:18px}
.dxs-instrument-summary{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8px 20px;margin:0 0 8px;padding:2px 2px 12px;border:0;border-radius:0;background:transparent}
.dxs-quote-identity{min-width:0}
.dxs-instrument-summary h2{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:22px;font-weight:650;line-height:1.2;letter-spacing:-.01em}
.dxs-symbol-line{display:flex;flex-wrap:wrap;align-items:center;gap:0;margin:4px 0 0;color:var(--dxs-muted);font-size:12px}
.dxs-symbol{font-variant-numeric:tabular-nums;letter-spacing:.02em}
.dxs-quote-figures{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.dxs-instrument-summary .dxs-price{margin:0;font-size:34px;font-weight:650;line-height:1;letter-spacing:-.02em}
.dxs-quote-figures .dxs-change{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:999px;font-size:13px;font-weight:650;font-variant-numeric:tabular-nums;line-height:1}
.dxs-quote-figures .dxs-change.dxs-up{background:color-mix(in srgb,var(--dxs-up) 12%,transparent)}
.dxs-quote-figures .dxs-change.dxs-down{background:color-mix(in srgb,var(--dxs-down) 12%,transparent)}
.dxs-quote-figures .dxs-change:not(.dxs-up):not(.dxs-down){background:var(--dxs-bg);color:var(--dxs-muted)}
.dxs-status-line{margin:0;text-align:right}
.dxs-quote-metadata{grid-column:1/-1}
.dxs-secondary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:14px}
.dxs-secondary .dxs-section{margin:0;padding:10px 12px;border-color:var(--dxs-line-soft);background:var(--dxs-bg)}
.dxs-secondary summary{cursor:pointer;font-weight:600}
.dxs-workbench{margin:8px 0 0;padding:12px 12px 4px;border:1px solid var(--dxs-line-soft);border-radius:12px;background:var(--dxs-bg)}
.dxs-workbench>header{margin-bottom:8px}
.dxs-workbench>header h2{font-size:13px}
.dxs-data-actions{gap:6px}
.dxs-data-banner{border-radius:8px;background:color-mix(in srgb,var(--dxs-accent) 6%,var(--dxs-bg))}
.dxs-chart-empty{margin:10px 0;padding:28px 16px;background:color-mix(in srgb,var(--dxs-soft) 70%,var(--dxs-bg))}
.dxs-chip{height:30px;padding:0 10px;border-color:transparent;border-radius:999px;background:var(--dxs-soft);font-variant-numeric:tabular-nums}
.dxs-chip strong{font-weight:620}
.dxs-bar{min-height:44px;padding:6px 12px;background:var(--dxs-bg)}
@media (hover:none){
.dxs .dxs-list .dxs-controls{padding-right:4px}
}
@media (max-width:760px){
.dxs-layout,.dxs-layout>aside.dxs-rail{grid-template-columns:1fr}
.dxs-layout>aside.dxs-rail{max-height:48vh;border-right:0;border-bottom:1px solid var(--dxs-line-soft)}
.dxs-stage{padding:14px 12px 28px}
.dxs-instrument-summary{grid-template-columns:1fr}
.dxs-quote-figures{align-items:flex-start}
.dxs-status-line{text-align:left}
.dxs-secondary{grid-template-columns:1fr}
.dxs-instrument-summary .dxs-price{font-size:28px}
}
`;

// src/client/gold/styles.ts
var GOLD_CSS = `
.dxs-gold{display:grid;gap:14px}
.dxs-gold-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dxs-gold-head h2{font-size:15px;margin:0}
.dxs-gold-head p{margin:2px 0 0}
.dxs-gold-head-actions{display:flex;align-items:center;gap:8px;flex:none}
.dxs-gold-stale{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--dxs-line);color:var(--dxs-muted)}
.dxs-gold-meta{font-size:11px;margin:0}
.dxs-gold-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}
.dxs-gold-card{padding:12px;border:1px solid var(--dxs-line);border-radius:10px;background:var(--dxs-bg)}
.dxs-gold-card header{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.dxs-gold-card h3{font-size:13px;font-weight:600;margin:0}
.dxs-gold-badge{font-size:11px;color:var(--dxs-muted);border:1px solid var(--dxs-line-soft);border-radius:999px;padding:1px 7px;white-space:nowrap}
.dxs-gold-price{font-size:24px;line-height:1.25;margin-top:6px;font-variant-numeric:tabular-nums}
.dxs-gold-change{margin:0;font-size:12px;font-variant-numeric:tabular-nums}
.dxs-gold-metrics{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:3px 8px;margin:10px 0 6px;font-size:11px;color:var(--dxs-muted)}
.dxs-gold-metrics dt{margin:0}
.dxs-gold-metrics dd{margin:0;text-align:right;color:var(--dxs-fg);font-variant-numeric:tabular-nums}
.dxs-gold-time{font-size:11px;margin:6px 0 0}
.dxs-gold-summary,.dxs-gold-ranges{padding:14px;border:1px solid var(--dxs-line);border-radius:10px}
.dxs-gold-derived{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:4px 0 8px}
.dxs-gold-derived div{display:grid;gap:2px;padding:8px 10px;border-radius:8px;background:var(--dxs-soft)}
.dxs-gold-derived span{font-size:11px;color:var(--dxs-muted)}
.dxs-gold-derived strong{font-size:16px;font-variant-numeric:tabular-nums}
.dxs-gold-derived strong small{font-size:11px;font-weight:400;color:var(--dxs-muted)}
.dxs-gold-derived em{font-size:11px;font-style:normal}
.dxs-gold-table-wrap{overflow-x:auto}
.dxs-gold-table{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}
.dxs-gold-table th,.dxs-gold-table td{text-align:right;padding:6px 8px;border-bottom:1px solid var(--dxs-line-soft);white-space:nowrap}
.dxs-gold-table thead th{font-weight:600;color:var(--dxs-muted);font-size:11px}
.dxs-gold-table th:first-child,.dxs-gold-table tbody th{text-align:left}
.dxs-gold-table tbody tr:last-child th,.dxs-gold-table tbody tr:last-child td{border-bottom:0}
.dxs-gold-notes{font-size:12px;color:var(--dxs-muted)}
.dxs-gold-notes summary{cursor:pointer;color:var(--dxs-fg)}
.dxs-gold-notes p{margin:6px 0}
@media(max-width:650px){.dxs-gold-grid{grid-template-columns:1fr}.dxs-gold-head{flex-direction:column}}
`;

// src/client/global/styles.ts
var GLOBAL_CSS = `
.dxs-glb-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}
.dxs-glb-coverage{margin:0}
.dxs-glb-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
.dxs-glb-card .dxs-mkt-index-price{font-size:19px}
.dxs-glb-identity{display:flex;flex-direction:column;min-width:0;gap:0}
.dxs-glb-sub{flex-direction:column;align-items:flex-start;gap:1px}
.dxs-glb-time{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px}
.dxs-glb-updown{display:flex;gap:10px;font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap}
@media(max-width:1100px){.dxs-glb-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:900px){.dxs-glb-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:820px){.dxs-glb-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:540px){.dxs-glb-grid,.dxs-glb-kpis{grid-template-columns:1fr}}
`;

// src/client/quant/styles.ts
var QUANT_CSS = `
.dxs-quant{margin-top:18px;border-top:1px solid var(--dxs-line);padding-top:14px;display:flex;flex-direction:column;gap:12px;min-width:0}
.dxs-quant-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
.dxs-quant-head h3{font-size:14px;margin:0}
.dxs-quant-head p{margin:2px 0;color:var(--dxs-muted);font-size:11px}
.dxs-quant-badge{flex:none;padding:2px 8px;border:1px solid var(--dxs-line);border-radius:999px;font-size:10px;color:var(--dxs-muted)}
.dxs-quant-muted{color:var(--dxs-muted);font-size:11px;margin:4px 0}
.dxs-quant-stats,.dxs-quant-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}
.dxs-quant-stat{min-width:0;border:1px solid var(--dxs-line);border-radius:8px;background:var(--dxs-soft);padding:8px 10px}
.dxs-quant-stat-label{font-size:9px;letter-spacing:.04em;text-transform:uppercase;color:var(--dxs-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dxs-quant-stat-value{font-size:16px;font-weight:650;line-height:1.3;margin-top:2px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.dxs-quant-stat-note{font-size:9px;color:var(--dxs-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dxs-quant-card{min-width:0;border:1px solid var(--dxs-line);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px}
.dxs-quant-card-head h4{font-size:13px;margin:0}
.dxs-quant-card-head p{margin:2px 0;color:var(--dxs-muted);font-size:10px}
.dxs-quant-table-wrap{overflow:auto;max-width:100%}
.dxs-quant table{width:100%;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}
.dxs-quant caption{text-align:left;color:var(--dxs-muted);font-size:10px;padding-bottom:4px}
.dxs-quant th,.dxs-quant td{padding:4px 6px;border-bottom:1px solid var(--dxs-line-soft);text-align:right;white-space:nowrap}
.dxs-quant th:first-child,.dxs-quant td:first-child{text-align:left}
.dxs-quant thead th{color:var(--dxs-muted);font-weight:600}
.dxs-quant-monthly td.is-empty{color:var(--dxs-muted)}
.dxs-quant-partial{color:var(--dxs-muted);margin-left:2px}
.dxs-quant-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
.dxs-quant-field{display:flex;flex-direction:column;gap:3px;font-size:10px;color:var(--dxs-muted)}
.dxs-quant-field select,.dxs-quant-field input{height:28px;min-width:110px;padding:0 8px;font-size:12px;border:1px solid var(--dxs-line);border-radius:6px;background:var(--dxs-bg);color:var(--dxs-fg)}
.dxs-quant-field input{width:100px;min-width:0}
.dxs-quant-subtitle{font-size:12px;margin:4px 0 0}
.dxs-quant-chart svg{width:100%;height:auto;display:block;background:var(--dxs-soft);border-radius:8px}
.dxs-quant-chart path{fill:none;stroke-width:2;vector-effect:non-scaling-stroke}
.dxs-quant-chart .is-strategy{stroke:var(--dxs-accent)}
.dxs-quant-chart .is-buyhold{stroke:var(--dxs-muted);stroke-dasharray:4 3}
.dxs-quant-chart .is-baseline{stroke:var(--dxs-line);stroke-width:1;stroke-dasharray:2 4}
.dxs-quant-chart .is-axis{fill:var(--dxs-muted);font-size:10px;font-variant-numeric:tabular-nums}
.dxs-quant-legend{display:flex;gap:14px;font-size:10px;color:var(--dxs-muted);margin-top:4px}
.dxs-quant-legend i{display:inline-block;width:16px;height:2px;margin-right:5px;vertical-align:middle}
.dxs-quant-legend i.is-strategy{background:var(--dxs-accent)}
.dxs-quant-legend i.is-buyhold{background:var(--dxs-muted)}
.dxs-quant-details summary{cursor:pointer;font-size:11px;color:var(--dxs-muted)}
.dxs-quant-details ul{margin:6px 0;padding-left:18px;font-size:11px;color:var(--dxs-muted);line-height:1.6}
.dxs-quant-trades{max-height:300px}
.dxs-quant-trades td small{display:block;color:var(--dxs-muted);font-size:9px}
.dxs-quant-open{display:inline-block;margin-left:6px;padding:0 5px;border:1px solid var(--dxs-line);border-radius:999px;font-size:9px;font-style:normal;color:var(--dxs-muted)}
@media(max-width:640px){.dxs-quant-stats,.dxs-quant-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

// src/client/styles.ts
var CSS = `
.dxs{--dxs-bg:var(--dsw-alias-bg-layer-1,#fff);--dxs-soft:var(--dsw-alias-bg-layer-2,#f5f6f8);--dxs-title:var(--dsw-specific-sidebar-fill,var(--dxs-soft));--dxs-line:var(--dsw-alias-border-l2,#e2e5e9);--dxs-line-soft:var(--dsw-alias-border-l1,#eceef1);--dxs-fg:var(--dsw-alias-label-primary,#20252e);--dxs-muted:var(--dsw-alias-label-secondary,#717885);--dxs-accent:var(--dsw-alias-brand-primary,#4666d5);--dxs-up:var(--dsw-alias-state-error-primary,#bb5863);--dxs-down:var(--dsw-alias-state-success-primary,#2b865c);color:var(--dxs-fg);font:13px/1.5 var(--dsw-font-family,system-ui,sans-serif);box-sizing:border-box}.dxs *{box-sizing:border-box}.dxs button,.dxs input,.dxs select{font:inherit;color:inherit}.dxs button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 10px;font-size:12px;line-height:1;cursor:pointer;border:1px solid var(--dxs-line);border-radius:6px;background:var(--dxs-bg);white-space:nowrap}.dxs button:hover:not(:disabled){background:var(--dxs-soft)}.dxs button:focus-visible,.dxs input:focus-visible,.dxs select:focus-visible{outline:2px solid var(--dxs-accent);outline-offset:2px}.dxs button:disabled{opacity:.45;cursor:not-allowed}.dxs .dxs-primary{background:var(--dxs-accent);border-color:transparent;color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:550}.dxs .dxs-primary:hover:not(:disabled){background:color-mix(in srgb,var(--dxs-accent) 88%,#000)}.dxs .dxs-icon-button{width:28px;padding:0}.dxs :is(.dxs-select,.dxs-mkt-link,.dxs-mkt-tile,.dxs-mkt-group-label){height:auto;min-height:0}.dxs-bar{display:flex;align-items:center;gap:8px;width:100%;max-width:100vw;padding:5px 12px;border-top:1px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-alias-bg-layer-1,#fff);min-height:40px}.dxs-strip{display:flex;align-items:center;gap:8px;min-width:0;flex:1;overflow-x:auto;padding:2px}.dxs-chip{display:flex;align-items:center;gap:8px;flex:none}.dxs-muted{color:var(--dsw-alias-label-secondary,#666);font-size:12px}.dxs-up{color:var(--dxs-up)}.dxs-down{color:var(--dxs-down)}.dxs-page{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--dxs-bg)}.dxs-titlebar{display:flex;align-items:center;justify-content:space-between;gap:12px;height:50px;flex:none;padding:0 12px;padding-inline-start:max(12px,var(--dsh-frame-leading-clearance,0px));border-bottom:.5px solid var(--dsw-alias-border-l3,var(--dxs-line-soft));background:var(--dxs-title)}.dxs-brand{display:flex;align-items:center;gap:8px;min-width:0;flex:1}.dxs-brand svg{color:var(--dxs-accent);flex:none}.dxs-brand h1,.dxs h1{font-size:13px;font-weight:600;line-height:1.3;margin:0;letter-spacing:0}.dxs-context{color:var(--dxs-muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-left:1px solid var(--dxs-line-soft);padding-left:8px}.dxs-header-actions{display:flex;align-items:center;gap:6px;flex:none}.dxs-body{flex:1;min-height:0;overflow:auto;padding:16px 20px 28px}.dxs h2{font-size:13px;font-weight:600;margin:0 0 8px}.dxs p{margin:8px 0}.dxs-notice{padding:10px 12px;background:var(--dsw-alias-bg-layer-2,#f4f4f5);border-radius:8px;margin:12px 0}.dxs-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:16px;margin-top:4px}.dxs-list{padding:0;list-style:none}.dxs-list li{margin:8px 0}.dxs-list .dxs-select{width:100%;height:auto;min-height:32px;padding:6px 10px;text-align:left;white-space:normal;justify-content:flex-start}.dxs-controls{display:flex;gap:6px;margin-top:4px;align-items:center;flex-wrap:wrap}.dxs-form{display:grid;gap:8px;margin-top:16px}.dxs input,.dxs select{min-width:0;width:100%;height:28px;padding:0 10px;font-size:12px;background:var(--dxs-bg);border:1px solid var(--dxs-line);border-radius:6px}.dxs-section{padding:18px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;margin-bottom:16px}.dxs-price{font-size:30px;font-variant-numeric:tabular-nums}.dxs dl{display:grid;grid-template-columns:auto 1fr;gap:5px 16px}.dxs dd{margin:0;overflow-wrap:anywhere}.dxs-error{color:var(--dsw-alias-state-error-primary,#bc2737)}@media(max-width:650px){.dxs-body{padding:12px 12px 20px}.dxs-layout{grid-template-columns:1fr}.dxs-bar{padding:4px 8px;gap:6px}.dxs-context{display:none}.dxs-titlebar{gap:8px;padding-inline:8px}}` + CHART_CSS + `
.dxs-file-label{position:relative;cursor:pointer}.dxs-file-label input[type=file]{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden}.dxs-file-label:focus-within{outline:2px solid Highlight;outline-offset:2px}.dxs-instrument-summary{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center}.dxs-instrument-summary h2,.dxs-instrument-summary p{margin:0!important}.dxs-instrument-summary .dxs-price{font-size:22px;margin-left:auto}.dxs-quote-metadata{width:100%;font-size:12px}.dxs-layout{grid-template-columns:220px minmax(0,1fr);gap:16px}.dxs-layout>article{min-width:0}.dxs-workbench{min-width:0;margin-bottom:16px}.dxs-workbench>header{display:flex;align-items:baseline;gap:8px;min-height:28px;margin:0 0 10px}.dxs-workbench>header h2{margin:0}.dxs-workbench>header p{margin:0!important}.dxs-data-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.dxs-file-label{display:inline-flex;align-items:center;gap:6px;height:28px;border:1px solid var(--dxs-line);border-radius:6px;padding:0 10px;font-size:12px;background:var(--dxs-bg)}.dxs-file-label input{max-width:220px;padding:0}.dxs-data-banner{border:1px solid var(--dsw-alias-brand-primary,#4169e1);padding:10px;margin:12px 0;font-weight:600}.dxs-dataset-heading{display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap}.dxs-chart-empty{padding:48px 20px;text-align:center;border:1px dashed var(--dsw-alias-border-l2,#bbb);border-radius:10px;margin:16px 0}.dxs-attribution{font-size:11px;color:var(--dsw-alias-label-secondary,#666)}.dxs-attribution a{color:inherit}.dxs-instrument-summary{padding:12px}.dxs-instrument-summary .dxs-price{font-size:25px}.dxs-instrument-summary dl{font-size:12px;margin:8px 0}.dxs-instrument-summary p{margin:4px 0}.dxs-search{display:grid;gap:6px}.dxs-search>label{font-size:12px;color:var(--dsw-alias-label-secondary,#666)}.dxs-search input[type=search]{width:100%}.dxs-search-results{margin:0;padding:0;list-style:none;max-height:238px;overflow:auto;border:1px solid var(--dsw-alias-border-l2,#bbb);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff)}.dxs-search-results li{display:flex;align-items:center;gap:8px;padding:6px 9px;cursor:pointer;border-bottom:1px solid var(--dsw-alias-border-l2,#eee)}.dxs-search-results li:last-child{border-bottom:0}.dxs-search-results li[aria-selected=true],.dxs-search-results li:hover{background:var(--dsw-alias-bg-layer-2,#f4f4f5)}.dxs-search-symbol{color:var(--dsw-alias-label-secondary,#666);font-size:12px;font-variant-numeric:tabular-nums}.dxs-search-kind{margin-left:auto;font-size:11px;padding:1px 6px;border:1px solid var(--dsw-alias-border-l2,#bbb);border-radius:999px;color:var(--dsw-alias-label-secondary,#666)}@media(max-width:850px){.dxs-layout{grid-template-columns:1fr}.dxs-layout>aside{max-height:280px;overflow:auto}.dxs-body{padding:12px}}
.dxs-check{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary,#666)}.dxs-check input[type=checkbox]{width:auto;height:auto;min-width:0;flex:none}.dxs-bar-actions{display:flex;align-items:center;gap:8px;margin-left:auto}.dxs-bar-hint{margin:0;min-height:28px}.dxs-bar-hint .dxs-muted{white-space:normal}.dxs-source-enable{font-weight:600}.dxs-source-enable.is-large{margin-top:6px}.dxs-source-card strong{display:block;margin-bottom:2px}.dxs-fixed-mark{color:var(--dxs-accent);font-size:11px}.dxs-list .dxs-controls button[aria-pressed=true]{border-color:var(--dxs-accent);color:var(--dxs-accent);background:color-mix(in srgb,var(--dxs-accent) 8%,var(--dxs-bg))}
.dxs-instrument-summary h2{font-size:16px}
${MARKET_CSS}
${WATCHLIST_CSS}
${GOLD_CSS}
${GLOBAL_CSS}
${QUANT_CSS}
`;

// src/client/tool-view.tsx
var import_react17 = __toESM(require("react"), 1);

// src/client/quote-presentation.ts
function readQuotePresentation(meta) {
  if (!meta || meta.kind !== "dsh-x-finance.quote" || meta.version !== 1) return null;
  const quote = meta.quote;
  if (!quote || typeof quote.symbol !== "string" || typeof quote.provider !== "string" || !Number.isFinite(quote.price) || quote.price <= 0 || ["open", "high", "low", "previousClose", "change", "changePercent"].some((key) => quote[key] !== null && !Number.isFinite(quote[key])) || ["quotedAt", "fetchedAt"].some((key) => quote[key] !== null && (typeof quote[key] !== "string" || !Number.isFinite(Date.parse(quote[key]))))) return null;
  return quote;
}

// src/client/tool-view.tsx
function StockToolView({ phase, block, t, format, inspect }) {
  const settled = phase === "result";
  const quote = settled ? readQuotePresentation(block.meta) : null;
  const state = !settled ? phase === "preparing" ? "preparing" : "running" : block.isError ? "failed" : "done";
  const symbol = quote?.symbol ?? block.args?.text("symbol");
  return /* @__PURE__ */ import_react17.default.createElement("section", { className: "dxs dxs-section", "aria-label": t("quote.title") }, /* @__PURE__ */ import_react17.default.createElement("strong", null, t("quote.title"), symbol ? ` \xB7 ${symbol}` : ""), /* @__PURE__ */ import_react17.default.createElement("p", { role: "status" }, t(`quote.${state}`)), settled && block.isError && /* @__PURE__ */ import_react17.default.createElement("p", { role: "alert" }, t(quoteErrorKey(block.error))), quote && !block.isError && /* @__PURE__ */ import_react17.default.createElement(import_react17.default.Fragment, null, /* @__PURE__ */ import_react17.default.createElement("dl", null, ["price", "open", "high", "low", "previousClose", "change", "changePercent"].map((key) => /* @__PURE__ */ import_react17.default.createElement(import_react17.default.Fragment, { key }, /* @__PURE__ */ import_react17.default.createElement("dt", null, t(`quote.${key}`)), /* @__PURE__ */ import_react17.default.createElement("dd", null, key === "changePercent" ? format.change(quote[key]) : format.price(quote[key])))), /* @__PURE__ */ import_react17.default.createElement("dt", null, t("detail.source")), /* @__PURE__ */ import_react17.default.createElement("dd", null, quote.provider), /* @__PURE__ */ import_react17.default.createElement("dt", null, t("detail.quoted-at")), /* @__PURE__ */ import_react17.default.createElement("dd", null, format.time(quote.quotedAt, t)), /* @__PURE__ */ import_react17.default.createElement("dt", null, t("detail.fetched-at")), /* @__PURE__ */ import_react17.default.createElement("dd", null, format.time(quote.fetchedAt, t))), /* @__PURE__ */ import_react17.default.createElement("p", null, t("quote.notice"))), settled && !block.isError && !quote && /* @__PURE__ */ import_react17.default.createElement(import_react17.default.Fragment, null, /* @__PURE__ */ import_react17.default.createElement("p", null, t("quote.legacy")), /* @__PURE__ */ import_react17.default.createElement("pre", { style: { whiteSpace: "pre-wrap" } }, (block.content ?? []).filter((item) => item.type === "text").map((item) => item.text).join("\n"))), inspect && /* @__PURE__ */ import_react17.default.createElement("button", { onClick: inspect }, t("quote.inspect")));
}

// src/client/index.ts
var inject = ["slots", "connection", "resources", "layout", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en: en2 }), "stock: dictionaries");
  const t = ctx.locale.bind(NS);
  const format = createFormatters(() => ctx.locale.getLocale().active);
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({ name: "tool.call.toolview", key: "dsh_x_finance_quote", locale: NS, inject: () => ({ format }) }, StockToolView));
  let storage;
  try {
    storage = globalThis.localStorage;
  } catch {
  }
  const controller = createWatchlistController(storage, globalThis.window);
  let scopeRequest;
  let disposed = false;
  const loadScope = async () => {
    scopeRequest?.abort();
    const request = new AbortController();
    scopeRequest = request;
    controller.scopeLoading();
    const timeout = setTimeout(() => {
      if (!disposed && scopeRequest === request) {
        controller.scopeFailed();
        request.abort();
      }
    }, 1e4);
    try {
      const result = await ctx.connection.rpc.call("/api", SCOPE_ENDPOINT, {}, request.signal);
      if (disposed || request.signal.aborted) return;
      if (!result.ok) throw new Error();
      controller.setScope(result.value.scope);
    } catch {
      if (!disposed && !request.signal.aborted) controller.scopeFailed();
    } finally {
      clearTimeout(timeout);
    }
  };
  ctx.effect(() => () => {
    disposed = true;
    scopeRequest?.abort();
    controller.dispose();
  }, "stock: watchlist");
  ctx.on("connection/reset", () => {
    void loadScope();
  });
  void loadScope();
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = "dsh-x-finance";
    style.textContent = CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, "stock: styles");
  ctx.effect(() => ctx.resources.register(quoteResource(ctx.connection.rpc)), "stock: quote resources");
  const shortcut = (event) => {
    if (!isFixedBarShortcut(event)) return;
    event.preventDefault();
    try {
      controller.toggleBar();
    } catch {
    }
  };
  globalThis.addEventListener?.("keydown", shortcut, true);
  ctx.effect(() => () => globalThis.removeEventListener?.("keydown", shortcut, true), "stock: fixed bar shortcut");
  const face = () => ({
    format,
    rpc: ctx.connection.rpc,
    getLocale: () => ctx.locale.getLocale().active,
    hooks: { watchlist: controller.source },
    retryScope: () => {
      void loadScope();
    },
    add: (item) => {
      controller.add(item);
      controller.select(item.symbol);
    },
    remove: controller.remove,
    move: controller.move,
    select: controller.select,
    collapse: controller.collapse,
    setFixed: controller.setFixed,
    toggleBar: controller.toggleBar,
    hideBar: controller.toggleBar,
    open: (symbol) => {
      if (symbol) controller.select(symbol);
      ctx.layout.selectPanel("dsh-x-finance");
    },
    back: () => ctx.layout.selectPanel(null)
  });
  mountWhenVacant(ctx.slots, { inject: face, locale: NS }, StockBar, {
    onPlacement: controller.setPlacement,
    visible: () => {
      const state = controller.source.getSnapshot();
      return !state.barHidden && fixedItems(state.items).length > 0;
    },
    subscribe: controller.source.subscribe
  });
  ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: "dsh-x-finance", inject: face, locale: NS }, StockPage));
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: "dsh-x-finance", order: 80, label: () => t("title") }, StockIcon));
}
return module.exports; } });
