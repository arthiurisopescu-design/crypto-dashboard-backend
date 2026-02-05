type MATouch = {
  symbol: string;
  tf: string;
  maName: string;
  maValue: number;
  touchTime: number;
};

type MACross = {
  symbol: string;
  tf: string;
  maName: string;
  maValue: number;
  crossedAbove: boolean;
  crossTime: number;
};

const lastPositions: Record<string, Record<string, Record<string, boolean>>> = {};
const lastTouchTimes: Record<string, number> = {};

const TOUCH_THRESHOLD = 0.002;
const TOUCH_COOLDOWN = 300000;

const TRACKED_MAS = ["EMA100", "SMA100", "SMA200", "SMA300"];
const TREND_MAS = ["EMA13", "EMA21", "EMA34"];
const TRACKED_TFS = ["15m", "1h", "4h"];

function getPositionKey(symbol: string, tf: string, maName: string): string {
  return `${symbol}_${tf}_${maName}`;
}

function getTouchKey(symbol: string, tf: string, maName: string, touchType: string): string {
  return `${symbol}_${tf}_${maName}_${touchType}`;
}

function canTouch(symbol: string, tf: string, maName: string, touchType: string): boolean {
  const key = getTouchKey(symbol, tf, maName, touchType);
  const lastTime = lastTouchTimes[key] || 0;
  return (Date.now() - lastTime) > TOUCH_COOLDOWN;
}

function recordTouch(symbol: string, tf: string, maName: string, touchType: string): void {
  const key = getTouchKey(symbol, tf, maName, touchType);
  lastTouchTimes[key] = Date.now();
}

export function checkMATouches(
  symbol: string,
  tf: string,
  price: number,
  maValues: Record<string, number | null>
): { touches: MATouch[], crosses: MACross[] } {
  const touches: MATouch[] = [];
  const crosses: MACross[] = [];

  if (!TRACKED_TFS.includes(tf)) {
    return { touches, crosses };
  }

  for (const maName of TRACKED_MAS) {
    const maValue = maValues[maName];
    if (maValue === null || maValue === undefined || !Number.isFinite(maValue)) continue;

    const distance = Math.abs(price - maValue) / maValue;
    
    if (distance <= TOUCH_THRESHOLD) {
      if (canTouch(symbol, tf, maName, 'touch')) {
        touches.push({
          symbol,
          tf,
          maName,
          maValue,
          touchTime: Date.now()
        });
        recordTouch(symbol, tf, maName, 'touch');
      }
    }
  }

  for (const maName of TREND_MAS) {
    const maValue = maValues[maName];
    if (maValue === null || maValue === undefined || !Number.isFinite(maValue)) continue;

    const posKey = getPositionKey(symbol, tf, maName);
    
    if (!lastPositions[symbol]) lastPositions[symbol] = {};
    if (!lastPositions[symbol][tf]) lastPositions[symbol][tf] = {};
    
    const wasAbove = lastPositions[symbol][tf][maName];
    const isAbove = price > maValue;

    if (wasAbove !== undefined && wasAbove !== isAbove) {
      if (canTouch(symbol, tf, maName, 'cross')) {
        crosses.push({
          symbol,
          tf,
          maName,
          maValue,
          crossedAbove: isAbove,
          crossTime: Date.now()
        });
        recordTouch(symbol, tf, maName, 'cross');
      }
    }

    lastPositions[symbol][tf][maName] = isAbove;
  }

  return { touches, crosses };
}

export function calcCompressionDistance(
  price: number,
  ema100: number | null,
  sma100or200: number | null
): number | null {
  if (ema100 === null || sma100or200 === null) return null;
  
  const upper = Math.max(ema100, sma100or200);
  const lower = Math.min(ema100, sma100or200);
  const mid = (upper + lower) / 2;
  
  return ((price - mid) / mid) * 100;
}