"use client";

/**
 * 앱 진입 어드민 v3 §1 — 모든 그림 칸 공통: 「규격 → 올리기 → 검사 결과 → (앱 미리보기는 부모)」.
 * - 칸 위에 규격 고정 표시 · 끌어다 놓기/눌러서 고르기 · 고르는 순간 1차 검사(서버 2차 검사와 같은 값)
 * - 투명한 곳은 격자 무늬로 보여 준다. 오류가 있으면 `onAccept` 를 부르지 않는다.
 */
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  checkAdminImage,
  type AdminImageCheck,
  type AdminImageIssue,
  type AdminImageMeta,
  type AdminImageSlotSpec,
} from "@/lib/admin/media/image-slot-spec";

export const ADMIN_CHECKER_BG =
  "repeating-conic-gradient(rgb(220, 223, 220) 0% 25%, rgb(255, 255, 255) 0% 50%) 50% / 14px 14px";

/** 파일 → 크기·투명 여부(PNG·WebP 는 64px 로 줄여 알파를 본다) */
export async function readAdminImageMeta(file: File): Promise<AdminImageMeta> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image_decode_failed"));
      el.src = url;
    });
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    let hasAlpha: boolean | null = null;
    if (file.type === "image/png" || file.type === "image/webp") {
      try {
        const c = document.createElement("canvas");
        const s = 64;
        c.width = s;
        c.height = s;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, s, s);
          const d = ctx.getImageData(0, 0, s, s).data;
          hasAlpha = false;
          for (let i = 3; i < d.length; i += 4) {
            if (d[i] < 250) {
              hasAlpha = true;
              break;
            }
          }
        }
      } catch {
        hasAlpha = null;
      }
    } else {
      hasAlpha = false;
    }
    return { fileName: file.name, mime: file.type, bytes: file.size, width, height, hasAlpha };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useAdminImageIssueText() {
  const { t } = useI18n();
  return useCallback(
    (i: AdminImageIssue): string => {
      switch (i.code) {
        case "type":
          return t("admin_image_slot_err_type", { allowed: i.allowed });
        case "bytes":
          return t("admin_image_slot_err_bytes", { max: i.maxMb });
        case "small_long":
          return t("admin_image_slot_err_small_long", { min: i.min });
        case "small_short":
          return t("admin_image_slot_err_small_short", { min: i.min });
        case "small_crop":
          return t("admin_image_slot_err_small_crop", {
            w: i.cropWidth,
            h: i.cropHeight,
            minW: i.minWidth,
            minH: i.minHeight,
          });
        case "large_edge":
          return t("admin_image_slot_err_large", { max: i.max });
        case "pixels":
          return t("admin_image_slot_err_pixels");
        case "need_alpha":
          return t("admin_image_slot_err_alpha");
        case "needs_crop":
          return t("admin_image_slot_warn_crop", { w: i.cropWidth, h: i.cropHeight });
        case "ratio_bg":
          return t("admin_image_slot_warn_ratio_bg", { recommended: i.recommended });
      }
    },
    [t]
  );
}

const FIT_KEY = {
  contain_bg: "admin_image_slot_fit_contain_bg",
  crop_ratio: "admin_image_slot_fit_crop_ratio",
  contain_alpha: "admin_image_slot_fit_contain_alpha",
  logo_center: "admin_image_slot_fit_logo_center",
} as const;

export function AdminImageSlotSpecLines({ spec }: { spec: AdminImageSlotSpec }) {
  const { t } = useI18n();
  const formats = spec.mimes.map((m) => m.split("/")[1].toUpperCase().replace("JPEG", "JPG")).join("·");
  const size = spec.ratio
    ? t("admin_image_slot_spec_ratio", { w: spec.ratio.w, h: spec.ratio.h, minW: spec.ratio.minWidth, minH: spec.ratio.minHeight })
    : spec.minShortEdge
      ? t("admin_image_slot_spec_short", { min: spec.minShortEdge, max: spec.maxLongEdge ?? 4096 })
      : t("admin_image_slot_spec_long", { min: spec.minLongEdge ?? 0, max: spec.maxLongEdge ?? 4096 });
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface-muted px-3 py-2 text-xs leading-relaxed text-sam-fg" data-admin-image-spec={spec.id}>
      <div>
        {t("admin_image_slot_spec_file", { formats, max: Math.round(spec.maxBytes / 1048576) })}
        {spec.transparency === "required" ? ` · ${t("admin_image_slot_spec_alpha_required")}` : ` · ${t("admin_image_slot_spec_alpha_keep")}`}
      </div>
      <div>{size}</div>
      <div>
        {t("admin_image_slot_spec_recommended", { w: spec.recommended.width, h: spec.recommended.height })} ·{" "}
        {t(FIT_KEY[spec.fit])}
      </div>
    </div>
  );
}

export type AdminImageSlotProps = {
  spec: AdminImageSlotSpec;
  /** 지금 저장된 그림 */
  currentUrl?: string | null;
  currentLabel?: string | null;
  disabled?: boolean;
  /** 1차 검사를 통과한(경고 포함) 파일만 */
  onAccept: (file: File, meta: AdminImageMeta, check: AdminImageCheck) => void | Promise<void>;
  /** 칸 아래 추가(자르기 틀 등) */
  children?: ReactNode;
};

export function AdminImageSlot({ spec, currentUrl, currentLabel, disabled, onAccept, children }: AdminImageSlotProps) {
  const { t } = useI18n();
  const issueText = useAdminImageIssueText();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [picked, setPicked] = useState<{ url: string; meta: AdminImageMeta; check: AdminImageCheck } | null>(null);
  const [readError, setReadError] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handle = useCallback(
    async (file: File | null | undefined) => {
      if (!file || disabled) return;
      setReadError(false);
      try {
        const meta = await readAdminImageMeta(file);
        const check = checkAdminImage(meta, spec);
        setPicked((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { url: URL.createObjectURL(file), meta, check };
        });
        if (check.level !== "error") await onAccept(file, meta, check);
      } catch {
        setReadError(true);
      }
    },
    [disabled, onAccept, spec]
  );

  const shownUrl = picked?.url ?? currentUrl ?? null;
  return (
    <div className="space-y-2" data-admin-image-slot={spec.id}>
      <AdminImageSlotSpecLines spec={spec} />
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={spec.mimes.join(",")}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void handle(f);
        }}
      />
      {shownUrl ? (
        <div className="flex gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-2">
          <div className="flex h-36 w-28 shrink-0 items-center justify-center overflow-hidden rounded-ui-rect" style={{ background: ADMIN_CHECKER_BG }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 어드민 미리보기 */}
            <img src={shownUrl} alt="" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1 text-xs leading-relaxed">
            {picked ? (
              <>
                <div className="truncate font-semibold">{picked.meta.fileName}</div>
                <div className="text-sam-muted">
                  {picked.meta.width} × {picked.meta.height}px · {(picked.meta.bytes / 1024).toFixed(0)}KB
                  {picked.meta.hasAlpha ? ` · ${t("admin_image_slot_has_alpha")}` : ""}
                </div>
              </>
            ) : (
              <div className="text-sam-muted">{currentLabel ?? t("admin_image_slot_current")}</div>
            )}
            <div className="mt-2 flex gap-2">
              <label htmlFor={inputId} className="cursor-pointer rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1">
                {t("admin_image_slot_replace")}
              </label>
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handle(e.dataTransfer.files?.[0]);
          }}
          className={`flex h-36 cursor-pointer flex-col items-center justify-center gap-1 rounded-ui-rect border-2 border-dashed text-center text-sm ${
            dragOver ? "border-sam-primary bg-sam-primary/5" : "border-sam-border bg-sam-surface-muted"
          }`}
          data-admin-image-drop="1"
        >
          <span aria-hidden className="text-xl">⬆</span>
          <span className="font-semibold">{t("admin_image_slot_drop")}</span>
        </label>
      )}
      {readError ? (
        <p role="alert" className="rounded-ui-rect bg-sam-danger-soft px-3 py-2 text-xs text-sam-danger">
          {t("admin_image_slot_err_read")}
        </p>
      ) : null}
      {picked ? (
        picked.check.level === "ok" ? (
          <p className="rounded-ui-rect bg-sam-primary/10 px-3 py-2 text-xs text-sam-primary" data-admin-image-check="ok">
            ✓ {t("admin_image_slot_ok")}
          </p>
        ) : (
          <ul className="space-y-1" data-admin-image-check={picked.check.level}>
            {picked.check.issues.map((i, k) => (
              <li
                key={k}
                role={i.level === "error" ? "alert" : undefined}
                className={`rounded-ui-rect px-3 py-2 text-xs ${
                  i.level === "error" ? "bg-sam-danger-soft text-sam-danger" : "bg-sam-warning-soft text-sam-warning"
                }`}
              >
                {i.level === "error" ? "✕ " : "⚠ "}
                {issueText(i)}
              </li>
            ))}
          </ul>
        )
      ) : null}
      {children}
    </div>
  );
}
