/**
 * Conversion policy read/update — extends business_cash_conversion_rate_policies.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUSINESS_CASH_CONVERSION_RATE_POLICIES_TABLE } from "@/lib/stores/advertising/canonical-business-cash-contract";

export type CoinCashConversionPolicy = {
  id: string;
  enabled: boolean;
  ratePesosPerPoint: number;
  version: number;
  minimumCoin: number;
  conversionUnit: number;
  maximumConversionsPerDay: number | null;
  maximumConversionsPerWeek: number | null;
  maximumConversionsPerMonth: number | null;
  minimumIntervalHours: number | null;
  dailyLimitCoin: number | null;
  monthlyLimitCoin: number | null;
  effectiveFrom: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

function asIntOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : null;
}

export async function loadCoinCashConversionPolicy(
  sb: SupabaseClient
): Promise<CoinCashConversionPolicy | null> {
  const { data, error } = await sb
    .from(BUSINESS_CASH_CONVERSION_RATE_POLICIES_TABLE)
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const rate = Number(row.rate_pesos_per_point);
  return {
    id: "default",
    enabled: row.conversion_enabled !== false,
    ratePesosPerPoint: Number.isFinite(rate) && rate > 0 ? rate : 1,
    version: Math.trunc(Number(row.version) || 1),
    minimumCoin: Math.max(1, Math.trunc(Number(row.minimum_coin_per_conversion) || 1)),
    conversionUnit: Math.max(1, Math.trunc(Number(row.conversion_unit) || 1)),
    maximumConversionsPerDay: asIntOrNull(row.maximum_conversions_per_day),
    maximumConversionsPerWeek: asIntOrNull(row.maximum_conversions_per_week),
    maximumConversionsPerMonth: asIntOrNull(row.maximum_conversions_per_month),
    minimumIntervalHours: asIntOrNull(row.minimum_interval_hours),
    dailyLimitCoin: asIntOrNull(row.daily_limit_coin),
    monthlyLimitCoin: asIntOrNull(row.monthly_limit_coin),
    effectiveFrom: row.effective_from == null ? null : String(row.effective_from),
    updatedAt: row.updated_at == null ? null : String(row.updated_at),
    updatedBy: row.updated_by == null ? null : String(row.updated_by),
  };
}

export type UpdateCoinCashConversionPolicyInput = {
  adminUserId: string;
  enabled?: boolean;
  ratePesosPerPoint?: number;
  minimumCoin?: number;
  conversionUnit?: number;
  maximumConversionsPerDay?: number | null;
  maximumConversionsPerWeek?: number | null;
  maximumConversionsPerMonth?: number | null;
  minimumIntervalHours?: number | null;
  dailyLimitCoin?: number | null;
  monthlyLimitCoin?: number | null;
};

export async function updateCoinCashConversionPolicy(
  sb: SupabaseClient,
  input: UpdateCoinCashConversionPolicyInput
): Promise<
  | { ok: true; policy: CoinCashConversionPolicy }
  | { ok: false; error: string }
> {
  const current = await loadCoinCashConversionPolicy(sb);
  if (!current) return { ok: false, error: "policy_missing" };

  const nextRate =
    input.ratePesosPerPoint != null && input.ratePesosPerPoint > 0
      ? input.ratePesosPerPoint
      : current.ratePesosPerPoint;
  const nextMin =
    input.minimumCoin != null && input.minimumCoin > 0 ? Math.trunc(input.minimumCoin) : current.minimumCoin;
  const nextUnit =
    input.conversionUnit != null && input.conversionUnit > 0
      ? Math.trunc(input.conversionUnit)
      : current.conversionUnit;
  const nextVersion = current.version + 1;
  const effectiveFrom = new Date().toISOString();

  // Probe live columns — limit fields require migration; rate/version always exist.
  const { data: probeRow } = await sb
    .from(BUSINESS_CASH_CONVERSION_RATE_POLICIES_TABLE)
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  const probe = (probeRow ?? {}) as Record<string, unknown>;
  const hasLimits = Object.prototype.hasOwnProperty.call(probe, "minimum_coin_per_conversion");

  const basePatch: Record<string, unknown> = {
    rate_pesos_per_point: nextRate,
    version: nextVersion,
    effective_from: effectiveFrom,
    updated_by: input.adminUserId,
    updated_at: effectiveFrom,
  };
  if (Object.prototype.hasOwnProperty.call(probe, "conversion_enabled")) {
    basePatch.conversion_enabled = input.enabled ?? current.enabled;
  }

  const patch = hasLimits
    ? {
        ...basePatch,
        conversion_enabled: input.enabled ?? current.enabled,
        minimum_coin_per_conversion: nextMin,
        conversion_unit: nextUnit,
        maximum_conversions_per_day:
          input.maximumConversionsPerDay === undefined
            ? current.maximumConversionsPerDay
            : input.maximumConversionsPerDay,
        maximum_conversions_per_week:
          input.maximumConversionsPerWeek === undefined
            ? current.maximumConversionsPerWeek
            : input.maximumConversionsPerWeek,
        maximum_conversions_per_month:
          input.maximumConversionsPerMonth === undefined
            ? current.maximumConversionsPerMonth
            : input.maximumConversionsPerMonth,
        minimum_interval_hours:
          input.minimumIntervalHours === undefined
            ? current.minimumIntervalHours
            : input.minimumIntervalHours,
        daily_limit_coin:
          input.dailyLimitCoin === undefined ? current.dailyLimitCoin : input.dailyLimitCoin,
        monthly_limit_coin:
          input.monthlyLimitCoin === undefined ? current.monthlyLimitCoin : input.monthlyLimitCoin,
      }
    : basePatch;

  const histRow: Record<string, unknown> = {
    policy_id: "default",
    rate_pesos_per_point: nextRate,
    version: nextVersion,
    effective_from: effectiveFrom,
    updated_by: input.adminUserId,
  };
  if (hasLimits) {
    histRow.conversion_enabled = patch.conversion_enabled;
    histRow.minimum_coin_per_conversion = nextMin;
    histRow.conversion_unit = nextUnit;
    histRow.maximum_conversions_per_day = patch.maximum_conversions_per_day;
    histRow.maximum_conversions_per_week = patch.maximum_conversions_per_week;
    histRow.maximum_conversions_per_month = patch.maximum_conversions_per_month;
    histRow.minimum_interval_hours = patch.minimum_interval_hours;
    histRow.daily_limit_coin = patch.daily_limit_coin;
    histRow.monthly_limit_coin = patch.monthly_limit_coin;
  }

  const { error: histErr } = await sb.from("business_cash_conversion_rate_history").insert(histRow);
  if (histErr) return { ok: false, error: histErr.message };

  const { error } = await sb
    .from(BUSINESS_CASH_CONVERSION_RATE_POLICIES_TABLE)
    .update(patch)
    .eq("id", "default");
  if (error) return { ok: false, error: error.message };

  const updated = await loadCoinCashConversionPolicy(sb);
  if (!updated) return { ok: false, error: "reload_failed" };
  return { ok: true, policy: updated };
}
