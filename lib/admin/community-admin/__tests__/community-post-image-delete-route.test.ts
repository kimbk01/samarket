import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeCommunitySupabase,
  filterValue,
  jsonRequest,
  type FakeCall,
  type FakeResult,
} from "./fake-community-supabase";

let handler: (call: FakeCall) => FakeResult = () => ({ data: null, error: null });
const fake = createFakeCommunitySupabase((c) => handler(c));

let gateOk = true;
const audit = vi.fn(async (..._a: unknown[]) => ({ ok: true as boolean }));
const notifyContent = vi.fn(async (..._a: unknown[]) => undefined);
const removeStorage = vi.fn(async (..._a: unknown[]) => ({ attempted: ["x"], removed: ["x"], failed: [] as unknown[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/community-admin/community-admin-guards", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireCommunityAdmin: async () =>
      gateOk
        ? { ok: true, userId: "admin-1", actor: { userId: "admin-1" }, sb: fake.sb }
        : { ok: false, response: NextResponse.json({ ok: false, error: "forbidden_permission" }, { status: 403 }) },
  };
});
vi.mock("@/lib/admin/community-admin/community-admin-audit", () => ({
  appendCommunityAdminAudit: (...a: unknown[]) => audit(...a),
}));
vi.mock("@/lib/notifications/notify-community-moderation", () => ({
  notifyCommunityContentModerated: (...a: unknown[]) => notifyContent(...a),
  notifyCommunityPromotionEnded: async () => undefined,
}));
vi.mock("@/lib/points/community-point-bridge", () => ({
  applyCommunityPointReclaimOnPostAdminRemove: async () => undefined,
}));
vi.mock("@/lib/media/canonical-image-lifecycle.server", () => ({
  collectCanonicalImagePublicUrls: (urls: Iterable<string>) =>
    [...urls].filter((u) => typeof u === "string" && u.includes("/object/public/post-images/") && /\.(webp|jpe?g|png)$/.test(u)),
  removeCanonicalImagesFromPublicUrls: (...a: unknown[]) => removeStorage(...a),
}));

import { DELETE as deleteImage } from "@/app/api/admin/community/engine/posts/[postId]/images/[imageId]/route";

const LOADED = "2026-10-19T01:00:00.123456+00:00";
const IMG_ID = "11111111-2222-4333-8444-555555555555";
const URL_A = "https://proj.supabase.co/storage/v1/object/public/post-images/author-1/community/a.webp";
const URL_B = "https://proj.supabase.co/storage/v1/object/public/post-images/author-1/community/b.webp";

const memberPost = {
  id: "post-1",
  user_id: "author-1",
  origin_kind: "member",
  status: "active",
  title: "제목",
  content: `앞 문단\n\n![](${URL_A})\n\n뒤 문단`,
  content_blocks: null,
  images: [URL_A, URL_B],
  thumbnail_url: URL_A,
  updated_at: LOADED,
};
const imageRow = { id: IMG_ID, post_id: "post-1", image_url: URL_A, storage_path: "", sort_order: 0 };

function callDelete(body: Record<string, unknown>, imageId = IMG_ID) {
  return deleteImage(
    jsonRequest(`https://x.test/api/admin/community/engine/posts/post-1/images/${imageId}`, "DELETE", body) as never,
    { params: Promise.resolve({ postId: "post-1", imageId }) }
  );
}

function routeHandler(opts: {
  post?: Record<string, unknown> | null;
  image?: Record<string, unknown> | null;
  updated?: Record<string, unknown> | null;
  otherRows?: unknown[];
  otherPosts?: unknown[];
  revisions?: unknown[];
}) {
  return (c: FakeCall): FakeResult => {
    if (c.table === "community_posts" && c.op === "select") {
      if (filterValue(c, "contains", "images") !== undefined) return { data: opts.otherPosts ?? [], error: null };
      if (filterValue(c, "eq", "thumbnail_url") !== undefined) return { data: [], error: null };
      return { data: opts.post === undefined ? memberPost : opts.post, error: null };
    }
    if (c.table === "community_posts" && c.op === "update") {
      const base = opts.post ?? memberPost;
      return {
        data:
          opts.updated === undefined
            ? { ...base, ...(c.values as object), updated_at: "2026-10-19T02:00:00.000001+00:00" }
            : opts.updated,
        error: null,
      };
    }
    if (c.table === "community_post_images" && c.op === "select") {
      if (c.terminal === "maybeSingle") return { data: opts.image === undefined ? imageRow : opts.image, error: null };
      return { data: opts.otherRows ?? [], error: null };
    }
    if (c.table === "community_post_revisions") return { data: opts.revisions ?? [], error: null };
    return { data: null, error: null };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.calls.length = 0;
  gateOk = true;
});

describe("DELETE posts/:postId/images/:imageId", () => {
  it("403 without community content permission", async () => {
    gateOk = false;
    handler = routeHandler({});
    const res = await callDelete({ reason: "개인정보 노출", expectedUpdatedAt: LOADED });
    expect(res.status).toBe(403);
    expect(fake.calls).toHaveLength(0);
  });

  it("400 reason_required when reason is missing or too short", async () => {
    handler = routeHandler({});
    let res = await callDelete({ expectedUpdatedAt: LOADED });
    expect(((await res.json()) as { error: string }).error).toBe("reason_required");
    res = await callDelete({ expectedUpdatedAt: LOADED, reason: " a " });
    expect(res.status).toBe(400);
    expect(fake.calls.some((c) => c.op === "update" || c.op === "delete")).toBe(false);
  });

  it("409 conflict when the version on screen is stale", async () => {
    handler = routeHandler({ post: { ...memberPost, updated_at: "2026-10-19T03:00:00+00:00" } });
    const res = await callDelete({ reason: "개인정보 노출", expectedUpdatedAt: LOADED });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("conflict");
    expect(fake.calls.some((c) => c.op === "update" || c.op === "delete")).toBe(false);
  });

  it("409 conflict when the conditional UPDATE matches 0 rows (race)", async () => {
    handler = routeHandler({ updated: null });
    const res = await callDelete({ reason: "개인정보 노출", expectedUpdatedAt: LOADED });
    expect(res.status).toBe(409);
    expect(fake.calls.some((c) => c.op === "delete")).toBe(false);
    expect(audit).not.toHaveBeenCalled();
  });

  it("404 image_not_found when the image does not belong to the post", async () => {
    handler = routeHandler({ image: null });
    const res = await callDelete({ reason: "개인정보 노출", expectedUpdatedAt: LOADED });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("image_not_found");
    const imgLookup = fake.calls.find((c) => c.table === "community_post_images" && c.op === "select")!;
    expect(filterValue(imgLookup, "eq", "post_id")).toBe("post-1");
    expect(fake.calls.some((c) => c.op === "update" || c.op === "delete")).toBe(false);
  });

  it("success: strips every reference, writes audit with the URL, removes unreferenced storage, notifies author", async () => {
    handler = routeHandler({});
    const res = await callDelete({ reason: "개인정보 노출", expectedUpdatedAt: LOADED });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { storage: string };
    expect(j.storage).toBe("removed");

    const upd = fake.calls.find((c) => c.table === "community_posts" && c.op === "update")!;
    const v = upd.values as Record<string, unknown>;
    expect(filterValue(upd, "eq", "updated_at")).toBe(LOADED);
    expect(v.images).toEqual([URL_B]);
    expect(v.thumbnail_url).toBe(URL_B);
    expect(String(v.content)).not.toContain(URL_A);
    expect(String(v.content)).toContain("뒤 문단");
    expect(v.last_edited_by).toBe("admin-1");
    expect(v.last_edited_role).toBe("admin");
    expect(v.last_edit_reason).toBe("개인정보 노출");
    expect(typeof v.last_admin_edit_at).toBe("string");

    const del = fake.calls.find((c) => c.table === "community_post_images" && c.op === "delete")!;
    expect(filterValue(del, "eq", "id")).toBe(IMG_ID);

    expect(audit).toHaveBeenCalledTimes(1);
    const entry = audit.mock.calls[0]![2] as { action: string; before: Record<string, unknown>; after: Record<string, unknown> };
    expect(entry.action).toBe("community_post.image_delete");
    expect(entry.before.image_url).toBe(URL_A);
    expect(entry.after.image_url).toBe(URL_A);
    expect(entry.after.images).toEqual([URL_B]);

    expect(removeStorage).toHaveBeenCalledTimes(1);
    expect((removeStorage.mock.calls[0]![0] as { urls: string[] }).urls).toEqual([URL_A]);
    expect(notifyContent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "edited", postId: "post-1" }));
  });

  it("keeps storage when another post still references the URL", async () => {
    handler = routeHandler({ otherPosts: [{ id: "post-2" }] });
    const res = await callDelete({ reason: "개인정보 노출", expectedUpdatedAt: LOADED });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { storage: string }).storage).toBe("retained_referenced_elsewhere");
    expect(audit).toHaveBeenCalledTimes(1);
    expect(removeStorage).not.toHaveBeenCalled();
  });

  it("keeps storage when a revision (evidence history) still contains the URL", async () => {
    handler = routeHandler({ revisions: [{ content: `![](${URL_A})`, content_blocks: null }] });
    const res = await callDelete({ reason: "개인정보 노출", expectedUpdatedAt: LOADED });
    expect(((await res.json()) as { storage: string }).storage).toBe("retained_revision_history");
    expect(removeStorage).not.toHaveBeenCalled();
  });

  it("does not remove storage when the audit write fails", async () => {
    audit.mockResolvedValueOnce({ ok: false });
    handler = routeHandler({});
    const res = await callDelete({ reason: "개인정보 노출", expectedUpdatedAt: LOADED });
    expect(((await res.json()) as { storage: string }).storage).toBe("skipped_audit_failed");
    expect(removeStorage).not.toHaveBeenCalled();
  });

  it("imported post: removes the img block and does not notify", async () => {
    const imported = {
      ...memberPost,
      origin_kind: "imported",
      content: "본문",
      images: [URL_A],
      thumbnail_url: null,
      content_blocks: [
        { t: "p", text: "문단" },
        { t: "img", url: URL_A, alt: null, caption: null },
      ],
    };
    handler = routeHandler({ post: imported });
    const res = await callDelete({ reason: "저작권 문제", expectedUpdatedAt: LOADED });
    expect(res.status).toBe(200);
    const v = fake.calls.find((c) => c.table === "community_posts" && c.op === "update")!.values as Record<string, unknown>;
    expect(v.content_blocks).toEqual([{ t: "p", text: "문단" }]);
    expect(v.images).toEqual([]);
    expect("content" in v).toBe(false);
    expect(notifyContent).not.toHaveBeenCalled();
  });
});
