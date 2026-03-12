import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();

  // --- XIRR FLOWS ---
  type CfRow = { date: string; flow_type: string; amount_eur: number };
  const xirrFlows = ((await db.execute(
    `SELECT date, flow_type, amount_eur FROM cash_flows ORDER BY date`
  )).rows as unknown as CfRow[]).map((cf) => ({
    date: cf.date,
    amount: cf.flow_type === "deposit" ? -cf.amount_eur : cf.amount_eur,
  }));

  // --- MONTHLY CUMULATIVE FLOW ---
  type MonthlyRow = { month: string; invested: number; sold: number; dividends: number };
  const monthlyFlow = (await db.execute(`
    SELECT strftime('%Y-%m', date) as month,
           SUM(CASE WHEN operation_type = 'BUY' THEN ABS(net_amount_eur) ELSE 0 END) as invested,
           SUM(CASE WHEN operation_type = 'SELL' THEN net_amount_eur ELSE 0 END) as sold,
           SUM(CASE WHEN operation_type = 'DIVIDEND' THEN net_amount_eur ELSE 0 END) as dividends
    FROM operations
    GROUP BY month
    ORDER BY month
  `)).rows as unknown as MonthlyRow[];

  let cumInvested = 0, cumSold = 0, cumDividends = 0;
  const cumulativeData = monthlyFlow.map((m) => {
    cumInvested += m.invested;
    cumSold += m.sold;
    cumDividends += m.dividends;
    return { month: m.month, invested: m.invested, sold: m.sold, dividends: m.dividends,
             cumInvested, cumSold, cumDividends, cumNet: cumInvested - cumSold };
  });

  // --- CLOSED TRADES ---
  type ClosedRow = { ticker: string; qty_bought: number; qty_sold: number; cost: number; proceeds: number; firstBuy: string; lastSell: string };
  const realizedByTicker = (await db.execute(`
    SELECT ticker,
           SUM(CASE WHEN operation_type = 'BUY' THEN quantity ELSE 0 END) as qty_bought,
           SUM(CASE WHEN operation_type = 'SELL' THEN quantity ELSE 0 END) as qty_sold,
           SUM(CASE WHEN operation_type = 'BUY' THEN ABS(net_amount_eur) ELSE 0 END) as cost,
           SUM(CASE WHEN operation_type = 'SELL' THEN net_amount_eur ELSE 0 END) as proceeds,
           MIN(CASE WHEN operation_type = 'BUY' THEN date END) as firstBuy,
           MAX(CASE WHEN operation_type = 'SELL' THEN date END) as lastSell
    FROM operations
    WHERE operation_type IN ('BUY', 'SELL')
    GROUP BY ticker
    HAVING qty_sold > 0.001
  `)).rows as unknown as ClosedRow[];

  const closedTrades = realizedByTicker.map((pos) => {
    const costPerUnit = pos.cost / pos.qty_bought;
    const costOfSold = costPerUnit * pos.qty_sold;
    const pnl = pos.proceeds - costOfSold;
    const pnlPercent = costOfSold > 0 ? (pnl / costOfSold) * 100 : 0;
    const isFullyClosed = pos.qty_bought - pos.qty_sold < 0.001;
    const diffDays = Math.floor((new Date(pos.lastSell).getTime() - new Date(pos.firstBuy).getTime()) / (1000 * 60 * 60 * 24));
    let holdingPeriod = "";
    if (diffDays < 30) holdingPeriod = `${diffDays}d`;
    else if (diffDays < 365) holdingPeriod = `${Math.floor(diffDays / 30)}m`;
    else {
      const years = Math.floor(diffDays / 365);
      const months = Math.floor((diffDays % 365) / 30);
      holdingPeriod = months > 0 ? `${years}y ${months}m` : `${years}y`;
    }
    return { ticker: pos.ticker, firstBuy: pos.firstBuy, lastSell: pos.lastSell,
             costOfSold, proceeds: pos.proceeds, pnl, pnlPercent, isFullyClosed, holdingPeriod };
  });

  const totalRealizedPnl = closedTrades.reduce((s, t) => s + t.pnl, 0);
  const winners = closedTrades.filter((t) => t.pnl > 0);
  const winRate = closedTrades.length > 0 ? (winners.length / closedTrades.length) * 100 : 0;

  // --- HEATMAP DATA ---
  type HeatRow = { year: number; month: number; netFlow: number };
  const heatmapData = (await db.execute(`
    SELECT
      CAST(strftime('%Y', date) as INTEGER) as year,
      CAST(strftime('%m', date) as INTEGER) as month,
      SUM(CASE WHEN operation_type = 'SELL' THEN net_amount_eur ELSE 0 END) -
      SUM(CASE WHEN operation_type = 'BUY' THEN ABS(net_amount_eur) ELSE 0 END) +
      SUM(CASE WHEN operation_type = 'DIVIDEND' THEN net_amount_eur ELSE 0 END) as netFlow
    FROM operations
    GROUP BY year, month
    ORDER BY year, month
  `)).rows as unknown as HeatRow[];

  // --- DIVIDENDS BY QUARTER ---
  type DivRow = { year: string; quarter: string; total: number };
  const dividendsByQuarter = (await db.execute(`
    SELECT strftime('%Y', date) as year,
           CASE WHEN CAST(strftime('%m', date) as INTEGER) BETWEEN 1 AND 3 THEN 'Q1'
                WHEN CAST(strftime('%m', date) as INTEGER) BETWEEN 4 AND 6 THEN 'Q2'
                WHEN CAST(strftime('%m', date) as INTEGER) BETWEEN 7 AND 9 THEN 'Q3'
                ELSE 'Q4' END as quarter,
           SUM(net_amount_eur) as total
    FROM operations
    WHERE operation_type = 'DIVIDEND'
    GROUP BY year, quarter
    ORDER BY year, quarter
  `)).rows as unknown as DivRow[];

  const totalDividends = dividendsByQuarter.reduce((s, d) => s + d.total, 0);

  return NextResponse.json({
    xirrFlows,
    monthlyFlow: cumulativeData,
    closedTrades: closedTrades.sort((a, b) => new Date(b.lastSell).getTime() - new Date(a.lastSell).getTime()),
    totalRealizedPnl,
    winRate,
    winnersCount: winners.length,
    losersCount: closedTrades.length - winners.length,
    totalDividends,
    heatmapData,
    dividendsByQuarter: dividendsByQuarter.map((d) => ({ label: `${d.quarter} ${d.year}`, total: d.total })),
  });
}
