import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMENT_STATUSES,
  MEETING_ADMIN_TABS,
  MEETING_STATUSES,
  buildCommunitySearchOr,
  escapeIlikePattern,
  normalizeCommunitySearchTerm,
  parseCommunityListPage,
  parseCommunityListSearch,
  pickAllowed,
} from "@/lib/admin/community-admin/community-list-query";

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const UUID2 = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("parseCommunityListPage", () => {
  const sp = (o: Record<string, string>) => new URLSearchParams(o);
  it("defaults to limit 50 offset 0", () => {
    expect(parseCommunityListPage(sp({}))).toEqual({ limit: 50, offset: 0 });
  });
  it("clamps limit to 1..200 and offset to >= 0", () => {
    expect(parseCommunityListPage(sp({ limit: "500", offset: "-3" }))).toEqual({ limit: 200, offset: 0 });
    expect(parseCommunityListPage(sp({ limit: "0", offset: "100" }))).toEqual({ limit: 1, offset: 100 });
    expect(parseCommunityListPage(sp({ limit: "abc", offset: "x" }))).toEqual({ limit: 50, offset: 0 });
  });
});

describe("search term", () => {
  it("strips PostgREST or() syntax characters and collapses whitespace", () => {
    expect(normalizeCommunitySearchTerm('  a,b (c) "d" *e  ')).toBe("a b c d e");
    expect(normalizeCommunitySearchTerm("")).toBe("");
    expect(normalizeCommunitySearchTerm(null)).toBe("");
    expect(normalizeCommunitySearchTerm("x".repeat(200)).length).toBe(80);
  });
  it("escapes ilike wildcards % _ \\", () => {
    expect(escapeIlikePattern("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(parseCommunityListSearch("a%b").pattern).toBe("%a\\%b%");
  });
  it("detects exact UUID", () => {
    expect(parseCommunityListSearch(UUID.toUpperCase()).uuid).toBe(UUID);
    expect(parseCommunityListSearch("hello").uuid).toBeNull();
    expect(parseCommunityListSearch("   ")).toEqual({ term: "", uuid: null, pattern: null });
  });
});

describe("buildCommunitySearchOr", () => {
  it("returns null without a term", () => {
    expect(
      buildCommunitySearchOr({
        search: parseCommunityListSearch(""),
        textColumns: ["title"],
        userColumn: "host_user_id",
        matchedUserIds: [UUID],
        uuidColumns: ["id"],
      })
    ).toBeNull();
  });
  it("ORs text ilike with matched user ids (non-uuid values dropped)", () => {
    expect(
      buildCommunitySearchOr({
        search: parseCommunityListSearch("hike"),
        textColumns: ["title"],
        userColumn: "host_user_id",
        matchedUserIds: [UUID, "bad", UUID],
        uuidColumns: ["id", "post_id"],
      })
    ).toBe(`title.ilike.%hike%,host_user_id.in.(${UUID})`);
  });
  it("adds exact id matches for a UUID term", () => {
    expect(
      buildCommunitySearchOr({
        search: parseCommunityListSearch(UUID2),
        textColumns: ["content"],
        userColumn: "user_id",
        matchedUserIds: [],
        uuidColumns: ["id", "post_id", "user_id"],
      })
    ).toBe(`content.ilike.%${UUID2}%,id.eq.${UUID2},post_id.eq.${UUID2},user_id.eq.${UUID2}`);
  });
});

describe("status whitelist", () => {
  it("accepts only schema statuses", () => {
    expect(pickAllowed("open", MEETING_STATUSES)).toBe("open");
    expect(pickAllowed("bogus", MEETING_STATUSES)).toBe("");
    expect(pickAllowed("pending", MEETING_ADMIN_TABS)).toBe("pending");
    expect(pickAllowed("HIDDEN", COMMENT_STATUSES)).toBe("hidden");
    expect(pickAllowed(null, COMMENT_STATUSES)).toBe("");
  });
  it("matches migration CHECK constraints", () => {
    const v2 = read("supabase/migrations/20260327100000_community_engine_v2.sql");
    expect(v2).toContain("CHECK (status IN ('active', 'hidden', 'deleted'))");
    expect(v2).toContain("CHECK (status IN ('open', 'closed', 'ended', 'cancelled'))");
  });
});

describe("route contracts — meetings/comments list: q · total · range", () => {
  it("meetings route", () => {
    const src = read("app/api/admin/community/engine/meetings/route.ts");
    expect(src).toContain('{ count: "exact" }');
    expect(src).toContain(".range(offset, offset + limit - 1)");
    expect(src).toContain("parseCommunityListSearch");
    expect(src).toContain('.ilike("nickname", search.pattern)');
    expect(src).toMatch(/total: typeof count === "number"/);
    expect(src).toContain("host_nickname");
    expect(src).toContain("host_username");
  });
  it("comments route", () => {
    const src = read("app/api/admin/community/engine/comments/route.ts");
    expect(src).toContain('{ count: "exact" }');
    expect(src).toContain("q.range(offset, offset + limit - 1)");
    expect(src).toContain('textColumns: ["content"]');
    expect(src).toContain('.ilike("nickname", search.pattern)');
    expect(src).toMatch(/total: typeof count === "number"/);
  });
  it("UIs send q and render total + pagination", () => {
    const meetings = read("components/admin/community/AdminCommunityEngineMeetingsClient.tsx");
    expect(meetings).toContain("CommunityPagination");
    expect(meetings).toContain("admin_community_list_total");
    expect(meetings).toContain('sp.set("q", q)');
    const comments = read("components/admin/community/AdminCommunityCommentsPage.tsx");
    expect(comments).toContain("CommunitySearchInput");
    expect(comments).toContain("admin_community_list_total");
    expect(comments).toContain('q.set("q", qParam)');
  });
});
