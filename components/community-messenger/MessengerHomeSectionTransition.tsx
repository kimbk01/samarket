"use client";

import type { ReactNode } from "react";
import type { MessengerMainSection } from "@/lib/community-messenger/messenger-ia";

function sectionEnterClass(section: MessengerMainSection): string {
  if (section === "friends") return "cm-messenger-section-enter-friends";
  if (section === "open_chat") return "cm-messenger-section-enter-open-chat";
  return "";
}

type Props = {
  section: MessengerMainSection;
  children: ReactNode;
};

/** 2단 탭 본문 — 친구: 좌→우 / 그룹방: 하→상 360ms (CSS). */
export function MessengerHomeSectionTransition({ section, children }: Props) {
  const motionClass = sectionEnterClass(section);
  return (
    <div key={section} className={motionClass || undefined}>
      {children}
    </div>
  );
}
