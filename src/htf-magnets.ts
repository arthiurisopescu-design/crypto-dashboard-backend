import { type Candle } from "./flats";

export type FlatSide = "BULLISH" | "BEARISH";

export type MagnetFlat = {
  tf: "1h" | "4h" | "1d";
  side: FlatSide;
  level: number;
  bornTime: number;
  filled: boolean;
  filledTime: number | null;
};

export type HTFMagnets = {
  tf: "1h" | "4h" | "1d";
  unfilled: MagnetFlat[];
  lastAdded: MagnetFlat | null;
};

function eq(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return diff <= 1e-8 * scale;
}

function isBullishFlat(c: Candle): boolean {
  const ocHigh = Math.max(c.open, c.close);
  return eq(c.high, ocHigh);
}

function isBearishFlat(c: Candle): boolean {
  const ocLow = Math.min(c.open, c.close);
  return eq(ocLow, c.low);
}

const magnetStore: Record<string, Record<string, HTFMagnets>> = {};

function getStore(symbol: string, tf: "1h" | "4h" | "1d"): HTFMagnets {
  if (!magnetStore[symbol]) magnetStore[symbol] = {} as any;
  if (!magnetStore[symbol][tf]) {
    magnetStore[symbol][tf] = {
      tf,
      unfilled: [],
      lastAdded: null
    };
  }
  return magnetStore[symbol][tf];
}

export function updateHTFMagnets(
  symbol: string,
  tf: "1h" | "4h" | "1d",
  candle: Candle,
  currentPrice: number
): HTFMagnets {
  const store = getStore(symbol, tf);

  if (!candle.closed) return store;

  const isBull = isBullishFlat(candle);
  const isBear = isBearishFlat(candle);

  if (isBull || isBear) {
    const magnet: MagnetFlat = {
      tf,
      side: isBull ? "BULLISH" : "BEARISH",
      level: candle.open,
      bornTime: candle.time,
      filled: false,
      filledTime: null
    };

    store.unfilled.push(magnet);
    if (store.unfilled.length > 20) store.unfilled.shift();
    
    store.lastAdded = magnet;
  }

  const touchThreshold = 0.001;
  
  for (const magnet of store.unfilled) {
    if (!magnet.filled) {
      const pctDiff = Math.abs(currentPrice - magnet.level) / magnet.level;
      if (pctDiff <= touchThreshold) {
        magnet.filled = true;
        magnet.filledTime = Date.now();
      }
    }
  }

  return store;
}

export function getNearestMagnets(
  symbol: string,
  tf: "1h" | "4h" | "1d",
  currentPrice: number
): {
  above: MagnetFlat | null;
  below: MagnetFlat | null;
  aboveDist: number | null;
  belowDist: number | null;
} {
  const store = getStore(symbol, tf);
  const unfilled = store.unfilled.filter(m => !m.filled);

  let above: MagnetFlat | null = null;
  let below: MagnetFlat | null = null;

  for (const m of unfilled) {
    if (m.level > currentPrice) {
      if (!above || m.level < above.level) above = m;
    } else if (m.level < currentPrice) {
      if (!below || m.level > below.level) below = m;
    }
  }

  return {
    above,
    below,
    aboveDist: above ? ((above.level - currentPrice) / currentPrice) * 100 : null,
    belowDist: below ? ((currentPrice - below.level) / currentPrice) * 100 : null,
  };
}

export function getUnfilledMagnets(
  symbol: string,
  tf: "1h" | "4h" | "1d"
): MagnetFlat[] {
  const store = getStore(symbol, tf);
  return store.unfilled.filter(m => !m.filled);
}