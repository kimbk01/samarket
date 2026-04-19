/**
 * 거래 자동화 정책 (ops_trade_policy 단일 행)
 * GET/PUT — 관리자 세션. PUT 본문: buyerAutoConfirmDays, buyerReviewDeadlineDays
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getServiceOrAnonClient } from "@/lib/admin/verify-admin-user-server";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import {

  clampPolicyDays,
  DEFAULT_BUYER_AUTO_CONFIRM_DAYS,
  DEFAULT_BUYER_REVIEW_DEADLINE_DAYS,
} from "@/lib/trade/ops-trade-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) {
    return NextResponse.json({ ok: false, error: supabaseEnv.error }, { status: 500 });
  }
  const sb = getServiceOrAnonClient(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    supabaseEnv.serviceKey ?? undefined
  );
   
  const sbAny = sb as any;
  try {
    const { data } = await sbAny
      .from("ops_trade_policy")
      .select("id, buyer_auto_confirm_days, buyer_review_deadline_days")
      .eq("id", 1)
      .maybeSingle();
    const row = data as { buyer_auto_confirm_days?: number; buyer_review_deadline_days?: number } | null;
    return NextResponse.json({
      buyerAutoConfirmDays: clampPolicyDays(
        row?.buyer_auto_confirm_days ?? DEFAULT_BUYER_AUTO_CONFIRM_DAYS,
        DEFAULT_BUYER_AUTO_CONFIRM_DAYS
      ),
      buyerReviewDeadlineDays: clampPolicyDays(
        row?.buyer_review_deadline_days ?? DEFAULT_BUYER_REVIEW_DEADLINE_DAYS,
        DEFAULT_BUYER_REVIEW_DEADLINE_DAYS
      ),
    });
  } catch {
    return NextResponse.json({
      buyerAutoConfirmDays: DEFAULT_BUYER_AUTO_CONFIRM_DAYS,
      buyerReviewDeadlineDays: DEFAULT_BUYER_REVIEW_DEADLINE_DAYS,
    });
  }
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) {
    return NextResponse.json({ ok: false, error: supabaseEnv.error }, { status: 500 });
  }
  let body: {
    buyerAutoConfirmDays?: number;
    buyerReviewDeadlineDays?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 필요" }, { status: 400 });
  }
  const d1 = clampPolicyDays(body.buyerAutoConfirmDays ?? DEFAULT_BUYER_AUTO_CONFIRM_DAYS, DEFAULT_BUYER_AUTO_CONFIRM_DAYS);
  const d2 = clampPolicyDays(
    body.buyerReviewDeadlineDays ?? DEFAULT_BUYER_REVIEW_DEADLINE_DAYS,
    DEFAULT_BUYER_REVIEW_DEADLINE_DAYS
  );
  const sb = getServiceOrAnonClient(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    supabaseEnv.serviceKey ?? undefined
  );
   
  const sbAny = sb as any;
  const now = new Date().toISOString();
  const { error } = await sbAny.from("ops_trade_policy").upsert(
    {
      id: 1,
      buyer_auto_confirm_days: d1,
      buyer_review_deadline_days: d2,
      updated_at: now,
    },
    { onConflict: "id" }
  );
  if (error) {
    return NextResponse.json({ ok: false, error: error.message ?? "저장 실패" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, buyerAutoConfirmDays: d1, buyerReviewDeadlineDays: d2 });
}
