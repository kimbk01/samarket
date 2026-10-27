import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import {
  parseTradeShowcaseInput,
  TRADE_SHOWCASE_SELECT,
} from "@/lib/trade/showcase/trade-showcase-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** P-7 거래 샘플 상품 (어드민) — PATCH 수정(노출 ON/OFF 포함) · DELETE 삭제. 모두 감사 로그. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = parseTradeShowcaseInput(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const { data: before } = await admin.sb
    .from("trade_showcase_items")
    .select(TRADE_SHOWCASE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { data, error } = await admin.sb
    .from("trade_showcase_items")
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(TRADE_SHOWCASE_SELECT)
    .single();
  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? "update_failed" }, { status: 500 });
  }
  await appendAdminRouteAudit(admin.sb, req, {
    actorId: admin.userId,
    targetType: "trade_showcase_item",
    targetId: id,
    action: "trade_showcase.update",
    before: before as Record<string, unknown>,
    after: data as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await params;
  /** 삭제는 L3 — 확인창에서 받은 사유를 서버가 검증하고 감사 기록에 남긴다 */
  const body = (await req.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = parseAdminReason(body?.reason);
  if (!reason) return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  const { data: before } = await admin.sb
    .from("trade_showcase_items")
    .select(TRADE_SHOWCASE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { error } = await admin.sb.from("trade_showcase_items").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await appendAdminRouteAudit(admin.sb, req, {
    actorId: admin.userId,
    targetType: "trade_showcase_item",
    targetId: id,
    action: "trade_showcase.delete",
    before: before as Record<string, unknown>,
    after: { reason },
  });
  return NextResponse.json({ ok: true });
}
