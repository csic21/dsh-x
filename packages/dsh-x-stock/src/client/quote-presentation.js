export function readQuotePresentation(meta) {
  if (!meta || meta.kind !== 'dsh-x-stock.quote' || meta.version !== 1) return null
  const quote = meta.quote
  if (!quote || typeof quote.symbol !== 'string' || typeof quote.provider !== 'string'
    || !Number.isFinite(quote.price) || quote.price <= 0
    || ['open', 'high', 'low', 'previousClose', 'change', 'changePercent'].some(key => quote[key] !== null && !Number.isFinite(quote[key]))
    || ['quotedAt', 'fetchedAt'].some(key => quote[key] !== null && (typeof quote[key] !== 'string' || !Number.isFinite(Date.parse(quote[key]))))) return null
  return quote
}
