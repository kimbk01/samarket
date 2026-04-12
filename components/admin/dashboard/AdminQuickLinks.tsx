"use client";

import Link from "next/link";

const LINKS: { href: string; label: string }[] = [
  { href: "/admin/products", label: "상품관리" },
  { href: "/admin/users", label: "회원관리" },
  { href: "/admin/reports", label: "신고관리" },
  { href: "/admin/chats", label: "채팅관리" },
  { href: "/admin/reviews", label: "리뷰관리" },
  { href: "/admin/banners", label: "배너관리" },
  { href: "/admin/business", label: "상점관리" },
  { href: "/admin/ad-applications", label: "광고신청" },
  { href: "/admin/promoted-items", label: "유료노출" },
  { href: "/admin/point-charges", label: "포인트충전" },
  { href: "/admin/points/ledger", label: "포인트원장" },
  { href: "/admin/point-policies", label: "포인트정책" },
  { href: "/admin/point-executions", label: "포인트실행" },
  { href: "/admin/points/expire", label: "포인트만료" },
  { href: "/admin/member-benefits", label: "회원혜택" },
  { href: "/admin/exposure-policies", label: "노출정책" },
  { href: "/admin/home-feed", label: "홈피드" },
  { href: "/admin/personalized-feed", label: "개인화추천" },
  { href: "/admin/recommendation-analytics", label: "추천분석" },
  { href: "/admin/recommendation-experiments", label: "A/B실험" },
  { href: "/admin/recommendation-deployments", label: "추천배포" },
  { href: "/admin/feed-emergency", label: "피드장애대응" },
  { href: "/admin/recommendation-monitoring", label: "추천모니터링" },
  { href: "/admin/recommendation-automation", label: "추천자동화" },
  { href: "/admin/recommendation-reports", label: "추천보고서" },
  { href: "/admin/ops-board", label: "운영보드" },
  { href: "/admin/ops-docs", label: "운영문서" },
  { href: "/admin/ops-runbooks", label: "런북실행" },
  { href: "/admin/ops-knowledge", label: "지식베이스" },
  { href: "/admin/ops-knowledge-graph", label: "지식그래프" },
  { href: "/admin/ops-learning", label: "운영학습" },
  { href: "/admin/ops-maturity", label: "운영성숙도" },
  { href: "/admin/ops-benchmarks", label: "운영벤치마크" },
  { href: "/admin/launch-readiness", label: "런칭준비" },
  { href: "/admin/production-migration", label: "프로덕션전환" },
  { href: "/admin/qa-board", label: "QA보드" },
  { href: "/admin/launch-week", label: "첫주관제" },
  { href: "/admin/ops-routines", label: "장기운영" },
  { href: "/admin/product-backlog", label: "제품백로그" },
  { href: "/admin/dev-sprints", label: "스프린트" },
  { href: "/admin/release-notes", label: "릴리즈노트" },
  { href: "/admin/release-archive", label: "릴리즈아카이브" },
  { href: "/admin/backup", label: "백업/복구" },
  { href: "/admin/dr", label: "DR시나리오" },
  { href: "/admin/security", label: "보안점검" },
  { href: "/admin/performance", label: "성능" },
  { href: "/admin/usage", label: "비용" },
  { href: "/admin/automation", label: "자동화" },
  { href: "/admin/system", label: "시스템상태" },
  { href: "/admin/settings", label: "설정관리" },
  { href: "/admin/audit-logs", label: "로그감사" },
];

export function AdminQuickLinks() {
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <h2 className="mb-3 text-[15px] font-medium text-sam-fg">빠른 이동</h2>
      <ul className="flex flex-wrap gap-2">
        {LINKS.map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              className="inline-block rounded border border-sam-border bg-sam-app px-3 py-2 text-[14px] text-sam-fg hover:border-signature hover:bg-signature/5 hover:text-signature"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
