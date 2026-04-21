/** `/community/*` 레거시·리다이렉트 경로 — 전역 토큰과 동일 셸 */
export default function CommunityRouteGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sam-app text-sam-fg">
      {children}
    </div>
  );
}
