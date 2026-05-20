import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("DATABASE_URL is not defined. Database operations will fail.");
}

const client = postgres(connectionString || "postgres://localhost:5432/dummy", { prepare: false });
export const db = drizzle(client, { schema });
