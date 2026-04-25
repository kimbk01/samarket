import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  countUserCommunityPostsToday,
  findBannedWord,
  getCommunityFeedOps,
} from "@/lib/community-feed/community-ops-settings";
import { normalizeSectionSlug } from "@/lib/community-feed/constants";
import { resolveTopicMeta } from "@/lib/community-feed/queries";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
  safeErrorMessage,
} from "@/lib/http/api-route";
import { normalizeNeighborhoodCategory } from "@/lib/neighborhood/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function summarize(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;

  const createRateLimit = await enforceRateLimit({
    key: `community-post:create:${getRateLimitKey(req, auth.userId)}`,
    limit: 8,
    windowMs: 60_000,
    message: "게시글 작성 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_post_create_rate_limited",
  });
  if (!createRateLimit.ok) return createRateLimit.response;

  const parsed = await parseJsonBody<{
    sectionSlug?: string;
    topicSlug?: string;
    title?: string;
    content?: string;
    is_question?: boolean;
    meetup_place?: string | null;
    meetup_date?: string | null;
    region_label?: string;
    imageUrls?: string[];
  }>(req, "JSON 본문이 필요합니다.");
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const sectionSlug = normalizeSectionSlug(body.sectionSlug);
  const topicSlug = body.topicSlug?.trim().toLowerCase();
  const title = body.title?.trim();
  const content = (body.content ?? "").trim();
  const region_label = (body.region_label ?? "").trim() || "Malate";

  if (!topicSlug) {
    return jsonError("주제를 선택하세요.", 400);
  }
  if (!title) {
    return jsonError("제목을 입력하세요.", 400);
  }
  if (!content) {
    return jsonError("내용을 입력하세요.", 400);
  }

  const ops = await getCommunityFeedOps();
  if (title.length > ops.max_title_length) {
    return NextResponse.json(
      { ok: false, error: `제목은 ${ops.max_title_length}자 이하로 입력하세요.` },
      { status: 400 }
    );
  }
  if (content.length > ops.max_content_length) {
    return NextResponse.json(
      { ok: false, error: `본문은 ${ops.max_content_length}자 이하로 입력하세요.` },
      { status: 400 }
    );
  }
  const banned = findBannedWord(`${title}\n${content}`, ops.banned_words);
  if (banned) {
    return jsonError("금칙어가 포함되어 있습니다.", 400);
  }

  const meta = await resolveTopicMeta(sectionSlug, topicSlug);
  if (!meta || meta.is_feed_sort) {
    return jsonError("유효한 주제가 아닙니다.", 400);
  }

  const is_question = meta.allow_question ? !!body.is_question : false;
  const meetupPlaceRaw = typeof body.meetup_place === "string" ? body.meetup_place.trim().slice(0, 200) : "";
  const meetupDateRaw = typeof body.meetup_date === "string" ? body.meetup_date.trim() : "";
  let is_meetup = false;
  let meetup_place: string | null = null;
  let meetup_date: string | null = null;
  if (meta.allow_meetup) {
    if (meetupPlaceRaw) {
      is_meetup = true;
      meetup_place = meetupPlaceRaw;
    }
    if (meetupDateRaw) {
      const d = Date.parse(meetupDateRaw);
      if (!Number.isNaN(d)) {
        is_meetup = true;
        meetup_date = new Date(d).toISOString();
      }
    }
  }

  const categoryForDb = is_meetup ? "meetup" : normalizeNeighborhoodCategory(topicSlug) ?? "etc";

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return jsonError("서버 설정 오류", 500);
  }

  if (ops.max_posts_per_day > 0) {
    const n = await countUserCommunityPostsToday(auth.userId);
    if (n >= ops.max_posts_per_day) {
      return NextResponse.json(
        { ok: false, error: `하루에 올릴 수 있는 글은 ${ops.max_posts_per_day}개까지입니다.` },
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
    return jsonError("섹션을 찾을 수 없습니다.", 400);
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
      summary: summarize(content),
      region_label,
      category: categoryForDb,
      images: [],
      is_question,
      is_meetup,
      meetup_place,
      meetup_date,
      status: "active",
      is_sample_data: false,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    return jsonError(safeErrorMessage(insErr, "등록에 실패했습니다."), 500, {
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
      return jsonError(safeErrorMessage(imgErr, "이미지 저장에 실패했습니다."), 500, {
        code: "community_post_image_insert_failed",
      });
    }
  }

  return jsonOk({ id: newId });
}
