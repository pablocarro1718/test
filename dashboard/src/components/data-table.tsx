"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  ChevronRight as ExpandIcon,
  ChevronDown as CollapseIcon,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/* ─────────────────────────────────────────────────────── */
/*  Types                                                  */
/* ─────────────────────────────────────────────────────── */

export interface ColumnDef<T> {
  /** Unique identifier used for sort state and localStorage */
  key: string;
  label: string;
  /** Whether this column is sortable (default: true) */
  sortable?: boolean;
  /** Secondary columns are hidden by default; user can toggle them */
  secondary?: boolean;
  /** Removable columns are visible by default but appear in the toggler so users can hide them */
  removable?: boolean;
  align?: "left" | "right" | "center";
  /** What to show in the sticky footer row */
  footer?: "sum" | "avg" | "count" | null;
  /** Render function for cell content */
  render: (row: T) => React.ReactNode;
  /** Extract a numeric value for sorting and footer calculations */
  getValue?: (row: T) => number;
  /** Extract a string/date value for text-based sorting */
  getStringValue?: (row: T) => string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  /** Default sort applied on first render */
  defaultSort?: { key: string; dir: "asc" | "desc" };
  /**
   * If provided, sort is delegated to the parent (server-side).
   * The component won't re-sort `data`.
   */
  onSortChange?: (key: string, dir: "asc" | "desc") => void;
  /** localStorage key to persist column visibility. If omitted, no persistence. */
  storageKey?: string;
  getRowKey: (row: T, i: number) => string;
  /** Optional expandable sub-row */
  expandRow?: (row: T) => React.ReactNode;
  /* Server-side pagination */
  totalRows?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  loading?: boolean;
  emptyMessage?: string;
  /** Filter / search UI rendered above the table */
  filterSlot?: React.ReactNode;
}

/* ─────────────────────────────────────────────────────── */
/*  Helpers                                                */
/* ─────────────────────────────────────────────────────── */

function formatFooterValue(
  value: number,
  footerType: "sum" | "avg" | "count"
): string {
  if (footerType === "count") return String(Math.round(value));
  if (Math.abs(value) >= 100) return formatCurrency(value);
  return formatNumber(value, 2);
}

/* ─────────────────────────────────────────────────────── */
/*  Column Selector Popover (with drag-to-reorder)         */
/* ─────────────────────────────────────────────────────── */

interface ColSelectorProps<T> {
  columns: ColumnDef<T>[];
  columnOrder: string[];
  visible: Set<string>;
  onToggle: (key: string) => void;
  onReorder: (newOrder: string[]) => void;
}

function SortableColItem<T>({
  col,
  visible,
  onToggle,
}: {
  col: ColumnDef<T>;
  visible: Set<string>;
  onToggle: (key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: col.key });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isAlwaysVisible = !col.secondary && !col.removable;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex cursor-default items-center gap-1.5 rounded-sm px-1.5 py-1 text-xs hover:bg-muted"
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <label className="flex flex-1 cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={isAlwaysVisible || visible.has(col.key)}
          disabled={isAlwaysVisible}
          onChange={() => !isAlwaysVisible && onToggle(col.key)}
          className="h-3 w-3 accent-primary"
        />
        <span className={isAlwaysVisible ? "text-foreground" : ""}>{col.label}</span>
      </label>
    </div>
  );
}

function ColSelector<T>({
  columns,
  columnOrder,
  visible,
  onToggle,
  onReorder,
}: ColSelectorProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Build ordered list of all columns
  const orderedCols = columnOrder
    .map((key) => columns.find((c) => c.key === key))
    .filter((c): c is ColumnDef<T> => !!c);

  if (columns.filter((c) => c.secondary || c.removable).length === 0) return null;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = columnOrder.indexOf(active.id as string);
      const newIndex = columnOrder.indexOf(over.id as string);
      onReorder(arrayMove(columnOrder, oldIndex, newIndex));
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors",
          open
            ? "bg-muted text-foreground"
            : "bg-background text-muted-foreground hover:text-foreground"
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Columns
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-border bg-card shadow-lg">
          <div className="p-2">
            <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Columns — drag to reorder
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={columnOrder}
                strategy={verticalListSortingStrategy}
              >
                {orderedCols.map((col) => (
                  <SortableColItem
                    key={col.key}
                    col={col}
                    visible={visible}
                    onToggle={onToggle}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */
/*  Sort Icon                                              */
/* ─────────────────────────────────────────────────────── */

function SortIcon({
  columnKey,
  sortKey,
  sortDir,
}: {
  columnKey: string;
  sortKey: string | null;
  sortDir: "asc" | "desc";
}) {
  if (sortKey !== columnKey)
    return <ArrowUpDown className="ml-1 inline h-3 w-3 text-muted-foreground/50" />;
  if (sortDir === "asc")
    return <ArrowUp className="ml-1 inline h-3 w-3 text-primary" />;
  return <ArrowDown className="ml-1 inline h-3 w-3 text-primary" />;
}

/* ─────────────────────────────────────────────────────── */
/*  Pagination                                             */
/* ─────────────────────────────────────────────────────── */

interface PaginationProps {
  page: number;
  totalPages: number;
  totalRows: number;
  onPageChange: (p: number) => void;
}

function Pagination({ page, totalPages, totalRows, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
    .reduce<(number | "…")[]>((acc, p, i, arr) => {
      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
      acc.push(p);
      return acc;
    }, []);

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages} · {totalRows.toLocaleString("es-ES")} rows
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm transition-colors",
            page <= 1 ? "cursor-not-allowed opacity-40" : "hover:bg-muted"
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
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
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm transition-colors",
            page >= totalPages ? "cursor-not-allowed opacity-40" : "hover:bg-muted"
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */
/*  DataTable                                              */
/* ─────────────────────────────────────────────────────── */

export function DataTable<T>({
  data,
  columns,
  defaultSort,
  onSortChange,
  storageKey,
  getRowKey,
  expandRow,
  totalRows,
  page = 1,
  pageSize,
  onPageChange,
  loading = false,
  emptyMessage = "No results found",
  filterSlot,
}: DataTableProps<T>) {
  /* ── Sort state ──────────────────────────────────────── */
  const [sortKey, setSortKey] = useState<string | null>(defaultSort?.key ?? null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSort?.dir ?? "desc");

  /* ── Column visibility ───────────────────────────────── */
  const [visibleSecondary, setVisibleSecondary] = useState<Set<string>>(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`dt-cols-${storageKey}`);
        if (stored) return new Set(JSON.parse(stored));
      } catch {}
    }
    // removable columns start visible; secondary columns start hidden
    return new Set<string>(columns.filter((c) => c.removable).map((c) => c.key));
  });

  function toggleColumn(key: string) {
    setVisibleSecondary((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (storageKey) {
        try {
          localStorage.setItem(`dt-cols-${storageKey}`, JSON.stringify([...next]));
        } catch {}
      }
      return next;
    });
  }

  /* ── Column order ────────────────────────────────────── */
  const defaultOrder = columns.map((c) => c.key);
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`dt-cols-order-${storageKey}`);
        if (stored) {
          const parsed: string[] = JSON.parse(stored);
          // Merge: keep stored order but add any new columns at the end
          const storedSet = new Set(parsed);
          const merged = [...parsed.filter((k) => defaultOrder.includes(k))];
          for (const k of defaultOrder) {
            if (!storedSet.has(k)) merged.push(k);
          }
          return merged;
        }
      } catch {}
    }
    return defaultOrder;
  });

  function reorderColumns(newOrder: string[]) {
    setColumnOrder(newOrder);
    if (storageKey) {
      try {
        localStorage.setItem(`dt-cols-order-${storageKey}`, JSON.stringify(newOrder));
      } catch {}
    }
  }

  /* ── Expanded rows ───────────────────────────────────── */
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /* ── Visible columns (ordered) ──────────────────────── */
  const visibleColumns = useMemo(
    () =>
      columnOrder
        .map((key) => columns.find((c) => c.key === key))
        .filter((c): c is ColumnDef<T> => !!c && ((!c.secondary && !c.removable) || visibleSecondary.has(c.key))),
    [columns, columnOrder, visibleSecondary]
  );

  /* ── Sort handler ────────────────────────────────────── */
  const handleSort = useCallback(
    (key: string) => {
      const col = columns.find((c) => c.key === key);
      if (!col || col.sortable === false) return;

      let newDir: "asc" | "desc" = "desc";
      if (sortKey === key) newDir = sortDir === "desc" ? "asc" : "desc";
      setSortKey(key);
      setSortDir(newDir);
      onSortChange?.(key, newDir);
    },
    [sortKey, sortDir, columns, onSortChange]
  );

  /* ── Sorted data (client-side only when no onSortChange) */
  const sortedData = useMemo(() => {
    if (onSortChange || !sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return data;

    return [...data].sort((a, b) => {
      let va: number | string = col.getValue ? col.getValue(a) : 0;
      let vb: number | string = col.getValue ? col.getValue(b) : 0;
      if (col.getStringValue) {
        va = col.getStringValue(a) ?? "";
        vb = col.getStringValue(b) ?? "";
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDir, columns, onSortChange]);

  /* ── Footer calculations ─────────────────────────────── */
  const hasFooter = visibleColumns.some((c) => c.footer);
  const footerValues = useMemo(() => {
    const vals: Record<string, number> = {};
    if (!hasFooter) return vals;

    for (const col of visibleColumns) {
      if (!col.footer || !col.getValue) continue;
      const nums = sortedData.map(col.getValue).filter((n) => isFinite(n));
      if (col.footer === "sum") vals[col.key] = nums.reduce((s, n) => s + n, 0);
      else if (col.footer === "avg") vals[col.key] = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
      else if (col.footer === "count") vals[col.key] = nums.length;
    }
    return vals;
  }, [sortedData, visibleColumns, hasFooter]);

  /* ── Pagination (client-side) ────────────────────────── */
  const isServerPaginated = !!onPageChange;
  const clientTotalRows = sortedData.length;
  const clientTotalPages = pageSize ? Math.ceil(clientTotalRows / pageSize) : 1;
  const [clientPage, setClientPage] = useState(1);

  useEffect(() => { setClientPage(1); }, [data]);

  const displayData = useMemo(() => {
    if (isServerPaginated || !pageSize) return sortedData;
    const start = (clientPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, isServerPaginated, pageSize, clientPage]);

  const effectivePage = isServerPaginated ? page : clientPage;
  const effectiveTotalPages = isServerPaginated ? (pageSize ? Math.ceil((totalRows ?? 0) / pageSize) : 1) : clientTotalPages;
  const effectiveTotalRows = isServerPaginated ? (totalRows ?? 0) : clientTotalRows;
  const effectiveOnPageChange = isServerPaginated ? onPageChange! : setClientPage;

  const colSpan = visibleColumns.length + (expandRow ? 1 : 0);

  return (
    <div className="space-y-3">
      {/* Filter + column selector row */}
      {(filterSlot || columns.some((c) => c.secondary || c.removable)) && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            {filterSlot}
          </div>
          <ColSelector
            columns={columns}
            columnOrder={columnOrder}
            visible={visibleSecondary}
            onToggle={toggleColumn}
            onReorder={reorderColumns}
          />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {expandRow && <TableHead className="w-8" />}
                {visibleColumns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={cn(
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.sortable !== false && "cursor-pointer select-none"
                    )}
                    onClick={() => col.sortable !== false && handleSort(col.key)}
                  >
                    <span className="inline-flex items-center">
                      {col.label}
                      {col.sortable !== false && (
                        <SortIcon columnKey={col.key} sortKey={sortKey} sortDir={sortDir} />
                      )}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="h-24 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : displayData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="h-24 text-center text-sm text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                displayData.map((row, i) => {
                  const rowKey = getRowKey(row, i);
                  const isExpanded = expandedKeys.has(rowKey);
                  const expandContent = expandRow ? expandRow(row) : null;
                  const canExpand = !!expandContent;
                  return (
                    <React.Fragment key={rowKey}>
                      <TableRow
                        className={cn(canExpand && "cursor-pointer")}
                        onClick={canExpand ? () => toggleExpand(rowKey) : undefined}
                      >
                        {expandRow && (
                          <TableCell className="w-8 text-muted-foreground">
                            {canExpand && (isExpanded
                              ? <CollapseIcon className="h-4 w-4" />
                              : <ExpandIcon className="h-4 w-4" />)}
                          </TableCell>
                        )}
                        {visibleColumns.map((col) => (
                          <TableCell
                            key={col.key}
                            className={cn(
                              col.align === "right" && "text-right",
                              col.align === "center" && "text-center"
                            )}
                          >
                            {col.render(row)}
                          </TableCell>
                        ))}
                      </TableRow>
                      {canExpand && isExpanded && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={visibleColumns.length} className="pb-3 pt-0">
                            {expandContent}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>

            {hasFooter && displayData.length > 0 && (
              <TableFooter className="sticky bottom-0 bg-muted/80 backdrop-blur-sm">
                <TableRow>
                  {expandRow && <TableCell />}
                  {visibleColumns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        "text-xs font-semibold",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center"
                      )}
                    >
                      {col.footer && col.key in footerValues
                        ? formatFooterValue(footerValues[col.key], col.footer)
                        : col.footer === "count" && col.key in footerValues
                        ? String(footerValues[col.key])
                        : col.footer
                        ? "—"
                        : ""}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            )}
          </Table>

          <Pagination
            page={effectivePage}
            totalPages={effectiveTotalPages}
            totalRows={effectiveTotalRows}
            onPageChange={effectiveOnPageChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
