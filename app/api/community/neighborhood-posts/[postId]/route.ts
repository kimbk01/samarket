import { NextRequest, NextResponse } from "next/server";
import { assertCommunityWriteAllowed } from "@/lib/community/community-write-restriction";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isCommunityImportedOrigin } from "@/lib/community/community-post-origin";
import {
  findBannedWord,
  getCommunityFeedOps,
} from "@/lib/community-feed/community-ops-settings";
import { isMissingDbColumnError } from "@/lib/community-feed/supabase-column-error";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import { getNeighborhoodDevSamplePost } from "@/lib/neighborhood/dev-sample-data";
import { deriveCommunityPostCategoryBucket } from "@/lib/neighborhood/derive-community-post-category-bucket";
import { resolveTopicForNeighborhoodCategory } from "@/lib/neighborhood/resolve-topic-for-category";
import {
  communityAcceptanceErrorMessage,
  evaluateCommunityPostAcceptance,
} from "@/lib/community-points/content-acceptance";
import { applyCommunityPointReclaimOnPostDelete } from "@/lib/points/community-point-bridge";
import { summarizeCommunityPostContent } from "@/lib/philife/interleaved-body-markdown";
import { resolveMemberPostImages } from "@/lib/philife/post-body-images";
import { resolveMemberRichBody } from "@/lib/community/member-rich-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ postId: string }>;
}

/** 본인 native 글만 수정 — imported / non-owner 거부 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  // 커뮤니티 활동 제한 (§E-6)
  const restricted = await assertCommunityWriteAllowed(auth.userId, "post");
  if (restricted) return restricted;

  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: {
    category?: string;
    title?: string;
    content?: string;
    /** 회원 서식 본문(편집기) — 있으면 서버가 이것으로 `content` 를 만든다. 없으면 서식 해제(평문이 원천) */
    contentBlocks?: unknown;
    images?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const richBody = resolveMemberRichBody({ content: body.content, contentBlocks: body.contentBlocks });
  const content = richBody.content;
  const rawCat = String(body.category ?? "")
    .trim()
    .toLowerCase();
  /** category 생략 = 기존 주제 유지 (숨김·비활성 주제 글 수정 시 자동 변경 방지 — CM-P2-09) */
  if (rawCat === "meetup") {
    return NextResponse.json({ ok: false, error: "모임 글은 이 경로에서 수정할 수 없습니다." }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ ok: false, error: "제목을 입력해 주세요." }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ ok: false, error: "내용을 입력해 주세요." }, { status: 400 });
  }
  const accepted = evaluateCommunityPostAcceptance({ title, content });
  if (!accepted.ok) {
    return NextResponse.json(
      { ok: false, error: communityAcceptanceErrorMessage(accepted.code) },
      { status: 400 }
    );
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const id = (await resolveCanonicalCommunityPostId(raw)) ?? raw;

  let selectCols =
    "id, user_id, status, is_deleted, is_hidden, origin_kind, section_id, is_meetup, content, content_blocks, images";
  let { data: row, error: findErr } = await sb
    .from("community_posts")
    .select(selectCols)
    .eq("id", id)
    .maybeSingle();
  if (findErr && isMissingDbColumnError(findErr, "origin_kind")) {
    selectCols = "id, user_id, status, is_deleted, is_hidden, section_id, is_meetup, content, images";
    ({ data: row, error: findErr } = await sb.from("community_posts").select(selectCols).eq("id", id).maybeSingle());
  }
  if (findErr) {
    return NextResponse.json({ ok: false, error: findErr.message }, { status: 500 });
  }
  const r = row as {
    id?: string;
    user_id?: string;
    status?: string;
    is_deleted?: boolean;
    origin_kind?: string | null;
    section_id?: string | null;
    is_meetup?: boolean;
    content?: string | null;
    content_blocks?: unknown;
    images?: unknown;
  } | null;
  if (!r?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (r.user_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (isCommunityImportedOrigin(r.origin_kind)) {
    return NextResponse.json(
      { ok: false, error: "imported_not_editable", message: "가져온 글은 수정할 수 없습니다." },
      { status: 403 }
    );
  }
  if (r.is_meetup === true || r.status === "deleted" || r.is_deleted === true) {
    return NextResponse.json({ ok: false, error: "not_editable" }, { status: 400 });
  }
  /** 관리자가 숨긴 글은 작성자가 수정할 수 없다 — 운영 조치 우회 방지 (CM-P3-09) */
  if (r.status === "hidden" || (r as { is_hidden?: boolean }).is_hidden === true) {
    return NextResponse.json(
      { ok: false, error: "moderated_not_editable", message: "운영 정책에 따라 숨겨진 글은 수정할 수 없습니다." },
      { status: 403 }
    );
  }

  const ops = await getCommunityFeedOps();
  if (title.length > ops.max_title_length) {
    return NextResponse.json(
      { ok: false, error: `제목은 ${ops.max_title_length}자 이하입니다.` },
      { status: 400 }
    );
  }
  if (content.length > ops.max_content_length) {
    return NextResponse.json(
      { ok: false, error: `본문은 ${ops.max_content_length}자 이하입니다.` },
      { status: 400 }
    );
  }
  if (findBannedWord(`${title}\n${content}`, ops.banned_words)) {
    return NextResponse.json({ ok: false, error: "금칙어가 포함되어 있습니다." }, { status: 400 });
  }

  const imagesRes = resolveMemberPostImages({
    userId: auth.userId,
    content,
    candidates: body.images,
    previousContent: r.content ?? "",
    previousImages: Array.isArray(r.images) ? r.images : [],
  });
  if (!imagesRes.ok) {
    return NextResponse.json({ ok: false, error: imagesRes.message, code: imagesRes.error }, { status: 400 });
  }
  const images = imagesRes.images;

  const patch: Record<string, unknown> = {
    title,
    content,
    summary: summarizeCommunityPostContent(content),
    images,
    /** 서식 블록 = 이번 요청 기준(없으면 해제). 변경 없을 때 null→null 은 리비전 트리거가 무시 */
    ...(richBody.contentBlocks || r.content_blocks != null ? { content_blocks: richBody.contentBlocks } : {}),
    updated_at: new Date().toISOString(),
    // 리비전 트리거가 수정자·역할을 기록 (M3)
    last_edited_by: auth.userId,
    last_edited_role: "author",
  };

  if (rawCat) {
    const sectionId = r.section_id != null ? String(r.section_id) : "";
    const topicMeta = await resolveTopicForNeighborhoodCategory(sb, rawCat, {
      sectionId: sectionId || undefined,
    });
    if (!topicMeta) {
      return NextResponse.json({ ok: false, error: "선택한 주제를 사용할 수 없습니다." }, { status: 400 });
    }
    patch.topic_id = topicMeta.topicId;
    patch.topic_slug = topicMeta.topicSlug;
    patch.category = deriveCommunityPostCategoryBucket({
      topicOrCategoryRaw: topicMeta.topicSlug,
      isMeetup: false,
    });
  }

  const { error: upErr } = await sb
    .from("community_posts")
    .update(patch)
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  if (images.length > 0) {
    await sb.from("community_post_images").delete().eq("post_id", id);
    const rows = images.map((url, i) => ({
      post_id: id,
      image_url: url,
      storage_path: "",
      sort_order: i,
    }));
    const { error: imgErr } = await sb.from("community_post_images").insert(rows);
    if (imgErr) {
      return NextResponse.json(
        { ok: false, error: imgErr.message || "이미지 저장에 실패했습니다." },
        { status: 500 }
      );
    }
  } else {
    await sb.from("community_post_images").delete().eq("post_id", id);
  }

  return NextResponse.json({ ok: true, id });
}

/** 본인 글만 소프트 삭제 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const id = (await resolveCanonicalCommunityPostId(raw)) ?? raw;
  if (process.env.NODE_ENV !== "production") {
    const samplePost = getNeighborhoodDevSamplePost(id);
    if (samplePost) {
      if (samplePost.author_id !== auth.userId) {
        return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
      }
      const scope = globalThis as {
        __samarketNeighborhoodDevSampleState?: {
          postStatus?: Map<string, { status: "active" | "hidden" | "deleted"; is_reported: boolean; is_sample_data: boolean }>;
        };
      };
      const current = scope.__samarketNeighborhoodDevSampleState?.postStatus?.get(id);
      if (current && scope.__samarketNeighborhoodDevSampleState?.postStatus) {
        scope.__samarketNeighborhoodDevSampleState.postStatus.set(id, { ...current, status: "deleted" });
        return NextResponse.json({ ok: true, fallback: "dev_samples" });
      }
    }
  }
  const { data: row } = await sb
    .from("community_posts")
    .select("id, user_id, origin_kind, status, is_hidden")
    .eq("id", id)
    .maybeSingle();
  const r = row as {
    id?: string;
    user_id?: string;
    origin_kind?: string | null;
    status?: string | null;
    is_hidden?: boolean | null;
  } | null;
  if (!r?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (r.user_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (isCommunityImportedOrigin(r.origin_kind)) {
    return NextResponse.json(
      { ok: false, error: "imported_not_deletable", message: "가져온 글은 일반 회원으로 삭제할 수 없습니다." },
      { status: 403 }
    );
  }

  /** 관리자 숨김 글은 작성자 삭제로 덮어쓰지 않는다 — 운영 상태·영구 삭제 타이머 보존 (CM-P3-09) */
  if (r.status === "hidden" || r.is_hidden === true) {
    return NextResponse.json(
      { ok: false, error: "moderated_not_deletable", message: "운영 정책에 따라 숨겨진 글은 삭제할 수 없습니다." },
      { status: 403 }
    );
  }
  const { error } = await sb
    .from("community_posts")
    .update({ status: "deleted" })
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await applyCommunityPointReclaimOnPostDelete({ postId: id });
  return NextResponse.json({ ok: true });
}
