"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminUserDetailPayload } from "@/components/admin/users/AdminTestUserDetail";
import {
  displayNameForDetailUser,
  publicIdForDetailUser,
  resolveDetailAuthProvider,
} from "@/components/admin/users/admin-user-lite-display";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { memberDetailContactEmail, memberDetailLoginIdLabel } from "@/lib/admin-users/member-detail-control-center-ia";
import {
  memberDetailAccountStateLabelKo,
  memberDetailSignupOriginLabelKo,
  memberDetailVerificationLabelKo,
} from "@/lib/admin-users/member-detail-presentation";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { AdminAuthProvider } from "@/lib/types/admin-user";
import type { AdminLinkedIdentity } from "@/lib/admin-users/resolve-admin-user-display";

type AuthPayload = {
  signupProvider?: AdminAuthProvider;
  manualLoginId?: string | null;
  linkedIdentities?: AdminLinkedIdentity[];
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
      <h3 className="mb-1 text-[12px] font-bold uppercase tracking-wide text-sam-muted">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-sam-border-soft py-1.5 text-[13px] last:border-b-0">
      <p className="text-sam-muted">{label}</p>
      <p className="break-all font-medium text-sam-fg">{value}</p>
    </div>
  );
}

export function AdminMemberAuthPanel({ user }: { user: AdminUserDetailPayload }) {
  const { t, safeT } = useI18n();
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error" } | { kind: "ok"; data: AuthPayload }>({
    kind: "loading",
  });
  const empty = t("admin_users_empty_placeholder");
  const fmt = (value: string | null | undefined) => {
    if (!value) return empty;
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return value;
    return formatAdminManilaDateTime(value);
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
    return <div className={`${ADMIN_USERS_LITE_CARD} py-8 text-center text-sm text-sam-muted`}>{t("admin_users_detail_loading")}</div>;
  }
  if (state.kind === "error") {
    return (
      <div className={`${ADMIN_USERS_LITE_CARD} py-8 text-center text-sm font-semibold text-sam-danger`}>
        {safeT("admin_users_cc_metric_error")}
      </div>
    );
  }

  const { auth, authLoadError, profile } = state.data;
  // Supabase 내부 로그인 방식 — 네이티브 SNS 도 「email」(내부 주소+비밀번호)이라 SNS 판정에 쓰지 않는다 (설계안 ④)
  const internalLoginMethods = auth?.identities.map((row) => row.provider).filter(Boolean).join(", ") || empty;
  const signupProvider = state.data.signupProvider ?? resolveDetailAuthProvider(user.email);
  const manualLoginId = state.data.manualLoginId ?? null;
  const linked = (state.data.linkedIdentities ?? []).filter((row) => row.provider !== "email");
  const canChangePassword = Boolean(auth);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Fieldset title={safeT("admin_users_auth_basic")}>
        <Field label={safeT("admin_users_col_member_id")} value={publicIdForDetailUser(user) || empty} />
        <Field label={safeT("admin_users_label_display_name")} value={displayNameForDetailUser(user)} />
        <Field label={safeT("admin_users_label_nickname")} value={user.nickname?.trim() || empty} />
        <Field label={safeT("admin_users_label_login_alias")} value={user.username?.trim() || empty} />
      </Fieldset>
      <Fieldset title={safeT("admin_users_auth_contact")}>
        <Field label={t("admin_users_lite_label_phone")} value={profile?.phone || user.contact_phone || empty} />
        <Field
          label="연락 이메일"
          value={
            memberDetailContactEmail(profile?.email) ||
            memberDetailContactEmail(auth?.email) ||
            memberDetailContactEmail(user.email) ||
            empty
          }
        />
        <Field
          label="실제 로그인 아이디"
          value={
            manualLoginId
              ? manualLoginId
              : linked.length > 0
                ? "SNS 로그인 (아이디 없음)"
                : memberDetailLoginIdLabel(user.username) || empty
          }
        />
        <Field label="계정 상태" value={memberDetailAccountStateLabelKo(user.moderation_status, user.status)} />
        <Field label="인증" value={memberDetailVerificationLabelKo(user.phone_verified)} />
        <Field label="가입 경로" value={memberDetailSignupOriginLabelKo(signupProvider)} />
      </Fieldset>
      <Fieldset title={safeT("admin_users_auth_verify")}>
        <Field
          label={t("admin_users_lite_label_phone_verified")}
          value={user.phone_verified === true ? t("admin_users_lite_verified_done") : t("admin_users_lite_verified_pending")}
        />
        <Field label={safeT("admin_users_cc_auth_email_confirmed")} value={fmt(auth?.emailConfirmedAt)} />
        <Field label="내부 로그인 방식" value={internalLoginMethods} />
        {authLoadError ? <p className="mt-2 text-[12px] text-sam-danger">{authLoadError}</p> : null}
      </Fieldset>
      <Fieldset title={safeT("admin_users_auth_login")}>
        <Field label={safeT("admin_users_label_app_last_login")} value={fmt(profile?.lastLoginAt || user.last_login_at)} />
        <Field label={safeT("admin_users_label_auth_last_login")} value={fmt(auth?.lastSignInAt)} />
        <Field label={safeT("admin_users_cc_auth_profile_provider")} value={profile?.authProvider || profile?.provider || empty} />
      </Fieldset>
      <section className={`${ADMIN_USERS_LITE_CARD} p-3 lg:col-span-2`} data-member-auth-linked-accounts="1">
        <h3 className="mb-1 text-[12px] font-bold uppercase tracking-wide text-sam-muted">연결된 로그인 계정</h3>
        {linked.length === 0 ? (
          <p className="py-1.5 text-[13px] text-sam-muted">
            {manualLoginId ? `관리자 생성 계정 · 로그인 아이디 ${manualLoginId}` : "연결된 SNS 계정 없음"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="text-[12px] text-sam-muted">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">제공자</th>
                  <th className="py-1.5 pr-3 font-medium">SNS 이름</th>
                  <th className="py-1.5 pr-3 font-medium">계정 이메일</th>
                  <th className="py-1.5 pr-3 font-medium">고유번호</th>
                  <th className="py-1.5 pr-3 font-medium">연결 일시 (PHT)</th>
                </tr>
              </thead>
              <tbody>
                {linked.map((row) => (
                  <tr key={`${row.provider}:${row.providerUserId}`} className="border-t border-sam-border-soft">
                    <td className="py-1.5 pr-3 font-medium text-sam-fg">{memberDetailSignupOriginLabelKo(row.provider)}</td>
                    <td className="py-1.5 pr-3 text-sam-fg" data-member-auth-provider-name="1">
                      {row.providerName ?? (row.provider === "apple" ? "— (Apple 이 이름을 주지 않음)" : empty)}
                    </td>
                    <td className="break-all py-1.5 pr-3 text-sam-fg">
                      {row.email
                        ? row.emailIsPrivateRelay
                          ? `${row.email} (이메일 가리기)`
                          : row.email
                        : row.provider === "kakao"
                          ? "— (카카오 이메일 미동의)"
                          : row.provider === "apple"
                            ? "— (Apple 이메일 가리기)"
                            : empty}
                    </td>
                    <td className="break-all py-1.5 pr-3 font-mono text-[12px] text-sam-fg">
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        className="!h-auto !px-0 !py-0 text-left !font-mono !text-[12px] !font-normal"
                        title="클릭하면 복사"
                        onClick={() => void navigator.clipboard?.writeText(row.providerUserId).catch(() => {})}
                      >
                        {row.providerUserId}
                      </AdminActionButton>
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-sam-muted">{fmt(row.linkedAt ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
            <section className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-3 lg:col-span-2`} data-member-auth-password-note="1">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-sam-muted">{t("admin_users_auth_password_section")}</h3>
        <p className="text-[13px] text-sam-fg">
          현재 비밀번호는 확인할 수 없습니다. 새 임시 비밀번호 설정은 상단 「비밀번호 관리」에서 처리합니다.
        </p>
        {!canChangePassword ? (
          <p className="text-[13px] font-medium text-sam-danger">{t("admin_users_auth_password_no_auth")}</p>
        ) : null}
      </section>
    </div>
  );
}
