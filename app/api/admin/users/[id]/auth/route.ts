import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { isAdminMemberUuidSearch } from "@/lib/admin-users/admin-member-list-query";
import { assertMemberPasswordChangeAllowed } from "@/lib/admin-users/member-auth-target";
import { resolveMemberPasswordResetSupported } from "@/lib/admin-users/member-password-eligibility";
import { ensureManualLoginEmailAligned } from "@/lib/auth/manual-member-login-credential";
import { loadLinkedIdentitiesMapChunked } from "@/lib/admin-users/admin-users-list-server";
import { resolveAdminAuthProvider } from "@/lib/admin-users/resolve-admin-auth-provider";
import { manualLoginIdFromAuthEmail } from "@/lib/admin-users/member-sns-account";
import { checkAdminSetPassword, mapSupabaseWeakPasswordError } from "@/lib/auth/admin-set-password-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auth admin + profile auth fields. Server-only service role.
 * DO NOT: email existence → verified; provider from email domain.
 * DO NOT: return plaintext password (Auth stores hashes only).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const userId = id?.trim() ?? "";
  if (!userId || !isAdminMemberUuidSearch(userId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const profileSelectPrimary = "id, email, phone, auth_provider, provider, last_login_at, auth_login_email";
  const profileSelectLegacy = "id, email, phone, auth_provider, provider, last_login_at";
  const [{ data: profilePrimary, error: profilePrimaryError }, authRes] = await Promise.all([
    gate.sb.from("profiles").select(profileSelectPrimary).eq("id", userId).maybeSingle(),
    gate.sb.auth.admin.getUserById(userId),
  ]);
  let profile: Record<string, unknown> | null = (profilePrimary as Record<string, unknown> | null) ?? null;
  let profileError = profilePrimaryError;
  if (profileError && String(profileError.message ?? "").toLowerCase().includes("auth_login_email")) {
    const legacy = await gate.sb.from("profiles").select(profileSelectLegacy).eq("id", userId).maybeSingle();
    profile = (legacy.data as Record<string, unknown> | null) ?? null;
    profileError = legacy.error;
  }

  if (profileError) {
    return NextResponse.json({ ok: false, error: profileError.message, code: "profile_load_failed" }, { status: 500 });
  }

  const authUser = authRes.data?.user ?? null;
  const authError = authRes.error?.message ?? null;

  // SNS 계정 기준 = user_auth_identities (설계안 ④). Supabase identities 는 네이티브 SNS 도 「email」 이라 SNS 판정에 쓰지 않는다.
  const linkedIdentities =
    (await loadLinkedIdentitiesMapChunked(gate.sb, [userId]).catch(() => new Map())).get(userId) ?? [];
  const profileForProvider = (profile ?? {}) as {
    provider?: string | null;
    auth_provider?: string | null;
    email?: string | null;
    auth_login_email?: string | null;
  };
  const profileAuthLoginEmail = String(profileForProvider.auth_login_email ?? "").trim() || null;
  const manualLoginId =
    manualLoginIdFromAuthEmail(profileAuthLoginEmail) ?? manualLoginIdFromAuthEmail(authUser?.email ?? null);
  const signupProvider = resolveAdminAuthProvider({
    authUser: authUser
      ? {
          email: authUser.email ?? null,
          app_metadata: (authUser.app_metadata ?? null) as Record<string, unknown> | null,
          user_metadata: (authUser.user_metadata ?? null) as Record<string, unknown> | null,
          identities: (authUser.identities ?? []).map((row) => ({ provider: row.provider ?? null })),
        }
      : null,
    profile: profileForProvider,
    linkedProviders: linkedIdentities.map((row: { provider: string }) => row.provider),
    isManualTestUser:
      manualLoginId !== null &&
      !linkedIdentities.some((row: { provider: string }) => row.provider !== "email"),
  });

  const identities = (authUser?.identities ?? []).map((identity) => ({
    provider: String(identity.provider ?? "").trim() || null,
    identityId: String(identity.id ?? "").trim() || null,
    userId: String(identity.user_id ?? "").trim() || null,
  }));

  const passwordResetSupported = resolveMemberPasswordResetSupported({
    authUserPresent: Boolean(authUser),
    identityProviders: identities.map((row) => row.provider),
    authEmail: authUser?.email ?? null,
    profileAuthLoginEmail: profileAuthLoginEmail,
    profileAuthProvider: profile
      ? ((profile as { auth_provider?: string | null }).auth_provider ?? null)
      : null,
    profileProvider: profile ? ((profile as { provider?: string | null }).provider ?? null) : null,
    linkedSnsProviders: linkedIdentities.map((row: { provider: string }) => row.provider),
  });

  return NextResponse.json({
    ok: true,
    passwordResetSupported,
    signupProvider,
    manualLoginId,
    linkedIdentities,
    auth: authUser
      ? {
          email: authUser.email ?? null,
          emailConfirmedAt: authUser.email_confirmed_at ?? null,
          lastSignInAt: authUser.last_sign_in_at ?? null,
          providers: identities.map((row) => row.provider).filter(Boolean),
          identities,
        }
      : null,
    authLoadError: authUser ? null : authError,
    profile: profile
      ? {
          email: (profile as { email?: string | null }).email ?? null,
          authLoginEmail: (profile as { auth_login_email?: string | null }).auth_login_email ?? null,
          phone: (profile as { phone?: string | null }).phone ?? null,
          authProvider: (profile as { auth_provider?: string | null }).auth_provider ?? null,
          provider: (profile as { provider?: string | null }).provider ?? null,
          lastLoginAt: (profile as { last_login_at?: string | null }).last_login_at ?? null,
        }
      : null,
  });
}

/**
 * Admin password set/reset for a member Auth user.
 * Plaintext password is never readable; only replacement is supported.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const userId = id?.trim() ?? "";
  if (!userId || !isAdminMemberUuidSearch(userId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const password = String(body.password ?? "");
  const rule = checkAdminSetPassword(password, "member");
  if (!rule.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: rule.error,
        message: rule.messageKo,
        ...(rule.error === "password_min" ? { errorKey: "admin_users_err_password_min" } : {}),
      },
      { status: 400 }
    );
  }

  const targetGuard = await assertMemberPasswordChangeAllowed(gate.sb, {
    targetUserId: userId,
    actorUserId: gate.actor.userId,
    actorIsSuperAdmin: gate.actor.isSuperAdmin,
  });
  if (!targetGuard.ok) {
    void appendAuditLog(gate.sb, {
      actor_type: "admin",
      actor_id: gate.actor.userId,
      target_type: "member",
      target_id: userId,
      action: "PASSWORD_TEMP_SET_DENIED",
      after_json: {
        error: targetGuard.error,
        status: targetGuard.status,
        detail: "detail" in targetGuard ? targetGuard.detail ?? null : null,
        targetClass: "targetClass" in targetGuard ? targetGuard.targetClass ?? null : null,
        via: "auth_route",
      },
    });
    return NextResponse.json(
      {
        ok: false,
        error: targetGuard.error,
        message:
          targetGuard.error === "membership_lookup_failed"
            ? "회원 권한 정보를 확인할 수 없어 비밀번호를 변경할 수 없습니다."
            : targetGuard.error === "membership_unavailable"
              ? "관리자 권한 체계를 확인할 수 없어 비밀번호를 변경할 수 없습니다."
              : targetGuard.error === "forbidden_other_super_admin_target"
                ? "다른 최고 관리자 비밀번호는 변경할 수 없습니다."
              : undefined,
      },
      { status: targetGuard.status },
    );
  }

  const { data: authData, error: loadErr } = await gate.sb.auth.admin.getUserById(userId);
  if (loadErr || !authData?.user) {
    return NextResponse.json(
      { ok: false, error: "auth_user_not_found", message: loadErr?.message ?? "Auth user not found" },
      { status: 404 }
    );
  }

  const identityProviders = (authData.user.identities ?? []).map((identity) =>
    String(identity.provider ?? "").trim(),
  );
  const { data: profileHint } = await gate.sb
    .from("profiles")
    .select("auth_provider, provider, auth_login_email")
    .eq("id", userId)
    .maybeSingle();
  const patchLinked =
    (await loadLinkedIdentitiesMapChunked(gate.sb, [userId]).catch(() => new Map())).get(userId) ?? [];
  if (
    !resolveMemberPasswordResetSupported({
      authUserPresent: true,
      identityProviders,
      authEmail: authData.user.email ?? null,
      profileAuthLoginEmail: (profileHint as { auth_login_email?: string | null } | null)?.auth_login_email,
      profileAuthProvider: (profileHint as { auth_provider?: string | null } | null)?.auth_provider,
      profileProvider: (profileHint as { provider?: string | null } | null)?.provider,
      linkedSnsProviders: patchLinked.map((row: { provider: string }) => row.provider),
    })
  ) {
    return NextResponse.json(
      { ok: false, error: "password_reset_unsupported", message: "이 계정은 비밀번호 관리 대상이 아닙니다." },
      { status: 400 },
    );
  }

  const { error: updateErr } = await gate.sb.auth.admin.updateUserById(userId, { password });
  const weak = updateErr ? mapSupabaseWeakPasswordError(updateErr) : null;
  if (weak) {
    void appendAuditLog(gate.sb, {
      actor_type: "admin",
      actor_id: gate.actor.userId,
      target_type: "member",
      target_id: userId,
      action: "PASSWORD_TEMP_SET_REJECTED",
      after_json: { reasons: weak.reasons, via: "auth_route" },
    });
    return NextResponse.json(
      { ok: false, error: weak.error, reasons: weak.reasons, message: weak.messageKo },
      { status: 422 }
    );
  }
  if (updateErr) {
    return NextResponse.json(
      { ok: false, error: "password_update_failed", message: updateErr.message },
      { status: 500 }
    );
  }

  // Heal contact/login diverge so username login keeps working after temp password set.
  void ensureManualLoginEmailAligned(gate.sb, userId);

  void appendAuditLog(gate.sb, {
    actor_type: "admin",
    actor_id: gate.actor.userId,
    target_type: "member",
    target_id: userId,
    action: "PASSWORD_TEMP_SET",
    after_json: { targetClass: targetGuard.targetClass, via: "auth_route" },
  });

  return NextResponse.json({ ok: true });
}
