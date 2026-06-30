import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { housingProjects } from "@/lib/db/schema";
import { ProjectQuerySchema } from "@/lib/validators";
import { desc, eq, like, and } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const queryParams = Object.fromEntries(searchParams.entries());
  
  const validated = ProjectQuerySchema.safeParse(queryParams);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { page, pageSize, q, status } = validated.data;
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (q) conditions.push(like(housingProjects.name, `%${q}%`));
  // status 필터는 announcements와 조인이 필요하므로 여기서는 단순 예시
  
  const projects = await db.query.housingProjects.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    limit: pageSize,
    offset: offset,
    orderBy: [desc(housingProjects.createdAt)],
  });

  return NextResponse.json({
    projects,
    page,
    pageSize,
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id parameter is required" }, { status: 400 });
  }

  try {
    const { announcements, announcementSnapshots, announcementUnits } = await import("@/lib/db/schema");
    // Delete snapshots first
    await db.delete(announcementSnapshots).where(eq(announcementSnapshots.announcementId, id));
    // Delete units
    await db.delete(announcementUnits).where(eq(announcementUnits.announcementId, id));
    // Delete announcement
    await db.delete(announcements).where(eq(announcements.id, id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`Failed to delete announcement ${id}:`, error.message);
    return NextResponse.json({ error: "Failed to delete announcement" }, { status: 500 });
  }
}
