import { after, NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  countUserCommunityPostsToday,
  findBannedWord,
  getCommunityFeedOps,
} from "@/lib/community-feed/community-ops-settings";
import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";
import { resolveNeighborhoodLocationId } from "@/lib/neighborhood/ensure-location";
import { coalesceNeighborhoodLocationInput } from "@/lib/neighborhood/coalesce-location-input";
import { resolveTopicForNeighborhoodCategory } from "@/lib/neighborhood/resolve-topic-for-category";
import { resolveMeetupFeedTopicBySlug } from "@/lib/neighborhood/meetup-feed-topics";
import { hashMeetingPassword } from "@/lib/neighborhood/meeting-password";
import { isMissingDbColumnError } from "@/lib/community-feed/supabase-column-error";
import { normalizeNeighborhoodCategory } from "@/lib/neighborhood/categories";
import { createMeetingMessengerRoom } from "@/lib/community-messenger/meeting-chat-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MeetingEntryPolicy = "open" | "approve" | "password" | "invite_only";

function resolveMeetingEntryPolicy(meet: { entry_policy?: unknown; join_policy?: unknown }): MeetingEntryPolicy {
  const raw = typeof meet.entry_policy === "string" ? meet.entry_policy.trim().toLowerCase() : "";
  if (raw === "approve" || raw === "password" || raw === "invite_only" || raw === "open") return raw;
  return meet.join_policy === "approve" ? "approve" : "open";
}

function summarize(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: {
    locationKey?: string;
    city?: string;
    district?: string;
    locationName?: string;
    category?: string;
    /** 모임만: 어드민 피드 주제 slug (`allow_meetup` 주제) */
    meetTopicSlug?: string;
    title?: string;
    content?: string;
    images?: string[];
    meeting?: {
      location_text?: string;
      meeting_date?: string | null;
      tenure_type?: string;
      max_members?: number;
      description?: string;
      join_policy?: "open" | "approve";
      entry_policy?: MeetingEntryPolicy;
      meeting_password?: string;
      allow_waitlist?: boolean;
      allow_member_invite?: boolean;
      welcome_message?: string;
      allow_feed?: boolean;
      allow_album_upload?: boolean;
      cover_image_url?: string | null;
      region_text?: string;
      category_text?: string;
      join_questions?: string[];
      use_notices?: boolean;
      platform_approval_required?: boolean;
      open_chat_identity_mode?: "realname" | "nickname_optional";
      open_chat_owner_join_as?: "realname" | "nickname";
      open_chat_owner_nickname?: string;
      /** false면 메신저 오픈그룹 탐색·모임 찾기 목록에서 숨김(초대 링크·직접 URL로만 입장) */
      messenger_discoverable?: boolean;
    };
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
  const content = String(body.content ?? "").trim();
  const rawCat = String(body.category ?? "")
    .trim()
    .toLowerCase();
  const images = Array.isArray(body.images)
    ? body.images.filter((u): u is string => typeof u === "string" && u.trim().length > 0).slice(0, 10)
    : [];

  if (!locationKey) {
    return NextResponse.json({ ok: false, error: "동네를 선택해 주세요." }, { status: 400 });
  }
  if (!rawCat) {
    return NextResponse.json({ ok: false, error: "카테고리를 선택해 주세요." }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ ok: false, error: "제목을 입력해 주세요." }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ ok: false, error: "내용을 입력해 주세요." }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const isMeetup = rawCat === "meetup";
  const locInput = coalesceNeighborhoodLocationInput(locationKey, {
    city,
    district,
    name: locationName,
  });

  const philifeSectionSlug = await getPhilifeNeighborhoodSectionSlugServer(sb);
  const [ops, loc, secRes] = await Promise.all([
    getCommunityFeedOps(),
    resolveNeighborhoodLocationId(sb, locationKey, locInput),
    sb.from("community_sections").select("id, slug").eq("slug", philifeSectionSlug).eq("is_active", true).maybeSingle(),
  ]);

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

  if (ops.max_posts_per_day > 0) {
    const n = await countUserCommunityPostsToday(auth.userId);
    if (n >= ops.max_posts_per_day) {
      return NextResponse.json(
        { ok: false, error: `하루에 올릴 수 있는 글은 ${ops.max_posts_per_day}개까지입니다.` },
        { status: 429 }
      );
    }
  }

  if (!loc.locationId) {
    if (loc.failure === "invalid_key") {
      return NextResponse.json({ ok: false, error: "동네 설정이 올바르지 않습니다. 상단에서 동네를 다시 선택해 주세요." }, { status: 400 });
    }
    if (loc.failure === "schema_missing") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "동네 DB(locations)가 없습니다. Supabase에 마이그레이션 20260326120000_neighborhood_community.sql 을 적용했는지 확인하세요.",
        },
        { status: 500 }
      );
    }
    const hint = loc.supabaseMessage ? ` (${loc.supabaseMessage.slice(0, 180)})` : "";
    return NextResponse.json(
      { ok: false, error: `동네 정보를 저장하지 못했습니다.${hint}` },
      { status: 500 }
    );
  }
  const locationId = loc.locationId;

  const secRow = secRes.data as { id?: string; slug?: string } | null;
  if (secRes.error || !secRow?.id) {
    return NextResponse.json(
      { ok: false, error: `community_sections(${philifeSectionSlug}) 없음` },
      { status: 500 }
    );
  }

  let topicMeta: { topicId: string; topicSlug: string } | null = null;
  if (isMeetup) {
    const rawMeetTopic = String(body.meetTopicSlug ?? "meetup").trim() || "meetup";
    const resolved = await resolveMeetupFeedTopicBySlug(sb, rawMeetTopic, { sectionId: secRow.id });
    if (!resolved) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "모임 피드 주제를 찾을 수 없습니다. 어드민 → 커뮤니티 → 피드 주제에서 '모임 허용' 주제를 추가했는지 확인하세요.",
        },
        { status: 400 }
      );
    }
    topicMeta = { topicId: resolved.topicId, topicSlug: resolved.topicSlug };
  } else {
    topicMeta = await resolveTopicForNeighborhoodCategory(sb, rawCat, { sectionId: secRow.id });
    if (!topicMeta) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `선택한 주제를 사용할 수 없습니다. 어드민 → 피드 주제에서 동네 피드 섹션(${philifeSectionSlug}) 주제를 확인해 주세요.`,
        },
        { status: 400 }
      );
    }
  }

  const meet = body.meeting ?? {};
  const tenureRaw = typeof meet.tenure_type === "string" ? meet.tenure_type.trim().toLowerCase() : "";
  const tenureType: "short" | "long" = tenureRaw === "long" ? "long" : "short";
  const meetupPlace =
    isMeetup && tenureType === "long"
      ? ""
      : typeof meet.location_text === "string"
        ? meet.location_text.trim()
        : "";
  let meetupDate: string | null = null;
  if (isMeetup && tenureType === "short") {
    if (typeof meet.meeting_date === "string" && meet.meeting_date.trim()) {
      const d = Date.parse(meet.meeting_date);
      if (!Number.isNaN(d)) meetupDate = new Date(d).toISOString();
    }
    if (!meetupDate) {
      return NextResponse.json({ ok: false, error: "단기 모임은 일시를 선택해 주세요." }, { status: 400 });
    }
  }
  /** `meetings.meeting_date`는 NOT NULL — 장기 모임은 실제 일정이 없어도 행 삽입용 타임스탬프만 넣음(표시는 tenure로 숨김) */
  const meetingRowDateIso: string | null = isMeetup
    ? tenureType === "long"
      ? new Date().toISOString()
      : meetupDate!
    : null;
  const entryPolicy = resolveMeetingEntryPolicy(meet);
  const joinPolicy = entryPolicy === "approve" || entryPolicy === "invite_only" ? "approve" : "open";
  const maxMem =
    typeof meet.max_members === "number" && Number.isFinite(meet.max_members)
      ? Math.min(500, Math.max(2, Math.floor(meet.max_members)))
      : 30;

  let passwordHash: string | null = null;
  let meetingPasswordPlain: string | null = null;
  if (entryPolicy === "password") {
    const pwd = typeof meet.meeting_password === "string" ? meet.meeting_password.trim() : "";
    if (pwd.length < 4 || pwd.length > 128) {
      return NextResponse.json(
        { ok: false, error: "모임 비밀번호는 4~128자로 입력해 주세요." },
        { status: 400 }
      );
    }
    meetingPasswordPlain = pwd;
    passwordHash = hashMeetingPassword(pwd);
  }

  const requiresApproval = entryPolicy === "approve" || entryPolicy === "invite_only";
  const allowWaitlist = meet.allow_waitlist === true;
  const allowMemberInvite = meet.allow_member_invite === true;
  const openChatIdentityMode =
    meet.open_chat_identity_mode === "realname" || meet.open_chat_identity_mode === "nickname_optional"
      ? meet.open_chat_identity_mode
      : undefined;
  const openChatOwnerJoinAs =
    meet.open_chat_owner_join_as === "realname" || meet.open_chat_owner_join_as === "nickname"
      ? meet.open_chat_owner_join_as
      : undefined;
  const openChatOwnerNickname =
    typeof meet.open_chat_owner_nickname === "string" ? meet.open_chat_owner_nickname.trim() : "";
  const coverImageUrl = typeof meet.cover_image_url === "string" ? meet.cover_image_url.trim() : "";
  const regionText = typeof meet.region_text === "string" ? meet.region_text.trim() : "";
  const categoryText = typeof meet.category_text === "string" ? meet.category_text.trim() : "";
  const joinQuestions = Array.isArray(meet.join_questions)
    ? meet.join_questions
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];
  const useNotices = meet.use_notices !== false;
  /** 기본 비승인 — 명시 true 일 때만 플랫폼 승인 대기 */
  const platformApprovalRequired = meet.platform_approval_required === true;
  const openChatJoinType =
    entryPolicy === "password"
      ? "password"
      : entryPolicy === "approve"
        ? "approval"
        : entryPolicy === "invite_only"
          ? "password_approval"
          : "free";

  /** DB `community_posts_category_check` — 글쓰기 주제 slug(어드민 임의 값)와 별도로 고정 enum 만 허용 */
  const categoryForDb = isMeetup
    ? "meetup"
    : normalizeNeighborhoodCategory(rawCat) ?? "etc";

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
      summary: summarize(content),
      region_label: locationName || city || "동네",
      location_id: locationId,
      category: categoryForDb,
      images,
      is_question: rawCat === "question",
      is_meetup: isMeetup,
      meetup_place: isMeetup ? meetupPlace || null : null,
      meetup_date: isMeetup && tenureType === "short" ? meetupDate : null,
      status: "active",
      is_sample_data: false,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    return NextResponse.json({ ok: false, error: insErr?.message ?? "등록 실패" }, { status: 500 });
  }

  const postId = (inserted as { id: string }).id;
  let meetingId: string | null = null;
  let messengerRoomId: string | null = null;

  if (isMeetup) {
    const meetingRowBase = {
      post_id: postId,
      title,
      description: typeof meet.description === "string" ? meet.description.trim() : "",
      location_text: meetupPlace,
      meeting_date: meetingRowDateIso,
      max_members: maxMem,
      join_policy: joinPolicy,
      entry_policy: entryPolicy,
      password_hash: passwordHash,
      requires_approval: requiresApproval,
      allow_waitlist: allowWaitlist,
      allow_member_invite: allowMemberInvite,
      welcome_message: typeof meet.welcome_message === "string" ? meet.welcome_message.trim() || null : null,
      allow_feed: meet.allow_feed !== false,
      allow_album_upload: meet.allow_album_upload !== false,
      cover_image_url: coverImageUrl || null,
      region_text: regionText || null,
      category_text: categoryText || null,
      platform_approval_required: platformApprovalRequired,
      platform_approval_status: platformApprovalRequired ? "pending_approval" : "approved",
      status: "open",
      host_user_id: auth.userId,
      created_by: auth.userId,
      is_sample_data: false,
      tenure_type: tenureType,
    };
    let { data: meetRow, error: mErr } = await sb.from("meetings").insert(meetingRowBase).select("id").single();
    if (mErr && isMissingDbColumnError(mErr, "tenure_type")) {
      const { tenure_type: _t, ...withoutTenure } = meetingRowBase;
      const retry = await sb.from("meetings").insert(withoutTenure).select("id").single();
      meetRow = retry.data as typeof meetRow;
      mErr = retry.error;
    }
    if (mErr || !meetRow) {
      await sb.from("community_posts").delete().eq("id", postId);
      return NextResponse.json({ ok: false, error: mErr?.message ?? "모임 생성 실패" }, { status: 500 });
    }
    meetingId = String((meetRow as { id: string }).id);

    await sb.from("meeting_members").insert({
      meeting_id: meetingId,
      user_id: auth.userId,
      status: "joined",
      role: "host",
    });

    const messengerDiscoverable =
      !platformApprovalRequired &&
      entryPolicy !== "invite_only" &&
      meet.messenger_discoverable !== false;

    const meetingChat = await createMeetingMessengerRoom({
      ownerUserId: auth.userId,
      title,
      summary: typeof meet.description === "string" ? meet.description.trim() : "",
      coverImageUrl,
      discoverable: messengerDiscoverable,
      joinPolicy: entryPolicy === "password" ? "password" : "free",
      password: meetingPasswordPlain,
    });
    if (!meetingChat.ok || !meetingChat.roomId) {
      await sb.from("meetings").delete().eq("id", meetingId);
      await sb.from("community_posts").delete().eq("id", postId);
      return NextResponse.json({ ok: false, error: meetingChat.error ?? "meeting_chat_create_failed" }, { status: 500 });
    }

    const meetingPatch: Record<string, unknown> = {
      community_messenger_room_id: meetingChat.roomId,
    };
    const { error: meetingPatchError } = await sb.from("meetings").update(meetingPatch).eq("id", meetingId);
    if (meetingPatchError) {
      await sb.from("community_messenger_rooms").delete().eq("id", meetingChat.roomId);
      await sb.from("meetings").delete().eq("id", meetingId);
      await sb.from("community_posts").delete().eq("id", postId);
      return NextResponse.json(
        { ok: false, error: meetingPatchError.message ?? "meeting_chat_link_failed" },
        { status: 500 }
      );
    }

    if (joinQuestions.length > 0) {
      await sb.from("meeting_join_questions").insert(
        joinQuestions.map((question, index) => ({
          meeting_id: meetingId,
          question_order: index + 1,
          question_text: question,
          created_by: auth.userId,
        }))
      );
    }

    messengerRoomId = meetingChat.roomId;
    void after;
  }

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
      if (meetingId) await sb.from("meetings").delete().eq("id", meetingId);
      return NextResponse.json({ ok: false, error: imgErr.message ?? "이미지 저장 실패" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id: postId, meetingId, messengerRoomId });
}
