import 'dotenv/config';
import express from 'express';
import path from 'path';
import { WebSocketServer } from 'ws';
import { openKlineStream, type Candle as BinanceCandle, type TF } from './binance_ws';
import { updateFlats5m, compute as computeFlats, type Candle as FlatCandle } from './flats';
import { checkCompression } from './compression';
import { updateHTFMagnets, getNearestMagnets } from './htf-magnets';
import { shouldFireAlert, compressionChanged } from './trigger-manager';
import { calculateAllMAs } from './ma-config';
import { checkMATouches, calcCompressionDistance } from './ma-touch-detector';

const PORT = Number(process.env.PORT || 3001);
const app = express();
app.use(express.static(path.join(process.cwd(), 'frontend')));
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  🚀 Crypto Setup Scanner                                        ║
║  📊 Backend listening on http://localhost:${PORT}              ║
╚════════════════════════════════════════════════════════════════╝
  `);
  console.log(`[INFO] Monitoring: BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, HYPEUSDT, ASTERUSDT, PENGUUSDT`);
  console.log(`[INFO] Timeframes: 5m, 15m, 1h, 4h`);
  console.log('');
});

const wss = new WebSocketServer({ server });

function broadcast(obj: any) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

const SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','HYPEUSDT','ASTERUSDT','PENGUUSDT'];
const currentPrices: Record<string, number> = {};
const compressionStates: Record<string, Record<string, boolean>> = {};

function getCompressionState(symbol: string, tf: string): boolean {
  if (!compressionStates[symbol]) compressionStates[symbol] = {};
  return compressionStates[symbol][tf] || false;
}

function setCompressionState(symbol: string, tf: string, active: boolean): void {
  if (!compressionStates[symbol]) compressionStates[symbol] = {};
  compressionStates[symbol][tf] = active;
}

app.get('/api/binance/price', async (req, res) => {
  try {
    const symbolsParam = String(req.query.symbols || '').trim();
    const symbols = symbolsParam ? symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : SYMBOLS;
    const url = 'https://api.binance.com/api/v3/ticker/price?symbols=' + encodeURIComponent(JSON.stringify(symbols));
    const r = await fetch(url);
    const txt = await r.text();
    if (!r.ok) return res.status(r.status).send(txt);
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(txt);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

async function pollBinanceAndBroadcast() {
  try {
    const url = 'https://api.binance.com/api/v3/ticker/price?symbols=' + encodeURIComponent(JSON.stringify(SYMBOLS));
    const r = await fetch(url);
    if (!r.ok) return;
    const arr = (await r.json()) as Array<{ symbol: string; price: string }>;
    const ts = Date.now();
    for (const row of arr) {
      const price = Number(row.price);
      currentPrices[row.symbol] = price;
      broadcast({ type: 'price', exchange: 'binance', symbol: row.symbol, price, timestamp: ts });
    }
  } catch {}
}

setInterval(pollBinanceAndBroadcast, 2000);
pollBinanceAndBroadcast();

type CandleBuffer = { closes: number[]; candles: FlatCandle[] };
const candleBuffers: Record<string, Record<TF, CandleBuffer>> = {};

function getBuffer(symbol: string, tf: TF): CandleBuffer {
  if (!candleBuffers[symbol]) candleBuffers[symbol] = {} as any;
  if (!candleBuffers[symbol][tf]) candleBuffers[symbol][tf] = { closes: [], candles: [] };
  return candleBuffers[symbol][tf];
}

function addToBuffer(symbol: string, tf: TF, candle: BinanceCandle) {
  const buf = getBuffer(symbol, tf);
  buf.closes.push(candle.close);
  if (buf.closes.length > 300) buf.closes.shift();
  const flatCandle: FlatCandle = { time: candle.time, open: candle.open, high: candle.high, low: candle.low, close: candle.close, closed: candle.closed };
  buf.candles.push(flatCandle);
  if (buf.candles.length > 100) buf.candles.shift();
}

console.log('[STATUS] Opening Binance WS stream...');

openKlineStream({
  streams: SYMBOLS.flatMap((symbol) => [
    { symbol, tf: '5m' }, { symbol, tf: '15m' }, { symbol, tf: '1h' }, { symbol, tf: '4h' }
  ]),
  onCandle: (symbol, tf, candle) => {
    currentPrices[symbol] = candle.close;
    broadcast({ type: 'candle', exchange: 'binance', symbol, tf, candle });
    addToBuffer(symbol, tf, candle);
    if (!candle.closed) return;

    if (tf === '5m') {
      const flatCandle: FlatCandle = { time: candle.time, open: candle.open, high: candle.high, low: candle.low, close: candle.close, closed: candle.closed };
      const stats = updateFlats5m(symbol, flatCandle);
      if (stats.bestCU >= 2 || stats.bestCD >= 2) {
        console.log(`[FLAT] ${symbol} 5m: ${stats.bestCU} bullish 🟢 / ${stats.bestCD} bearish 🔴 (rating: ${stats.rating})`);
      }
      broadcast({ type: 'flatSignal', symbol, tf: '5m', best: Math.max(stats.bestCU, stats.bestCD), best5m: Math.max(stats.bestCU, stats.bestCD), up: stats.up, down: stats.down, bestCU: stats.bestCU, bestCD: stats.bestCD, rating: stats.rating, timestamp: Date.now() });
    }

    const buf = getBuffer(symbol, tf);
    const mas = calculateAllMAs(buf.closes);
    broadcast({ type: 'maData', symbol, tf, values: mas, timestamp: Date.now() });
    
    const maChecks = checkMATouches(symbol, tf, candle.close, mas);
    for (const touch of maChecks.touches) {
      broadcast({ type: 'maTouch', symbol: touch.symbol, tf: touch.tf, maName: touch.maName, maValue: touch.maValue, timestamp: touch.touchTime });
    }
    for (const cross of maChecks.crosses) {
      broadcast({ type: 'maCross', symbol: cross.symbol, tf: cross.tf, maName: cross.maName, maValue: cross.maValue, crossedAbove: cross.crossedAbove, timestamp: cross.crossTime });
    }
    
    const compression100 = checkCompression(buf.closes, buf.candles, false);
    const compression200 = checkCompression(buf.closes, buf.candles, true);
    const compression = (compression100.active && compression100.bandPct !== null && compression200.active && compression200.bandPct !== null)
      ? (compression100.bandPct < compression200.bandPct ? compression100 : compression200)
      : (compression100.active ? compression100 : compression200);
    
    const compDist = calcCompressionDistance(candle.close, compression.ma1, compression.ma2);
    
    if (compressionChanged(symbol, tf, compression.active)) {
      if (compression.active) console.log(`[COMPRESSION] ${symbol} ${tf}: ACTIVE (band: ${compression.bandPct?.toFixed(3)}%)`);
      broadcast({ type: 'compression', symbol, tf, on: compression.active, bandPct: compression.bandPct, regime: compression.regime, ma1: compression.ma1, ma2: compression.ma2, timestamp: Date.now() });
    }
    
    broadcast({ type: 'compressionData', symbol, tf, distance: compDist, timestamp: Date.now() });
    setCompressionState(symbol, tf, compression.active);

    if (tf === '15m' || tf === '5m') {
      const comp15m = getCompressionState(symbol, '15m');
      const stats5m = computeFlats(symbol);
      const bullishFlats = stats5m.bestCU;
      if (shouldFireAlert(symbol, comp15m, bullishFlats, candle.closed)) {
        console.log(`[ALERT] 🚨 A+ Setup: ${symbol} - 15m compression + ${bullishFlats} bullish flats`);
        broadcast({ type: 'alert', symbol, title: 'A+ Setup Detected', body: `${symbol}: 15m compression active with ${bullishFlats} consecutive bullish flats on 5m`, compression15m: comp15m, bullishFlats5m: bullishFlats, grade: 'A+', timestamp: Date.now() });
      }
    }

    if (tf === '1h' || tf === '4h') {
      const flatCandle: FlatCandle = { time: candle.time, open: candle.open, high: candle.high, low: candle.low, close: candle.close, closed: candle.closed };
      const magnets = updateHTFMagnets(symbol, tf, flatCandle, currentPrices[symbol] || candle.close);
      const nearest = getNearestMagnets(symbol, tf, currentPrices[symbol] || candle.close);
      broadcast({ type: 'htfMagnets', symbol, tf, lastAdded: magnets.lastAdded, nearestAbove: nearest.above, nearestBelow: nearest.below, aboveDist: nearest.aboveDist, belowDist: nearest.belowDist, unfilledCount: magnets.unfilled.filter(m => !m.filled).length, timestamp: Date.now() });
    }
  },
  onStatus: (s) => console.log('[STATUS] Binance WS:', s.state, s.detail || ''),
});

console.log('[STATUS] Ready.');