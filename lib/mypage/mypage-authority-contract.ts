/**
 * Slice 2 Authority — Member MyPage Nav / CTA / Motion / Domain SSOT.
 *
 * CONTRACT:
 * - Domain root = BottomNav 내정보 `/mypage`
 * - Logout confirm = modal only (push confirm surface forbidden)
 * - Logout CTA kind = Danger only (`danger_button` | `menu_row`)
 * - Double-tap My on hub = scroll_only via `shouldMainBottomNavRouteScrollOnly`
 *
 * DO NOT: redesign hub UI (Slice 3); Design tokens (Slice 2.5); Auth/Messenger/Call/Badge.
 */

/** Member Domain navigation root (BottomNav 내정보). */
export const MYPAGE_DOMAIN_ROOT_PATH = "/mypage" as const;

/** Paths that must not render logout confirm UI (redirect to hub only). */
export const MYPAGE_LOGOUT_PUSH_CONFIRM_PATHS = [
  "/mypage/logout",
  "/my/logout",
] as const;

/**
 * Allowed LogoutActionTrigger variants under Slice 2 CTA Authority (Danger).
 * Profile hub must not use `text_link` or Primary styling.
 */
export const MYPAGE_LOGOUT_DANGER_VARIANTS = ["danger_button", "menu_row"] as const;

export type MypageLogoutDangerVariant = (typeof MYPAGE_LOGOUT_DANGER_VARIANTS)[number];

export function isMypageLogoutDangerVariant(v: string): v is MypageLogoutDangerVariant {
  return (MYPAGE_LOGOUT_DANGER_VARIANTS as readonly string[]).includes(v);
}

/** Forbidden on profile summary / hub primary chrome. */
export const MYPAGE_LOGOUT_FORBIDDEN_PROFILE_VARIANTS = [
  "text_link",
  "outlined_button",
] as const;

/**
 * Motion durations (ms) — Architecture LOCK ~300ms class.
 * Mirrors docs/customer-platform/03-NAVIGATION.md Motion Contract.
 */
export const MYPAGE_MOTION_MS = {
  push: 300,
  back: 300,
  modal: 200,
  sheet: 280,
  toast: 220,
  loading: 0,
  skeleton: 0,
} as const;

export type MypageMotionKind = keyof typeof MYPAGE_MOTION_MS;

/** Hub path used for double-tap My → scroll_only contract. */
export function isMypageDomainHubPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
  return p === MYPAGE_DOMAIN_ROOT_PATH;
}
