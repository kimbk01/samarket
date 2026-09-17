import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  adjustUserPoints,
  sumUserPointLedger,
} from "@/lib/points/user-point-ledger";

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
 * Existing writer: adjustUserPoints (admin_credit / admin_debit).
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
  if (op === "debit" && balanceBefore < amount) {
    return NextResponse.json(
      {
        ok: false,
        error: "insufficient_balance",
        messageKo: "보유 Point보다 많은 금액은 회수할 수 없습니다.",
        messageEn: "Cannot reclaim more Point than the member holds.",
        balance: balanceBefore,
      },
      { status: 400 }
    );
  }

  const delta = op === "credit" ? amount : -amount;
  const res = await adjustUserPoints(gate.sb, {
    userId,
    delta,
    description: description.slice(0, 500),
    actorUserId: gate.actor.userId,
    relatedId: body.idempotencyKey?.trim() || undefined,
  });

  if (!res.ok) {
    const status = res.code === "insufficient_balance" ? 400 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: res.error,
        code: res.code,
        messageKo:
          res.code === "insufficient_balance"
            ? "보유 Point보다 많은 금액은 회수할 수 없습니다."
            : undefined,
      },
      { status }
    );
  }

  return NextResponse.json({
    ok: true,
    op,
    amount,
    balanceBefore,
    balanceAfter: res.balanceAfter,
    ledgerId: res.ledgerId ?? null,
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
