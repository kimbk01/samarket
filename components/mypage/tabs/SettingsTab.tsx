"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BulkRegionChangeContent } from "@/components/my/settings/BulkRegionChangeContent";
import { CacheSettingsContent } from "@/components/my/settings/CacheSettingsContent";
import { ChatSettingsContent } from "@/components/my/settings/ChatSettingsContent";
import { CountrySettingsContent } from "@/components/my/settings/CountrySettingsContent";
import { LanguageSettingsContent } from "@/components/my/settings/LanguageSettingsContent";
import { LeaveContent } from "@/components/my/settings/LeaveContent";
import { NoticesContent } from "@/components/my/settings/NoticesContent";
import { NotificationsSettingsContent } from "@/components/my/settings/NotificationsSettingsContent";
import { PersonalizationContent } from "@/components/my/settings/PersonalizationContent";
import { LogoutContent } from "@/components/my/settings/LogoutContent";
import { UserListContent } from "@/components/my/settings/UserListContent";
import { VersionContent } from "@/components/my/settings/VersionContent";
import { VideoAutoplayContent } from "@/components/my/settings/VideoAutoplayContent";
import { DevicePermissionsSettingsContent } from "@/components/my/settings/DevicePermissionsSettingsContent";
import { MyPageMobileFold } from "@/components/mypage/MyPageMobileFold";
import { MyPageSectionHeader } from "@/components/mypage/MyPageSectionHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";

export function SettingsTab({ section }: { section: string }) {
  const { t } = useI18n();
  const router = useRouter();
  if (section === "address") {
    return (
      <TabShell
        title={t("mypage_comp_nav_sec_settings_address_label")}
        description={t("mypage_comp_nav_sec_settings_address_desc")}
      >
        <AddressBookLink label={t("mypage_comp_nav_sec_settings_address_label")} onOpen={() => router.push("/mypage/addresses")} />
      </TabShell>
    );
  }

  if (section === "device-permissions") {
    return (
      <TabShell
        title={t("mypage_comp_nav_sec_settings_device_permissions_label")}
        description={t("mypage_comp_nav_sec_settings_device_permissions_desc")}
      >
        <DevicePermissionsSettingsContent />
      </TabShell>
    );
  }

  if (section === "service") {
    return (
      <TabShell
        title={t("mypage_comp_nav_sec_settings_service_label")}
        description={t("mypage_comp_nav_sec_settings_service_desc")}
      >
        <SettingsBlock title={t("mypage_comp_chat_settings")}>
          <ChatSettingsContent />
        </SettingsBlock>
        <SettingsBlock title={t("mypage_comp_notifications_settings_title")}>
          <NotificationsSettingsContent />
        </SettingsBlock>
        <SettingsBlock title={t("mypage_comp_settings_block_video_autoplay")}>
          <VideoAutoplayContent />
        </SettingsBlock>
        <SettingsBlock title={t("mypage_comp_settings_block_personalization")}>
          <PersonalizationContent />
        </SettingsBlock>
      </TabShell>
    );
  }

  if (section === "users") {
    return (
      <TabShell
        title={t("mypage_comp_nav_sec_settings_users_label")}
        description={t("mypage_comp_nav_sec_settings_users_desc")}
      >
        <SettingsBlock title={t("mypage_comp_settings_block_favorite_users")}>
          <UserListContent type="favorite" emptyMessage={t("mypage_comp_settings_users_empty_favorite")} />
        </SettingsBlock>
        <SettingsBlock title={t("mypage_comp_settings_block_blocked_users")}>
          <UserListContent type="blocked" emptyMessage={t("mypage_comp_settings_users_empty_blocked")} />
        </SettingsBlock>
        <SettingsBlock title={t("mypage_comp_settings_block_hidden_users")}>
          <UserListContent type="hidden" emptyMessage={t("mypage_comp_settings_users_empty_hidden")} />
        </SettingsBlock>
      </TabShell>
    );
  }

  if (section === "region-language") {
    return (
      <TabShell
        title={t("mypage_comp_nav_sec_settings_region_language_label")}
        description={t("mypage_comp_nav_sec_settings_region_language_desc")}
      >
        <SettingsBlock title={t("mypage_comp_settings_block_language")}>
          <LanguageSettingsContent />
        </SettingsBlock>
        <SettingsBlock title={t("mypage_comp_settings_block_country")}>
          <CountrySettingsContent />
        </SettingsBlock>
        <SettingsBlock title={t("mypage_comp_settings_block_bulk_region")}>
          <BulkRegionChangeContent />
        </SettingsBlock>
      </TabShell>
    );
  }

  if (section === "system") {
    return (
      <TabShell
        title={t("mypage_comp_nav_sec_settings_system_label")}
        description={t("mypage_comp_nav_sec_settings_system_desc")}
      >
        <SettingsBlock title={t("mypage_comp_settings_block_cache")}>
          <CacheSettingsContent />
        </SettingsBlock>
        <SettingsBlock title={t("mypage_comp_settings_block_version")}>
          <VersionContent />
        </SettingsBlock>
        <SettingsBlock title={t("mypage_comp_settings_block_logout")}>
          <LogoutContent />
        </SettingsBlock>
        <SettingsBlock title={t("mypage_comp_settings_block_leave")}>
          <LeaveContent />
        </SettingsBlock>
      </TabShell>
    );
  }

  if (section === "support") {
    return (
      <TabShell
        title={t("mypage_comp_nav_sec_settings_support_label")}
        description={t("mypage_comp_nav_sec_settings_support_desc")}
      >
        <SettingsBlock title={t("mypage_comp_settings_block_notices")}>
          <NoticesContent />
        </SettingsBlock>
        <SettingsBlock title={t("mypage_comp_settings_block_support_center")}>
          <div className="space-y-2 sam-text-helper leading-5 text-sam-muted">
            <p>{t("mypage_comp_settings_support_p1")}</p>
            <p>{t("mypage_comp_settings_support_p2")}</p>
            <p>{t("mypage_comp_settings_support_p3")}</p>
            <p>{t("mypage_comp_settings_support_p4")}</p>
          </div>
        </SettingsBlock>
        <SettingsBlock title={t("mypage_comp_settings_block_terms")}>
          <div className="space-y-2 sam-text-helper leading-5 text-sam-muted">
            <p>{t("mypage_comp_settings_terms_p1")}</p>
            <p>{t("mypage_comp_settings_terms_p2")}</p>
            <p>
              <Link href="/terms" className="text-signature underline">{t("mypage_comp_settings_terms_anchor")}</Link>
              {" · "}
              <Link href="/privacy" className="text-signature underline">{t("mypage_comp_settings_privacy_link")}</Link>
              {" · "}
              <Link href="/mypage/section/settings/leave" className="text-signature underline">{t("mypage_comp_settings_delete_account_link")}</Link>
            </p>
          </div>
        </SettingsBlock>
      </TabShell>
    );
  }

  return (
    <TabShell
      title={t("mypage_comp_nav_sec_settings_address_label")}
      description={t("mypage_comp_nav_sec_settings_address_desc")}
    >
      <AddressBookLink label={t("mypage_comp_nav_sec_settings_address_label")} onOpen={() => router.push("/mypage/addresses")} />
    </TabShell>
  );
}

function AddressBookLink({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[52px] items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 sam-text-body font-medium text-sam-fg"
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        <AddressKindHeadPin kind="master" className="h-5 w-5 shrink-0 [&_svg]:h-5 [&_svg]:w-[1rem]" />
        <span>{label}</span>
      </span>
      <span className="text-sam-meta">›</span>
    </button>
  );
}

function TabShell({
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <MyPageSectionHeader description={description} />
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SettingsBlock({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
}) {
  return (
    <MyPageMobileFold title={title} summary={summary}>
      {children}
    </MyPageMobileFold>
  );
}
