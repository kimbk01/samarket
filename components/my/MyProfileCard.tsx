"use client";

import Image from "next/image";
import Link from "next/link";
import type { ProfileRow } from "@/lib/profile/types";
import {
  isProfileLocationComplete,
  resolveProfileLocationAddressOneLine,
} from "@/lib/profile/profile-location";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";

export type AddressDefaultsFlags = {
  life: boolean;
  trade: boolean;
  delivery: boolean;
} | null;

function getMemberTypeLabel(profile: ProfileRow): string {
  if (profile.role === "admin" || profile.role === "master") return "관리자";
  if (profile.is_special_member) return "특별회원";
  return "일반회원";
}

export interface MyProfileCardProps {
  profile: ProfileRow;
  mannerScore: number;
  isBusinessMember?: boolean;
  /** 프로필·인증 상세 */
  accountHref?: string;
  /** 닉네임·사진 등 프로필 편집 */
  editHref?: string;
  /** /api/me/address-defaults 로드 결과 — null 이면 칩 미표시(로딩·오류) */
  addressDefaults?: AddressDefaultsFlags;
}

export function MyProfileCard({
  profile,
  mannerScore,
  isBusinessMember,
  accountHref = "/my/account",
  editHref = "/my/edit",
  addressDefaults,
}: MyProfileCardProps) {
  const memberLabel = getMemberTypeLabel(profile);
  const hasRegion = isProfileLocationComplete(profile);
  const regionDisplay = resolveProfileLocationAddressOneLine(profile).trim() || "미설정";
  const displayName = profile.nickname || "닉네임 없음";
  const pointsLabel = `${Math.max(0, Math.floor(Number(profile.points) || 0)).toLocaleString()}P`;

  const chips: { key: string; label: string; warn: boolean }[] = [];
  if (!hasRegion) chips.push({ key: "region", label: "기본 동네 미설정", warn: true });
  if (addressDefaults) {
    if (!addressDefaults.life) chips.push({ key: "life", label: "생활 주소 미설정", warn: true });
    if (!addressDefaults.trade) chips.push({ key: "trade", label: "거래 주소 미설정", warn: true });
    if (!addressDefaults.delivery) chips.push({ key: "delivery", label: "배달 주소 미설정", warn: true });
  }
  if (!profile.phone_verified) chips.push({ key: "phone", label: "연락처 미인증", warn: true });
  if (!profile.realname_verified) chips.push({ key: "realname", label: "본인인증 필요", warn: true });

  return (
    <div className="rounded-[28px] border border-[#E5E7EB] bg-white p-4 shadow-[0_6px_24px_rgba(15,23,42,0.06)]">
      {/* 1행: 아바타 · 닉네임 · 회원 · 프로필 편집 */}
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="rounded-full bg-[linear-gradient(135deg,#f9ce34,#ee2a7b,#6228d7)] p-[2px]">
          <Link
            href={editHref}
            className="relative block h-[72px] w-[72px] overflow-hidden rounded-full bg-[#EFEFEF] sm:h-[76px] sm:w-[76px]"
            aria-label="프로필 이미지 편집"
          >
            {profile.avatar_url ? (
              <Image src={profile.avatar_url} alt="" fill className="object-cover" sizes="76px" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[#8E8E8E]">
                <UserPlaceholderIcon />
              </div>
            )}
          </Link>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-[17px] font-semibold text-[#262626] sm:text-[18px]">{displayName}</span>
                {isBusinessMember ? (
                  <span className="rounded-full bg-signature/10 px-2 py-0.5 text-[11px] font-medium text-signature">
                    비즈
                  </span>
                ) : null}
                <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-medium text-[#4B5563]">
                  {memberLabel}
                </span>
              </div>
            </div>
            <Link
              href={editHref}
              className="inline-flex shrink-0 items-center rounded-full border border-[#DBDBDB] px-2.5 py-1 text-[11px] font-medium text-[#262626] active:bg-[#FAFAFA] sm:px-3 sm:text-[12px]"
            >
              프로필 편집
            </Link>
          </div>

          {/* 2행: 매너(강조) · 포인트 · 동네 */}
          <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-signature/15 bg-gradient-to-br from-signature/8 via-white to-[#F9FAFB] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <MannerBatteryDisplay raw={mannerScore} size="md" layout="inline" className="gap-2" />
              <div>
                <p className="text-[11px] font-medium text-[#6B7280]">신뢰 온도</p>
                <p className="text-[13px] font-semibold text-[#111827]">거래 매너 지표</p>
              </div>
            </div>
            <div className="flex gap-2 sm:justify-end">
              <StatMini label="포인트" value={pointsLabel} href="/my/points" />
              <StatMini label="기본 동네" value={regionDisplay} warn={!hasRegion} href="/my/addresses" />
            </div>
          </div>

          {/* 3행: 주소 · 충전 · 인증 */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <QuickLink href="/my/addresses" title="주소 관리" subtitle="생활·거래·배달" />
            <QuickLink href="/my/points" title="충전·포인트" subtitle="잔액·내역" />
            <QuickLink href={accountHref} title="인증·보안" subtitle="연락처·계정" />
          </div>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.slice(0, 6).map((c) => (
            <span
              key={c.key}
              className={
                c.warn
                  ? "rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200/80"
                  : "rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-medium text-[#4B5563]"
              }
            >
              {c.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StatMini({
  label,
  value,
  warn,
  href,
}: {
  label: string;
  value: string;
  warn?: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`min-w-0 flex-1 rounded-xl px-2.5 py-2 sm:max-w-[140px] ${
        warn ? "bg-amber-50 ring-1 ring-amber-200/70" : "bg-white/80 ring-1 ring-[#E5E7EB]"
      }`}
    >
      <p className="text-[10px] text-[#8E8E8E]">{label}</p>
      <p className={`mt-0.5 truncate text-[13px] font-semibold ${warn ? "text-amber-950" : "text-[#262626]"}`}>
        {value}
      </p>
    </Link>
  );
}

function QuickLink({ href, title, subtitle }: { href: string; title: string; subtitle: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col rounded-2xl bg-[#F9FAFB] px-2 py-2 text-center active:bg-[#F3F4F6] sm:px-3"
    >
      <span className="text-[12px] font-semibold text-[#262626]">{title}</span>
      <span className="mt-0.5 text-[10px] text-[#8E8E8E]">{subtitle}</span>
    </Link>
  );
}

function UserPlaceholderIcon() {
  return (
    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
