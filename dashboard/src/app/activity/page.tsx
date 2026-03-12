"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

/* ── Types ─────────────────────────────────────────── */

interface ActivityItem {
  date: string;
  broker: string;
  type: string;
  ticker: string;
  quantity: number;
  amount_eur: number;
  commission_eur: number;
  net_amount_eur: number;
  currency_original: string;
  price_original: number;
  fx_rate: number;
}

interface ActivityData {
  activity: ActivityItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  brokers: string[];
}

/* ── Constants ──────────────────────────────────────── */

const TYPE_TABS = [
  { label: "All", value: "" },
  { label: "Buy", value: "BUY" },
  { label: "Sell", value: "SELL" },
  { label: "Dividend", value: "DIVIDEND" },
  { label: "Deposit", value: "DEPOSIT" },
  { label: "Withdrawal", value: "WITHDRAWAL" },
] as const;

const TYPE_STYLES: Record<string, string> = {
  BUY: "bg-emerald-100 text-emerald-700 border-emerald-200",
  SELL: "bg-red-100 text-red-700 border-red-200",
  DIVIDEND: "bg-blue-100 text-blue-700 border-blue-200",
  DEPOSIT: "bg-gray-100 text-gray-600 border-gray-200",
  WITHDRAWAL: "bg-amber-100 text-amber-700 border-amber-200",
};

const BROKER_STYLES: Record<string, string> = {
  Degiro: "bg-blue-100 text-blue-700 border-blue-200",
  "Trading 212": "bg-emerald-100 text-emerald-700 border-emerald-200",
  Kraken: "bg-purple-100 text-purple-700 border-purple-200",
  IBKR: "bg-red-100 text-red-700 border-red-200",
  Fintual: "bg-amber-100 text-amber-700 border-amber-200",
};

const PAGE_SIZE = 25;

/* ── Component ──────────────────────────────────────── */

export default function ActivityPage() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("");
  const [filterBroker, setFilterBroker] = useState<string>("");
  const [filterTicker, setFilterTicker] = useState<string>("");
  const [tickerInput, setTickerInput] = useState<string>("");
  const [page, setPage] = useState(1);

  const fetchData = useCallback(() => {
    const params = new URLSearchParams();
    if (filterType) params.set("type", filterType);
    if (filterBroker) params.set("broker", filterBroker);
    if (filterTicker) params.set("ticker", filterTicker);
    params.set("limit", String(PAGE_SIZE));
    params.set("page", String(page));

    setLoading(true);
    fetch(`/api/activity?${params}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [filterType, filterBroker, filterTicker, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filterType, filterBroker, filterTicker]);

  function handleTickerSearch(e: React.FormEvent) {
    e.preventDefault();
    setFilterTicker(tickerInput.trim().toUpperCase());
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold font-serif">Activity</h1>
        <p className="text-sm text-muted-foreground">
          All operations, dividends, deposits and withdrawals
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type tabs */}
        <div className="flex flex-wrap rounded-lg border border-border bg-muted/50 p-0.5">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilterType(tab.value)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                filterType === tab.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Broker dropdown */}
        <select
          value={filterBroker}
          onChange={(e) => setFilterBroker(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs"
        >
          <option value="">All Brokers</option>
          {data?.brokers.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        {/* Ticker search */}
        <form onSubmit={handleTickerSearch} className="flex items-center gap-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Ticker..."
              value={tickerInput}
              onChange={(e) => {
                setTickerInput(e.target.value);
                if (e.target.value === "") setFilterTicker("");
              }}
              className="rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </form>

        {/* Results count */}
        {data && !loading && (
          <span className="ml-auto text-xs text-muted-foreground">
            {data.total.toLocaleString("es-ES")} results
          </span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      ) : data ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Broker</TableHead>
                  <TableHead>Ticker</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Net EUR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.activity.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-24 text-center text-sm text-muted-foreground"
                    >
                      No results found
                    </TableCell>
                  </TableRow>
                ) : (
                  data.activity.map((item, i) => (
                    <TableRow
                      key={`${item.date}-${item.type}-${item.ticker}-${i}`}
                    >
                      <TableCell className="text-sm tabular-nums">
                        {item.date}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                            TYPE_STYLES[item.type] || "bg-gray-100 text-gray-600 border-gray-200"
                          )}
                        >
                          {item.type}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                            BROKER_STYLES[item.broker] || "bg-gray-100 text-gray-600 border-gray-200"
                          )}
                        >
                          {item.broker}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium">
                        {item.ticker || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {item.quantity > 0
                          ? formatNumber(item.quantity, item.quantity < 1 ? 6 : 2)
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(Math.abs(item.amount_eur))}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {item.commission_eur > 0
                          ? formatCurrency(item.commission_eur)
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono text-sm font-medium",
                          item.net_amount_eur >= 0
                            ? "text-positive"
                            : "text-negative"
                        )}
                      >
                        {formatCurrency(item.net_amount_eur)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Page {data.page} of {data.totalPages} · {data.total.toLocaleString("es-ES")} rows
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm transition-colors",
                      page <= 1
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:bg-muted"
                    )}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {/* Page numbers (show 5 around current) */}
                  {Array.from({ length: data.totalPages }, (_, i) => i + 1)
                    .filter(
                      (p) =>
                        p === 1 ||
                        p === data.totalPages ||
                        Math.abs(p - page) <= 2
                    )
                    .reduce<(number | "…")[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1)
                        acc.push("…");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === "…" ? (
                        <span
                          key={`ellipsis-${i}`}
                          className="px-1 text-xs text-muted-foreground"
                        >
                          …
                        </span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setPage(p as number)}
                          className={cn(
                            "flex h-7 min-w-[28px] items-center justify-center rounded-md border px-2 text-xs font-medium transition-colors",
                            page === p
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border hover:bg-muted"
                          )}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    onClick={() =>
                      setPage((p) => Math.min(data.totalPages, p + 1))
                    }
                    disabled={page >= data.totalPages}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm transition-colors",
                      page >= data.totalPages
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:bg-muted"
                    )}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
