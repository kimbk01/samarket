"use client";

import type { ReactNode } from "react";
import { ChatSettingsContent } from "@/components/my/settings/ChatSettingsContent";
import { NotificationsSettingsContent } from "@/components/my/settings/NotificationsSettingsContent";
import { MessengerOverviewPanel } from "@/components/mypage/MessengerOverviewPanel";
import { MyPageQuickActions } from "@/components/mypage/MyPageQuickActions";
import { MyPageSectionHeader } from "@/components/mypage/MyPageSectionHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function MessengerTab({ section }: { section: string }) {
  const { t, safeT } = useI18n();
  if (section === "dm") {
    return (
      <TabShell
        title={safeT("mypage_comp_nav_sec_messenger_dm_label")}
        description={t("mypage_comp_nav_sec_messenger_dm_desc")}
      >
        <MessengerOverviewPanel mode="dm" />
        <div className="mt-4">
          <MyPageQuickActions
            items={[
              { label: t("mypage_comp_nav_sec_trade_chat_label"), href: "/mypage/section/trade/trade-chat", caption: t("mypage_comp_nav_sec_trade_chat_desc") },
              { label: t("mypage_comp_nav_sec_store_order_chat_label"), href: "/mypage/section/store/order-chat", caption: t("mypage_comp_nav_sec_store_order_chat_desc") },
            ]}
          />
        </div>
      </TabShell>
    );
  }

  if (section === "groups") {
    return (
      <TabShell
        title={safeT("mypage_comp_nav_sec_messenger_groups_label")}
        description={t("mypage_comp_nav_sec_messenger_groups_desc")}
      >
        <MessengerOverviewPanel mode="groups" />
      </TabShell>
    );
  }

  if (section === "chat-settings") {
    return (
      <TabShell
        title={safeT("mypage_comp_nav_sec_messenger_chat_settings_label")}
        description={t("mypage_comp_nav_sec_messenger_chat_settings_desc")}
      >
        <ChatSettingsContent />
      </TabShell>
    );
  }

  if (section === "alerts") {
    return (
      <TabShell
        title={safeT("mypage_comp_nav_sec_messenger_alerts_label")}
        description={t("mypage_comp_nav_sec_messenger_alerts_desc")}
      >
        <NotificationsSettingsContent />
      </TabShell>
    );
  }

  return (
    <TabShell
      title={safeT("mypage_comp_nav_sec_messenger_dm_label")}
      description={t("mypage_comp_nav_sec_messenger_dm_desc")}
    >
      <MessengerOverviewPanel mode="dm" />
    </TabShell>
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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">{children}</div>
    </div>
  );
}
