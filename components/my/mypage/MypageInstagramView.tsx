"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ProfileRow } from "@/lib/profile/types";
import {
  isProfileLocationComplete,
  resolveProfileLocationAddressLines,
} from "@/lib/profile/profile-location";
import type { AddressDefaultsFlags } from "@/components/my/MyProfileCard";
import type { LifeDefaultLocationSummary } from "@/lib/addresses/life-default-location-summary";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";
import { serviceDescription } from "@/components/my/mypage/MypageDashboardPrimitives";
import type { MyServiceRow } from "@/lib/my/types";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { StoreBusinessBlockedModal } from "@/components/business/StoreBusinessBlockedModal";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";

export type MypageIgTabId = "trade" | "orders" | "board" | "store" | "account";

const TAB_STORAGE_KEY = "samarket:mypage:ig-tab";

type OverviewCounts = {
  purchases: number | null;
  sales: number | null;
  storeAttention: number | null;
};

export type MypageInstagramViewProps = {
  profile: ProfileRow;
  mannerScore: number;
  isBusinessMember: boolean;
  hasOwnerStore: boolean;
  /** 있으면 매장 운영 링크에 `storeId` 반영 (내정보에서 매장 목록과 동일 우선순위) */
  ownerHubStoreId?: string | null;
  /** 오너 매장 게이트(심사 중 등) — 승인 전이면 매장 허브 진입은 모달 */
  ownerStoreGate?: OwnerStoreGateState | null;
  ownerStoreGateFirstId?: string | null;
  isAdmin: boolean;
  addressDefaults: AddressDefaultsFlags;
  /** 주소록 기본 생활지 기준 동네 요약 — 프로필과 불일치 시에도 표시·완료 판정에 사용 */
  neighborhoodFromLife: LifeDefaultLocationSummary | null;
  overviewCounts: OverviewCounts;
  favoriteBadge: string | null;
  notificationBadge: string | null;
  storeAttentionSummary: string | null;
  services: MyServiceRow[];
};

type MenuRow = {
  href: string;
  title: string;
  subtitle?: string;
  badge?: string | null;
};

export function MypageInstagramView({
  profile,
  mannerScore,
  isBusinessMember,
  hasOwnerStore,
  ownerHubStoreId = null,
  ownerStoreGate = null,
  ownerStoreGateFirstId = null,
  isAdmin,
  addressDefaults,
  neighborhoodFromLife,
  overviewCounts,
  favoriteBadge,
  notificationBadge,
  storeAttentionSummary,
  services,
}: MypageInstagramViewProps) {
  const [tab, setTab] = useState<MypageIgTabId>("trade");
  const [bizBlockedOpen, setBizBlockedOpen] = useState(false);

  const needsBizEntryModal =
    hasOwnerStore && ownerStoreGate != null && ownerStoreGate.kind !== "approved";
  const openBizBlocked = () => setBizBlockedOpen(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(TAB_STORAGE_KEY);
      if (raw === "trade" || raw === "orders" || raw === "board" || raw === "store" || raw === "account") {
        setTab(raw);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistTab = useCallback((id: MypageIgTabId) => {
    setTab(id);
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(TAB_STORAGE_KEY, id);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const displayName = profile.nickname?.trim() || "닉네임 없음";
  const handle =
    profile.nickname?.trim() != null && profile.nickname.trim() !== ""
      ? `@${profile.nickname.trim()}`
      : profile.email?.split("@")[0]
        ? `@${profile.email.split("@")[0]}`
        : "@samarket";
  const profileRegionComplete = isProfileLocationComplete(profile);
  const lifeNeighborhoodComplete = neighborhoodFromLife?.complete === true;
  const hasRegion = profileRegionComplete || lifeNeighborhoodComplete;
  const profileLocationLines = resolveProfileLocationAddressLines(profile);
  const regionLine = (() => {
    if (profileRegionComplete && profileLocationLines.length > 0) {
      return profileLocationLines.join("\n");
    }
    if (lifeNeighborhoodComplete && (neighborhoodFromLife?.label?.trim() ?? "")) {
      return neighborhoodFromLife!.label.trim();
    }
    if (profileLocationLines.length > 0) return profileLocationLines.join("\n");
    const lf = neighborhoodFromLife?.label?.trim() ?? "";
    if (lf) return `${lf} · 동네를 마저 선택해 주세요`;
    return "동네 미설정";
  })();
  const pointsLabel = `${Math.max(0, Math.floor(Number(profile.points) || 0)).toLocaleString()}P`;

  const tradeTotal =
    overviewCounts.purchases != null && overviewCounts.sales != null
      ? String(overviewCounts.purchases + overviewCounts.sales)
      : overviewCounts.purchases != null || overviewCounts.sales != null
        ? String((overviewCounts.purchases ?? 0) + (overviewCounts.sales ?? 0))
        : "–";

  const storeStatLabel =
    hasOwnerStore && overviewCounts.storeAttention != null && overviewCounts.storeAttention > 0
      ? String(overviewCounts.storeAttention)
      : hasOwnerStore
        ? "ON"
        : "–";

  const chips: { key: string; label: string; href: string }[] = [];
  if (!hasRegion) chips.push({ key: "r", label: "동네 미설정", href: "/my/edit" });
  if (addressDefaults) {
    if (!addressDefaults.life) chips.push({ key: "l", label: "생활 주소", href: "/my/addresses" });
    if (!addressDefaults.delivery) chips.push({ key: "d", label: "배달지", href: "/my/addresses" });
    if (!addressDefaults.trade) chips.push({ key: "t", label: "거래 주소", href: "/my/addresses" });
  }
  if (!profile.phone_verified) chips.push({ key: "p", label: "연락처 인증", href: "/mypage/account" });

  const tradeRows: MenuRow[] = [
    { href: "/mypage/trade", title: "개인 거래 허브", subtitle: "구매·판매·채팅 한곳에서" },
    { href: "/mypage/purchases", title: "구매 관리", subtitle: "진행·완료·후기" },
    { href: "/mypage/sales", title: "판매 관리", subtitle: "판매중·예약·완료" },
    { href: "/mypage/trade/chat", title: "거래채팅", subtitle: "대화 이어가기" },
    { href: "/mypage/reviews", title: "거래 후기", subtitle: "받은 후기·작성 대기" },
    { href: MYPAGE_TRADE_FAVORITES_HREF, title: "찜한 상품", subtitle: "관심 목록", badge: favoriteBadge },
    { href: "/my/products", title: "내 상품 글", subtitle: "거래 게시물" },
  ];

  const orderRows: MenuRow[] = [
    { href: "/my/store-orders", title: "내 배달 주문", subtitle: "배달·픽업·리뷰" },
  ];

  const boardRows: MenuRow[] = [
    { href: "/community", title: "동네생활", subtitle: "게시판 둘러보기" },
    { href: "/community/write", title: "글쓰기", subtitle: "새 게시글" },
    { href: "/my/community-posts", title: "내 활동 글", subtitle: "커뮤니티" },
    { href: "/my/recent-viewed", title: "최근 본 글", subtitle: "다시 보기" },
  ];

  const bizQ = ownerHubStoreId?.trim()
    ? `storeId=${encodeURIComponent(ownerHubStoreId.trim())}`
    : "";
  const ownerOrdersHref = ownerHubStoreId?.trim()
    ? buildStoreOrdersHref({ storeId: ownerHubStoreId.trim(), tab: "new" })
    : "/my/business/store-orders";

  const storeRows: MenuRow[] = hasOwnerStore
    ? [
        {
          href: ownerOrdersHref,
          title: "사장님 주문 관리",
          subtitle: storeAttentionSummary ?? "접수·환불·취소",
        },
        { href: "/my/store-orders", title: "내 배달 주문", subtitle: "고객으로 주문한 내역" },
        { href: "/my/business", title: "매장 운영 허브", subtitle: "대시보드" },
        {
          href: bizQ ? `/my/business/inquiries?${bizQ}` : "/my/business/inquiries",
          title: "받은 문의",
          subtitle: "고객 문의 응답",
        },
        {
          href: bizQ ? `/my/business/products?${bizQ}` : "/my/business/products",
          title: "상품 등록",
          subtitle: "목록·노출·신규",
        },
        {
          href: bizQ ? `/my/business/profile?${bizQ}` : "/my/business/profile",
          title: "매장 설정",
          subtitle: "소개·배달 범위",
        },
        {
          href: bizQ ? `/my/business/ops-status?${bizQ}` : "/my/business/ops-status",
          title: "운영 상태",
          subtitle: "심사·판매 가능",
        },
        {
          href: bizQ ? `/my/business/settlements?${bizQ}` : "/my/business/settlements",
          title: "정산 내역",
          subtitle: "매출·정산",
        },
        { href: "/my/ads", title: "광고·확장", subtitle: "노출 확대" },
      ]
    : [
        { href: "/my/store-orders", title: "내 배달 주문", subtitle: "주문·리뷰" },
        { href: "/my/business/apply", title: "매장 등록 신청", subtitle: "사장님 기능 시작" },
      ];

  const serviceTools = services
    .filter((service) => !["business"].includes(service.code))
    .map((service) => ({
      href: service.href,
      title: service.label,
      subtitle: serviceDescription(service),
    }));

  const accountRows: MenuRow[] = [
    {
      href: buildMypageInfoHubHref(),
      title: "내 정보 · 앱 설정",
      subtitle: "한곳에서 확인 · 언어·국가·차단·캐시",
    },
    { href: "/mypage/account", title: "계정 상세", subtitle: "프로필·연락처·인증" },
    {
      href: "/mypage/notifications",
      title: "알림",
      subtitle: notificationBadge
        ? `알림함 ${notificationBadge}건 · 채널·방해금지`
        : "알림함 · 푸시·이메일·방해금지",
      badge: notificationBadge,
    },
    { href: "/mypage/order-notifications", title: "주문 알림", subtitle: "배달·픽업·주문 상태" },
    { href: "/mypage/points", title: "포인트", subtitle: "잔액·충전·내역" },
    { href: "/my/edit", title: "프로필 편집", subtitle: "닉네임·사진" },
    { href: "/my/addresses", title: "주소 관리", subtitle: "생활·배달·거래" },
    { href: "/my/logout", title: "로그아웃", subtitle: "이 기기에서 종료" },
    ...serviceTools,
  ];

  const tabRows: Record<MypageIgTabId, MenuRow[]> = {
    trade: tradeRows,
    orders: orderRows,
    board: boardRows,
    store: storeRows,
    account: accountRows,
  };

  const tabs: { id: MypageIgTabId; label: string }[] = [
    { id: "trade", label: "거래" },
    { id: "orders", label: "배달주문" },
    { id: "board", label: "게시판" },
    { id: "store", label: "매장" },
    { id: "account", label: "계정" },
  ];

  return (
    <div className="border-b border-ig-border bg-[var(--sub-bg)]">
      {/* 스크롤 시 1단(h-12) 바로 아래에 프로필+탭 고정 — 하단 메뉴만 스크롤 */}
      <div className="sticky top-12 z-10 border-b border-ig-border bg-[var(--sub-bg)] pt-1">
      {/* 프로필 상단 — 인스타 프로필 레이아웃 */}
      <div className="px-4 pb-3">
        <div className="flex gap-5">
          <Link
            href="/my/edit"
            className="relative h-[86px] w-[86px] shrink-0 overflow-hidden rounded-full border border-ig-border bg-ig-highlight"
            aria-label="프로필 사진 편집"
          >
            {profile.avatar_url ? (
              <Image src={profile.avatar_url} alt="" fill className="object-cover" sizes="86px" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[#A8A8A8]">
                <UserGlyph />
              </div>
            )}
          </Link>
          <div className="min-w-0 flex-1 pt-1">
            <div className="grid grid-cols-4 divide-x divide-ig-border text-center">
              <StatCell href="/mypage/trade" value={tradeTotal} label="거래" />
              <StatCell href="/my/store-orders" value="보기" label="주문" smallValue />
              <StatCell href="/community" value="보기" label="게시판" smallValue />
              <StatCell
                href={hasOwnerStore ? "/my/business" : "/my/business/apply"}
                value={storeStatLabel}
                label="매장"
                suppressNav={needsBizEntryModal}
                onSuppressedNav={openBizBlocked}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-foreground">{displayName}</span>
            {isBusinessMember ? (
              <span className="rounded bg-ig-highlight px-1.5 py-0.5 text-[11px] font-semibold text-foreground">
                비즈
              </span>
            ) : null}
          </div>
          <p className="text-[13px] text-[var(--text-muted)]">{handle}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-foreground">
            <span
              className={`whitespace-pre-line ${!hasRegion ? "text-amber-700 dark:text-amber-400" : "text-[var(--text-muted)]"}`}
            >
              {regionLine}
            </span>
            <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
              <MannerBatteryDisplay raw={mannerScore} size="sm" layout="inline" className="gap-1" />
              <span>·</span>
              <Link href="/mypage/points" className="font-medium text-foreground">
                {pointsLabel}
              </Link>
            </span>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <Link
            href="/my/edit"
            className="flex h-9 flex-1 items-center justify-center rounded-lg bg-ig-highlight text-[13px] font-semibold text-foreground active:opacity-80"
          >
            프로필 편집
          </Link>
          <Link
            href="/my/addresses"
            className="flex h-9 flex-1 items-center justify-center rounded-lg bg-ig-highlight text-[13px] font-semibold text-foreground active:opacity-80"
          >
            주소 관리
          </Link>
        </div>

        {chips.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <Link
                key={c.key}
                href={c.href}
                className="rounded-full border border-ig-border bg-background px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] transition-opacity active:opacity-70"
              >
                {c.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {/* 탭 바 — 프로필과 동일 스티키 그룹(별도 sticky 제거) */}
      <div className="flex border-t border-ig-border bg-[var(--sub-bg)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => persistTab(t.id)}
            className={`relative flex-1 py-2.5 text-[12px] font-semibold transition-colors ${
              tab === t.id ? "text-foreground" : "text-[var(--text-muted)]"
            }`}
          >
            {t.label}
            {tab === t.id ? (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-foreground" />
            ) : null}
          </button>
        ))}
      </div>
      </div>

      {/* 탭 패널 — 리스트 행 */}
      <div className="min-h-[200px] bg-[var(--sub-bg)]">
        {tabRows[tab].map((row) => (
          <IgMenuRow
            key={row.href + row.title}
            {...row}
            suppressNav={shouldInterceptMypageBusinessHref(row.href, needsBizEntryModal)}
            onSuppressedNav={openBizBlocked}
          />
        ))}
      </div>

      {/* 운영 / 관리자 */}
      {(isAdmin || hasOwnerStore) && (
        <div className="border-t border-ig-border bg-background px-4 py-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">운영</p>
          <div className="space-y-0 divide-y divide-ig-border overflow-hidden rounded-lg border border-ig-border bg-[var(--sub-bg)]">
            {hasOwnerStore ? (
              needsBizEntryModal ? (
                <button
                  type="button"
                  onClick={openBizBlocked}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left active:bg-ig-highlight"
                >
                  <span className="text-[14px] font-medium text-foreground">매장 운영 허브</span>
                  <Chevron />
                </button>
              ) : (
                <Link
                  href="/my/business"
                  className="flex items-center justify-between px-4 py-3.5 active:bg-ig-highlight"
                >
                  <span className="text-[14px] font-medium text-foreground">매장 운영 허브</span>
                  <Chevron />
                </Link>
              )
            ) : null}
            {isAdmin ? (
              <Link href="/admin" className="flex items-center justify-between px-4 py-3.5 active:bg-ig-highlight">
                <span className="text-[14px] font-medium text-foreground">관리자</span>
                <Chevron />
              </Link>
            ) : null}
          </div>
        </div>
      )}

      {needsBizEntryModal && ownerStoreGate ? (
        <StoreBusinessBlockedModal
          open={bizBlockedOpen}
          onClose={() => setBizBlockedOpen(false)}
          state={ownerStoreGate}
          firstStoreId={ownerStoreGateFirstId?.trim() || undefined}
          primaryCloseLabel="확인"
        />
      ) : null}
    </div>
  );
}

function StatCell({
  href,
  value,
  label,
  smallValue,
  suppressNav,
  onSuppressedNav,
}: {
  href: string;
  value: string;
  label: string;
  smallValue?: boolean;
  suppressNav?: boolean;
  onSuppressedNav?: () => void;
}) {
  const cls =
    "flex flex-col items-center justify-center gap-0.5 py-1 first:pl-0 active:opacity-70 w-full min-w-0";
  if (suppressNav && onSuppressedNav) {
    return (
      <button type="button" className={cls} onClick={onSuppressedNav}>
        <span className={`font-semibold text-foreground ${smallValue ? "text-[13px]" : "text-[16px] tabular-nums"}`}>
          {value}
        </span>
        <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
      </button>
    );
  }
  return (
    <Link href={href} className={cls}>
      <span className={`font-semibold text-foreground ${smallValue ? "text-[13px]" : "text-[16px] tabular-nums"}`}>
        {value}
      </span>
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
    </Link>
  );
}

function IgMenuRow({
  href,
  title,
  subtitle,
  badge,
  suppressNav,
  onSuppressedNav,
}: MenuRow & { suppressNav?: boolean; onSuppressedNav?: () => void }) {
  const rowCls =
    "flex w-full items-center justify-between gap-3 border-b border-ig-border px-4 py-3.5 active:bg-ig-highlight text-left";
  if (suppressNav && onSuppressedNav) {
    return (
      <button type="button" className={rowCls} onClick={onSuppressedNav}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-medium text-foreground">{title}</span>
            {badge ? (
              <span className="rounded-full bg-signature/15 px-2 py-0.5 text-[11px] font-semibold text-signature">
                {badge}
              </span>
            ) : null}
          </div>
          {subtitle ? <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{subtitle}</p> : null}
        </div>
        <Chevron />
      </button>
    );
  }
  return (
    <Link href={href} className={rowCls}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-medium text-foreground">{title}</span>
          {badge ? (
            <span className="rounded-full bg-signature/15 px-2 py-0.5 text-[11px] font-semibold text-signature">
              {badge}
            </span>
          ) : null}
        </div>
        {subtitle ? <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{subtitle}</p> : null}
      </div>
      <Chevron />
    </Link>
  );
}

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[var(--text-muted)]" aria-hidden>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** 심사 중 등: 운영 경로는 모달로 막음 (`shouldInterceptBusinessHubHref` 와 동일) */
function shouldInterceptMypageBusinessHref(href: string, needsModal: boolean): boolean {
  return needsModal && shouldInterceptBusinessHubHref(href);
}

function UserGlyph() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
