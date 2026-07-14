import { NextResponse } from "next/server";
import { ProjectQuerySchema } from "@/lib/validators";
import { deleteAnnouncements, listProjects } from "@/lib/sheets/repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const queryParams = Object.fromEntries(searchParams.entries());
  
  const validated = ProjectQuerySchema.safeParse(queryParams);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { page, pageSize, q } = validated.data;
  const offset = (page - 1) * pageSize;

  const query = q?.toLocaleLowerCase("ko-KR");
  const projects = (await listProjects())
    .filter((project) => !query || project.name.toLocaleLowerCase("ko-KR").includes(query))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(offset, offset + pageSize);

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
    await deleteAnnouncements([id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`Failed to delete announcement ${id}:`, error.message);
    return NextResponse.json({ error: "Failed to delete announcement" }, { status: 500 });
  }
}
