/** `/community/*` 레거시·리다이렉트 경로 — 전역 토큰과 동일 셸 */
export default function CommunityRouteGroupLayout({ children }: { children: React.ReactNode }) {
  return <div className="sam-domain-shell">{children}</div>;
}
