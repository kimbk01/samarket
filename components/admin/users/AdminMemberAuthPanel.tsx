"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminUserDetailPayload } from "@/components/admin/users/AdminTestUserDetail";
import {
  displayNameForDetailUser,
  publicIdForDetailUser,
} from "@/components/admin/users/admin-user-lite-display";
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

function Fieldset({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${ADMIN_USERS_LITE_CARD} p-3`}>
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#667085]">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-[#f2f4f7] py-1.5 text-[13px] last:border-b-0">
      <p className="text-[#667085]">{label}</p>
      <p className="break-all font-medium text-[#101828]">{value}</p>
    </div>
  );
}

export function AdminMemberAuthPanel({ user }: { user: AdminUserDetailPayload }) {
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
        const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/auth`, {
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
  }, [user.id]);

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
  const providers = auth?.identities.map((row) => row.provider).filter(Boolean).join(", ") || empty;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Fieldset title={safeT("admin_users_auth_basic", { fallbackKo: "기본정보", fallbackEn: "Identity" })}>
        <Field label={safeT("admin_users_col_member_id", { fallbackKo: "회원 ID", fallbackEn: "Member ID" })} value={publicIdForDetailUser(user) || empty} />
        <Field label={safeT("admin_users_label_display_name", { fallbackKo: "표시 이름", fallbackEn: "Display name" })} value={displayNameForDetailUser(user)} />
        <Field label={safeT("admin_users_label_nickname", { fallbackKo: "닉네임", fallbackEn: "Nickname" })} value={user.nickname?.trim() || empty} />
        <Field label={safeT("admin_users_label_login_alias", { fallbackKo: "로그인 별칭", fallbackEn: "Login alias" })} value={user.username?.trim() || empty} />
      </Fieldset>
      <Fieldset title={safeT("admin_users_auth_contact", { fallbackKo: "연락처", fallbackEn: "Contact" })}>
        <Field label={t("admin_users_lite_label_phone")} value={profile?.phone || user.contact_phone || empty} />
        <Field label={t("admin_users_label_email")} value={auth?.email || profile?.email || user.email || empty} />
      </Fieldset>
      <Fieldset title={safeT("admin_users_auth_verify", { fallbackKo: "인증", fallbackEn: "Verification" })}>
        <Field
          label={t("admin_users_lite_label_phone_verified")}
          value={user.phone_verified === true ? t("admin_users_lite_verified_done") : t("admin_users_lite_verified_pending")}
        />
        <Field
          label={safeT("admin_users_cc_auth_email_confirmed", { fallbackKo: "이메일 확인", fallbackEn: "Email confirmed" })}
          value={fmt(auth?.emailConfirmedAt)}
        />
        <Field
          label={safeT("admin_users_cc_auth_providers", { fallbackKo: "연결 provider", fallbackEn: "Linked providers" })}
          value={providers}
        />
        {authLoadError ? <p className="mt-2 text-[12px] text-[#b42318]">{authLoadError}</p> : null}
      </Fieldset>
      <Fieldset title={safeT("admin_users_auth_login", { fallbackKo: "로그인", fallbackEn: "Login" })}>
        <Field
          label={safeT("admin_users_label_app_last_login", { fallbackKo: "앱 최근 로그인", fallbackEn: "App last login" })}
          value={fmt(profile?.lastLoginAt || user.last_login_at)}
        />
        <Field
          label={safeT("admin_users_label_auth_last_login", { fallbackKo: "Auth 최근 로그인", fallbackEn: "Auth last sign-in" })}
          value={fmt(auth?.lastSignInAt)}
        />
        <Field
          label={safeT("admin_users_cc_auth_profile_provider", { fallbackKo: "프로필 provider", fallbackEn: "Profile provider" })}
          value={profile?.authProvider || profile?.provider || empty}
        />
      </Fieldset>
    </div>
  );
}
