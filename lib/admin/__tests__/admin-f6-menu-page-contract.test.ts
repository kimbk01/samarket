/**
 * 설계 v4 §7 페이지 골격 · F6-B 전면 적용 계약.
 *
 * 1. 제목 = 메뉴 라벨 — 비도메인 작업 공간(회원·권한 · 결제·정산 · 광고·배너 · 플랫폼 운영 · 고객지원 · 알림 · 시스템/내부 도구)
 *    의 leaf 화면은 메뉴 `titleKey` 와 같은 i18n 키로 제목을 그린다 (정적 소스 검사).
 *    도메인 작업 공간(배달·매장 · 거래 · 커뮤니티 · 채팅)은 Owner 승인 완료 — 대상 아님.
 * 2. 메뉴 진입 — path leaf 마다 app/admin 페이지 파일(리다이렉트 전용 page.tsx 포함)이 있고,
 *    pendingRoute leaf 는 공개 사이드바에서 숨긴다.
 * 3. 권한 일치 — 모든 leaf 는 접근표 규칙에 걸리고, `roles: ["master"]` leaf 는 super_admin 요구로 해석된다.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  adminMenu,
  collectAdminMenuPathEntries,
  filterMenuForPublicSidebar,
  type AdminMenuItem,
} from "@/components/admin/admin-menu";
import { resolveAdminRouteAccess } from "@/lib/admin/access/admin-route-access";

const ROOT = process.cwd();

type Leaf = {
  workspace: string;
  key: string;
  path: string;
  titleKey?: string;
  roles: readonly string[];
  pendingRoute?: true;
  sidebarHidden: boolean;
};

function collectLeaves(): Leaf[] {
  const out: Leaf[] = [];
  const walk = (node: AdminMenuItem, workspace: string, roles: readonly string[], hidden: boolean) => {
    const r = node.roles?.length ? node.roles : roles;
    const h = hidden || node.sidebarPublic === false;
    if (node.path) {
      out.push({
        workspace,
        key: node.key,
        path: node.path,
        titleKey: node.titleKey,
        roles: r,
        pendingRoute: node.pendingRoute,
        sidebarHidden: h,
      });
    }
    for (const c of node.children ?? []) walk(c, workspace, r, h);
  };
  for (const top of adminMenu) walk(top, top.key, top.roles ?? [], false);
  return out;
}

const LEAVES = collectLeaves();
const stripQueryHash = (p: string) => p.split(/[?#]/)[0];

/** URL → app/admin page 파일 (라우트 그룹 `(x)` 은 URL 에서 빠진다). */
function collectAdminPages(): Map<string, string> {
  const pages = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/^page\.(tsx|ts|jsx|js)$/.test(name)) {
        const segs = path
          .relative(path.join(ROOT, "app"), path.dirname(full))
          .split(path.sep)
          .filter((s) => !/^\(.*\)$/.test(s));
        pages.set(`/${segs.join("/")}`, path.relative(ROOT, full).split(path.sep).join("/"));
      }
    }
  };
  walk(path.join(ROOT, "app/admin"));
  return pages;
}

// ───────────────────────────────────────────── 1. 제목 = 메뉴 라벨

const DOMAIN_WORKSPACES = new Set(["dashboard", "delivery", "trade", "community", "messenger"]);

/** leaf key → 제목을 그리는 파일. 파일 안에서 메뉴 titleKey 를 제목으로 넘긴다. */
const TITLE_SOURCE_BY_LEAF: Readonly<Record<string, string>> = {
  // 회원·권한
  users: "components/admin/users/AdminUserListPage.tsx",
  "users-phone-verification": "components/admin/users/AdminPhoneVerificationOpsPage.tsx",
  "users-deletion-requests": "app/admin/users/deletion-requests/page.tsx",
  "global-reports": "components/admin/reports/AdminReportListPage.tsx",
  "reports-logs": "components/admin/reports/AdminSanctionLedgerPage.tsx",
  "audit-logs": "components/admin/AdminAuditLogsPage.tsx",
  "admin-staff": "components/admin/staff/AdminStaffAccountsPage.tsx",
  // 결제·정산
  "store-finance-admin": "app/admin/finance/page.tsx",
  "points-charge": "components/admin/points/AdminPointChargeListPage.tsx",
  "points-ledger": "components/admin/points/AdminPointLedgerPage.tsx",
  "points-plans": "components/admin/points/AdminPointPlansPage.tsx",
  "points-policy": "components/admin/point-policies/AdminPointPolicyPage.tsx",
  "points-execute": "components/admin/point-executions/AdminPointExecutionPage.tsx",
  "points-expire": "components/admin/points/AdminPointExpirePage.tsx",
  "finance-transactions": "app/admin/finance/transactions/page.tsx",
  "finance-stores": "app/admin/finance/stores/page.tsx",
  "finance-orders": "app/admin/finance/orders/page.tsx",
  "finance-outstanding": "app/admin/finance/outstanding/page.tsx",
  "finance-ads": "app/admin/finance/ads/page.tsx",
  "finance-withdrawals": "app/admin/finance/withdrawals/page.tsx",
  "finance-settings": "app/admin/finance/settings/page.tsx",
  // 광고·배너
  "ads-advertising-workspace": "components/admin/ads/AdminAdvertisingWorkspace.tsx",
  "ads-authority-boosts": "components/admin/ads/AdminAdvertisingWorkspace.tsx",
  "ads-authority-applications": "components/admin/ads/AdminAdvertisingWorkspace.tsx",
  "ads-authority-operations": "components/admin/ads/AdminAdvertisingWorkspace.tsx",
  "ads-authority-placements": "components/admin/ads/AdminAdsPlacementManagementView.tsx",
  "ads-authority-products": "components/admin/ads/AdminAdsProductsCommercialView.tsx",
  "ads-authority-history": "components/admin/ads/AdminAdsHistoryLedgerView.tsx",
  "ads-banners-overview": "components/admin/banners-overview/AdminBannersOverviewPage.tsx",
  "delivery-ads-ops": "components/admin/stores/AdminDeliveryAdsControlPlane.tsx",
  "ads-placement-map": "components/admin/stores/AdminDeliveryAdInventoryManagementView.tsx",
  "ads-feed-products": "components/admin/ads/AdminFeedAdProductsClient.tsx",
  "delivery-ads-commercial": "components/admin/stores/AdminDeliveryAdCommercialSettingsView.tsx",
  // 플랫폼 운영
  "promotion-home": "components/admin/platform-promotion/AdminPromotionLandingClient.tsx",
  "promotion-events": "components/admin/platform-events/AdminPlatformEventsListClient.tsx",
  "promotion-popup": "components/admin/platform-popup/AdminPlatformPopupListPage.tsx",
  "promotion-banners": "components/admin/platform-promotion/AdminPromotionBannerListClient.tsx",
  "promotion-owner-requests": "components/admin/platform-events/AdminPlatformEventOwnerRequestQueueClient.tsx",
  "settings-os-start": "components/admin/settings/OsLaunchAdminPage.tsx",
  "settings-intro": "components/admin/launch-intro/LaunchIntroAdminPage.tsx",
  "settings-startup-config": "components/admin/settings/StartupConfigAdminPage.tsx",
  "menu-main-bottom-nav": "components/admin/menus/AdminMainBottomNavPage.tsx",
  "my-banners": "components/admin/my/AdminMyBannersPage.tsx",
  "my-sections": "components/admin/my/AdminMySectionsPage.tsx",
  "my-services": "components/admin/my/AdminMyServicesPage.tsx",
  "manage-ab": "components/admin/recommendation-experiments/AdminRecommendationExperimentPage.tsx",
  "rec-analytics": "components/admin/recommendation/AdminRecommendationAnalyticsPage.tsx",
  "rec-monitoring": "components/admin/recommendation-monitoring/AdminRecommendationMonitoringPage.tsx",
  "rec-deployments": "components/admin/recommendation-deployments/AdminRecommendationDeploymentPage.tsx",
  "rec-automation": "components/admin/recommendation-automation/AdminRecommendationAutomationPage.tsx",
  "manage-reports": "components/admin/recommendation-reports/AdminRecommendationReportsPage.tsx",
  "cp-notice": "components/admin/app/AdminAppNoticesPage.tsx",
  "cp-legal": "components/admin/app/AdminAppLegalDocumentsPage.tsx",
  "cp-business": "components/admin/app/AdminAppBusinessInfoPage.tsx",
  // 고객지원
  "cp-support-center": "components/admin/support/AdminSupportPage.tsx",
  "cp-support-archive": "components/admin/support/AdminSupportArchivePage.tsx",
  "admin-inbox": "components/admin/inbox/AdminInboxPageClient.tsx",
  "delivery-order-notifications": "components/admin/order-notifications/AdminOrderNotificationsPageClient.tsx",
  // 알림
  "cp-notification-engine": "components/admin/notifications/AdminNotificationCampaignsPage.tsx",
  "settings-notifications": "components/admin/settings/AdminNotificationDomainsSettings.tsx",
  "push-devices": "components/admin/push/AdminPushDevicesPage.tsx",
  // 시스템
  "cp-dashboard": "components/admin/customer-platform/CustomerPlatformDashboardPage.tsx",
  "system-status": "components/admin/system/AdminSystemPage.tsx",
  "runtime-health": "components/admin/system/AdminRuntimeHealthPage.tsx",
  "delivery-release-gate": "components/admin/system/AdminDeliveryReleaseGatePage.tsx",
  "system-deploy": "app/admin/system/deploy/page.tsx",
  "settings-general": "components/admin/settings/AdminSettingsPage.tsx",
  "settings-auth": "components/admin/settings/AuthLoginSettingsForm.tsx",
  "system-prelaunch-reset": "components/admin/system/AdminDataResetPage.tsx",
  "ops-docs-board": "components/admin/docs/AdminBoardGuideClient.tsx",
  "app-countries": "components/admin/app/AdminAppCountriesPage.tsx",
  "app-languages": "components/admin/app/AdminAppLanguagesPage.tsx",
  "app-meta": "components/admin/app/AdminAppMetaPage.tsx",
  // 시스템 · 내부 도구
  "manage-ops-board": "components/admin/ops-board/AdminOpsBoardPage.tsx",
  "manage-docs": "components/admin/ops-docs/AdminOpsDocsPage.tsx",
  "manage-runbooks": "components/admin/ops-runbooks/AdminOpsRunbookPage.tsx",
  "manage-kb": "components/admin/ops-knowledge/AdminOpsKnowledgePage.tsx",
  "manage-kg": "components/admin/ops-knowledge-graph/AdminOpsKnowledgeGraphPage.tsx",
  "manage-learning": "components/admin/ops-learning/AdminOpsLearningPage.tsx",
  "manage-maturity": "components/admin/ops-maturity/AdminOpsMaturityPage.tsx",
  "manage-benchmarks": "components/admin/ops-benchmarks/AdminOpsBenchmarksPage.tsx",
  "system-qa": "components/admin/qa-board/AdminQaBoardPage.tsx",
  "system-longrun": "components/admin/ops-routines/AdminOpsRoutinesPage.tsx",
  "system-backlog": "components/admin/product-backlog/AdminProductBacklogPage.tsx",
  "system-sprint": "components/admin/dev-sprints/AdminDevSprintsPage.tsx",
  "system-release-notes": "components/admin/release-notes/AdminReleaseNotesPage.tsx",
  "system-release-archive": "components/admin/release-archive/AdminReleaseArchivePage.tsx",
  "system-release-migration": "components/admin/production-migration/AdminProductionMigrationPage.tsx",
  "system-backup": "components/admin/backup/AdminBackupPage.tsx",
  "system-dr": "components/admin/dr/AdminDrPage.tsx",
  "system-automation": "components/admin/automation/AdminAutomationPage.tsx",
  "ops-launch-readiness": "components/admin/launch-readiness/AdminLaunchReadinessPage.tsx",
  "ops-launch-week": "components/admin/launch-week/AdminLaunchWeekPage.tsx",
  "system-security": "components/admin/security/AdminSecurityPage.tsx",
  "system-performance": "components/admin/performance/AdminPerformancePage.tsx",
  "system-usage": "components/admin/usage/AdminUsagePage.tsx",
  "ops-memo": "app/admin/memo/page.tsx",
};

/** 제목이 메뉴 라벨과 의도적으로 다르거나 이 계약으로 검사하지 않는 leaf — 사유 필수. */
const TITLE_EXCEPTIONS: Readonly<Record<string, string>> = {
  "store-point-ledger-admin": "`?wallet=COIN` 쿼리 변형 — 「전체 거래」 화면을 공유하며 제목은 기준 leaf 라벨",
  "finance-cash": "`?wallet=CASH` 쿼리 변형 — 「전체 거래」 화면을 공유하며 제목은 기준 leaf 라벨",
  "cp-monitoring": "`#monitoring` 해시 — 「시스템 개요」 화면 안 섹션 (섹션 제목이 메뉴 라벨)",
  "delivery-ads-control": "리다이렉트 전용 (/admin/advertising) — 제목은 이동한 화면이 소유",
  "ads-feed-applications": "리다이렉트 전용 (/admin/advertising/applications)",
  "ads-applications": "리다이렉트 전용 (/admin/advertising/boosts)",
  "ads-community-promote": "리다이렉트 전용 (/admin/community/promotions)",
  "ads-feed": "리다이렉트 전용 (/admin/advertising/operations)",
  "ads-paid": "리다이렉트 전용 (/admin/advertising/history)",
  "cp-faq": "pendingRoute — 페이지 없음 (사이드바 숨김)",
  "promotion-ptr-ads": "ptr-reveal 동시 작업 파일 — 제목 문구는 이미 메뉴 라벨과 같음(하드코딩), 병합 후 키로 교체",
  "system-hotfix": "feed-emergency 동시 작업 파일 — 병합 후 메뉴 키로 교체",
  // Admin IA R1 (2026-10-30 Owner 권장안 승인)
  "ads-banners-promotion": "`?from=ads` 진입점 — 「프로모션 배너」 화면을 공유하며 제목은 기준 leaf(promotion-banners) 라벨",
  "ads-banners-mypage": "`?from=ads` 진입점 — 「마이페이지 배너」 화면을 공유하며 제목은 기준 leaf(my-banners) 라벨",
  "member-benefits": "메뉴 밖이던 기존 화면을 노출만 함 (J-6) — 화면 제목은 기존 「회원 혜택」 문구 유지",
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 제목 위치에서 키를 쓰는지 (titleKey prop · t/tr/safeT 호출 · 키 반환 헬퍼). */
function usesKeyAsTitle(src: string, key: string): boolean {
  const k = escapeRe(key);
  return new RegExp(`titleKey=\\s*"${k}"|\\b(?:t|tr|safeT)\\(\\s*"${k}"|return\\s+"${k}"`).test(src);
}

describe("F6-B 제목 = 메뉴 라벨 (비도메인 작업 공간)", () => {
  const nonDomain = LEAVES.filter((l) => !DOMAIN_WORKSPACES.has(l.workspace));

  it("비도메인 leaf 는 전부 계약 목록 또는 예외 목록에 있다 (한쪽에만)", () => {
    const missing = nonDomain
      .filter((l) => !(l.key in TITLE_SOURCE_BY_LEAF) && !(l.key in TITLE_EXCEPTIONS))
      .map((l) => `${l.workspace}/${l.key} ${l.path}`);
    expect(missing).toEqual([]);
    const both = Object.keys(TITLE_SOURCE_BY_LEAF).filter((k) => k in TITLE_EXCEPTIONS);
    expect(both).toEqual([]);
    const known = new Set(nonDomain.map((l) => l.key));
    const stale = [...Object.keys(TITLE_SOURCE_BY_LEAF), ...Object.keys(TITLE_EXCEPTIONS)].filter((k) => !known.has(k));
    expect(stale).toEqual([]);
  });

  it("각 화면은 메뉴 titleKey 를 제목으로 넘긴다", () => {
    const bad: string[] = [];
    for (const leaf of nonDomain) {
      const file = TITLE_SOURCE_BY_LEAF[leaf.key];
      if (!file) continue;
      expect(leaf.titleKey, leaf.key).toBeTruthy();
      const full = path.join(ROOT, file);
      if (!existsSync(full)) {
        bad.push(`${leaf.key}: ${file} 없음`);
        continue;
      }
      if (!usesKeyAsTitle(readFileSync(full, "utf8"), String(leaf.titleKey))) {
        bad.push(`${leaf.key}: ${file} 가 ${leaf.titleKey} 를 제목으로 쓰지 않음`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("예외마다 사유가 있다", () => {
    for (const [key, reason] of Object.entries(TITLE_EXCEPTIONS)) expect(reason.trim().length, key).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────── 2. 메뉴 진입

/** next.config redirects() 등 page 파일 없이 처리되는 leaf 경로 (현재 없음 — 추가 시 사유 필수). */
const KNOWN_CONFIG_REDIRECT_PATHS: Readonly<Record<string, string>> = {};

describe("F6-B 메뉴 진입 계약", () => {
  const pages = collectAdminPages();
  const entries = collectAdminMenuPathEntries(adminMenu);

  it("path leaf 마다 app/admin 페이지 파일이 있다 (pendingRoute 제외)", () => {
    const missing = entries
      .filter((e) => !e.pendingRoute)
      .map((e) => ({ ...e, url: stripQueryHash(e.path) }))
      .filter((e) => !pages.has(e.url) && !(e.url in KNOWN_CONFIG_REDIRECT_PATHS))
      .map((e) => `${e.key} ${e.path}`);
    expect(missing).toEqual([]);
  });

  it("pendingRoute leaf 는 공개 사이드바에서 숨긴다", () => {
    const pending = LEAVES.filter((l) => l.pendingRoute);
    expect(pending.filter((l) => !l.sidebarHidden).map((l) => l.key)).toEqual([]);
    const visible = new Set(collectAdminMenuPathEntries(filterMenuForPublicSidebar(adminMenu)).map((e) => e.key));
    expect(pending.filter((l) => visible.has(l.key)).map((l) => l.key)).toEqual([]);
  });
});

// ───────────────────────────────────────────── 3. 권한 일치

/**
 * `roles: ["master"]` 인데 접근표 화면 요구가 super_admin 이 아닌 leaf.
 * 접근표는 서버가 실제로 강제하는 권한을 옮긴 것이고 F6-B 는 권한을 바꾸지 않는다 — 사유 필수.
 * `viewAnyActionSuper` = 조회는 관리자 전원, 쓰기 작업은 super_admin.
 */
// IA-06 (Owner 승인 2026-10-30): 예전 예외(/admin/system·memo·runtime-health·delivery-release-gate·feed-emergency)는
// 접근표에서 화면 자체를 super_admin 으로 맞춰 모두 없어졌다 (메뉴 노출 = 화면 게이트).
const MASTER_ROLE_ACCESS_EXCEPTIONS: Readonly<Record<string, { viewAnyActionSuper: boolean; reason: string }>> = {};

describe("F6-B 메뉴 역할 ↔ 접근표 일치", () => {
  it("모든 leaf 는 접근표 규칙에 걸린다", () => {
    const unmatched = LEAVES.filter((l) => !resolveAdminRouteAccess(l.path).matched).map((l) => `${l.key} ${l.path}`);
    expect(unmatched).toEqual([]);
  });

  it("최고관리자 전용(roles master) leaf 는 super_admin 요구로 해석된다", () => {
    const bad: string[] = [];
    for (const leaf of LEAVES.filter((l) => l.roles.includes("master"))) {
      const r = resolveAdminRouteAccess(leaf.path);
      const url = stripQueryHash(leaf.path);
      const exc = MASTER_ROLE_ACCESS_EXCEPTIONS[url];
      if (!exc) {
        if (r.requirement.kind !== "super_admin") bad.push(`${leaf.key} ${leaf.path} → ${r.requirement.kind}`);
        continue;
      }
      if (exc.viewAnyActionSuper) {
        if (r.requirement.kind !== "any_admin" || r.actionRequirement.kind !== "super_admin") {
          bad.push(`${leaf.key} 예외 형태 불일치 (${r.requirement.kind}/${r.actionRequirement.kind})`);
        }
      } else if (r.requirement.kind === "super_admin") {
        bad.push(`${leaf.key} 은 이제 super_admin — 예외에서 지운다`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("예외 경로는 실제 master leaf 다 (낡은 예외 금지)", () => {
    const masterUrls = new Set(LEAVES.filter((l) => l.roles.includes("master")).map((l) => stripQueryHash(l.path)));
    expect(Object.keys(MASTER_ROLE_ACCESS_EXCEPTIONS).filter((u) => !masterUrls.has(u))).toEqual([]);
  });

  it("최고관리자 전용 leaf 가 아닌데 super_admin 요구인 화면은 메뉴에서도 master 다 (역방향)", () => {
    const leaks = LEAVES.filter(
      (l) => !l.roles.includes("master") && resolveAdminRouteAccess(l.path).requirement.kind === "super_admin"
    ).map((l) => `${l.workspace}/${l.key} ${l.path}`);
    expect(leaks).toEqual([]);
  });
});
