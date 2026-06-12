import type { AppLanguageCode } from "@/lib/i18n/config";
import type { PointPlan } from "@/lib/types/point";

export const POINT_PLAN_ROW_SELECT =
  "id, name_ko, name_en, description_ko, description_en, payment_amount, point_amount, bonus_amount, currency, is_active, sort_order, created_at, updated_at";

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
    paymentAmount: Math.max(0, Number(row.payment_amount ?? 0)),
    pointAmount,
    bonusPointAmount: bonusAmount,
    isActive: Boolean(row.is_active ?? true),
    description: pickPlanDescription(
      {
        description_ko: String(row.description_ko ?? ""),
        description_en: String(row.description_en ?? ""),
      },
      language
    ),
  };
}

export function totalPointsFromPlanRow(row: {
  point_amount?: number | null;
  bonus_amount?: number | null;
}): number {
  return Math.max(0, Number(row.point_amount ?? 0)) + Math.max(0, Number(row.bonus_amount ?? 0));
}
