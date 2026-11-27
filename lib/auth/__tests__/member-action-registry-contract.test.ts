import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMemberActionClassForApiMutation } from "@/lib/auth/member-action-policy";
import { resolveMemberConsentClassForApiMutation } from "@/lib/auth/member-consent-mutation-policy";
import { findMemberWriteEntry, MEMBER_WRITE_REGISTRY } from "@/lib/auth/member-action-registry";

/**
 * 회원 쓰기 규칙 표 계약 (설계 2026-11-21 §5-1).
 * app/api 의 모든 회원 쓰기(PRODUCT_WRITE · 동의 예외 아님) 경로가 표에 정확히 1번 있어야 한다.
 * 경로를 셀 때 세 방식을 모두 센다 — `export function` · `export const` · 다시 내보내기 `export { … } from`
 * (2026-11-20 재감사에서 두 번 빠진 원인).
 */
const METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listRouteFiles(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

function exportedMethods(src: string): Set<string> {
  const found = new Set<string>();
  for (const m of METHODS) {
    if (new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(src)) found.add(m);
    if (new RegExp(`export\\s+const\\s+${m}\\b`).test(src)) found.add(m);
  }
  for (const block of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const m of METHODS) if (new RegExp(`\\b${m}\\b`).test(block[1] ?? "")) found.add(m);
  }
  return found;
}

function memberWrites(): string[] {
  const root = join(process.cwd(), "app");
  const rows: string[] = [];
  for (const file of listRouteFiles(join(root, "api"))) {
    const path = `/${relative(root, file).replace(/\\/g, "/").replace(/\/route\.ts$/, "")}`;
    const concrete = path.replace(/\[[^\]]+\]/g, "x1");
    if (resolveMemberActionClassForApiMutation(concrete) !== "PRODUCT_WRITE") continue;
    for (const m of exportedMethods(readFileSync(file, "utf8"))) {
      if (resolveMemberConsentClassForApiMutation(m, concrete) === "CONSENT_EXEMPT") continue;
      rows.push(`${m} ${path}`);
    }
  }
  return rows.sort();
}

describe("회원 쓰기 규칙 표 — 전 경로 분류", () => {
  const writes = memberWrites();
  const registryKeys = MEMBER_WRITE_REGISTRY.map((e) => `${e.method} ${e.path}`);

  it("회원 쓰기 경로를 찾는다 (센서 동작 확인)", () => {
    expect(writes.length).toBeGreaterThan(200);
    expect(writes).toContain("POST /api/philife/posts");
    expect(writes).toContain("DELETE /api/community/posts/[postId]/like");
  });

  it("모든 회원 쓰기 경로가 표에 있다 — 새 경로는 kind(new·manage·split)를 정해 표에 넣는다", () => {
    const missing = writes.filter((w) => !registryKeys.includes(w));
    expect(missing).toEqual([]);
  });

  it("표에 없어진 경로가 남아 있지 않다", () => {
    const stale = registryKeys.filter((k) => !writes.includes(k));
    expect(stale).toEqual([]);
  });

  it("같은 경로가 두 번 있지 않다", () => {
    expect(new Set(registryKeys).size).toBe(registryKeys.length);
  });

  it("구체 경로가 자기 줄로 찾아진다 (겹치는 모양 없음)", () => {
    for (const e of MEMBER_WRITE_REGISTRY) {
      const concrete = e.path.replace(/\[[^\]]+\]/g, "x1");
      expect(findMemberWriteEntry(e.method, concrete), `${e.method} ${e.path}`).toMatchObject({
        path: e.path,
        method: e.method,
      });
    }
  });
});

describe("분류 — 설계 §4 대표", () => {
  const kind = (m: string, p: string) => findMemberWriteEntry(m, p)?.kind;
  it.each([
    ["POST", "/api/philife/posts"],
    ["POST", "/api/community-messenger/rooms/r1/messages"],
    ["POST", "/api/community-messenger/friend-requests"],
    ["POST", "/api/me/store-orders"],
    ["POST", "/api/moim/m1/join"],
    ["POST", "/api/stores/s1/favorite"],
  ])("%s %s = new", (m, p) => expect(kind(m, p)).toBe("new"));
  it.each([
    ["POST", "/api/me/settings/notices"],
    ["POST", "/api/community-messenger/group-rooms/g1/media"],
    ["DELETE", "/api/community/posts/p1/like"],
    ["DELETE", "/api/stores/s1/favorite"],
    ["PATCH", "/api/community-messenger/rooms/r1/messages/m1"],
    ["PATCH", "/api/philife/posts/p1/comments/c1"],
    ["DELETE", "/api/community-messenger/group-rooms/g1/participants"],
    ["POST", "/api/me/admin-notes/t1"],
    ["POST", "/api/community-messenger/calls/redial-room"],
    ["PATCH", "/api/me/stores/s1/products/p1"],
  ])("%s %s = manage", (m, p) => expect(kind(m, p)).toBe("manage"));
  it.each([
    ["PATCH", "/api/community-messenger/friend-requests/r1"],
    ["POST", "/api/community-messenger/friend-requests/respond-incoming"],
    ["POST", "/api/moim/invites/i1"],
    ["POST", "/api/favorites/toggle"],
    ["POST", "/api/community/neighbor-relations"],
    ["POST", "/api/community-messenger/rooms"],
    // 재감사3 #2·#4·#6 — 추가·초대·새 방만 가입 확인
    ["POST", "/api/community/posts/p1/like"],
    ["POST", "/api/philife/posts/p1/like"],
    ["POST", "/api/community/posts/p1/save"],
    ["POST", "/api/philife/posts/p1/comments/c1/like"],
    ["POST", "/api/community-messenger/rooms/r1/messages/m1/reactions"],
    ["PATCH", "/api/community-messenger/rooms/r1"],
    ["POST", "/api/trade/chat/entry/resolve"],
  ])("%s %s = split", (m, p) => expect(kind(m, p)).toBe("split"));
  it.each([["POST", "/api/community-messenger/direct/start"]])("%s %s = manage (재감사3 #6)", (m, p) =>
    expect(kind(m, p)).toBe("manage"),
  );
  /** 계약 §4 A 「글 사진 올리기 = 가입 필요」 — F2 2026-11-27 (재감사3 #7 의 manage 를 되돌림) */
  it.each([
    ["POST", "/api/posts/upload-image"],
    ["POST", "/api/community/upload-image"],
    ["POST", "/api/community/upload-image-from-url"],
    ["POST", "/api/philife/upload-image"],
    ["POST", "/api/philife/upload-image-from-url"],
  ])("%s %s = new (F2 계약 §4 A)", (m, p) => expect(kind(m, p)).toBe("new"));
  it("안 쓴 사진 정리(discard) 는 계약 §4 B 그대로 manage (F2)", () => {
    expect(kind("POST", "/api/community/upload-image/discard")).toBe("manage");
    // F4 2026-11-27 — 새 주소 등록: 동의는 필요(동의 예외에서 뺌), 가입 3단계가 쓰므로 가입은 보지 않음
    expect(kind("POST", "/api/me/addresses")).toBe("manage");
  });
});
