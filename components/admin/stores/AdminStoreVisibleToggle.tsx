"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoreOpsOnOffSwitch } from "@/components/business/admin/StoreOpsOnOffSwitch";
import { parsePostgresBool } from "@/lib/community-feed/parse-postgres-bool";

export type AdminStoreVisibleToggleProps = {
  isVisible: boolean;
  disabled?: boolean;
  onSetVisible: (next: boolean) => boolean | Promise<boolean>;
};

/**
 * 관리자 매장 심사 — 승인 후 `stores.is_visible` (목록·공개 URL 노출).
 */
export function AdminStoreVisibleToggle({
  isVisible: isVisibleRaw,
  disabled,
  onSetVisible,
}: AdminStoreVisibleToggleProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [pendingUi, setPendingUi] = useState<boolean | null>(null);
  const isVisible = parsePostgresBool(isVisibleRaw, false);
  const switchDisabled = Boolean(disabled || busy);
  const shownVisible = pendingUi !== null ? pendingUi : isVisible;

  useEffect(() => {
    if (pendingUi === null) return;
    if (isVisible === pendingUi) setPendingUi(null);
  }, [isVisible, pendingUi]);

  const applyVisible = useCallback(
    async (next: boolean): Promise<boolean> => {
      if (next === isVisible && pendingUi === null) return true;
      setBusy(true);
      setPendingUi(next);
      try {
        const result = await Promise.resolve(onSetVisible(next));
        if (result === false) {
          setPendingUi(null);
          return false;
        }
        return true;
      } catch {
        setPendingUi(null);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [isVisible, onSetVisible, pendingUi]
  );

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="sam-text-helper font-semibold text-sam-fg">{t("admin_stores_th_visible")}</span>
      <StoreOpsOnOffSwitch
        checked={shownVisible}
        disabled={switchDisabled}
        onCheckedChange={applyVisible}
        ariaLabel={
          shownVisible ? t("admin_stores_visible_toggle_aria_off") : t("admin_stores_visible_toggle_aria_on")
        }
      />
      <span
        className={`rounded-full border px-2 py-0.5 sam-text-xxs font-bold ${
          shownVisible
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-sam-border bg-sam-app text-sam-muted"
        }`}
      >
        {shownVisible ? t("admin_stores_visible_y") : t("admin_stores_visible_n")}
      </span>
    </div>
  );
}
