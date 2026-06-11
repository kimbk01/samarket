"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  AdminTestUserDetail,
  type ApiTestUserRow,
} from "@/components/admin/users/AdminTestUserDetail";
import { ADMIN_USERS_PAGE_BG_CLASS } from "@/lib/ui/admin-users-starbucks-styles";

interface AdminUserDetailPageProps {
  userId: string;
}

export function AdminUserDetailPage({ userId }: AdminUserDetailPageProps) {
  const { t } = useI18n();
  const [apiUser, setApiUser] = useState<ApiTestUserRow | "loading" | "absent">("loading");

  useEffect(() => {
    let cancelled = false;
    setApiUser("loading");
    (async () => {
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { ok?: boolean; user?: ApiTestUserRow };
          if (data.ok && data.user) {
            setApiUser(data.user);
            return;
          }
        }
        setApiUser("absent");
      } catch {
        if (!cancelled) setApiUser("absent");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (apiUser === "loading") {
    return (
      <div className={`${ADMIN_USERS_PAGE_BG_CLASS} py-12 text-center text-[13px] text-[#6F4E37]`}>
        {t("admin_users_detail_loading")}
      </div>
    );
  }

  if (apiUser === "absent") {
    return (
      <div className={`${ADMIN_USERS_PAGE_BG_CLASS} py-12 text-center text-[13px] text-[#6F4E37]`}>
        {t("admin_users_detail_not_found")}
      </div>
    );
  }

  return <AdminTestUserDetail user={apiUser} />;
}
