"use client";

import type { ReactNode } from "react";
import {
  PROFILE_EDIT_BODY_CLASS,
  PROFILE_EDIT_CARD_CLASS,
  PROFILE_EDIT_FIELD_LABEL_CLASS,
  PROFILE_EDIT_HEADER_BODY_OFFSET_CLASS,
  PROFILE_EDIT_ROW_DIVIDER_CLASS,
} from "@/lib/ui/profile-edit-starbucks-styles";
import { SECTOR_HEADER_CONTENT_TOP_PAD_CLASS } from "@/lib/ui/sector-header-classes";

export function ProfileEditFormShell({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${PROFILE_EDIT_BODY_CLASS} ${PROFILE_EDIT_HEADER_BODY_OFFSET_CLASS} ${SECTOR_HEADER_CONTENT_TOP_PAD_CLASS} space-y-3 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]`}
    >
      {children}
    </div>
  );
}

/** 프로필 카드 섹션 — 제목만, 설명 없음 */
export function ProfileEditSection({
  title,
  children,
  noPadding = false,
}: {
  title?: string;
  children: ReactNode;
  noPadding?: boolean;
}) {
  return (
    <section className={PROFILE_EDIT_CARD_CLASS}>
      {title?.trim() ? (
        <div className="border-b border-[#D4E9E2]/80 px-4 py-2.5">
          <h2 className={PROFILE_EDIT_FIELD_LABEL_CLASS}>{title}</h2>
        </div>
      ) : null}
      <div className={noPadding ? "" : "px-4 py-4"}>{children}</div>
    </section>
  );
}

/** 카드 안 가로 필드 행 */
export function ProfileEditFieldRow({
  label,
  children,
  first = false,
}: {
  label: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <div className={first ? "" : PROFILE_EDIT_ROW_DIVIDER_CLASS + " pt-3 mt-3"}>
      <label className={PROFILE_EDIT_FIELD_LABEL_CLASS}>{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
