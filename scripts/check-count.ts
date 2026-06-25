import * as fs from "fs";
import * as path from "path";

// Manually load .env.local before importing db
try {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    }
  }
} catch (e) {
  console.error("Failed to parse env file", e);
}

async function run() {
  const { db } = await import("../lib/db");
  const { sql } = await import("drizzle-orm");

  const result = await db.execute(sql`
    select 
      r.id,
      p.name as provider,
      r.status,
      r.started_at,
      r.total_fetched,
      r.total_upserted,
      r.total_errors,
      r.error_summary
    from source_sync_runs r
    join source_providers p on r.provider_id = p.id
    order by r.started_at desc
    limit 10
  `);
  console.log("Recent sync runs:");
  console.log(result);
}

run().catch(console.error);
