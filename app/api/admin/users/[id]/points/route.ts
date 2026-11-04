import { NextRequest, NextResponse } from "next/server";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  loadPointChargeRequestsPage,
  loadPointHistoryPeriodExtras,
  resolvePointHistoryPeriod,
} from "@/lib/points/point-period-history";
import type { PointFinancialFilter } from "@/lib/points/point-financial-history";
import {
  loadPointFinancialHistory,
  loadPointFinancialHistoryChainPage,
  loadPointFinancialSummary,
  serializePointFinancialPage,
} from "@/lib/points/project-point-financial-history";
import {
  readUserPointBalance,
  reconcileUserPointBalance,
} from "@/lib/points/user-point-ledger";
import { invalidPeriodResponse } from "@/lib/stores/commission/period-input-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseFilter(raw: string | null): PointFinancialFilter {
  const v = (raw ?? "all").trim().toLowerCase();
  if (v === "credit" || v === "debit") return v;
  return "all";
}

/** 내역 offset 쪽 응답 모양 — 회원 `/api/me/points` 의 offset 모드와 같다. */
function serializePointHistoryChainPage<T>(res: {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}) {
  return {
    items: res.items,
    hasMore: res.offset + res.limit < res.total,
    nextCursor: null,
    total: res.total,
    offset: res.offset,
    limit: res.limit,
  };
}

/**
 * GET /api/admin/users/[id]/points
 * Query: filter · period/from/to (PHT) · chargeOffset/chargeLimit (충전 신청 쪽)
 *   histOffset/histLimit — 보내면 내역을 offset 쪽 + 정확한 전체 건수(`history.total`)로 (회원 API 와 같은 함수).
 *     안 보내면 예전 cursor(`cursor`·`limit`).
 *   section=charges — 충전 신청 쪽만 · section=history (histOffset 필수) — 내역 쪽만 (잔액·합계 재계산 없음).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const userId = id?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const { sb } = gate;
  const { data: profile } = await sb
    .from("profiles")
    .select("nickname, points")
    .eq("id", userId)
    .maybeSingle();
  const userNickname = String((profile as { nickname?: string } | null)?.nickname ?? "");

  const filter = parseFilter(req.nextUrl.searchParams.get("filter"));
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 40);
  const cursor = req.nextUrl.searchParams.get("cursor");
  const dateFrom = req.nextUrl.searchParams.get("dateFrom");
  const dateTo = req.nextUrl.searchParams.get("dateTo");
  /* 기간(PHT) — 회원 `/api/me/points` 와 같은 함수·같은 주소 값 (period·from·to). 없으면 합계만 이번 달 */
  const badPeriod = invalidPeriodResponse(req.nextUrl.searchParams);
  if (badPeriod) return badPeriod;
  const period = resolvePointHistoryPeriod(req.nextUrl.searchParams);
  const chargeOffset = Number(req.nextUrl.searchParams.get("chargeOffset") ?? 0);
  const chargeLimitRaw = req.nextUrl.searchParams.get("chargeLimit");
  const chargeLimit = chargeLimitRaw ? Number(chargeLimitRaw) : undefined;
  const histOffsetRaw = req.nextUrl.searchParams.get("histOffset");
  const offsetMode = histOffsetRaw != null && histOffsetRaw.trim() !== "";
  const histLimitRaw = req.nextUrl.searchParams.get("histLimit");
  const listFromIso = period.explicit ? period.fromIso : null;
  const listToIso = period.explicit ? period.toIso : null;
  const loadHistoryChainPage = () =>
    loadPointFinancialHistoryChainPage(sb, {
      userId,
      filter,
      offset: Number(histOffsetRaw),
      limit: histLimitRaw ? Number(histLimitRaw) : undefined,
      fromIso: listFromIso,
      toIso: listToIso,
    });

  /* 충전 신청 「더 보기」 — 그 목록만 (회원 API 와 같은 규칙) */
  if (req.nextUrl.searchParams.get("section") === "charges") {
    const pageRes = await loadPointChargeRequestsPage(sb, {
      userId,
      userNickname,
      fromIso: period.explicit ? period.fromIso : null,
      toIso: period.explicit ? period.toIso : null,
      offset: chargeOffset,
      limit: chargeLimit,
    });
    if (!pageRes.ok) return NextResponse.json({ ok: false, error: pageRes.error }, { status: 500 });
    const { items, ...chargeRequestsPage } = pageRes.page;
    return NextResponse.json({ ok: true, chargeRequests: items, chargeRequestsPage });
  }

  /* 내역 쪽 이동 — 그 쪽만 (같은 기간·필터) */
  if (req.nextUrl.searchParams.get("section") === "history" && offsetMode) {
    const pageRes = await loadHistoryChainPage();
    if (!pageRes.ok) {
      if (pageRes.code === "table_missing") {
        return NextResponse.json({ ok: true, history: { items: [], hasMore: false, nextCursor: null, total: 0 } });
      }
      return NextResponse.json({ ok: false, error: pageRes.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, history: serializePointHistoryChainPage(pageRes) });
  }

  const summaryRes = await loadPointFinancialSummary(sb, userId);
  if (!summaryRes.ok) {
    // 잔액을 못 읽었으면 0 이 아니라 오류 — 화면은 "확인 불가"로 표시한다(D4).
    return NextResponse.json({ ok: false, error: "points_balance_unavailable" }, { status: 503 });
  }
  const summary = summaryRes.summary;
  const historyRes = offsetMode
    ? await loadHistoryChainPage()
    : await loadPointFinancialHistory(sb, {
        userId,
        filter,
        limit,
        cursor,
        dateFrom,
        dateTo,
        fromIso: listFromIso,
        toIso: listToIso,
        withTotal: true,
      });
  if (!historyRes.ok) {
    if (historyRes.code === "table_missing") {
      return NextResponse.json({
        ok: true,
        balance: summary.balance,
        summary,
        history: { items: [], hasMore: false, nextCursor: null, total: 0 },
        ledger: [],
        chargeRequests: [],
        source: "missing_table",
      });
    }
    return NextResponse.json({ ok: false, error: historyRes.error }, { status: 500 });
  }

  const extrasRes = await loadPointHistoryPeriodExtras(sb, {
    userId,
    userNickname,
    period,
    chargeOffset,
    chargeLimit,
    withSummary: !cursor,
  });
  if (!extrasRes.ok) {
    return NextResponse.json({ ok: false, error: extrasRes.error }, { status: 500 });
  }
  const { chargeRequests, ...periodExtras } = extrasRes.extras;

  const history =
    "page" in historyRes ? serializePointFinancialPage(historyRes.page) : serializePointHistoryChainPage(historyRes);

  return NextResponse.json({
    ok: true,
    balance: summary.balance,
    ledgerSum: summary.ledgerSum,
    cacheMatchesLedger: summary.cacheMatchesLedger,
    summary,
    history,
    ledger: history.items.map((item) => ({
      id: item.ledgerId,
      userId,
      userNickname,
      entryType: item.entryType,
      amount: item.signedAmount,
      balanceAfter: item.balanceAfter,
      relatedType: item.relatedType,
      relatedId: item.relatedId,
      description: item.description,
      createdAt: item.occurredAt,
      actorType: item.actorType,
    })),
    chargeRequests,
    ...periodExtras,
    source: "supabase",
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const userId = id?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: { delta?: number; reason?: string; idempotencyKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const delta = Math.trunc(Number(body.delta));
  const reason = String(body.reason ?? "").trim();
  if (!Number.isFinite(delta) || delta === 0) {
    return NextResponse.json({ ok: false, error: "invalid_delta" }, { status: 400 });
  }
  if (reason.length < 2) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }
  // D-48: 재시도 시 이중 지급을 막으려면 화면이 만든 키가 반드시 있어야 한다 (서버 무작위 키 금지)
  const idempotencyKey = String(body.idempotencyKey ?? "").trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return NextResponse.json({ ok: false, error: "idempotency_key_required" }, { status: 400 });
  }

  // C-45: 관리자 조정 경로 단일화 — /api/admin/points/adjust 와 같은 원자 RPC.
  const { sb, actor } = gate;
  const current = await readUserPointBalance(sb, userId);
  const { data: rpc, error: rpcErr } = await sb.rpc("admin_adjust_user_points", {
    p_user_id: userId,
    p_delta: delta,
    p_description: reason.slice(0, 500),
    p_actor_id: actor.userId,
    p_idempotency_key: idempotencyKey,
  });
  const res = (rpc ?? {}) as { ok?: boolean; error?: string; balance_after?: number; ledger_id?: string; duplicate?: boolean };
  if (rpcErr || res.ok !== true) {
    const code = res.error ?? "adjust_failed";
    const status =
      code === "insufficient_balance" || code === "invalid_input" ? 400 : code === "user_not_found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: code }, { status });
  }

  await appendCommunityAdminAudit(sb, req, {
    actorId: actor.userId,
    targetType: "user_points",
    targetId: userId,
    action: delta > 0 ? "admin_point_credit" : "admin_point_debit",
    reason,
    before: { balance: current },
    after: {
      amount: delta,
      balance_after: res.balance_after ?? null,
      ledger_id: res.ledger_id ?? null,
      idempotency_key: idempotencyKey,
      duplicate: res.duplicate === true,
    },
  });

  return NextResponse.json({ ok: true, balance: res.balance_after ?? null });
}

/** Soft repair: project profiles.points from ledger SUM when mismatched. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const userId = id?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: { reconcile?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (body.reconcile !== true) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const { sb, actor } = gate;
  const res = await reconcileUserPointBalance(sb, userId);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  }

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "user_points",
    target_id: userId,
    action: "admin_point_reconcile",
    before_json: { balance: res.cacheBefore, ledgerSum: res.ledgerSum },
    after_json: { balance: res.cacheAfter, repaired: res.repaired },
  });

  return NextResponse.json({
    ok: true,
    repaired: res.repaired,
    cacheBefore: res.cacheBefore,
    ledgerSum: res.ledgerSum,
    balance: res.cacheAfter,
  });
}
