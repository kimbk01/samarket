"use client";

import { useEffect, useState } from "react";
import { Biz } from "@/lib/ui/biz-component-classes";

const PRESET_PREP_MINUTES = [10, 15, 20, 30, 40, 50, 60] as const;

export function OwnerOrderAcceptSheet({
  open,
  busy,
  onClose,
  onConfirm,
  overlayClassName = "z-[90]",
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (minutes: number) => void;
  /** 메신저 Phase2 등 상위 셸 위에 띄울 때 `z-[280]` 등 */
  overlayClassName?: string;
}) {
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [presetPick, setPresetPick] = useState<number | null>(null);
  const [customRaw, setCustomRaw] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode("preset");
    setPresetPick(null);
    setCustomRaw("");
  }, [open]);

  if (!open) return null;

  const customNum = Math.floor(Number(customRaw.trim()));
  let resolved = NaN;
  if (mode === "preset") {
    resolved = presetPick ?? NaN;
  } else if (Number.isFinite(customNum)) {
    resolved = customNum;
  }
  const valid = Number.isFinite(resolved) && resolved >= 1 && resolved <= 180;

  return (
    <div
      className={`fixed inset-0 flex items-end justify-center bg-black/75 sm:items-center sm:p-4 ${overlayClassName}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-order-accept-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="닫기"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        className={[
          "relative z-[1] w-full max-w-md rounded-t-[16px] border border-sam-border bg-sam-surface p-4 text-sam-fg shadow-2xl sm:rounded-[16px]",
          "max-h-[min(90vh,560px)] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]",
        ].join(" ")}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--biz-card-border)] sm:hidden" aria-hidden />
        <h2 id="owner-order-accept-title" className={Biz.textCardTitle}>
          주문 접수확인
        </h2>
        <p className={`mt-1 ${Biz.textMuted}`}>
          예상 준비 시간만 선택하면 바로 다음 진행 단계로 넘어갑니다.
        </p>

        <label className="mt-3 block">
          <span className="text-[12px] font-medium text-sam-muted">예상 준비 시간</span>
          <select
            disabled={busy}
            value={mode === "custom" ? "custom" : presetPick ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "custom") {
                setMode("custom");
                setPresetPick(null);
                return;
              }
              setMode("preset");
              setPresetPick(Number(v));
            }}
            className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-3 text-[15px] font-medium text-sam-fg"
          >
            <option value="" disabled>
              시간을 선택하세요
            </option>
            {PRESET_PREP_MINUTES.map((m) => (
              <option key={m} value={m}>
                {m}분
              </option>
            ))}
            <option value="custom">직접입력</option>
          </select>
        </label>

        {mode === "custom" ? (
          <label className="mt-3 block">
            <span className="text-[12px] font-medium text-[var(--biz-text-muted)]">분 (1–180)</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={180}
              disabled={busy}
              value={customRaw}
              onChange={(e) => setCustomRaw(e.target.value)}
              className="mt-1 w-full rounded-[14px] border border-sam-border bg-sam-app px-3 py-3 text-[15px] text-sam-fg"
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
            취소
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
            {busy ? "처리 중…" : "접수확인"}
          </button>
        </div>
      </div>
    </div>
  );
}
