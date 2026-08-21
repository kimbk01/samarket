"use client";

import { useEffect, useState } from "react";
import { Biz } from "@/lib/ui/biz-component-classes";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { useOwnerAdminBottomSheetKeyboard } from "@/lib/business/use-owner-admin-bottom-sheet-keyboard";

const PRESET_PREP_MINUTES = [10, 15, 20, 30, 40, 50, 60] as const;

export function OwnerOrderAcceptSheet({
  open,
  busy,
  onClose,
  onConfirm,
  overlayClassName,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (minutes: number) => void;
  /** 접수 시트 z-index — 상세 모달·스테퍼 위에 올릴 때 */
  overlayClassName?: string;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [presetPick, setPresetPick] = useState<number | null>(null);
  const [customRaw, setCustomRaw] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode("preset");
    setPresetPick(null);
    setCustomRaw("");
  }, [open]);

  const customNum = Math.floor(Number(customRaw.trim()));
  const { contentPaddingBottomPx } = useOwnerAdminBottomSheetKeyboard(open);
  let resolved = NaN;
  if (mode === "preset") {
    resolved = presetPick ?? NaN;
  } else if (Number.isFinite(customNum)) {
    resolved = customNum;
  }
  const valid = Number.isFinite(resolved) && resolved >= 1 && resolved <= 180;

  return (
    <DibayBottomSheet
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={t("business_phase7_339")}
      anchor="above-bottom-nav"
      zIndexClass={overlayClassName ? MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS : undefined}
      ariaLabel={t("business_phase7_339")}
      panelClassName="!max-w-md"
      contentPaddingBottomPx={contentPaddingBottomPx}
    >
      <p className={`mt-1 ${OverlayUi.bodySecondary}`}>{t("business_phase7_340")}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {PRESET_PREP_MINUTES.map((m) => (
          <button
            key={m}
            type="button"
            disabled={busy}
            onClick={() => {
              setMode("preset");
              setPresetPick(m);
            }}
            className={`min-h-[40px] rounded-full border px-3 py-2 text-[14px] font-medium active:scale-[var(--overlay-press-scale)] ${
              mode === "preset" && presetPick === m
                ? "border-[color:var(--overlay-primary)] bg-[color:var(--overlay-secondary)] text-[color:var(--overlay-primary)]"
                : "border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] text-[color:var(--overlay-text-primary)]"
            }`}
          >
            {t("business_phase7_341", { v1: String(m) })}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setMode("custom");
            setPresetPick(null);
          }}
          className={`min-h-[40px] rounded-full border px-3 py-2 text-[14px] font-medium active:scale-[var(--overlay-press-scale)] ${
            mode === "custom"
              ? "border-[color:var(--overlay-primary)] bg-[color:var(--overlay-secondary)] text-[color:var(--overlay-primary)]"
              : "border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] text-[color:var(--overlay-text-primary)]"
          }`}
        >
          {t("business_phase7_285")}
        </button>
      </div>

      {mode === "custom" ? (
        <label className="mt-3 block">
          <span className={OverlayUi.caption}>{t("business_phase7_129")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={180}
            disabled={busy}
            value={customRaw}
            onChange={(e) => setCustomRaw(e.target.value)}
            className="mt-1 w-full rounded-[length:var(--overlay-radius-lg)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] px-3 py-3 text-[15px] text-[color:var(--overlay-text-primary)]"
          />
        </label>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className={[Biz.btnOutline, "w-full sm:w-auto"].join(" ")}
        >
          {t("common_cancel")}
        </button>
        <button
          type="button"
          disabled={busy || !valid}
          onClick={() => {
            if (!valid) return;
            onConfirm(Math.floor(resolved));
          }}
          className={[Biz.btnPrimaryLg, "w-full sm:w-auto"].join(" ")}
        >
          {busy ? t("common_processing") : t("business_phase7_342")}
        </button>
      </div>
    </DibayBottomSheet>
  );
}
