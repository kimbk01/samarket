/**
 * 설계 v4 §6 (V3-15) ratchet — 관리자 화면 날짜·시각 표시는 Asia/Manila(PHT)로 통일한다.
 *
 * 판정(정적, 실용 정규식): 아래 호출 중 같은 호출 인자 안에 `timeZone` 이 없으면 위반.
 *  - `.toLocaleDateString(` · `.toLocaleTimeString(` · `new Intl.DateTimeFormat(`
 *  - `.toISOString().slice(0, 10)` (UTC 날짜 — PHT 날짜와 08:00 전까지 하루 어긋남)
 * 대상: components/admin/**, app/admin/**, lib/admin/** (테스트 제외).
 * 정규 헬퍼: `lib/admin/metrics/manila-period.ts` (formatAdminManilaDate / formatAdminManilaDateTime /
 * formatAdminHeaderClock / manilaDateKey / manilaTodayRangeUtc).
 *
 * `ADMIN_DATE_TIMEZONE_VIOLATION_ALLOWLIST` 는 도입 시점(2026-10-20) 스냅샷이다 — **줄어들기만 해야 한다.**
 *  - 새 파일이 위반하면 실패.
 *  - 목록의 파일이 더 이상 위반하지 않으면 실패(목록에서 지우도록 강제).
 * 재생성: PRINT_ADMIN_DATE_TZ_RATCHET=1 npx vitest run lib/admin/__tests__/admin-date-timezone-ratchet.test.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCAN_DIRS = ["components/admin", "app/admin", "lib/admin"];

/** 정규 시간대 헬퍼 자체(오프셋 계산으로 이미 PHT 를 만든 뒤 slice 하는 구현) — 스캔 제외. */
const CANONICAL_HELPER_FILES = new Set(["lib/admin/metrics/manila-period.ts"]);

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** `(` 위치부터 균형 잡힌 `)` 까지의 인자 텍스트. */
function callArgs(src: string, openParenIndex: number): string {
  let depth = 0;
  for (let i = openParenIndex; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return src.slice(openParenIndex + 1, i);
    }
  }
  return src.slice(openParenIndex + 1);
}

const CALL_PATTERNS: RegExp[] = [
  /\.toLocaleDateString\s*\(/g,
  /\.toLocaleTimeString\s*\(/g,
  /new\s+Intl\.DateTimeFormat\s*\(/g,
];
const UTC_DATE_SLICE = /\.toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)/;

function hasAdminDateTimezoneViolation(src: string): boolean {
  if (UTC_DATE_SLICE.test(src)) return true;
  for (const pattern of CALL_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(src))) {
      const args = callArgs(src, m.index + m[0].length - 1);
      if (!/\btimeZone\b/.test(args)) return true;
    }
  }
  return false;
}

function computeViolations(): string[] {
  const out: string[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of listSourceFiles(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      if (CANONICAL_HELPER_FILES.has(rel)) continue;
      if (hasAdminDateTimezoneViolation(readFileSync(file, "utf8"))) out.push(rel);
    }
  }
  return out.sort();
}

/** 도입 시점(2026-10-20) 시간대 없는 날짜 포맷 파일 스냅샷 — 줄어들기만 해야 한다(추가 금지). */
const ADMIN_DATE_TIMEZONE_VIOLATION_ALLOWLIST: readonly string[] = [
  "components/admin/ads/AdminAdApplicationTable.tsx",
  "components/admin/ads/AdminPostAdManagePage.tsx",
  "components/admin/banners/AdminBannerTable.tsx",
  "components/admin/finance/AdminStoreFinancialStatement.tsx",
  "components/admin/i18n/admin-date-locale.ts",
  "components/admin/launch-week/LaunchWeekIssueBoard.tsx",
  "components/admin/ops-board/OpsActionCard.tsx",
  "components/admin/ops-board/OpsActionSummaryCards.tsx",
  "components/admin/ops-board/OpsChecklistTable.tsx",
  "components/admin/ops-board/OpsRetrospectiveForm.tsx",
  "components/admin/ops-docs/OpsDocumentTable.tsx",
  "components/admin/ops-knowledge-graph/OpsKnowledgeGraphSummaryCards.tsx",
  "components/admin/ops-knowledge/OpsKnowledgePreviewCard.tsx",
  "components/admin/ops-knowledge/OpsKnowledgeSummaryCards.tsx",
  "components/admin/ops-learning/OpsLearningHistoryTable.tsx",
  "components/admin/ops-learning/OpsPatternDetailPanel.tsx",
  "components/admin/point-policies/PointEventPolicyTable.tsx",
  "components/admin/points/AdminPointExpireLogList.tsx",
  "components/admin/points/AdminPointExpireRunPanel.tsx",
  "components/admin/post-ads/AdminAdTable.tsx",
  "components/admin/store-points/AdminStorePointLedgerByDatePage.tsx",
  "components/admin/stores/AdminStoreFeePoliciesPage.tsx",
  "components/admin/stores/AdminStoreReviewsPage.tsx",
  "components/admin/stores/admin-store-review-model.ts",
  "components/admin/users/AdminStaffTable.tsx",
  "components/admin/users/admin-user-lite-display.ts",
  "lib/admin/ads-control-plane/load-ads-control-plane.ts",
  "lib/admin/ads-exposure/action-feedback.ts",
  "lib/admin/metrics/delivery-metrics.ts",
];

describe("V3-15 admin date timezone ratchet (Asia/Manila)", () => {
  const current = computeViolations();
  if (process.env.PRINT_ADMIN_DATE_TZ_RATCHET === "1") {
    console.log(JSON.stringify(current, null, 2));
  }

  it("detector: 시간대 없는 포맷·UTC 날짜 slice 는 위반, timeZone 지정은 통과", () => {
    expect(hasAdminDateTimezoneViolation(`d.toLocaleDateString("ko-KR")`)).toBe(true);
    expect(hasAdminDateTimezoneViolation(`d.toLocaleTimeString()`)).toBe(true);
    expect(hasAdminDateTimezoneViolation(`new Intl.DateTimeFormat("en", { hour: "2-digit" })`)).toBe(true);
    expect(hasAdminDateTimezoneViolation(`new Date().toISOString().slice(0, 10)`)).toBe(true);
    expect(
      hasAdminDateTimezoneViolation(`d.toLocaleDateString("ko-KR", { timeZone: "Asia/Manila" })`)
    ).toBe(false);
    expect(
      hasAdminDateTimezoneViolation(`new Intl.DateTimeFormat("en", { timeZone: TZ, weekday: "short" })`)
    ).toBe(false);
    expect(hasAdminDateTimezoneViolation(`d.toISOString().slice(0, 16)`)).toBe(false);
  });

  it("새 관리자 파일은 시간대 없이 날짜를 포맷할 수 없다", () => {
    const allowed = new Set(ADMIN_DATE_TIMEZONE_VIOLATION_ALLOWLIST);
    expect(current.filter((f) => !allowed.has(f))).toEqual([]);
  });

  it("고쳐진 파일은 allowlist 에서 제거해야 한다 (목록은 줄어들기만)", () => {
    const now = new Set(current);
    expect(ADMIN_DATE_TIMEZONE_VIOLATION_ALLOWLIST.filter((f) => !now.has(f))).toEqual([]);
  });

  it("allowlist 는 정렬·중복 없음", () => {
    const sorted = [...new Set(ADMIN_DATE_TIMEZONE_VIOLATION_ALLOWLIST)].sort();
    expect(ADMIN_DATE_TIMEZONE_VIOLATION_ALLOWLIST).toEqual(sorted);
  });
});
