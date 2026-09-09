/**
 * POST /api/admin/store-orders/bulk-delete
 *
 * B2 CLOSED: hard delete blocked — Gift/Finance/settlement integrity.
 * Aligns with ORDER_ENTITY_ACTION_POLICY.hardDeleteAvailable = false.
 * Use cancel / status transitions for operational cleanup.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  ORDER_HARD_DELETE_BLOCKED,
  ORDER_HARD_DELETE_BLOCK_REASON,
} from "@/lib/admin/data-reset/order-hard-delete-policy";
import { ORDER_ENTITY_ACTION_POLICY } from "@/lib/admin/management/policies/seed-policies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  void _req;

  if (ORDER_HARD_DELETE_BLOCKED || !ORDER_ENTITY_ACTION_POLICY.hardDeleteAvailable) {
    return NextResponse.json(
      {
        ok: false,
        error: ORDER_HARD_DELETE_BLOCK_REASON,
        blocked: true,
        policy: "ORDER_ENTITY_ACTION_POLICY.hardDeleteAvailable=false",
        hint: "Order history / gift redemption / fee / settlement are PRESERVE. Use cancel status — not hard delete.",
      },
      { status: 410 }
    );
  }

  return NextResponse.json(
    { ok: false, error: "order_hard_delete_unreachable" },
    { status: 500 }
  );
}
