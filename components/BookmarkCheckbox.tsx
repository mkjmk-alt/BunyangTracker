"use client";

import { useTransition } from "react";
import { toggleBookmark } from "@/lib/actions/announcements";
import { cn } from "@/lib/utils";

interface BookmarkCheckboxProps {
  id: string;
  initialChecked: boolean;
}

export function BookmarkCheckbox({ id, initialChecked }: BookmarkCheckboxProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => {
        startTransition(async () => {
          await toggleBookmark(id, initialChecked);
        });
      }}
      disabled={isPending}
      className={cn(
        "p-2 rounded-md transition-all hover:bg-accent",
        initialChecked ? "text-yellow-500" : "text-muted-foreground/30 hover:text-yellow-500",
        isPending && "opacity-50 cursor-wait"
      )}
      title={initialChecked ? "즐겨찾기 해제" : "즐겨찾기 추가"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={initialChecked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  );
}
