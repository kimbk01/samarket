"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProfileRow } from "@/lib/profile/types";
import {
  isProfileLocationComplete,
  resolveProfileLocationAddressLines,
} from "@/lib/profile/profile-location";
import type { AddressDefaultsFlags } from "@/components/my/MyProfileCard";
import type { LifeDefaultLocationSummary } from "@/lib/addresses/life-default-location-summary";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";
import type { MyPageSectionRow, MyServiceRow } from "@/lib/my/types";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { StoreBusinessBlockedModal } from "@/components/business/StoreBusinessBlockedModal";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";

type MypageSectionId = "overview" | "orders" | "store" | "account" | "activity";
const SECTION_STORAGE_KEY = "samarket:mypage:info-section";

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
  sections: MyPageSectionRow[];
};

type MenuRow = {
  href: string;
  title: string;
  subtitle?: string;
  badge?: string | null;
  eyebrow?: string;
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
  sections,
}: MypageInstagramViewProps) {
  const [activeSection, setActiveSection] = useState<MypageSectionId>("overview");
  const [bizBlockedOpen, setBizBlockedOpen] = useState(false);

  const needsBizEntryModal =
    hasOwnerStore && ownerStoreGate != null && ownerStoreGate.kind !== "approved";
  const openBizBlocked = () => setBizBlockedOpen(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(SECTION_STORAGE_KEY);
      if (
        raw === "overview" ||
        raw === "orders" ||
        raw === "store" ||
        raw === "account" ||
        raw === "activity"
      ) {
        setActiveSection(raw);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistSection = useCallback((id: MypageSectionId) => {
    setActiveSection(id);
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(SECTION_STORAGE_KEY, id);
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
  const accountHref = "/mypage/account";
  const editHref = "/mypage/edit";
  const addressesHref = "/mypage/addresses";
  const storeOrdersHref = "/mypage/store-orders";
  const businessHubHref = ownerHubStoreId?.trim()
    ? `/mypage/business?storeId=${encodeURIComponent(ownerHubStoreId.trim())}`
    : "/mypage/business";
  const ownerOrdersHref = ownerHubStoreId?.trim()
    ? `/mypage/business/orders?storeId=${encodeURIComponent(ownerHubStoreId.trim())}`
    : "/mypage/business/orders";
  const businessApplyHref = "/mypage/business/apply";

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

  const setupRows: MenuRow[] = [];
  if (!hasRegion) {
    setupRows.push({
      href: editHref,
      title: "동네와 지역 설정",
      subtitle: "배달·거래에 사용할 기본 생활 지역을 입력해 주세요.",
      badge: "필수",
      eyebrow: "프로필",
    });
  }
  if (addressDefaults) {
    const missingAddressParts: string[] = [];
    if (!addressDefaults.life) missingAddressParts.push("생활");
    if (!addressDefaults.delivery) missingAddressParts.push("배달");
    if (!addressDefaults.trade) missingAddressParts.push("거래");
    if (missingAddressParts.length > 0) {
      setupRows.push({
        href: addressesHref,
        title: "기본 주소 정리",
        subtitle: `${missingAddressParts.join(" · ")} 주소를 설정해 주세요.`,
        badge: "필수",
        eyebrow: "주소",
      });
    }
  }
  if (!profile.phone_verified) {
    setupRows.push({
      href: accountHref,
      title: "연락처 인증",
      subtitle: "주문과 거래 신뢰를 위해 인증을 완료해 주세요.",
      badge: "필수",
      eyebrow: "보안",
    });
  }

  const adsEnabled = services.some((service) => service.code === "ads");

  const overviewRows = dedupeRows([
    ...setupRows,
    {
      href: "/mypage/notifications",
      title: "알림 센터",
      subtitle: notificationBadge
        ? `읽지 않은 알림 ${notificationBadge}건을 먼저 확인해 주세요.`
        : "주문, 거래, 시스템 알림을 한곳에서 확인합니다.",
      badge: notificationBadge,
      eyebrow: "중요",
    },
    {
      href: "/mypage/points",
      title: "포인트",
      subtitle: `현재 ${pointsLabel} 보유 중입니다.`,
      eyebrow: "자산",
    },
    hasOwnerStore
      ? {
          href: businessHubHref,
          title: "매장 운영 허브",
          subtitle: storeAttentionSummary ?? "주문, 문의, 상품, 정산을 한곳에서 관리합니다.",
          eyebrow: "매장",
        }
      : {
          href: businessApplyHref,
          title: "매장 등록 신청",
          subtitle: "사장님 기능이 필요하면 여기서 시작합니다.",
          eyebrow: "매장",
        },
  ]);

  const orderRows = dedupeRows([
    {
      href: storeOrdersHref,
      title: "주문 내역",
      subtitle: "배달, 픽업, 리뷰, 재주문을 확인합니다.",
      eyebrow: "배달",
    },
    {
      href: "/mypage/trade/purchases",
      title: "구매 관리",
      subtitle: "구매 진행, 예약, 후기 작성을 관리합니다.",
      badge: overviewCounts.purchases != null ? String(overviewCounts.purchases) : null,
      eyebrow: "거래",
    },
    {
      href: "/mypage/trade/sales",
      title: "판매 관리",
      subtitle: "판매중, 예약, 완료 상태를 확인합니다.",
      badge: overviewCounts.sales != null ? String(overviewCounts.sales) : null,
      eyebrow: "거래",
    },
    {
      href: "/mypage/trade/chat",
      title: "거래 채팅",
      subtitle: "연결된 대화를 이어서 처리합니다.",
      eyebrow: "메신저",
    },
    {
      href: "/mypage/trade/reviews",
      title: "거래 후기",
      subtitle: "받은 후기와 작성할 후기를 정리합니다.",
      eyebrow: "후기",
    },
    {
      href: MYPAGE_TRADE_FAVORITES_HREF,
      title: "찜한 상품",
      subtitle: "관심 상품을 다시 확인합니다.",
      badge: favoriteBadge,
      eyebrow: "관심",
    },
    {
      href: "/mypage/products",
      title: "내 상품 관리",
      subtitle: "등록한 개인 거래 글을 관리합니다.",
      eyebrow: "상품",
    },
  ]);

  const storeRows = hasOwnerStore
    ? dedupeRows([
        {
          href: ownerOrdersHref,
          title: "사장님 주문 관리",
          subtitle: storeAttentionSummary ?? "신규 주문과 취소, 환불 요청을 확인합니다.",
          eyebrow: "운영",
        },
        {
          href: businessHubHref,
          title: "매장 운영 허브",
          subtitle: "상품, 문의, 운영 상태, 정산을 묶어서 관리합니다.",
          eyebrow: "허브",
        },
        ...(adsEnabled
          ? [
              {
                href: "/mypage/ads",
                title: "광고와 노출 확장",
                subtitle: "매장 노출과 광고 신청을 관리합니다.",
                eyebrow: "성장",
              } satisfies MenuRow,
            ]
          : []),
      ])
    : dedupeRows([
        {
          href: businessApplyHref,
          title: "매장 등록 신청",
          subtitle: "사장님 전용 관리 화면을 열기 위한 첫 단계입니다.",
          eyebrow: "입점",
        },
        ...(adsEnabled
          ? [
              {
                href: "/mypage/ads",
                title: "광고 신청",
                subtitle: "서비스 노출과 이벤트 신청을 관리합니다.",
                eyebrow: "노출",
              } satisfies MenuRow,
            ]
          : []),
      ]);

  const accountRows = dedupeRows([
    {
      href: accountHref,
      title: "계정 상세",
      subtitle: "프로필, 연락처, 인증 상태를 확인합니다.",
      eyebrow: "계정",
    },
    {
      href: editHref,
      title: "프로필 수정",
      subtitle: "사진, 닉네임, 소개, 지역 정보를 수정합니다.",
      eyebrow: "프로필",
    },
    {
      href: addressesHref,
      title: "주소와 지역",
      subtitle: "생활, 거래, 배달 기본 주소를 정리합니다.",
      eyebrow: "주소",
    },
    {
      href: "/mypage/notifications",
      title: "알림 설정",
      subtitle: notificationBadge
        ? `현재 ${notificationBadge}건 확인 필요 · 푸시와 채널을 조정합니다.`
        : "푸시, 이메일, 방해금지 설정을 관리합니다.",
      badge: notificationBadge,
      eyebrow: "알림",
    },
    {
      href: "/mypage/order-notifications",
      title: "주문 알림",
      subtitle: "배달, 픽업, 주문 상태 알림만 따로 관리합니다.",
      eyebrow: "주문",
    },
    {
      href: buildMypageInfoHubHref(),
      title: "앱 설정",
      subtitle: "언어, 국가, 차단, 캐시, 공지, 버전을 확인합니다.",
      eyebrow: "앱",
    },
    {
      href: "/mypage/points",
      title: "포인트",
      subtitle: "잔액, 충전, 내역을 확인합니다.",
      eyebrow: "자산",
    },
    {
      href: "/mypage/logout",
      title: "로그아웃",
      subtitle: "이 기기에서 안전하게 로그아웃합니다.",
      eyebrow: "보안",
    },
  ]);

  const activityRows = [
    {
      href: "/mypage/community-posts",
      title: "내 활동",
      subtitle: "내가 남긴 커뮤니티 글만 모아서 봅니다.",
      eyebrow: "커뮤니티",
    },
  ];

  const sectionMap: Record<
    MypageSectionId,
    { id: MypageSectionId; label: string; shortLabel: string; description: string; rows: MenuRow[] }
  > = {
    overview: {
      id: "overview",
      label: "요약",
      shortLabel: "요약",
      description: "지금 바로 확인해야 할 정보와 설정만 모았습니다.",
      rows: overviewRows,
    },
    orders: {
      id: "orders",
      label: "주문/거래",
      shortLabel: "주문",
      description: "배달 주문과 개인 거래를 한 흐름으로 관리합니다.",
      rows: orderRows,
    },
    store: {
      id: "store",
      label: "매장",
      shortLabel: "매장",
      description: hasOwnerStore
        ? "사장님용 운영 기능만 따로 모아 복잡도를 줄였습니다."
        : "매장 입점과 노출 확장 기능만 남겼습니다.",
      rows: storeRows,
    },
    account: {
      id: "account",
      label: "계정/설정",
      shortLabel: "계정",
      description: "프로필과 설정, 보안 관련 기능을 정리했습니다.",
      rows: accountRows,
    },
    activity: {
      id: "activity",
      label: "내 활동",
      shortLabel: "활동",
      description: "커뮤니티 영역은 내 활동만 남기고 나머지는 정리했습니다.",
      rows: activityRows,
    },
  };

  const orderedSectionIds = useMemo(() => {
    const preferred: MypageSectionId[] = [];
    for (const section of sections) {
      const id = normalizeSectionId(section.section_key);
      if (id && !preferred.includes(id)) preferred.push(id);
    }
    for (const fallback of ["overview", "orders", "store", "account", "activity"] as MypageSectionId[]) {
      if (!preferred.includes(fallback)) preferred.push(fallback);
    }
    return preferred.filter((id) => sectionMap[id].rows.length > 0);
  }, [sections, sectionMap]);

  useEffect(() => {
    if (!orderedSectionIds.includes(activeSection)) {
      setActiveSection(orderedSectionIds[0] ?? "overview");
    }
  }, [activeSection, orderedSectionIds]);

  const resolvedSectionId =
    orderedSectionIds.includes(activeSection) ? activeSection : (orderedSectionIds[0] ?? "overview");
  const currentSection = sectionMap[resolvedSectionId];
  const statusPills = [
    isBusinessMember ? "비즈 회원" : null,
    hasRegion ? "지역 설정 완료" : "지역 설정 필요",
    profile.phone_verified ? "연락처 인증 완료" : "연락처 인증 필요",
  ].filter(Boolean) as string[];
  const summaryCards = [
    { label: "거래", value: tradeTotal, detail: "구매+판매" },
    { label: "포인트", value: pointsLabel, detail: "보유 자산" },
    { label: "알림", value: notificationBadge ?? "0", detail: "미확인 알림" },
    { label: "매장", value: storeStatLabel, detail: hasOwnerStore ? "운영 상태" : "미개설" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-ig-border bg-[var(--sub-bg)]">
      <div className="shrink-0 border-b border-ig-border bg-[var(--sub-bg)] px-4 pt-3 pb-4">
        <div className="rounded-[28px] border border-ig-border bg-background p-4 shadow-sm">
          <div className="flex items-start gap-4">
            <Link
              href={editHref}
              className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-full border border-ig-border bg-ig-highlight"
              aria-label="프로필 편집"
            >
              {profile.avatar_url ? (
                <Image src={profile.avatar_url} alt="" fill className="object-cover" sizes="84px" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[#A8A8A8]">
                  <UserGlyph />
                </div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[18px] font-semibold text-foreground">{displayName}</span>
                {statusPills.map((pill) => (
                  <span
                    key={pill}
                    className="rounded-full border border-ig-border bg-[var(--sub-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]"
                  >
                    {pill}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">{handle}</p>
              <p
                className={`mt-2 whitespace-pre-line text-[13px] ${!hasRegion ? "text-amber-700 dark:text-amber-400" : "text-[var(--text-muted)]"}`}
              >
                {regionLine}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-muted)]">
                <span className="flex items-center gap-1.5">
                  <MannerBatteryDisplay raw={mannerScore} size="sm" layout="inline" className="gap-1" />
                </span>
                <span className="h-1 w-1 rounded-full bg-[var(--text-muted)]/40" />
                <Link href="/mypage/points" className="font-medium text-foreground">
                  {pointsLabel}
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {summaryCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-ig-border bg-[var(--sub-bg)] px-3 py-3">
                <p className="text-[11px] font-medium text-[var(--text-muted)]">{card.label}</p>
                <p className="mt-1 text-[18px] font-semibold text-foreground">{card.value}</p>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">{card.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-[var(--sub-bg)] [scrollbar-gutter:stable]">
        <div className="grid min-h-full grid-cols-[92px_minmax(0,1fr)] gap-3 px-4 py-4 md:grid-cols-[196px_minmax(0,1fr)]">
          <aside className="rounded-[24px] border border-ig-border bg-background p-2 shadow-sm">
            <nav className="space-y-1">
              {orderedSectionIds.map((sectionId) => {
                const section = sectionMap[sectionId];
                const selected = section.id === currentSection.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => persistSection(section.id)}
                    className={`flex w-full items-center gap-2 rounded-2xl px-3 py-3 text-left transition-colors ${
                      selected
                        ? "bg-foreground text-background"
                        : "text-foreground hover:bg-ig-highlight active:bg-ig-highlight"
                    }`}
                  >
                    <SectionGlyph sectionId={section.id} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold md:text-[14px]">{section.label}</p>
                      <p
                        className={`mt-0.5 hidden text-[11px] md:block ${
                          selected ? "text-background/80" : "text-[var(--text-muted)]"
                        }`}
                      >
                        {section.shortLabel}
                      </p>
                    </div>
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="flex min-h-[420px] flex-col overflow-hidden rounded-[24px] border border-ig-border bg-background shadow-sm">
            <div className="border-b border-ig-border px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                My Info
              </p>
              <h2 className="mt-1 text-[18px] font-semibold text-foreground">{currentSection.label}</h2>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">{currentSection.description}</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="divide-y divide-ig-border">
                {currentSection.rows.map((row) => (
                  <HubMenuRow
                    key={row.href + row.title}
                    {...row}
                    suppressNav={shouldInterceptMypageBusinessHref(row.href, needsBizEntryModal)}
                    onSuppressedNav={openBizBlocked}
                  />
                ))}
                {currentSection.id === "account" && isAdmin ? (
                  <HubMenuRow href="/admin" title="관리자" subtitle="운영 도구와 관리자 메뉴로 이동합니다." eyebrow="운영" />
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>

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

function HubMenuRow({
  href,
  title,
  subtitle,
  badge,
  eyebrow,
  suppressNav,
  onSuppressedNav,
}: MenuRow & { suppressNav?: boolean; onSuppressedNav?: () => void }) {
  const rowCls =
    "flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-ig-highlight/70 active:bg-ig-highlight";
  if (suppressNav && onSuppressedNav) {
    return (
      <button type="button" className={rowCls} onClick={onSuppressedNav}>
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{eyebrow}</p> : null}
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-foreground">{title}</span>
            {badge ? (
              <span className="rounded-full bg-signature/15 px-2 py-0.5 text-[11px] font-semibold text-signature">
                {badge}
              </span>
            ) : null}
          </div>
          {subtitle ? <p className="mt-1 text-[13px] text-[var(--text-muted)]">{subtitle}</p> : null}
        </div>
        <Chevron />
      </button>
    );
  }
  return (
    <Link href={href} className={rowCls}>
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{eyebrow}</p> : null}
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-foreground">{title}</span>
          {badge ? (
            <span className="rounded-full bg-signature/15 px-2 py-0.5 text-[11px] font-semibold text-signature">
              {badge}
            </span>
          ) : null}
        </div>
        {subtitle ? <p className="mt-1 text-[13px] text-[var(--text-muted)]">{subtitle}</p> : null}
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

function dedupeRows(rows: Array<MenuRow | false | null | undefined>): MenuRow[] {
  const seen = new Set<string>();
  const list: MenuRow[] = [];
  for (const row of rows) {
    if (!row) continue;
    const key = `${row.href}::${row.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(row);
  }
  return list;
}

function normalizeSectionId(raw: string): MypageSectionId | null {
  switch (raw) {
    case "overview":
    case "summary":
    case "interests":
      return "overview";
    case "orders":
    case "trade":
    case "deals":
      return "orders";
    case "store":
    case "business":
      return "store";
    case "account":
    case "settings":
      return "account";
    case "activity":
    case "board":
      return "activity";
    default:
      return null;
  }
}

function SectionGlyph({ sectionId }: { sectionId: MypageSectionId }) {
  switch (sectionId) {
    case "overview":
      return <OverviewIcon />;
    case "orders":
      return <OrdersIcon />;
    case "store":
      return <StoreIcon />;
    case "account":
      return <SettingsIcon />;
    case "activity":
      return <ActivityIcon />;
  }
}

function UserGlyph() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function OverviewIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h7" />
    </svg>
  );
}

function OrdersIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M7 12h10M9 17h6" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9l1.5-4h13L20 9M5 9v10h14V9M9 13h6" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317a1.724 1.724 0 013.35 0l.18.79a1.724 1.724 0 002.573 1.066l.694-.4a1.724 1.724 0 012.352.632l.342.592a1.724 1.724 0 01-.632 2.352l-.694.4a1.724 1.724 0 000 3.132l.694.4a1.724 1.724 0 01.632 2.352l-.342.592a1.724 1.724 0 01-2.352.632l-.694-.4a1.724 1.724 0 00-2.573 1.066l-.18.79a1.724 1.724 0 01-3.35 0l-.18-.79a1.724 1.724 0 00-2.573-1.066l-.694.4a1.724 1.724 0 01-2.352-.632l-.342-.592a1.724 1.724 0 01.632-2.352l.694-.4a1.724 1.724 0 000-3.132l-.694-.4a1.724 1.724 0 01-.632-2.352l.342-.592a1.724 1.724 0 012.352-.632l.694.4a1.724 1.724 0 002.573-1.066l.18-.79z"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h3l2-5 4 10 2-5h3" />
    </svg>
  );
}
