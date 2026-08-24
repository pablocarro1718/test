"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatNumber, formatPercent, formatDate, formatPriceOriginal } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

/* ── Types ─────────────────────────────────────────── */

interface TickerItem { ticker: string; name: string; open: boolean; }
interface Trade { date: string; type: string; quantity: number; price: number; eur: number; }
interface AssetData {
  tickers: TickerItem[];
  ticker: string;
  name: string;
  symbol: string;
  currency: string;
  prices: Array<{ t: number; close: number }>;
  trades: Trade[];
  summary: { avgBuyPrice: number; netQty: number; firstBuy: string | null; lastPrice: number; open: boolean };
}

const RANGES = ["6M", "1A", "5A", "Todo"];
const BUY_COLOR = "#16a34a";
const SELL_COLOR = "#dc2626";
const PRICE_COLOR = "#378ADD";
const AVG_COLOR = "#BA7517";

/* ── Marker dots ───────────────────────────────────── */

function BuyDot(props: { cx?: number; cy?: number; value?: number | null }) {
  const { cx, cy, value } = props;
  if (value == null || cx == null || cy == null) return <g />;
  return <path d={`M${cx},${cy - 8} L${cx - 6},${cy + 4} L${cx + 6},${cy + 4} Z`} fill={BUY_COLOR} stroke="white" strokeWidth={1.5} />;
}
function SellDot(props: { cx?: number; cy?: number; value?: number | null }) {
  const { cx, cy, value } = props;
  if (value == null || cx == null || cy == null) return <g />;
  return <path d={`M${cx},${cy + 8} L${cx - 6},${cy - 4} L${cx + 6},${cy - 4} Z`} fill={SELL_COLOR} stroke="white" strokeWidth={1.5} />;
}

/* ── Tooltip ───────────────────────────────────────── */

interface TP { type: string; qty: number; price: number; eur: number; }
function ChartTooltip(props: { active?: boolean; payload?: Array<{ payload: { dateStr: string; close: number; trade: TP | null } }>; currency?: string }) {
  const { active, payload, currency = "USD" } = props;
  if (!active || !payload || !payload.length) return null;
  const pt = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-white px-3 py-2 text-xs shadow-sm">
      <div className="font-medium">{formatDate(pt.dateStr)}</div>
      <div className="text-muted-foreground">{formatPriceOriginal(pt.close, currency)}</div>
      {pt.trade && (
        <div className={cn("mt-1 border-t border-border/50 pt-1 font-medium", pt.trade.type === "BUY" ? "text-positive" : "text-negative")}>
          {pt.trade.type === "BUY" ? "Compra" : "Venta"}: {formatNumber(pt.trade.qty, pt.trade.qty < 1 ? 4 : 2)} uds a {formatPriceOriginal(pt.trade.price, currency)}
          <div className="font-normal text-muted-foreground">≈ {formatCurrency(pt.trade.eur, 0)}</div>
        </div>
      )}
    </div>
  );
}

/* ── Component ─────────────────────────────────────── */

export default function AssetPage() {
  const [tickers, setTickers] = useState<TickerItem[]>([]);
  const [selected, setSelected] = useState("");
  const [range, setRange] = useState("1A");
  const [data, setData] = useState<AssetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/asset-history")
      .then((r) => r.json())
      .then((j: { tickers: TickerItem[] }) => {
        setTickers(j.tickers || []);
        if (j.tickers?.length) setSelected(j.tickers[0].ticker);
      });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    fetch(`/api/asset-history?ticker=${encodeURIComponent(selected)}&range=${range}`)
      .then((r) => r.json())
      .then((j: AssetData) => { setData(j); if (j.tickers?.length) setTickers(j.tickers); })
      .finally(() => setLoading(false));
  }, [selected, range]);

  const currency = data?.currency ?? "USD";

  const chartData = useMemo(() => {
    if (!data?.prices?.length) return [];
    const pts = data.prices.map((p) => ({
      t: p.t,
      dateStr: new Date(p.t).toISOString().split("T")[0],
      close: p.close,
      buyMarker: null as number | null,
      sellMarker: null as number | null,
      trade: null as TP | null,
    }));
    const idxByDate = new Map<string, number>();
    pts.forEach((d, i) => idxByDate.set(d.dateStr, i));
    const first = pts[0].t, last = pts[pts.length - 1].t;
    for (const tr of data.trades) {
      let i = idxByDate.get(tr.date);
      if (i === undefined) {
        const tt = new Date(tr.date).getTime();
        if (tt < first - 5 * 86400000 || tt > last + 5 * 86400000) continue; // outside visible range
        let best = -1, bestDiff = Infinity;
        for (let k = 0; k < pts.length; k++) {
          const dd = Math.abs(pts[k].t - tt);
          if (dd < bestDiff) { bestDiff = dd; best = k; }
        }
        i = best;
      }
      if (i === undefined || i < 0) continue;
      const pt = pts[i];
      if (tr.type === "BUY") pt.buyMarker = tr.price;
      else pt.sellMarker = tr.price;
      if (!pt.trade) pt.trade = { type: tr.type, qty: tr.quantity, price: tr.price, eur: tr.eur };
      else {
        const totQty = pt.trade.qty + tr.quantity;
        pt.trade = {
          type: pt.trade.type,
          qty: totQty,
          price: totQty > 0 ? (pt.trade.price * pt.trade.qty + tr.price * tr.quantity) / totQty : tr.price,
          eur: pt.trade.eur + tr.eur,
        };
      }
    }
    return pts;
  }, [data]);

  const yDomain = useMemo<[number, number]>(() => {
    const vals: number[] = chartData.map((d) => d.close);
    data?.trades.forEach((t) => vals.push(t.price));
    if (data?.summary?.avgBuyPrice) vals.push(data.summary.avgBuyPrice);
    if (!vals.length) return [0, 1];
    const min = Math.min(...vals), max = Math.max(...vals);
    const pad = (max - min) * 0.08 || max * 0.05;
    return [Math.max(0, min - pad), max + pad];
  }, [chartData, data]);

  const openTickers = tickers.filter((t) => t.open);
  const closedTickers = tickers.filter((t) => !t.open);

  const avg = data?.summary?.avgBuyPrice ?? 0;
  const last = data?.summary?.lastPrice ?? 0;
  const vsEntry = avg > 0 && last > 0 ? (last / avg - 1) * 100 : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Cotizaciones</h1>
        <p className="text-sm text-muted-foreground">Precio histórico de cada activo con tus compras y ventas</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-md border border-border bg-white px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-positive/30"
        >
          {openTickers.length > 0 && (
            <optgroup label="En cartera">
              {openTickers.map((t) => <option key={t.ticker} value={t.ticker}>{t.ticker} · {t.name}</option>)}
            </optgroup>
          )}
          {closedTickers.length > 0 && (
            <optgroup label="Cerradas">
              {closedTickers.map((t) => <option key={t.ticker} value={t.ticker}>{t.ticker} · {t.name}</option>)}
            </optgroup>
          )}
        </select>

        <div className="flex gap-1 rounded-md bg-muted/50 p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded px-3 py-1 text-[13px] transition-colors",
                range === r ? "bg-white font-medium shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-muted/40 p-3">
          <div className="text-xs text-muted-foreground">Precio actual</div>
          <div className="text-xl font-semibold">{last > 0 ? formatPriceOriginal(last, currency) : "—"}</div>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <div className="text-xs text-muted-foreground">Tu precio medio</div>
          <div className="text-xl font-semibold">{avg > 0 ? formatPriceOriginal(avg, currency) : "—"}</div>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <div className="text-xs text-muted-foreground">Vs tu entrada</div>
          <div className={cn("text-xl font-semibold", vsEntry == null ? "" : vsEntry >= 0 ? "text-positive" : "text-negative")}>
            {vsEntry == null ? "—" : formatPercent(vsEntry)}
          </div>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <div className="text-xs text-muted-foreground">Primera compra</div>
          <div className="text-xl font-semibold">{data?.summary?.firstBuy ? formatDate(data.summary.firstBuy) : "—"}</div>
        </div>
      </div>

      {/* Chart */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">Cargando…</div>
          ) : chartData.length === 0 ? (
            <div className="flex h-80 flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
              <span>Sin datos de cotización para {data?.ticker}.</span>
              <span className="text-xs">Puede estar deslistado o sin histórico en Yahoo Finance.</span>
            </div>
          ) : (
            <>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                    <XAxis
                      dataKey="t"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(t) => {
                        const d = new Date(t);
                        return `${d.toLocaleString("es-ES", { month: "short" })} ${String(d.getFullYear()).slice(2)}`;
                      }}
                      tick={{ fontSize: 11 }}
                      minTickGap={40}
                      stroke="#b8b2a7"
                    />
                    <YAxis
                      domain={yDomain}
                      tickFormatter={(v) => formatNumber(v, 0)}
                      tick={{ fontSize: 11 }}
                      width={52}
                      stroke="#b8b2a7"
                    />
                    <Tooltip content={<ChartTooltip currency={currency} />} />
                    {avg > 0 && (
                      <ReferenceLine
                        y={avg}
                        stroke={AVG_COLOR}
                        strokeDasharray="4 4"
                        label={{ value: `Precio medio ${formatPriceOriginal(avg, currency)}`, position: "insideTopRight", fontSize: 11, fill: "#854F0B" }}
                      />
                    )}
                    <Line type="monotone" dataKey="close" stroke={PRICE_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line dataKey="buyMarker" stroke="none" isAnimationActive={false} dot={<BuyDot />} activeDot={false} legendType="none" />
                    <Line dataKey="sellMarker" stroke="none" isAnimationActive={false} dot={<SellDot />} activeDot={false} legendType="none" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="mt-2 flex flex-wrap gap-4 px-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0 w-0 border-x-4 border-b-[7px] border-x-transparent" style={{ borderBottomColor: BUY_COLOR }} /> Compra</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0 w-0 border-x-4 border-t-[7px] border-x-transparent" style={{ borderTopColor: SELL_COLOR }} /> Venta</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-3.5" style={{ background: PRICE_COLOR }} /> Cotización ({currency})</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
