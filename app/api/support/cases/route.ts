import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  countSupportCasesForRequester,
  listSupportCasesForRequester,
} from "@/lib/support/support-case-service";
import { parseSupportCaseHistoryTab } from "@/lib/support/support-status-label";
import { parseMypageListCursor, parseMypageListLimit } from "@/lib/mypage/mypage-list-cursor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/support/cases — requester's own support cases (history).
 *
 * 최종 설계 S63 · API A14: `cursor` · `limit` 옵트인.
 * 접수형 문의(Owner 2026-11-10): 요청자 화면에는 **진행 중 문의만** — 종료(RESOLVED·ARCHIVED)는 사라진다.
 * `status` 는 호환용으로 받기만 하고(active|done 외 400) 항상 진행 중만 돌려준다.
 * 페이지 모드 응답 `{ ok, cases, nextCursor, counts? }` — 첫 페이지(커서 없음)에만 `counts.active`.
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
  const paged = Boolean(status || cursor || limit != null);

  const scope = { userId: auth.userId, audience, storeId: audience === "OWNER" ? storeId : null };
  const [res, activeCount] = await Promise.all([
    listSupportCasesForRequester(sb, {
      ...scope,
      status: "active",
      cursor,
      paged,
      limit: limit ?? undefined,
    }),
    paged && !cursor ? countSupportCasesForRequester(sb, { ...scope, status: "active" }) : Promise.resolve(null),
  ]);
  if (!res.ok) {
    // API 공통 계약 — DB 원문 비노출, 코드만
    if (res.error === "missing_table") {
      return NextResponse.json({ ok: false, error: "missing_table" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "cases_fetch_failed" }, { status: 500 });
  }
  if (!paged) {
    return NextResponse.json({ ok: true, cases: res.cases });
  }
  return NextResponse.json({
    ok: true,
    cases: res.cases,
    nextCursor: res.nextCursor,
    ...(activeCount && activeCount.ok ? { counts: { active: activeCount.count } } : {}),
  });
}
