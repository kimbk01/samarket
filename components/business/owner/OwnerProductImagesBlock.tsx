"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Camera } from "lucide-react";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  newOwnerProductImageSlotId,
  OWNER_PRODUCT_IMAGE_MAX_EDGE_PX,
  OWNER_PRODUCT_IMAGE_SLOTS_MAX,
  validateOwnerProductImageFileForUpload,
  validateOwnerProductImagePixelDimensions,
} from "@/lib/stores/owner-product-images";
import { readImageFileDimensions } from "@/lib/stores/upload-store-product-image-client";
import { OWNER_STORE_PROFILE_FIELD_LABEL_CLASS } from "@/lib/business/owner-store-stack";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type OwnerProductImageSlot = {
  id: string;
  type: "url" | "file";
  url?: string;
  file?: File;
};

function newSlotId() {
  return newOwnerProductImageSlotId();
}

const LONG_PRESS_MS = 480;

/** `OwnerMobileAdminHeader` Bell·메뉴 아이콘과 동일 stroke 라인 카메라 */
const OWNER_PRODUCT_IMAGE_ADD_CAMERA_ICON_CLASS = "h-5 w-5 shrink-0 text-[#262626]";

function OwnerProductImageAddTrigger({
  fileInputId,
  disabled,
  ariaLabel,
  hint,
}: {
  fileInputId: string;
  disabled: boolean;
  ariaLabel: string;
  hint: string;
}) {
  return (
    <label
      htmlFor={fileInputId}
      aria-label={ariaLabel}
      className={`flex min-h-11 w-full cursor-pointer flex-row items-center justify-center gap-1.5 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 active:bg-sam-app ${
        disabled ? "pointer-events-none opacity-40" : ""
      }`}
    >
      <Camera className={OWNER_PRODUCT_IMAGE_ADD_CAMERA_ICON_CLASS} strokeWidth={2} aria-hidden />
      <span className="sam-text-xxs font-medium leading-none text-[#8C8C8C]">{hint}</span>
    </label>
  );
}

/** 본문 `px-2` 상쇄 → 카드 내 가로 꽉 참 */
const bleedFullWidth = "-mx-2 w-[calc(100%+1rem)]";

/**
 * 메뉴 목록 썸네일 참고 88px — 편집 스트립만 가로·세로 10% 축소(오너 UI).
 */
const STRIP_THUMB_PX = Math.round(88 * 0.9);

const MENU_LIST_THUMB_ROUNDED = "rounded-[10px]";

const stripScrollClass =
  [
    "flex max-w-none flex-nowrap items-start justify-start gap-0.5 overflow-x-auto overflow-y-visible overscroll-x-contain",
    "border-b border-[#F1F1F1] bg-white px-4 py-2",
    "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
  ].join(" ");

const SortableStripThumb = memo(function SortableStripThumb({
  slot,
  previewSrc,
  isRepresentative,
  disabled,
  onRemove,
  onSelectAsRep,
  onImagePointerDown,
  onImagePointerUp,
  onImagePointerCancel,
}: {
  slot: OwnerProductImageSlot;
  previewSrc: string;
  isRepresentative: boolean;
  disabled: boolean;
  onRemove: (id: string) => void;
  onSelectAsRep: (id: string) => void;
  onImagePointerDown: (e: React.PointerEvent) => void;
  onImagePointerUp: (e: React.PointerEvent) => void;
  onImagePointerCancel: (e: React.PointerEvent) => void;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 5 : undefined,
  } as const;

  const thumbBgStyle =
    previewSrc.trim() !== ""
      ? ({
          backgroundImage: `url(${JSON.stringify(previewSrc)})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        } as const)
      : undefined;

  const stripPx = STRIP_THUMB_PX;
  const liMergedStyle = { ...style, width: stripPx, height: stripPx } as const;
  const buttonBoxStyle = (
    thumbBgStyle
      ? { ...thumbBgStyle, width: stripPx, height: stripPx, boxSizing: "border-box" as const }
      : { width: stripPx, height: stripPx, boxSizing: "border-box" as const }
  ) satisfies CSSProperties;

  return (
    <li
      ref={setNodeRef}
      style={liMergedStyle}
      className={`relative shrink-0 flex-none snap-start overflow-visible ${
        isDragging ? "z-10 opacity-95 shadow-lg ring-2 ring-signature/40" : ""
      }`}
    >
      {/** 목록 88px 기준 편집 스트립만 10% 축소 + 배경 cover 로 틀 고정 */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelectAsRep(slot.id)}
        style={buttonBoxStyle}
        className={`relative box-border block shrink-0 touch-manipulation overflow-hidden bg-neutral-100 p-0 outline-none focus-visible:ring-2 focus-visible:ring-signature focus-visible:ring-offset-0 disabled:opacity-50 ${MENU_LIST_THUMB_ROUNDED} ${
          isRepresentative ? "ring-2 ring-inset ring-signature" : "ring-1 ring-inset ring-black/10"
        }`}
        onPointerDown={onImagePointerDown}
        onPointerUp={onImagePointerUp}
        onPointerCancel={onImagePointerCancel}
        onPointerLeave={onImagePointerUp}
        aria-label={isRepresentative ? t("business_phase7_400") : t("business_phase7_399")}
      >
        {previewSrc.trim() === "" ? (
          <span className="flex h-full w-full items-center justify-center sam-text-xxs text-neutral-400">…</span>
        ) : null}
        {isRepresentative ? (
          <span className="pointer-events-none absolute bottom-1 left-1 z-[1] rounded-[3px] bg-black/75 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow">
            {t("business_phase7_398")}
          </span>
        ) : null}
      </button>
      <div
        {...listeners}
        {...attributes}
        style={{ touchAction: "none" }}
        aria-label={t("business_phase7_169")}
        className={`pointer-events-auto absolute left-0 top-0 z-20 flex h-8 w-8 touch-none items-start justify-start rounded-br-md bg-gradient-to-br from-black/55 to-transparent p-0.5 ${
          disabled ? "cursor-not-allowed opacity-40" : "cursor-grab active:cursor-grabbing"
        }`}
      >
        <span className="mt-0.5 flex flex-col gap-px opacity-90">
          <span className="block h-0.5 w-3.5 rounded-full bg-white shadow-sm" />
          <span className="block h-0.5 w-3.5 rounded-full bg-white shadow-sm" />
          <span className="block h-0.5 w-3.5 rounded-full bg-white shadow-sm" />
        </span>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(slot.id);
        }}
        className="pointer-events-auto absolute right-0 top-0 z-20 flex h-8 w-8 items-start justify-end p-0.5 text-white disabled:opacity-40"
        aria-label={t("common_delete")}
      >
        <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-black/60 text-lg font-light leading-none shadow-sm backdrop-blur-[2px]">
          <span aria-hidden>×</span>
        </span>
      </button>
    </li>
  );
});

export type OwnerProductImagesBlockProps = {
  slots: OwnerProductImageSlot[];
  onSlotsChange: (
    next: OwnerProductImageSlot[] | ((prev: OwnerProductImageSlot[]) => OwnerProductImageSlot[])
  ) => void;
  /** null 이면 목록의 첫 번째 이미지가 대표 */
  representativeSlotId: string | null;
  onRepresentativeChange: (id: string | null) => void;
  disabled?: boolean;
  onClientError: (message: string | null) => void;
};

export function OwnerProductImagesBlock({
  slots,
  onSlotsChange,
  representativeSlotId,
  onRepresentativeChange,
  disabled = false,
  onClientError,
}: OwnerProductImagesBlockProps) {
  const { t } = useI18n();
  const fileInputId = useId();
  const previewBlobByIdRef = useRef<Map<string, string>>(new Map());
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressSlotIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const m = previewBlobByIdRef.current;
    const fileSlotIds = new Set(
      slots.filter((s) => s.type === "file" && s.file).map((s) => s.id)
    );
    for (const [id, url] of [...m.entries()]) {
      if (!fileSlotIds.has(id)) {
        URL.revokeObjectURL(url);
        m.delete(id);
      }
    }
    for (const s of slots) {
      if (s.type === "file" && s.file && !m.has(s.id)) {
        m.set(s.id, URL.createObjectURL(s.file));
      }
    }
    setPreviewEpoch((n) => n + 1);
  }, [slots]);

  useEffect(
    () => () => {
      for (const url of previewBlobByIdRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      previewBlobByIdRef.current.clear();
    },
    []
  );

  const effectiveRepId = useMemo(() => {
    if (!slots.length) return null;
    if (representativeSlotId && slots.some((s) => s.id === representativeSlotId)) {
      return representativeSlotId;
    }
    return slots[0]!.id;
  }, [slots, representativeSlotId]);

  const repSlot = useMemo(
    () => (effectiveRepId ? slots.find((s) => s.id === effectiveRepId) ?? null : null),
    [slots, effectiveRepId]
  );

  const getPreviewSrc = useCallback(
    (s: OwnerProductImageSlot) => {
      if (s.type === "url" && s.url?.trim()) return s.url.trim();
      if (s.type === "file" && s.file) return previewBlobByIdRef.current.get(s.id) ?? "";
      return "";
    },
    [previewEpoch, slots]
  );

  const heroSrc = repSlot ? getPreviewSrc(repSlot) : "";

  const heroBgStyle = useMemo((): CSSProperties | undefined => {
    if (!heroSrc.trim()) return undefined;
    return {
      backgroundImage: `url(${JSON.stringify(heroSrc)})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  }, [heroSrc]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const ids = useMemo(() => slots.map((s) => s.id), [slots]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = slots.findIndex((x) => x.id === String(active.id));
      const newIndex = slots.findIndex((x) => x.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      onSlotsChange(arrayMove(slots, oldIndex, newIndex));
    },
    [slots, onSlotsChange]
  );

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressSlotIdRef.current = null;
  }, []);

  const onImagePointerDown = useCallback(
    (slotId: string) => (e: React.PointerEvent) => {
      if (disabled) return;
      if (e.button !== 0) return;
      clearLongPressTimer();
      longPressSlotIdRef.current = slotId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        if (longPressSlotIdRef.current === slotId) {
          onRepresentativeChange(slotId);
        }
        longPressSlotIdRef.current = null;
      }, LONG_PRESS_MS);
    },
    [clearLongPressTimer, disabled, onRepresentativeChange]
  );

  const onImagePointerUp = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const onPickFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files ? Array.from(e.target.files) : [];
      e.target.value = "";
      onClientError(null);
      if (list.length === 0) return;
      void (async () => {
        const accepted: File[] = [];
        for (const file of list) {
          if (accepted.length + slots.length >= OWNER_PRODUCT_IMAGE_SLOTS_MAX) break;
          const v = validateOwnerProductImageFileForUpload(file);
          if (!v.ok) {
            onClientError(v.message);
            return;
          }
          const dims = await readImageFileDimensions(file);
          if (!dims) {
            onClientError(t("business_phase7_487"));
            return;
          }
          const dimCheck = validateOwnerProductImagePixelDimensions(dims.width, dims.height);
          if (!dimCheck.ok) {
            onClientError(
              dimCheck.error === "image_dimension_too_large"
                ? t("business_phase7_488", { v1: OWNER_PRODUCT_IMAGE_MAX_EDGE_PX })
                : t("business_phase7_487")
            );
            return;
          }
          accepted.push(file);
        }
        if (accepted.length === 0) return;
        onSlotsChange((prev) => {
          const next = [...prev];
          for (const file of accepted) {
            if (next.length >= OWNER_PRODUCT_IMAGE_SLOTS_MAX) break;
            next.push({ id: newSlotId(), type: "file", file });
          }
          return next;
        });
      })();
    },
    [onClientError, onSlotsChange, slots.length, t]
  );

  const removeSlot = useCallback(
    (id: string) => {
      onSlotsChange((prev) => prev.filter((s) => s.id !== id));
      if (representativeSlotId === id) {
        onRepresentativeChange(null);
      }
    },
    [onRepresentativeChange, onSlotsChange, representativeSlotId]
  );

  const addDisabled = disabled || slots.length >= OWNER_PRODUCT_IMAGE_SLOTS_MAX;

  return (
    <div className="flex flex-col gap-1">
      <label className={`${OWNER_STORE_PROFILE_FIELD_LABEL_CLASS} mb-0`}>{t("business_phase7_153")}</label>

      <div className="relative">
        <OwnerProductImageAddTrigger
          fileInputId={fileInputId}
          disabled={addDisabled}
          ariaLabel={t("business_phase7_308")}
          hint={t("business_phase7_489")}
        />
        <input
          id={fileInputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          disabled={addDisabled}
          onChange={onPickFiles}
        />
      </div>

      {slots.length > 0 ? (
        <>
          <div
            className={`${bleedFullWidth} overflow-hidden rounded-none border-y border-sam-border-soft bg-sam-surface`}
          >
            <div
              className="relative aspect-square w-full overflow-hidden bg-sam-surface-muted"
              style={heroBgStyle}
            >
              {!heroSrc.trim() ? (
                <div className="flex h-full min-h-[8rem] w-full items-center justify-center sam-text-body-secondary text-sam-muted">
                  {t("common_loading")}
                </div>
              ) : null}
              <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/70 px-2.5 py-1 sam-text-xxs font-semibold text-white">
                {t("common_representative")}
              </span>
            </div>
          </div>

          <div className={`${bleedFullWidth} min-w-0`}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
                <ul
                  className={`${stripScrollClass} ${
                    disabled ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  {slots.map((slot) => (
                    <SortableStripThumb
                      key={slot.id}
                      slot={slot}
                      previewSrc={getPreviewSrc(slot)}
                      isRepresentative={effectiveRepId === slot.id}
                      disabled={!!disabled}
                      onRemove={removeSlot}
                      onSelectAsRep={(id) => onRepresentativeChange(id)}
                      onImagePointerDown={onImagePointerDown(slot.id)}
                      onImagePointerUp={onImagePointerUp}
                      onImagePointerCancel={onImagePointerUp}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </div>
        </>
      ) : null}
    </div>
  );
}
