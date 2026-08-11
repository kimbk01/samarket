"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminMe } from "@/hooks/useAdminMe";
import type {
  AdminPersonMembershipRow,
  AdminPersonStoreRow,
  AdminUserDetailPayload,
} from "@/components/admin/users/AdminTestUserDetail";
import { AdminMemberMasterHeader } from "@/components/admin/users/AdminMemberMasterHeader";
import { AdminMemberAlertStrip } from "@/components/admin/users/AdminMemberAlertStrip";
import { AdminMemberOverviewPanel } from "@/components/admin/users/AdminMemberOverviewPanel";
import { AdminMemberAuthPanel } from "@/components/admin/users/AdminMemberAuthPanel";
import { AdminMemberAddressPanel } from "@/components/admin/users/AdminMemberAddressPanel";
import { AdminMemberCommunityPanel } from "@/components/admin/users/AdminMemberCommunityPanel";
import { AdminMemberTradePanel } from "@/components/admin/users/AdminMemberTradePanel";
import { AdminMemberDeliveryPanel } from "@/components/admin/users/AdminMemberDeliveryPanel";
import { AdminMemberStorePanel } from "@/components/admin/users/AdminMemberStorePanel";
import { AdminMemberChatPanel } from "@/components/admin/users/AdminMemberChatPanel";
import { AdminMemberOpsPanel } from "@/components/admin/users/AdminMemberOpsPanel";
import { AdminUserPointsSection } from "@/components/admin/users/AdminUserPointsSection";
import { AdminUserTrustSection } from "@/components/admin/users/AdminUserTrustSection";
import { EditAdminForm } from "@/components/admin/users/EditAdminForm";
import {
  ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY,
  ADMIN_USERS_LITE_PAGE_BG,
} from "@/lib/ui/admin-users-lite-styles";
import type { MessageKey } from "@/lib/i18n/messages";

export const ADMIN_MEMBER_CC_TABS = [
  "overview",
  "account",
  "community",
  "trade",
  "delivery",
  "store",
  "chat",
  "points",
  "trust",
  "address",
  "ops",
] as const;

export type AdminMemberCcTab = (typeof ADMIN_MEMBER_CC_TABS)[number];

const TAB_LABEL_KEYS: Record<AdminMemberCcTab, MessageKey> = {
  overview: "admin_users_cc_tab_overview",
  account: "admin_users_cc_tab_account",
  community: "admin_users_cc_tab_community",
  trade: "admin_users_cc_tab_trade",
  delivery: "admin_users_cc_tab_delivery",
  store: "admin_users_cc_tab_store",
  chat: "admin_users_cc_tab_chat",
  points: "admin_users_cc_tab_points",
  trust: "admin_users_cc_tab_trust",
  address: "admin_users_cc_tab_address",
  ops: "admin_users_cc_tab_ops",
};

function parseCcTab(raw: string | null | undefined): AdminMemberCcTab {
  const value = String(raw ?? "").trim().toLowerCase();
  return ADMIN_MEMBER_CC_TABS.includes(value as AdminMemberCcTab)
    ? (value as AdminMemberCcTab)
    : "overview";
}

export function AdminMemberControlCenter({
  user,
  stores,
  adminMembership,
  activityStatus: _activityStatus,
  initialTab,
  onUpdated,
}: {
  user: AdminUserDetailPayload;
  stores: AdminPersonStoreRow[];
  adminMembership: AdminPersonMembershipRow | null;
  activityStatus: "not_implemented" | "ok";
  initialTab?: string | null;
  onUpdated?: () => void;
}) {
  const { t } = useI18n();
  const { isSuperAdmin } = useAdminMe();
  const [tab, setTab] = useState<AdminMemberCcTab>(() => parseCcTab(initialTab));
  const [visited, setVisited] = useState<Set<AdminMemberCcTab>>(() => new Set([parseCcTab(initialTab)]));
  const [editPermissions, setEditPermissions] = useState(false);

  const selectTab = (next: AdminMemberCcTab) => {
    setTab(next);
    setVisited((prev) => {
      if (prev.has(next)) return prev;
      const copy = new Set(prev);
      copy.add(next);
      return copy;
    });
  };

  const lazy = useMemo(() => visited, [visited]);

  return (
    <div className={`${ADMIN_USERS_LITE_PAGE_BG} space-y-3 pb-6`}>
      <div className="sticky top-0 z-20 space-y-3 bg-[#f4f6f9] pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <nav className="text-xs font-medium text-[#667085]" aria-label="Breadcrumb">
            <span>{t("admin_users_lite_breadcrumb_members")}</span>
            <span className="mx-1.5 text-[#98a2b3]">›</span>
            <Link href="/admin/users" className="hover:text-[#344054]">
              {t("admin_users_lite_list_title")}
            </Link>
            <span className="mx-1.5 text-[#98a2b3]">›</span>
            <span className="text-[#344054]">{t("admin_users_detail_title")}</span>
          </nav>
          <Link href="/admin/users" className={ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY}>
            {t("admin_users_lite_back_to_list")}
          </Link>
        </div>
        <AdminMemberMasterHeader
          user={user}
          stores={stores}
          adminMembership={adminMembership}
          onUpdated={onUpdated}
          onEditPermissions={isSuperAdmin && adminMembership ? () => setEditPermissions(true) : undefined}
        />
        <AdminMemberAlertStrip user={user} stores={stores} />
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-[#e4e7ec] bg-white p-1">
          {ADMIN_MEMBER_CC_TABS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              className={
                tab === id
                  ? "shrink-0 rounded-md bg-[#eff6ff] px-3 py-1.5 text-xs font-semibold text-[#2563eb]"
                  : "shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold text-[#667085] hover:bg-[#f9fafb]"
              }
            >
              {t(TAB_LABEL_KEYS[id])}
            </button>
          ))}
        </div>
      </div>

      {lazy.has("overview") ? (
        <div hidden={tab !== "overview"}>
          <AdminMemberOverviewPanel
            user={user}
            stores={stores}
            adminMembership={adminMembership}
            onOpenTab={selectTab}
          />
        </div>
      ) : null}

      {lazy.has("account") ? (
        <div hidden={tab !== "account"}>
          <AdminMemberAuthPanel user={user} />
        </div>
      ) : null}

      {lazy.has("points") ? (
        <div hidden={tab !== "points"}>
          <AdminUserPointsSection userId={user.id} />
        </div>
      ) : null}

      {lazy.has("trust") ? (
        <div hidden={tab !== "trust"}>
          <AdminUserTrustSection
            userId={user.id}
            initialTrustScore={user.trust_score}
            readOnly={user.hasProfile === false}
            onUpdated={onUpdated}
          />
        </div>
      ) : null}

      {lazy.has("address") ? (
        <div hidden={tab !== "address"}>
          <AdminMemberAddressPanel userId={user.id} />
        </div>
      ) : null}

      {lazy.has("community") ? (
        <div hidden={tab !== "community"}>
          <AdminMemberCommunityPanel userId={user.id} />
        </div>
      ) : null}

      {lazy.has("trade") ? (
        <div hidden={tab !== "trade"}>
          <AdminMemberTradePanel userId={user.id} />
        </div>
      ) : null}

      {lazy.has("delivery") ? (
        <div hidden={tab !== "delivery"}>
          <AdminMemberDeliveryPanel userId={user.id} />
        </div>
      ) : null}

      {lazy.has("store") ? (
        <div hidden={tab !== "store"}>
          <AdminMemberStorePanel stores={stores} />
        </div>
      ) : null}

      {lazy.has("chat") ? (
        <div hidden={tab !== "chat"}>
          <AdminMemberChatPanel userId={user.id} />
        </div>
      ) : null}

      {lazy.has("ops") ? (
        <div hidden={tab !== "ops"}>
          <AdminMemberOpsPanel
            userId={user.id}
            nickname={user.display_name || user.nickname || user.id}
            moderationStatus={user.moderation_status}
            onUpdated={onUpdated}
          />
        </div>
      ) : null}

      {editPermissions ? (
        <EditAdminForm
          staffId={user.id}
          onClose={() => setEditPermissions(false)}
          onSuccess={() => {
            setEditPermissions(false);
            onUpdated?.();
          }}
        />
      ) : null}
    </div>
  );
}
