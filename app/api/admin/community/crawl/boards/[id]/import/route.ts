import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  findExistingCommunityCrawlPostLink,
  publishCommunityManualImportReferenceSummary,
} from "@/lib/community-crawler/manual-import-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  sourcePostId?: string | null;
  canonicalUrl?: string;
  sourcePublishedAt?: string | null;
  sourceBodyMarkdown?: string;
  title?: string;
  content?: string;
  displayAuthorName?: string;
  displayAuthorAvatarUrl?: string | null;
  createdAtIso?: string | null;
  viewCount?: number;
  regionLabel?: string;
  /** If true, only dedupe check — no write. */
  checkOnly?: boolean;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await ctx.params;
  const boardId = id?.trim();
  if (!boardId) {
    return NextResponse.json({ ok: false, error: "board_id_required" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const canonicalUrl = String(body.canonicalUrl ?? "").trim();
  const sourcePostId =
    body.sourcePostId != null && String(body.sourcePostId).trim()
      ? String(body.sourcePostId).trim()
      : null;

  if (body.checkOnly === true) {
    if (!canonicalUrl && !sourcePostId) {
      return NextResponse.json({ ok: false, error: "source_identity_required" }, { status: 400 });
    }
    const existing = await findExistingCommunityCrawlPostLink(sb, {
      boardId,
      sourcePostId,
      canonicalUrl,
    });
    if (existing) {
      return NextResponse.json({
        ok: true,
        alreadyImported: true,
        communityPostId: existing.communityPostId,
        message: "already_imported",
      });
    }
    return NextResponse.json({ ok: true, alreadyImported: false });
  }

  const result = await publishCommunityManualImportReferenceSummary(sb, {
    boardId,
    sourcePostId,
    canonicalUrl,
    sourcePublishedAt:
      body.sourcePublishedAt != null && String(body.sourcePublishedAt).trim()
        ? String(body.sourcePublishedAt).trim()
        : null,
    sourceBodyMarkdown: String(body.sourceBodyMarkdown ?? ""),
    title: String(body.title ?? ""),
    content: String(body.content ?? ""),
    displayAuthorName: String(body.displayAuthorName ?? ""),
    displayAuthorAvatarUrl:
      body.displayAuthorAvatarUrl != null ? String(body.displayAuthorAvatarUrl) : null,
    createdAtIso:
      body.createdAtIso != null && String(body.createdAtIso).trim()
        ? String(body.createdAtIso).trim()
        : null,
    viewCount: typeof body.viewCount === "number" ? body.viewCount : 0,
    regionLabel: body.regionLabel,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        communityPostId: result.communityPostId,
        detail: result.detail,
      },
      { status: result.httpStatus }
    );
  }

  return NextResponse.json({
    ok: true,
    communityPostId: result.communityPostId,
    postLinkId: result.postLinkId,
    originKind: result.originKind,
    publishMode: result.publishMode,
    pointReward: 0,
    mediaDelta: 0,
    writes: {
      community_posts: 1,
      community_crawl_post_links: 1,
      media_storage: 0,
      point_reward: 0,
    },
  });
}
