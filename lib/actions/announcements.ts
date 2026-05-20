"use server";

import { db } from "@/lib/db";
import { announcements } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function toggleBookmark(id: string, currentState: boolean) {
  try {
    await db.update(announcements)
      .set({ isBookmarked: !currentState, updatedAt: new Date() })
      .where(eq(announcements.id, id));
    
    revalidatePath("/projects");
    return { success: true };
  } catch (error) {
    console.error("Failed to toggle bookmark:", error);
    return { success: false, error: "Failed to update bookmark" };
  }
}
