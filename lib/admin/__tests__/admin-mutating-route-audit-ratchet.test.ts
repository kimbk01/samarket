/**
 * V3-12 (X-9) ratchet — 관리자 변경 API(POST/PATCH/PUT/DELETE)는 감사 로그를 남겨야 한다.
 *
 * 판정: route.ts 소스가 감사 헬퍼를 직접 호출하거나, route 가 **실제로 호출하는** import 함수의 본문(또는 그 함수가 같은 모듈에서
 * 부르는 함수 본문, 1단계)이 감사 헬퍼를 호출하면 통과. 「import 한 파일 어딘가에 감사 호출이 있다」만으로는 통과하지 않는다
 * (재감사 2026-10-20: 열람 감사만 있는 모듈을 import 한 변경 route 2개가 거짓 통과했다).
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

/** 모듈 소스에서 이름이 name 인 함수(선언·const 화살표)의 본문 — 다음 최상위 선언 전까지. */
function topLevelFunctionBody(src: string, name: string): string | null {
  const re = new RegExp(
    `^(?:export\\s+)?(?:async\\s+)?function\\s*\\*?\\s*${name}\\b|^(?:export\\s+)?const\\s+${name}\\s*(?::[^=]+)?=`,
    "m"
  );
  const m = re.exec(src);
  if (!m) return null;
  const rest = src.slice(m.index + m[0].length);
  const next = rest.search(/\n(?:export\s|async\s+function\s|function\s|const\s|let\s|type\s|interface\s)/);
  return next >= 0 ? rest.slice(0, next) : rest;
}

type ImportBinding = { local: string; imported: string; file: string };

function importBindings(fromFile: string, src: string): ImportBinding[] {
  const out: ImportBinding[] = [];
  const re = /import\s+(?:type\s+)?([^;]*?)\s+from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const resolved = resolveImport(fromFile, m[2]);
    if (!resolved) continue;
    const clause = m[1];
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      for (const part of named[1].split(",")) {
        const t = part.replace(/^\s*type\s+/, "").trim();
        if (!t) continue;
        const [imported, local] = t.split(/\s+as\s+/).map((x) => x.trim());
        out.push({ imported, local: local ?? imported, file: resolved });
      }
    }
    const def = clause.replace(/\{[^}]*\}/, "").replace(/,/g, " ").trim();
    if (def && !def.startsWith("*")) out.push({ imported: "default", local: def.split(/\s+/)[0], file: resolved });
  }
  return out;
}

/** 함수 본문이 감사를 부르는지 — 본문 직접, 또는 같은 모듈의 함수를 1단계 더 따라가서. */
function bodyReachesAudit(moduleSrc: string, body: string): boolean {
  if (hasAuditCall(body)) return true;
  for (const call of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const inner = topLevelFunctionBody(moduleSrc, call[1]);
    if (inner && hasAuditCall(inner)) return true;
  }
  return false;
}

/** route 가 실제로 호출하는 import 함수 중 하나라도 감사에 도달하는지. */
function calledImportReachesAudit(file: string, src: string): boolean {
  const code = src.replace(/^import[^;]*;/gm, "");
  for (const b of importBindings(file, src)) {
    if (!new RegExp(`\\b${b.local.replace(/[$]/g, "\\$")}\\s*\\(`).test(code)) continue;
    const modSrc = readFileSync(b.file, "utf8");
    if (b.imported === "default") {
      if (hasAuditCall(modSrc)) return true;
      continue;
    }
    let body = topLevelFunctionBody(modSrc, b.imported);
    if (!body) {
      // `export { x } from "./y"` 재수출 1단계
      const re = new RegExp(`export\\s*\\{[^}]*\\b${b.imported}\\b[^}]*\\}\\s*from\\s*["']([^"']+)["']`);
      const rx = re.exec(modSrc);
      const next = rx ? resolveImport(b.file, rx[1]) : null;
      if (next) {
        const nextSrc = readFileSync(next, "utf8");
        body = topLevelFunctionBody(nextSrc, b.imported);
        if (body && bodyReachesAudit(nextSrc, body)) return true;
      }
      continue;
    }
    if (bodyReachesAudit(modSrc, body)) return true;
  }
  return false;
}

function computeUnauditedMutatingRoutes(): string[] {
  const missing: string[] = [];
  for (const file of listRouteFiles(ADMIN_API_DIR)) {
    const src = readFileSync(file, "utf8");
    if (!exportsMutatingHandler(src)) continue;
    if (isReExportShim(src) || isGoneOnlyRoute(src)) continue;
    if (hasAuditCall(src)) continue;
    if (calledImportReachesAudit(file, src)) continue;
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    if (rel in NON_MUTATING_ADMIN_ROUTES || rel in DB_AUDITED_ADMIN_ROUTES) continue;
    missing.push(path.relative(ROOT, file).split(path.sep).join("/"));
  }
  return missing.sort();
}

/**
 * 감사 미기록 변경 route 허용목록 — 2026-10-20 도입 시 75개 → PR-2 에서 0 (수정 계획 2-3).
 * 새 변경 route 는 감사를 남기거나, 아래 두 예외 목록 중 하나에 **근거와 함께** 올린다.
 */
const UNAUDITED_ADMIN_MUTATING_ROUTES_ALLOWLIST: readonly string[] = [];

/** 변경 HTTP 메서드지만 DB·스토리지에 쓰지 않는 route (계산·미리보기·퇴역 응답). 근거 = 파일 확인 결과. */
const NON_MUTATING_ADMIN_ROUTES: Readonly<Record<string, string>> = {
  "app/api/admin/gift-certificates/conversions/[id]/approve/route.ts": "가드 후 410 만 반환 (await context.params 로 410 전용 판정 밖)",
  "app/api/admin/notification-campaigns/audience-preview/route.ts": "previewCampaignAudience 집계 조회만",
  "app/api/admin/notification-sound-ssot/preview-resolver/route.ts": "설정 조회 + 메모리 resolver 만",
  "app/api/admin/point-expire/simulate/route.ts": "simulatePointExpireDb 읽기·계산만",
  "app/api/admin/point-policies/simulate/route.ts": "조회 3건 + computePointRewardSimulation 계산만",
  "app/api/admin/prelaunch-reset/dry-run/route.ts": "인증·DB 접근 전 항상 410",
  "app/api/admin/prelaunch-reset/execute/route.ts": "인증·DB 접근 전 항상 410",
  "app/api/admin/store-point-policies/route.ts": "POST = 관리자 확인 후 410 만",
  "app/api/admin/support/cases/route.ts": "POST = 405 만",
  "app/api/admin/trade-completion/route.ts": "POST = product_chats·posts 조회만",
  "app/api/admin/trade-flow/route.ts": "POST = 조회만",
  "app/api/admin/transaction-reviews/route.ts": "POST = 조회만",
  "app/api/admin/chats/route.ts": "POST = product_chats 목록 조회만 (insert/update/delete/rpc 없음)",
  "app/api/admin/users/phone-verification/ops/refresh/route.ts": "POST = loadPhoneOtpOpsSnapshot 조회 + 프로바이더 잔액 probe 만 (lib/auth/phone-otp-ops.ts:123-168 쓰기 없음)",
};

/** DB 함수가 같은 트랜잭션에서 audit_logs 에 기록하는 route — TS 에서 또 남기면 이력이 두 줄이 된다. */
const DB_AUDITED_ADMIN_ROUTES: Readonly<Record<string, string>> = {
  "app/api/admin/reports/[reportId]/action/route.ts": "admin_decide_trade_report (20270522120300)",
  "app/api/admin/trade/reports/[id]/route.ts": "admin_decide_trade_report (20270522120300)",
  "app/api/admin/trade/posts/[id]/moderation/route.ts": "admin_trade_post_moderate (20270522120600)",
  "app/api/admin/trade/posts/[id]/route.ts": "admin_trade_post_edit (20270522120100)",
  "app/api/admin/trade/restrictions/route.ts": "admin_apply_trade_sanction (20270522120300)",
  "app/api/admin/trade/restrictions/[id]/revoke/route.ts": "admin_revoke_trade_sanction (20270522120300)",
  "app/api/admin/trade/promotions/[id]/route.ts": "admin_trade_promotion_* → trade_promotion_audit (20270522120400)",
  "app/api/admin/trade-promotion-orders/[id]/route.ts": "admin_trade_promotion_* → trade_promotion_audit (20270522120400)",
};

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

  it("예외 목록(비변경·DB 감사)은 실제 파일이고 사유가 있으며, 겹치지 않는다", () => {
    for (const [file, reason] of [...Object.entries(NON_MUTATING_ADMIN_ROUTES), ...Object.entries(DB_AUDITED_ADMIN_ROUTES)]) {
      expect(existsSync(path.join(ROOT, file)), file).toBe(true);
      expect(reason.trim().length, file).toBeGreaterThan(5);
    }
    const overlap = Object.keys(NON_MUTATING_ADMIN_ROUTES).filter((f) => f in DB_AUDITED_ADMIN_ROUTES);
    expect(overlap).toEqual([]);
  });

  it("DB 감사 예외 route 는 실제로 해당 DB 함수를 부른다", () => {
    for (const [file, reason] of Object.entries(DB_AUDITED_ADMIN_ROUTES)) {
      const fn = reason.split(" ")[0].replace(/\*$/, "");
      const src = readFileSync(path.join(ROOT, file), "utf8");
      const imported = importedSources(path.join(ROOT, file), src).join("\n");
      expect(src.includes(fn) || imported.includes(fn), `${file} → ${fn}`).toBe(true);
    }
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

