import { NextResponse } from "next/server";
import { hasResolvedAttachmentLookup } from "@/lib/attachments";
import { listAnnouncementRecords, listSyncRuns } from "@/lib/sheets/repository";

const ACTIVE_SYNC_WINDOW_MS = 15 * 60 * 1000;

export async function GET() {
  try {
    const [announcements, syncRuns] = await Promise.all([
      listAnnouncementRecords(),
      listSyncRuns(),
    ]);
    const allApplyHome = announcements.filter((announcement) =>
      announcement.externalSourceKey?.startsWith("applyhome")
    );
    const activeSince = Date.now() - ACTIVE_SYNC_WINDOW_MS;
    const isActive = syncRuns.some(
      (run) => run.status === "running" && run.startedAt.getTime() >= activeSince
    );
    const total = allApplyHome.length;
    const completed = allApplyHome.filter((announcement) =>
      hasResolvedAttachmentLookup(announcement.atchmnflSeqNo, announcement.atchmnflSn)
    ).length;
    
    return NextResponse.json({
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      isActive,
      isFinished: !isActive,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch sync status" }, { status: 500 });
  }
}
