"use client";

import type { ReactNode } from "react";
import {
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_SECTION_HEADER_CLASS,
  MYPAGE_HOME_SECTION_LABEL_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

/**
 * Flow group surface — continuous list rhythm (not a feature-catalog card unit).
 * `title` optional; omit for untitled groups (e.g. danger).
 */
export function MyInfoMenuSection({
  title,
  children,
  surface = "group",
}: {
  title?: string;
  children: ReactNode;
  /** group = light continuous surface; card kept for rare emphasis */
  surface?: "group" | "card";
}) {
  const shell =
    surface === "card"
      ? MYPAGE_HOME_CARD_CLASS
      : `${MYPAGE_HOME_CARD_CLASS} shadow-none`;

  return (
    <section className={`${shell} w-full self-start`} data-mypage-flow-surface={surface}>
      {title ? (
        <div className={MYPAGE_HOME_SECTION_HEADER_CLASS}>
          <h2 className={MYPAGE_HOME_SECTION_LABEL_CLASS}>{title}</h2>
        </div>
      ) : null}
      <div className="min-h-0">{children}</div>
    </section>
  );
}
