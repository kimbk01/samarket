import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { sumUserPointLedger } from "@/lib/points/user-point-ledger";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve Admin Point money authority from ledger SUM only.
 * profiles.points is projection/cache — never used as adjust gate/preview.
 */
async function readCanonicalAdminPointBalance(
  sb: Parameters<typeof sumUserPointLedger>[0],
  userId: string
): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  const summed = await sumUserPointLedger(sb, userId);
  if (!summed.ok) return { ok: false, error: summed.error };
  return { ok: true, balance: summed.sum };
}

/**
 * POST /api/admin/points/adjust
 * Writer: RPC admin_adjust_user_points (admin_credit / admin_debit · actor_id · idempotency_key unique).
 * op: "credit" | "debit"
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => ({}))) as {
    op?: string;
    userId?: string;
    amount?: number;
    reason?: string;
    memo?: string;
    idempotencyKey?: string;
  };

  const op = String(body.op ?? "").trim().toLowerCase();
  const userId = String(body.userId ?? "").trim();
  const amount = Math.trunc(Number(body.amount) || 0);
  const reason = String(body.reason ?? "").trim();
  const memo = String(body.memo ?? "").trim();
  const description = memo ? `${reason} · ${memo}` : reason;

  if (op !== "credit" && op !== "debit") {
    return NextResponse.json({ ok: false, error: "invalid_op" }, { status: 400 });
  }
  if (!userId || amount < 1 || !reason) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const before = await readCanonicalAdminPointBalance(gate.sb, userId);
  if (!before.ok) {
    return NextResponse.json({ ok: false, error: before.error }, { status: 500 });
  }
  const balanceBefore = before.balance;
  // 잔액 부족 판정은 RPC 가 회원 행을 잠근 뒤 한다 (같은 키 재요청은 기존 결과를 돌려준다).

  const idempotencyKey = String(body.idempotencyKey ?? "").trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return NextResponse.json({ ok: false, error: "idempotency_key_required" }, { status: 400 });
  }

  // 원자 RPC (M7): 회원 행 잠금 → 같은 키 재요청이면 기존 결과 → 잔액 확인 → 원장(actor_id) 기록.
  const delta = op === "credit" ? amount : -amount;
  const { data: rpc, error: rpcErr } = await gate.sb.rpc("admin_adjust_user_points", {
    p_user_id: userId,
    p_delta: delta,
    p_description: description.slice(0, 500),
    p_actor_id: gate.actor.userId,
    p_idempotency_key: idempotencyKey,
  });
  const res = (rpc ?? {}) as {
    ok?: boolean;
    error?: string;
    duplicate?: boolean;
    ledger_id?: string;
    balance_after?: number;
    balance?: number;
  };
  if (rpcErr || res.ok !== true) {
    const code = res.error ?? "adjust_failed";
    const status = code === "insufficient_balance" || code === "invalid_input" ? 400 : code === "user_not_found" ? 404 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: code,
        code,
        balance: res.balance,
        messageKo:
          code === "insufficient_balance" ? "보유 Point보다 많은 금액은 회수할 수 없습니다." : undefined,
      },
      { status }
    );
  }

  await appendCommunityAdminAudit(gate.sb, req, {
    actorId: gate.actor.userId,
    targetType: "user_points",
    targetId: userId,
    action: op === "credit" ? "admin_point_credit" : "admin_point_debit",
    reason,
    before: { balance: balanceBefore },
    after: {
      amount: delta,
      balance_after: res.balance_after ?? null,
      ledger_id: res.ledger_id ?? null,
      idempotency_key: idempotencyKey,
      duplicate: res.duplicate === true,
      memo: memo || null,
    },
  });

  return NextResponse.json({
    ok: true,
    op,
    amount,
    balanceBefore,
    balanceAfter: res.balance_after ?? null,
    ledgerId: res.ledger_id ?? null,
    duplicate: res.duplicate === true,
  });
}

/** GET balance preview for confirm UI — ledger SUM authority only. */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;
  const userId = new URL(req.url).searchParams.get("userId")?.trim() ?? "";
  if (!userId) return NextResponse.json({ ok: false, error: "userId_required" }, { status: 400 });
  const balance = await readCanonicalAdminPointBalance(gate.sb, userId);
  if (!balance.ok) {
    return NextResponse.json({ ok: false, error: balance.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, userId, balance: balance.balance });
}
