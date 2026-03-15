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

  let countSql: string;
  let dataSql: string;
  let countArgs: string[];
  let dataArgs: Array<string | number>;

  if (includeOperations && includeCashFlows) {
    countSql = `SELECT COUNT(*) as total FROM (
      SELECT 1 FROM operations WHERE ${opWhere}
      UNION ALL
      SELECT 1 FROM cash_flows WHERE ${cfWhere}
    )`;
    countArgs = [...opArgs, ...cfArgs];
    dataSql = `SELECT * FROM (
      SELECT date, broker, operation_type as type, ticker, quantity,
             amount_eur, commission_eur, net_amount_eur,
             currency_original, price_original, fx_rate
      FROM operations WHERE ${opWhere}
      UNION ALL
      SELECT date, broker, UPPER(flow_type) as type, '' as ticker, 0 as quantity,
             amount_eur, 0 as commission_eur, amount_eur as net_amount_eur,
             currency as currency_original, amount as price_original,
             COALESCE(fx_rate, 1.0) as fx_rate
      FROM cash_flows WHERE ${cfWhere}
    ) ORDER BY ${sortBy} ${sortDir} LIMIT ? OFFSET ?`;
    dataArgs = [...opArgs, ...cfArgs, limit, offset];
  } else if (includeOperations) {
    countSql = `SELECT COUNT(*) as total FROM operations WHERE ${opWhere}`;
    countArgs = opArgs;
    dataSql = `SELECT date, broker, operation_type as type, ticker, quantity,
                      amount_eur, commission_eur, net_amount_eur,
                      currency_original, price_original, fx_rate
               FROM operations WHERE ${opWhere}
               ORDER BY ${sortBy} ${sortDir} LIMIT ? OFFSET ?`;
    dataArgs = [...opArgs, limit, offset];
  } else {
    countSql = `SELECT COUNT(*) as total FROM cash_flows WHERE ${cfWhere}`;
    countArgs = cfArgs;
    dataSql = `SELECT date, broker, UPPER(flow_type) as type, '' as ticker, 0 as quantity,
                      amount_eur, 0 as commission_eur, amount_eur as net_amount_eur,
                      currency as currency_original, amount as price_original,
                      COALESCE(fx_rate, 1.0) as fx_rate
               FROM cash_flows WHERE ${cfWhere}
               ORDER BY ${sortBy} ${sortDir} LIMIT ? OFFSET ?`;
    dataArgs = [...cfArgs, limit, offset];
  }

  const countResult = await db.execute({ sql: countSql, args: countArgs });
  const { total } = countResult.rows[0] as unknown as { total: number };

  const dataResult = await db.execute({ sql: dataSql, args: dataArgs });
  const activity = dataResult.rows;

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
