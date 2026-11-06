// GENERATED FILE — do not edit by hand.
//
// Produced by `node scripts/finance-research.mjs fit`, which fetches daily
// forward-adjusted bars from the local free source, extracts features with
// `predict-features.ts`, evaluates a monthly walk-forward and then fits the
// shipped coefficients on the whole sample. Re-run the script to refresh;
// nothing in the UI writes to this file.
import type { PredictModel } from './predict.ts'

export const PREDICT_MODEL: PredictModel = {
  version: 1,
  trainedThrough: '2026-10-23',
  costPercent: 0.2,
  sample: { stocks: 1471, rows: 14258, from: '2024-03-29', to: '2026-10-23', days: 620 },
  features: ["streak","limitUp","distLimit","ret1","ret5","ret20","gap","amplitude","closePos","volRatio5","amtRatio20","ma5Dist","ma20Dist","burst5","limitCount20","fromHigh20","oneWord","upShare","hotShare","medianChange","streakHot"],
  mean: [1.22668, 0.8902371, -0.0265841, 11.08003, 18.41367, 26.62217, 2.866494, 9.782788, 0.991159, 2.165752, 2.977901, 10.94123, 18.7265, 0.2468088, 2.095105, -3.272324, 0.06824239, 46.01126, 49.5086, 45.9095, 57.04158],
  scale: [0.9307724, 0.312605, 0.4204054, 3.125387, 15.60399, 32.27253, 4.414294, 4.760913, 0.03238463, 1.743078, 2.588214, 5.746683, 16.26303, 0.4959314, 1.781913, 6.701591, 0.2521702, 27.26204, 26.5248, 27.52222, 55.91371],
  limitUp: { intercept: -1.502137, coef: [0.185858, 0.1386488, -0.04034122, -0.2214245, -0.002234988, -0.01164105, 0.0813317, 0.006726356, 0.3177551, -0.07329879, 0.03318303, 0.1760473, -0.04913069, 0.03890079, 0.1224348, 0.1108006, 0.3522634, 0.4426063, 0.02940181, -0.3795303, -0.07775851] },
  metrics: {
    holdout: { from: '2025-10-23', to: '2026-10-23', rows: 5682, days: 243 },
    auc: 0.6803891, brier: 0.1369068, baseRate: 18.9018,
    ic: -0.03224282,
    calibration: [{ bin: 0, n: 450, predicted: 5.687889, actual: 4.888889 }, { bin: 1, n: 3222, predicted: 16.33811, actual: 13.99752 }, { bin: 2, n: 1352, predicted: 23.35282, actual: 20.56213 }, { bin: 3, n: 230, predicted: 33.92186, actual: 32.17391 }, { bin: 4, n: 103, predicted: 44.72045, actual: 38.83495 }, { bin: 5, n: 141, predicted: 55.61202, actual: 57.44681 }, { bin: 6, n: 114, predicted: 64.73719, actual: 65.78947 }, { bin: 7, n: 63, predicted: 74.69641, actual: 73.01587 }, { bin: 8, n: 7, predicted: 82.38396, actual: 100 }, { bin: 9, n: 0, predicted: 0, actual: 0 }],
    top: [{ k: 3, days: 243, trades: 728, winRate: 40.93407, avgNet: -1.229069, total: -96.45797, maxDrawdown: -97.19746 }, { k: 5, days: 243, trades: 1212, winRate: 41.25413, avgNet: -1.056265, total: -93.8787, maxDrawdown: -94.13158 }, { k: 10, days: 243, trades: 2372, winRate: 42.24283, avgNet: -0.6794718, total: -83.46136, maxDrawdown: -84.65142 }],
    byRegime: [{ key: 'cold', n: 1603, pLimitUp: 20.27449, tradeReturn: -0.5762145, winRate: 43.66812 }, { key: 'normal', n: 2825, pLimitUp: 19.32743, tradeReturn: -0.7834774, winRate: 41.87611 }, { key: 'hot', n: 1254, pLimitUp: 16.1882, tradeReturn: 0.4933753, winRate: 52.07337 }],
    byProbability: [{ key: 'q1', n: 3546, pLimitUp: 10.91371, tradeReturn: -0.3457645, winRate: 44.04963 }, { key: 'q2', n: 1420, pLimitUp: 16.76056, tradeReturn: -0.8687964, winRate: 42.11268 }, { key: 'q3', n: 139, pLimitUp: 25.89928, tradeReturn: -1.492265, winRate: 42.44604 }, { key: 'q4', n: 65, pLimitUp: 44.61538, tradeReturn: -1.554595, winRate: 36.92308 }],
  },
  baseRates: {
    streak: [{ key: 's0', from: -1, to: 0.5, n: 1565, pLimitUp: 6.325879, gapNext: 2.226906, tradeReturn: -3.672841, winRate: 32.20447, medianTradeReturn: -3.211663 }, { key: 's1', from: 0.5, to: 1.5, n: 9858, pLimitUp: 17.84338, gapNext: 2.154875, tradeReturn: -0.5704658, winRate: 43.14263, medianTradeReturn: -1.216271 }, { key: 's2', from: 1.5, to: 2.5, n: 1758, pLimitUp: 32.65074, gapNext: 3.177108, tradeReturn: -0.9577634, winRate: 43.00341, medianTradeReturn: -2.145231 }, { key: 's3', from: 2.5, to: 3.5, n: 574, pLimitUp: 44.07666, gapNext: 3.723263, tradeReturn: -1.299624, winRate: 45.12195, medianTradeReturn: -1.749981 }, { key: 's4', from: 3.5, to: null, n: 503, pLimitUp: 49.70179, gapNext: 4.063105, tradeReturn: -0.135113, winRate: 52.08748, medianTradeReturn: 0.8089225 }],
    sentiment: [{ key: 'cold', from: -1, to: 33, n: 4519, pLimitUp: 21.95176, gapNext: 1.8449, tradeReturn: -0.6268353, winRate: 42.97411, medianTradeReturn: -1.427415 }, { key: 'normal', from: 33, to: 67, n: 5655, pLimitUp: 20.45977, gapNext: 2.052419, tradeReturn: -0.5997116, winRate: 42.95314, medianTradeReturn: -1.254726 }, { key: 'hot', from: 67, to: null, n: 4084, pLimitUp: 19.24584, gapNext: 3.562826, tradeReturn: -1.872014, winRate: 40.71988, medianTradeReturn: -1.897455 }],
    position: [{ key: 'deep', from: -100, to: -8, n: 2135, pLimitUp: 13.34895, gapNext: 1.255178, tradeReturn: -0.3588129, winRate: 44.2623, medianTradeReturn: -0.9650081 }, { key: 'mid', from: -8, to: -3, n: 1536, pLimitUp: 18.88021, gapNext: 1.65546, tradeReturn: 0.01738164, winRate: 47.78646, medianTradeReturn: -0.4377143 }, { key: 'near', from: -3, to: null, n: 10587, pLimitUp: 22.29149, gapNext: 2.764855, tradeReturn: -1.240198, winRate: 41.13535, medianTradeReturn: -1.876138 }],
  },
  transform: { upShare: [1.736111, 15.78947, 21.99026, 29.70506, 35.59916, 39.94354, 46.52778, 50.20051, 54.73164, 59.66504, 63.63009, 68.77193, 72.68258, 75.52011, 80.91603, 84.50803, 87.58669, 93.67089, 96.5614, 99.64888, 99.64888], hotShare: [0.4231312, 0.9021513, 1.045296, 1.196341, 1.32128, 1.462396, 1.592798, 1.721763, 1.815642, 1.955307, 2.105263, 2.20842, 2.486188, 2.687802, 3.140265, 3.508772, 4.347826, 5.53609, 36.56821, 64.46629, 64.46629], medianChange: [-10.21707, -2.028398, -1.180004, -0.838223, -0.5660911, -0.282088, -0.00661901, 0.04542009, 0.215208, 0.3923107, 0.5851729, 0.7774707, 0.952381, 1.098524, 1.340531, 1.765015, 2.28013, 3.262416, 6.493506, 9.86473, 9.86473] },
}
