"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";

type AuthPayload = {
  auth: {
    email: string | null;
    emailConfirmedAt: string | null;
    lastSignInAt: string | null;
    providers: Array<string | null>;
    identities: Array<{ provider: string | null; identityId: string | null }>;
  } | null;
  authLoadError: string | null;
  profile: {
    email: string | null;
    authLoginEmail: string | null;
    phone: string | null;
    authProvider: string | null;
    provider: string | null;
    lastLoginAt: string | null;
  } | null;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#f2f4f7] py-2 last:border-b-0">
      <p className="text-xs font-medium text-[#667085]">{label}</p>
      <p className="max-w-[70%] break-all text-right text-sm font-semibold text-[#101828]">{value}</p>
    </div>
  );
}

export function AdminMemberAuthPanel({ userId }: { userId: string }) {
  const { t, safeT, language } = useI18n();
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error" } | { kind: "ok"; data: AuthPayload }>({
    kind: "loading",
  });
  const empty = t("admin_users_empty_placeholder");
  const fmt = (value: string | null | undefined) => {
    if (!value) return empty;
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return value;
    return new Date(time).toLocaleString(language === "en" ? "en-US" : "ko-KR");
  };

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/auth`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as AuthPayload & { ok?: boolean };
        if (cancelled) return;
        if (!res.ok || data.ok === false) {
          setState({ kind: "error" });
          return;
        }
        setState({ kind: "ok", data });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (state.kind === "loading") {
    return <div className={`${ADMIN_USERS_LITE_CARD} py-8 text-center text-sm text-[#667085]`}>{t("admin_users_detail_loading")}</div>;
  }
  if (state.kind === "error") {
    return (
      <div className={`${ADMIN_USERS_LITE_CARD} py-8 text-center text-sm font-semibold text-[#b42318]`}>
        {safeT("admin_users_cc_metric_error", { fallbackKo: "불러오지 못함", fallbackEn: "Load error" })}
      </div>
    );
  }

  const { auth, authLoadError, profile } = state.data;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className={`${ADMIN_USERS_LITE_CARD} p-4`}>
        <h3 className="text-xs font-bold uppercase tracking-wide text-[#667085]">
          {safeT("admin_users_cc_auth_supabase", { fallbackKo: "Auth", fallbackEn: "Auth" })}
        </h3>
        {auth ? (
          <div className="mt-2">
            <Field label={safeT("admin_users_label_email", { fallbackKo: "이메일", fallbackEn: "Email" })} value={auth.email || empty} />
            <Field
              label={safeT("admin_users_cc_auth_email_confirmed", { fallbackKo: "이메일 확인 시각", fallbackEn: "Email confirmed at" })}
              value={fmt(auth.emailConfirmedAt)}
            />
            <Field
              label={safeT("admin_users_cc_auth_last_sign_in", { fallbackKo: "Auth 최근 로그인", fallbackEn: "Auth last sign-in" })}
              value={fmt(auth.lastSignInAt)}
            />
            <Field
              label={safeT("admin_users_cc_auth_providers", { fallbackKo: "연결 provider", fallbackEn: "Linked providers" })}
              value={auth.identities.map((row) => row.provider).filter(Boolean).join(", ") || empty}
            />
          </div>
        ) : (
          <p className="mt-3 text-sm font-semibold text-[#b42318]">
            {authLoadError
              || safeT("admin_users_cc_metric_error", { fallbackKo: "불러오지 못함", fallbackEn: "Load error" })}
          </p>
        )}
      </div>
      <div className={`${ADMIN_USERS_LITE_CARD} p-4`}>
        <h3 className="text-xs font-bold uppercase tracking-wide text-[#667085]">
          {safeT("admin_users_cc_auth_profile", { fallbackKo: "앱 프로필", fallbackEn: "App profile" })}
        </h3>
        {profile ? (
          <div className="mt-2">
            <Field label={safeT("admin_users_label_email", { fallbackKo: "이메일", fallbackEn: "Email" })} value={profile.email || empty} />
            <Field
              label={safeT("admin_users_cc_auth_login_email", { fallbackKo: "로그인 이메일", fallbackEn: "Login email" })}
              value={profile.authLoginEmail || empty}
            />
            <Field label={safeT("admin_users_lite_label_phone", { fallbackKo: "전화", fallbackEn: "Phone" })} value={profile.phone || empty} />
            <Field
              label={safeT("admin_users_cc_auth_profile_provider", { fallbackKo: "프로필 provider", fallbackEn: "Profile provider" })}
              value={profile.authProvider || profile.provider || empty}
            />
            <Field
              label={t("admin_users_col_last_login")}
              value={fmt(profile.lastLoginAt)}
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#667085]">{t("admin_users_detail_not_found")}</p>
        )}
      </div>
    </div>
  );
}
