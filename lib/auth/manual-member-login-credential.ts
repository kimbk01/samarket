/**
 * Manual member / staff login credential SSOT.
 * Contact email (profiles.email) must not move or wipe Auth sign-in identity.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasActiveAdminMembership } from "@/lib/admin/admin-membership";
import {
  isAdminProvisionedFormalMemberAuthProvider,
  isAdminProvisionedFormalMemberSignals,
} from "@/lib/auth/member-access";
import {
  buildManualMemberAuthEmail,
  MANUAL_MEMBER_EMAIL_SUFFIX,
} from "@/lib/auth/manual-member-email";
import {
  isDibaySyntheticAuthEmail,
  pickContactEmailForProfile,
} from "@/lib/auth/synthetic-auth-email";

export function isManualLoginCredentialAccount(input: {
  provider?: string | null;
  authProvider?: string | null;
  authEmail?: string | null;
  authLoginEmail?: string | null;
}): boolean {
  if (
    isAdminProvisionedFormalMemberSignals({
      authProvider: input.authProvider ?? input.provider,
      email: input.authEmail ?? input.authLoginEmail,
    })
  ) {
    return true;
  }
  const login = String(input.authLoginEmail ?? "").trim().toLowerCase();
  return login.endsWith(MANUAL_MEMBER_EMAIL_SUFFIX);
}

function resolveStableManualAuthEmail(input: {
  authEmail: string | null;
  username: string | null | undefined;
}): string | null {
  const auth = String(input.authEmail ?? "").trim().toLowerCase();
  if (auth.endsWith(MANUAL_MEMBER_EMAIL_SUFFIX)) return auth;
  const username = String(input.username ?? "").trim();
  if (username) return buildManualMemberAuthEmail(username);
  if (auth && !isDibaySyntheticAuthEmail(auth)) {
    // Drifted Auth email (contact) — prefer rebuild from username only.
    return null;
  }
  return auth || null;
}

/**
 * Map admin "연락 이메일" edits onto profile/Auth without breaking password login.
 */
export function resolveContactEmailCredentialPatch(input: {
  nextContactEmail: string | null;
  profile: {
    provider?: string | null;
    auth_provider?: string | null;
    username?: string | null;
    email?: string | null;
    auth_login_email?: string | null;
  };
  authEmail: string | null;
}): {
  profilePatch: { email?: string | null; auth_login_email?: string | null };
  authEmailUpdate?: string;
} {
  const raw = input.nextContactEmail;
  const nextContact =
    raw == null || raw === ""
      ? null
      : isDibaySyntheticAuthEmail(raw)
        ? null
        : pickContactEmailForProfile(raw);

  const manual = isManualLoginCredentialAccount({
    provider: input.profile.provider,
    authProvider: input.profile.auth_provider,
    authEmail: input.authEmail,
    authLoginEmail: input.profile.auth_login_email,
  });

  if (manual) {
    const profilePatch: { email?: string | null; auth_login_email?: string | null } = {
      email: nextContact,
    };
    const stableLogin = resolveStableManualAuthEmail({
      authEmail: input.authEmail,
      username: input.profile.username,
    });
    const currentLogin = String(input.profile.auth_login_email ?? "").trim().toLowerCase();
    if (stableLogin && currentLogin !== stableLogin) {
      profilePatch.auth_login_email = stableLogin;
    } else if (!currentLogin && stableLogin) {
      profilePatch.auth_login_email = stableLogin;
    }
    // Never move Auth.email from contact edits for manual/staff.
    return { profilePatch };
  }

  if (nextContact) {
    return {
      profilePatch: { email: nextContact, auth_login_email: nextContact },
      authEmailUpdate: nextContact,
    };
  }

  // Clear contact only — keep auth_login_email / Auth.email intact.
  return { profilePatch: { email: null } };
}

/**
 * After admin password set: restore Auth + auth_login_email to stable @manual.local
 * when the account is admin_manual / staff, without wiping a real contact email.
 */
export async function ensureManualLoginEmailAligned(
  sb: SupabaseClient,
  userId: string,
): Promise<{ repaired: boolean; loginEmail: string | null }> {
  const [{ data: authData }, profileRes] = await Promise.all([
    sb.auth.admin.getUserById(userId),
    sb
      .from("profiles")
      .select("username, email, auth_login_email, provider, auth_provider")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const profile = (profileRes.data ?? null) as {
    username?: string | null;
    email?: string | null;
    auth_login_email?: string | null;
    provider?: string | null;
    auth_provider?: string | null;
  } | null;

  const authEmail = String(authData?.user?.email ?? "").trim().toLowerCase() || null;
  if (!profile) return { repaired: false, loginEmail: authEmail };

  const manual = isManualLoginCredentialAccount({
    provider: profile.provider,
    authProvider: profile.auth_provider,
    authEmail,
    authLoginEmail: profile.auth_login_email,
  });
  if (!manual) return { repaired: false, loginEmail: authEmail };

  const username = String(profile.username ?? "").trim();
  const desiredAuthEmail =
    resolveStableManualAuthEmail({ authEmail, username }) ||
    (username ? buildManualMemberAuthEmail(username) : null);
  if (!desiredAuthEmail) return { repaired: false, loginEmail: authEmail };

  let repaired = false;

  if (authEmail !== desiredAuthEmail) {
    const { error } = await sb.auth.admin.updateUserById(userId, {
      email: desiredAuthEmail,
      email_confirm: true,
    });
    if (!error) repaired = true;
  }

  const patch: Record<string, unknown> = {};
  const currentLogin = String(profile.auth_login_email ?? "").trim().toLowerCase();
  if (currentLogin !== desiredAuthEmail) {
    patch.auth_login_email = desiredAuthEmail;
  }
  const profileEmail = String(profile.email ?? "").trim().toLowerCase();
  if (profileEmail && isDibaySyntheticAuthEmail(profileEmail)) {
    // Synthetic must not sit in contact column — login lives in auth_login_email / Auth.
    patch.email = null;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await sb.from("profiles").update(patch).eq("id", userId);
    if (!error) repaired = true;
  }

  return { repaired, loginEmail: desiredAuthEmail };
}

/**
 * SNS/native re-login must not overwrite passwords that admins manage
 * (active staff membership or admin_manual provisioned accounts).
 */
export async function shouldPreserveAdminManagedPassword(
  sb: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const id = String(userId ?? "").trim();
  if (!id) return false;
  if (await hasActiveAdminMembership(sb, id).catch(() => false)) return true;
  const { data: profile } = await sb
    .from("profiles")
    .select("provider, auth_provider")
    .eq("id", id)
    .maybeSingle();
  if (!profile) return false;
  return isAdminProvisionedFormalMemberAuthProvider(
    (profile as { auth_provider?: string | null }).auth_provider ??
      (profile as { provider?: string | null }).provider,
  );
}
