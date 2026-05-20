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
