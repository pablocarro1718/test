import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();

  // --- CLOSED TRADES (SQL correcto) ---
  //
  // Regla universal y determinista: para calcular el coste medio de lo vendido,
  // solo se usan las compras cuya fecha sea <= la fecha de la última venta del ticker.
  // Esto evita que recompras posteriores al cierre contaminen el P&L de la posición cerrada.
  //
  // Ejemplo: compré MELI en 2020, vendí en 2021 (forzado), recompré en 2023 (aún abierto).
  // → solo las compras de 2020 entran en el cálculo. Las de 2023 se ignoran aquí.

  type ClosedRow = {
    ticker: string;
    qty_bought: number;
    qty_sold: number;
    cost: number;
    proceeds: number;
    firstBuy: string;
    lastSell: string;
  };

  const realizedRows = (await db.execute(`
    WITH last_sell_dates AS (
      SELECT ticker, MAX(date) AS last_sell_date
      FROM operations
      WHERE operation_type = 'SELL'
      GROUP BY ticker
    ),
    sell_stats AS (
      SELECT ticker,
             SUM(quantity)        AS qty_sold,
             SUM(net_amount_eur)  AS proceeds,
             MIN(date)            AS first_sell,
             MAX(date)            AS last_sell
      FROM operations
      WHERE operation_type = 'SELL'
      GROUP BY ticker
    ),
    buy_stats AS (
      SELECT o.ticker,
             SUM(o.quantity)            AS qty_bought,
             SUM(ABS(o.net_amount_eur)) AS cost,
             MIN(o.date)                AS first_buy
      FROM operations o
      JOIN last_sell_dates ls ON o.ticker = ls.ticker
      WHERE o.operation_type = 'BUY'
        AND o.date <= ls.last_sell_date
      GROUP BY o.ticker
    )
    SELECT s.ticker,
           b.qty_bought,
           s.qty_sold,
           b.cost,
           s.proceeds,
           b.first_buy  AS firstBuy,
           s.last_sell  AS lastSell
    FROM sell_stats s
    JOIN buy_stats b ON s.ticker = b.ticker
    WHERE s.qty_sold > 0.001
    ORDER BY s.last_sell DESC
  `)).rows as unknown as ClosedRow[];

  const closedTrades = realizedRows.map((pos) => {
    const costPerUnit = pos.cost / pos.qty_bought;
    const costOfSold  = costPerUnit * pos.qty_sold;
    const pnl         = pos.proceeds - costOfSold;
    const pnlPercent  = costOfSold > 0 ? (pnl / costOfSold) * 100 : 0;
    const isFullyClosed = pos.qty_bought - pos.qty_sold < 0.001;

    const diffDays = Math.floor(
      (new Date(pos.lastSell).getTime() - new Date(pos.firstBuy).getTime()) /
      (1000 * 60 * 60 * 24)
    );
    let holdingPeriod = "";
    if (diffDays < 30)       holdingPeriod = `${diffDays}d`;
    else if (diffDays < 365) holdingPeriod = `${Math.floor(diffDays / 30)}m`;
    else {
      const years  = Math.floor(diffDays / 365);
      const months = Math.floor((diffDays % 365) / 30);
      holdingPeriod = months > 0 ? `${years}y ${months}m` : `${years}y`;
    }

    return {
      ticker: pos.ticker,
      firstBuy: pos.firstBuy,
      lastSell: pos.lastSell,
      costOfSold,
      proceeds: pos.proceeds,
      pnl,
      pnlPercent,
      isFullyClosed,
      holdingPeriod,
      holdingDays: diffDays,
    };
  });

  const totalRealizedPnl = closedTrades.reduce((s, t) => s + t.pnl, 0);
  const totalCostOfSold  = closedTrades.reduce((s, t) => s + t.costOfSold, 0);
  const winners          = closedTrades.filter((t) => t.pnl > 0);
  const winRate          = closedTrades.length > 0
    ? (winners.length / closedTrades.length) * 100 : 0;
  const avgHoldingDays   = closedTrades.length > 0
    ? Math.round(closedTrades.reduce((s, t) => s + t.holdingDays, 0) / closedTrades.length)
    : 0;

  // --- DIVIDENDS BY QUARTER ---
  type DivRow = { year: string; quarter: string; total: number };
  const dividendsByQuarter = (await db.execute(`
    SELECT strftime('%Y', date) as year,
           CASE WHEN CAST(strftime('%m', date) AS INTEGER) BETWEEN 1 AND 3 THEN 'Q1'
                WHEN CAST(strftime('%m', date) AS INTEGER) BETWEEN 4 AND 6 THEN 'Q2'
                WHEN CAST(strftime('%m', date) AS INTEGER) BETWEEN 7 AND 9 THEN 'Q3'
                ELSE 'Q4' END AS quarter,
           SUM(net_amount_eur) AS total
    FROM operations
    WHERE operation_type = 'DIVIDEND'
    GROUP BY year, quarter
    ORDER BY year, quarter
  `)).rows as unknown as DivRow[];

  const totalDividends = dividendsByQuarter.reduce((s, d) => s + d.total, 0);

  return NextResponse.json({
    closedTrades,
    totalRealizedPnl,
    totalCostOfSold,
    winRate,
    winnersCount: winners.length,
    losersCount: closedTrades.length - winners.length,
    avgHoldingDays,
    totalDividends,
    dividendsByQuarter: dividendsByQuarter.map((d) => ({
      label: `${d.quarter} ${d.year}`,
      total: d.total,
    })),
  });
}
