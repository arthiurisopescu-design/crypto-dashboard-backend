export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  closed: boolean;
};

export type FlatsStats = {
  up: number;
  down: number;
  bestCU: number;
  bestCD: number;
  rating: string;
};

const WINDOW_5M_CANDLES = 12;

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

function bestConsecutive(flags: boolean[]): number {
  let best = 0;
  let cur = 0;
  for (const f of flags) {
    if (f) {
      cur++;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  }
  return best;
}

function ratingFrom(up: number, down: number, bestCU: number, bestCD: number): string {
  const total = up + down;
  const bestC = Math.max(bestCU, bestCD);

  if (bestC >= 3) return "A+";
  if (total >= 4) return "A";
  if (total >= 3) return "B";
  if (total >= 2) return "C";
  return "-";
}

type Buf = Candle[];
const mem5m: Record<string, Buf> = {};

export function updateFlats5m(symbol: string, candle: Candle): FlatsStats {
  if (!candle.closed) return compute(symbol);

  const buf = (mem5m[symbol] ||= []);
  buf.push(candle);

  while (buf.length > WINDOW_5M_CANDLES) buf.shift();

  return compute(symbol);
}

export function compute(symbol: string): FlatsStats {
  const buf = mem5m[symbol] || [];

  const upFlags = buf.map(isBullishFlat);
  const downFlags = buf.map(isBearishFlat);

  const up = upFlags.filter(Boolean).length;
  const down = downFlags.filter(Boolean).length;

  const bestCU = bestConsecutive(upFlags);
  const bestCD = bestConsecutive(downFlags);

  const rating = ratingFrom(up, down, bestCU, bestCD);

  return { up, down, bestCU, bestCD, rating };
}

export function debugWindow(symbol: string): Candle[] {
  return mem5m[symbol] || [];
}