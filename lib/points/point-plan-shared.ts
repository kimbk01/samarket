import type { AppLanguageCode } from "@/lib/i18n/config";
import type { PointPlan } from "@/lib/types/point";

export const POINT_PLAN_ROW_SELECT =
  "id, name_ko, name_en, description_ko, description_en, payment_amount, point_amount, bonus_amount, currency, is_active, sort_order, rate_version, created_at, updated_at";

/** Fields whose change bumps point_plans.rate_version */
export const POINT_PLAN_RATE_FIELDS = [
  "payment_amount",
  "point_amount",
  "bonus_amount",
  "currency",
] as const;

export type PointPlanRateField = (typeof POINT_PLAN_RATE_FIELDS)[number];

export function isMissingPointPlansTable(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("point_plans") &&
    (lowered.includes("does not exist") ||
      lowered.includes("schema cache") ||
      lowered.includes("could not find"))
  );
}

export function pickPlanDisplayName(
  row: { name_ko: string; name_en: string },
  language: AppLanguageCode
): string {
  return language === "en" ? row.name_en : row.name_ko;
}

export function pickPlanDescription(
  row: { description_ko: string; description_en: string },
  language: AppLanguageCode
): string {
  return language === "en" ? row.description_en : row.description_ko;
}

export function totalPointsFromPlanRow(row: {
  point_amount?: number | null;
  bonus_amount?: number | null;
}): number {
  return Math.max(0, Number(row.point_amount ?? 0)) + Math.max(0, Number(row.bonus_amount ?? 0));
}

/**
 * applied_rate snapshot = totalPoints / paymentAmount (0 if payment is 0).
 */
export function computeAppliedRate(totalPoints: number, paymentAmount: number): number {
  const pay = Math.max(0, Number(paymentAmount) || 0);
  const pts = Math.max(0, Number(totalPoints) || 0);
  if (pay <= 0) return 0;
  return pts / pay;
}

export function normalizePointPlanRow(
  row: Record<string, unknown>,
  language: AppLanguageCode = "ko"
): PointPlan {
  const pointAmount = Math.max(0, Number(row.point_amount ?? 0));
  const bonusAmount = Math.max(0, Number(row.bonus_amount ?? 0));
  return {
    id: String(row.id ?? ""),
    name: pickPlanDisplayName(
      {
        name_ko: String(row.name_ko ?? ""),
        name_en: String(row.name_en ?? ""),
      },
      language
    ),
    nameKo: String(row.name_ko ?? ""),
    nameEn: String(row.name_en ?? ""),
    paymentAmount: Math.max(0, Number(row.payment_amount ?? 0)),
    pointAmount,
    bonusPointAmount: bonusAmount,
    currency: String(row.currency ?? "PHP"),
    isActive: Boolean(row.is_active ?? true),
    description: pickPlanDescription(
      {
        description_ko: String(row.description_ko ?? ""),
        description_en: String(row.description_en ?? ""),
      },
      language
    ),
    descriptionKo: String(row.description_ko ?? ""),
    descriptionEn: String(row.description_en ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    rateVersion: Math.max(1, Number(row.rate_version ?? 1)),
  };
}
