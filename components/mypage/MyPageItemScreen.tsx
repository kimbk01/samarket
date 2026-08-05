"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressManagementClient } from "@/components/addresses/AddressManagementClient";
import { BulkRegionChangeContent } from "@/components/my/settings/BulkRegionChangeContent";
import { CacheSettingsContent } from "@/components/my/settings/CacheSettingsContent";
import { ChatSettingsContent } from "@/components/my/settings/ChatSettingsContent";
import { CountrySettingsContent } from "@/components/my/settings/CountrySettingsContent";
import { LanguageSettingsContent } from "@/components/my/settings/LanguageSettingsContent";
import { LeaveContent } from "@/components/my/settings/LeaveContent";
import { NoticesContent } from "@/components/my/settings/NoticesContent";
import { NotificationsSettingsContent } from "@/components/my/settings/NotificationsSettingsContent";
import { PersonalizationContent } from "@/components/my/settings/PersonalizationContent";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
import { UserListContent } from "@/components/my/settings/UserListContent";
import { VersionContent } from "@/components/my/settings/VersionContent";
import { VideoAutoplayContent } from "@/components/my/settings/VideoAutoplayContent";
import { DevicePermissionsSettingsContent } from "@/components/my/settings/DevicePermissionsSettingsContent";
import { AccountTab } from "@/components/mypage/tabs/AccountTab";
import { CommunityTab } from "@/components/mypage/tabs/CommunityTab";
import { MessengerTab } from "@/components/mypage/tabs/MessengerTab";
import { StoreTab } from "@/components/mypage/tabs/StoreTab";
import { TradeTab } from "@/components/mypage/tabs/TradeTab";
import type { MyPageConsoleProps } from "@/components/mypage/types";
import { buildMypageSectionHref } from "@/lib/mypage/mypage-mobile-nav-registry";
import { MannerBatteryIcon } from "@/components/trust/MannerBatteryIcon";
import { mannerBatteryAccentClass, mannerBatteryTier, mannerRawToPercent } from "@/lib/trust/manner-battery";
import { getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";

export function MyPageItemScreen(
  props: MyPageConsoleProps & { section: string; item: string },
) {
  const { t } = useI18n();
  const { section, item, ...hub } = props;

  if (section === "account") {
    if (item === "profile") {
      return <AccountTab section="profile" {...hub} />;
    }
    if (item === "account-info") {
      return <AccountTab section="basic" {...hub} />;
    }
    if (item === "favorite-users") {
      return <AccountTab section="favorite-users" {...hub} />;
    }
    if (item === "blocked-users") {
      return <AccountTab section="blocked-users" {...hub} />;
    }
    if (item === "hidden-users") {
      return <AccountTab section="hidden-users" {...hub} />;
    }
  }

  if (section === "trade") {
    const tradeIds = new Set(["sales", "purchases", "favorites", "recent", "reviews"]);
    const tradeSection = item === "trade-chat" ? "chat" : tradeIds.has(item) ? item : "sales";
    return <TradeTab section={tradeSection} />;
  }

  if (section === "community") {
    const communitySection =
      item === "favorite-posts"
        ? "favorites"
        : item === "community-friends"
          ? "users"
          : item === "posts" || item === "comments" || item === "reports"
            ? item
            : "posts";
    return <CommunityTab section={communitySection} />;
  }

  if (section === "store") {
    const storeIds = new Set(["orders", "order-chat", "payment", "address", "rider"]);
    const storeSection = storeIds.has(item) ? item : "orders";
    return (
      <StoreTab
        section={storeSection}
        hasOwnerStore={hub.hasOwnerStore}
        ownerHubStoreId={hub.ownerHubStoreId}
        storeAttentionSummary={hub.storeAttentionSummary}
      />
    );
  }

  if (section === "messenger") {
    if (item === "friends") {
      return (
        <div className="space-y-3">
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <UserListContent type="favorite" emptyMessage={t("mypage_comp_friends_empty")} />
          </div>
        </div>
      );
    }
    if (item === "chat-alerts") {
      return (
        <div className="space-y-8 divide-y divide-sam-border-soft">
          <div className="space-y-3 pt-1">
            <p className="sam-text-body font-semibold text-sam-fg">{t("mypage_comp_chat_settings")}</p>
            <ChatSettingsContent />
          </div>
          <div className="space-y-3 pt-6">
            <p className="sam-text-body font-semibold text-sam-fg">{t("mypage_comp_notifications_settings_title")}</p>
            <NotificationsSettingsContent />
          </div>
        </div>
      );
    }
    const messengerSection = item === "groups" || item === "dm" ? item : "dm";
    return <MessengerTab section={messengerSection} />;
  }

  if (section === "settings") {
    if (item === "address") {
      return <AddressManagementClient embedded />;
    }
    if (item === "device-permissions") {
      return <DevicePermissionsSettingsContent />;
    }
    if (item === "language") {
      return <LanguageSettingsContent />;
    }
    if (item === "country") {
      return <CountrySettingsContent />;
    }
    if (item === "region") {
      return (
        <div className="space-y-4">
          <Link
            href="/my/regions"
            className="flex min-h-[52px] items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 sam-text-body font-medium text-sam-fg"
          >
            {t("mypage_comp_region_settings_open")}
            <span className="text-sam-meta">›</span>
          </Link>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="mb-3 sam-text-body font-semibold text-sam-fg">{t("mypage_comp_bulk_region_change_title")}</p>
            <BulkRegionChangeContent />
          </div>
        </div>
      );
    }
    if (item === "manner") {
      return <MannerTrustEmbed />;
    }
    if (item === "chat-settings") {
      return <ChatSettingsContent />;
    }
    if (item === "notifications") {
      return <NotificationsSettingsContent />;
    }
    if (item === "personalization") {
      return <PersonalizationContent />;
    }
    if (item === "video-autoplay") {
      return <VideoAutoplayContent />;
    }
    if (item === "cache") {
      return <CacheSettingsContent />;
    }
    if (item === "notices") {
      return <NoticesContent />;
    }
    if (item === "events") {
      /** Phase 7 REMOVE예정 — Event product ABSENT; legacy stub deep-link → benefits */
      return <LegacyEventsStubRedirect />;
    }
    if (item === "support") {
      /** Legacy stub deep-link → App Customer Center full-page hub */
      return <LegacySupportStubRedirect />;
    }
    if (item === "terms") {
      return (
        <div className="mx-auto w-full min-w-0 max-w-[40rem] md:max-w-[48rem] space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:p-6 sam-text-body leading-relaxed text-sam-fg">
          <p className="break-words">{t("mypage_comp_settings_terms_p1")}</p>
          <Link
            href="/terms"
            className="inline-flex min-h-11 items-center sam-text-body font-medium text-signature underline"
          >
            {t("mypage_comp_settings_terms_link")}
          </Link>
        </div>
      );
    }
    if (item === "version") {
      return <VersionContent />;
    }
    if (item === "logout") {
      return (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="mb-3 sam-text-helper text-sam-muted">{t("mypage_comp_logout_hint")}</p>
          <LogoutActionTrigger autoOpen />
        </div>
      );
    }
    if (item === "leave") {
      return <LeaveContent />;
    }
  }

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-10 text-center sam-text-body text-sam-muted">
      {t("mypage_comp_screen_load_error")}
      <div className="mt-4">
        <Link href={buildMypageSectionHref("settings")} className="sam-text-body font-medium text-sam-fg underline">
          {t("mypage_comp_go_to_settings")}
        </Link>
      </div>
    </div>
  );
}

function MannerTrustEmbed() {
  const { t } = useI18n();
  const temp = getHydrationSafeCurrentUser()?.temperature ?? null;
  const mannerPercent = temp != null ? mannerRawToPercent(temp) : null;
  const mannerTier = mannerPercent != null ? mannerBatteryTier(mannerPercent) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex items-center gap-3">
          {mannerPercent != null && mannerTier != null ? (
            <MannerBatteryIcon tier={mannerTier} percent={mannerPercent} size="lg" className="shrink-0" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-ui-rect bg-sam-surface-muted sam-text-helper text-sam-meta">
              —
            </div>
          )}
          <div>
            <p className="sam-text-helper text-sam-muted">{t("mypage_comp_manner_battery_label")}</p>
            <p
              className={`sam-text-page-title font-bold tabular-nums ${
                mannerTier ? mannerBatteryAccentClass(mannerTier) : "text-sam-meta"
              }`}
            >
              {mannerPercent != null ? `${mannerPercent}%` : "—"}
            </p>
          </div>
        </div>
        <Link
          href="/mypage/trust"
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-ui-rect border border-sam-border px-4 sam-text-body font-medium text-sam-fg"
        >
          {t("mypage_comp_manner_detail_link")}
        </Link>
      </div>
    </div>
  );
}

/** Phase 7 — REMOVE예정 Settings events→benefits stub; keep deep-link safe. */
function LegacyEventsStubRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/mypage/benefits");
  }, [router]);
  return null;
}

function LegacySupportStubRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/mypage/customer-center");
  }, [router]);
  return null;
}
