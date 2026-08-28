import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { getEnv } from "../config/env";
import * as schema from "./schema";

function createDb() {
  return drizzle(neon(getEnv().DATABASE_URL), { schema });
}

export type Database = ReturnType<typeof createDb>;

let _db: Database | null = null;

/** Memoizado: o cliente HTTP do Neon é barato, mas não precisa ser recriado por requisição. */
export function getDb(): Database {
  if (!_db) _db = createDb();
  return _db;
}
