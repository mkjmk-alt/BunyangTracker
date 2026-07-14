import { exec } from "child_process";
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { listAnnouncementRecords, upsertAnnouncements } from "@/lib/sheets/repository";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  console.log("[SyncBrowserBookmarks] Initiating browser bookmarks sync via python script...");

  return new Promise<Response>((resolve) => {
    const scriptPath = path.join(process.cwd(), "scripts", "restore-bookmarks.py");
    
    if (!fs.existsSync(scriptPath)) {
      console.error(`[SyncBrowserBookmarks] Script not found at: ${scriptPath}`);
      resolve(
        NextResponse.json(
          { success: false, error: "Bookmarks sync script not found." },
          { status: 500 }
        )
      );
      return;
    }

    exec(`python "${scriptPath}"`, async (error, stdout, stderr) => {
      if (error) {
        console.error("[SyncBrowserBookmarks] Execution error:", error.message);
        console.error("[SyncBrowserBookmarks] Stderr:", stderr);
        resolve(
          NextResponse.json(
            { success: false, error: error.message, details: stderr },
            { status: 500 }
          )
        );
        return;
      }

      try {
        const result = JSON.parse(stdout.trim()) as { success?: boolean; slugs?: unknown; scannedProfiles?: unknown };
        const slugs = Array.isArray(result.slugs)
          ? result.slugs.filter((slug): slug is string => typeof slug === "string")
          : [];
        const slugSet = new Set(slugs);
        const announcements = await listAnnouncementRecords();
        const updates = announcements
          .filter((announcement) => slugSet.has(announcement.projectSlug) && !announcement.isBookmarked)
          .map((announcement) => ({ ...announcement, isBookmarked: true, updatedAt: new Date() }));
        await upsertAnnouncements(updates);
        console.log("[SyncBrowserBookmarks] Script result:", result);
        resolve(NextResponse.json({
          success: result.success !== false,
          restoredCount: updates.length,
          scannedProfiles: result.scannedProfiles,
        }));
      } catch (error: unknown) {
        console.error("[SyncBrowserBookmarks] Failed to parse stdout JSON:", stdout);
        console.error("[SyncBrowserBookmarks] Stderr output:", stderr);
        console.error(error);
        resolve(
          NextResponse.json(
            {
              success: false,
              error: "Failed to parse script output.",
              rawOutput: stdout,
              details: stderr,
            },
            { status: 500 }
          )
        );
      }
    });
  });
}
