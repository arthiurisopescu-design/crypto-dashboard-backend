import WebSocket from "ws";

export type TF = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d" | "1w";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed: boolean;
};

export type Stream = { symbol: string; tf: TF };
export type Status = { state: "open" | "close" | "error"; detail?: string };

type OnCandle = (symbol: string, tf: TF, candle: Candle) => void;
type OnStatus = (s: Status) => void;

const WS_BASE = "wss://fstream.binance.com/stream?streams=";

function toStreamName(s: Stream) {
  return `${s.symbol.toLowerCase()}@kline_${s.tf}`;
}

function safeNum(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export function openKlineStream(
  arg1:
    | {
        streams: Stream[];
        onCandle: OnCandle;
        onStatus?: OnStatus;
      }
    | Stream[],
  arg2?: OnCandle,
  arg3?: OnStatus
) {
  let streams: Stream[];
  let onCandle: OnCandle;
  let onStatus: OnStatus = () => {};

  if (Array.isArray(arg1)) {
    streams = arg1;
    if (!arg2) throw new Error("openKlineStream(streams, onCandle, onStatus?): onCandle missing");
    onCandle = arg2;
    if (arg3) onStatus = arg3;
  } else {
    streams = arg1.streams;
    onCandle = arg1.onCandle;
    if (arg1.onStatus) onStatus = arg1.onStatus;
  }

  if (!Array.isArray(streams) || streams.length === 0) {
    throw new Error("openKlineStream: streams must be a non-empty array");
  }

  const streamStr = streams.map(toStreamName).join("/");
  const ws = new WebSocket(WS_BASE + streamStr, { perMessageDeflate: false });

  ws.on("open", () => onStatus({ state: "open" }));
  ws.on("close", () => onStatus({ state: "close" }));
  ws.on("error", (e) => onStatus({ state: "error", detail: String(e) }));

  ws.on("message", (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    const d = msg?.data;
    const k = d?.k;
    if (!d || !k) return;

    const symbol = String(k.s || "");
    const tf = String(k.i || "") as TF;
    if (!symbol || !tf) return;

    const candle: Candle = {
      time: safeNum(k.t),
      open: safeNum(k.o),
      high: safeNum(k.h),
      low: safeNum(k.l),
      close: safeNum(k.c),
      volume: safeNum(k.v),
      closed: Boolean(k.x),
    };

    onCandle(symbol, tf, candle);
  });

  return ws;
}