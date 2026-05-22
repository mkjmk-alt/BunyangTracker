import dotenv from "dotenv";
import path from "path";

// Load env variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  console.log("Starting attachment repair script...");

  // Dynamically import DB client and schema after loading env variables
  const { db } = await import("../lib/db");
  const { announcements, housingProjects } = await import("../lib/db/schema");
  const { like, isNull, and, eq } = await import("drizzle-orm");
  const { ApplyHomeApiProvider } = await import("../lib/sources/applyhome-api");


  // Query all announcements from ApplyHome that have no attachment metadata (null)
  const pendingAnnouncements = await db
    .select({
      id: announcements.id,
      announceNo: announcements.announceNo,
      pblancUrl: announcements.pblancUrl,
      supplyType: announcements.supplyType,
      housingMgmtNo: housingProjects.housingMgmtNo,
      projectName: housingProjects.name,
    })
    .from(announcements)
    .innerJoin(housingProjects, eq(announcements.projectId, housingProjects.id))
    .where(
      and(
        like(announcements.externalSourceKey, "applyhome%"),
        isNull(announcements.atchmnflSeqNo)
      )
    );

  console.log(`Found ${pendingAnnouncements.length} announcements requiring attachment discovery.`);

  if (pendingAnnouncements.length === 0) {
    console.log("No repair needed! All announcements have attachment keys.");
    process.exit(0);
  }

  const provider = new ApplyHomeApiProvider();

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
        await db
          .update(announcements)
          .set({
            atchmnflSeqNo: attachments.seqNo,
            atchmnflSn: attachments.sn,
            updatedAt: new Date(),
          })
          .where(eq(announcements.id, ann.id));
        
        console.log(` Successfully updated announcement ${ann.announceNo}`);
      } else {
        // Fallback: If it silently failed/timed out, we can force-set to "NONE"
        // to prevent getting stuck in future sync checks.
        await db
          .update(announcements)
          .set({
            atchmnflSeqNo: "NONE",
            atchmnflSn: "NONE",
            updatedAt: new Date(),
          })
          .where(eq(announcements.id, ann.id));
        
        console.log(` Force-updated announcement ${ann.announceNo} to NONE due to discovery failure.`);
      }
    } catch (error: any) {
      console.error(`❌ Error discovering attachments for ${ann.announceNo}:`, error.message);
      
      // Fallback: Force-set to "NONE" on exception as well to avoid being stuck forever
      await db
        .update(announcements)
        .set({
          atchmnflSeqNo: "NONE",
          atchmnflSn: "NONE",
          updatedAt: new Date(),
        })
        .where(eq(announcements.id, ann.id));
      
      console.log(` Force-updated announcement ${ann.announceNo} to NONE due to error.`);
    }

    // Add a tiny delay between requests to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  console.log("Repair finished successfully!");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error during repair:", error);
  process.exit(1);
});
