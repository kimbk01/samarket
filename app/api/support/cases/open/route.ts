import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { SupportContext } from "@/lib/support/support-context";
import {
  findSupportMessageReplay,
  loadSupportOpenReplay,
  openSupportCaseFromContext,
  parseSupportRequestId,
} from "@/lib/support/support-case-service";
import { supportErrorHttpStatus } from "@/lib/support/support-display-labels";
import { buildSupportCaseRoute } from "@/lib/support/support-case-types";
import { checkSupportCustomerPostRate } from "@/lib/support/support-customer-rate-limit";
import { toSupportRequesterCaseView } from "@/lib/support/support-requester-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OpenBody = {
  context?: SupportContext;
  initialBody?: string;
  issueType?: string | null;
  initialSummary?: string | null;
  guidanceKey?: string | null;
  guidanceRevision?: number | null;
  guidanceOutcome?: string | null;
  /** Structured triage: when true, issueType is required. */
  requireIssueType?: boolean;
  explicitOtherSelection?: boolean;
  /** 전체 수정 계약 §1 — 접수 요청 id(uuid). 같은 id 재전송 = 처음 결과(`replayed: true`) */
  requestId?: unknown;
};

const fail = (error: string) => NextResponse.json({ ok: false, error }, { status: supportErrorHttpStatus(error) });

/** POST /api/support/cases/open — server-validated case open/create */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return fail("supabase_unconfigured");

  let body: OpenBody;
  try {
    body = (await req.json()) as OpenBody;
  } catch {
    return fail("invalid_json");
  }

  const context = body.context;
  if (!context || typeof context !== "object") return fail("missing_context");

  const requestId = parseSupportRequestId(body.requestId);
  if (requestId === "invalid") return fail("invalid_request_id");

  // 계약 §1: 같은 요청 id 재전송은 429 를 받지 않는다. 판정은 접수 DB 함수가 잠금 안에서 하므로(처음과 같은 문의·created · 알림 없음)
  //   평소에는 미리 확인하지 않는다 — 속도 제한에 걸렸을 때만 「같은 요청 id 재전송인가」를 본다(요청 예산 실측: 접수 1회 조회 1건 덜).
  // 고객 문의 최종 감사 D5: 접수도 고객 글 1건(새 문의 첫 글 또는 진행 중 문의에 붙는 글) → 같은 속도 제한
  if ((await checkSupportCustomerPostRate(sb, auth.userId)) === "rate_limited") {
    if (requestId) {
      const replay = await findSupportMessageReplay(sb, { requestId, senderUserId: auth.userId });
      if ("conflict" in replay) return fail("request_id_conflict");
      if ("found" in replay && replay.found) {
        const first = await loadSupportOpenReplay(sb, { userId: auth.userId, message: replay.message });
        if (!first) return fail("forbidden");
        return NextResponse.json({
          ok: true,
          case: toSupportRequesterCaseView(first.case),
          sessionId: first.sessionId,
          created: first.created,
          href: buildSupportCaseRoute(first.case.id),
          replayed: true,
        });
      }
    }
    return fail("rate_limited");
  }

  const res = await openSupportCaseFromContext(sb, {
    userId: auth.userId,
    context,
    initialBody: body.initialBody,
    issueType: body.issueType,
    initialSummary: body.initialSummary,
    guidanceKey: body.guidanceKey,
    guidanceRevision: body.guidanceRevision,
    guidanceOutcome: body.guidanceOutcome,
    // Contextual Production callers omit issueType — centralized compat.
    allowMissingIssue: body.requireIssueType === true ? false : true,
    explicitOtherSelection: body.explicitOtherSelection === true,
    clientRequestId: requestId,
  });

  // 계약 §1 (5차 재감사): 같은 요청 id 재전송은 **처음 결과** — 그사이 안내문·분야 설정이 바뀌어 검증에 걸려도 이미 접수된 문의를 돌려준다.
  //   검증에 걸렸을 때만 확인한다(평소 요청 수 그대로 · 판정은 DB 함수와 같은 「그 요청 id 의 글」).
  if (!res.ok && requestId && res.error !== "request_id_conflict") {
    const replay = await findSupportMessageReplay(sb, { requestId, senderUserId: auth.userId });
    if ("found" in replay && replay.found) {
      const first = await loadSupportOpenReplay(sb, { userId: auth.userId, message: replay.message });
      if (first) {
        return NextResponse.json({
          ok: true,
          case: toSupportRequesterCaseView(first.case),
          sessionId: first.sessionId,
          created: first.created,
          href: buildSupportCaseRoute(first.case.id),
          replayed: true,
        });
      }
    }
  }
  if (!res.ok) return fail(res.error);

  return NextResponse.json({
    ok: true,
    case: toSupportRequesterCaseView(res.case),
    sessionId: res.sessionId,
    created: res.created,
    href: buildSupportCaseRoute(res.case.id),
    ...(res.replayed ? { replayed: true } : {}),
  });
}
