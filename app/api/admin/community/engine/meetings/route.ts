import { loadAdminMemberIdentityMap } from "@/lib/admin-community/member-identity";
import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  MEETING_ADMIN_TABS,
  MEETING_STATUSES,
  isCommunityListUuid,
  parseCommunityListPage,
  parseCommunityListSearch,
  pickAllowed,
} from "@/lib/admin/community-admin/community-list-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — 모임 관리 목록
 * query: q(모임 이름·개설자 닉네임 · UUID 면 모임/글/개설자 id 정확 일치) · status(open|closed|ended|cancelled)
 *   · tab(pending|open|ended|rejected) · meetingId · limit(기본 50, 최대 200) · offset
 * → { ok, meetings, total, limit, offset }
 * R7: 목록 필터(상태·탭·검색 — 개설자 닉네임 포함)·정렬(created_at DESC, id DESC)·페이지·total 은 DB RPC
 *     `admin_community_meetings_page` 한 번 — 예전 닉네임 후보 200명 상한 없음. meetingId 는 단건 조회 그대로.
 */
const MEETINGS_PAGE_RPC = "admin_community_meetings_page";
const MEETING_ROW_SELECT =
  "id, post_id, title, host_user_id, status, max_members, meeting_date, chat_room_id, community_messenger_room_id, join_policy, entry_policy, password_hash, created_at, is_sample_data, platform_approval_required, platform_approval_status, region_text, category_text";
export async function GET(req: NextRequest) {
  const admin = await requireCommunityAdmin("content");
  if (!admin.ok) return admin.response;

  const sp = req.nextUrl.searchParams;
  const status = pickAllowed(sp.get("status"), MEETING_STATUSES);
  const tab = pickAllowed(sp.get("tab"), MEETING_ADMIN_TABS);
  const meetingIdRaw = sp.get("meetingId")?.trim() || "";
  const meetingId = isCommunityListUuid(meetingIdRaw) ? meetingIdRaw : "";
  const search = parseCommunityListSearch(sp.get("q"));
  const { limit, offset } = parseCommunityListPage(sp);

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  if (meetingIdRaw && !meetingId) {
    return NextResponse.json({ ok: true, meetings: [], total: 0, limit, offset });
  }

  let data: unknown;
  let count: number | null;
  if (meetingId) {
    const one = await sb
      .from("meetings")
      .select(MEETING_ROW_SELECT, { count: "exact" })
      .eq("id", meetingId)
      .range(offset, offset + limit - 1);
    if (one.error) {
      return NextResponse.json({ ok: false, error: one.error.message }, { status: 500 });
    }
    data = one.data;
    count = one.count;
  } else {
    // 상태·탭·검색(모임 이름·지역·개설자 닉네임 · UUID 면 모임/글/개설자 id) — DB 한 번
    const { data: page, error: pageErr } = await sb.rpc(MEETINGS_PAGE_RPC, {
      p_status: status || null,
      p_tab: tab || null,
      p_q_pattern: search.pattern,
      p_q_uuid: search.uuid,
      p_limit: limit,
      p_offset: offset,
    });
    if (pageErr) {
      return NextResponse.json({ ok: false, error: pageErr.message }, { status: 500 });
    }
    const res = (page ?? {}) as { total?: number; ids?: string[] };
    const ids = Array.isArray(res.ids) ? res.ids.map(String) : [];
    count = Number(res.total ?? 0);
    if (ids.length) {
      const full = await sb.from("meetings").select(MEETING_ROW_SELECT).in("id", ids);
      if (full.error) {
        return NextResponse.json({ ok: false, error: full.error.message }, { status: 500 });
      }
      const byId = new Map(((full.data ?? []) as Record<string, unknown>[]).map((r) => [String(r.id ?? ""), r]));
      data = ids.map((id) => byId.get(id)).filter(Boolean);
    } else {
      data = [];
    }
  }

  const baseRows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const postIds = [...new Set(baseRows.map((row) => String(row.post_id ?? "").trim()).filter(Boolean))];
  const meetingIds = [...new Set(baseRows.map((row) => String(row.id ?? "").trim()).filter(Boolean))];

  const postMetaMap = new Map<string, { status: string; is_hidden: boolean; report_count: number }>();
  if (postIds.length > 0) {
    const { data: posts } = await sb
      .from("community_posts")
      .select("id, status, is_hidden, report_count")
      .in("id", postIds);
    if (Array.isArray(posts)) {
      for (const post of posts as Array<{ id?: string; status?: string | null; is_hidden?: boolean | null; report_count?: number | null }>) {
        const postId = String(post.id ?? "").trim();
        if (!postId) continue;
        postMetaMap.set(postId, {
          status: String(post.status ?? "active"),
          is_hidden: post.is_hidden === true,
          report_count: Number(post.report_count ?? 0) || 0,
        });
      }
    }
  }

  const reportCountMap = new Map<string, number>();
  if (meetingIds.length > 0) {
    const { data: reports } = await sb.from("meeting_reports").select("meeting_id").in("meeting_id", meetingIds);
    if (Array.isArray(reports)) {
      for (const report of reports as Array<{ meeting_id?: string | null }>) {
        const meetingId = String(report.meeting_id ?? "").trim();
        if (!meetingId) continue;
        reportCountMap.set(meetingId, (reportCountMap.get(meetingId) ?? 0) + 1);
      }
    }
  }

  // 개설자 표시 (C-? 모임 화면 개설자 열)
  const hostIds = [...new Set(baseRows.map((row) => String((row as { host_user_id?: string }).host_user_id ?? "").trim()).filter(Boolean))];
  const hostMap = await loadAdminMemberIdentityMap(sb, hostIds).catch(() => new Map());

  const rows = baseRows.map((r) => {
    const row = { ...(r as Record<string, unknown>) };
    const ph = row.password_hash;
    const hasPassword = typeof ph === "string" && ph.length > 0;
    const postMeta = postMetaMap.get(String(row.post_id ?? "").trim());
    delete row.password_hash;
    return {
      ...row,
      has_password: hasPassword,
      post_status: postMeta?.status ?? "active",
      post_hidden: postMeta?.is_hidden ?? false,
      post_report_count: postMeta?.report_count ?? 0,
      meeting_report_count: reportCountMap.get(String(row.id ?? "").trim()) ?? 0,
      host_nickname: hostMap.get(String(row.host_user_id ?? "").trim())?.nickname ?? null,
      host_username: hostMap.get(String(row.host_user_id ?? "").trim())?.username ?? null,
    };
  });

  return NextResponse.json({
    ok: true,
    meetings: rows,
    total: typeof count === "number" ? count : null,
    limit,
    offset,
  });
}
