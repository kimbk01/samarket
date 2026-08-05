/**
 * CONTRACT (Phase 4 Slice 3 — Member Rates SSOT):
 * - SSOT = point_plans
 * - rate_version bumps only when payment/point/bonus/currency change
 * - DO NOT mutate Store Point rates here
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { PointPlan } from "@/lib/types/point";
import {
  isMissingPointPlansTable,
  normalizePointPlanRow,
  POINT_PLAN_RATE_FIELDS,
  POINT_PLAN_ROW_SELECT,
} from "@/lib/points/point-plan-shared";

export type MemberPointPlanMutationResult =
  | { ok: true; plan: PointPlan }
  | { ok: false; error: string; code?: "table_missing" | "not_found" | "invalid_input" };

export type MemberPointPlanListResult =
  | { ok: true; plans: PointPlan[] }
  | { ok: false; error: string; code?: "table_missing" };

export type CreateMemberPointPlanInput = {
  nameKo: string;
  nameEn: string;
  descriptionKo?: string;
  descriptionEn?: string;
  paymentAmount: number;
  pointAmount: number;
  bonusAmount?: number;
  currency?: string;
  isActive?: boolean;
  sortOrder?: number;
};

export type UpdateMemberPointPlanInput = Partial<CreateMemberPointPlanInput>;

function sanitizeCurrency(raw: string | undefined): string {
  const c = String(raw ?? "PHP").trim().toUpperCase();
  return c === "KRW" || c === "USD" || c === "PHP" ? c : "PHP";
}

export async function listMemberPointPlans(
  sb: SupabaseClient,
  opts?: { activeOnly?: boolean; language?: AppLanguageCode }
): Promise<MemberPointPlanListResult> {
  const language = opts?.language ?? "ko";
  let q = sb.from("point_plans").select(POINT_PLAN_ROW_SELECT).order("sort_order", { ascending: true });
  if (opts?.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) {
    if (isMissingPointPlansTable(error.message ?? "")) {
      return { ok: false, error: error.message, code: "table_missing" };
    }
    return { ok: false, error: error.message };
  }
  return {
    ok: true,
    plans: (data ?? []).map((row) => normalizePointPlanRow(row as Record<string, unknown>, language)),
  };
}

export async function createMemberPointPlan(
  sb: SupabaseClient,
  input: CreateMemberPointPlanInput,
  language: AppLanguageCode = "ko"
): Promise<MemberPointPlanMutationResult> {
  const nameKo = String(input.nameKo ?? "").trim();
  const nameEn = String(input.nameEn ?? "").trim() || nameKo;
  if (!nameKo) return { ok: false, error: "name_required", code: "invalid_input" };
  const paymentAmount = Math.max(0, Math.floor(Number(input.paymentAmount) || 0));
  const pointAmount = Math.max(0, Math.floor(Number(input.pointAmount) || 0));
  const bonusAmount = Math.max(0, Math.floor(Number(input.bonusAmount) || 0));
  if (paymentAmount <= 0 || pointAmount <= 0) {
    return { ok: false, error: "invalid_amounts", code: "invalid_input" };
  }

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("point_plans")
    .insert({
      name_ko: nameKo.slice(0, 120),
      name_en: nameEn.slice(0, 120),
      description_ko: String(input.descriptionKo ?? "").slice(0, 500),
      description_en: String(input.descriptionEn ?? "").slice(0, 500),
      payment_amount: paymentAmount,
      point_amount: pointAmount,
      bonus_amount: bonusAmount,
      currency: sanitizeCurrency(input.currency),
      is_active: input.isActive !== false,
      sort_order: Math.floor(Number(input.sortOrder) || 0),
      rate_version: 1,
      created_at: now,
      updated_at: now,
    })
    .select(POINT_PLAN_ROW_SELECT)
    .maybeSingle();

  if (error) {
    if (isMissingPointPlansTable(error.message ?? "")) {
      return { ok: false, error: error.message, code: "table_missing" };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "insert_failed" };
  return { ok: true, plan: normalizePointPlanRow(data as Record<string, unknown>, language) };
}

export async function updateMemberPointPlan(
  sb: SupabaseClient,
  planId: string,
  input: UpdateMemberPointPlanInput,
  language: AppLanguageCode = "ko"
): Promise<MemberPointPlanMutationResult> {
  const id = planId.trim();
  if (!id) return { ok: false, error: "invalid_id", code: "invalid_input" };

  const { data: existing, error: fetchErr } = await sb
    .from("point_plans")
    .select(POINT_PLAN_ROW_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) {
    if (isMissingPointPlansTable(fetchErr.message ?? "")) {
      return { ok: false, error: fetchErr.message, code: "table_missing" };
    }
    return { ok: false, error: fetchErr.message };
  }
  if (!existing) return { ok: false, error: "not_found", code: "not_found" };

  const cur = existing as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.nameKo !== undefined) patch.name_ko = String(input.nameKo).trim().slice(0, 120);
  if (input.nameEn !== undefined) patch.name_en = String(input.nameEn).trim().slice(0, 120);
  if (input.descriptionKo !== undefined) {
    patch.description_ko = String(input.descriptionKo).slice(0, 500);
  }
  if (input.descriptionEn !== undefined) {
    patch.description_en = String(input.descriptionEn).slice(0, 500);
  }
  if (input.paymentAmount !== undefined) {
    patch.payment_amount = Math.max(0, Math.floor(Number(input.paymentAmount) || 0));
  }
  if (input.pointAmount !== undefined) {
    patch.point_amount = Math.max(0, Math.floor(Number(input.pointAmount) || 0));
  }
  if (input.bonusAmount !== undefined) {
    patch.bonus_amount = Math.max(0, Math.floor(Number(input.bonusAmount) || 0));
  }
  if (input.currency !== undefined) patch.currency = sanitizeCurrency(input.currency);
  if (input.isActive !== undefined) patch.is_active = Boolean(input.isActive);
  if (input.sortOrder !== undefined) patch.sort_order = Math.floor(Number(input.sortOrder) || 0);

  let bump = false;
  for (const field of POINT_PLAN_RATE_FIELDS) {
    if (patch[field] === undefined) continue;
    if (Number(patch[field]) !== Number(cur[field]) && String(patch[field]) !== String(cur[field])) {
      // currency is string; amounts are numbers
      if (field === "currency") {
        if (String(patch[field]) !== String(cur[field] ?? "PHP")) bump = true;
      } else if (Number(patch[field]) !== Number(cur[field] ?? 0)) {
        bump = true;
      }
    }
  }
  if (bump) {
    patch.rate_version = Math.max(1, Number(cur.rate_version ?? 1)) + 1;
  }

  const { data, error } = await sb
    .from("point_plans")
    .update(patch)
    .eq("id", id)
    .select(POINT_PLAN_ROW_SELECT)
    .maybeSingle();

  if (error) {
    if (isMissingPointPlansTable(error.message ?? "")) {
      return { ok: false, error: error.message, code: "table_missing" };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "update_failed" };
  return { ok: true, plan: normalizePointPlanRow(data as Record<string, unknown>, language) };
}
