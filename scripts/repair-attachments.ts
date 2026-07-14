import dotenv from "dotenv";
import path from "path";

// Load env variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  console.log("Starting attachment repair script...");

  const { listAnnouncementRecords, upsertAnnouncements } = await import("../lib/sheets/repository");
  const { ApplyHomeApiProvider } = await import("../lib/sources/applyhome-api");


  // Query all announcements from ApplyHome that have no attachment metadata (null)
  const pendingAnnouncements = (await listAnnouncementRecords()).filter(
    (announcement) => announcement.externalSourceKey?.startsWith("applyhome") && !announcement.atchmnflSeqNo
  );

  console.log(`Found ${pendingAnnouncements.length} announcements requiring attachment discovery.`);

  if (pendingAnnouncements.length === 0) {
    console.log("No repair needed! All announcements have attachment keys.");
    process.exit(0);
  }

  const provider = new ApplyHomeApiProvider();
  const updates = [];

  for (const ann of pendingAnnouncements) {
    console.log(`Processing [${ann.projectName}] (MgmtNo: ${ann.housingMgmtNo}, AnnNo: ${ann.announceNo})...`);
    
    try {
      const attachments = await provider.discoverAttachments(
        ann.housingMgmtNo,
        ann.announceNo,
        ann.pblancUrl || undefined,
        ann.supplyType
      );

      console.log(`Discovery result: seqNo = ${attachments.seqNo}, sn = ${attachments.sn}`);

      // If we got a valid result (either actual keys or "NONE")
      if (attachments.seqNo && attachments.sn) {
        updates.push({ ...ann, atchmnflSeqNo: attachments.seqNo, atchmnflSn: attachments.sn, updatedAt: new Date() });
        
        console.log(` Successfully updated announcement ${ann.announceNo}`);
      } else {
        // Fallback: If it silently failed/timed out, we can force-set to "NONE"
        // to prevent getting stuck in future sync checks.
        updates.push({ ...ann, atchmnflSeqNo: "NONE", atchmnflSn: "NONE", updatedAt: new Date() });
        
        console.log(` Force-updated announcement ${ann.announceNo} to NONE due to discovery failure.`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error discovering attachments for ${ann.announceNo}:`, message);
      
      // Fallback: Force-set to "NONE" on exception as well to avoid being stuck forever
      updates.push({ ...ann, atchmnflSeqNo: "NONE", atchmnflSn: "NONE", updatedAt: new Date() });
      
      console.log(` Force-updated announcement ${ann.announceNo} to NONE due to error.`);
    }

    // Add a tiny delay between requests to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  await upsertAnnouncements(updates);

  console.log("Repair finished successfully!");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error during repair:", error);
  process.exit(1);
});
