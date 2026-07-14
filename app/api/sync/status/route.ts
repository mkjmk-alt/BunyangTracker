import { NextResponse } from "next/server";
import { listAnnouncementRecords } from "@/lib/sheets/repository";

export async function GET() {
  try {
    // Count total ApplyHome announcements
    const allApplyHome = (await listAnnouncementRecords()).filter((announcement) =>
      announcement.externalSourceKey?.startsWith("applyhome")
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
