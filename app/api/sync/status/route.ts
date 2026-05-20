import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { announcements } from "@/lib/db/schema";
import { and, like, isNotNull, isNull } from "drizzle-orm";

export async function GET() {
  try {
    // Count total ApplyHome announcements
    const allApplyHome = await db.select().from(announcements).where(
      like(announcements.externalSourceKey, "applyhome%")
    );
    
    const total = allApplyHome.length;
    const completed = allApplyHome.filter(a => a.atchmnflSeqNo && a.atchmnflSn).length;
    
    return NextResponse.json({
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      isFinished: completed === total
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch sync status" }, { status: 500 });
  }
}
