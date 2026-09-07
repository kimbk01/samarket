import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  loadCoinCashConversionPolicy,
  updateCoinCashConversionPolicy,
} from "@/lib/finance/conversion-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/finance/conversion-policy */
export async function GET() {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const policy = await loadCoinCashConversionPolicy(gate.sb);
  if (!policy) return NextResponse.json({ ok: false, error: "policy_missing" }, { status: 404 });
  return NextResponse.json({ ok: true, policy });
}

/** PATCH /api/admin/finance/conversion-policy — requires confirm on client */
export async function PATCH(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await updateCoinCashConversionPolicy(gate.sb, {
    adminUserId: gate.actor.userId,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    ratePesosPerPoint:
      body.ratePesosPerPoint == null ? undefined : Number(body.ratePesosPerPoint),
    minimumCoin: body.minimumCoin == null ? undefined : Math.trunc(Number(body.minimumCoin)),
    conversionUnit:
      body.conversionUnit == null ? undefined : Math.trunc(Number(body.conversionUnit)),
    maximumConversionsPerDay:
      body.maximumConversionsPerDay === undefined
        ? undefined
        : body.maximumConversionsPerDay == null
          ? null
          : Math.trunc(Number(body.maximumConversionsPerDay)),
    maximumConversionsPerWeek:
      body.maximumConversionsPerWeek === undefined
        ? undefined
        : body.maximumConversionsPerWeek == null
          ? null
          : Math.trunc(Number(body.maximumConversionsPerWeek)),
    maximumConversionsPerMonth:
      body.maximumConversionsPerMonth === undefined
        ? undefined
        : body.maximumConversionsPerMonth == null
          ? null
          : Math.trunc(Number(body.maximumConversionsPerMonth)),
    minimumIntervalHours:
      body.minimumIntervalHours === undefined
        ? undefined
        : body.minimumIntervalHours == null
          ? null
          : Math.trunc(Number(body.minimumIntervalHours)),
    dailyLimitCoin:
      body.dailyLimitCoin === undefined
        ? undefined
        : body.dailyLimitCoin == null
          ? null
          : Math.trunc(Number(body.dailyLimitCoin)),
    monthlyLimitCoin:
      body.monthlyLimitCoin === undefined
        ? undefined
        : body.monthlyLimitCoin == null
          ? null
          : Math.trunc(Number(body.monthlyLimitCoin)),
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, policy: result.policy });
}
