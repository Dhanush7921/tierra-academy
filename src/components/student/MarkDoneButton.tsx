"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markLessonDoneAction } from "@/app/actions/student";
import { buttonClass } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";

export function MarkDoneButton({ lessonId }: { lessonId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" disabled={pending} className={buttonClass("outline", "sm")} onClick={() => start(async () => { await markLessonDoneAction(lessonId); router.refresh(); })}>
      <Icon name="check" size={14} />{pending ? "Saving…" : "Mark as complete"}
    </button>
  );
}
