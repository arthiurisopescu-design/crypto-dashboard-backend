export const MA_CONFIG = {
  SMA20: 20,
  SMA100: 100,
  SMA200: 200,
  SMA300: 300,
  EMA13: 13,
  EMA21: 21,
  EMA34: 34,
  EMA55: 55,
  EMA89: 89,
  SMMA99: 99,
  H4_EMA200: 200,
} as const;

export function smma(values: number[], length: number, prevSmma?: number): number | null {
  if (values.length < length) return null;

  if (prevSmma === undefined || prevSmma === null) {
    let sum = 0;
    for (let i = values.length - length; i < values.length; i++) {
      sum += values[i];
    }
    return sum / length;
  }

  const currentValue = values[values.length - 1];
  return (prevSmma * (length - 1) + currentValue) / length;
}

export function sma(values: number[], length: number): number | null {
  if (values.length < length) return null;
  let sum = 0;
  for (let i = values.length - length; i < values.length; i++) {
    sum += values[i];
  }
  return sum / length;
}

export function ema(values: number[], length: number): number | null {
  if (values.length < length) return null;
  const k = 2 / (length + 1);
  let e = values[values.length - length];
  for (let i = values.length - length + 1; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

export function calculateAllMAs(closes: number[]): {
  sma20: number | null;
  sma100: number | null;
  sma200: number | null;
  sma300: number | null;
  ema13: number | null;
  ema21: number | null;
  ema34: number | null;
  ema55: number | null;
  ema89: number | null;
  ema100: number | null;
  smma99: number | null;
} {
  return {
    sma20: sma(closes, MA_CONFIG.SMA20),
    sma100: sma(closes, MA_CONFIG.SMA100),
    sma200: sma(closes, MA_CONFIG.SMA200),
    sma300: sma(closes, MA_CONFIG.SMA300),
    ema13: ema(closes, MA_CONFIG.EMA13),
    ema21: ema(closes, MA_CONFIG.EMA21),
    ema34: ema(closes, MA_CONFIG.EMA34),
    ema55: ema(closes, MA_CONFIG.EMA55),
    ema89: ema(closes, MA_CONFIG.EMA89),
    ema100: ema(closes, 100),
    smma99: smma(closes, MA_CONFIG.SMMA99),
  };
}