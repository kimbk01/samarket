"use client";

import { useEffect, useState } from "react";
import { Biz } from "@/lib/ui/biz-component-classes";

const PRESET_PREP_MINUTES = [10, 15, 20, 30, 40, 50, 60] as const;

export function OwnerOrderAcceptSheet({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (minutes: number) => void;
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
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
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
          "relative z-[1] w-full max-w-md rounded-t-[16px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] p-4 shadow-2xl sm:rounded-[16px]",
          "max-h-[min(90vh,560px)] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]",
        ].join(" ")}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--biz-card-border)] sm:hidden" aria-hidden />
        <h2 id="owner-order-accept-title" className={Biz.textCardTitle}>
          주문 수락
        </h2>
        <p className={`mt-1 ${Biz.textMuted}`}>
          예상 조리 시간을 선택하면 고객 화면에 안내 시간이 표시됩니다.
        </p>

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
              className={`min-h-[40px] rounded-full border px-3 py-2 text-[14px] font-medium ${
                mode === "preset" && presetPick === m
                  ? "border-[var(--biz-primary)] bg-[var(--biz-primary-soft)] text-[var(--biz-primary)]"
                  : "border-[var(--biz-card-border)] bg-[var(--biz-app-bg)] text-[var(--biz-text)]"
              }`}
            >
              {m}분
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMode("custom");
              setPresetPick(null);
            }}
            className={`min-h-[40px] rounded-full border px-3 py-2 text-[14px] font-medium ${
              mode === "custom"
                ? "border-[var(--biz-primary)] bg-[var(--biz-primary-soft)] text-[var(--biz-primary)]"
                : "border-[var(--biz-card-border)] bg-[var(--biz-app-bg)] text-[var(--biz-text)]"
            }`}
          >
            직접입력
          </button>
        </div>

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
              className="mt-1 w-full rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-app-bg)] px-3 py-3 text-[15px] text-[var(--biz-text)]"
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
            {busy ? "처리 중…" : "주문 수락"}
          </button>
        </div>
      </div>
    </div>
  );
}
