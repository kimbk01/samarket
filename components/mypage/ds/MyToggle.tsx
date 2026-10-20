"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { Sam } from "@/lib/ui/sam-component-classes";

export type MyToggleProps = {
  checked: boolean;
  /** 서버 저장 — true = 성공. false 또는 예외 = 실패(원위치 + 오류 토스트) */
  onChange: (next: boolean) => Promise<boolean>;
  disabled?: boolean;
  ariaLabel: string;
};

/**
 * 토글 스위치 1종 (최종 설계 §1.2, v2.1 §3.3) — 낙관 반영 → 저장 중 비활성 → 실패 시 원위치 + 토스트.
 * 켜짐 `bg-sam-primary` · 꺼짐 회색 · 비활성 50% · 51×31.
 */
export function MyToggle({ checked, onChange, disabled = false, ariaLabel }: MyToggleProps) {
  const { t } = useI18n();
  /** 저장 중 낙관 값 — null 이면 상위 `checked` 를 그대로 표시 */
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const saving = optimistic !== null;
  const shown = optimistic ?? checked;
  const inactive = disabled || saving;

  const toggle = async () => {
    if (inactive) return;
    const next = !checked;
    setOptimistic(next);
    let ok = false;
    try {
      ok = await onChange(next);
    } catch {
      ok = false;
    }
    setOptimistic(null);
    if (!ok) showMypageToast(t("mypage_settings_save_failed_reverted"), "error");
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      aria-label={ariaLabel}
      aria-busy={saving}
      disabled={inactive}
      data-testid="my-toggle"
      onClick={() => void toggle()}
      className={`${Sam.focusRing} relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-150 motion-reduce:transition-none ${
        shown ? "bg-sam-primary" : "bg-sam-border"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <span
        aria-hidden
        className={`absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-sam-surface shadow-[var(--sam-shadow-elevated)] transition-transform duration-150 motion-reduce:transition-none ${
          shown ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
