"use server";

import { updateAnnouncement } from "@/lib/sheets/repository";
import { revalidatePath } from "next/cache";

export async function toggleBookmark(id: string, currentState: boolean) {
  try {
    await updateAnnouncement(id, { isBookmarked: !currentState });
    
    revalidatePath("/projects");
    return { success: true };
  } catch (error) {
    console.error("Failed to toggle bookmark:", error);
    return { success: false, error: "Failed to update bookmark" };
  }
}
