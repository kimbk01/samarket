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
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
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
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveCommunityTopicUILabel } from "@/lib/i18n/community-topic-label-i18n";
import { getStoredLanguagePreference } from "@/lib/i18n/language-preference";
import {
  getUserSettings,
  subscribeUserSettings,
  syncUserSettings,
} from "@/lib/settings/user-settings-store";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";
import {
  hubAutoplayLabel,
  hubCountryLabel,
  hubFormatCount,
  hubFormatRelativeDate,
  hubSheetTitle,
  hubStoreOrderStatusLabel,
  hubTradeFlowLabel,
  type SettingsSheetKind,
} from "@/lib/mypage/mypage-hub-i18n";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { StoreBusinessBlockedModal } from "@/components/business/StoreBusinessBlockedModal";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import type { UserSettingsRow } from "@/lib/types/settings-db";
import { formatMoneyPhp } from "@/lib/utils/format";
import { fetchMeStoreOrdersListDeduped } from "@/lib/stores/store-delivery-api-client";
import { formatAtUsername, resolveDisplayName } from "@/lib/users/user-label";

type MypageSectionId = "trade" | "board" | "store" | "account";
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
  const { t } = useI18n();
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
  const openBizBlocked = () => setBizBlockedOpen((prev) => (prev ? prev : true));

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
      await runSingleFlight("mypage-ig:trade-preview", async () => {
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
      });
    } catch {
      setTradePreview({ status: "error", purchases: [], sales: [] });
    }
  }, []);

  const loadStorePreview = useCallback(async () => {
    setStorePreview((prev) => ({ ...prev, status: "loading" }));
    try {
      await runSingleFlight("mypage-ig:store-preview", async () => {
        const { status, json } = await fetchMeStoreOrdersListDeduped("?limit=3");
        if (status < 200 || status >= 300) throw new Error("store_preview_failed");
        const parsed = json as { ok?: boolean; orders?: StoreOrderPreview[] };
        if (!parsed.ok) throw new Error("store_preview_failed");
        setStorePreview({
          status: "ready",
          orders: Array.isArray(parsed.orders) ? parsed.orders : [],
        });
      });
    } catch {
      setStorePreview({ status: "error", orders: [] });
    }
  }, []);

  const loadBoardPreview = useCallback(async () => {
    setBoardPreview((prev) => ({ ...prev, status: "loading" }));
    try {
      await runSingleFlight("mypage-ig:board-preview", async () => {
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

  const displayName = resolveDisplayName(profile) || t("profile_no_nickname");
  const atUsername = formatAtUsername(profile.username ?? null);
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
    if (lf) return `${lf}${t("mypage_hub_region_setup_suffix")}`;
    return t("mypage_hub_neighborhood_unset");
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
    ? `/stores/owner?storeId=${encodeURIComponent(ownerHubStoreId.trim())}`
    : "/stores/owner";
  const ownerOrdersHref = ownerHubStoreId?.trim()
    ? `/stores/owner/orders?storeId=${encodeURIComponent(ownerHubStoreId.trim())}`
    : "/stores/owner/orders";
  const businessApplyHref = "/stores/owner/apply";
  const statusPills = [
    isBusinessMember ? t("mypage_hub_biz_member") : null,
    hasRegion ? t("mypage_hub_region_done") : t("mypage_hub_region_setup_needed"),
    contactFormal ? t("mypage_hub_contact_verified") : t("mypage_hub_contact_unverified"),
  ].filter(Boolean) as string[];

  const sectionMeta: Record<
    MypageSectionId,
    { id: MypageSectionId; label: string; count?: string | null }
  > = {
    trade: { id: "trade", label: t("mypage_hub_section_trade"), count: tradeTotal !== "–" ? tradeTotal : null },
    board: {
      id: "board",
      label: t("mypage_hub_section_board"),
      count: boardPreview.posts.length > 0 ? String(boardPreview.posts.length) : null,
    },
    store: {
      id: "store",
      label: t("mypage_hub_section_store"),
      count: hasOwnerStore ? storeAttentionSummary ?? storeStatLabel : null,
    },
    account: { id: "account", label: t("mypage_hub_section_account"), count: notificationBadge },
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
    !hasRegion ? { label: t("mypage_hub_alert_region"), href: editHref } : null,
    !contactFormal ? { label: t("mypage_hub_alert_contact"), href: accountHref } : null,
    addressDefaults && !addressDefaults.master
      ? { label: t("mypage_hub_alert_address_master"), href: addressesHref }
      : null,
    addressDefaults && !addressDefaults.life
      ? { label: t("mypage_hub_alert_address_life"), href: addressesHref }
      : null,
    addressDefaults && !addressDefaults.trade
      ? { label: t("mypage_hub_alert_address_trade"), href: addressesHref }
      : null,
    addressDefaults && !addressDefaults.delivery
      ? { label: t("mypage_hub_alert_address_delivery"), href: addressesHref }
      : null,
  ].filter(Boolean) as Array<{ label: string; href: string }>;

  const languagePref = getStoredLanguagePreference(userSettings.preferred_language);
  const currentLanguage =
    languagePref === null
      ? t("mypage_use_device_language")
      : languagePref === "ko"
        ? t("mypage_korean")
        : t("mypage_english");
  const currentCountry = hubCountryLabel(String(userSettings.preferred_country ?? "PH"), t);
  const currentAutoplay = hubAutoplayLabel(String(userSettings.video_autoplay_mode ?? "wifi_only"), t);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-sam-border bg-[var(--sub-bg)]">
      <div className="shrink-0 border-b border-sam-border bg-[var(--sub-bg)] px-4 pt-3 pb-4">
        <div className="rounded-ui-rect border border-sam-border bg-background p-4 shadow-sm">
          <div className="flex items-start gap-4">
            <Link
              href={editHref}
              className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-full border border-sam-border bg-sam-primary-soft"
              aria-label={t("mypage_hub_edit_profile_aria")}
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
                <span className="sam-text-page-title font-semibold text-foreground">{displayName}</span>
              </div>
              {atUsername ? (
                <p className="mt-1 truncate font-mono sam-text-xxs text-[var(--text-muted)] tabular-nums">
                  {atUsername}
                </p>
              ) : null}
              <p
                className={`mt-1 whitespace-pre-line sam-text-body-secondary ${
                  !hasRegion ? "text-amber-700 dark:text-amber-400" : "text-[var(--text-muted)]"
                }`}
              >
                {regionLine}
              </p>
              <p className="mt-2 sam-text-helper text-[var(--text-muted)]">{statusPills.join(" · ")}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 sam-text-helper text-[var(--text-muted)]">
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
            <SummaryCard label={t("mypage_hub_summary_trade")} value={tradeTotal} detail={t("mypage_hub_summary_trade_detail")} />
            <SummaryCard label={t("mypage_hub_summary_points")} value={pointsLabel} detail={t("mypage_hub_summary_points_detail")} />
            <SummaryCard
              label={t("mypage_hub_summary_notifications")}
              value={notificationBadge ?? "0"}
              detail={t("mypage_hub_summary_notifications_detail")}
            />
            <SummaryCard
              label={t("mypage_hub_summary_store")}
              value={storeStatLabel}
              detail={hasOwnerStore ? t("mypage_hub_summary_store_active") : t("mypage_hub_summary_store_none")}
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-[var(--sub-bg)] [scrollbar-gutter:stable]">
        <div className="sticky top-0 z-10 border-b border-sam-border bg-[var(--sub-bg)]/95 px-4 py-3 backdrop-blur">
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
                    className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 sam-text-body-secondary font-semibold transition-colors ${
                      selected
                        ? "border-foreground bg-foreground text-background"
                        : "border-sam-border bg-background text-foreground hover:bg-sam-primary-soft"
                    }`}
                  >
                    <span>{section.label}</span>
                    {section.count ? (
                      <span
                        className={`rounded-full px-2 py-0.5 sam-text-xxs ${
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
        title={hubSheetTitle(settingsSheet, t)}
        onClose={() => setSettingsSheet((prev) => (prev === null ? prev : null))}
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
          onClose={() => setBizBlockedOpen((prev) => (prev ? false : prev))}
          state={ownerStoreGate}
          firstStoreId={ownerStoreGateFirstId?.trim() || undefined}
          primaryCloseLabel={t("common_confirm")}
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
  const { t, language } = useI18n();
  return (
    <>
      <SectionCard title={t("mypage_hub_quick_manage")}>
        <QuickActionGrid
          items={[
            {
              label: t("mypage_hub_trade_purchases"),
              href: "/mypage/trade/purchases",
              value: hubFormatCount(overviewCounts.purchases, t),
            },
            {
              label: t("mypage_hub_trade_sales"),
              href: "/mypage/trade/sales",
              value: hubFormatCount(overviewCounts.sales, t),
            },
            { label: t("mypage_hub_trade_chat"), href: TRADE_CHAT_SURFACE.messengerListHref },
            {
              label: t("mypage_hub_trade_favorites"),
              href: MYPAGE_TRADE_FAVORITES_HREF,
              value: favoriteBadge ?? undefined,
            },
            { label: t("mypage_hub_trade_reviews"), href: "/mypage/trade/reviews" },
            { label: t("mypage_hub_trade_my_products"), href: "/mypage/products" },
          ]}
        />
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-2">
        <SectionCard title={t("mypage_hub_recent_purchases")} actionHref="/mypage/trade/purchases">
          <PreviewStateBlock
            status={preview.status}
            emptyLabel={t("mypage_hub_empty_purchases")}
            errorLabel={t("mypage_hub_error_purchases")}
            onRetry={onReload}
            hasItems={preview.purchases.length > 0}
          >
            <div className="divide-y divide-sam-border">
              {preview.purchases.map((item) => (
                <Link
                  key={item.chatId}
                  href={`/mypage/purchases/${encodeURIComponent(item.chatId)}`}
                  className="block px-4 py-3 hover:bg-sam-primary-soft/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate sam-text-body font-semibold text-foreground">
                        {item.title || t("mypage_hub_product_fallback")}
                      </p>
                      <p className="mt-1 sam-text-helper text-[var(--text-muted)]">
                        {item.sellerNickname || t("mypage_hub_seller_fallback")} ·{" "}
                        {hubTradeFlowLabel(item.tradeFlowStatus, t)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="sam-text-body-secondary font-semibold text-foreground">
                        {formatMoneyPhp(item.price)}
                      </p>
                      <p className="mt-1 sam-text-xxs text-[var(--text-muted)]">
                        {hubFormatRelativeDate(item.lastMessageAt, language, t)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <InlineBadge tone="soft">
                      {item.hasBuyerReview ? t("mypage_hub_review_written") : t("mypage_hub_review_pending")}
                    </InlineBadge>
                  </div>
                </Link>
              ))}
            </div>
          </PreviewStateBlock>
        </SectionCard>

        <SectionCard title={t("mypage_hub_recent_sales")} actionHref="/mypage/trade/sales">
          <PreviewStateBlock
            status={preview.status}
            emptyLabel={t("mypage_hub_empty_sales")}
            errorLabel={t("mypage_hub_error_sales")}
            onRetry={onReload}
            hasItems={preview.sales.length > 0}
          >
            <div className="divide-y divide-sam-border">
              {preview.sales.map((item) => (
                <Link
                  key={`${item.chatId}:${item.postId}`}
                  href={item.noActiveChat ? `/post/${encodeURIComponent(item.postId)}` : "/mypage/trade/sales"}
                  className="block px-4 py-3 hover:bg-sam-primary-soft/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate sam-text-body font-semibold text-foreground">
                        {item.title || t("mypage_hub_product_fallback")}
                      </p>
                      <p className="mt-1 sam-text-helper text-[var(--text-muted)]">
                        {item.noActiveChat
                          ? t("mypage_hub_no_inquiry")
                          : t("mypage_hub_buyer_line", {
                              name: item.buyerNickname || t("mypage_hub_buyer_wait"),
                            })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="sam-text-body-secondary font-semibold text-foreground">
                        {formatMoneyPhp(item.price)}
                      </p>
                      <p className="mt-1 sam-text-xxs text-[var(--text-muted)]">
                        {hubFormatRelativeDate(item.lastMessageAt, language, t)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <InlineBadge tone="soft">{hubTradeFlowLabel(item.tradeFlowStatus, t)}</InlineBadge>
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
  const { t, language } = useI18n();
  return (
    <>
      <SectionCard title={t("mypage_hub_board_manage")}>
        <QuickActionGrid
          items={[
            { label: t("mypage_hub_my_activity"), href: "/mypage/community-posts" },
            { label: t("mypage_hub_comments_reactions"), href: "/mypage/community-activity" },
            { label: t("settings_hidden_users"), href: "/mypage/settings/hidden-users" },
            { label: t("settings_blocked_users"), href: "/mypage/settings/blocked-users" },
          ]}
        />
      </SectionCard>

      <SectionCard title={t("mypage_hub_recent_activity")} actionHref="/mypage/community-posts">
        <PreviewStateBlock
          status={preview.status}
          emptyLabel={t("mypage_hub_empty_activity")}
          errorLabel={t("mypage_hub_error_activity")}
          onRetry={onReload}
          hasItems={preview.posts.length > 0}
        >
          <div className="divide-y divide-sam-border">
            {preview.posts.map((post) => (
              <Link
                key={post.id}
                href={philifeAppPaths.post(post.id)}
                className="block px-4 py-3 hover:bg-sam-primary-soft/70"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate sam-text-body font-semibold text-foreground">{post.title}</p>
                    <p className="mt-1 sam-text-helper text-[var(--text-muted)]">
                      {resolveCommunityTopicUILabel(
                        language,
                        post.topic_name ?? "",
                        post.topic_name_en,
                        post.topic_slug
                      ) || t("mypage_hub_community_fallback")}{" "}
                      ·{" "}
                      {post.region_label || t("mypage_hub_no_region")}
                    </p>
                  </div>
                  <p className="shrink-0 sam-text-xxs text-[var(--text-muted)]">
                    {hubFormatRelativeDate(post.created_at, language, t)}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <InlineBadge tone="soft">
                    {t("mypage_hub_stat_comments", { count: post.comment_count })}
                  </InlineBadge>
                  <InlineBadge tone="soft">{t("mypage_hub_stat_likes", { count: post.like_count })}</InlineBadge>
                  <InlineBadge tone="soft">{t("mypage_hub_stat_views", { count: post.view_count })}</InlineBadge>
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
  const { t, language } = useI18n();
  return (
    <>
      <SectionCard title={t("mypage_hub_quick_manage")}>
        <QuickActionGrid
          items={[
            { label: t("mypage_hub_my_orders"), href: storeOrdersHref },
            hasOwnerStore
              ? { label: t("mypage_hub_owner_orders"), href: ownerOrdersHref, value: storeAttentionSummary ?? undefined }
              : { label: t("mypage_hub_store_apply"), href: businessApplyHref },
            {
              label: hasOwnerStore ? t("mypage_hub_store_ops") : t("mypage_hub_store_onboarding"),
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

      <SectionCard title={t("mypage_hub_recent_orders")} actionHref={storeOrdersHref}>
        <PreviewStateBlock
          status={preview.status}
          emptyLabel={t("mypage_hub_empty_orders")}
          errorLabel={t("mypage_hub_error_orders")}
          onRetry={onReload}
          hasItems={preview.orders.length > 0}
        >
          <div className="divide-y divide-sam-border">
            {preview.orders.map((order) => (
              <Link
                key={order.id}
                href={`/mypage/store-orders/${encodeURIComponent(order.id)}`}
                className="block px-4 py-3 hover:bg-sam-primary-soft/70"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate sam-text-body font-semibold text-foreground">
                      {order.store_name || t("mypage_hub_store_fallback")}
                    </p>
                    <p className="mt-1 sam-text-helper text-[var(--text-muted)]">
                      {hubStoreOrderStatusLabel(order.order_status, t)}
                      {order.order_chat_unread_count
                        ? t("mypage_hub_order_chat_unread", { count: order.order_chat_unread_count })
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="sam-text-body-secondary font-semibold text-foreground">
                      {formatMoneyPhp(order.payment_amount)}
                    </p>
                    <p className="mt-1 sam-text-xxs text-[var(--text-muted)]">
                      {hubFormatRelativeDate(order.created_at, language, t)}
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
  const { t } = useI18n();
  return (
    <>
      {alerts.length > 0 ? (
        <SectionCard title={t("mypage_hub_needs_attention")}>
          <div className="divide-y divide-sam-border">
            {alerts.map((item) => (
              <ActionRow
                key={item.label}
                href={item.href}
                label={item.label}
                value={t("mypage_hub_setup_required")}
              />
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title={t("mypage_hub_life_menu")}>
        <div className="divide-y divide-sam-border">
          <ActionRow href="/mypage/settings/notice" label={t("settings_notices")} />
          <ActionRow href="/mypage/benefits" label={t("mypage_hub_benefits")} />
          <ActionRow href="/mypage/recent-viewed" label={t("mypage_hub_recent_viewed")} />
          <ActionRow href="/mypage/customer-center" label={t("mypage_hub_support")} />
          <ActionRow label={t("mypage_hub_terms")} onClick={() => onOpenSheet("terms")} />
        </div>
      </SectionCard>

      <SectionCard title={t("mypage_hub_orders_interest")}>
        <div className="divide-y divide-sam-border">
          <ActionRow href={addressesHref} label={t("mypage_hub_addresses")} />
          <ActionRow href="/mypage/store-orders" label={t("mypage_hub_order_history")} />
          <ActionRow href="/mypage/order-notifications" label={t("mypage_hub_order_notifications")} />
          <ActionRow href={MYPAGE_TRADE_FAVORITES_HREF} label={t("mypage_hub_favorites_list")} />
          <ActionRow href="/mypage/points" label={t("mypage_hub_points")} />
        </div>
      </SectionCard>

      <SectionCard title={t("mypage_hub_env_settings")}>
        <div className="divide-y divide-sam-border">
          <ActionRow
            label={t("mypage_hub_notifications_settings")}
            value={
              notificationBadge
                ? t("mypage_hub_notifications_count", { count: notificationBadge })
                : t("mypage_hub_notifications_adjust")
            }
            onClick={() => onOpenSheet("notifications")}
          />
          <ActionRow label={t("mypage_language")} value={currentLanguage} onClick={() => onOpenSheet("language")} />
          <ActionRow label={t("settings_country")} value={currentCountry} onClick={() => onOpenSheet("country")} />
          <ActionRow label={t("settings_chat")} onClick={() => onOpenSheet("chat")} />
          <ActionRow label={t("mypage_hub_autoplay")} value={currentAutoplay} onClick={() => onOpenSheet("autoplay")} />
          <ActionRow label={t("settings_personalization")} onClick={() => onOpenSheet("personalization")} />
          <ActionRow label={t("mypage_hub_app_settings_all")} onClick={() => onOpenSheet("app")} />
          <ActionRow href="/mypage/settings/version" label={t("mypage_hub_current_version")} />
        </div>
      </SectionCard>

      <SectionCard title={t("mypage_hub_account_security")}>
        <div className="divide-y divide-sam-border">
          <ActionRow href={accountHref} label={t("mypage_hub_account_detail")} />
          <ActionRow href={editHref} label={t("mypage_hub_profile_edit")} />
          <ActionRow href="/mypage/settings/hidden-users" label={t("settings_hidden_users")} />
          <ActionRow href="/mypage/settings/blocked-users" label={t("settings_blocked_users")} />
          <ActionRow href="/mypage/settings/leave" label={t("mypage_hub_leave")} />
          <div className="px-0">
            <LogoutActionTrigger variant="menu_row" label={t("mypage_hub_logout")} surface="card" />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t("mypage_hub_partner")}>
        <div className="divide-y divide-sam-border">
          <ActionRow
            href={hasOwnerStore ? businessHubHref : businessApplyHref}
            label={hasOwnerStore ? t("mypage_hub_my_store_ops") : t("mypage_hub_register_store")}
            suppressNav={shouldInterceptMypageBusinessHref(
              hasOwnerStore ? businessHubHref : businessApplyHref,
              needsBizEntryModal
            )}
            onSuppressedNav={onBizBlocked}
          />
          <ActionRow
            href={hasOwnerStore ? "/stores/owner/orders" : "/stores/owner/apply"}
            label={hasOwnerStore ? t("mypage_hub_owner_order_manage") : t("mypage_hub_business_apply")}
          />
          {isAdmin ? <ActionRow href="/admin" label={t("mypage_hub_admin")} /> : null}
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
  const { t } = useI18n();
  return (
    <section className="overflow-hidden rounded-ui-rect border border-sam-border bg-background shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-sam-border px-4 py-3.5">
        <h2 className="sam-text-body font-semibold text-foreground">{title}</h2>
        {actionHref ? (
          <Link href={actionHref} className="sam-text-helper font-medium text-signature">
            {t("mypage_hub_view_all")}
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
  const { t } = useI18n();
  const cls =
    "flex min-h-[86px] flex-col justify-between rounded-ui-rect border border-sam-border bg-[var(--sub-bg)] px-3 py-3 text-left";
  if (item.href && item.suppressNav && item.onSuppressedNav) {
    return (
      <button type="button" onClick={item.onSuppressedNav} className={cls}>
        <span className="sam-text-body-secondary font-semibold text-foreground">{item.label}</span>
        <span className="sam-text-helper text-[var(--text-muted)]">{item.value ?? t("mypage_hub_open")}</span>
      </button>
    );
  }
  if (item.href) {
    return (
      <Link href={item.href} className={cls}>
        <span className="sam-text-body-secondary font-semibold text-foreground">{item.label}</span>
        <span className="sam-text-helper text-[var(--text-muted)]">{item.value ?? t("mypage_hub_open")}</span>
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
  const { t } = useI18n();
  if (status === "idle" || status === "loading") {
    return <div className="px-4 py-8 text-center sam-text-body-secondary text-[var(--text-muted)]">{t("common_loading")}</div>;
  }
  if (status === "error") {
    return (
      <div className="px-4 py-8 text-center sam-text-body-secondary text-[var(--text-muted)]">
        <p>{errorLabel}</p>
        <button type="button" onClick={onRetry} className="mt-3 sam-text-helper font-semibold text-signature">
          {t("common_retry")}
        </button>
      </div>
    );
  }
  if (!hasItems) {
    return <div className="px-4 py-8 text-center sam-text-body-secondary text-[var(--text-muted)]">{emptyLabel}</div>;
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
    "flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-sam-primary-soft/70";
  if (href && suppressNav && onSuppressedNav) {
    return (
      <button type="button" className={cls} onClick={onSuppressedNav}>
        <span className="sam-text-body font-medium text-foreground">{label}</span>
        <span className="flex items-center gap-2">
          {value ? <span className="sam-text-body-secondary text-[var(--text-muted)]">{value}</span> : null}
          <Chevron />
        </span>
      </button>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cls}>
        <span className="sam-text-body font-medium text-foreground">{label}</span>
        <span className="flex items-center gap-2">
          {value ? <span className="sam-text-body-secondary text-[var(--text-muted)]">{value}</span> : null}
          <Chevron />
        </span>
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      <span className="sam-text-body font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-2">
        {value ? <span className="sam-text-body-secondary text-[var(--text-muted)]">{value}</span> : null}
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
  const { t } = useI18n();
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
        <div className="flex items-center justify-between border-b border-sam-border px-4 py-3">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-sam-border" />
        </div>
        <div className="border-b border-sam-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="sam-text-body-lg font-semibold text-foreground">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-sam-border px-3 py-1 sam-text-helper font-medium text-[var(--text-muted)]"
            >
              {t("common_close")}
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
}

function SupportSheetContent() {
  const { t } = useI18n();
  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-ui-rect border border-sam-border bg-[var(--sub-bg)] px-4 py-4">
        <p className="sam-text-body font-semibold text-foreground">{t("mypage_hub_support_heading")}</p>
        <p className="mt-2 sam-text-body-secondary leading-6 text-[var(--text-muted)]">{t("mypage_hub_support_body")}</p>
      </div>
      <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-background">
        <div className="divide-y divide-sam-border">
          <InfoRow label={t("mypage_hub_support_ops")} value={t("mypage_hub_support_ops_value")} />
          <InfoRow label={t("mypage_hub_support_order")} value={t("mypage_hub_support_order_value")} />
          <InfoRow label={t("mypage_hub_support_store")} value={t("mypage_hub_support_store_value")} />
        </div>
      </div>
    </div>
  );
}

function TermsSheetContent() {
  const { t } = useI18n();
  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-ui-rect border border-sam-border bg-[var(--sub-bg)] px-4 py-4">
        <p className="sam-text-body font-semibold text-foreground">{t("mypage_hub_terms_heading")}</p>
        <p className="mt-2 sam-text-body-secondary leading-6 text-[var(--text-muted)]">{t("mypage_hub_terms_body")}</p>
      </div>
      <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-background">
        <div className="divide-y divide-sam-border">
          <InfoRow label={t("mypage_hub_terms_account")} value={t("mypage_hub_terms_account_value")} />
          <InfoRow label={t("mypage_hub_terms_trade")} value={t("mypage_hub_terms_trade_value")} />
          <InfoRow label={t("mypage_hub_terms_store")} value={t("mypage_hub_terms_store_value")} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3.5">
      <p className="sam-text-body font-medium text-foreground">{label}</p>
      <p className="mt-1 sam-text-body-secondary leading-6 text-[var(--text-muted)]">{value}</p>
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
    <div className="rounded-ui-rect border border-sam-border bg-[var(--sub-bg)] px-3 py-3">
      <p className="sam-text-xxs font-medium text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 sam-text-page-title font-semibold text-foreground">{value}</p>
      <p className="mt-1 sam-text-xxs text-[var(--text-muted)]">{detail}</p>
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
      className={`rounded-full px-2 py-0.5 sam-text-xxs font-medium ${
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
