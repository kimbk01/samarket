import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  listSupportCasesForRequester,
  sumSupportRequesterUnread,
} from "@/lib/support/support-case-service";
import { toSupportRequesterCaseView } from "@/lib/support/support-requester-view";
import { parseSupportCaseHistoryTab } from "@/lib/support/support-status-label";
import { parseMypageListCursor, parseMypageListLimit, sliceMypageKeysetPage } from "@/lib/mypage/mypage-list-cursor";
import { sortActiveSupportTickets } from "@/lib/support/support-ticket-form";
import { supportErrorHttpStatus } from "@/lib/support/support-display-labels";

/** 쓰기 창 진행 중 목록이 정렬 전에 읽는 최근 문의 수 상한 (재감사 4) */
const COMPOSE_ACTIVE_SCAN_MAX = 100;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/support/cases — requester's own support cases (history).
 *
 * 최종 설계 S63 · API A14: `cursor` · `limit` 옵트인.
 * 접수형 문의(Owner 2026-11-10): 요청자 화면에는 **진행 중 문의만** — 종료(RESOLVED·ARCHIVED)는 사라진다.
 * `status` 는 호환용으로 받기만 하고(active|done 외 400) 항상 진행 중만 돌려준다.
 * 페이지 모드 응답 `{ ok, cases, nextCursor, counts? }` — 첫 페이지(커서 없음)에만 `counts.active`.
 * 고객 문의 최종 감사 L10: `?summary=unread` = FAB 숫자 전용 `{ ok, unread }` (안 읽은 답변 수 열 1개만 읽는다 · 같은 범위).
 * 최종 감사 L3: 문의 행은 고객용 필드만(`toSupportRequesterCaseView`).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const sp = req.nextUrl.searchParams;
  const audienceRaw = String(sp.get("audience") ?? "")
    .trim()
    .toUpperCase();
  const audience: "MEMBER" | "OWNER" | undefined =
    audienceRaw === "MEMBER" || audienceRaw === "OWNER" ? audienceRaw : undefined;
  const storeId = String(sp.get("storeId") ?? "").trim() || null;

  if (sp.get("summary") === "unread") {
    const sum = await sumSupportRequesterUnread(sb, {
      userId: auth.userId,
      audience,
      storeId: audience === "OWNER" ? storeId : null,
    });
    if (!sum.ok) {
      const status = sum.error === "missing_table" ? 503 : 500;
      return NextResponse.json({ ok: false, error: sum.error }, { status });
    }
    return NextResponse.json({ ok: true, unread: sum.unread });
  }

  const statusRaw = sp.get("status");
  const status = parseSupportCaseHistoryTab(statusRaw);
  if (statusRaw != null && statusRaw.trim() !== "" && !status) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }
  const cursorRaw = sp.get("cursor");
  const cursor = parseMypageListCursor(cursorRaw);
  if (cursorRaw != null && cursorRaw.trim() !== "" && !cursor) {
    return NextResponse.json({ ok: false, error: "invalid_cursor" }, { status: 400 });
  }
  const limit = parseMypageListLimit(sp.get("limit"));
  const scope = { userId: auth.userId, audience, storeId: audience === "OWNER" ? storeId : null };

  // 재감사 4 (2026-11-29): 쓰기 창 「진행 중인 문의」 = `limit` 만 있고 `status`·`cursor` 없음(계약 유지 · 고객 창은 limit=5).
  //   개수는 세지 않는다. 진행 중 문의를 작은 고정 상한(최근 순 100)까지 읽어 화면과 **같은 정렬**(sortActiveSupportTickets:
  //   답변 완료·안 읽은 답 먼저, 그다음 최근)으로 앞 limit 개만 — 6번째 이후 답변 완료 문의가 빠지지 않게.
  if (limit != null && !status && !cursor) {
    const all = await listSupportCasesForRequester(sb, { ...scope, status: "active", limit: COMPOSE_ACTIVE_SCAN_MAX });
    if (!all.ok) {
      return NextResponse.json({ ok: false, error: all.error }, { status: supportErrorHttpStatus(all.error) });
    }
    const top = sortActiveSupportTickets(all.cases).slice(0, limit);
    return NextResponse.json({ ok: true, cases: top.map(toSupportRequesterCaseView) });
  }

  const paged = Boolean(status || cursor || limit != null);
  // 요청 예산(2026-11-29 실측): 「내 문의」 첫 페이지 = 진행 중 문의를 **한 번** 읽어 개수와 첫 페이지를 같이 만든다
  //   (전에는 목록 1 + 개수 1 + 사장님이면 매장 소유 확인이 목록·개수에서 따로 = 4~5 · 예산 3 초과). 진행 중 문의는 사람당 몇 건이라
  //   상한 100 이면 충분(넘으면 개수는 100, 다음 페이지는 커서로 그대로).
  if (paged && !cursor) {
    const all = await listSupportCasesForRequester(sb, { ...scope, status: "active", limit: COMPOSE_ACTIVE_SCAN_MAX });
    if (!all.ok) {
      if (all.error === "missing_table") return NextResponse.json({ ok: false, error: "missing_table" }, { status: 503 });
      return NextResponse.json({ ok: false, error: "cases_fetch_failed" }, { status: 500 });
    }
    const sorted = [...all.cases].sort((a, b) => {
      const ta = String(a.last_message_at ?? "");
      const tb = String(b.last_message_at ?? "");
      if (ta !== tb) return ta < tb ? 1 : -1;
      return String(a.id) < String(b.id) ? 1 : -1;
    });
    const page = sliceMypageKeysetPage(
      sorted,
      Math.min(Math.max(limit ?? 50, 1), 100),
      (r) => String(r.last_message_at ?? ""),
      (r) => String(r.id ?? "")
    );
    return NextResponse.json({
      ok: true,
      cases: page.items.map(toSupportRequesterCaseView),
      nextCursor: page.next_cursor,
      counts: { active: all.cases.length },
    });
  }
  // 여기부터는 다음 페이지(커서) · 옛 비페이지 목록 — 개수는 첫 페이지에서만 준다
  const res = await listSupportCasesForRequester(sb, {
    ...scope,
    status: "active",
    cursor,
    paged,
    limit: limit ?? undefined,
  });
  if (!res.ok) {
    // API 공통 계약 — DB 원문 비노출, 코드만
    if (res.error === "missing_table") {
      return NextResponse.json({ ok: false, error: "missing_table" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "cases_fetch_failed" }, { status: 500 });
  }
  if (!paged) {
    return NextResponse.json({ ok: true, cases: res.cases.map(toSupportRequesterCaseView) });
  }
  return NextResponse.json({
    ok: true,
    cases: res.cases.map(toSupportRequesterCaseView),
    nextCursor: res.nextCursor,
  });
}
