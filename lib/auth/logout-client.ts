import { clearBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { resetMessengerNotificationSurfacesAfterSignOut } from "@/lib/community-messenger/notifications/messenger-notification-surfaces-reset";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { getSupabaseClient } from "@/lib/supabase/client";

type LogoutResult =
  | { ok: true }
  | { ok: false; message: string };

function normalizeLogoutErrorMessage(raw: unknown): string {
  const message = String(raw ?? "").trim();
  return message || "로그아웃 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

async function verifySignedOut(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/session", {
      credentials: "include",
      cache: "no-store",
    });
    return res.status === 401;
  } catch {
    return false;
  }
}

export async function performClientLogout(): Promise<LogoutResult> {
  let response: Response;
  try {
    response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    return { ok: false, message: "로그아웃 요청을 서버에 전달하지 못했습니다. 다시 시도해 주세요." };
  }

  const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!response.ok || payload?.ok !== true) {
    return { ok: false, message: normalizeLogoutErrorMessage(payload?.error) };
  }

  try {
    const supabase = getSupabaseClient();
    await supabase?.auth.signOut();
  } catch {
    // Server logout succeeded. Verification below decides whether cookies are actually gone.
  }

  const signedOut = await verifySignedOut();
  if (!signedOut) {
    return { ok: false, message: "로그아웃 검증에 실패했습니다. 다시 시도해 주세요." };
  }

  invalidateMeProfileDedupedCache();
  clearBootstrapCache();
  resetMessengerNotificationSurfacesAfterSignOut();
  return { ok: true };
}
