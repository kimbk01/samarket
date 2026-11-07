"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BulkRegionChangeContent } from "@/components/my/settings/BulkRegionChangeContent";
import { CacheSettingsContent } from "@/components/my/settings/CacheSettingsContent";
import { PcLoginScanContent } from "@/components/my/settings/PcLoginScanContent";
import { ChatSettingsContent } from "@/components/my/settings/ChatSettingsContent";
import { CountrySettingsContent } from "@/components/my/settings/CountrySettingsContent";
import { LanguageSettingsContent } from "@/components/my/settings/LanguageSettingsContent";
import { LeaveContent } from "@/components/my/settings/LeaveContent";
import { NoticesContent } from "@/components/my/settings/NoticesContent";
import { NotificationsSettingsContent } from "@/components/my/settings/NotificationsSettingsContent";
import { PersonalizationContent } from "@/components/my/settings/PersonalizationContent";
import { VersionContent } from "@/components/my/settings/VersionContent";
import { VideoAutoplayContent } from "@/components/my/settings/VideoAutoplayContent";
import { DevicePermissionsSettingsContent } from "@/components/my/settings/DevicePermissionsSettingsContent";
import { MyPolicyHub } from "@/components/mypage/settings/MyPolicyHub";
import { MyConsentHistory } from "@/components/mypage/settings/MyConsentHistory";
import { AccountUserListSection } from "@/components/mypage/tabs/AccountTab";
import { CommunityTab } from "@/components/mypage/tabs/CommunityTab";
import { StoreTab } from "@/components/mypage/tabs/StoreTab";
import type { MyPageConsoleProps } from "@/components/mypage/types";
import { buildMypageSectionHref } from "@/lib/mypage/mypage-mobile-nav-registry";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";

/**
 * hub 데이터 없이 바로 그리는 섹션 화면 본문 (최종 설계 Part B 공통 전제 — S10~S19 hub 대기 0).
 * 해당 없으면 null. `MyPageItemScreen` 도 같은 매핑을 쓴다(분기 1곳).
 */
export function MyPageItemStaticContent({ section, item }: { section: string; item: string }) {
  if (section === "account") {
    if (item === "favorite-users") return <AccountUserListSection kind="favorite-users" />;
    if (item === "blocked-users") return <AccountUserListSection kind="blocked-users" />;
    if (item === "hidden-users") return <AccountUserListSection kind="hidden-users" />;
    return null;
  }
  if (section !== "settings") return null;
  switch (item) {
    case "device-permissions":
      return <DevicePermissionsSettingsContent />;
    case "language":
      return <LanguageSettingsContent />;
    case "country":
      return <CountrySettingsContent />;
    case "chat-settings":
      return <ChatSettingsContent />;
    case "notifications":
      return <NotificationsSettingsContent />;
    case "personalization":
      return <PersonalizationContent />;
    case "video-autoplay":
      return <VideoAutoplayContent />;
    case "cache":
      return <CacheSettingsContent />;
    /** PC QR 로그인 — 휴대폰 앱에서 PC 화면 QR 스캔·허용 (Owner 2026-11-08) */
    case "pc-login":
      return <PcLoginScanContent />;
    case "version":
      return <VersionContent />;
    case "leave":
      return <LeaveContent />;
    /** 비로그인 공개 행 — 약관 허브는 회원 데이터 없이 열린다 (`isMypageGuestPublicItem`) */
    case "terms":
      return <MyPolicyHub />;
    case "consent-history":
      return <MyConsentHistory />;
    default:
      return null;
  }
}

/**
 * 회원 데이터가 필요한 섹션 항목 (도달 가능한 것만 — 2026-11-02 정리).
 * 그 외 항목은 서버 리다이렉트(`mypage-section-legacy-redirect`) 또는 `MyPageItemStaticContent` 가 먼저 처리한다.
 */
export function MyPageItemScreen(
  props: MyPageConsoleProps & { section: string; item: string },
) {
  const { t } = useI18n();
  const router = useRouter();
  const { section, item, ...hub } = props;

  const staticContent = MyPageItemStaticContent({ section, item });
  if (staticContent) return staticContent;

  if (section === "community") {
    const communitySection =
      item === "favorite-posts"
        ? "favorites"
        : item === "liked-posts"
          ? "liked"
          : item === "community-friends"
            ? "users"
            : item === "reports"
              ? "reports"
              : null;
    if (communitySection) return <CommunityTab section={communitySection} />;
  }

  if (section === "store" && (item === "payment" || item === "rider")) {
    return (
      <StoreTab
        section={item}
        hasOwnerStore={hub.hasOwnerStore}
        ownerHubStoreId={hub.ownerHubStoreId}
        storeAttentionSummary={hub.storeAttentionSummary}
      />
    );
  }

  if (section === "settings" && item === "region") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => router.push("/mypage/addresses")}
          className="flex min-h-[52px] items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 sam-text-body font-medium text-sam-fg"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <AddressKindHeadPin kind="master" className="h-5 w-5 shrink-0 [&_svg]:h-5 [&_svg]:w-[1rem]" />
            <span>{t("mypage_comp_region_settings_open")}</span>
          </span>
          <span className="text-sam-meta">›</span>
        </button>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="mb-3 sam-text-body font-semibold text-sam-fg">{t("mypage_comp_bulk_region_change_title")}</p>
          <BulkRegionChangeContent />
        </div>
      </div>
    );
  }

  if (section === "settings" && item === "notices") {
    return <NoticesContent />;
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
