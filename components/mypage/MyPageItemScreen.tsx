"use client";

import Link from "next/link";
import { AddressManagementClient } from "@/components/addresses/AddressManagementClient";
import { BulkRegionChangeContent } from "@/components/my/settings/BulkRegionChangeContent";
import { CacheSettingsContent } from "@/components/my/settings/CacheSettingsContent";
import { ChatSettingsContent } from "@/components/my/settings/ChatSettingsContent";
import { CountrySettingsContent } from "@/components/my/settings/CountrySettingsContent";
import { LanguageSettingsContent } from "@/components/my/settings/LanguageSettingsContent";
import { LeaveContent } from "@/components/my/settings/LeaveContent";
import { LogoutContent } from "@/components/my/settings/LogoutContent";
import { NoticesContent } from "@/components/my/settings/NoticesContent";
import { NotificationsSettingsContent } from "@/components/my/settings/NotificationsSettingsContent";
import { PersonalizationContent } from "@/components/my/settings/PersonalizationContent";
import { UserListContent } from "@/components/my/settings/UserListContent";
import { VersionContent } from "@/components/my/settings/VersionContent";
import { VideoAutoplayContent } from "@/components/my/settings/VideoAutoplayContent";
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
    const storeIds = new Set(["orders", "order-chat", "payment", "address", "manage", "rider"]);
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
            <UserListContent type="favorite" emptyMessage="모아보는 사용자가 없습니다." />
          </div>
        </div>
      );
    }
    if (item === "chat-alerts") {
      return (
        <div className="space-y-8 divide-y divide-sam-border-soft">
          <div className="space-y-3 pt-1">
            <p className="text-[14px] font-semibold text-sam-fg">채팅 설정</p>
            <ChatSettingsContent />
          </div>
          <div className="space-y-3 pt-6">
            <p className="text-[14px] font-semibold text-sam-fg">알림 설정</p>
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
            className="flex min-h-[52px] items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-[14px] font-medium text-sam-fg"
          >
            동네 설정 열기
            <span className="text-sam-meta">›</span>
          </Link>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="mb-3 text-[14px] font-semibold text-sam-fg">판매 글 동네 일괄 변경</p>
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
      return (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="text-[14px] text-sam-fg">진행 중인 이벤트와 혜택을 확인하세요.</p>
          <Link
            href="/my/benefits"
            className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-ui-rect bg-sam-ink px-4 text-[14px] font-medium text-white"
          >
            이벤트 · 혜택 보기
          </Link>
        </div>
      );
    }
    if (item === "support") {
      return (
        <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-[14px] leading-6 text-sam-fg">
          <p>주문 문제는 주문 내역과 주문 상세에서 먼저 확인해 주세요.</p>
          <p>거래 문제는 거래 채팅과 거래 후기 화면에서 먼저 확인해 주세요.</p>
          <p className="text-[12px] text-sam-muted">추가 문의가 필요하면 앱 내 공지·안내를 참고해 주세요.</p>
        </div>
      );
    }
    if (item === "terms") {
      return (
        <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-[14px] leading-6 text-sam-fg">
          <p>서비스 이용 약관·운영 정책은 회원가입 시 동의한 내용을 따릅니다.</p>
          <Link href="/signup" className="text-[14px] font-medium text-sam-fg underline">
            회원가입 화면에서 약관 다시 보기
          </Link>
        </div>
      );
    }
    if (item === "version") {
      return <VersionContent />;
    }
    if (item === "logout") {
      return <LogoutContent />;
    }
    if (item === "leave") {
      return <LeaveContent />;
    }
  }

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-10 text-center text-[14px] text-sam-muted">
      이 화면을 불러올 수 없습니다.
      <div className="mt-4">
        <Link href={buildMypageSectionHref("settings")} className="text-[14px] font-medium text-sam-fg underline">
          설정으로
        </Link>
      </div>
    </div>
  );
}

function MannerTrustEmbed() {
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
            <div className="flex h-12 w-12 items-center justify-center rounded-ui-rect bg-sam-surface-muted text-[12px] text-sam-meta">
              —
            </div>
          )}
          <div>
            <p className="text-[12px] text-sam-muted">배터리 매너</p>
            <p
              className={`text-[18px] font-bold tabular-nums ${
                mannerTier ? mannerBatteryAccentClass(mannerTier) : "text-sam-meta"
              }`}
            >
              {mannerPercent != null ? `${mannerPercent}%` : "—"}
            </p>
          </div>
        </div>
        <Link
          href="/my/trust"
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-ui-rect border border-sam-border px-4 text-[14px] font-medium text-sam-fg"
        >
          상세 보기
        </Link>
      </div>
    </div>
  );
}
