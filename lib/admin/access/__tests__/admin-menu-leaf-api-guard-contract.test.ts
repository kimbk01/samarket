/**
 * 메뉴 leaf 별 API 가드 계약 (재설계 R9 「권한·진입」).
 *
 * 사이드바 메뉴 leaf 화면마다: 화면(페이지 + 관리자 전용 컴포넌트·훅 import 폐포)이 부르는 조회 API(GET) 의 서버 가드가
 * 접근표(`admin-route-access.ts`) 의 화면 요구 권한으로 **통과된다** — 메뉴가 보이는 관리자가 화면을 열었을 때 첫 조회가 403 이 나지 않는다.
 * 판정: 가상 관리자(역할 × 권한 키 조합) 전부에 대해 「화면 요구 권한 충족 ⇒ API 가드 충족」.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adminMenu, collectAdminMenuPathEntries } from "@/components/admin/admin-menu";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import {
  actorMeetsAdminRouteRequirement,
  resolveAdminRouteAccess,
  type AdminRouteAccessActor,
  type AdminRouteRequirement,
} from "@/lib/admin/access/admin-route-access";

const ROOT = path.resolve(__dirname, "../../../..");

/** 화면 폐포에 넣는 파일 — 관리자 화면 코드만 (회원 앱 공용·서버 lib 는 API 를 부르는 화면 코드가 아니다). */
const CLOSURE_SCOPE = /^(?:app\/admin\/|components\/admin\/|hooks\/useAdmin|lib\/admin(?:[-/]))/;

function resolveImport(spec: string, from: string): string | null {
  let p: string;
  if (spec.startsWith("@/")) p = spec.slice(2);
  else if (spec.startsWith(".")) p = path.join(path.dirname(from), spec);
  else return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const f = p + ext;
    const abs = path.join(ROOT, f);
    if (existsSync(abs) && statSync(abs).isFile() && /\.(tsx|ts)$/.test(f)) return f;
  }
  return null;
}

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function pageFileFor(href: string): string | null {
  const p = href.split("?")[0].replace(/\/$/, "");
  const f = `app${p}/page.tsx`;
  return existsSync(path.join(ROOT, f)) ? f : null;
}

function closureOf(entry: string): string[] {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(path.join(ROOT, f), "utf8");
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
      const r = resolveImport(m[1], f);
      if (r && CLOSURE_SCOPE.test(r) && !/__tests__|\.test\./.test(r)) stack.push(r);
    }
  }
  return [...seen];
}

/** 화면 코드의 `/api/admin/...` 정적 경로 (템플릿 `${…}` 조각은 동적 세그먼트로). */
function apiPathsIn(files: readonly string[]): string[] {
  const out = new Set<string>();
  for (const f of files) {
    const src = stripComments(readFileSync(path.join(ROOT, f), "utf8"));
    for (const m of src.matchAll(/["'`](\/api\/admin\/[^"'`?#\s]*)/g)) {
      const raw = m[1].replace(/\$\{[^}]*\}/g, ":dyn").replace(/\/+$/, "");
      out.add(raw);
    }
  }
  return [...out].sort();
}

/** `/api/admin/a/:dyn/b` → `app/api/admin/a/[x]/b/route.ts` */
function routeFileFor(apiPath: string): string | null {
  const segs = apiPath.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean);
  let dir = path.join(ROOT, "app/api/admin");
  for (const seg of segs) {
    if (seg !== ":dyn" && !seg.includes(":dyn") && existsSync(path.join(dir, seg))) {
      dir = path.join(dir, seg);
      continue;
    }
    const dyn = readdirSync(dir).find((n) => /^\[[^\]]+\]$/.test(n));
    if (!dyn) return null;
    dir = path.join(dir, dyn);
  }
  const f = path.join(dir, "route.ts");
  return existsSync(f) ? path.relative(ROOT, f) : null;
}

const GUARD_CALL =
  /\b(?:requireDeployOwner|requireSuperAdmin|requireAdminPermission|requireCommunityAdmin|requireTradeAdmin|requireTradeChatAdmin|requireAnyAdminPermission|requireChatAdmin|requireAdminApiUser|isRouteAdmin|requireAdminApiActor)\(/;

function getHandlerBody(routeFile: string): string | null {
  const src = stripComments(readFileSync(path.join(ROOT, routeFile), "utf8"));
  const start = src.search(/export (?:async )?function GET\b|export const GET\b/);
  if (start < 0) return null;
  const rest = src.slice(start + 1);
  const next = rest.search(/\nexport /);
  const body = next < 0 ? rest : rest.slice(0, next);
  if (GUARD_CALL.test(body)) return body;
  // GET 에 가드 호출이 없으면 같은 파일의 보조 함수(가드를 감싼 함수)를 본다
  const locals = [...body.matchAll(/\b([a-zA-Z_]\w*)\(/g)].map((m) => m[1]);
  let extra = "";
  for (const name of new Set(locals)) {
    const def = src.search(new RegExp(`(?:async )?function ${name}\\b`));
    if (def < 0 || def === start) continue;
    const tail = src.slice(def);
    const end = tail.search(/\n}\n/);
    extra += end < 0 ? tail : tail.slice(0, end + 2);
  }
  return body + extra;
}

/** 가드 호출 → 요구 권한. 찾지 못하면 null. */
function guardRequirementOf(body: string): AdminRouteRequirement | "multi" | null {
  const found: AdminRouteRequirement[] = [];
  let m: RegExpMatchArray | null;
  if (/\brequireDeployOwner\(/.test(body)) found.push({ kind: "deploy_owner" });
  if (/\brequireSuperAdmin\(/.test(body)) found.push({ kind: "super_admin" });
  for (m of body.matchAll(/\brequireAdminPermission\(\s*["']([\w-]+)["']/g)) found.push({ kind: "permission", key: m[1] as never });
  for (m of body.matchAll(/\brequireCommunityAdmin\(\s*["']([\w-]+)["']/g))
    found.push({ kind: "domain", guard: "community", area: m[1] as never });
  if (/\brequireTradeAdmin\(/.test(body)) found.push({ kind: "domain", guard: "trade" });
  if (/\brequireTradeChatAdmin\(/.test(body)) found.push({ kind: "domain", guard: "chat", scope: "trade" });
  if (/requireAnyAdminPermission\(\s*\[\s*"chats",\s*"business"\s*\]/.test(body))
    found.push({ kind: "domain", guard: "chat", scope: "store_order" });
  if (/\brequireChatAdmin\(/.test(body)) found.push({ kind: "domain", guard: "chat", scope: "chats" });
  if (found.length === 0 && /\b(?:requireAdminApiUser|isRouteAdmin|requireAdminApiActor)\(/.test(body)) found.push({ kind: "any_admin" });
  if (found.length === 0) return null;
  return found.length === 1 ? found[0] : "multi";
}

const PERMISSION_KEYS: readonly AdminPermissionKey[] = [
  "users",
  "users_edit_membership",
  "regions",
  "products",
  "boards",
  "post_write",
  "comment_write",
  "product_edit",
  "business",
  "jobs",
  "real_estate",
  "used_car",
  "chats",
  "reviews",
  "reports",
  "support",
  "ads",
  "point",
  "settings",
  "manage",
  "dev",
];

/** 가상 관리자: 운영자 역할 × (키 없음 · 키 1개씩 · 전부) + 최고관리자 · 배포 담당. */
const ACTORS: AdminRouteAccessActor[] = [
  { role: "admin", permissions: [] },
  ...PERMISSION_KEYS.map((k) => ({ role: "admin", permissions: [k] })),
  { role: "admin", permissions: [...PERMISSION_KEYS] },
  { role: "super_admin", permissions: [] },
  { role: "super_admin", permissions: [], isDeployOwner: true },
];

type Leaf = { key: string; path: string };
const LEAVES: Leaf[] = collectAdminMenuPathEntries(adminMenu).map((e) => ({ key: e.key, path: e.path }));

type Finding = { leaf: string; api: string; issue: string };

/**
 * 화면 진입을 막지 않는 보조 조회 — 사유 필수. 화면 요구 권한보다 강한 API 를 부르지만
 * (a) 쓰기 흐름 안에서만 부르거나 (b) 여러 출처 중 하나라 실패해도 나머지를 보여 주는 경우만.
 */
const NON_ENTRY_LOOKUPS: Readonly<Record<string, string>> = {
  // v4 W1 API-07 — 주문 상세·이력(구매자 PII) = business 키. 아래 화면에서는 선택 동작에서만 부르고 403 을 처리한다.
  "/admin/ops-console → /api/admin/store-orders/:dyn/detail":
    "주문 조치 모달의 이전 메모 확인 — 조치(쓰기 PATCH = business)를 열 때만 부름, 실패 시 이전 메모만 미표시",
  "/admin/order-chats → /api/admin/store-orders/:dyn/detail":
    "주문 상세 모달(선택 동작) — chats 전용 직원은 모달에 권한 없음(forbidden) 표시, 채팅 목록·열람은 그대로",
  "/admin/order-chats → /api/admin/store-orders/:dyn/history":
    "주문 상세 모달의 이력 패널 — 403 이면 패널에 forbidden 표시(AdminStoreOrderHistoryPanel), 채팅 목록은 그대로",
  "/admin/community/points → /api/admin/points/adjust":
    "포인트 조정 패널의 잔액 확인 — 조정(쓰기) 실행 때만 부름. 쓰기 권한(action=point)과 같다",
  "/admin/philife/meeting-events → /api/admin/community/topics":
    "주제 필터 선택지 — 실패 시 선택지만 비움(useCommunityTopicOptions 가 !ok 무시), 목록은 표시",
  "/admin/order-notifications → /api/admin/community-reports":
    "신고 목록의 피드 신고 출처 — 거래 신고와 합산, 피드 출처 실패 시 거래 신고만 표시(AdminReportListPage)",
  "/admin/order-notifications → /api/admin/point-charges":
    "운영 대기 카드의 포인트 충전 건수 — 실패한 출처는 건너뜀(AdminFinanceOpsQueue)",
  "/admin/customer-platform → /api/admin/community-reports":
    "신고 목록의 피드 신고 출처 — 거래 신고와 합산, 피드 출처 실패 시 거래 신고만 표시(AdminReportListPage)",
  "/admin/customer-platform → /api/admin/point-charges":
    "운영 대기 카드의 포인트 충전 건수 — 실패한 출처는 건너뜀(AdminFinanceOpsQueue)",
  // RS-04: 매장 신고 목록 = reports 키. 셸 공용 알림음 시드(AdminStorePointPendingProvider)가 부르는 보조 조회.
  "/admin/order-notifications → /api/admin/store-reports":
    "알림음 중복 방지 시드(AdminStorePointPendingProvider hydrate) — 응답이 ok 가 아니면 건너뜀, 화면 목록과 무관",
  "/admin/customer-platform → /api/admin/store-reports":
    "알림음 중복 방지 시드(AdminStorePointPendingProvider hydrate) — 응답이 ok 가 아니면 건너뜀, 화면 목록과 무관",
};

function analyze(): { checked: number; findings: Finding[]; multi: string[]; seen: Set<string> } {
  const findings: Finding[] = [];
  const multi: string[] = [];
  const seen = new Set<string>();
  let checked = 0;
  for (const leaf of LEAVES) {
    const page = pageFileFor(leaf.path);
    if (!page) continue;
    const { requirement } = resolveAdminRouteAccess(leaf.path);
    for (const api of apiPathsIn(closureOf(page))) {
      const route = routeFileFor(api);
      if (!route) continue;
      const body = getHandlerBody(route);
      if (!body) continue; // GET 없는 쓰기 전용 API
      const guard = guardRequirementOf(body);
      checked++;
      if (guard === null) {
        findings.push({ leaf: leaf.path, api, issue: "가드 호출을 찾지 못함" });
        continue;
      }
      if (guard === "multi") {
        multi.push(`${leaf.path} → ${api}`);
        continue;
      }
      seen.add(`${leaf.path} → ${api}`);
      const bad = ACTORS.filter((a) => actorMeetsAdminRouteRequirement(requirement, a) && !actorMeetsAdminRouteRequirement(guard, a));
      if (bad.length && !NON_ENTRY_LOOKUPS[`${leaf.path} → ${api}`]) {
        findings.push({
          leaf: leaf.path,
          api,
          issue: `화면 ${JSON.stringify(requirement)} 인데 API ${JSON.stringify(guard)} — 예: ${bad[0].role}[${bad[0].permissions.join(",")}]`,
        });
      }
    }
  }
  return { checked, findings, multi, seen };
}

describe("메뉴 leaf 별 API 가드 계약 (R9)", () => {
  it("메뉴가 보이는 관리자는 그 화면의 조회 API 가드를 통과한다", () => {
    const { checked, findings, multi } = analyze();
    expect(multi).toEqual([]);
    expect(checked).toBeGreaterThan(100);
    expect(findings.map((f) => `${f.leaf} → ${f.api}: ${f.issue}`)).toEqual([]);
  });

  it("예외 목록은 실제로 남아 있는 조회만 (고친 뒤 남은 항목 없음) · 사유 필수", () => {
    const { seen } = analyze();
    for (const [k, reason] of Object.entries(NON_ENTRY_LOOKUPS)) {
      expect(seen.has(k), k).toBe(true);
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});
