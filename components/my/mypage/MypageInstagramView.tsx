"use client";

import Image from "next/image";
import Link from "next/link";
import { philifeAppPaths } from "@domain/philife/paths";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChatSettingsContent } from "@/components/my/settings/ChatSettingsContent";
import { CountrySettingsContent } from "@/components/my/settings/CountrySettingsContent";
import { LanguageSettingsContent } from "@/components/my/settings/LanguageSettingsContent";
import { NotificationsSettingsContent } from "@/components/my/settings/NotificationsSettingsContent";
import { PersonalizationContent } from "@/components/my/settings/PersonalizationContent";
import { SettingsMainContent } from "@/components/my/settings/SettingsMainContent";
import { VideoAutoplayContent } from "@/components/my/settings/VideoAutoplayContent";
import type { AddressDefaultsFlags } from "@/components/my/MyProfileCard";
import type { LifeDefaultLocationSummary } from "@/lib/addresses/life-default-location-summary";
import type { CommunityFeedPostDTO } from "@/lib/community-feed/types";
import type { MyPageSectionRow, MyServiceRow } from "@/lib/my/types";
import type { ProfileRow } from "@/lib/profile/types";
import { hasFormalMemberContactVerification } from "@/lib/auth/member-access";
import {
  isProfileLocationComplete,
  resolveProfileLocationAddressLines,
} from "@/lib/profile/profile-location";
import {
  COUNTRY_NAMES,
  getUserSettings,
  LANGUAGE_NAMES,
  subscribeUserSettings,
  syncUserSettings,
  VIDEO_AUTOPLAY_LABELS,
} from "@/lib/settings/user-settings-store";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { StoreBusinessBlockedModal } from "@/components/business/StoreBusinessBlockedModal";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import type { UserSettingsRow } from "@/lib/types/settings-db";
import { formatMoneyPhp } from "@/lib/utils/format";
import { fetchMeStoreOrdersListDeduped } from "@/lib/stores/store-delivery-api-client";

type MypageSectionId = "trade" | "board" | "store" | "account";
type SettingsSheetKind =
  | "notifications"
  | "language"
  | "country"
  | "chat"
  | "autoplay"
  | "personalization"
  | "app"
  | "support"
  | "terms";

const SECTION_STORAGE_KEY = "samarket:mypage:info-section";

type OverviewCounts = {
  purchases: number | null;
  sales: number | null;
  storeAttention: number | null;
};

type TradePurchasePreview = {
  chatId: string;
  title: string;
  price: number;
  sellerNickname: string;
  tradeFlowStatus?: string;
  lastMessageAt: string | null;
  hasBuyerReview: boolean;
};

type TradeSalePreview = {
  chatId: string;
  postId: string;
  title: string;
  price: number;
  buyerNickname: string;
  tradeFlowStatus?: string;
  lastMessageAt: string | null;
  noActiveChat?: boolean;
};

type StoreOrderPreview = {
  id: string;
  order_no: string;
  store_name: string;
  payment_amount: number;
  order_status: string;
  created_at: string;
  order_chat_unread_count?: number;
};

type TradePreviewState = {
  status: "idle" | "loading" | "ready" | "error";
  purchases: TradePurchasePreview[];
  sales: TradeSalePreview[];
};

type StorePreviewState = {
  status: "idle" | "loading" | "ready" | "error";
  orders: StoreOrderPreview[];
};

type BoardPreviewState = {
  status: "idle" | "loading" | "ready" | "error";
  posts: CommunityFeedPostDTO[];
};

export type MypageInstagramViewProps = {
  profile: ProfileRow;
  mannerScore: number;
  isBusinessMember: boolean;
  hasOwnerStore: boolean;
  ownerHubStoreId?: string | null;
  ownerStoreGate?: OwnerStoreGateState | null;
  ownerStoreGateFirstId?: string | null;
  isAdmin: boolean;
  addressDefaults: AddressDefaultsFlags;
  neighborhoodFromLife: LifeDefaultLocationSummary | null;
  overviewCounts: OverviewCounts;
  favoriteBadge: string | null;
  notificationBadge: string | null;
  storeAttentionSummary: string | null;
  services: MyServiceRow[];
  sections: MyPageSectionRow[];
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
  sections,
}: MypageInstagramViewProps) {
  const [activeSection, setActiveSection] = useState<MypageSectionId>("trade");
  const [settingsSheet, setSettingsSheet] = useState<SettingsSheetKind | null>(null);
  const [bizBlockedOpen, setBizBlockedOpen] = useState(false);
  const [tradePreview, setTradePreview] = useState<TradePreviewState>({
    status: "idle",
    purchases: [],
    sales: [],
  });
  const [storePreview, setStorePreview] = useState<StorePreviewState>({
    status: "idle",
    orders: [],
  });
  const [boardPreview, setBoardPreview] = useState<BoardPreviewState>({
    status: "idle",
    posts: [],
  });
  const userId = profile.id?.trim() ?? "";
  const [userSettings, setUserSettings] = useState<Partial<UserSettingsRow>>(() =>
    userId ? getUserSettings(userId) : {}
  );

  const needsBizEntryModal =
    hasOwnerStore && ownerStoreGate != null && ownerStoreGate.kind !== "approved";
  const openBizBlocked = () => setBizBlockedOpen(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(SECTION_STORAGE_KEY);
      if (raw === "trade" || raw === "board" || raw === "store" || raw === "account") {
        setActiveSection(raw);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    const apply = () => setUserSettings(getUserSettings(userId));
    apply();
    void syncUserSettings(userId).then(() => apply());
    return subscribeUserSettings(({ userId: changedUserId }) => {
      if (changedUserId === userId) apply();
    });
  }, [userId]);

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

  const loadTradePreview = useCallback(async () => {
    setTradePreview((prev) => ({ ...prev, status: "loading" }));
    try {
      const [purchasesRes, salesRes] = await Promise.all([
        fetch("/api/my/purchases?limit=3", { credentials: "include", cache: "no-store" }),
        fetch("/api/my/sales?limit=3", { credentials: "include", cache: "no-store" }),
      ]);
      if (!purchasesRes.ok || !salesRes.ok) throw new Error("trade_preview_failed");
      const purchasesJson = (await purchasesRes.json()) as { items?: TradePurchasePreview[] };
      const salesJson = (await salesRes.json()) as { items?: TradeSalePreview[] };
      setTradePreview({
        status: "ready",
        purchases: Array.isArray(purchasesJson.items) ? purchasesJson.items : [],
        sales: Array.isArray(salesJson.items) ? salesJson.items : [],
      });
    } catch {
      setTradePreview({ status: "error", purchases: [], sales: [] });
    }
  }, []);

  const loadStorePreview = useCallback(async () => {
    setStorePreview((prev) => ({ ...prev, status: "loading" }));
    try {
      const { status, json } = await fetchMeStoreOrdersListDeduped("?limit=3");
      if (status < 200 || status >= 300) throw new Error("store_preview_failed");
      const parsed = json as { ok?: boolean; orders?: StoreOrderPreview[] };
      if (!parsed.ok) throw new Error("store_preview_failed");
      setStorePreview({
        status: "ready",
        orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      });
    } catch {
      setStorePreview({ status: "error", orders: [] });
    }
  }, []);

  const loadBoardPreview = useCallback(async () => {
    setBoardPreview((prev) => ({ ...prev, status: "loading" }));
    try {
      const res = await fetch("/api/me/community-posts?limit=3", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("board_preview_failed");
      const json = (await res.json()) as { ok?: boolean; posts?: CommunityFeedPostDTO[] };
      if (!json.ok) throw new Error("board_preview_failed");
      setBoardPreview({
        status: "ready",
        posts: Array.isArray(json.posts) ? json.posts : [],
      });
    } catch {
      setBoardPreview({ status: "error", posts: [] });
    }
  }, []);

  useEffect(() => {
    if (activeSection === "trade" && tradePreview.status === "idle") {
      void loadTradePreview();
    }
    if (activeSection === "store" && storePreview.status === "idle") {
      void loadStorePreview();
    }
    if (activeSection === "board" && boardPreview.status === "idle") {
      void loadBoardPreview();
    }
  }, [
    activeSection,
    boardPreview.status,
    loadBoardPreview,
    loadStorePreview,
    loadTradePreview,
    storePreview.status,
    tradePreview.status,
  ]);

  const contactFormal = hasFormalMemberContactVerification({
    phone_verified: profile.phone_verified,
    auth_provider: profile.auth_provider,
    email: profile.email,
  });

  const displayName = profile.nickname?.trim() || "닉네임 없음";
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
    if (lf) return `${lf} · 설정 필요`;
    return "동네 미설정";
  })();
  const pointsLabel = `${Math.max(0, Math.floor(Number(profile.points) || 0)).toLocaleString()}P`;
  const tradeTotal =
    overviewCounts.purchases != null || overviewCounts.sales != null
      ? String((overviewCounts.purchases ?? 0) + (overviewCounts.sales ?? 0))
      : "–";
  const storeStatLabel =
    hasOwnerStore && overviewCounts.storeAttention != null && overviewCounts.storeAttention > 0
      ? String(overviewCounts.storeAttention)
      : hasOwnerStore
        ? "ON"
        : "–";
  const editHref = MYPAGE_PROFILE_EDIT_HREF;
  const accountHref = "/mypage/account";
  const addressesHref = "/mypage/addresses";
  const storeOrdersHref = "/mypage/store-orders";
  const businessHubHref = ownerHubStoreId?.trim()
    ? `/mypage/business?storeId=${encodeURIComponent(ownerHubStoreId.trim())}`
    : "/mypage/business";
  const ownerOrdersHref = ownerHubStoreId?.trim()
    ? `/mypage/business/orders?storeId=${encodeURIComponent(ownerHubStoreId.trim())}`
    : "/mypage/business/orders";
  const businessApplyHref = "/mypage/business/apply";
  const statusPills = [
    isBusinessMember ? "비즈 회원" : null,
    hasRegion ? "지역 완료" : "지역 설정 필요",
    contactFormal ? "연락처 인증" : "연락처 미인증",
  ].filter(Boolean) as string[];

  const sectionMeta: Record<
    MypageSectionId,
    { id: MypageSectionId; label: string; count?: string | null }
  > = {
    trade: { id: "trade", label: "거래", count: tradeTotal !== "–" ? tradeTotal : null },
    board: {
      id: "board",
      label: "게시판",
      count: boardPreview.posts.length > 0 ? String(boardPreview.posts.length) : null,
    },
    store: {
      id: "store",
      label: "매장·주문",
      count: hasOwnerStore ? storeAttentionSummary ?? storeStatLabel : null,
    },
    account: { id: "account", label: "개인 설정", count: notificationBadge },
  };

  const orderedSectionIds = useMemo(() => {
    const preferred: MypageSectionId[] = [];
    for (const section of sections) {
      const id = normalizeSectionId(section.section_key);
      if (id && !preferred.includes(id)) preferred.push(id);
    }
    for (const fallback of ["trade", "board", "store", "account"] as MypageSectionId[]) {
      if (!preferred.includes(fallback)) preferred.push(fallback);
    }
    return preferred;
  }, [sections]);

  useEffect(() => {
    if (!orderedSectionIds.includes(activeSection)) {
      setActiveSection(orderedSectionIds[0] ?? "trade");
    }
  }, [activeSection, orderedSectionIds]);

  const resolvedSectionId =
    orderedSectionIds.includes(activeSection) ? activeSection : (orderedSectionIds[0] ?? "trade");

  const accountAlerts = [
    !hasRegion ? { label: "지역 설정", href: editHref } : null,
    !contactFormal ? { label: "연락처 인증", href: accountHref } : null,
    addressDefaults && !addressDefaults.life ? { label: "생활 주소", href: addressesHref } : null,
    addressDefaults && !addressDefaults.trade ? { label: "거래 주소", href: addressesHref } : null,
    addressDefaults && !addressDefaults.delivery ? { label: "배달 주소", href: addressesHref } : null,
  ].filter(Boolean) as Array<{ label: string; href: string }>;

  const currentLanguage =
    LANGUAGE_NAMES[String(userSettings.preferred_language ?? "ko")] ??
    String(userSettings.preferred_language ?? "한국어");
  const currentCountry =
    COUNTRY_NAMES[String(userSettings.preferred_country ?? "PH")] ??
    String(userSettings.preferred_country ?? "필리핀");
  const currentAutoplay =
    VIDEO_AUTOPLAY_LABELS[String(userSettings.video_autoplay_mode ?? "wifi_only")] ?? "Wi-Fi에서만";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-ig-border bg-[var(--sub-bg)]">
      <div className="shrink-0 border-b border-ig-border bg-[var(--sub-bg)] px-4 pt-3 pb-4">
        <div className="rounded-ui-rect border border-ig-border bg-background p-4 shadow-sm">
          <div className="flex items-start gap-4">
            <Link
              href={editHref}
              className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-full border border-ig-border bg-ig-highlight"
              aria-label="프로필 편집"
            >
              {profile.avatar_url ? (
                <Image src={profile.avatar_url} alt="" fill className="object-cover" sizes="84px" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted">
                  <UserGlyph />
                </div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[18px] font-semibold text-foreground">{displayName}</span>
              </div>
              <p
                className={`mt-1 whitespace-pre-line text-[13px] ${
                  !hasRegion ? "text-amber-700 dark:text-amber-400" : "text-[var(--text-muted)]"
                }`}
              >
                {regionLine}
              </p>
              <p className="mt-2 text-[12px] text-[var(--text-muted)]">{statusPills.join(" · ")}</p>
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
            <SummaryCard label="거래" value={tradeTotal} detail="구매+판매" />
            <SummaryCard label="포인트" value={pointsLabel} detail="보유" />
            <SummaryCard label="알림" value={notificationBadge ?? "0"} detail="미확인" />
            <SummaryCard
              label="매장"
              value={storeStatLabel}
              detail={hasOwnerStore ? "운영 상태" : "미개설"}
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-[var(--sub-bg)] [scrollbar-gutter:stable]">
        <div className="sticky top-0 z-10 border-b border-ig-border bg-[var(--sub-bg)]/95 px-4 py-3 backdrop-blur">
          <nav className="overflow-x-auto">
            <div className="flex min-w-max gap-2">
              {orderedSectionIds.map((sectionId) => {
                const section = sectionMeta[sectionId];
                const selected = section.id === resolvedSectionId;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => persistSection(section.id)}
                    className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-[13px] font-semibold transition-colors ${
                      selected
                        ? "border-foreground bg-foreground text-background"
                        : "border-ig-border bg-background text-foreground hover:bg-ig-highlight"
                    }`}
                  >
                    <span>{section.label}</span>
                    {section.count ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                          selected ? "bg-background/15 text-background" : "bg-signature/10 text-signature"
                        }`}
                      >
                        {section.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </nav>
        </div>

        <div className="space-y-3 px-4 py-4">
          {resolvedSectionId === "trade" ? (
            <TradeSection
              favoriteBadge={favoriteBadge}
              overviewCounts={overviewCounts}
              preview={tradePreview}
              onReload={() => void loadTradePreview()}
            />
          ) : null}

          {resolvedSectionId === "board" ? (
            <BoardSection preview={boardPreview} onReload={() => void loadBoardPreview()} />
          ) : null}

          {resolvedSectionId === "store" ? (
            <StoreSection
              hasOwnerStore={hasOwnerStore}
              storeAttentionSummary={storeAttentionSummary}
              storeOrdersHref={storeOrdersHref}
              ownerOrdersHref={ownerOrdersHref}
              businessHubHref={businessHubHref}
              businessApplyHref={businessApplyHref}
              needsBizEntryModal={needsBizEntryModal}
              onBizBlocked={openBizBlocked}
              preview={storePreview}
              onReload={() => void loadStorePreview()}
            />
          ) : null}

          {resolvedSectionId === "account" ? (
            <AccountSection
              alerts={accountAlerts}
              accountHref={accountHref}
              editHref={editHref}
              addressesHref={addressesHref}
              hasOwnerStore={hasOwnerStore}
              businessHubHref={businessHubHref}
              businessApplyHref={businessApplyHref}
              needsBizEntryModal={needsBizEntryModal}
              onBizBlocked={openBizBlocked}
              isAdmin={isAdmin}
              currentLanguage={currentLanguage}
              currentCountry={currentCountry}
              currentAutoplay={currentAutoplay}
              notificationBadge={notificationBadge}
              onOpenSheet={setSettingsSheet}
            />
          ) : null}
        </div>
      </div>

      <BottomSheet
        open={settingsSheet != null}
        title={sheetTitle(settingsSheet)}
        onClose={() => setSettingsSheet(null)}
      >
        {settingsSheet === "notifications" ? <NotificationsSettingsContent /> : null}
        {settingsSheet === "language" ? <LanguageSettingsContent /> : null}
        {settingsSheet === "country" ? <CountrySettingsContent /> : null}
        {settingsSheet === "chat" ? <ChatSettingsContent /> : null}
        {settingsSheet === "autoplay" ? <VideoAutoplayContent /> : null}
        {settingsSheet === "personalization" ? <PersonalizationContent /> : null}
        {settingsSheet === "app" ? <SettingsMainContent className="pb-0" /> : null}
        {settingsSheet === "support" ? <SupportSheetContent /> : null}
        {settingsSheet === "terms" ? <TermsSheetContent /> : null}
      </BottomSheet>

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

function TradeSection({
  favoriteBadge,
  overviewCounts,
  preview,
  onReload,
}: {
  favoriteBadge: string | null;
  overviewCounts: OverviewCounts;
  preview: TradePreviewState;
  onReload: () => void;
}) {
  return (
    <>
      <SectionCard title="바로 관리">
        <QuickActionGrid
          items={[
            { label: "구매", href: "/mypage/trade/purchases", value: formatCount(overviewCounts.purchases) },
            { label: "판매", href: "/mypage/trade/sales", value: formatCount(overviewCounts.sales) },
            { label: "채팅", href: "/community-messenger?section=chats&kind=trade" },
            { label: "찜", href: MYPAGE_TRADE_FAVORITES_HREF, value: favoriteBadge ?? undefined },
            { label: "후기", href: "/mypage/trade/reviews" },
            { label: "내 상품", href: "/mypage/products" },
          ]}
        />
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-2">
        <SectionCard title="최근 구매" actionHref="/mypage/trade/purchases">
          <PreviewStateBlock
            status={preview.status}
            emptyLabel="최근 구매가 없습니다."
            errorLabel="구매 목록을 불러오지 못했습니다."
            onRetry={onReload}
            hasItems={preview.purchases.length > 0}
          >
            <div className="divide-y divide-ig-border">
              {preview.purchases.map((item) => (
                <Link
                  key={item.chatId}
                  href={`/mypage/purchases/${encodeURIComponent(item.chatId)}`}
                  className="block px-4 py-3 hover:bg-ig-highlight/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-foreground">
                        {item.title || "상품"}
                      </p>
                      <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                        {item.sellerNickname || "판매자"} · {tradeFlowLabel(item.tradeFlowStatus)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-semibold text-foreground">
                        {formatMoneyPhp(item.price)}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {formatRelativeDate(item.lastMessageAt)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <InlineBadge tone="soft">{item.hasBuyerReview ? "후기 작성" : "후기 대기"}</InlineBadge>
                  </div>
                </Link>
              ))}
            </div>
          </PreviewStateBlock>
        </SectionCard>

        <SectionCard title="최근 판매" actionHref="/mypage/trade/sales">
          <PreviewStateBlock
            status={preview.status}
            emptyLabel="최근 판매가 없습니다."
            errorLabel="판매 목록을 불러오지 못했습니다."
            onRetry={onReload}
            hasItems={preview.sales.length > 0}
          >
            <div className="divide-y divide-ig-border">
              {preview.sales.map((item) => (
                <Link
                  key={`${item.chatId}:${item.postId}`}
                  href={item.noActiveChat ? `/post/${encodeURIComponent(item.postId)}` : "/mypage/trade/sales"}
                  className="block px-4 py-3 hover:bg-ig-highlight/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-foreground">
                        {item.title || "상품"}
                      </p>
                      <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                        {item.noActiveChat ? "문의 없음" : `구매자 ${item.buyerNickname || "대기"}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-semibold text-foreground">
                        {formatMoneyPhp(item.price)}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {formatRelativeDate(item.lastMessageAt)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <InlineBadge tone="soft">{tradeFlowLabel(item.tradeFlowStatus)}</InlineBadge>
                  </div>
                </Link>
              ))}
            </div>
          </PreviewStateBlock>
        </SectionCard>
      </div>
    </>
  );
}

function BoardSection({
  preview,
  onReload,
}: {
  preview: BoardPreviewState;
  onReload: () => void;
}) {
  return (
    <>
      <SectionCard title="게시판 관리">
        <QuickActionGrid
          items={[
            { label: "내 활동", href: "/mypage/community-posts" },
            { label: "댓글·반응", href: "/mypage/community-posts" },
            { label: "숨김 사용자", href: "/mypage/settings/hidden-users" },
            { label: "차단 사용자", href: "/mypage/settings/blocked-users" },
          ]}
        />
      </SectionCard>

      <SectionCard title="최근 활동" actionHref="/mypage/community-posts">
        <PreviewStateBlock
          status={preview.status}
          emptyLabel="최근 활동이 없습니다."
          errorLabel="게시판 활동을 불러오지 못했습니다."
          onRetry={onReload}
          hasItems={preview.posts.length > 0}
        >
          <div className="divide-y divide-ig-border">
            {preview.posts.map((post) => (
              <Link
                key={post.id}
                href={philifeAppPaths.post(post.id)}
                className="block px-4 py-3 hover:bg-ig-highlight/70"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-foreground">{post.title}</p>
                    <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                      {post.topic_name || "커뮤니티"} · {post.region_label || "지역 없음"}
                    </p>
                  </div>
                  <p className="shrink-0 text-[11px] text-[var(--text-muted)]">
                    {formatRelativeDate(post.created_at)}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <InlineBadge tone="soft">댓글 {post.comment_count}</InlineBadge>
                  <InlineBadge tone="soft">좋아요 {post.like_count}</InlineBadge>
                  <InlineBadge tone="soft">조회 {post.view_count}</InlineBadge>
                </div>
              </Link>
            ))}
          </div>
        </PreviewStateBlock>
      </SectionCard>
    </>
  );
}

function StoreSection({
  hasOwnerStore,
  storeAttentionSummary,
  storeOrdersHref,
  ownerOrdersHref,
  businessHubHref,
  businessApplyHref,
  needsBizEntryModal,
  onBizBlocked,
  preview,
  onReload,
}: {
  hasOwnerStore: boolean;
  storeAttentionSummary: string | null;
  storeOrdersHref: string;
  ownerOrdersHref: string;
  businessHubHref: string;
  businessApplyHref: string;
  needsBizEntryModal: boolean;
  onBizBlocked: () => void;
  preview: StorePreviewState;
  onReload: () => void;
}) {
  return (
    <>
      <SectionCard title="바로 관리">
        <QuickActionGrid
          items={[
            { label: "내 주문", href: storeOrdersHref },
            hasOwnerStore
              ? { label: "사장님 주문", href: ownerOrdersHref, value: storeAttentionSummary ?? undefined }
              : { label: "매장 신청", href: businessApplyHref },
            {
              label: hasOwnerStore ? "매장 운영" : "입점 안내",
              href: hasOwnerStore ? businessHubHref : businessApplyHref,
              suppressNav: shouldInterceptMypageBusinessHref(
                hasOwnerStore ? businessHubHref : businessApplyHref,
                needsBizEntryModal
              ),
              onSuppressedNav: onBizBlocked,
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="최근 주문" actionHref={storeOrdersHref}>
        <PreviewStateBlock
          status={preview.status}
          emptyLabel="최근 주문이 없습니다."
          errorLabel="주문 내역을 불러오지 못했습니다."
          onRetry={onReload}
          hasItems={preview.orders.length > 0}
        >
          <div className="divide-y divide-ig-border">
            {preview.orders.map((order) => (
              <Link
                key={order.id}
                href={`/mypage/store-orders/${encodeURIComponent(order.id)}`}
                className="block px-4 py-3 hover:bg-ig-highlight/70"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-foreground">
                      {order.store_name || "매장"}
                    </p>
                    <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                      {BUYER_ORDER_STATUS_LABEL[order.order_status] ?? order.order_status}
                      {order.order_chat_unread_count ? ` · 채팅 ${order.order_chat_unread_count}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] font-semibold text-foreground">
                      {formatMoneyPhp(order.payment_amount)}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      {formatRelativeDate(order.created_at)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <InlineBadge tone="soft">{order.order_no}</InlineBadge>
                </div>
              </Link>
            ))}
          </div>
        </PreviewStateBlock>
      </SectionCard>
    </>
  );
}

function AccountSection({
  alerts,
  accountHref,
  editHref,
  addressesHref,
  hasOwnerStore,
  businessHubHref,
  businessApplyHref,
  needsBizEntryModal,
  onBizBlocked,
  isAdmin,
  currentLanguage,
  currentCountry,
  currentAutoplay,
  notificationBadge,
  onOpenSheet,
}: {
  alerts: Array<{ label: string; href: string }>;
  accountHref: string;
  editHref: string;
  addressesHref: string;
  hasOwnerStore: boolean;
  businessHubHref: string;
  businessApplyHref: string;
  needsBizEntryModal: boolean;
  onBizBlocked: () => void;
  isAdmin: boolean;
  currentLanguage: string;
  currentCountry: string;
  currentAutoplay: string;
  notificationBadge: string | null;
  onOpenSheet: (kind: SettingsSheetKind) => void;
}) {
  return (
    <>
      {alerts.length > 0 ? (
        <SectionCard title="확인 필요">
          <div className="divide-y divide-ig-border">
            {alerts.map((item) => (
              <ActionRow key={item.label} href={item.href} label={item.label} value="설정 필요" />
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="생활 메뉴">
        <div className="divide-y divide-ig-border">
          <ActionRow href="/mypage/settings/notice" label="공지사항" />
          <ActionRow href="/mypage/benefits" label="회원 혜택" />
          <ActionRow href="/mypage/recent-viewed" label="최근 본 글" />
          <ActionRow label="고객센터" onClick={() => onOpenSheet("support")} />
          <ActionRow label="이용약관" onClick={() => onOpenSheet("terms")} />
        </div>
      </SectionCard>

      <SectionCard title="주문·관심">
        <div className="divide-y divide-ig-border">
          <ActionRow href={addressesHref} label="주소 관리" />
          <ActionRow href="/mypage/store-orders" label="주문 내역" />
          <ActionRow href="/mypage/order-notifications" label="주문 알림" />
          <ActionRow href={MYPAGE_TRADE_FAVORITES_HREF} label="찜 목록" />
          <ActionRow href="/mypage/points" label="포인트" />
        </div>
      </SectionCard>

      <SectionCard title="환경 설정">
        <div className="divide-y divide-ig-border">
          <ActionRow
            label="알림 설정"
            value={notificationBadge ? `${notificationBadge} 확인` : "바로 조정"}
            onClick={() => onOpenSheet("notifications")}
          />
          <ActionRow label="언어" value={currentLanguage} onClick={() => onOpenSheet("language")} />
          <ActionRow label="국가" value={currentCountry} onClick={() => onOpenSheet("country")} />
          <ActionRow label="채팅 설정" onClick={() => onOpenSheet("chat")} />
          <ActionRow label="자동 재생" value={currentAutoplay} onClick={() => onOpenSheet("autoplay")} />
          <ActionRow label="개인화" onClick={() => onOpenSheet("personalization")} />
          <ActionRow label="앱 설정 전체" onClick={() => onOpenSheet("app")} />
          <ActionRow href="/mypage/settings/version" label="현재 버전" />
        </div>
      </SectionCard>

      <SectionCard title="계정·보안">
        <div className="divide-y divide-ig-border">
          <ActionRow href={accountHref} label="계정 상세" />
          <ActionRow href={editHref} label="프로필 수정" />
          <ActionRow href="/mypage/settings/hidden-users" label="숨김 사용자" />
          <ActionRow href="/mypage/settings/blocked-users" label="차단 사용자" />
          <ActionRow href="/mypage/settings/leave" label="회원 탈퇴" />
          <ActionRow href="/mypage/logout" label="로그아웃" />
        </div>
      </SectionCard>

      <SectionCard title="파트너">
        <div className="divide-y divide-ig-border">
          <ActionRow
            href={hasOwnerStore ? businessHubHref : businessApplyHref}
            label={hasOwnerStore ? "내 상점 운영" : "내 상점 등록하기"}
            suppressNav={shouldInterceptMypageBusinessHref(
              hasOwnerStore ? businessHubHref : businessApplyHref,
              needsBizEntryModal
            )}
            onSuppressedNav={onBizBlocked}
          />
          <ActionRow
            href={hasOwnerStore ? "/mypage/business/orders" : "/mypage/business/apply"}
            label={hasOwnerStore ? "사장님 주문 관리" : "사업자 신청"}
          />
          {isAdmin ? <ActionRow href="/admin" label="관리자" /> : null}
        </div>
      </SectionCard>
    </>
  );
}

function SectionCard({
  title,
  actionHref,
  children,
}: {
  title: string;
  actionHref?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-ui-rect border border-ig-border bg-background shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-ig-border px-4 py-3.5">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {actionHref ? (
          <Link href={actionHref} className="text-[12px] font-medium text-signature">
            전체 보기
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function QuickActionGrid({
  items,
}: {
  items: Array<{
    label: string;
    href?: string;
    value?: string;
    suppressNav?: boolean;
    onSuppressedNav?: () => void;
  } | null>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 px-4 py-4 sm:grid-cols-3">
      {items.filter(Boolean).map((item) => (
        <QuickActionTile key={`${item!.label}:${item!.href ?? "button"}`} item={item!} />
      ))}
    </div>
  );
}

function QuickActionTile({
  item,
}: {
  item: {
    label: string;
    href?: string;
    value?: string;
    suppressNav?: boolean;
    onSuppressedNav?: () => void;
  };
}) {
  const cls =
    "flex min-h-[86px] flex-col justify-between rounded-ui-rect border border-ig-border bg-[var(--sub-bg)] px-3 py-3 text-left";
  if (item.href && item.suppressNav && item.onSuppressedNav) {
    return (
      <button type="button" onClick={item.onSuppressedNav} className={cls}>
        <span className="text-[13px] font-semibold text-foreground">{item.label}</span>
        <span className="text-[12px] text-[var(--text-muted)]">{item.value ?? "열기"}</span>
      </button>
    );
  }
  if (item.href) {
    return (
      <Link href={item.href} className={cls}>
        <span className="text-[13px] font-semibold text-foreground">{item.label}</span>
        <span className="text-[12px] text-[var(--text-muted)]">{item.value ?? "열기"}</span>
      </Link>
    );
  }
  return null;
}

function PreviewStateBlock({
  status,
  hasItems,
  emptyLabel,
  errorLabel,
  onRetry,
  children,
}: {
  status: "idle" | "loading" | "ready" | "error";
  hasItems: boolean;
  emptyLabel: string;
  errorLabel: string;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (status === "idle" || status === "loading") {
    return <div className="px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">불러오는 중…</div>;
  }
  if (status === "error") {
    return (
      <div className="px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
        <p>{errorLabel}</p>
        <button type="button" onClick={onRetry} className="mt-3 text-[12px] font-semibold text-signature">
          다시 시도
        </button>
      </div>
    );
  }
  if (!hasItems) {
    return <div className="px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">{emptyLabel}</div>;
  }
  return <>{children}</>;
}

function ActionRow({
  href,
  label,
  value,
  suppressNav,
  onSuppressedNav,
  onClick,
}: {
  href?: string;
  label: string;
  value?: string | null;
  suppressNav?: boolean;
  onSuppressedNav?: () => void;
  onClick?: () => void;
}) {
  const cls =
    "flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ig-highlight/70";
  if (href && suppressNav && onSuppressedNav) {
    return (
      <button type="button" className={cls} onClick={onSuppressedNav}>
        <span className="text-[15px] font-medium text-foreground">{label}</span>
        <span className="flex items-center gap-2">
          {value ? <span className="text-[13px] text-[var(--text-muted)]">{value}</span> : null}
          <Chevron />
        </span>
      </button>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cls}>
        <span className="text-[15px] font-medium text-foreground">{label}</span>
        <span className="flex items-center gap-2">
          {value ? <span className="text-[13px] text-[var(--text-muted)]">{value}</span> : null}
          <Chevron />
        </span>
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      <span className="text-[15px] font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-2">
        {value ? <span className="text-[13px] text-[var(--text-muted)]">{value}</span> : null}
        <Chevron />
      </span>
    </button>
  );
}

function BottomSheet({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-end bg-black/45" onClick={onClose}>
      <div
        className="max-h-[82vh] w-full overflow-hidden rounded-t-[length:var(--ui-radius-rect)] bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ig-border px-4 py-3">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-ig-border" />
        </div>
        <div className="border-b border-ig-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[16px] font-semibold text-foreground">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-ig-border px-3 py-1 text-[12px] font-medium text-[var(--text-muted)]"
            >
              닫기
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
}

function SupportSheetContent() {
  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-ui-rect border border-ig-border bg-[var(--sub-bg)] px-4 py-4">
        <p className="text-[15px] font-semibold text-foreground">문의 전 확인</p>
        <p className="mt-2 text-[13px] leading-6 text-[var(--text-muted)]">
          주문 문제는 주문 내역에서, 거래 문제는 거래 채팅과 후기 화면에서 먼저 확인해 주세요.
          해결되지 않으면 운영 문의로 접수하는 흐름이 가장 빠릅니다.
        </p>
      </div>
      <div className="overflow-hidden rounded-ui-rect border border-ig-border bg-background">
        <div className="divide-y divide-ig-border">
          <InfoRow label="운영 문의" value="공지사항 및 관리자 공지 확인 후 진행" />
          <InfoRow label="주문 이슈" value="주문 내역 > 상세 화면에서 상태 확인" />
          <InfoRow label="매장 문의" value="내 상점 운영 또는 사장님 주문 관리에서 처리" />
        </div>
      </div>
    </div>
  );
}

function TermsSheetContent() {
  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-ui-rect border border-ig-border bg-[var(--sub-bg)] px-4 py-4">
        <p className="text-[15px] font-semibold text-foreground">이용 원칙</p>
        <p className="mt-2 text-[13px] leading-6 text-[var(--text-muted)]">
          거래, 커뮤니티, 주문, 매장 운영은 모두 계정 상태와 지역 정보에 따라 노출 범위와 사용 기능이 달라질 수 있습니다.
        </p>
      </div>
      <div className="overflow-hidden rounded-ui-rect border border-ig-border bg-background">
        <div className="divide-y divide-ig-border">
          <InfoRow label="계정" value="정확한 프로필과 연락처 정보를 유지해야 합니다." />
          <InfoRow label="거래" value="거래 상태와 후기 이력은 서비스 신뢰도에 반영됩니다." />
          <InfoRow label="주문·매장" value="주문 취소·환불·정산은 각 주문 상태 기준을 따릅니다." />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3.5">
      <p className="text-[14px] font-medium text-foreground">{label}</p>
      <p className="mt-1 text-[13px] leading-6 text-[var(--text-muted)]">{value}</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-ui-rect border border-ig-border bg-[var(--sub-bg)] px-3 py-3">
      <p className="text-[11px] font-medium text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-[18px] font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">{detail}</p>
    </div>
  );
}

function InlineBadge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "soft";
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        tone === "soft"
          ? "bg-[var(--sub-bg)] text-[var(--text-muted)]"
          : "bg-signature/10 text-signature"
      }`}
    >
      {children}
    </span>
  );
}

function Chevron() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0 text-[var(--text-muted)]"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function formatCount(value: number | null): string | undefined {
  if (value == null) return undefined;
  return `${value}건`;
}

function formatRelativeDate(value: string | null | undefined): string {
  if (!value) return "최근";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "최근";
  const diffMinutes = Math.floor((Date.now() - time) / 60000);
  if (diffMinutes < 1) return "방금";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}일 전`;
  return new Date(value).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function tradeFlowLabel(value: string | null | undefined): string {
  switch (value) {
    case "seller_done":
      return "판매자 완료";
    case "completed":
      return "거래 완료";
    case "issue":
      return "이슈";
    case "chatting":
      return "대화 중";
    default:
      return value?.trim() ? value : "진행 중";
  }
}

function sheetTitle(kind: SettingsSheetKind | null): string {
  switch (kind) {
    case "notifications":
      return "알림 설정";
    case "language":
      return "언어";
    case "country":
      return "국가";
    case "chat":
      return "채팅 설정";
    case "autoplay":
      return "자동 재생";
    case "personalization":
      return "개인화";
    case "app":
      return "앱 설정";
    case "support":
      return "고객센터";
    case "terms":
      return "이용약관";
    default:
      return "";
  }
}

function shouldInterceptMypageBusinessHref(href: string, needsModal: boolean): boolean {
  return needsModal && shouldInterceptBusinessHubHref(href);
}

function normalizeSectionId(raw: string): MypageSectionId | null {
  switch (raw) {
    case "trade":
    case "overview":
    case "summary":
    case "interests":
    case "deals":
    case "orders":
      return "trade";
    case "board":
    case "activity":
      return "board";
    case "store":
    case "business":
      return "store";
    case "account":
    case "settings":
      return "account";
    default:
      return null;
  }
}

function UserGlyph() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
      />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
