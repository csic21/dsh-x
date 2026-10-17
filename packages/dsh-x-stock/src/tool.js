import { fetchQuote, TIMEOUT_MS } from './quote.js'

const text = () => ({ type: 'string', required: true })
const nullableNumber = () => ({ oneOf: [{ type: 'number' }, { type: 'null' }], required: true })

export function stockTool(query = fetchQuote) {
  return {
    name: 'dsh_x_stock_quote',
    description: '只读查询 Finnhub 股票报价。需要运行环境中的 FINNHUB_API_KEY。每次查询一个明确的股票代码；市场覆盖和延迟取决于供应商订阅。必须报告报价时间与来源，不把历史/延迟数据说成实时。不能下单、交易或查询持仓。',
    timeoutMs: TIMEOUT_MS + 1_000,
    isConcurrencySafe: () => true,
    parameters: { symbol: { type: 'string', required: true, description: 'Finnhub 股票代码，如 AAPL、MSFT 或 BRK.B。不接受公司简称猜测、URL 或多个代码。' } },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          symbol: text(), provider: text(), price: { type: 'number', required: true },
          fetchedAt: text(), quotedAt: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
          open: nullableNumber(), high: nullableNumber(), low: nullableNumber(), previousClose: nullableNumber(),
          change: nullableNumber(), changePercent: nullableNumber(), notice: text(),
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute: (args, exec) => query(args.symbol, { signal: exec.signal }),
  }
}
