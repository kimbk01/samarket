/**
 * 삭제한 지 30일 지난 글의 사진 정리 (Owner 2026-11-20 「30일 뒤 삭제」 · 감사 §11 O2).
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COMMUNITY_DELETED_POST_IMAGE_RETENTION_DAYS,
  purgeExpiredDeletedPostImages,
} from "@/lib/community/community-post-image-gc.server";

const U = "11111111-1111-4111-8111-111111111111";
const url = (id: string) => `https://p.supabase.co/storage/v1/object/public/post-images/${U}/community/${id}.webp`;
const path = (id: string) => `${U}/community/${id}.webp`;
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";
const D = "dddddddd-0000-4000-8000-000000000004";

type Call = { table: string; filters: Array<[string, unknown]>; update?: unknown };

function fakeSb(opts: {
  posts: Record<string, unknown>[];
  reports?: { target_id: string }[];
  attach?: { post_id: string; image_url: string }[];
  revisions?: Record<string, unknown>[];
  unreferenced: (names: string[], exclude: string[]) => string[];
  removeFails?: string[];
}) {
  const calls: Call[] = [];
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const removed: string[][] = [];
  const data: Record<string, unknown[]> = {
    community_posts: opts.posts,
    community_reports: opts.reports ?? [],
    community_post_images: opts.attach ?? [],
    community_post_revisions: opts.revisions ?? [],
  };
  const builder = (table: string) => {
    const call: Call = { table, filters: [] };
    calls.push(call);
    const q: Record<string, unknown> = {};
    const chain = (name: string) => (...args: unknown[]) => {
      call.filters.push([name, args]);
      return q;
    };
    for (const m of ["select", "eq", "lt", "is", "order", "limit", "in"]) q[m] = chain(m);
    q.update = (v: unknown) => {
      call.update = v;
      return q;
    };
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: call.update ? null : data[table], error: null });
    return q;
  };
  const sb = {
    from: builder,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      const names = opts.unreferenced(args.p_names as string[], args.p_exclude_post_ids as string[]);
      return { data: names.map((name) => ({ name })), error: null };
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removed.push(paths);
          return opts.removeFails?.includes(paths[0]!) ? { error: { message: "boom" } } : { error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { sb, calls, rpcCalls, removed };
}

describe("삭제 30일 지난 글 사진 정리", () => {
  it("기간은 30일 — deleted_at 기준으로 조회", async () => {
    expect(COMMUNITY_DELETED_POST_IMAGE_RETENTION_DAYS).toBe(30);
    const now = new Date("2026-12-31T00:00:00Z");
    const { sb, calls } = fakeSb({ posts: [], unreferenced: () => [] });
    const r = await purgeExpiredDeletedPostImages(sb, now);
    expect(r).toMatchObject({ ok: true, posts: [] });
    const q = calls[0]!;
    expect(q.table).toBe("community_posts");
    expect(q.filters).toContainEqual(["eq", ["status", "deleted"]]);
    expect(q.filters).toContainEqual(["lt", ["deleted_at", "2026-12-01T00:00:00.000Z"]]);
    expect(q.filters).toContainEqual(["is", ["deleted_images_purged_at", null]]);
  });

  it("사진 열·첨부 표·수정 기록 사진을 모두 모아, 대상 글만 빼고 판정하고 지운 뒤 완료 표시", async () => {
    const { sb, rpcCalls, removed, calls } = fakeSb({
      posts: [
        { id: "p1", images: [url(A)], thumbnail_url: url(A), content: `x ![](${url(B)})`, content_blocks: null },
        { id: "p2", images: [], content: "", content_blocks: [{ t: "img", url: url(C) }] },
      ],
      attach: [{ post_id: "p1", image_url: url(A) }],
      revisions: [{ post_id: "p2", content: `old ![](${url(D)})`, content_blocks: null }],
      /** D 는 다른 곳에서도 쓰인다고 가정 → 지우지 않음 */
      unreferenced: (names) => names.filter((n) => n !== path(D)),
    });
    const r = await purgeExpiredDeletedPostImages(sb);
    expect(rpcCalls[0]!.fn).toBe("community_post_image_unreferenced_excluding_posts");
    expect(new Set(rpcCalls[0]!.args.p_names as string[])).toEqual(new Set([path(A), path(B), path(C), path(D)]));
    expect(rpcCalls[0]!.args.p_exclude_post_ids).toEqual(["p1", "p2"]);
    expect(removed.map((p) => p[0])).toEqual(expect.arrayContaining([path(A), path(B), path(C)]));
    expect(removed.map((p) => p[0])).not.toContain(path(D));
    expect(r).toMatchObject({ ok: true, posts: ["p1", "p2"], failed: [] });
    const mark = calls.find((c) => c.update);
    expect(mark?.update).toMatchObject({ deleted_images_purged_at: expect.any(String) });
    expect(mark?.filters).toContainEqual(["in", ["id", ["p1", "p2"]]]);
  });

  it("처리 안 된 신고가 있는 글은 건너뛴다(다음 날 다시)", async () => {
    const { sb, rpcCalls } = fakeSb({
      posts: [{ id: "p1", images: [url(A)] }, { id: "p2", images: [url(B)] }],
      reports: [{ target_id: "p1" }],
      unreferenced: (names) => names,
    });
    const r = await purgeExpiredDeletedPostImages(sb);
    expect(r).toMatchObject({ ok: true, posts: ["p2"], skippedOpenReports: ["p1"] });
    expect(rpcCalls[0]!.args.p_exclude_post_ids).toEqual(["p2"]);
    expect(rpcCalls[0]!.args.p_names).toEqual([path(B)]);
  });

  it("저장소 삭제가 실패한 사진이 있는 글은 완료 표시하지 않는다", async () => {
    const { sb, calls } = fakeSb({
      posts: [{ id: "p1", images: [url(A)] }, { id: "p2", images: [url(B)] }],
      unreferenced: (names) => names,
      removeFails: [path(A)],
    });
    const r = await purgeExpiredDeletedPostImages(sb);
    expect(r).toMatchObject({ ok: true, posts: ["p2"] });
    expect(r.ok && r.failed.map((f) => f.path)).toEqual([path(A)]);
    expect(calls.find((c) => c.update)?.filters).toContainEqual(["in", ["id", ["p2"]]]);
  });
});

describe("참조 판정 함수 — 대상 글을 보는 모든 줄에 제외 조건 (보정 20271120091000)", () => {
  it("community_posts·philife_posts(같은 글 뷰)·첨부 표·수정 기록 줄은 모두 `<> all(ex.ids)`", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => readFileSync(`${dir}/${f}`, "utf8").includes("function public.community_post_image_unreferenced_excluding_posts"));
    const latest = readFileSync(`${dir}/${files[files.length - 1]!}`, "utf8");
    expect(files[files.length - 1]).toBe("20271120091000_community_deleted_post_image_purge_view_fix.sql");
    const lines = latest
      .split("\n")
      .filter((l) => /from public\.(community_posts|philife_posts|community_post_images|community_post_revisions)\b/.test(l));
    /** 첨부 1 · 수정 기록 2 · 글 5 · 같은 글 뷰 3 */
    expect(lines.length).toBe(11);
    for (const l of lines) expect(l, l).toMatch(/<> all\(ex\.ids\)/);
  });
});
