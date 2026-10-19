/**
 * Identity is stable across refreshes of the same series (so the chart keeps
 * its viewport and updates only the tail) and changes when the symbol,
 * adjustment or covered date range changes (so the chart resets).
 */
export function historyDatasetId(history) {
    const first = history.bars[0]?.sessionDate ?? '';
    const last = history.bars.at(-1)?.sessionDate ?? '';
    return `market:${history.symbol}:${history.adjustment}:${first}:${last}:${history.bars.length}`;
}
export function toChartDataset(history) {
    if (!history || !Array.isArray(history.bars) || !history.bars.length)
        throw new Error('history dataset is empty');
    const revision = `${history.symbol}:${history.adjustment}:${history.lastSessionDate}`;
    return {
        schemaVersion: 1,
        kind: 'market',
        providerId: 'market-feed',
        id: historyDatasetId(history),
        symbol: history.symbol,
        name: history.name,
        currency: history.currency,
        exchangeTimezone: history.exchangeTimezone,
        interval: '1d',
        adjustment: history.adjustment,
        adjustmentRevision: history.adjustmentLabel,
        adjustmentMethod: history.adjustmentLabel,
        datasetRevision: revision,
        pricePrecision: history.pricePrecision,
        volumeUnit: 'shares',
        volumeAdjustment: 'unadjusted',
        // A lot count converted to shares is not a split-adjusted series, but the
        // conversion is still a declared normalization the reader must see.
        volumeAdjustmentMethod: history.volumeBasis === 'lots'
            ? 'Source volume in lots converted to shares (×100); no split adjustment applied'
            : history.volumeBasis === 'unknown'
                ? 'Source volume unit could not be established from turnover, so volume is omitted'
                : history.volumeBasis === 'reported'
                    ? 'Index volume is the source aggregate and is not a share count'
                    : 'Source volume reported in shares; no adjustment applied',
        amountAdjustment: history.bars.some(bar => bar.amount !== null) ? 'unadjusted' : 'not-provided',
        amountAdjustmentMethod: 'none',
        amountCurrency: history.currency,
        source: {
            kind: 'market-feed',
            label: `${history.source} · ${history.adjustmentLabel}`,
            provenance: 'Daily OHLCV projected by the plugin Host from the opt-in local free source. Not an exchange-licensed feed; no SLA and no redistribution right.',
            verified: false,
        },
        historyAnchor: history.bars[0].sessionDate,
        hasNonPositivePrices: false,
        logScaleAllowed: true,
        fetchedAt: history.fetchedAt,
        volumeBasis: history.volumeBasis,
        bars: history.bars.map(bar => ({
            sessionDate: bar.sessionDate,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
            amount: bar.amount,
            isFinal: bar.isFinal,
            updatedAt: null,
            revision,
        })),
    };
}
