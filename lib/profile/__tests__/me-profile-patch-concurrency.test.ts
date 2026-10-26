import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyExpectedConditions,
  diffProfileEdit,
  expectedConditionsForPatch,
  parseProfilePatchExpected,
} from "@/lib/profile/profile-patch-concurrency";

/** 감사 #2·#2-b·#3 — 바뀐 필드만 저장 · 오래된 값으로 최신 값 덮어쓰기 금지 · 사진 정리 순서 */

type Row = Record<string, unknown>;
let dbRow: Row;
const removedUrls: string[][] = [];

function makeUpdateQuery(patch: Row) {
  const conds: Array<(r: Row) => boolean> = [];
  const q: Record<string, unknown> = {};
  q.eq = (c: string, v: unknown) => {
    conds.push((r) => r[c] === v);
    return q;
  };
  q.is = (c: string, v: unknown) => {
    conds.push((r) => (r[c] ?? null) === v);
    return q;
  };
  q.select = () => q;
  q.maybeSingle = async () => {
    if (!conds.every((f) => f(dbRow))) return { data: null, error: null };
    dbRow = { ...dbRow, ...patch };
    return { data: { ...dbRow }, error: null };
  };
  return q;
}

function makeSelectQuery() {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = () => q;
  q.ilike = () => q;
  q.neq = () => q;
  q.limit = async () => ({ data: [], error: null });
  q.maybeSingle = async () => ({ data: { ...dbRow }, error: null });
  return q;
}

const fakeSb = {
  from: () => ({
    update: (patch: Row) => makeUpdateQuery(patch),
    select: () => makeSelectQuery(),
  }),
};

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }),
  getOptionalRouteHandlerCookieAuth: async () => null,
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => fakeSb,
}));
vi.mock("@/lib/media/canonical-image-lifecycle.server", () => ({
  diffRemovedImageUrls: (prev: Array<string | null>, next: Array<string | null>) =>
    prev.filter((u): u is string => Boolean(u) && !next.includes(u)),
  removeCanonicalImagesFromPublicUrls: async ({ urls }: { urls: string[] }) => {
    removedUrls.push(urls);
    return { removed: urls, failed: [] };
  },
}));

async function patch(body: unknown) {
  const { PATCH } = await import("@/app/api/me/profile/route");
  const req = new Request("http://localhost/api/me/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await PATCH(req as never);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("profile-patch-concurrency helpers", () => {
  it("diffProfileEdit sends only changed fields with their loaded originals", () => {
    expect(diffProfileEdit({ nickname: "홍길동", bio: "안녕" }, { nickname: "홍길동", bio: "안녕 " })).toEqual({
      payload: {},
      expected: {},
    });
    expect(diffProfileEdit({ nickname: "홍길동", bio: null }, { nickname: "홍길동", bio: "반가워요" })).toEqual({
      payload: { bio: "반가워요" },
      expected: { bio: null },
    });
    expect(diffProfileEdit({ nickname: "a1", bio: "x" }, { nickname: "b2", bio: "" })).toEqual({
      payload: { nickname: "b2", bio: null },
      expected: { nickname: "a1", bio: "x" },
    });
  });

  it("legacy member with empty nickname gets it backfilled on save (nickname SSOT)", () => {
    expect(diffProfileEdit({ nickname: null, bio: null }, { nickname: "Kim", bio: "" })).toEqual({
      payload: { nickname: "Kim" },
      expected: { nickname: null },
    });
  });

  it("only expected keys that are actually patched become conditions", () => {
    const expected = parseProfilePatchExpected({ expected: { bio: "old", nickname: "n", role: "admin", avatar_url: 3 } });
    expect(expected).toEqual({ bio: "old", nickname: "n" });
    expect(expectedConditionsForPatch({ bio: "new" }, expected)).toEqual([{ column: "bio", value: "old" }]);
    const calls: string[] = [];
    const q = {
      eq(c: string, v: string) {
        calls.push(`eq:${c}=${v}`);
        return q;
      },
      is(c: string) {
        calls.push(`is:${c}`);
        return q;
      },
    };
    applyExpectedConditions(q, [
      { column: "bio", value: null },
      { column: "nickname", value: "n" },
    ]);
    expect(calls).toEqual(["is:bio", "eq:nickname=n"]);
  });
});

const ORIGIN = "https://proj.supabase.co";
const own = (file: string) => `${ORIGIN}/storage/v1/object/public/post-images/u1/profile/${file}`;
const OWN_NEW = own("aaaaaaaa-bbbb-4ccc-8ddd-000000000001.webp");
const OWN_OLD = own("aaaaaaaa-bbbb-4ccc-8ddd-000000000002.webp");
const OWN_NEWEST = own("aaaaaaaa-bbbb-4ccc-8ddd-000000000003.jpg");
const OTHER_MEMBER_POST = `${ORIGIN}/storage/v1/object/public/post-images/u2/posts/aaaaaaaa-bbbb-4ccc-8ddd-000000000009.jpg`;

describe("PATCH /api/me/profile", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ORIGIN);
    dbRow = { id: "u1", nickname: "홍길동", display_name: "홍길동", bio: "최신 인사", avatar_url: OWN_NEW };
    removedUrls.length = 0;
  });

  it("saves bio and returns the saved row for verification", async () => {
    const r = await patch({ bio: "반가워요", expected: { bio: "최신 인사" } });
    expect(r.status).toBe(200);
    expect((r.json.profile as Row).bio).toBe("반가워요");
    expect(dbRow.bio).toBe("반가워요");
  });

  it("rejects a stale write (409 profile_conflict) and keeps the latest value", async () => {
    const r = await patch({ bio: null, expected: { bio: "예전 인사" } });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("profile_conflict");
    expect(dbRow.bio).toBe("최신 인사");
  });

  it("stale avatar revert is blocked and no storage file is deleted", async () => {
    const r = await patch({ avatar_url: OWN_OLD, expected: { avatar_url: own("aaaaaaaa-bbbb-4ccc-8ddd-000000000004.webp") } });
    expect(r.status).toBe(409);
    expect(dbRow.avatar_url).toBe(OWN_NEW);
    expect(removedUrls).toEqual([]);
  });

  it("avatar replace cleans up exactly the previous DB value after the update succeeds", async () => {
    const r = await patch({ avatar_url: OWN_NEWEST, expected: { avatar_url: OWN_NEW } });
    expect(r.status).toBe(200);
    expect(dbRow.avatar_url).toBe(OWN_NEWEST);
    expect(removedUrls).toEqual([[OWN_NEW]]);
  });

  it("D-11: 기대값 없이 사진을 바꾸면 저장은 되지만 이전 파일은 지우지 않음(현재 사진 삭제 경쟁 방지)", async () => {
    const r = await patch({ avatar_url: OWN_NEWEST });
    expect(r.status).toBe(200);
    expect(dbRow.avatar_url).toBe(OWN_NEWEST);
    expect(removedUrls).toEqual([]);
  });

  describe("D1 — 본인 사진만 지정·삭제", () => {
    it.each([
      ["다른 회원 게시글 사진", OTHER_MEMBER_POST],
      ["다른 회원 프로필 사진", OTHER_MEMBER_POST.replace("/u2/posts/", "/u2/profile/")],
      ["외부 주소", "https://evil.example.com/a.jpg"],
      ["다른 호스트 같은 경로", OWN_NEWEST.replace(ORIGIN, "https://attacker.supabase.co")],
      ["쿼리 붙은 본인 경로", `${OWN_NEWEST}?download=1`],
      ["본인 경로 + ..", OWN_NEWEST.replace("/profile/", "/profile/../posts/")],
      ["파생본", OWN_NEWEST.replace(".jpg", ".thumb.webp")],
    ])("거부: %s → 400, DB·저장소 변화 없음", async (_label, url) => {
      const r = await patch({ avatar_url: url, expected: { avatar_url: OWN_NEW } });
      expect(r.status).toBe(400);
      expect(r.json.code).toBe("avatar_url_not_allowed");
      expect(dbRow.avatar_url).toBe(OWN_NEW);
      expect(removedUrls).toEqual([]);
    });

    it("허용: 기본 그림으로 바꾸면 이전 본인 사진만 정리", async () => {
      const r = await patch({ avatar_url: "/samarket-default-avatar.svg", expected: { avatar_url: OWN_NEW } });
      expect(r.status).toBe(200);
      expect(removedUrls).toEqual([[OWN_NEW]]);
    });

    it("허용: 소셜 로그인 사진을 그대로 다시 저장(값 불변)해도 400 아님, 파일 삭제 없음", async () => {
      dbRow.avatar_url = "https://lh3.googleusercontent.com/a/abc=s96-c";
      const r = await patch({ avatar_url: "https://lh3.googleusercontent.com/a/abc=s96-c", bio: "x" });
      expect(r.status).toBe(200);
      expect(removedUrls).toEqual([]);
    });

    it("소셜 사진 → 본인 사진 교체: 외부 주소인 이전 값은 삭제 대상 아님", async () => {
      dbRow.avatar_url = "https://lh3.googleusercontent.com/a/abc=s96-c";
      const r = await patch({ avatar_url: OWN_NEWEST, expected: { avatar_url: "https://lh3.googleusercontent.com/a/abc=s96-c" } });
      expect(r.status).toBe(200);
      expect(removedUrls).toEqual([]);
    });

    it("이전 값이 (과거에 저장된) 다른 회원 사진이어도 그 파일은 지우지 않는다", async () => {
      dbRow.avatar_url = OTHER_MEMBER_POST;
      const r = await patch({ avatar_url: OWN_NEWEST, expected: { avatar_url: OTHER_MEMBER_POST } });
      expect(r.status).toBe(200);
      expect(dbRow.avatar_url).toBe(OWN_NEWEST);
      expect(removedUrls).toEqual([]);
    });
  });
});
