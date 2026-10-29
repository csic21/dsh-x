/** Fixed Host limits; no RPC option can raise them. All state is process memory. */
export const QUANT_SCAN_LIMITS = Object.freeze({
    stocks: 12_000, pages: 60, pageSize: 200, historyBars: 250, minBars: 120, minAmountSamples: 16,
    batchStocks: 150, concurrency: 2, requestGapMs: 500, batchMs: 90_000,
    cooldownMs: 60_000, sessionMs: 2 * 60 * 60_000, resultTtlMs: 15 * 60_000,
    rows: 30, consecutiveFailures: 5,
});
export const QUANT_SCAN_NOTICE = [
    '手动扫描的进度仅保留在当前 provider 内存；每日后台任务需单独同意并只保存报告。',
    '免费非官方接口无 SLA，可能延迟、限流或缺失；完整仅指本次源清单处理完成，不保证覆盖交易所全部股票。',
    '名称及停牌状态仅来自 rank 快照；不能完整识别风险警示、临时停牌或历史状态变化。',
    '仅在已覆盖、同一末日且关键因子齐全的样本中计算分位；分批和缺失会改变排序，清单按代码推进而非候选预筛。',
    '复权使用实际返回口径；混合复权、公司行动及未确认收盘可能影响比较，未做总回报修正。',
    '流动性取最近20条有效日线中可用金额的中位数，至少16条可用才参与排序；不把缺失金额填成0。',
    '确定性演示评分不是收益概率，不保证盈利；数据和收益均不宣称实时。',
];
export function parseQuantScanRequest(input) {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype)
        throw quantScanError();
    const value = input, keys = Object.keys(value).sort().join(',');
    if ((value.action === 'start' || value.action === 'status') && keys === 'action')
        return { action: value.action };
    if (value.action === 'continue' && keys === 'action,scanId' && typeof value.scanId === 'string'
        && /^[a-zA-Z0-9-]{1,64}$/.test(value.scanId))
        return { action: 'continue', scanId: value.scanId };
    throw quantScanError();
}
const iso = (time) => new Date(time).toISOString();
const today = (time) => iso(time + 8 * 60 * 60_000).slice(0, 10);
export const quantScanError = () => Object.assign(new Error('quant scan unavailable'), { code: 'finance/quant-scan-unavailable' });
export function isQuantSymbol(value) {
    // Only stock identities: never SH.000xxx indices or exchange-traded funds.
    return typeof value === 'string' && /^(?:SH\.6\d{5}|SZ\.[03]\d{5}|BJ\.[489]\d{5})$/.test(value);
}
export function quantDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        && Number.isFinite(Date.parse(value)) && iso(Date.parse(value)).slice(0, 10) === value;
}
const isST = (name) => /^(?:\*?ST|S\*?ST)/i.test(name.trim());
function finite(value, min = -Number.MAX_VALUE, max = Number.MAX_VALUE) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function median(values) {
    if (!values.length)
        return null;
    values.sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}
/** Average tied rank / (n-1); a singleton and an all-tied cohort receive 0.5. */
export function quantPercentiles(values) {
    if (!values.every(Number.isFinite))
        throw quantScanError();
    if (values.length === 1)
        return [0.5];
    const ordered = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
    const ranks = new Array(values.length);
    for (let start = 0; start < ordered.length;) {
        let end = start + 1;
        while (end < ordered.length && ordered[end].value === ordered[start].value)
            end++;
        const rank = (start + end - 1) / 2 / (ordered.length - 1);
        for (let i = start; i < end; i++)
            ranks[ordered[i].index] = rank;
        start = end;
    }
    return ranks;
}
/** A malformed series is not ranked; missing turnover remains null. */
export function quantSample(history, stock, now) {
    if (history.symbol !== stock.symbol || !['none', 'forward', 'backward'].includes(history.adjustment)
        || history.currency !== 'CNY' || history.amountUnit !== 'CNY'
        || !finite(Date.parse(history.fetchedAt), 0, now + 300_000)
        || !Array.isArray(history.bars) || history.bars.length > QUANT_SCAN_LIMITS.historyBars)
        throw quantScanError();
    const bars = [];
    let previous = '';
    for (let index = 0; index < history.bars.length; index++) {
        const bar = history.bars[index];
        if (!bar || !quantDate(bar.sessionDate) || bar.sessionDate > today(now) || bar.sessionDate <= previous)
            return null;
        if (![bar.open, bar.high, bar.low, bar.close].every(value => finite(value, Number.MIN_VALUE, 1e12)))
            return null;
        if (bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close) || bar.low > bar.high)
            return null;
        if (typeof bar.isFinal !== 'boolean' || (index < history.bars.length - 1 && !bar.isFinal))
            return null;
        previous = bar.sessionDate;
        bars.push(bar);
    }
    if (!bars.length)
        throw quantScanError();
    if (bars.length < QUANT_SCAN_LIMITS.minBars)
        return null;
    const last = bars.at(-1);
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const returns = bars.slice(-20).map((bar, i) => bar.close / bars[bars.length - 21 + i].close - 1);
    const averageReturn = mean(returns);
    const amounts = bars.slice(-20).map(bar => bar.amount).filter((amount) => finite(amount, 0, Number.MAX_SAFE_INTEGER));
    const factors = {
        close: last.close,
        ma20: mean(bars.slice(-20).map(bar => bar.close)), ma60: mean(bars.slice(-60).map(bar => bar.close)),
        return20: last.close / bars.at(-21).close - 1, return60: last.close / bars.at(-61).close - 1,
        amountMedian20: median(amounts), amountSamples20: amounts.length,
        // Population standard deviation of 20 simple daily returns, not annualized.
        volatility20: Math.sqrt(mean(returns.map(value => (value - averageReturn) ** 2))),
    };
    return {
        symbol: stock.symbol, name: stock.name ?? stock.symbol, sessionDate: last.sessionDate,
        fetchedAt: history.fetchedAt, adjustment: history.adjustment,
        // Today's source has no authoritative closing flag, even after 15:00.
        provisional: last.isFinal !== true || last.sessionDate === today(now), validBars: bars.length, factors,
    };
}
export function quantExplanation(row) {
    const { factors: f, scores: s } = row;
    return [
        `趋势 ${s.trend}/30：价格${f.close > f.ma20 ? '高于' : '不高于'}MA20，${f.close > f.ma60 ? '高于' : '不高于'}MA60`,
        `动量 ${s.momentum.toFixed(2)}/30：20/60日涨幅 ${(f.return20 * 100).toFixed(2)}% / ${(f.return60 * 100).toFixed(2)}% 的样本分位`,
        `流动性 ${s.liquidity.toFixed(2)}/20：近20日金额中位数，${f.amountSamples20}/20条可用`,
        `风险 ${s.risk.toFixed(2)}/20：20日简单收益总体标准差 ${(f.volatility20 * 100).toFixed(2)}% 的倒序分位`,
    ];
}
export function rankQuantSamples(samples) {
    const cohort = samples.filter(sample => sample.factors.amountMedian20 !== null
        && sample.factors.amountSamples20 >= QUANT_SCAN_LIMITS.minAmountSamples
        && Object.values(sample.factors).every(value => typeof value === 'number' && Number.isFinite(value)));
    const r20 = quantPercentiles(cohort.map(s => s.factors.return20));
    const r60 = quantPercentiles(cohort.map(s => s.factors.return60));
    const amount = quantPercentiles(cohort.map(s => s.factors.amountMedian20));
    const risk = quantPercentiles(cohort.map(s => -s.factors.volatility20));
    return cohort.map((sample, i) => {
        const f = sample.factors;
        const scores = { trend: (f.close > f.ma20 ? 15 : 0) + (f.close > f.ma60 ? 15 : 0),
            momentum: (r20[i] + r60[i]) * 15, liquidity: amount[i] * 20, risk: risk[i] * 20 };
        return { ...sample, score: Object.values(scores).reduce((a, b) => a + b, 0), scores,
            percentiles: { return20: r20[i], return60: r60[i], amountMedian20: amount[i], lowVolatility20: risk[i] },
            explanation: quantExplanation({ factors: f, scores }) };
    }).sort((a, b) => b.score - a.score || (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
}
function abortable(work, signal) {
    return new Promise((resolve, reject) => {
        const abort = () => reject(quantScanError());
        if (signal.aborted) {
            work.catch(() => { });
            abort();
            return;
        }
        signal.addEventListener('abort', abort, { once: true });
        work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
}
function pause(ms, signal) {
    return new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(quantScanError()); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
        if (signal.aborted)
            abort();
        else
            signal.addEventListener('abort', abort, { once: true });
    });
}
const emptyCounts = () => ({ expected: null, discovered: 0, invalidListRows: 0, duplicateListRows: 0,
    failedPages: 0, attempted: 0, covered: 0, dailySucceeded: 0, dailyInsufficient: 0, dailyFailed: 0,
    notAttempted: 0, excludedSuspended: 0, excludedST: 0, excludedStatusUnknown: 0, missingFactors: 0,
    excludedDateMismatch: 0, ranked: 0, provisional: 0, coverage: 0, sampleCoverage: 0, listCoverage: 0 });
/** No scheduling on construction/status. A start/continue call performs one bounded batch. */
export function createQuantScanner(deps) {
    const now = deps.now ?? Date.now, wait = deps.wait ?? pause, L = QUANT_SCAN_LIMITS;
    let result = null;
    let stocks = [], samples = [], cursor = 0;
    let consecutiveFailures = 0, terminal = false, lastRequestAt = -Infinity;
    let inflight = null;
    let admission = Promise.resolve();
    function refresh() {
        if (!result)
            return;
        if (result.stopReason === 'expired') {
            result.partial = true;
            result.status = 'incomplete';
            result.canContinue = false;
            return;
        }
        const c = result.counts;
        c.covered = c.dailySucceeded + c.dailyInsufficient;
        c.notAttempted = c.discovered - c.attempted;
        c.coverage = c.expected ? Math.min(1, c.covered / c.expected) : 0;
        c.sampleCoverage = c.expected ? Math.min(1, c.dailySucceeded / c.expected) : 0;
        c.listCoverage = c.expected ? Math.min(1, c.discovered / c.expected) : 0;
        const aligned = samples.filter(sample => sample.sessionDate === result.sessionDate);
        c.excludedDateMismatch = samples.length - aligned.length;
        const ranked = rankQuantSamples(aligned);
        c.ranked = ranked.length;
        result.rows = ranked.slice(0, L.rows);
        result.provisional = c.provisional > 0;
        result.partial = result.listPartial || c.expected === null || c.discovered !== c.expected
            || c.notAttempted > 0 || c.dailyFailed > 0 || c.dailyInsufficient > 0 || c.missingFactors > 0
            || c.excludedStatusUnknown > 0 || c.excludedDateMismatch > 0
            || ['upstream-failures', 'cancelled', 'expired'].includes(result.stopReason);
        result.status = result.partial ? 'incomplete' : 'complete';
        result.canContinue = !terminal && cursor < stocks.length && now() < Date.parse(result.expiresAt);
    }
    function snapshot() { refresh(); return result ? structuredClone(result) : null; }
    async function batch(signal) {
        const r = result, c = r.counts;
        const controller = new AbortController();
        const began = now(), budgetMs = Math.min(L.batchMs, Math.max(0, Date.parse(r.expiresAt) - began));
        let deadline = false;
        const timer = setTimeout(() => { deadline = true; controller.abort(); }, budgetMs);
        const cancel = () => controller.abort();
        signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted)
            cancel();
        r.batches++;
        // Serialize admission, not network I/O. Even fast errors cannot burst the source.
        async function request(action) {
            const gate = admission.then(async () => {
                if (controller.signal.aborted || terminal || now() - began >= budgetMs)
                    throw quantScanError();
                const delay = Math.max(0, lastRequestAt + L.requestGapMs - now());
                if (delay)
                    await wait(delay, controller.signal);
                if (controller.signal.aborted || terminal || now() - began >= budgetMs)
                    throw quantScanError();
                lastRequestAt = now();
                r.requests++;
            });
            admission = gate.catch(() => { });
            await gate;
            return abortable(action(), controller.signal);
        }
        try {
            if (r.batches === 1) {
                const unique = new Map();
                for (let page = 0; page < L.pages; page++) {
                    try {
                        const data = await request(() => deps.page(page * L.pageSize, controller.signal));
                        if (c.expected === null)
                            c.expected = data.expected;
                        if (data.expected !== c.expected)
                            r.listPartial = true;
                        c.invalidListRows += data.invalid;
                        for (const stock of data.stocks) {
                            if (unique.has(stock.symbol))
                                c.duplicateListRows++;
                            else if (unique.size < L.stocks)
                                unique.set(stock.symbol, stock);
                        }
                        if ((page + 1) * L.pageSize >= c.expected || data.rawCount === 0)
                            break;
                    }
                    catch {
                        c.failedPages++;
                        r.listPartial = true;
                        terminal = true;
                        r.stopReason = 'upstream-failures';
                        break;
                    }
                }
                stocks = [...unique.values()].sort((a, b) => a.symbol < b.symbol ? -1 : 1);
                c.discovered = stocks.length;
                r.listPartial ||= !c.expected || c.discovered !== c.expected || c.invalidListRows > 0 || c.duplicateListRows > 0;
            }
            let assigned = 0;
            const workers = Array.from({ length: L.concurrency }, async () => {
                while (!terminal && !controller.signal.aborted && cursor < stocks.length && assigned < L.batchStocks && now() - began < budgetMs) {
                    const stock = stocks[cursor++];
                    assigned++;
                    let started = false;
                    try {
                        const history = await request(() => { started = true; c.attempted++; return deps.history(stock.symbol, controller.signal); });
                        const sample = quantSample(history, stock, now());
                        consecutiveFailures = 0;
                        if (!sample) {
                            c.dailyInsufficient++;
                            continue;
                        }
                        c.dailySucceeded++;
                        if (sample.provisional)
                            c.provisional++;
                        r.sessionDate = !r.sessionDate || sample.sessionDate > r.sessionDate ? sample.sessionDate : r.sessionDate;
                        r.oldestSessionDate = !r.oldestSessionDate || sample.sessionDate < r.oldestSessionDate ? sample.sessionDate : r.oldestSessionDate;
                        if (stock.suspended === true)
                            c.excludedSuspended++;
                        else if (stock.name && isST(stock.name))
                            c.excludedST++;
                        else if (stock.suspended === null || !stock.name || stock.name === stock.symbol)
                            c.excludedStatusUnknown++;
                        else if (sample.factors.amountMedian20 === null || sample.factors.amountSamples20 < L.minAmountSamples
                            || !Object.values(sample.factors).every(Number.isFinite))
                            c.missingFactors++;
                        else
                            samples.push(sample);
                    }
                    catch {
                        if (!started) {
                            cursor--;
                            break;
                        }
                        c.dailyFailed++;
                        consecutiveFailures++;
                        if (consecutiveFailures >= L.consecutiveFailures || (c.attempted >= 20 && c.dailyFailed / c.attempted >= 0.5)) {
                            terminal = true;
                            r.stopReason = 'upstream-failures';
                        }
                    }
                }
            });
            await Promise.all(workers);
            if (controller.signal.aborted || now() - began >= budgetMs) {
                r.stopReason = signal?.aborted ? 'cancelled' : 'deadline';
                terminal ||= !!signal?.aborted;
            }
            else if (!terminal)
                r.stopReason = cursor >= stocks.length ? 'finished' : 'batch-limit';
        }
        finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', cancel);
            controller.abort();
            if (deadline)
                r.stopReason = 'deadline';
            const updatedAt = now();
            r.updatedAt = iso(updatedAt);
            r.nextAllowedAt = iso(updatedAt + L.cooldownMs);
            refresh();
            if (now() >= Date.parse(r.expiresAt)) {
                terminal = true;
                r.stopReason = 'expired';
                r.canContinue = false;
                stocks = [];
                samples = [];
            }
            if (!r.canContinue)
                r.expiresAt = iso(Math.min(Date.parse(r.expiresAt), now() + L.resultTtlMs));
        }
        return snapshot();
    }
    return (input, signal) => {
        if (result && !inflight && now() >= Date.parse(result.expiresAt)) {
            terminal = true;
            result.stopReason = 'expired';
            result.canContinue = false;
            stocks = [];
            samples = [];
            if (input.action === 'start' && !inflight)
                result = null;
        }
        if (input.action === 'status')
            return inflight ? inflight.then(() => snapshot()) : Promise.resolve(snapshot());
        if (input.action === 'continue' && (!result || input.scanId !== result.scanId))
            return Promise.reject(quantScanError());
        if (inflight)
            return inflight.then(() => snapshot());
        if (result && (input.action === 'start' || !result.canContinue || now() < Date.parse(result.nextAllowedAt)))
            return Promise.resolve(snapshot());
        if (!result) {
            cursor = 0;
            terminal = false;
            consecutiveFailures = 0;
            stocks = [];
            samples = [];
            const createdAt = now();
            result = { version: 1, scanId: deps.id(), source: deps.source, startedAt: iso(createdAt), updatedAt: iso(createdAt),
                expiresAt: iso(createdAt + L.sessionMs), nextAllowedAt: iso(createdAt), sessionDate: null, oldestSessionDate: null,
                status: 'incomplete', partial: true, provisional: false, canContinue: false, stopReason: 'batch-limit', listPartial: false,
                requestedAdjustment: 'forward', requests: 0, batches: 0, counts: emptyCounts(), rows: [], notices: [...QUANT_SCAN_NOTICE], limits: L };
        }
        inflight = batch(signal).finally(() => { inflight = null; });
        return inflight;
    };
}
/** Host trust boundary. Never forward raw provider fields, bars or explanations. */
export function projectQuantScan(raw, now) {
    if (raw === null)
        return null;
    const object = (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw quantScanError();
        return value;
    };
    const text = (value, max) => {
        if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value))
            throw quantScanError();
        return value;
    };
    const number = (value, min, max) => {
        if (!finite(value, min, max))
            throw quantScanError();
        return value;
    };
    const integer = (value, max) => {
        const n = number(value, 0, max);
        if (!Number.isInteger(n))
            throw quantScanError();
        return n;
    };
    const stamp = (value, latest) => {
        const s = text(value, 40);
        if (!/^\d{4}-\d{2}-\d{2}T/.test(s) || !finite(Date.parse(s), 0, latest))
            throw quantScanError();
        return iso(Date.parse(s));
    };
    const nullableDate = (value) => {
        if (value === null)
            return null;
        if (!quantDate(value) || value > today(now))
            throw quantScanError();
        return value;
    };
    const v = object(raw), L = QUANT_SCAN_LIMITS;
    if (v.version !== 1 || v.requestedAdjustment !== 'forward')
        throw quantScanError();
    const scanId = text(v.scanId, 64);
    if (!/^[a-zA-Z0-9-]+$/.test(scanId))
        throw quantScanError();
    const source = text(v.source, 64);
    const startedAt = stamp(v.startedAt, now + 300_000), updatedAt = stamp(v.updatedAt, now + 300_000);
    const expiresAt = stamp(v.expiresAt, Date.parse(startedAt) + L.sessionMs);
    const nextAllowedAt = stamp(v.nextAllowedAt, Date.parse(updatedAt) + L.cooldownMs);
    if (Date.parse(updatedAt) < Date.parse(startedAt) || Date.parse(expiresAt) < Date.parse(startedAt)
        || Date.parse(nextAllowedAt) < Date.parse(updatedAt))
        throw quantScanError();
    const sessionDate = nullableDate(v.sessionDate), oldestSessionDate = nullableDate(v.oldestSessionDate);
    if ((sessionDate === null) !== (oldestSessionDate === null) || (sessionDate && oldestSessionDate > sessionDate))
        throw quantScanError();
    const stopReason = v.stopReason;
    if (!['batch-limit', 'deadline', 'finished', 'upstream-failures', 'cancelled', 'expired'].includes(stopReason))
        throw quantScanError();
    if (typeof v.listPartial !== 'boolean' || typeof v.canContinue !== 'boolean')
        throw quantScanError();
    const c = object(v.counts), counts = emptyCounts();
    for (const key of Object.keys(counts)) {
        if (['expected', 'coverage', 'sampleCoverage', 'listCoverage'].includes(key))
            continue;
        counts[key] = integer(c[key], key === 'failedPages' ? L.pages : L.stocks);
    }
    counts.expected = c.expected === null ? null : integer(c.expected, 1_000_000);
    if ((counts.expected === null && counts.discovered !== 0) || counts.attempted > counts.discovered
        || counts.attempted !== counts.dailySucceeded + counts.dailyInsufficient + counts.dailyFailed
        || counts.covered !== counts.dailySucceeded + counts.dailyInsufficient
        || counts.notAttempted !== counts.discovered - counts.attempted
        || counts.provisional > counts.dailySucceeded
        || counts.dailySucceeded !== counts.excludedSuspended + counts.excludedST + counts.excludedStatusUnknown
            + counts.missingFactors + counts.excludedDateMismatch + counts.ranked
        || (counts.dailySucceeded === 0) !== (sessionDate === null))
        throw quantScanError();
    counts.coverage = counts.expected ? Math.min(1, counts.covered / counts.expected) : 0;
    counts.sampleCoverage = counts.expected ? Math.min(1, counts.dailySucceeded / counts.expected) : 0;
    counts.listCoverage = counts.expected ? Math.min(1, counts.discovered / counts.expected) : 0;
    const requests = integer(v.requests, L.stocks + L.pages), batches = integer(v.batches, L.stocks + L.pages);
    if (requests < counts.attempted || !batches || requests > L.pages + counts.attempted)
        throw quantScanError();
    if (!Array.isArray(v.rows) || v.rows.length !== Math.min(counts.ranked, L.rows))
        throw quantScanError();
    const seen = new Set();
    const rows = v.rows.map((rawRow) => {
        const row = object(rawRow), f = object(row.factors), p = object(row.percentiles);
        if (!isQuantSymbol(row.symbol) || seen.has(row.symbol) || row.sessionDate !== sessionDate)
            throw quantScanError();
        seen.add(row.symbol);
        const name = text(row.name, 64);
        if (isST(name) || name === row.symbol)
            throw quantScanError();
        if (!['none', 'forward', 'backward'].includes(row.adjustment) || typeof row.provisional !== 'boolean')
            throw quantScanError();
        const validBars = integer(row.validBars, L.historyBars);
        if (validBars < L.minBars)
            throw quantScanError();
        const amountSamples20 = integer(f.amountSamples20, 20);
        if (amountSamples20 < L.minAmountSamples)
            throw quantScanError();
        const factors = {
            close: number(f.close, Number.MIN_VALUE, 1e12), ma20: number(f.ma20, Number.MIN_VALUE, 1e12),
            ma60: number(f.ma60, Number.MIN_VALUE, 1e12), return20: number(f.return20, -1, Number.MAX_VALUE),
            return60: number(f.return60, -1, Number.MAX_VALUE), amountMedian20: number(f.amountMedian20, 0, Number.MAX_SAFE_INTEGER),
            amountSamples20, volatility20: number(f.volatility20, 0, Number.MAX_VALUE),
        };
        const percentiles = { return20: number(p.return20, 0, 1), return60: number(p.return60, 0, 1),
            amountMedian20: number(p.amountMedian20, 0, 1), lowVolatility20: number(p.lowVolatility20, 0, 1) };
        const scores = { trend: (factors.close > factors.ma20 ? 15 : 0) + (factors.close > factors.ma60 ? 15 : 0),
            momentum: (percentiles.return20 + percentiles.return60) * 15,
            liquidity: percentiles.amountMedian20 * 20, risk: percentiles.lowVolatility20 * 20 };
        return { symbol: row.symbol, name, sessionDate: row.sessionDate, fetchedAt: stamp(row.fetchedAt, Date.parse(updatedAt) + 300_000),
            adjustment: row.adjustment, validBars, provisional: row.provisional || row.sessionDate === today(now), factors, percentiles,
            scores, score: Object.values(scores).reduce((a, b) => a + b, 0), explanation: quantExplanation({ factors, scores }) };
    }).sort((a, b) => b.score - a.score || (a.symbol < b.symbol ? -1 : 1));
    if (rows.filter(row => row.provisional).length > counts.provisional)
        throw quantScanError();
    const listPartial = v.listPartial || !counts.expected || counts.discovered !== counts.expected
        || counts.failedPages > 0 || counts.invalidListRows > 0 || counts.duplicateListRows > 0;
    const partial = listPartial || counts.notAttempted > 0 || counts.dailyFailed > 0 || counts.dailyInsufficient > 0
        || counts.missingFactors > 0 || counts.excludedStatusUnknown > 0 || counts.excludedDateMismatch > 0
        || ['upstream-failures', 'cancelled', 'expired'].includes(stopReason);
    const canContinue = v.canContinue && counts.notAttempted > 0 && Date.parse(expiresAt) > now
        && ['batch-limit', 'deadline'].includes(stopReason);
    return { version: 1, scanId, source, startedAt, updatedAt, expiresAt, nextAllowedAt, sessionDate, oldestSessionDate,
        status: partial ? 'incomplete' : 'complete', partial, provisional: counts.provisional > 0, canContinue, stopReason, listPartial,
        requestedAdjustment: 'forward', requests, batches, counts, rows, notices: [...QUANT_SCAN_NOTICE], limits: { ...L } };
}
