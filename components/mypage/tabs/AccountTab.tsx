"use client";

import { UserListContent } from "@/components/my/settings/UserListContent";
import { LogoutContent } from "@/components/my/settings/LogoutContent";
import { MyPageQuickActions } from "@/components/mypage/MyPageQuickActions";
import { MyPageSectionHeader } from "@/components/mypage/MyPageSectionHeader";
import type { MyPageConsoleProps } from "@/components/mypage/types";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import { buildMypageItemHref } from "@/lib/mypage/mypage-mobile-nav-registry";
import { MYPAGE_PROFILE_EDIT_SHEET_HREF } from "@/lib/mypage/mypage-profile-routes";
import type { MessageKey } from "@/lib/i18n/messages";
import { isProfileContactVerified } from "@/lib/profile/profile-contact-verification-ui";
import { formatProfilePhoneForDisplay } from "@/lib/profile/admin-phone-verification-sync";
import { formatAtUsername } from "@/lib/users/user-label";
import { resolveMypageSelfDisplayName } from "@/lib/mypage/mypage-self-display-name";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = Pick<
  MyPageConsoleProps,
  | "profile"
  | "mannerScore"
  | "favoriteBadge"
  | "notificationBadge"
  | "overviewCounts"
  | "storeAttentionSummary"
>;

export function AccountTab({
  section,
  profile,
  mannerScore,
  favoriteBadge,
  notificationBadge,
  overviewCounts,
  storeAttentionSummary,
}: Props & { section: string }) {
  const { t } = useI18n();
  const contactVerified = isProfileContactVerified({
    role: profile.role ?? null,
    phone_verified: profile.phone_verified,
    phone_verified_at: profile.phone_verified_at ?? null,
    provider: profile.provider ?? profile.auth_provider ?? null,
    auth_provider: profile.auth_provider ?? profile.provider ?? null,
    email: profile.auth_login_email ?? profile.email ?? null,
    auth_login_email: profile.auth_login_email ?? profile.email ?? null,
  });
  const displayPhone =
    formatProfilePhoneForDisplay({
      phone: profile.phone ?? null,
      phone_country_code: profile.phone_country_code ?? null,
      phone_number: profile.phone_number ?? null,
    }) || profile.phone?.trim() || t("mypage_comp_account_phone_unregistered");

  if (section === "profile") {
    return (
      <div className="space-y-4">
        <MyPageSectionHeader description={t("mypage_comp_nav_sec_account_profile_desc")} />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <div className="space-y-2">
            <p className="sam-text-body font-semibold text-sam-fg">
              {resolveMypageSelfDisplayName(profile) || t("mypage_comp_display_name_empty")}
            </p>
            <p className="font-mono sam-text-xxs text-sam-muted tabular-nums">
              {formatAtUsername((profile as { username?: string | null }).username)}
            </p>
            <p className="sam-text-helper text-sam-muted">{profile.email ?? t("mypage_comp_account_email_missing_detail")}</p>
            <p className="sam-text-helper text-sam-muted">
              {t("mypage_comp_account_contact_line", {
                phone: displayPhone,
                status: contactVerified ? t("my_phone_status_verified") : t("my_phone_status_unverified"),
              })}
            </p>
            <div className="pt-1">
              <MannerBatteryDisplay raw={mannerScore} size="sm" layout="inline" className="gap-1.5" />
            </div>
          </div>
        </div>
        <MyPageQuickActions
          items={[
            { label: t("mypage_comp_profile_edit"), href: MYPAGE_PROFILE_EDIT_SHEET_HREF, caption: t("mypage_comp_account_profile_edit_caption") },
            {
              label: t("mypage_comp_nav_sec_community_posts_label"),
              href: "/mypage/community-posts",
              caption: t("mypage_comp_account_profile_posts_hint"),
            },
            { label: t("mypage_comp_nav_sec_account_basic_label"), href: "/mypage/account", caption: t("mypage_comp_account_basic_caption") },
            {
              label: t("mypage_comp_nav_sec_settings_address_label"),
              href: buildMypageItemHref("settings", "address"),
              caption: t("mypage_comp_nav_sec_settings_address_desc"),
            },
          ]}
        />
      </div>
    );
  }

  if (section === "basic") {
    return (
      <div className="space-y-4">
        <MyPageSectionHeader description={t("mypage_comp_nav_sec_account_basic_desc")} />
        <MyPageQuickActions
          items={[
            { label: t("mypage_comp_nav_sec_account_basic_label"), href: "/mypage/account", caption: t("mypage_comp_account_detail_caption") },
            { label: t("mypage_comp_profile_edit"), href: MYPAGE_PROFILE_EDIT_SHEET_HREF, caption: t("mypage_comp_account_profile_edit_basic_caption") },
            {
              label: t("mypage_comp_account_withdraw"),
              href: buildMypageItemHref("settings", "leave"),
              caption: t("mypage_comp_account_withdraw_caption"),
            },
          ]}
        />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="mb-3 sam-text-helper text-sam-muted">{t("mypage_comp_account_logout_hint")}</p>
          <LogoutContent />
        </div>
      </div>
    );
  }

  if (section === "favorite-users" || section === "blocked-users" || section === "hidden-users") {
    return <AccountUserListSection kind={section} />;
  }

  return (
    <div className="space-y-4">
      <MyPageSectionHeader description={t("mypage_comp_nav_sec_account_home_desc")} />
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="space-y-2">
          <p className="sam-text-body font-bold text-sam-fg">
            {resolveMypageSelfDisplayName(profile) || t("mypage_comp_display_name_empty")}
          </p>
          <p className="font-mono sam-text-xxs text-sam-muted tabular-nums">
            {formatAtUsername((profile as { username?: string | null }).username)}
          </p>
          <p className="sam-text-helper text-sam-muted">
            {profile.email ?? t("mypage_comp_account_email_missing")}
          </p>
          <p className="sam-text-helper text-sam-muted">
            {t("mypage_comp_account_contact_line", {
              phone: profile.phone?.trim() || t("mypage_comp_account_phone_unregistered"),
              status: contactVerified ? t("my_phone_status_verified") : t("my_phone_status_unverified"),
            })}
          </p>
          <div className="pt-1">
            <MannerBatteryDisplay
              raw={mannerScore}
              size="sm"
              layout="inline"
              className="gap-1.5"
            />
          </div>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryBox
          label={t("mypage_comp_trade_nav_sales")}
          value={String(overviewCounts.sales ?? 0)}
        />
        <SummaryBox label={t("mypage_comp_account_unread_alerts")} value={notificationBadge ?? "0"} />
        <SummaryBox
          label={t("mypage_comp_account_recent_order_status")}
          value={storeAttentionSummary ?? t("mypage_comp_account_check")}
        />
        <SummaryBox label={t("mypage_comp_account_favorite_users")} value={favoriteBadge ?? "0"} />
      </div>
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5">
      <p className="sam-text-helper text-sam-muted">{label}</p>
      <p className="mt-1 sam-text-body font-semibold tabular-nums text-sam-fg">{value}</p>
    </div>
  );
}

type AccountUserListKind = "favorite-users" | "blocked-users" | "hidden-users";

const USER_LIST_META: Record<
  AccountUserListKind,
  { type: "favorite" | "blocked" | "hidden"; descKey: MessageKey; emptyKey: MessageKey }
> = {
  "favorite-users": {
    type: "favorite",
    descKey: "mypage_comp_nav_sec_account_favorite_users_desc",
    emptyKey: "mypage_comp_settings_users_empty_favorite",
  },
  "blocked-users": {
    type: "blocked",
    descKey: "mypage_comp_nav_sec_account_blocked_users_desc",
    emptyKey: "mypage_comp_settings_users_empty_blocked",
  },
  "hidden-users": {
    type: "hidden",
    descKey: "mypage_comp_nav_sec_account_hidden_users_desc",
    emptyKey: "mypage_comp_settings_users_empty_hidden",
  },
};

/**
 * 관심·차단·숨김 사용자 (최종 설계 S14) — 설명 한 줄 → 사용자 행. hub 데이터 대기 없음.
 * 카드 테두리 박스 없이 `UserListContent` 가 행 그룹을 그린다.
 */
export function AccountUserListSection({ kind }: { kind: AccountUserListKind }) {
  const { t } = useI18n();
  const meta = USER_LIST_META[kind];
  return (
    <div className="space-y-3">
      <MyPageSectionHeader description={t(meta.descKey)} />
      <UserListContent type={meta.type} emptyMessage={t(meta.emptyKey)} />
    </div>
  );
}
