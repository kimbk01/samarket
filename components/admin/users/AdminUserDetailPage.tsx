"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminMemberControlCenter } from "@/components/admin/users/AdminMemberControlCenter";
import type {
  AdminPersonMembershipRow,
  AdminPersonStoreRow,
  AdminUserDetailPayload,
} from "@/components/admin/users/AdminTestUserDetail";
import { ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY, ADMIN_USERS_LITE_PAGE_BG } from "@/lib/ui/admin-users-lite-styles";
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
  const { t, safeT } = useI18n();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<DetailLoadState>({ kind: "loading" });
  const [softRefreshing, setSoftRefreshing] = useState(false);

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

  if (state.kind === "loading") {
    return (
      <div
        className={`${ADMIN_USERS_LITE_PAGE_BG} py-12 text-center text-[13px] text-[#667085]`}
        data-member-detail-state="loading"
      >
        {t("admin_users_detail_loading")}
      </div>
    );
  }

  if (state.kind === "not_found") {
    return (
      <div
        className={`${ADMIN_USERS_LITE_PAGE_BG} py-12 text-center text-[13px] text-[#667085]`}
        data-member-detail-state="not_found"
      >
        {t(state.messageKey)}
      </div>
    );
  }

  if (state.kind === "forbidden") {
    return (
      <div
        className={`${ADMIN_USERS_LITE_PAGE_BG} space-y-3 py-12 text-center text-[13px] text-[#667085]`}
        data-member-detail-state="forbidden"
      >
        <p>{t(state.messageKey)}</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        className={`${ADMIN_USERS_LITE_PAGE_BG} space-y-3 py-12 text-center text-[13px] text-[#667085]`}
        data-member-detail-state="error"
      >
        <p>{t(state.messageKey)}</p>
        <button
          type="button"
          className={ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY}
          onClick={() => setRefreshKey((k) => k + 1)}
          data-member-detail-retry="1"
        >
          {safeT("admin_users_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
        </button>
      </div>
    );
  }

  return (
    <div data-member-detail-state="found" data-member-detail-soft-refresh={softRefreshing ? "1" : "0"}>
      {softRefreshing ? (
        <p
          className="mb-2 rounded-md border border-[#dbeafe] bg-[#eff6ff] px-3 py-2 text-[12px] text-[#1d4ed8]"
          data-member-detail-refreshing="1"
        >
          회원 정보를 갱신하는 중…
        </p>
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
