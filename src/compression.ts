import { type Candle } from "./flats";

export type CompressionResult = {
  active: boolean;
  regime: "post-uptrend" | "post-downtrend" | "unknown" | "none";
  bandPct: number | null;
  ma1: number | null;
  ma2: number | null;
};

function sma(values: number[], len: number): number | null {
  if (values.length < len) return null;
  let s = 0;
  for (let i = values.length - len; i < values.length; i++) s += values[i];
  return s / len;
}

function ema(values: number[], len: number): number | null {
  if (values.length < len) return null;
  const k = 2 / (len + 1);
  let e = values[values.length - len];
  for (let i = values.length - len + 1; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

export function checkCompression(
  closes: number[], 
  candles: Candle[],
  useMA200 = false
): CompressionResult {
  const requiredLength = useMA200 ? 200 : 100;
  
  if (closes.length < requiredLength || candles.length < 20) {
    return { active: false, regime: "none", bandPct: null, ma1: null, ma2: null };
  }

  const price = closes[closes.length - 1];
  const ema100Val = ema(closes, 100);
  const smaVal = useMA200 ? sma(closes, 200) : sma(closes, 100);

  if (ema100Val === null || smaVal === null) {
    return { active: false, regime: "none", bandPct: null, ma1: null, ma2: null };
  }

  const upper = Math.max(smaVal, ema100Val);
  const lower = Math.min(smaVal, ema100Val);
  const bandPct = ((upper - lower) / lower) * 100;

  const COMPRESSION_THRESHOLD = 0.5;
  const active = bandPct < COMPRESSION_THRESHOLD;

  let regime: "post-uptrend" | "post-downtrend" | "unknown" | "none" = "unknown";
  
  if (active) {
    const recent10 = closes.slice(-10);
    const avg10 = recent10.reduce((a, b) => a + b, 0) / recent10.length;
    
    if (avg10 > upper) {
      regime = "post-uptrend";
    } else if (avg10 < lower) {
      regime = "post-downtrend";
    }
  } else {
    regime = "none";
  }

  return { active, regime, bandPct, ma1: ema100Val, ma2: smaVal };
}