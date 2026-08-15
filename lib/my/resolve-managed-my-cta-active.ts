/**
 * Managed MyPage section strip — active route mapping (IA, not visual-only).
 *
 * `/mypage/trust` is reached from home profile manner row (`MypageProfileSummary`)
 * while the page mounts `section="account"` CTAs that do not list trust as its own tab.
 * Map trust → account home (`/mypage`) so active is never null on that strip.
 */
export function resolveManagedMyCtaActive(pathname: string, href: string): boolean {
  const p = (pathname.split("?")[0] ?? "").trim();
  const h = (href.split("?")[0] ?? "").trim();
  if (!p || !h) return false;
  if (p === h) return true;

  if (
    (p === "/mypage/trust" || p === "/my/trust") &&
    (h === "/mypage" || h === "/my")
  ) {
    return true;
  }

  if (h === "/mypage" || h === "/my" || h === "/community") return false;
  return p.startsWith(`${h}/`);
}
