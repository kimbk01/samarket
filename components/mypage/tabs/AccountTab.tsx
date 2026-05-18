"use client";

import { UserListContent } from "@/components/my/settings/UserListContent";
import { LogoutContent } from "@/components/my/settings/LogoutContent";
import { MyPageQuickActions } from "@/components/mypage/MyPageQuickActions";
import { MyPageSectionHeader } from "@/components/mypage/MyPageSectionHeader";
import type { MyPageConsoleProps } from "@/components/mypage/types";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import {
  MYPAGE_PROFILE_EDIT_HREF,
  buildMypageItemHref,
} from "@/lib/mypage/mypage-mobile-nav-registry";
import { hasFormalMemberContactVerification } from "@/lib/auth/member-access";
import { formatAtUsername, resolveDisplayName } from "@/lib/users/user-label";
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
  const contactFormal = hasFormalMemberContactVerification({
    phone_verified: profile.phone_verified || Boolean(profile.phone_verified_at),
    auth_provider: profile.provider ?? profile.auth_provider,
    email: profile.email,
  });

  if (section === "profile") {
    return (
      <div className="space-y-4">
        <MyPageSectionHeader description={t("mypage_comp_nav_sec_account_profile_desc")} />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <div className="space-y-2">
            <p className="sam-text-body font-semibold text-sam-fg">
              {resolveDisplayName(profile) || t("mypage_comp_display_name_empty")}
            </p>
            <p className="font-mono sam-text-xxs text-sam-muted tabular-nums">
              {formatAtUsername((profile as { username?: string | null }).username)}
            </p>
            <p className="sam-text-helper text-sam-muted">{profile.email ?? t("mypage_comp_account_email_missing_detail")}</p>
            <p className="sam-text-helper text-sam-muted">
              {t("mypage_comp_account_contact_line", {
                phone: profile.phone?.trim() || t("mypage_comp_account_phone_unregistered"),
                status: contactFormal ? t("my_phone_status_verified") : t("my_phone_status_unverified"),
              })}
            </p>
            <div className="pt-1">
              <MannerBatteryDisplay raw={mannerScore} size="sm" layout="inline" className="gap-1.5" />
            </div>
          </div>
        </div>
        <MyPageQuickActions
          items={[
            { label: t("mypage_comp_profile_edit"), href: MYPAGE_PROFILE_EDIT_HREF, caption: t("mypage_comp_account_profile_edit_caption") },
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
            { label: t("mypage_comp_profile_edit"), href: MYPAGE_PROFILE_EDIT_HREF, caption: t("mypage_comp_account_profile_edit_basic_caption") },
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

  if (section === "favorite-users") {
    return (
      <div className="space-y-4">
        <MyPageSectionHeader description={t("mypage_comp_nav_sec_account_favorite_users_desc")} />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <UserListContent type="favorite" emptyMessage={t("mypage_comp_settings_users_empty_favorite")} />
        </div>
      </div>
    );
  }

  if (section === "blocked-users") {
    return (
      <div className="space-y-4">
        <MyPageSectionHeader description={t("mypage_comp_nav_sec_account_blocked_users_desc")} />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <UserListContent type="blocked" emptyMessage={t("mypage_comp_settings_users_empty_blocked")} />
        </div>
      </div>
    );
  }

  if (section === "hidden-users") {
    return (
      <div className="space-y-4">
        <MyPageSectionHeader description={t("mypage_comp_nav_sec_account_hidden_users_desc")} />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <UserListContent type="hidden" emptyMessage={t("mypage_comp_settings_users_empty_hidden")} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MyPageSectionHeader description={t("mypage_comp_nav_sec_account_home_desc")} />
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="space-y-2">
          <p className="sam-text-body font-bold text-sam-fg">
            {resolveDisplayName(profile) || t("mypage_comp_display_name_empty")}
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
              status: contactFormal ? t("my_phone_status_verified") : t("my_phone_status_unverified"),
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
          label={t("mypage_comp_stat_active_trade")}
          value={String(
            (overviewCounts.purchases ?? 0) + (overviewCounts.sales ?? 0),
          )}
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
