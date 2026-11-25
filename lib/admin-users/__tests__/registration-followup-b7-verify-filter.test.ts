import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adminMemberVerificationFilterOps,
  type ProfileFilterOp,
} from "@/lib/admin-users/admin-member-list-query";
import { verifiedPhoneVerdict } from "@/lib/auth/store-member-policy";
import { resolvePhoneVerificationDisplayStatus } from "@/lib/profile/admin-phone-verification-sync";

/**
 * 등록 후속 감사 B7 — 목록 인증 배지(`verifiedPhoneVerdict`)와 인증 필터(PostgREST 조건)가 같은 회원을 고른다.
 * 필터 문자열을 PostgREST 논리 트리 그대로 SQL 3값 논리로 계산해 배지 판정과 비교한다.
 */
type Row = {
  id: string;
  provider: string | null;
  auth_provider: string | null;
  email: string | null;
  phone: string | null;
  phone_verified: boolean | null;
  phone_verified_at: string | null;
  phone_verification_method: string | null;
  role: string | null;
};
type Tri = boolean | null;

const and3 = (xs: Tri[]): Tri => (xs.some((x) => x === false) ? false : xs.some((x) => x === null) ? null : true);
const or3 = (xs: Tri[]): Tri => (xs.some((x) => x === true) ? true : xs.some((x) => x === null) ? null : false);
const not3 = (x: Tri): Tri => (x === null ? null : !x);

/** 깊이 0 의 쉼표로 나눈다 (괄호·큰따옴표 안 쉼표 제외) */
function splitTop(src: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (const ch of src) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth += 1;
    if (!quoted && ch === ")") depth -= 1;
    if (!quoted && depth === 0 && ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function unquote(v: string): string {
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

function cell(row: Row, column: string): unknown {
  return (row as Record<string, unknown>)[column] ?? null;
}

function evalPredicate(row: Row, expr: string): Tri {
  for (const logic of ["and", "or", "not.and", "not.or"] as const) {
    if (expr.startsWith(`${logic}(`) && expr.endsWith(")")) {
      const parts = splitTop(expr.slice(logic.length + 1, -1)).map((p) => evalPredicate(row, p));
      const v = logic.endsWith("and") ? and3(parts) : or3(parts);
      return logic.startsWith("not.") ? not3(v) : v;
    }
  }
  const firstDot = expr.indexOf(".");
  const column = expr.slice(0, firstDot);
  let rest = expr.slice(firstDot + 1);
  let negate = false;
  if (rest.startsWith("not.")) {
    negate = true;
    rest = rest.slice(4);
  }
  const opDot = rest.indexOf(".");
  const op = rest.slice(0, opDot);
  const raw = rest.slice(opDot + 1);
  const value = cell(row, column);
  let result: Tri;
  if (op === "is") {
    result = raw === "null" ? value === null : raw === "true" ? value === true : value === false;
  } else if (value === null) {
    result = null;
  } else if (op === "eq") {
    result = String(value) === unquote(raw);
  } else if (op === "neq") {
    result = String(value) !== unquote(raw);
  } else if (op === "in") {
    result = splitTop(raw.slice(1, -1)).map(unquote).includes(String(value));
  } else if (op === "ilike") {
    const re = new RegExp(
      `^${unquote(raw)
        .split("")
        .map((c) => (c === "%" ? ".*" : c === "_" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
        .join("")}$`,
      "i",
    );
    result = re.test(String(value));
  } else {
    throw new Error(`unsupported op ${op} in ${expr}`);
  }
  return negate ? not3(result) : result;
}

/** PostgREST 와 같이 모든 조건이 참인 행만 결과에 들어간다 */
function rowMatches(row: Row, ops: readonly ProfileFilterOp[]): boolean {
  return ops.every((op) => {
    if (op.type === "or") return or3(splitTop(op.value).map((p) => evalPredicate(row, p))) === true;
    if (op.type === "not_in") {
      const ids = splitTop(op.value.slice(1, -1));
      return not3(cell(row, op.column) === null ? null : ids.includes(String(cell(row, op.column)))) === true;
    }
    if (op.type === "in") return op.value.includes(String(cell(row, op.column)));
    if (op.type === "eq") return cell(row, op.column) === op.value;
    throw new Error(`unsupported op ${op.type}`);
  });
}

const base: Row = {
  id: "",
  provider: "google",
  auth_provider: "google",
  email: "a@example.com",
  phone: null,
  phone_verified: null,
  phone_verified_at: null,
  phone_verification_method: null,
  role: "user",
};
const AT = "2026-11-20T00:00:00Z";

const MATRIX: Array<[string, Row]> = [
  ["관리자 본인(인증 표시 없음)", { ...base, id: "admin-1" }],
  ["관리자 생성 + 번호 있음", { ...base, id: "m-phone", provider: "admin_manual", auth_provider: "admin_manual", phone: "09171234567" }],
  ["관리자 생성 + 번호 없음(인증 표시 있어도)", { ...base, id: "m-nophone", provider: "admin_manual", phone_verified: true, phone_verified_at: AT }],
  ["관리자 생성 + 번호 빈 문자열", { ...base, id: "m-empty", provider: "manual", phone: "", phone_verified: true }],
  ["provider null · auth_provider 관리자 생성 + 번호", { ...base, id: "m-auth", provider: null, auth_provider: "manual_admin_backfill", phone: "09171112222" }],
  ["provider null · auth_provider 관리자 생성 · 번호 없음", { ...base, id: "m-auth-nophone", provider: null, auth_provider: "admin_manual", phone_verified_at: AT }],
  ["provider 빈 문자열 · auth_provider 관리자 생성(?? 는 빈 문자열에서 안 넘어감) + 인증", { ...base, id: "empty-provider", provider: "", auth_provider: "admin_manual", phone_verified: true }],
  ["email @manual.local · 번호 없음 · 인증 시각 있음", { ...base, id: "m-email", provider: "email", email: "abc@manual.local", phone_verified_at: AT }],
  ["email @manual.local · 번호 있음", { ...base, id: "m-email-phone", provider: "email", email: "ABC@MANUAL.LOCAL", phone: "09173334444" }],
  ["phone_verified_at 만", { ...base, id: "only-at", phone_verified_at: AT }],
  ["phone_verified 만", { ...base, id: "only-flag", phone_verified: true }],
  ["phone_verified=false · 번호 있음", { ...base, id: "flag-false", phone_verified: false, phone: "09175556666" }],
  ["아무것도 없음", { ...base, id: "nothing" }],
  ["provider·email null · 아무것도 없음", { ...base, id: "nulls", provider: null, auth_provider: null, email: null }],
  ["provider·email null · 인증", { ...base, id: "nulls-ok", provider: null, auth_provider: null, email: null, phone_verified: true }],
];

const ADMIN_IDS = ["admin-1"];

function badgeVerified(row: Row, adminIds: readonly string[]): boolean {
  /** 목록 API 매퍼와 같은 입력(phoneGate) */
  const gate = { ...row, phone: row.phone ?? null, privilegedAdmin: adminIds.includes(row.id) };
  const display = resolvePhoneVerificationDisplayStatus(gate) === "verified";
  expect(display).toBe(verifiedPhoneVerdict(gate));
  return display;
}

describe("B7 인증 배지 == 인증 필터", () => {
  it.each(MATRIX)("%s", (_label, row) => {
    const verified = badgeVerified(row, ADMIN_IDS);
    expect(rowMatches(row, adminMemberVerificationFilterOps("verified", ADMIN_IDS))).toBe(verified);
    expect(rowMatches(row, adminMemberVerificationFilterOps("unverified", ADMIN_IDS))).toBe(!verified);
  });

  it("판정 기대값 — 관리자·관리자 생성+번호·인증 표시 = 인증, 관리자 생성 번호 없음·아무것도 없음 = 미인증", () => {
    const v = Object.fromEntries(MATRIX.map(([, row]) => [row.id, badgeVerified(row, ADMIN_IDS)]));
    expect(v).toMatchObject({
      "admin-1": true,
      "m-phone": true,
      "m-nophone": false,
      "m-empty": false,
      "m-auth": true,
      "m-auth-nophone": false,
      "empty-provider": true,
      "m-email": false,
      "m-email-phone": true,
      "only-at": true,
      "only-flag": true,
      "flag-false": false,
      nothing: false,
      nulls: false,
      "nulls-ok": true,
    });
  });

  it("관리자 id 가 없으면 id 조건을 넣지 않는다 (관리자 행도 일반 판정)", () => {
    const verified = adminMemberVerificationFilterOps("verified", []);
    const unverified = adminMemberVerificationFilterOps("unverified", []);
    expect(JSON.stringify(verified)).not.toContain("id.in.");
    expect(unverified.some((op) => op.type === "not_in")).toBe(false);
    for (const [, row] of MATRIX) {
      const expected = badgeVerified(row, []);
      expect(rowMatches(row, verified)).toBe(expected);
      expect(rowMatches(row, unverified)).toBe(!expected);
    }
  });

  it("목록·상세 API 가 배지·상태·가입 단계에 같은 판정 입력(관리자 포함)을 쓴다", () => {
    const list = readFileSync(join(process.cwd(), "app/api/admin/users/route.ts"), "utf8");
    expect(list).toContain("privilegedAdmin: adminMembershipRole !== null");
    expect(list).toContain('phoneVerified: phoneDisplayStatus === "verified"');
    expect(list).toContain("verificationStatus: phoneDisplayStatus");
    expect(list).toContain("phoneVerified: verifiedPhoneVerdict(phoneGate)");
    expect(list).toContain("adminMemberVerificationFilterOps(verify, privilegedAdminIds)");
    const detail = readFileSync(join(process.cwd(), "app/api/admin/users/[id]/route.ts"), "utf8");
    expect(detail.indexOf('.from("admin_memberships")')).toBeLessThan(detail.indexOf("const user: AdminUserDetailRow = {"));
    expect(detail).toContain("resolvePhoneVerificationDisplayStatus(detailPhoneGate)");
  });
});

describe("B15 요약 칩 — 모든 개수가 같은 가입일 범위", () => {
  it("runStatusCount 도 joinedRangeOps 를 적용한다", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/route.ts"), "utf8");
    const runStatusCount = src.slice(src.indexOf("const runStatusCount"), src.indexOf("const [\n      warnedUserIds"));
    expect(runStatusCount).toContain("...joinedRangeOps");
    const runCount = src.slice(src.indexOf("const runCount"), src.indexOf("let includeAuthLoginEmail"));
    expect(runCount).toContain("...joinedRangeOps");
  });
});
