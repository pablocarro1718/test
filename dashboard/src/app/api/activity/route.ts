import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const broker = searchParams.get("broker");
  const ticker = searchParams.get("ticker");
  const limit = parseInt(searchParams.get("limit") || "25");
  const page = parseInt(searchParams.get("page") || "1");
  const offset = (page - 1) * limit;

  // Sort — whitelist to prevent injection
  const ALLOWED_SORT = ["date","broker","type","ticker","quantity","amount_eur","commission_eur","net_amount_eur"];
  const sortByRaw = searchParams.get("sortBy") ?? "date";
  const sortBy = ALLOWED_SORT.includes(sortByRaw) ? sortByRaw : "date";
  const sortDir = searchParams.get("sortDir") === "asc" ? "ASC" : "DESC";

  const db = getDb();

  // Build WHERE clauses
  const opConditions: string[] = [];
  const opArgs: string[] = [];
  if (type && ["BUY", "SELL", "DIVIDEND"].includes(type)) {
    opConditions.push("operation_type = ?");
    opArgs.push(type);
  }
  if (broker) { opConditions.push("broker = ?"); opArgs.push(broker); }
  if (ticker) { opConditions.push("ticker LIKE ?"); opArgs.push(`%${ticker}%`); }
  const opWhere = opConditions.length > 0 ? opConditions.join(" AND ") : "1=1";

  const cfConditions: string[] = [];
  const cfArgs: string[] = [];
  if (type && ["DEPOSIT", "WITHDRAWAL"].includes(type)) {
    cfConditions.push("UPPER(flow_type) = ?");
    cfArgs.push(type);
  }
  if (broker) { cfConditions.push("broker = ?"); cfArgs.push(broker); }
  const cfWhere = cfConditions.length > 0 ? cfConditions.join(" AND ") : "1=1";

  const isTradeType = type && ["BUY", "SELL", "DIVIDEND"].includes(type);
  const isCashType = type && ["DEPOSIT", "WITHDRAWAL"].includes(type);
  const hasTicker = !!ticker;
  const includeCashFlows = !hasTicker && !isTradeType;
  const includeOperations = !isCashType;

  // Grouped operations SELECT — aggregates partial fills per (date, broker, type, ticker)
  const groupedOpSelect = `
    SELECT
      date, broker, operation_type as type, ticker,
      SUM(quantity) as quantity,
      SUM(amount_eur) as amount_eur,
      SUM(commission_eur) as commission_eur,
      SUM(net_amount_eur) as net_amount_eur,
      currency_original,
      SUM(price_original * quantity) / NULLIF(SUM(quantity), 0) as price_original,
      AVG(COALESCE(fx_rate, 1.0)) as fx_rate,
      COUNT(*) as fill_count,
      json_group_array(json_object(
        'quantity', quantity,
        'amount_eur', amount_eur,
        'commission_eur', commission_eur,
        'net_amount_eur', net_amount_eur,
        'price_original', price_original,
        'fx_rate', COALESCE(fx_rate, 1.0)
      )) as fills_json
    FROM operations WHERE ${opWhere}
    GROUP BY date, broker, operation_type, ticker`;

  const cashSelect = `
    SELECT
      date, broker, UPPER(flow_type) as type, '' as ticker,
      0 as quantity, amount_eur, 0 as commission_eur, amount_eur as net_amount_eur,
      currency as currency_original, amount as price_original,
      COALESCE(fx_rate, 1.0) as fx_rate,
      1 as fill_count, '[]' as fills_json
    FROM cash_flows WHERE ${cfWhere}`;

  let countSql: string;
  let dataSql: string;
  let countArgs: string[];
  let dataArgs: Array<string | number>;

  if (includeOperations && includeCashFlows) {
    countSql = `SELECT COUNT(*) as total FROM (
      SELECT date FROM operations WHERE ${opWhere} GROUP BY date, broker, operation_type, ticker
      UNION ALL
      SELECT date FROM cash_flows WHERE ${cfWhere}
    )`;
    countArgs = [...opArgs, ...cfArgs];
    dataSql = `SELECT * FROM (
      ${groupedOpSelect}
      UNION ALL
      ${cashSelect}
    ) ORDER BY ${sortBy} ${sortDir} LIMIT ? OFFSET ?`;
    dataArgs = [...opArgs, ...cfArgs, limit, offset];
  } else if (includeOperations) {
    countSql = `SELECT COUNT(*) as total FROM (
      SELECT date FROM operations WHERE ${opWhere} GROUP BY date, broker, operation_type, ticker
    )`;
    countArgs = opArgs;
    dataSql = `SELECT * FROM (${groupedOpSelect}) ORDER BY ${sortBy} ${sortDir} LIMIT ? OFFSET ?`;
    dataArgs = [...opArgs, limit, offset];
  } else {
    countSql = `SELECT COUNT(*) as total FROM cash_flows WHERE ${cfWhere}`;
    countArgs = cfArgs;
    dataSql = `SELECT * FROM (${cashSelect}) ORDER BY ${sortBy} ${sortDir} LIMIT ? OFFSET ?`;
    dataArgs = [...cfArgs, limit, offset];
  }

  const countResult = await db.execute({ sql: countSql, args: countArgs });
  const { total } = countResult.rows[0] as unknown as { total: number };

  const dataResult = await db.execute({ sql: dataSql, args: dataArgs });

  // Parse fills_json string → array for each row
  type RawRow = Record<string, unknown>;
  const activity = (dataResult.rows as unknown as RawRow[]).map((row) => ({
    ...row,
    fill_count: (row.fill_count as number) ?? 1,
    fills: JSON.parse((row.fills_json as string) ?? "[]"),
    fills_json: undefined,
  }));

  const brokersResult = await db.execute(
    `SELECT DISTINCT broker FROM operations ORDER BY broker`
  );
  type BrokerRow = { broker: string };
  const brokers = (brokersResult.rows as unknown as BrokerRow[]).map((b) => b.broker);

  return NextResponse.json({
    activity,
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    brokers,
  });
}
