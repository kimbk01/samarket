"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  AdminMemberDetail,
  type AdminUserDetailPayload,
} from "@/components/admin/users/AdminTestUserDetail";
import { ADMIN_USERS_PAGE_BG_CLASS } from "@/lib/ui/admin-users-starbucks-styles";
import type { MessageKey } from "@/lib/i18n/messages";

interface AdminUserDetailPageProps {
  userId: string;
}

type DetailLoadState =
  | { kind: "loading" }
  | { kind: "user"; user: AdminUserDetailPayload }
  | { kind: "error"; messageKey: MessageKey };

function detailErrorKeyForStatus(status: number): MessageKey {
  if (status === 401) return "admin_users_error_login_required";
  if (status === 403) return "admin_users_error_admin_only";
  if (status === 404) return "admin_users_detail_not_found";
  if (status >= 500) return "admin_users_error_fetch_failed";
  return "admin_users_error_fetch_failed";
}

export function AdminUserDetailPage({ userId }: AdminUserDetailPageProps) {
  const { t } = useI18n();
  const [state, setState] = useState<DetailLoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { ok?: boolean; user?: AdminUserDetailPayload };
          if (data.ok && data.user) {
            setState({ kind: "user", user: data.user });
            return;
          }
          setState({ kind: "error", messageKey: "admin_users_error_fetch_failed" });
          return;
        }
        setState({ kind: "error", messageKey: detailErrorKeyForStatus(res.status) });
      } catch {
        if (!cancelled) {
          setState({ kind: "error", messageKey: "admin_users_error_network" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (state.kind === "loading") {
    return (
      <div className={`${ADMIN_USERS_PAGE_BG_CLASS} py-12 text-center text-[13px] text-[#6F4E37]`}>
        {t("admin_users_detail_loading")}
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={`${ADMIN_USERS_PAGE_BG_CLASS} py-12 text-center text-[13px] text-[#6F4E37]`}>
        {t(state.messageKey)}
      </div>
    );
  }

  return <AdminMemberDetail user={state.user} />;
}
