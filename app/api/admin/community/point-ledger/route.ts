import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same authoritative point_ledger rows Member history uses. */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const kind = (req.nextUrl.searchParams.get("kind") ?? "reward").trim().toLowerCase();
  const relatedType = kind === "reclaim" ? "community_reclaim" : "community_reward";

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data, error } = await sb
    .from("point_ledger")
    .select("id, user_id, entry_type, amount, balance_after, related_type, related_id, description, created_at")
    .eq("related_type", relatedType)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data ?? []) as Record<string, unknown>[];
  const userIds = rows.map((r) => String(r.user_id ?? "")).filter(Boolean);
  const identities = await loadAdminMemberIdentityMap(sb, userIds);

  const targetIds = relatedType === "community_reward"
    ? rows.map((r) => String(r.related_id ?? "")).filter(Boolean)
    : [];
  const execByTarget = new Map<string, Record<string, unknown>>();
  if (targetIds.length) {
    const { data: execs } = await sb
      .from("point_reward_executions")
      .select("id, execution_key, board_key, action_type, target_id, status, reward_type, base_point, applied_multiplier, final_point, policy_snapshot, related_ledger_id, created_at, reversed_at")
      .in("target_id", targetIds)
      .limit(200);
    for (const row of execs ?? []) {
      const r = row as Record<string, unknown>;
      const tid = String(r.target_id ?? "");
      if (tid && !execByTarget.has(tid)) execByTarget.set(tid, r);
    }
  }

  const execIds = relatedType === "community_reclaim"
    ? rows.map((r) => String(r.related_id ?? "")).filter(Boolean)
    : [...execByTarget.values()].map((e) => String(e.id ?? "")).filter(Boolean);
  const execById = new Map<string, Record<string, unknown>>();
  if (execIds.length) {
    const { data: execs } = await sb
      .from("point_reward_executions")
      .select("id, execution_key, board_key, action_type, target_id, status, reward_type, base_point, applied_multiplier, final_point, policy_snapshot, related_ledger_id, created_at, reversed_at, user_id")
      .in("id", execIds)
      .limit(200);
    for (const row of execs ?? []) {
      const r = row as Record<string, unknown>;
      execById.set(String(r.id ?? ""), r);
    }
  }

  const items = rows.map((r) => {
    const uid = String(r.user_id ?? "");
    const relatedId = String(r.related_id ?? "");
    const exec =
      relatedType === "community_reward"
        ? execByTarget.get(relatedId) ?? null
        : execById.get(relatedId) ?? null;
    const ident = identities.get(uid);
    return {
      ledgerId: String(r.id ?? ""),
      userId: uid,
      memberLabel: ident ? formatAdminMemberLabel(ident) : uid.slice(0, 8),
      amount: Number(r.amount ?? 0),
      balanceAfter: Number(r.balance_after ?? 0),
      description: String(r.description ?? ""),
      createdAt: String(r.created_at ?? ""),
      relatedId,
      execution: exec
        ? {
            id: String(exec.id ?? ""),
            boardKey: String(exec.board_key ?? ""),
            actionType: String(exec.action_type ?? ""),
            status: String(exec.status ?? ""),
            rewardType: String(exec.reward_type ?? ""),
            basePoint: Number(exec.base_point ?? 0),
            multiplier: Number(exec.applied_multiplier ?? 1),
            finalPoint: Number(exec.final_point ?? 0),
            snapshot: exec.policy_snapshot ?? {},
            reversedAt: exec.reversed_at ? String(exec.reversed_at) : null,
          }
        : null,
    };
  });

  return NextResponse.json({ ok: true, items });
}
