/**
 * V3-12 (X-9) ratchet — 관리자 변경 API(POST/PATCH/PUT/DELETE)는 감사 로그를 남겨야 한다.
 *
 * 판정: route.ts 소스 또는 그 파일이 직접 import 하는 모듈(1 hop) 안에서 기존 감사 헬퍼를 호출하면 통과.
 * 제외: 다른 route 를 그대로 re-export 하는 shim, 변경 핸들러가 모두 410(Gone)만 반환하는 route.
 *
 * `UNAUDITED_ADMIN_MUTATING_ROUTES_ALLOWLIST` 는 도입 시점 스냅샷이다 — **줄어들기만 해야 한다.**
 *  - 새 변경 route 가 감사 없이 추가되면 실패.
 *  - 목록에 있던 route 에 감사가 추가되면 실패(목록에서 지우도록 강제).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const ADMIN_API_DIR = path.join(ROOT, "app/api/admin");

const AUDIT_CALL_PATTERNS: RegExp[] = [
  /\b(appendAuditLog|appendAdminRouteAudit|appendAdminSettingsBundleAudit|appendCommunityAdminAudit|writeCampaignAuditLog|appendUserPointLedgerAudit|appendChatContentViewAudit|writeLifecycleAudit|logExplicitLogoutAudit)\s*\(/,
  /\.from\(\s*["'`][a-z_]*audit[a-z_]*["'`]\s*\)\s*\.insert\(/,
  /\.from\(\s*[A-Z_]*AUDIT[A-Z_]*\s*\)\s*\.insert\(/,
];

const MUTATING = "(POST|PATCH|PUT|DELETE)";

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      out.push(...listRouteFiles(full));
    } else if (name === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

function hasAuditCall(src: string): boolean {
  return AUDIT_CALL_PATTERNS.some((re) => re.test(src));
}

function exportsMutatingHandler(src: string): boolean {
  return (
    new RegExp(`export\\s+(async\\s+)?function\\s+${MUTATING}\\b`).test(src) ||
    new RegExp(`export\\s+const\\s+${MUTATING}\\b`).test(src) ||
    new RegExp(`export\\s*\\{[^}]*\\b${MUTATING}\\b[^}]*\\}`).test(src)
  );
}

/** `export { POST } from "../other/route"` 형태의 shim — 원본 route 가 따로 검사된다. */
function isReExportShim(src: string): boolean {
  return (
    new RegExp(`export\\s*\\{[^}]*\\b${MUTATING}\\b[^}]*\\}\\s*from\\s*["']`).test(src) &&
    !new RegExp(`export\\s+(async\\s+)?function\\s+${MUTATING}\\b`).test(src)
  );
}

/** 변경 핸들러 본문이 모두 (가드 이후) 410 만 반환하는 퇴역 route. */
function isGoneOnlyRoute(src: string): boolean {
  const re = new RegExp(`export\\s+(async\\s+)?function\\s+${MUTATING}\\b`, "g");
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) starts.push(m.index);
  if (starts.length === 0) return false;
  return starts.every((start) => {
    const rest = src.slice(start + 10);
    const nextExport = rest.search(/\nexport\s/);
    const body = nextExport >= 0 ? rest.slice(0, nextExport) : rest;
    const withoutGuards = body
      .split("\n")
      .filter((line) => !/await\s+require\w*\(/.test(line))
      .join("\n");
    return /\b410\b/.test(body) && !/\bawait\s/.test(withoutGuards);
  });
}

function resolveImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function importedSources(file: string, src: string): string[] {
  const out: string[] = [];
  const re = /(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const spec = m[1] ?? m[2];
    if (!spec) continue;
    const resolved = resolveImport(file, spec);
    if (resolved) out.push(readFileSync(resolved, "utf8"));
  }
  return out;
}

function computeUnauditedMutatingRoutes(): string[] {
  const missing: string[] = [];
  for (const file of listRouteFiles(ADMIN_API_DIR)) {
    const src = readFileSync(file, "utf8");
    if (!exportsMutatingHandler(src)) continue;
    if (isReExportShim(src) || isGoneOnlyRoute(src)) continue;
    if (hasAuditCall(src)) continue;
    if (importedSources(file, src).some(hasAuditCall)) continue;
    missing.push(path.relative(ROOT, file).split(path.sep).join("/"));
  }
  return missing.sort();
}

/**
 * 도입 시점(2026-10-20) 감사 미기록 변경 route 스냅샷 — 줄어들기만 해야 한다(추가 금지).
 */
const UNAUDITED_ADMIN_MUTATING_ROUTES_ALLOWLIST: readonly string[] = [
  "app/api/admin/ad-applications/[id]/route.ts",
  "app/api/admin/ad-products/[id]/route.ts",
  "app/api/admin/ads/[adId]/route.ts",
  "app/api/admin/advertising/direct-popup/route.ts",
  "app/api/admin/app-notices/upload-image/route.ts",
  "app/api/admin/community-messenger-home-cutover-gate/route.ts",
  "app/api/admin/community/external-import/collect/route.ts",
  "app/api/admin/delivery-ads/[campaignId]/messages/read/route.ts",
  "app/api/admin/delivery-ads/[campaignId]/messages/route.ts",
  "app/api/admin/delivery-ads/partner/memberships/route.ts",
  "app/api/admin/delivery-ads/upload-banner-image/route.ts",
  "app/api/admin/exposure-policies/[id]/route.ts",
  "app/api/admin/exposure-policies/simulate/route.ts",
  "app/api/admin/feed-ads/route.ts",
  "app/api/admin/feed-ads/upload/route.ts",
  "app/api/admin/gift-certificates/applications/[id]/route.ts",
  "app/api/admin/gift-certificates/conversions/[id]/approve/route.ts",
  "app/api/admin/gift-certificates/instances/[id]/corrective/route.ts",
  "app/api/admin/gift-certificates/products/[id]/route.ts",
  "app/api/admin/gift-certificates/products/route.ts",
  "app/api/admin/gift-certificates/promo/settle/route.ts",
  "app/api/admin/gift-certificates/upload-image/route.ts",
  "app/api/admin/home-feed-policies/route.ts",
  "app/api/admin/inbox/read/route.ts",
  "app/api/admin/launch-intro/publish/route.ts",
  "app/api/admin/launch-intro/route.ts",
  "app/api/admin/launch-intro/state/route.ts",
  "app/api/admin/launch-intro/upload/route.ts",
  "app/api/admin/member-benefits/[id]/route.ts",
  "app/api/admin/member-benefits/route.ts",
  "app/api/admin/messenger-call-sounds/route.ts",
  "app/api/admin/messenger-call-sounds/upload/route.ts",
  "app/api/admin/notification-campaigns/[campaignId]/test-send/route.ts",
  "app/api/admin/notification-campaigns/audience-preview/route.ts",
  "app/api/admin/notification-campaigns/upload-image/route.ts",
  "app/api/admin/notification-settings/route.ts",
  "app/api/admin/notification-settings/upload-sound/route.ts",
  "app/api/admin/notification-sound-ssot/preview-resolver/route.ts",
  "app/api/admin/notification-sound-ssot/upload/route.ts",
  "app/api/admin/os-launch/logo/route.ts",
  "app/api/admin/os-launch/route.ts",
  "app/api/admin/personalized-feed-policies/route.ts",
  "app/api/admin/platform-events/[eventId]/distribution/route.ts",
  "app/api/admin/platform-events/[eventId]/route.ts",
  "app/api/admin/platform-events/route.ts",
  "app/api/admin/platform-events/upload-image/route.ts",
  "app/api/admin/point-expire/simulate/route.ts",
  "app/api/admin/point-policies/simulate/route.ts",
  "app/api/admin/prelaunch-reset/dry-run/route.ts",
  "app/api/admin/prelaunch-reset/execute/route.ts",
  "app/api/admin/recommendation-analytics/route.ts",
  "app/api/admin/recommendation-experiments/route.ts",
  "app/api/admin/recommendation-ops/route.ts",
  "app/api/admin/recommendation-runtime/route.ts",
  "app/api/admin/reports/[reportId]/action/route.ts",
  "app/api/admin/service-categories/route.ts",
  "app/api/admin/settings/auth-phone/route.ts",
  "app/api/admin/store-orders/[orderId]/mark-paid/route.ts",
  "app/api/admin/store-point-policies/route.ts",
  "app/api/admin/stores-composition-policy/route.ts",
  "app/api/admin/stores-home-before-rest-banner/route.ts",
  "app/api/admin/support/cases/[caseId]/route.ts",
  "app/api/admin/support/cases/route.ts",
  "app/api/admin/support/guidance/route.ts",
  "app/api/admin/system-ops/route.ts",
  "app/api/admin/trade-completion/route.ts",
  "app/api/admin/trade-flow/route.ts",
  "app/api/admin/trade-promotion-orders/[id]/route.ts",
  "app/api/admin/trade/posts/[id]/moderation/route.ts",
  "app/api/admin/trade/posts/[id]/route.ts",
  "app/api/admin/trade/promotions/[id]/route.ts",
  "app/api/admin/trade/reports/[id]/route.ts",
  "app/api/admin/trade/restrictions/[id]/revoke/route.ts",
  "app/api/admin/trade/restrictions/route.ts",
  "app/api/admin/transaction-reviews/route.ts",
  "app/api/admin/trust-score/route.ts",
  "app/api/admin/users/cleanup/route.ts",
];

describe("V3-12 admin mutating route audit ratchet", () => {
  const current = computeUnauditedMutatingRoutes();
  if (process.env.PRINT_ADMIN_AUDIT_RATCHET === "1") {
    // allowlist 재생성용: PRINT_ADMIN_AUDIT_RATCHET=1 npx vitest run <this file>
    console.log(JSON.stringify(current, null, 2));
  }

  it("새 관리자 변경 route 는 감사 로그 없이 추가될 수 없다", () => {
    const allowed = new Set(UNAUDITED_ADMIN_MUTATING_ROUTES_ALLOWLIST);
    expect(current.filter((f) => !allowed.has(f))).toEqual([]);
  });

  it("감사가 추가된 route 는 allowlist 에서 제거해야 한다 (목록은 줄어들기만)", () => {
    const now = new Set(current);
    expect(UNAUDITED_ADMIN_MUTATING_ROUTES_ALLOWLIST.filter((f) => !now.has(f))).toEqual([]);
  });

  it("allowlist 는 정렬·중복 없음", () => {
    const sorted = [...new Set(UNAUDITED_ADMIN_MUTATING_ROUTES_ALLOWLIST)].sort();
    expect(UNAUDITED_ADMIN_MUTATING_ROUTES_ALLOWLIST).toEqual(sorted);
  });

  it("V3-08/09/10/12 대상 route 는 감사를 남긴다", () => {
    const mustAudit = [
      "app/api/admin/ops-board/route.ts",
      "app/api/admin/usage-ops/route.ts",
      "app/api/admin/deploy/promote-web/route.ts",
      "app/api/admin/deploy/run-gate/route.ts",
      "app/api/admin/auth-settings/route.ts",
      "app/api/admin/auth-providers/route.ts",
      "app/api/admin/push/test/route.ts",
      "app/api/admin/platform-events/[eventId]/distribution/push/send/route.ts",
      "app/api/admin/finance/conversion-policy/route.ts",
      "app/api/admin/app-settings/route.ts",
      "app/api/admin/notification-sound-ssot/route.ts",
      "app/api/admin/app-notices/route.ts",
      "app/api/admin/app-notices/[id]/route.ts",
      "app/api/admin/app-business-info/route.ts",
      "app/api/admin/app-business-info/[id]/route.ts",
      "app/api/admin/feed-ad-products/route.ts",
      "app/api/admin/delivery-ads/commercial/route.ts",
      "app/api/admin/advertising/reorder-hero-banners/route.ts",
      "app/api/admin/banners/route.ts",
      "app/api/admin/banners/[id]/route.ts",
    ];
    expect(mustAudit.filter((f) => current.includes(f))).toEqual([]);
  });
});

