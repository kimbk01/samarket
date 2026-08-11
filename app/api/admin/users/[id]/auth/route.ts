import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { isAdminMemberUuidSearch } from "@/lib/admin-users/admin-member-list-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auth admin + profile auth fields. Server-only service role.
 * DO NOT: email existence → verified; provider from email domain.
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

  const identities = (authUser?.identities ?? []).map((identity) => ({
    provider: String(identity.provider ?? "").trim() || null,
    identityId: String(identity.id ?? "").trim() || null,
    userId: String(identity.user_id ?? "").trim() || null,
  }));

  return NextResponse.json({
    ok: true,
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
