import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  countUserCommunityPostsToday,
  findBannedWord,
  getCommunityFeedOps,
} from "@/lib/community-feed/community-ops-settings";
import { normalizeSectionSlug } from "@/lib/community-feed/constants";
import { resolveTopicMeta } from "@/lib/community-feed/queries";
import { normalizeNeighborhoodCategory } from "@/lib/neighborhood/categories";

function summarize(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: {
    sectionSlug?: string;
    topicSlug?: string;
    title?: string;
    content?: string;
    is_question?: boolean;
    meetup_place?: string | null;
    meetup_date?: string | null;
    region_label?: string;
    imageUrls?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const sectionSlug = normalizeSectionSlug(body.sectionSlug);
  const topicSlug = body.topicSlug?.trim().toLowerCase();
  const title = body.title?.trim();
  const content = (body.content ?? "").trim();
  const region_label = (body.region_label ?? "").trim() || "Malate";

  if (!topicSlug) {
    return NextResponse.json({ ok: false, error: "주제를 선택하세요." }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ ok: false, error: "제목을 입력하세요." }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ ok: false, error: "내용을 입력하세요." }, { status: 400 });
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
    return NextResponse.json({ ok: false, error: "금칙어가 포함되어 있습니다." }, { status: 400 });
  }

  const meta = await resolveTopicMeta(sectionSlug, topicSlug);
  if (!meta || meta.is_feed_sort) {
    return NextResponse.json({ ok: false, error: "유효한 주제가 아닙니다." }, { status: 400 });
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
    return NextResponse.json({ ok: false, error: "서버 설정 오류" }, { status: 500 });
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
    return NextResponse.json({ ok: false, error: "섹션을 찾을 수 없습니다." }, { status: 400 });
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
    return NextResponse.json(
      { ok: false, error: insErr?.message ?? "등록에 실패했습니다." },
      { status: 500 }
    );
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
      return NextResponse.json({ ok: false, error: imgErr.message ?? "이미지 저장 실패" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id: newId });
}
