"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { AdminMemberReportsPanel } from "@/components/admin/users/AdminMemberReportsPanel";
import { AdminMemberDangerZone } from "@/components/admin/users/AdminMemberDangerZone";
import {
  executeMemberManagementAction,
  type MemberManagementActionId,
} from "@/lib/admin-users/member-management-actions-client";
import { dibayAlert, dibayConfirm, dibayPrompt } from "@/components/ui/dibay-overlay";
import { AdminUserPointsSection } from "@/components/admin/users/AdminUserPointsSection";
import { AdminUserTrustSection } from "@/components/admin/users/AdminUserTrustSection";
import {
  MEMBER_DETAIL_BACK_LIST_KO,
  MEMBER_DETAIL_TAB_LABEL_KO,
  memberDetailDangerActions,
  memberDetailListHrefFallback,
  memberDetailShouldUseHistoryBack,
  resolveMemberDetailActionPolicy,
} from "@/lib/admin-users/member-detail-presentation";
import {
  MEMBER_DETAIL_TAB_ORDER,
  parseMemberDetailTab,
  type MemberDetailCcTabId,
} from "@/lib/admin-users/member-detail-control-center-ia";
import { adminMembershipRoleFromRow } from "@/lib/admin-users/member-role-badges";
import {
  ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY,
  ADMIN_USERS_LITE_PAGE_BG,
} from "@/lib/ui/admin-users-lite-styles";

const FROM_POST_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseFromPostId(raw: string | null): string | null {
  const id = String(raw ?? "").trim();
  return id && FROM_POST_UUID_RE.test(id) ? id : null;
}

/** Approved IA order; points/trust retained as existing operational data. */
export const ADMIN_MEMBER_CC_TABS = MEMBER_DETAIL_TAB_ORDER;

export type AdminMemberCcTab = MemberDetailCcTabId;

function parseCcTab(raw: string | null | undefined): AdminMemberCcTab {
  return parseMemberDetailTab(raw);
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
  const { t, safeT } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { isSuperAdmin, hasPermission, loading: meLoading, snapshot } = useAdminMe();
  const searchParams = useSearchParams();
  const fromPostId = parseFromPostId(searchParams.get("fromPost"));
  const tab = parseCcTab(initialTab ?? searchParams.get("tab"));
  const [visited, setVisited] = useState<Set<AdminMemberCcTab>>(
    () => new Set([parseCcTab(initialTab ?? searchParams.get("tab"))]),
  );

  const selectTab = useCallback(
    (next: AdminMemberCcTab) => {
      setVisited((prev) => {
        if (prev.has(next)) return prev;
        const copy = new Set(prev);
        copy.add(next);
        return copy;
      });
      const params = new URLSearchParams(searchParams.toString());
      if (next === "overview") params.delete("tab");
      else params.set("tab", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(tab)) return prev;
      const copy = new Set(prev);
      copy.add(tab);
      return copy;
    });
  }, [tab]);

  const goBackToList = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      const ref = typeof document !== "undefined" ? document.referrer : "";
      if (memberDetailShouldUseHistoryBack(ref) || !ref) {
        router.back();
        return;
      }
    }
    router.push(memberDetailListHrefFallback());
  }, [router]);

  const lazy = useMemo(() => visited, [visited]);

  const canManageMember = isSuperAdmin || hasPermission("users");
  const [dangerBusy, setDangerBusy] = useState(false);
  const membershipRole = adminMembershipRoleFromRow(adminMembership?.role);
  const dangerActions = useMemo(() => {
    if (meLoading) return [];
    const decisions = resolveMemberDetailActionPolicy({
      moderationStatus: user.moderation_status,
      status: user.status,
      operator: {
        canModerate: canManageMember,
        canEditProfile: canManageMember,
        canResetPassword: canManageMember,
        canManagePrivilege: isSuperAdmin,
        canWithdraw: canManageMember,
        canPurge: canManageMember,
        isSelf: Boolean(snapshot?.userId && snapshot.userId === user.id),
        targetIsSuperAdmin: membershipRole === "super_admin",
      },
      hasStoreRelationship: stores.length > 0,
      passwordResetSupported: true,
    });
    return memberDetailDangerActions(decisions);
  }, [
    meLoading,
    user.moderation_status,
    user.status,
    user.id,
    canManageMember,
    isSuperAdmin,
    stores.length,
    snapshot?.userId,
    membershipRole,
  ]);

  const runDangerAction = useCallback(
    async (actionId: MemberManagementActionId) => {
      if (dangerBusy) return;
      const label =
        actionId === "purge"
          ? "영구 삭제"
          : actionId === "withdraw"
            ? "탈퇴 처리"
            : actionId === "suspend"
              ? "이용 정지"
              : actionId === "block"
                ? "이용 차단"
                : actionId === "unsuspend"
                  ? "정지 해제"
                  : actionId === "unblock"
                    ? "차단 해제"
                    : actionId === "warn"
                      ? "경고"
                      : actionId;
      let confirmTitle =
        actionId === "purge"
          ? "이 회원을 영구 삭제하시겠습니까? 되돌릴 수 없습니다."
          : `${label}을(를) 실행할까요?`;
      if (actionId === "purge") {
        try {
          const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/purge-preview`, {
            credentials: "include",
            cache: "no-store",
          });
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            purgeAllowed?: boolean;
            blockers?: string[];
            protectedTarget?: boolean;
          };
          if (res.ok && data.ok) {
            if (data.protectedTarget) {
              await dibayAlert({ title: "관리자·최고관리자 계정은 영구 삭제할 수 없습니다." });
              return;
            }
            if (!data.purgeAllowed) {
              await dibayAlert({
                title: `영구 삭제가 차단되었습니다.\n${(data.blockers ?? []).join("\n") || "unknown"}`,
              });
              return;
            }
            confirmTitle = `이 회원을 영구 삭제하시겠습니까? 되돌릴 수 없습니다.\n영향 검사: 통과`;
          }
        } catch {
          /* preview failure does not auto-allow; still confirm with warning */
          confirmTitle =
            "영향 미리보기에 실패했습니다. 그래도 영구 삭제를 시도할까요? (서버가 다시 검증합니다)";
        }
      }
      const confirmed = await dibayConfirm({
        title: confirmTitle,
        confirmTone: actionId === "purge" || actionId === "withdraw" || actionId === "block" ? "destructive" : "primary",
      });
      if (!confirmed) return;
      let reason = `${actionId}_by_admin`;
      if (actionId !== "purge" && actionId !== "withdraw") {
        const prompted = await dibayPrompt({
          title: "처리 사유를 입력해 주세요.",
          required: true,
        });
        if (!prompted?.trim()) return;
        reason = prompted.trim();
      } else if (actionId === "purge") {
        reason = "admin_permanent_delete";
      } else {
        reason = "admin_withdraw";
      }
      setDangerBusy(true);
      try {
        const result = await executeMemberManagementAction({
          userId: user.id,
          action: actionId,
          reason,
        });
        if (!result.ok) {
          const extra =
            result.blockers && result.blockers.length > 0 ? `\n${result.blockers.join(", ")}` : "";
          await dibayAlert({
            title: `${result.message ?? result.error ?? "작업에 실패했습니다."}${extra}`,
          });
          return;
        }
        if (actionId === "purge" || actionId === "withdraw") {
          window.location.href = "/admin/users";
          return;
        }
        onUpdated?.();
      } finally {
        setDangerBusy(false);
      }
    },
    [dangerBusy, onUpdated, user.id],
  );

  return (
    <div className={`${ADMIN_USERS_LITE_PAGE_BG} space-y-3 pb-6`} data-member-detail-control-center="1">
      <div className="sticky top-0 z-20 space-y-3 bg-[#f4f6f9] pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <nav className="text-xs font-medium text-[#667085]" aria-label="Breadcrumb">
            <span>{t("admin_users_lite_breadcrumb_members")}</span>
            <span className="mx-1.5 text-[#98a2b3]">›</span>
            <button type="button" className="hover:text-[#344054]" onClick={goBackToList}>
              {MEMBER_DETAIL_BACK_LIST_KO}
            </button>
            <span className="mx-1.5 text-[#98a2b3]">›</span>
            <span className="text-[#344054]">{t("admin_users_detail_title")}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            {fromPostId ? (
              <Link
                href={`/admin/products/${fromPostId}`}
                prefetch={false}
                className={ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY}
              >
                {safeT("admin_users_back_to_post", {
                  fallbackKo: "← 게시물로",
                  fallbackEn: "← Back to listing",
                })}
              </Link>
            ) : null}
            <button
              type="button"
              className={ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY}
              onClick={goBackToList}
              data-member-detail-back="1"
            >
              {t("admin_users_lite_back_to_list")}
            </button>
          </div>
        </div>
        <AdminMemberMasterHeader
          user={user}
          stores={stores}
          adminMembership={adminMembership}
          onUpdated={onUpdated}
          onOpenTab={(next) => selectTab(next)}
        />
        <AdminMemberAlertStrip user={user} stores={stores} />
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-[#e4e7ec] bg-white p-1" data-member-detail-tabs="1">
          {ADMIN_MEMBER_CC_TABS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              data-member-tab={id}
              className={
                tab === id
                  ? "shrink-0 rounded-md bg-[#eff6ff] px-3 py-1.5 text-xs font-semibold text-[#2563eb]"
                  : "shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold text-[#667085] hover:bg-[#f9fafb]"
              }
            >
              {MEMBER_DETAIL_TAB_LABEL_KO[id]}
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
            onOpenTab={(next) => selectTab(next as AdminMemberCcTab)}
          />
        </div>
      ) : null}

      {lazy.has("account") ? (
        <div hidden={tab !== "account"}>
          <AdminMemberAuthPanel user={user} />
        </div>
      ) : null}

      {lazy.has("store") ? (
        <div hidden={tab !== "store"}>
          <AdminMemberStorePanel stores={stores} />
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

      {lazy.has("chat") ? (
        <div hidden={tab !== "chat"}>
          <AdminMemberChatPanel userId={user.id} />
        </div>
      ) : null}

      {lazy.has("reports") ? (
        <div hidden={tab !== "reports"}>
          <AdminMemberReportsPanel
            user={user}
            onOpenOps={() => selectTab("ops")}
          />
        </div>
      ) : null}

      {lazy.has("address") ? (
        <div hidden={tab !== "address"}>
          <AdminMemberAddressPanel userId={user.id} />
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

      <AdminMemberDangerZone
        actions={dangerActions}
        busy={dangerBusy}
        onAction={(id) => {
          void runDangerAction(id as MemberManagementActionId);
        }}
      />

    </div>
  );
}
