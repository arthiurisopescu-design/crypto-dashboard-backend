type TriggerState = {
  lastAlertTime: number;
  lastFlatCount: number;
  lastCompressionState: boolean;
  consecutiveClosedCandles: number;
};

const triggerStates: Record<string, TriggerState> = {};

const COOLDOWN_MS = 60000;
const CONFIRMATION_CANDLES = 1;

function getState(symbol: string): TriggerState {
  if (!triggerStates[symbol]) {
    triggerStates[symbol] = {
      lastAlertTime: 0,
      lastFlatCount: 0,
      lastCompressionState: false,
      consecutiveClosedCandles: 0,
    };
  }
  return triggerStates[symbol];
}

export function shouldFireAlert(
  symbol: string,
  compression15m: boolean,
  bullishFlats5m: number,
  isClosedCandle: boolean
): boolean {
  const state = getState(symbol);
  const now = Date.now();

  if (!isClosedCandle) {
    return false;
  }

  const conditionsMet = compression15m && bullishFlats5m >= 2;

  if (conditionsMet) {
    state.consecutiveClosedCandles++;
  } else {
    state.consecutiveClosedCandles = 0;
  }

  const cooldownPassed = (now - state.lastAlertTime) >= COOLDOWN_MS;

  if (state.consecutiveClosedCandles >= CONFIRMATION_CANDLES && cooldownPassed && conditionsMet) {
    state.lastAlertTime = now;
    state.lastFlatCount = bullishFlats5m;
    state.lastCompressionState = compression15m;
    return true;
  }

  return false;
}

export function compressionChanged(
  symbol: string,
  tf: string,
  compressionActive: boolean
): boolean {
  const key = `${symbol}_${tf}`;
  const state = getState(key);
  
  if (state.lastCompressionState !== compressionActive) {
    state.lastCompressionState = compressionActive;
    return true;
  }
  
  return false;
}

export function flatCountChanged(
  symbol: string,
  newFlatCount: number
): boolean {
  const state = getState(symbol);
  
  if (state.lastFlatCount !== newFlatCount) {
    state.lastFlatCount = newFlatCount;
    return true;
  }
  
  return false;
}

export function resetTrigger(symbol: string): void {
  if (triggerStates[symbol]) {
    triggerStates[symbol] = {
      lastAlertTime: 0,
      lastFlatCount: 0,
      lastCompressionState: false,
      consecutiveClosedCandles: 0,
    };
  }
}

export function getTimeUntilNextAlert(symbol: string): number {
  const state = getState(symbol);
  const now = Date.now();
  const timeSinceLastAlert = now - state.lastAlertTime;
  const remaining = COOLDOWN_MS - timeSinceLastAlert;
  return Math.max(0, remaining);
}