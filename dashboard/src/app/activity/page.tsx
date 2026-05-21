"use client";

import { useEffect, useState, useCallback } from "react";
import { formatCurrency, formatNumber, formatDate, formatPriceOriginal } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { DataTable, ColumnDef } from "@/components/data-table";

/* ── Types ─────────────────────────────────────────── */

interface Fill {
  quantity: number;
  amount_eur: number;
  commission_eur: number;
  net_amount_eur: number;
  price_original: number;
  fx_rate: number;
}

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
  fill_count: number;
  fills: Fill[];
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

/* ── Column definitions ─────────────────────────────── */

const COLUMNS: ColumnDef<ActivityItem>[] = [
  {
    key: "date",
    label: "Date",
    sortable: true,
    getStringValue: (r) => r.date,
    render: (r) => <span className="tabular-nums text-sm">{formatDate(r.date)}</span>,
  },
  {
    key: "type",
    label: "Type",
    sortable: true,
    getStringValue: (r) => r.type,
    render: (r) => (
      <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium", TYPE_STYLES[r.type] || "bg-gray-100 text-gray-600 border-gray-200")}>
        {r.type}
      </span>
    ),
  },
  {
    key: "broker",
    label: "Broker",
    sortable: true,
    getStringValue: (r) => r.broker,
    render: (r) => (
      <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium", BROKER_STYLES[r.broker] || "bg-gray-100 text-gray-600 border-gray-200")}>
        {r.broker}
      </span>
    ),
  },
  {
    key: "ticker",
    label: "Ticker",
    sortable: true,
    getStringValue: (r) => r.ticker,
    render: (r) => (
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-sm font-medium">{r.ticker || <span className="text-muted-foreground">—</span>}</span>
        {r.fill_count > 1 && (
          <span className="text-[10px] text-muted-foreground bg-muted rounded px-1 py-0.5 leading-none">
            {r.fill_count} fills
          </span>
        )}
      </span>
    ),
  },
  {
    key: "net_amount_eur",
    label: "Net EUR",
    sortable: true,
    align: "right",
    footer: "sum",
    getValue: (r) => r.net_amount_eur,
    render: (r) => (
      <span className={cn("font-mono text-sm font-medium", r.net_amount_eur >= 0 ? "text-positive" : "text-negative")}>
        {formatCurrency(r.net_amount_eur)}
      </span>
    ),
  },
  // Secondary columns
  {
    key: "quantity",
    label: "Qty",
    secondary: true,
    sortable: true,
    align: "right",
    getValue: (r) => r.quantity,
    render: (r) => (
      <span className="font-mono text-sm">
        {r.quantity > 0 ? formatNumber(r.quantity, r.quantity < 1 ? 6 : 2) : <span className="text-muted-foreground">—</span>}
      </span>
    ),
  },
  {
    key: "amount_eur",
    label: "Amount",
    secondary: true,
    sortable: true,
    align: "right",
    getValue: (r) => r.amount_eur,
    render: (r) => <span className="font-mono text-sm">{formatCurrency(Math.abs(r.amount_eur))}</span>,
  },
  {
    key: "commission_eur",
    label: "Commission",
    secondary: true,
    sortable: true,
    align: "right",
    footer: "sum",
    getValue: (r) => r.commission_eur,
    render: (r) => (
      <span className="font-mono text-sm text-muted-foreground">
        {r.commission_eur > 0 ? formatCurrency(r.commission_eur) : <span>—</span>}
      </span>
    ),
  },
  {
    key: "price_original",
    label: "Price (orig)",
    secondary: true,
    sortable: true,
    align: "right",
    getValue: (r) => r.price_original,
    render: (r) => <span className="font-mono text-sm">{r.price_original > 0 ? formatPriceOriginal(r.price_original, r.currency_original) : "—"}</span>,
  },
  {
    key: "currency_original",
    label: "Currency",
    secondary: true,
    sortable: false,
    render: (r) => <span className="text-sm text-muted-foreground">{r.currency_original || "—"}</span>,
  },
  {
    key: "fx_rate",
    label: "FX Rate",
    secondary: true,
    sortable: true,
    align: "right",
    getValue: (r) => r.fx_rate,
    render: (r) => <span className="font-mono text-sm text-muted-foreground">{r.fx_rate > 0 && r.fx_rate !== 1 ? formatNumber(r.fx_rate, 4) : "—"}</span>,
  },
];

/* ── Component ──────────────────────────────────────── */

export default function ActivityPage() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("");
  const [filterBroker, setFilterBroker] = useState<string>("");
  const [filterTicker, setFilterTicker] = useState<string>("");
  const [tickerInput, setTickerInput] = useState<string>("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchData = useCallback(() => {
    const params = new URLSearchParams();
    if (filterType) params.set("type", filterType);
    if (filterBroker) params.set("broker", filterBroker);
    if (filterTicker) params.set("ticker", filterTicker);
    params.set("limit", String(PAGE_SIZE));
    params.set("page", String(page));
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);

    setLoading(true);
    fetch(`/api/activity?${params}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [filterType, filterBroker, filterTicker, page, sortBy, sortDir]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => { setPage(1); }, [filterType, filterBroker, filterTicker]);

  function handleTickerSearch(e: React.FormEvent) {
    e.preventDefault();
    setFilterTicker(tickerInput.trim().toUpperCase());
  }

  function handleSortChange(key: string, dir: "asc" | "desc") {
    setSortBy(key);
    setSortDir(dir);
    setPage(1);
  }

  const filterSlot = (
    <>
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
          <option key={b} value={b}>{b}</option>
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
        <span className="text-xs text-muted-foreground">
          {data.total.toLocaleString("es-ES")} results
        </span>
      )}
    </>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold font-serif">Activity</h1>
        <p className="text-sm text-muted-foreground">
          All operations, dividends, deposits and withdrawals
        </p>
      </div>

      <DataTable<ActivityItem>
        data={data?.activity ?? []}
        columns={COLUMNS}
        defaultSort={{ key: "date", dir: "desc" }}
        onSortChange={handleSortChange}
        storageKey="activity"
        getRowKey={(r, i) => `${r.date}-${r.type}-${r.ticker}-${i}`}
        loading={loading}
        totalRows={data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        filterSlot={filterSlot}
        expandRow={(r) => {
          if (r.fill_count <= 1) return null;
          return (
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-medium pb-1 pr-4">Qty</th>
                  <th className="text-right font-medium pb-1 pr-4">Price (orig)</th>
                  <th className="text-right font-medium pb-1 pr-4">Amount EUR</th>
                  <th className="text-right font-medium pb-1 pr-4">Commission EUR</th>
                  <th className="text-right font-medium pb-1">FX Rate</th>
                </tr>
              </thead>
              <tbody>
                {r.fills.map((f, i) => (
                  <tr key={i} className="tabular-nums">
                    <td className="pr-4 py-0.5">{formatNumber(f.quantity, f.quantity < 1 ? 6 : 4)}</td>
                    <td className="text-right pr-4 py-0.5">{f.price_original > 0 ? formatPriceOriginal(f.price_original, r.currency_original) : "—"}</td>
                    <td className="text-right pr-4 py-0.5">{formatCurrency(f.amount_eur)}</td>
                    <td className="text-right pr-4 py-0.5">{f.commission_eur > 0 ? formatCurrency(f.commission_eur) : "—"}</td>
                    <td className="text-right py-0.5">{f.fx_rate !== 1 ? formatNumber(f.fx_rate, 4) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }}
      />
    </div>
  );
}
