import { NextRequest, NextResponse } from "next/server";
import { assertCommunityWriteAllowed } from "@/lib/community/community-write-restriction";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  countUserCommunityPostsToday,
  getCommunityFeedOps,
} from "@/lib/community-feed/community-ops-settings";
import { guardBannedWords } from "@/lib/community-feed/banned-word-guard.server";
import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";
import { resolveTopicForNeighborhoodCategory } from "@/lib/neighborhood/resolve-topic-for-category";
import { deriveCommunityPostCategoryBucket } from "@/lib/neighborhood/derive-community-post-category-bucket";
import {
  communityAcceptanceErrorCode,
  evaluateCommunityPostAcceptance,
} from "@/lib/community-points/content-acceptance";
import { applyCommunityPointRewardOnPostWrite } from "@/lib/points/community-point-bridge";
import { summarizeCommunityPostContent } from "@/lib/philife/interleaved-body-markdown";
import {
  isProductWriteDeniedMemberAccount,
  MEMBER_ACCOUNT_WRITE_DENIED_MESSAGE,
} from "@/lib/auth/member-account-state";
import {
  publicRegionLabelLeaksPrivateDetail,
  resolveCommunityPublicRegionLabelForUser,
} from "@/lib/addresses/community-public-region-label";

import { resolveMemberPostImages } from "@/lib/philife/post-body-images";
import { resolveMemberRichBody } from "@/lib/community/member-rich-body";

import { ensureLguLocationId, legacyLocationRowToLguId, lguPublicName, parseLguLocationKey } from "@/lib/neighborhood/lgu-location.server";
import type { ResolveNeighborhoodLocationResult } from "@/lib/neighborhood/ensure-location";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 오류는 코드만(`error`=`code`) + 값은 `params` — 문구는 화면이 `COMMUNITY_POST_WRITE_ERROR_KEYS` 로 고른다
 * (재감사 2026-11-27 · `docs/i18n-ssot.md` §3-3). DB 원문·운영 안내는 로그로만.
 */
function postError(code: string, status: number, params?: Record<string, number | string>) {
  return NextResponse.json({ ok: false, error: code, code, ...(params ? { params } : {}) }, { status });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  if (isProductWriteDeniedMemberAccount(session.profile)) {
    return NextResponse.json({ ok: false, error: MEMBER_ACCOUNT_WRITE_DENIED_MESSAGE, code: "member_activity_restricted" }, { status: 403 });
  }
  // 커뮤니티 활동 제한 (§E-6)
  const restricted = await assertCommunityWriteAllowed(auth.userId, "post");
  if (restricted) return restricted;

  let body: {
    locationKey?: string;
    city?: string;
    district?: string;
    locationName?: string;
    category?: string;
    title?: string;
    content?: string;
    /** 회원 서식 본문(편집기) — 있으면 서버가 이것으로 `content` 를 만든다 */
    contentBlocks?: unknown;
    images?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const locationKey = String(body.locationKey ?? "").trim();
  const city = String(body.city ?? "").trim();
  const district = String(body.district ?? "").trim();
  const locationName = String(body.locationName ?? "").trim();
  const title = String(body.title ?? "").trim();
  const richBody = resolveMemberRichBody({
    content: body.content,
    contentBlocks: body.contentBlocks,
  });
  const content = richBody.content;
  const rawCat = String(body.category ?? "")
    .trim()
    .toLowerCase();
  if (!locationKey) {
    return postError("location_required", 400);
  }
  if (!rawCat) {
    return postError("category_required", 400);
  }
  /** 옛 모임(meetup) 글 작성은 폐지됨 — 모임은 신규 `moim` 도메인 (docs/design/moim/moim-design-v1-2026-11-12.md) */
  if (rawCat === "meetup") {
    return NextResponse.json({ ok: false, error: "category_unavailable", code: "meetup_removed" }, { status: 400 });
  }
  if (!title) {
    return postError("title_required", 400);
  }
  if (!content) {
    return postError("content_required", 400);
  }
  const accepted = evaluateCommunityPostAcceptance({ title, content });
  if (!accepted.ok) {
    return postError(communityAcceptanceErrorCode(accepted.code), 400);
  }
  /** images SSOT = 본문 이미지 순서 ∪ 본문 밖 첨부 — 외부·data URL 거부, 10장 초과 거부 (CM-P1-02·CM-P2-11) */
  const imagesRes = resolveMemberPostImages({ userId: auth.userId, content, candidates: body.images });
  if (!imagesRes.ok) {
    return NextResponse.json({ ok: false, error: imagesRes.message, code: imagesRes.error }, { status: 400 });
  }
  const images = imagesRes.images;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const termsGate = await requireSignupCompleteForUser(
    sb as import("@supabase/supabase-js").SupabaseClient,
    auth.userId
  );
  if (!termsGate.ok) return termsGate.response;

  const profileGate = await requireProfileFieldsForAction(
    sb as import("@supabase/supabase-js").SupabaseClient,
    auth.userId,
    "community_write"
  );
  if (!profileGate.ok) return profileGate.response;

  if (
    publicRegionLabelLeaksPrivateDetail(locationName) ||
    publicRegionLabelLeaksPrivateDetail(city) ||
    publicRegionLabelLeaksPrivateDetail(district)
  ) {
    return NextResponse.json({ ok: false, error: "region_label_invalid" }, { status: 400 });
  }

  const philifeSectionSlug = await getPhilifeNeighborhoodSectionSlugServer(sb);
  /**
   * 주소 SSOT: 글 동네 = 시/군 LGU 하나 (`lgu:<PSGC>:`). 글 지역 표시(region_label)도 서버가 같은 시/군 이름으로 정한다.
   * 4단계 (2026-11-09): 예전 앱 동네 키(`regionId:cityId:`)는 같은 시/군 LGU 로 바꿔 저장하고,
   * 공식 시/군으로 확정되지 않는 키는 거부한다(이전: 화면이 보낸 예전 키·지역 글자로 새 동네 행을 만들어 저장).
   * 동네는 화면의 커뮤니티 동네 필터(대표 주소 기본값 또는 직접 고른 시/군) — 대표 주소와 같을 필요는 없다(기존 설계).
   */
  const lguFromKey = parseLguLocationKey(locationKey);
  const lguIdForPost = lguFromKey
    ? (lguPublicName(lguFromKey) ? lguFromKey : null)
    : (() => {
        const [regionPart, cityPart] = locationKey.split(":").map((x) => x.trim());
        return legacyLocationRowToLguId(regionPart, cityPart);
      })();
  const [ops, loc, secRes] = await Promise.all([
    getCommunityFeedOps(),
    lguIdForPost
      ? ensureLguLocationId(sb, lguIdForPost).then(
          (locationId): ResolveNeighborhoodLocationResult =>
            locationId ? { locationId } : { locationId: null, failure: "persist_failed" },
        )
      : Promise.resolve<ResolveNeighborhoodLocationResult>({ locationId: null, failure: "invalid_key" }),
    sb.from("community_sections").select("id, slug").eq("slug", philifeSectionSlug).eq("is_active", true).maybeSingle(),
  ]);

  if (title.length > ops.max_title_length) {
    return postError("title_too_long", 400, { max: ops.max_title_length });
  }
  if (content.length > ops.max_content_length) {
    return postError("content_too_long", 400, { max: ops.max_content_length });
  }
  const filtered = await guardBannedWords({
    userId: auth.userId,
    surface: "community_post",
    texts: [title, content],
    operatorWords: ops.banned_words,
    acceptLanguage: req.headers.get("accept-language"),
  });
  if (!filtered.ok) {
    return NextResponse.json({ ok: false, error: filtered.error, code: filtered.code }, { status: filtered.status });
  }

  if (ops.max_posts_per_day > 0) {
    const n = await countUserCommunityPostsToday(auth.userId);
    if (n >= ops.max_posts_per_day) {
      return postError("daily_post_limit", 429, { max: ops.max_posts_per_day });
    }
  }

  if (!loc.locationId) {
    if (loc.failure === "invalid_key") {
      return postError("location_invalid", 400);
    }
    if (loc.failure === "schema_missing") {
      console.error("[neighborhood-posts] locations table missing (migration 20260326120000_neighborhood_community.sql)");
      return postError("location_persist_failed", 500);
    }
    if (loc.supabaseMessage) {
      console.error("[neighborhood-posts] location persist failed", loc.supabaseMessage.slice(0, 180));
    }
    return postError("location_persist_failed", 500);
  }
  const locationId = loc.locationId;

  const secRow = secRes.data as { id?: string; slug?: string } | null;
  if (secRes.error || !secRow?.id) {
    console.error("[neighborhood-posts] community_sections missing", philifeSectionSlug, secRes.error?.message ?? "");
    return postError("section_missing", 500);
  }

  const topicMeta = await resolveTopicForNeighborhoodCategory(sb, rawCat, { sectionId: secRow.id });
  if (!topicMeta) {
    console.error("[neighborhood-posts] topic unavailable — check admin feed topics for section", philifeSectionSlug, rawCat);
    return postError("topic_unavailable", 400);
  }

  /** Legacy enum column only — Topic identity is topic_id/topic_slug above */
  const categoryForDb = deriveCommunityPostCategoryBucket({
    topicOrCategoryRaw: rawCat,
  });

  const { data: inserted, error: insErr } = await sb
    .from("community_posts")
    .insert({
      user_id: auth.userId,
      section_id: secRow.id,
      section_slug: secRow.slug ?? philifeSectionSlug,
      topic_id: topicMeta.topicId,
      topic_slug: topicMeta.topicSlug,
      title,
      content,
      ...(richBody.contentBlocks ? { content_blocks: richBody.contentBlocks } : {}),
      summary: summarizeCommunityPostContent(content),
      region_label: (lguIdForPost ? lguPublicName(lguIdForPost) : null) ??
        (await resolveCommunityPublicRegionLabelForUser(sb, auth.userId)),
      location_id: locationId,
      category: categoryForDb,
      images,
      is_question: rawCat === "question" || topicMeta.topicSlug === "question",
      status: "active",
      is_sample_data: false,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    console.error("[neighborhood-posts] insert failed", insErr?.message ?? "no_row");
    return postError("post_save_failed", 500);
  }

  const postId = (inserted as { id: string }).id;
  if (images.length > 0 && images.some((url) => url.includes("supabase") || url.startsWith("http"))) {
    const rows = images.map((url, i) => ({
      post_id: postId,
      image_url: url.trim(),
      storage_path: "",
      sort_order: i,
    }));
    const { error: imgErr } = await sb.from("community_post_images").insert(rows);
    if (imgErr) {
      await sb.from("community_posts").delete().eq("id", postId);
      console.error("[neighborhood-posts] image rows insert failed", imgErr.message ?? "");
      return postError("image_save_failed", 500);
    }
  }

  await applyCommunityPointRewardOnPostWrite({
    userId: auth.userId,
    postId,
    title,
    content,
    isQuestion: rawCat === "question",
    topicSlug: topicMeta.topicSlug,
  });

  return NextResponse.json({ ok: true, id: postId });
}
