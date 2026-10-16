"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import { messengerSelectedOriginalUrls } from "@/lib/community-messenger/attachment/messenger-photo-save-menu";
import {
  useMessengerPhotoSelectSaveStore,
  type MessengerPhotoSelectSaveRequest,
} from "@/lib/community-messenger/stores/messenger-photo-select-save-store";
import { saveMessengerPhotosWithFeedback } from "@/components/community-messenger/room/messenger-photo-save-feedback";

function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

/**
 * 「사진 선택해서 저장」 — 방 위 하단 시트(portal). 선택한 원본만 앨범 순서로 저장하고 방에 머문다.
 * 열림 상태는 `messenger-photo-select-save-store` (길게 누르기 메뉴가 닫힌 뒤에도 유지).
 * 방 오버레이(`CommunityMessengerRoomPhase2MessageOverlays`)에 한 번 마운트한다.
 */
export function MessengerPhotoSelectSaveSheet() {
  const request = useMessengerPhotoSelectSaveStore((s) => s.request);
  const close = useMessengerPhotoSelectSaveStore((s) => s.close);
  /** 방을 떠나면(오버레이 언마운트) 시트도 닫는다. */
  useEffect(() => () => useMessengerPhotoSelectSaveStore.getState().close(), []);
  if (!request || typeof document === "undefined") return null;
  return createPortal(
    <MessengerPhotoSelectSaveSheetPanel key={request.messageId} request={request} onClose={close} />,
    document.body
  );
}

function MessengerPhotoSelectSaveSheetPanel({
  request,
  onClose,
}: {
  request: MessengerPhotoSelectSaveRequest;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { slots, thumbs, preselectIndex } = request;
  const selectable = useMemo(
    () => slots.map((u, i) => (isHttpUrl(u) ? i : -1)).filter((i) => i >= 0),
    [slots]
  );
  const [selected, setSelected] = useState<Set<number>>(() =>
    preselectIndex != null && selectable.includes(preselectIndex) ? new Set([preselectIndex]) : new Set()
  );
  const allSelected = selectable.length > 0 && selectable.every((i) => selected.has(i));
  const selectedUrls = messengerSelectedOriginalUrls(slots, selected);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const save = () => {
    if (selectedUrls.length === 0) return;
    const urls = selectedUrls;
    onClose();
    void saveMessengerPhotosWithFeedback(urls, { t });
  };

  return (
    <div className="fixed inset-0 z-[230] flex flex-col justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/45"
        aria-label={t("nav_close")}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("cm_ui_photo_select_save_title")}
        className="relative z-[1] flex max-h-[80%] w-full flex-col overflow-hidden rounded-t-ui-rect bg-sam-surface pb-[max(12px,var(--safe-bottom))] text-sam-fg shadow-sam-elevated"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-sam-border px-4 py-3">
          <h2 className={`${Sam.text.cardTitle} min-w-0 truncate`}>{t("cm_ui_photo_select_save_title")}</h2>
          <button
            type="button"
            disabled={selectable.length === 0}
            onClick={() => setSelected(allSelected ? new Set() : new Set(selectable))}
            className={`${Sam.text.bodySecondary} shrink-0 rounded-ui-rect px-2 py-1 font-semibold text-sam-primary disabled:opacity-40`}
          >
            {allSelected ? t("cm_ui_photo_deselect_all") : t("cm_ui_photo_select_all")}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          <ul className="grid grid-cols-3 gap-1.5">
            {slots.map((slot, i) => {
              const disabled = !isHttpUrl(slot);
              const checked = selected.has(i);
              const thumb = thumbs[i] || slot;
              return (
                <li key={i}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    aria-label={t("cm_ui_photo_select_item_aria", { index: i + 1 })}
                    disabled={disabled}
                    onClick={() => toggle(i)}
                    className={`relative block aspect-square w-full overflow-hidden rounded-ui-rect bg-sam-surface-muted disabled:opacity-40 ${
                      checked ? "ring-2 ring-sam-primary ring-offset-1" : ""
                    }`}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                    ) : null}
                    <span
                      aria-hidden
                      className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 sam-text-helper font-bold ${
                        checked ? "border-sam-primary bg-sam-primary text-white" : "border-white bg-black/25 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="shrink-0 px-4 pt-2">
          <button
            type="button"
            disabled={selectedUrls.length === 0}
            onClick={save}
            className={`${Sam.btn.primaryCombo} ${Sam.btn.block} rounded-ui-rect disabled:opacity-50`}
          >
            {t("cm_ui_photo_save_selected", { count: selectedUrls.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
