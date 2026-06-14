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
import { useMobileKeyboardInset } from "@/lib/ui/use-mobile-keyboard-inset";

export function ProfileEditFormShell({ children }: { children: ReactNode }) {
  const keyboardInset = useMobileKeyboardInset();

  return (
    <div
      className={`${PROFILE_EDIT_BODY_CLASS} ${PROFILE_EDIT_HEADER_BODY_OFFSET_CLASS} ${SECTOR_HEADER_CONTENT_TOP_PAD_CLASS} space-y-3`}
      style={{
        paddingBottom: `calc(5.5rem + env(safe-area-inset-bottom, 0px) + ${keyboardInset}px)`,
      }}
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
  className,
}: {
  title?: string;
  children: ReactNode;
  noPadding?: boolean;
  className?: string;
}) {
  return (
    <section className={[PROFILE_EDIT_CARD_CLASS, className].filter(Boolean).join(" ")}>
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
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  first?: boolean;
  /** 입력 필드 id — 없으면 읽기 전용 라벨(`p`) */
  htmlFor?: string;
}) {
  return (
    <div className={first ? "" : PROFILE_EDIT_ROW_DIVIDER_CLASS + " pt-3 mt-3"}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={PROFILE_EDIT_FIELD_LABEL_CLASS}>
          {label}
        </label>
      ) : (
        <p className={PROFILE_EDIT_FIELD_LABEL_CLASS}>{label}</p>
      )}
      <div className="mt-1">{children}</div>
    </div>
  );
}
