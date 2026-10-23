export function crossReplay(points) {
    if (!Array.isArray(points))
        throw new TypeError('replay points must be an array');
    let previous = null;
    let open = null;
    let latest = 'warmup';
    const closed = [];
    for (const point of points) {
        const fast = point?.fast, slow = point?.slow, close = point?.close;
        if (fast == null || slow == null) {
            previous = null;
            continue;
        }
        if (fast === slow) {
            latest = 'flat';
            continue;
        }
        const side = fast > slow ? 'above' : 'below';
        latest = side;
        if (previous && side !== previous && close != null && Number.isFinite(close) && close !== 0) {
            if (side === 'above') {
                latest = 'golden';
                if (!open)
                    open = { entryDate: point.sessionDate, entryClose: close };
            }
            else if (open && open.entryClose !== 0) {
                latest = 'death';
                closed.push({
                    entryDate: open.entryDate, exitDate: point.sessionDate,
                    entryClose: open.entryClose, exitClose: close,
                    returnRatio: (close - open.entryClose) / open.entryClose,
                });
                open = null;
            }
        }
        previous = side;
    }
    return { closed, open, latest };
}
export function replaySummary(replay) {
    const ratios = replay.closed.map(item => item.returnRatio).filter(Number.isFinite);
    const wins = ratios.filter(value => value > 0).length;
    const average = ratios.length ? ratios.reduce((sum, value) => sum + value, 0) / ratios.length : null;
    return { samples: ratios.length, wins, average, open: replay.open != null, latest: replay.latest };
}
