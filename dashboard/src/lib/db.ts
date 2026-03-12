import { createClient, Client } from "@libsql/client";

let db: Client | null = null;

export function getDb(): Client {
  if (!db) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) {
      throw new Error(
        "TURSO_DATABASE_URL is not set. " +
          "For local dev add TURSO_DATABASE_URL=file:portfolio.db to .env.local. " +
          "For production set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel."
      );
    }
    db = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return db;
}
