"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * 홈 칸 불러오기 실패 — 「데이터 없음」과 구분해 보여 준다 (감사 E8 2026-11-09: 실패를 「없음」으로 바꿔 보여 주지 않음).
 */
export function HomeLoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-3 px-[18px]" role="status" data-home-load-error>
      <span className="text-[13.5px] text-[#767676]">{t("home_load_failed")}</span>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-full border border-[#d6ddd8] px-3 py-1 text-[13px] font-semibold text-[#141a16] active:bg-black/[0.06]"
      >
        {t("home_retry")}
      </button>
    </div>
  );
}
