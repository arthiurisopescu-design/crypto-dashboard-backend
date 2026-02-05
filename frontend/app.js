(() => {
  const DEFAULT_PORT = 3001;
  const SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','HYPEUSDT','ASTERUSDT','PENGUUSDT'];
  const SYMBOL_SET = new Set(SYMBOLS);

  function resolveWsUrl() {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${location.host}`;
    }
    return `ws://localhost:${DEFAULT_PORT}`;
  }

  function resolveHttpBase() {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return `${location.protocol}//${location.host}`;
    }
    return `http://localhost:${DEFAULT_PORT}`;
  }

  const WS_URL = resolveWsUrl();
  const HTTP_BASE = resolveHttpBase();
  const $ = (sel, root = document) => root.querySelector(sel);

  function fmtPrice(p) {
    if (p == null || !Number.isFinite(p)) return '—';
    if (p >= 1000) return p.toFixed(0);
    if (p >= 100) return p.toFixed(1);
    if (p >= 1) return p.toFixed(3);
    return p.toFixed(6);
  }

  function pct(prev, cur) {
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev === 0) return null;
    return ((cur - prev) / prev) * 100;
  }

  function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  function setClass(id, cls) {
    const el = document.getElementById(id);
    if (el) el.className = cls;
  }

  function ensureUI() {
    if (!document.getElementById('appRoot')) {
      document.body.innerHTML = `
        <div id="appRoot" class="app">
          <div class="topbar">
            <div class="titleBlock">
              <div class="title">Crypto Setup Scanner</div>
              <div class="sub">Flats (1h tracking) + Compression (EMA100/SMA100). Live from Binance • 5m/15m/1h/4h.</div>
              <div id="dbgLine" class="dbg">msgs: 0 • last: — • format: —</div>
            </div>
            <div id="wsPill" class="pill pill-off"><span id="wsText">Connecting…</span></div>
          </div>
          <div id="bannerContainer" class="banner-container"></div>
          <div id="cards" class="cards"></div>
          <div class="tableWrap">
            <div class="tableTitle">Live screener</div>
            <table class="tbl">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Price</th>
                  <th>Change</th>
                  <th>Flats (1h window)</th>
                  <th>Direction</th>
                  <th>Compression</th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody id="rows"></tbody>
            </table>
          </div>
        </div>
      `;

      const style = document.createElement('style');
      style.textContent = `
        html, body { margin:0; padding:0; background:#0b1016; color:#e8eef6; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; }
        .app { padding: 16px 18px 26px; max-width: 1400px; margin: 0 auto; }
        .topbar { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom: 12px; }
        .title { font-size: 26px; font-weight: 900; letter-spacing: .2px; }
        .sub { margin-top: 6px; opacity: .75; font-size: 13px; }
        .dbg { margin-top: 6px; opacity: .65; font-size: 12px; }
        .pill { padding: 10px 12px; border-radius: 999px; font-size: 13px; border:1px solid rgba(255,255,255,.12); white-space: nowrap; }
        .pill-on { border-color: rgba(51, 209, 122, .45); color:#bff2d0; background: rgba(51, 209, 122, .08); }
        .pill-off { border-color: rgba(255, 77, 77, .35); color:#ffd0d0; background: rgba(255, 77, 77, .08); }
        .banner-container { margin-bottom: 12px; }
        .banner { background: linear-gradient(90deg, rgba(255, 204, 0, 0.12), rgba(255, 204, 0, 0.06)); border: 1px solid rgba(255, 204, 0, 0.35); border-radius: 10px; padding: 10px 14px; margin-bottom: 8px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 10px; animation: slideIn 0.3s ease-out; }
        .banner.touch { background: linear-gradient(90deg, rgba(51, 209, 122, 0.12), rgba(51, 209, 122, 0.06)); border-color: rgba(51, 209, 122, 0.35); }
        .banner.cross { background: linear-gradient(90deg, rgba(255, 77, 77, 0.12), rgba(255, 77, 77, 0.06)); border-color: rgba(255, 77, 77, 0.35); }
        .banner .icon { font-size: 18px; }
        .banner .time { opacity: 0.6; margin-left: auto; font-size: 11px; }
        @keyframes slideIn { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .cards { margin-top: 12px; display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
        .card { background: rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.10); border-radius: 14px; padding: 12px 14px; position:relative; min-height: 100px; transition: all 0.2s ease; }
        .card:hover { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.15); }
        .card .sym { font-weight: 900; font-size: 14px; opacity:.95; }
        .card .price { font-weight: 900; font-size: 24px; margin-top: 6px; }
        .card .chg { margin-top: 4px; font-size: 13px; font-weight: 700; }
        .up { color:#33d17a; }
        .down { color:#ff4d4d; }
        .neu { color:#8aa0b7; }
        .meta { margin-top: 10px; font-size: 11px; opacity:.8; display: flex; flex-direction: column; gap: 6px; }
        .meta-row { display: flex; justify-content: space-between; align-items: center; }
        .badge { display:inline-flex; align-items:center; gap:6px; padding: 4px 8px; border-radius: 999px; border:1px solid rgba(255,255,255,.12); font-size: 11px; }
        .direction-badge { padding: 3px 7px; border-radius: 6px; font-weight: 700; font-size: 10px; }
        .direction-bullish { background: rgba(51, 209, 122, 0.15); color: #33d17a; border: 1px solid rgba(51, 209, 122, 0.3); }
        .direction-bearish { background: rgba(255, 77, 77, 0.15); color: #ff4d4d; border: 1px solid rgba(255, 77, 77, 0.3); }
        .direction-neutral { background: rgba(138, 160, 183, 0.15); color: #8aa0b7; border: 1px solid rgba(138, 160, 183, 0.3); }
        .alert { position:absolute; top:10px; right:10px; font-size: 11px; padding: 5px 8px; border-radius: 999px; background: rgba(255, 204, 0, .14); border:1px solid rgba(255, 204, 0, .35); color:#ffe79c; font-weight: 700; animation: pulse 2s ease-in-out infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes alertPulse { 0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 204, 0, 0.7); } 50% { transform: scale(1.05); box-shadow: 0 0 20px 5px rgba(255, 204, 0, 0.4); } }
        .comp-dist { font-size: 10px; opacity: 0.65; margin-top: 4px; }
        .tableWrap { margin-top: 14px; background: rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 12px; }
        .tableTitle { font-weight: 900; margin-bottom: 10px; opacity:.95; }
        .tbl { width:100%; border-collapse: collapse; font-size: 12px; }
        .tbl th, .tbl td { text-align:left; padding: 10px 10px; border-top: 1px solid rgba(255,255,255,.07); }
        .tbl thead th { border-top: none; opacity:.85; font-weight: 800; }
        .tbl tbody tr:hover { background: rgba(255,255,255,.03); }
        .mono { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
      `;
      document.head.appendChild(style);
    }

    const cards = document.getElementById('cards');
    const rows = document.getElementById('rows');
    if (!cards || !rows) return;

    cards.innerHTML = SYMBOLS.map((sym) => {
      const short = sym.replace('USDT', '');
      return `
        <div class="card" id="card-${sym}">
          <div class="sym">${short}</div>
          <div class="price mono" id="price-${sym}">—</div>
          <div class="chg neu mono" id="chg-${sym}">—</div>
          <div class="meta">
            <div class="meta-row">
              <span class="badge">
                Flats: 
                <span class="mono up" id="flats-bull-${sym}">0</span>🟢 / 
                <span class="mono down" id="flats-bear-${sym}">0</span>🔴
              </span>
              <span class="direction-badge direction-neutral" id="direction-${sym}">NEUTRAL</span>
            </div>
            <div class="meta-row">
              <span class="mono" id="grade-${sym}">Grade: -</span>
              <span class="mono" id="comp-info-${sym}" style="font-size: 10px; opacity: 0.7;"></span>
            </div>
          </div>
          <div class="comp-dist" id="comp-dist-${sym}"></div>
          <div class="htf-info" id="htf-${sym}" style="margin-top: 8px; font-size: 10px; opacity: 0.7;"></div>
        </div>
      `;
    }).join('');

    rows.innerHTML = SYMBOLS.map((sym) => {
      return `
        <tr id="row-${sym}">
          <td><b>${sym}</b></td>
          <td class="mono" id="tPrice-${sym}">—</td>
          <td class="mono" id="tChg-${sym}">—</td>
          <td class="mono" id="tFlats-${sym}">0 🟢 / 0 🔴</td>
          <td id="tDir-${sym}">—</td>
          <td class="mono" id="tComp-${sym}">—</td>
          <td class="mono" id="tGrade-${sym}">-</td>
        </tr>
      `;
    }).join('');
  }

  const state = {};
  const banners = [];
  const MAX_BANNERS = 5;
  
  for (const sym of SYMBOLS) {
    state[sym] = {
      symbol: sym,
      lastPrice: null,
      prevPrice: null,
      updated: 0,
      flats: null,
      compression: {},
      compressionDist: {},
      maValues: {},
      lastMATouches: {},
      flatSummary: { best: 0, rating: '-', bullish: 0, bearish: 0 },
      direction: 'NEUTRAL',
      grade: '-',
      alert: false,
      htfMagnets: { '1h': { above: null, below: null }, '4h': { above: null, below: null } }
    };
  }

  function addBanner(type, message) {
    const banner = { id: Date.now(), type, message, time: new Date().toLocaleTimeString() };
    banners.unshift(banner);
    if (banners.length > MAX_BANNERS) banners.pop();
    renderBanners();
    setTimeout(() => {
      const idx = banners.findIndex(b => b.id === banner.id);
      if (idx !== -1) { banners.splice(idx, 1); renderBanners(); }
    }, 30000);
  }

  function renderBanners() {
    const container = document.getElementById('bannerContainer');
    if (!container) return;
    container.innerHTML = banners.map(b => `
      <div class="banner ${b.type}">
        <span class="icon">${b.type === 'touch' ? '📍' : b.type === 'cross' ? '⚡' : '🔔'}</span>
        <span>${b.message}</span>
        <span class="time">${b.time}</span>
      </div>
    `).join('');
  }

  function updateFlatSummary(symObj) {
    let best = 0, bullish = 0, bearish = 0;
    if (symObj.flats) {
      if (typeof symObj.flats.bestCU === 'number') bullish = symObj.flats.bestCU;
      if (typeof symObj.flats.bestCD === 'number') bearish = symObj.flats.bestCD;
      best = Math.max(bullish, bearish);
      if (best === 0 && typeof symObj.flats.best === 'number') best = symObj.flats.best;
    }
    if (bullish > bearish && bullish >= 2) symObj.direction = 'BULLISH';
    else if (bearish > bullish && bearish >= 2) symObj.direction = 'BEARISH';
    else symObj.direction = 'NEUTRAL';
    let rating = '-';
    if (best >= 3) rating = 'A+';
    else if (best === 2) rating = 'A';
    else if (best === 1) rating = 'B';
    const c = symObj.compression || {};
    const comp15m = c['15m'];
    symObj.alert = comp15m && bullish >= 2;
    symObj.flatSummary = { best, rating, bullish, bearish };
    symObj.grade = symObj.alert ? 'A+' : rating;
  }

  const dirty = new Set();
  let rafPending = false;

  function markDirty(sym) {
    dirty.add(sym);
    if (!rafPending) { rafPending = true; requestAnimationFrame(flushUI); }
  }

  function flushUI() {
    rafPending = false;
    for (const sym of dirty) renderSymbol(sym);
    dirty.clear();
  }

  function renderSymbol(sym) {
    const s = state[sym];
    if (!s) return;
    updateFlatSummary(s);
    setText(`price-${sym}`, fmtPrice(s.lastPrice));
    setText(`tPrice-${sym}`, fmtPrice(s.lastPrice));
    const pc = pct(s.prevPrice, s.lastPrice);
    if (pc == null) {
      setText(`chg-${sym}`, '—');
      setClass(`chg-${sym}`, 'chg neu mono');
      setText(`tChg-${sym}`, '—');
    } else {
      const sign = pc >= 0 ? '▲' : '▼';
      const txt = `${sign} ${Math.abs(pc).toFixed(2)}%`;
      setText(`chg-${sym}`, txt);
      setClass(`chg-${sym}`, `chg ${pc >= 0 ? 'up' : 'down'} mono`);
      setText(`tChg-${sym}`, txt);
    }
    setText(`flats-bull-${sym}`, String(s.flatSummary.bullish || 0));
    setText(`flats-bear-${sym}`, String(s.flatSummary.bearish || 0));
    setText(`tFlats-${sym}`, `${s.flatSummary.bullish || 0} 🟢 / ${s.flatSummary.bearish || 0} 🔴`);
    const dirEl = document.getElementById(`direction-${sym}`);
    if (dirEl) {
      dirEl.textContent = s.direction;
      dirEl.className = `direction-badge direction-${s.direction.toLowerCase()}`;
    }
    setText(`tDir-${sym}`, s.direction);
    setText(`grade-${sym}`, `Grade: ${s.grade}`);
    setText(`tGrade-${sym}`, s.grade);
    const c = s.compression || {};
    const flags = [];
    if (c['5m']) flags.push('5m');
    if (c['15m']) flags.push('15m');
    if (c['1h']) flags.push('1h');
    if (c['4h']) flags.push('4h');
    setText(`comp-info-${sym}`, flags.length ? flags.join('+') : '');
    setText(`tComp-${sym}`, flags.length ? flags.join('+') : '—');
    const compDist = s.compressionDist['15m'] || s.compressionDist['1h'];
    if (compDist !== undefined && compDist !== null) {
      const distText = compDist > 0 ? `↑${compDist.toFixed(2)}%` : `↓${Math.abs(compDist).toFixed(2)}%`;
      setText(`comp-dist-${sym}`, `Dist to compression: ${distText}`);
    } else {
      setText(`comp-dist-${sym}`, '');
    }
    const htfEl = document.getElementById(`htf-${sym}`);
    if (htfEl) {
      const magnets1h = s.htfMagnets['1h'];
      const magnets4h = s.htfMagnets['4h'];
      const parts = [];
      if (magnets1h.above) parts.push(`1h ↑${magnets1h.above.dist}%`);
      if (magnets1h.below) parts.push(`1h ↓${magnets1h.below.dist}%`);
      if (magnets4h.above) parts.push(`4h ↑${magnets4h.above.dist}%`);
      if (magnets4h.below) parts.push(`4h ↓${magnets4h.below.dist}%`);
      htfEl.textContent = parts.length ? `Magnets: ${parts.join(' • ')}` : '';
    }
    const card = document.getElementById(`card-${sym}`);
    if (card) {
      const existing = card.querySelector('.alert');
      if (s.alert && !existing) {
        const el = document.createElement('div');
        el.className = 'alert';
        el.textContent = '⚡ A+ Setup';
        card.appendChild(el);
      } else if (!s.alert && existing) {
        existing.remove();
      }
    }
  }

  let msgCount = 0;
  function setDbg(label) {
    const el = document.getElementById('dbgLine');
    if (!el) return;
    el.textContent = `msgs: ${msgCount} • last: ${new Date().toLocaleTimeString()} • format: ${label || '—'}`;
  }

  function setWsStatus(ok, text) {
    const pill = document.getElementById('wsPill');
    const t = document.getElementById('wsText');
    if (t) t.textContent = text;
    if (pill) pill.className = ok ? 'pill pill-on' : 'pill pill-off';
  }

  function applyPrice(sym, price, label) {
    const s = state[sym];
    if (!s) return;
    const p = Number(price);
    if (!Number.isFinite(p)) return;
    if (s.lastPrice != null && p === s.lastPrice) return;
    s.prevPrice = s.lastPrice;
    s.lastPrice = p;
    s.updated = Date.now();
    markDirty(sym);
    setDbg(label || 'price');
  }

  let ws = null;
  let retryMs = 300;

  function handleMsg(msg) {
    window.__lastMsg = msg;
    msgCount++;
    if (msg?.type === 'price' && msg.symbol && msg.price != null) {
      const sym = String(msg.symbol).toUpperCase().trim();
      if (SYMBOL_SET.has(sym)) applyPrice(sym, msg.price, 'ws:price');
      return;
    }
    if (msg?.type === 'candle' && msg.symbol && msg.candle) {
      const sym = String(msg.symbol).toUpperCase().trim();
      const close = Number(msg.candle.close ?? msg.candle.c);
      if (SYMBOL_SET.has(sym) && Number.isFinite(close)) applyPrice(sym, close, 'ws:candle');
      return;
    }
    if (msg?.type === 'flatSignal' && msg.symbol) {
      const sym = String(msg.symbol).toUpperCase().trim();
      if (state[sym]) {
        state[sym].flats = msg;
        markDirty(sym);
        setDbg('flatSignal');
      }
      return;
    }
    if (msg?.type === 'compression' && msg.symbol) {
      const sym = String(msg.symbol).toUpperCase().trim();
      if (state[sym]) {
        const tf = msg.tf || '5m';
        state[sym].compression[tf] = !!msg.on;
        markDirty(sym);
        setDbg('compression');
      }
      return;
    }
    if (msg?.type === 'htfMagnets' && msg.symbol) {
      const sym = String(msg.symbol).toUpperCase().trim();
      if (state[sym]) {
        const tf = msg.tf;
        if (!state[sym].htfMagnets[tf]) state[sym].htfMagnets[tf] = {};
        if (msg.nearestAbove) {
          state[sym].htfMagnets[tf].above = { level: msg.nearestAbove.level, side: msg.nearestAbove.side, dist: msg.aboveDist?.toFixed(2) };
        } else {
          state[sym].htfMagnets[tf].above = null;
        }
        if (msg.nearestBelow) {
          state[sym].htfMagnets[tf].below = { level: msg.nearestBelow.level, side: msg.nearestBelow.side, dist: msg.belowDist?.toFixed(2) };
        } else {
          state[sym].htfMagnets[tf].below = null;
        }
        markDirty(sym);
        setDbg('htfMagnets');
      }
      return;
    }
    if (msg?.type === 'alert') {
      const sym = String(msg.symbol || '').toUpperCase().trim();
      console.log(`🚨 [ALERT] ${msg.title}: ${msg.body}`);
      addBanner('alert', msg.body);
      const card = document.getElementById(`card-${sym}`);
      if (card) card.style.animation = 'alertPulse 1s ease-in-out 3';
      setDbg('alert');
      return;
    }
    if (msg?.type === 'maTouch' && msg.symbol) {
      const sym = String(msg.symbol).toUpperCase().trim();
      const message = `${sym} ${msg.tf}: Price touched ${msg.maName} @ ${msg.maValue.toFixed(2)}`;
      console.log(`📍 [MA TOUCH] ${message}`);
      addBanner('touch', message);
      setDbg('maTouch');
      return;
    }
    if (msg?.type === 'maCross' && msg.symbol) {
      const sym = String(msg.symbol).toUpperCase().trim();
      const direction = msg.crossedAbove ? 'above' : 'below';
      const message = `${sym} ${msg.tf}: Price crossed ${direction} ${msg.maName}`;
      console.log(`⚡ [MA CROSS] ${message}`);
      addBanner('cross', message);
      setDbg('maCross');
      return;
    }
    if (msg?.type === 'maData' && msg.symbol) {
      const sym = String(msg.symbol).toUpperCase().trim();
      if (state[sym]) {
        state[sym].maValues[msg.tf] = msg.values;
        setDbg('maData');
      }
      return;
    }
    if (msg?.type === 'compressionData' && msg.symbol) {
      const sym = String(msg.symbol).toUpperCase().trim();
      if (state[sym]) {
        const tf = msg.tf;
        if (msg.distance !== undefined && msg.distance !== null) {
          state[sym].compressionDist[tf] = msg.distance;
        }
        markDirty(sym);
        setDbg('compressionData');
      }
      return;
    }
    setDbg(msg?.type || 'unknown');
  }

  function connectWs() {
    setWsStatus(false, 'Connecting…');
    try {
      ws = new WebSocket(WS_URL);
    } catch (err) {
      console.error('WS connection error:', err);
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      retryMs = 300;
      setWsStatus(true, `Live • ${WS_URL.replace(/^ws(s)?:\/\//, '')}`);
      console.log('[WS] Connected to', WS_URL);
    };
    ws.onclose = () => {
      setWsStatus(false, 'Disconnected');
      console.log('[WS] Disconnected');
      scheduleReconnect();
    };
    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
      try { ws.close(); } catch {}
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } 
      catch (err) { console.error('[WS] Parse error:', err); return; }
      handleMsg(msg);
    };
  }

  function scheduleReconnect() {
    const wait = Math.min(5000, retryMs);
    retryMs = Math.min(5000, Math.floor(retryMs * 1.6));
    console.log(`[WS] Reconnecting in ${wait}ms...`);
    setTimeout(connectWs, wait);
  }

  async function pollBackendPrices() {
    try {
      const url = `${HTTP_BASE}/api/binance/price?symbols=${encodeURIComponent(SYMBOLS.join(','))}`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return;
      const arr = await r.json();
      if (!Array.isArray(arr)) return;
      for (const row of arr) {
        const sym = String(row.symbol || '').toUpperCase();
        if (SYMBOL_SET.has(sym)) applyPrice(sym, row.price, 'http');
      }
    } catch (err) {
      console.error('[HTTP] Poll error:', err);
    }
  }

  setInterval(pollBackendPrices, 2000);
  pollBackendPrices();
  ensureUI();
  SYMBOLS.forEach(renderSymbol);
  connectWs();
  console.log('[UI] app.js loaded');
  console.log('[UI] WS_URL =', WS_URL);
  console.log('[UI] HTTP_BASE =', HTTP_BASE);
})();