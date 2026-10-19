import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import {
  deleteCommunityPostImageAsAdmin,
  type CommunityPostImageDeleteBody,
} from "@/lib/admin/community-admin/community-post-image-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ postId: string; imageId: string }> };

/**
 * DELETE /api/admin/community/engine/posts/:postId/images/:imageId
 * body: { expectedUpdatedAt: string, reason: string (2자+) }
 * imageId = community_post_images.id (상세 GET 의 post.images[].id).
 * 글의 이미지 참조(행·images·thumbnail·본문·블록)를 끊고, 어디에서도 참조하지 않을 때만 저장소를 지운다.
 * 200 { ok, post, imageId, storage, auditOk } · 400 reason_required · 404 not_found|image_not_found · 409 conflict
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const admin = await requireCommunityAdmin("content");
  if (!admin.ok) return admin.response;

  const { postId, imageId } = await ctx.params;
  const pid = postId?.trim();
  const iid = imageId?.trim();
  if (!pid || !iid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: CommunityPostImageDeleteBody;
  try {
    body = (await req.json()) as CommunityPostImageDeleteBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const res = await deleteCommunityPostImageAsAdmin(admin.sb, req, {
    actorId: admin.userId,
    postId: pid,
    imageId: iid,
    body,
  });
  return NextResponse.json(res.body, { status: res.status });
}
