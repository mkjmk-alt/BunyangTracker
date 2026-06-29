import { exec } from "child_process";
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

export async function POST() {
  console.log("[SyncBrowserBookmarks] Initiating browser bookmarks sync via python script...");

  return new Promise((resolve) => {
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

    exec(`python "${scriptPath}"`, (error, stdout, stderr) => {
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
        const result = JSON.parse(stdout.trim());
        console.log("[SyncBrowserBookmarks] Script result:", result);
        resolve(NextResponse.json(result));
      } catch (e: any) {
        console.error("[SyncBrowserBookmarks] Failed to parse stdout JSON:", stdout);
        console.error("[SyncBrowserBookmarks] Stderr output:", stderr);
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
