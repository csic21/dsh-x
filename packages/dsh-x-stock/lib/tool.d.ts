import { fetchQuote } from './quote.ts';
export declare function stockTool(query?: typeof fetchQuote): {
    readonly name: 'dsh_x_stock_quote';
    readonly description: '只读查询 Finnhub 股票报价。需要运行环境中的 FINNHUB_API_KEY。每次查询一个明确的股票代码；市场覆盖和延迟取决于供应商订阅。必须报告报价时间与来源，不把历史/延迟数据说成实时。不能下单、交易或查询持仓。';
    readonly timeoutMs: number;
    readonly isConcurrencySafe: () => boolean;
    readonly parameters: {
        readonly symbol: {
            readonly type: 'string';
            readonly required: true;
            readonly description: 'Finnhub 股票代码，如 AAPL、MSFT 或 BRK.B。不接受公司简称猜测、URL 或多个代码。';
        };
    };
    readonly output: {
        readonly schema: {
            readonly type: 'object';
            readonly additionalProperties: false;
            readonly properties: {
                readonly symbol: {
                    readonly type: 'string';
                    readonly required: true;
                };
                readonly provider: {
                    readonly type: 'string';
                    readonly required: true;
                };
                readonly price: {
                    readonly type: 'number';
                    readonly required: true;
                };
                readonly fetchedAt: {
                    readonly type: 'string';
                    readonly required: true;
                };
                readonly quotedAt: {
                    readonly oneOf: readonly [{
                        readonly type: 'string';
                    }, {
                        readonly type: 'null';
                    }];
                    readonly required: true;
                };
                readonly open: {
                    readonly oneOf: readonly [{
                        readonly type: 'number';
                    }, {
                        readonly type: 'null';
                    }];
                    readonly required: true;
                };
                readonly high: {
                    readonly oneOf: readonly [{
                        readonly type: 'number';
                    }, {
                        readonly type: 'null';
                    }];
                    readonly required: true;
                };
                readonly low: {
                    readonly oneOf: readonly [{
                        readonly type: 'number';
                    }, {
                        readonly type: 'null';
                    }];
                    readonly required: true;
                };
                readonly previousClose: {
                    readonly oneOf: readonly [{
                        readonly type: 'number';
                    }, {
                        readonly type: 'null';
                    }];
                    readonly required: true;
                };
                readonly change: {
                    readonly oneOf: readonly [{
                        readonly type: 'number';
                    }, {
                        readonly type: 'null';
                    }];
                    readonly required: true;
                };
                readonly changePercent: {
                    readonly oneOf: readonly [{
                        readonly type: 'number';
                    }, {
                        readonly type: 'null';
                    }];
                    readonly required: true;
                };
                readonly notice: {
                    readonly type: 'string';
                    readonly required: true;
                };
            };
        };
        readonly presentationMeta: (_args: any, value: any) => {
            kind: string;
            version: number;
            quote: any;
        };
        readonly render: (_args: any, value: any) => {
            type: 'text';
            text: string;
        }[];
    };
    readonly execute: (args: any, exec: any) => Promise<any>;
};
