import { NextRequest, NextResponse } from "next/server";
import { assertCommunityWriteAllowed } from "@/lib/community/community-write-restriction";
import { requireAuth, validateActiveSession } from "@/lib/auth/server-guards"
import {
  isProductWriteDeniedMemberAccount,
  MEMBER_ACCOUNT_WRITE_DENIED_MESSAGE,
} from "@/lib/auth/member-account-state";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
import {
  countUserCommunityPostsToday,
  getCommunityFeedOps,
} from "@/lib/community-feed/community-ops-settings";
import { guardBannedWords } from "@/lib/community-feed/banned-word-guard.server";
import { normalizeSectionSlug } from "@/lib/community-feed/constants";
import { resolveTopicMeta } from "@/lib/community-feed/queries";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/http/api-route";
import { deriveCommunityPostCategoryBucket } from "@/lib/neighborhood/derive-community-post-category-bucket";
import {
  communityAcceptanceErrorCode,
  evaluateCommunityPostAcceptance,
} from "@/lib/community-points/content-acceptance";
import { applyCommunityPointRewardOnPostWrite } from "@/lib/points/community-point-bridge";
import { summarizeCommunityPostContent } from "@/lib/philife/interleaved-body-markdown";
import { resolveCommunityPublicRegionLabelForUser } from "@/lib/addresses/community-public-region-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  if (isProductWriteDeniedMemberAccount(session.profile)) {
    return jsonError(MEMBER_ACCOUNT_WRITE_DENIED_MESSAGE, 403, { code: "member_activity_restricted" });
  }
  // 커뮤니티 활동 제한 (§E-6)
  const restricted = await assertCommunityWriteAllowed(auth.userId, "post");
  if (restricted) return restricted;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return jsonError("server_config", 500);
  }

  const profileGate = await requireProfileFieldsForAction(
    sb as import("@supabase/supabase-js").SupabaseClient,
    auth.userId,
    "community_write"
  );
  if (!profileGate.ok) return profileGate.response;

  const createRateLimit = await enforceRateLimit({
    key: `community-post:create:${getRateLimitKey(req, auth.userId)}`,
    limit: 8,
    windowMs: 60_000,
    code: "community_post_create_rate_limited",
  });
  if (!createRateLimit.ok) return createRateLimit.response;

  const parsed = await parseJsonBody<{
    sectionSlug?: string;
    topicSlug?: string;
    title?: string;
    content?: string;
    is_question?: boolean;
    imageUrls?: string[];
  }>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const sectionSlug = normalizeSectionSlug(body.sectionSlug);
  const topicSlug = body.topicSlug?.trim().toLowerCase();
  const title = body.title?.trim();
  const content = (body.content ?? "").trim();

  if (!topicSlug) {
    return jsonError("category_required", { status: 400, code: "category_required" });
  }
  if (!title) {
    return jsonError("title_required", { status: 400, code: "title_required" });
  }
  if (!content) {
    return jsonError("content_required", { status: 400, code: "content_required" });
  }
  const accepted = evaluateCommunityPostAcceptance({ title, content });
  if (!accepted.ok) {
    const acceptanceCode = communityAcceptanceErrorCode(accepted.code);
    return jsonError(acceptanceCode, { status: 400, code: acceptanceCode });
  }

  const ops = await getCommunityFeedOps();
  if (title.length > ops.max_title_length) {
    return NextResponse.json(
      { ok: false, error: "title_too_long", code: "title_too_long", params: { max: ops.max_title_length } },
      { status: 400 }
    );
  }
  if (content.length > ops.max_content_length) {
    return NextResponse.json(
      { ok: false, error: "content_too_long", code: "content_too_long", params: { max: ops.max_content_length } },
      { status: 400 }
    );
  }
  const filtered = await guardBannedWords({
    userId: auth.userId,
    surface: "community_post",
    texts: [title, content],
    operatorWords: ops.banned_words,
    acceptLanguage: req.headers.get("accept-language"),
  });
  if (!filtered.ok) return jsonError(filtered.error, filtered.status, { code: filtered.code });

  const meta = await resolveTopicMeta(sectionSlug, topicSlug);
  if (!meta || meta.is_feed_sort) {
    return jsonError("topic_unavailable", { status: 400, code: "topic_unavailable" });
  }

  const is_question = meta.allow_question ? !!body.is_question : false;

  const categoryForDb = deriveCommunityPostCategoryBucket({
    topicOrCategoryRaw: topicSlug,
  });

  if (ops.max_posts_per_day > 0) {
    const n = await countUserCommunityPostsToday(auth.userId);
    if (n >= ops.max_posts_per_day) {
      return NextResponse.json(
        { ok: false, error: "daily_post_limit", code: "daily_post_limit", params: { max: ops.max_posts_per_day } },
        { status: 429 }
      );
    }
  }

  const { data: sec, error: se } = await sb
    .from("community_sections")
    .select("id, slug")
    .eq("slug", sectionSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (se || !sec) {
    return jsonError("section_not_found", { status: 400, code: "section_not_found" });
  }

  let region_label: string;
  try {
    region_label = await resolveCommunityPublicRegionLabelForUser(sb, auth.userId);
  } catch (e) {
    console.error("[community-posts] region_label", e);
    return jsonError("region_label_resolve_failed", { status: 500, code: "region_label_resolve_failed" });
  }

  const { data: inserted, error: insErr } = await sb
    .from("community_posts")
    .insert({
      user_id: auth.userId,
      section_id: (sec as { id: string }).id,
      section_slug: (sec as { slug: string }).slug,
      topic_id: meta.id,
      topic_slug: topicSlug,
      title,
      content,
      summary: summarizeCommunityPostContent(content),
      region_label,
      category: categoryForDb,
      images: [],
      is_question,
      status: "active",
      is_sample_data: false,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    console.error("[community/posts] insert failed", { message: insErr?.message ?? null });
    return jsonError("community_post_insert_failed", 500, {
      code: "community_post_insert_failed",
    });
  }

  const newId = (inserted as { id: string }).id;
  const urls = Array.isArray(body.imageUrls)
    ? body.imageUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0).slice(0, 10)
    : [];
  if (urls.length > 0) {
    const rows = urls.map((url, i) => ({
      post_id: newId,
      image_url: url.trim(),
      storage_path: "",
      sort_order: i,
    }));
    const { error: imgErr } = await sb.from("community_post_images").insert(rows);
    if (imgErr) {
      await sb.from("community_posts").delete().eq("id", newId);
      console.error("[community/posts] image insert failed", { message: imgErr.message });
      return jsonError("community_post_image_insert_failed", 500, {
        code: "community_post_image_insert_failed",
      });
    }
  }

  await applyCommunityPointRewardOnPostWrite({
    userId: auth.userId,
    postId: newId,
    title,
    content,
    isQuestion: is_question,
    topicSlug,
  });

  return jsonOk({ id: newId });
}
