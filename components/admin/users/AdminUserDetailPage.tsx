"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { readAdminReturnToFromSearch } from "@/lib/admin/admin-operation-return-context";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminMemberControlCenter } from "@/components/admin/users/AdminMemberControlCenter";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminForbiddenState,
  AdminLoadingState,
} from "@/components/admin/ui/AdminStateViews";
import type {
  AdminPersonMembershipRow,
  AdminPersonStoreRow,
  AdminUserDetailPayload,
} from "@/components/admin/users/AdminTestUserDetail";
import { ADMIN_USERS_LITE_PAGE_BG } from "@/lib/ui/admin-users-lite-styles";
import type { MessageKey } from "@/lib/i18n/messages";

interface AdminUserDetailPageProps {
  userId: string;
}

type DetailLoadState =
  | { kind: "loading" }
  | {
      kind: "found";
      user: AdminUserDetailPayload;
      stores: AdminPersonStoreRow[];
      adminMembership: AdminPersonMembershipRow | null;
      activityStatus: "not_implemented" | "ok";
    }
  | { kind: "not_found"; messageKey: MessageKey }
  | { kind: "forbidden"; messageKey: MessageKey }
  | { kind: "error"; messageKey: MessageKey };

function classifyHttpError(status: number): Exclude<DetailLoadState, { kind: "loading" } | { kind: "found" }> {
  if (status === 404) return { kind: "not_found", messageKey: "admin_users_detail_not_found" };
  if (status === 401 || status === 403) {
    return {
      kind: "forbidden",
      messageKey: status === 401 ? "admin_users_error_login_required" : "admin_users_error_admin_only",
    };
  }
  return { kind: "error", messageKey: "admin_users_error_fetch_failed" };
}

export function AdminUserDetailPage({ userId }: AdminUserDetailPageProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<DetailLoadState>({ kind: "loading" });
  const [softRefreshing, setSoftRefreshing] = useState(false);
  // §3 — opened from a domain screen (매장 허브 · 주문 상세): offer the way back with its filters.
  const returnTo = readAdminReturnToFromSearch(useSearchParams());

  const onUpdated = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  const foundRef = useRef(false);
  useEffect(() => {
    foundRef.current = state.kind === "found";
  }, [state.kind]);

  useEffect(() => {
    let cancelled = false;
    const keepSurface = foundRef.current;
    if (!keepSurface) {
      setState({ kind: "loading" });
    } else {
      setSoftRefreshing(true);
    }
    (async () => {
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as {
            ok?: boolean;
            user?: AdminUserDetailPayload;
            stores?: AdminPersonStoreRow[];
            adminMembership?: AdminPersonMembershipRow | null;
            activity?: { status?: string };
          };
          if (data.ok && data.user) {
            setState({
              kind: "found",
              user: data.user,
              stores: Array.isArray(data.stores) ? data.stores : [],
              adminMembership: data.adminMembership ?? null,
              activityStatus: data.activity?.status === "ok" ? "ok" : "not_implemented",
            });
            return;
          }
          if (!keepSurface) setState({ kind: "error", messageKey: "admin_users_error_fetch_failed" });
          return;
        }
        if (!keepSurface) setState(classifyHttpError(res.status));
      } catch {
        if (!cancelled && !keepSurface) {
          setState({ kind: "error", messageKey: "admin_users_error_network" });
        }
      } finally {
        if (!cancelled) setSoftRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  /** 4종 상태 (AdminStateViews) — data-member-detail-state 래퍼는 계약 테스트용으로 유지. */
  if (state.kind === "loading") {
    return (
      <div className={`${ADMIN_USERS_LITE_PAGE_BG} py-6`} data-member-detail-state="loading">
        <AdminLoadingState ko={ko} label={t("admin_users_detail_loading")} />
      </div>
    );
  }

  if (state.kind === "not_found") {
    return (
      <div className={`${ADMIN_USERS_LITE_PAGE_BG} py-6`} data-member-detail-state="not_found">
        <AdminEmptyState ko={ko} message={t(state.messageKey)} />
      </div>
    );
  }

  if (state.kind === "forbidden") {
    return (
      <div className={`${ADMIN_USERS_LITE_PAGE_BG} py-6`} data-member-detail-state="forbidden">
        <AdminForbiddenState ko={ko} code={state.messageKey === "admin_users_error_login_required" ? "unauthorized" : "forbidden"} />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={`${ADMIN_USERS_LITE_PAGE_BG} py-6`} data-member-detail-state="error" data-member-detail-retry="1">
        <AdminErrorState
          ko={ko}
          code={state.messageKey === "admin_users_error_network" ? "network_error" : "load_failed"}
          onRetry={() => setRefreshKey((k) => k + 1)}
        />
      </div>
    );
  }

  return (
    <div data-member-detail-state="found" data-member-detail-soft-refresh={softRefreshing ? "1" : "0"}>
      {softRefreshing ? (
        <p
          className="mb-2 rounded-md border border-sam-primary-border bg-sam-primary-soft px-3 py-2 text-[12px] text-sam-primary"
          data-member-detail-refreshing="1"
        >
          회원 정보를 갱신하는 중…
        </p>
      ) : null}
      {returnTo ? (
        <Link
          href={returnTo}
          className="mb-2 inline-block text-[13px] font-medium text-sam-primary hover:underline"
          data-member-detail-return="1"
        >
          {t("admin_r4_return_previous")}
        </Link>
      ) : null}
      <AdminMemberControlCenter
        user={state.user}
        stores={state.stores}
        adminMembership={state.adminMembership}
        activityStatus={state.activityStatus}
        onUpdated={onUpdated}
      />
    </div>
  );
}
