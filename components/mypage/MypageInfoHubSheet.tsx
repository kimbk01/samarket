"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProfileRow } from "@/lib/profile/types";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import { SettingsMainContent } from "@/components/my/settings/SettingsMainContent";
import { SettingsSection } from "@/components/my/settings/SettingsSection";
import { SettingsRow } from "@/components/my/settings/SettingsRow";
import { SettingsIcons } from "@/components/my/settings/settings-icons";

type Props = {
  open: boolean;
  onClose: () => void;
  profile: ProfileRow;
  mannerScore: number;
  notificationBadge: string | null;
};

/**
 * 당근·토스·배민형: 내정보 허브를 단일 시트로 모아,
 * 확인(요약)·설정 진입(하위 경로)·계정 관련 동선을 한곳에서 처리합니다.
 */
export function MypageInfoHubSheet({
  open,
  onClose,
  profile,
  mannerScore,
  notificationBadge,
}: Props) {
  const [slideIn, setSlideIn] = useState(false);

  useEffect(() => {
    if (!open) {
      setSlideIn(false);
      return;
    }
    const id = requestAnimationFrame(() => setSlideIn(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const displayName = profile.nickname?.trim() || "닉네임 없음";
  const pointsLabel = `${Math.max(0, Math.floor(Number(profile.points) || 0)).toLocaleString()}P`;
  const notifSubtitle = notificationBadge
    ? `읽지 않음 ${notificationBadge}건 · 채널·방해금지`
    : "알림함 · 푸시·이메일·방해금지";

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="mypage-info-hub-title">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="닫기" />
      <div
        className={`relative flex max-h-[min(92vh,900px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-ig-border bg-[var(--sub-bg)] shadow-2xl transition-transform duration-300 ease-out sm:rounded-2xl ${
          slideIn ? "translate-y-0 sm:scale-100" : "translate-y-full sm:translate-y-0 sm:scale-95"
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--text-muted)]/30 sm:hidden" aria-hidden />

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ig-border px-4 py-3">
          <h2 id="mypage-info-hub-title" className="text-[16px] font-semibold text-foreground">
            내 정보 · 설정
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
            aria-label="닫기"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
          <div className="border-b border-ig-border bg-background px-4 py-4">
            <div className="flex gap-4">
              <Link
                href="/my/edit"
                onClick={onClose}
                className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-full border border-ig-border bg-ig-highlight"
                aria-label="프로필 편집"
              >
                {profile.avatar_url ? (
                  <Image src={profile.avatar_url} alt="" fill className="object-cover" sizes="72px" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[#A8A8A8]">
                    <UserGlyph />
                  </div>
                )}
              </Link>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-[15px] font-semibold text-foreground">{displayName}</p>
                <p className="truncate text-[12px] text-[var(--text-muted)]">{profile.email ?? "—"}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                  <MannerBatteryDisplay raw={mannerScore} size="sm" layout="inline" className="gap-1" />
                  <span className="text-[var(--text-muted)]">·</span>
                  <Link href="/mypage/points" onClick={onClose} className="font-medium text-foreground">
                    {pointsLabel}
                  </Link>
                  {profile.phone_verified ? (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                      연락처 인증
                    </span>
                  ) : (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                      미인증
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
              프로필·알림·앱 옵션·차단·언어를 한곳에서 확인한 뒤, 세부 화면에서 수정할 수 있어요.
            </p>
          </div>

          <div className="px-0 pt-2">
            <SettingsSection title="내 활동 · 알림">
              <SettingsRow href="/mypage/notifications" icon={SettingsIcons.bell} label="알림" subtitle={notifSubtitle} />
              <SettingsRow
                href="/mypage/order-notifications"
                icon={SettingsIcons.megaphone}
                label="주문 알림"
                subtitle="배달·픽업·주문 상태"
              />
              <SettingsRow href="/mypage/points" icon={SettingsIcons.info} label="포인트" subtitle="잔액·충전·내역" />
            </SettingsSection>

            <SettingsSection title="계정 · 프로필">
              <SettingsRow
                href="/mypage/account"
                icon={SettingsIcons.account}
                label="내 정보"
                subtitle="닉네임·연락처·본인 확인"
              />
              <SettingsRow href="/my/edit" icon={SettingsIcons.dots} label="프로필 편집" subtitle="닉네임·사진" />
              <SettingsRow href="/my/addresses" icon={SettingsIcons.target} label="주소 관리" subtitle="생활·배달·거래" />
              <SettingsRow href="/my/logout" icon={SettingsIcons.logout} label="로그아웃" subtitle="이 기기에서 종료" />
            </SettingsSection>

            <div className="border-t border-ig-border pt-2">
              <SettingsMainContent className="mx-0 max-w-none" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function UserGlyph() {
  return (
    <svg className="h-9 w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
