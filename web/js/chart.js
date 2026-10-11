// Kerzen-Chart mit SMA 50, SMA 200, Volumen und Marken für Ausbruch/Einstieg/Stop (TradingView Lightweight Charts).
import { smaSeries } from '../core/indicators.js';

const LW = () => window.LightweightCharts;
const toRgba = (hex, a) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : hex;
};

export function palette() {
  const css = getComputedStyle(document.documentElement);
  const g = (n) => css.getPropertyValue(n).trim();
  return { green: g('--green'), red: g('--red'), muted: g('--muted'), line: g('--line'), text: g('--text'), amber: g('--amber'), accent: g('--accent') };
}

export function drawChart(el, bars, signal) {
  const L = LW();
  const c = palette();
  el.innerHTML = '';
  const chart = L.createChart(el, {
    autoSize: true,
    layout: { background: { type: 'solid', color: 'transparent' }, textColor: c.muted, fontFamily: 'system-ui, sans-serif', fontSize: 11 },
    grid: { vertLines: { visible: false }, horzLines: { color: toRgba(c.line, 0.7) } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.06, bottom: 0.27 } },
    timeScale: { borderVisible: false, rightOffset: 4, fixLeftEdge: true },
    crosshair: { mode: 0 },
    localization: { locale: 'de-DE' }
  });

  const candles = chart.addSeries(L.CandlestickSeries, {
    upColor: c.green, downColor: c.red, borderUpColor: c.green, borderDownColor: c.red, wickUpColor: c.green, wickDownColor: c.red,
    priceLineVisible: false
  });
  candles.setData(bars.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c })));

  const vol = chart.addSeries(L.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.79, bottom: 0 } });
  vol.setData(bars.map((b) => ({ time: b.t, value: b.v, color: toRgba(b.c >= b.o ? c.green : c.red, 0.45) })));

  const closes = bars.map((b) => b.c);
  const line = (period, color) => {
    const s = chart.addSeries(L.LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const vals = smaSeries(closes, period);
    s.setData(bars.map((b, i) => (vals[i] == null ? null : { time: b.t, value: vals[i] })).filter(Boolean));
  };
  line(50, c.accent);
  line(200, c.amber);

  const priceLine = (price, color, title, style = L.LineStyle.Dashed) =>
    price != null && candles.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title });
  priceLine(signal.level, c.muted, 'Ausbruch');
  if (signal.overall !== 'noch_nicht') {
    priceLine(signal.entryMax, c.green, 'max. Einstieg', L.LineStyle.Dotted);
    priceLine(signal.stop, c.red, 'Stop');
  }

  if (signal.mode && L.createSeriesMarkers) {
    const last = bars[bars.length - 1];
    L.createSeriesMarkers(candles, [{
      time: last.t, position: 'belowBar', shape: 'arrowUp', color: signal.overall === 'kaufsignal' ? c.green : c.muted,
      text: signal.mode === 'ausbruch' ? 'Ausbruch' : 'Umkehr'
    }]);
  }

  const setRange = (days) => {
    const n = bars.length;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - days), to: n + 3 });
  };
  setRange(126);
  return { chart, setRange, remove: () => chart.remove() };
}
