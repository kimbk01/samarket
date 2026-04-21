import "@/app/flat-community-ui-skin.css";

/** `/community/*` 레거시·리다이렉트 경로 — Philife 와 동일 플랫 셸 */
export default function CommunityRouteGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-community-flat-ui className="flex min-h-0 min-w-0 flex-1 flex-col bg-sam-app text-sam-fg">
      {children}
    </div>
  );
}
