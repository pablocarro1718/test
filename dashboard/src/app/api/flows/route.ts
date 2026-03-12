import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type TotalsRow = { flow_type: string; total: number };
type MonthlyRow = { month: string; flow_type: string; broker: string; total_eur: number };
type DetailRow = { date: string; broker: string; flow_type: string; amount_eur: number; currency: string };

export async function GET() {
  const db = getDb();

  // --- ALL-TIME TOTALS ---
  const totals = (await db.execute(`
    SELECT flow_type, SUM(ABS(amount_eur)) as total
    FROM cash_flows
    GROUP BY flow_type
  `)).rows as unknown as TotalsRow[];

  const totalDeposited = totals.find((r) => r.flow_type === "deposit")?.total || 0;
  const totalWithdrawn = totals.find((r) => r.flow_type === "withdrawal")?.total || 0;

  // --- MONTHLY BY FLOW TYPE AND BROKER ---
  const monthly = (await db.execute(`
    SELECT strftime('%Y-%m', date) as month,
           flow_type,
           broker,
           SUM(ABS(amount_eur)) as total_eur
    FROM cash_flows
    GROUP BY month, flow_type, broker
    ORDER BY month
  `)).rows as unknown as MonthlyRow[];

  // Pivot into { month, deposits, withdrawals } for easy charting
  const monthMap: Record<string, { month: string; deposits: number; withdrawals: number }> = {};
  for (const row of monthly) {
    if (!monthMap[row.month]) {
      monthMap[row.month] = { month: row.month, deposits: 0, withdrawals: 0 };
    }
    if (row.flow_type === "deposit") {
      monthMap[row.month].deposits += row.total_eur;
    } else {
      monthMap[row.month].withdrawals += row.total_eur;
    }
  }

  const monthlyFlow = Object.values(monthMap).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  // Compute cumulative net deployed
  let cumNet = 0;
  const monthlyWithCumulative = monthlyFlow.map((m) => {
    cumNet += m.deposits - m.withdrawals;
    return { ...m, cumNet };
  });

  // --- DETAIL LIST ---
  const detail = (await db.execute(`
    SELECT date, broker, flow_type, amount_eur, currency
    FROM cash_flows
    ORDER BY date DESC
  `)).rows as unknown as DetailRow[];

  return NextResponse.json({
    totalDeposited,
    totalWithdrawn,
    netDeployed: totalDeposited - totalWithdrawn,
    monthlyFlow: monthlyWithCumulative,
    detail,
  });
}
