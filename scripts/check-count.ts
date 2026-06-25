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
      status, 
      count(*),
      min(announce_date) as min_date,
      max(announce_date) as max_date
    from announcements 
    group by status
  `);
  console.log("Announcement stats by status:");
  console.log(result);

  const dates = await db.execute(sql`
    select 
      min(announce_date) as min_date, 
      max(announce_date) as max_date,
      count(*) filter (where announce_date >= current_date - interval '3 months') as last_3_months
    from announcements
  `);
  console.log("Date ranges:");
  console.log(dates);
}

run().catch(console.error);
