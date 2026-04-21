"use client";

import Link from "next/link";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

type Props = {
  me: CommunityMessengerProfileLite | null;
};

/**
 * 친구 탭 상단 — 닉네임 / @아이디 / 나의 상태(bio) · 편집은 마이페이지 프로필 수정과 동일 데이터
 */
export function MessengerFriendsMyProfileStrip({ me }: Props) {
  const initial = (me?.label ?? "나").trim().slice(0, 1) || "?";
  const handleLine = me?.subtitle?.trim() || "";
  const fallbackId =
    me?.id && !handleLine ? `ID · ${me.id.slice(0, 8)}…` : "";
  const secondLine = handleLine || fallbackId;
  const bioLine = me?.bio?.trim() ?? "";

  return (
    <div className="flex items-center gap-2.5 border-b border-[color:var(--messenger-divider)] bg-[color:var(--messenger-bg)] px-1 py-2">
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[color:var(--messenger-primary-soft)] ring-1 ring-[color:var(--messenger-primary-soft-2)]">
        {me?.avatarUrl?.trim() ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl.trim()} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center sam-text-body-secondary font-semibold"
            style={{ color: "var(--messenger-text-secondary)" }}
          >
            {initial}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate sam-text-body font-semibold" style={{ color: "var(--messenger-text)" }}>
          {me?.label ?? "내 프로필"}
        </p>
        {secondLine ? (
          <p className="truncate sam-text-helper leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
            {secondLine}
          </p>
        ) : null}
        {bioLine ? (
          <p className="mt-0.5 line-clamp-2 sam-text-helper leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
            {bioLine}
          </p>
        ) : null}
      </div>
      <Link
        href={MYPAGE_PROFILE_EDIT_HREF}
        className="shrink-0 rounded-[var(--messenger-radius-sm)] px-2 py-1.5 sam-text-body-secondary font-semibold text-[color:var(--messenger-primary)] active:opacity-80"
      >
        내 프로필 ›
      </Link>
    </div>
  );
}
