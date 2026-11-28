import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  findSupportMessageReplay,
  getSupportCaseForUser,
  listSupportMessages,
  parseSupportRequestId,
  postRequesterSupportMessage,
  requesterCloseSupportCase,
  requesterSeenSupportCase,
} from "@/lib/support/support-case-service";
import { isSupportTicketClosedStatus } from "@/lib/support/support-ticket-form";
import { checkSupportCustomerPostRate } from "@/lib/support/support-customer-rate-limit";
import { normalizeShownMessageIds, requesterSupportCaseNeedsSeen } from "@/lib/support/support-notification-ledger";
import { supportErrorHttpStatus } from "@/lib/support/support-display-labels";
import {
  toSupportRequesterCaseView,
  toSupportRequesterMessageView,
} from "@/lib/support/support-requester-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (error: string) => NextResponse.json({ ok: false, error }, { status: supportErrorHttpStatus(error) });

/**
 * GET — 문의 상세 (**읽기만** · 전체 수정 계약 §3). 읽음 처리는 화면이 실제로 보인 뒤 `POST { action: "seen" }`.
 * 접수형 문의(Owner 2026-11-10): 종료된 문의는 내용을 돌려주지 않는다 — 단, 안 읽은 답변이 있으면 내용을 돌려준다
 * (화면이 그것을 보여 주고 `seen` 을 보내면 숫자가 0 이 되어 그 뒤로는 사라진다 · SSOT §3-1 F3).
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ caseId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { caseId } = await context.params;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return fail("supabase_unconfigured");
  const gate = await getSupportCaseForUser(sb, { userId: auth.userId, caseId });
  if (!gate.ok) return fail(gate.error);
  const closed = isSupportTicketClosedStatus(gate.case.status);
  const unreadCount = Number(gate.case.requester_unread_count ?? 0);
  // 요청 예산: 화면이 읽음(seen)을 보낼 필요가 있는지 — 없으면 화면은 seen 요청을 보내지 않는다
  const needsSeenP = requesterSupportCaseNeedsSeen(sb, { userId: auth.userId, caseId, unreadCount });
  if (closed && !(unreadCount > 0)) {
    return NextResponse.json({
      ok: true,
      case: toSupportRequesterCaseView(gate.case),
      messages: [],
      closed: true,
      needsSeen: await needsSeenP,
    });
  }
  const [messages, needsSeen] = await Promise.all([listSupportMessages(sb, { caseId }), needsSeenP]);
  if (!messages.ok) return fail(messages.error);
  return NextResponse.json({
    ok: true,
    case: toSupportRequesterCaseView(gate.case),
    messages: messages.messages.map(toSupportRequesterMessageView),
    ...(closed ? { closed: true } : {}),
    needsSeen,
  });
}

/**
 * POST
 *  - `{ action: "seen", shownMessageIds, seenLastMessageAt }` — 화면에 보인 글만 읽음(계약 §3)
 *  - `{ action: "close", seenLastMessageAt }` — 「확인했어요」
 *  - `{ body, requestId }` — 추가 문의(계약 §1: 같은 requestId 재전송 = 처음 결과 `replayed: true` · 속도 제한보다 먼저 확인)
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ caseId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { caseId } = await context.params;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return fail("supabase_unconfigured");

  const body = (await req.json().catch(() => ({}))) as {
    body?: string;
    action?: string;
    seenLastMessageAt?: unknown;
    shownMessageIds?: unknown;
    requestId?: unknown;
  };

  if (body.action === "seen") {
    const shown = normalizeShownMessageIds(body.shownMessageIds);
    if (!shown) return fail("invalid_shown_message_ids");
    const seenRaw = body.seenLastMessageAt;
    let seen: string | null = null;
    if (seenRaw != null && seenRaw !== "") {
      if (typeof seenRaw !== "string" || !Number.isFinite(Date.parse(seenRaw))) return fail("invalid_seen_last_message_at");
      seen = seenRaw.trim();
    }
    const res = await requesterSeenSupportCase(sb, {
      userId: auth.userId,
      caseId,
      shownMessageIds: shown,
      seenLastMessageAt: seen,
    });
    if (!res.ok) return fail(res.error);
    return NextResponse.json({ ok: true, notificationsRead: res.notificationsRead });
  }

  // 접수형 문의 — 고객이 답변 확인 후 「확인했어요」 = 종료(알림 없음)
  if (body.action === "close") {
    const seenRaw = body.seenLastMessageAt;
    if (seenRaw != null && seenRaw !== "" && (typeof seenRaw !== "string" || !Number.isFinite(Date.parse(seenRaw)))) {
      return fail("invalid_seen_last_message_at");
    }
    const res = await requesterCloseSupportCase(sb, {
      userId: auth.userId,
      caseId,
      seenLastMessageAt: typeof seenRaw === "string" ? seenRaw : null,
    });
    if (!res.ok) return fail(res.error);
    return NextResponse.json({ ok: true, case: toSupportRequesterCaseView(res.case) });
  }

  // 고객 문의 SSOT §2 (재감사 D12): 재오픈은 어드민만 — 고객은 「새 문의」로 다시 묻는다. 옛 호출은 400.
  if (body.action != null && body.action !== "") {
    return fail("invalid_action");
  }

  const requestId = parseSupportRequestId(body.requestId);
  if (requestId === "invalid") return fail("invalid_request_id");

  // 본인·매장 소유 확인 1번 — 아래 저장도 이 행을 쓴다(다시 읽지 않음)
  const gate = await getSupportCaseForUser(sb, { userId: auth.userId, caseId });
  if (!gate.ok) return fail(gate.error);

  // 계약 §1: 같은 요청 id 재전송은 429 를 받지 않는다 — 판정은 저장 DB 함수가 잠금 안에서(처음 결과 · 알림·숫자 증가 없음).
  //   속도 제한에 걸렸을 때만 미리 확인한다(요청 예산 실측: 추가 문의 1회 조회 1건 덜).
  // 고객 문의 최종 감사 D5: 고객 글 속도 제한(1분 5건 · 1시간 30건) — 넘으면 저장·어드민 알림 없이 429
  if ((await checkSupportCustomerPostRate(sb, auth.userId)) === "rate_limited") {
    if (requestId) {
      const replay = await findSupportMessageReplay(sb, { requestId, caseId, senderUserId: auth.userId });
      if ("conflict" in replay) return fail("request_id_conflict");
      if ("found" in replay && replay.found) {
        return NextResponse.json({ ok: true, message: toSupportRequesterMessageView(replay.message), replayed: true });
      }
    }
    return fail("rate_limited");
  }

  const res = await postRequesterSupportMessage(sb, {
    userId: auth.userId,
    caseId,
    body: String(body.body ?? ""),
    caseRow: gate.case,
    clientRequestId: requestId,
  });
  if (!res.ok) return fail(res.error);
  return NextResponse.json({
    ok: true,
    message: toSupportRequesterMessageView(res.message),
    ...(res.replayed ? { replayed: true } : {}),
  });
}
