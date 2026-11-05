"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { FinanceLabel, FinanceLabelTone } from "@/lib/finance/finance-display-labels";

const TONE_CLASS: Record<FinanceLabelTone, string> = {
  info: "bg-sam-info-soft text-sam-info",
  warning: "bg-sam-warning-soft text-sam-warning",
  success: "bg-sam-success-soft text-sam-success",
  danger: "bg-sam-danger-soft text-sam-danger",
  muted: "bg-sam-surface-muted text-sam-muted",
};

/** 금융 상태 배지 — 회원·오너 공용 (이름은 `lib/finance/finance-display-labels`) */
export function FinanceStatusBadge({
  label,
  fallback,
}: {
  label: (FinanceLabel & { tone: FinanceLabelTone }) | null;
  /** 표에 없는 상태 — 화면에 키·코드를 쓰지 않도록 호출부가 사람 문구를 준다 */
  fallback?: string;
}) {
  const { safeT } = useI18n();
  const text = label ? safeT(label.key, { fallbackKo: label.ko, fallbackEn: label.en }) : fallback ?? "";
  if (!text) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 sam-text-xxs font-semibold ${TONE_CLASS[label?.tone ?? "muted"]}`}
      data-finance-status-badge={label?.key ?? "unknown"}
    >
      {text}
    </span>
  );
}
