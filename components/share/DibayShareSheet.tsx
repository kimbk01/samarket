"use client";

/**
 * DIBAY 통합 공유 시트 (S2) — 기기 공유 창을 바로 열 수 없을 때만 뜨는 대체 시트.
 * 공유 버튼은 `useDibayShareSheet().openShare` 를 부르고, 그 훅이 기기 공유 창을 먼저 연다(Owner 2026-11-14 §N-3).
 * 이 시트가 뜨는 경우 = 데스크톱 웹 등 기기 공유 창 없음 · 기기 공유 실패 · 운영 주소 아님.
 * 설계: docs/audit/dibay-unified-share-audit-design-2026-11-14.md §D · §I-1 · 시안 1절.
 *
 * - 시트 = 오버레이 SSOT `DibayBottomSheet`(기기 맨 아래·안전 영역) + `DibaySheetHeader` + `DibayQuickActions`.
 * - 맨 위 = 무엇을 공유하는지 미리보기(제목·부제·사진).
 * - 칸: 「다른 앱으로 공유」(앱이거나 Web Share 지원 + 운영 주소일 때만) · 「링크 복사」(운영 주소일 때만).
 *   「친구에게 보내기」(S6)·「카카오톡」(G-2 키 검증 전)은 이 단계에 없다.
 * - 결과 계약(§I-1): 취소 = 아무 것도 안 함 · 기기 공유로 넘김 = 시트 닫기만(전달 확정 문구 없음) ·
 *   실패 = 「공유하지 못했어요」 + 시트 유지 · 복사 = 직접 누를 때만.
 */
import { Link2, Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { DibayBottomSheet, DibayQuickActions, DibaySheetHeader } from "@/components/ui/dibay-overlay";
import { DibayToast } from "@/components/ui/dibay-overlay/DibayToast";
import { DIBAY_TOAST_MS } from "@/lib/ui/dibay-overlay-contract";
import { canUsePlatformShare, shareViaPlatform, type ShareSheetEvent } from "@/lib/share/platform-share";
import { copyShareLink } from "@/lib/share/share-clipboard";
import { isProductionShareContext } from "@/lib/share/share-url";

export type DibayShareSheetEvent = ShareSheetEvent;

export type DibayShareSheetProps = {
  open: boolean;
  onClose: () => void;
  /** `buildShareUrl` 결과 — null 이면 공유 칸을 그리지 않는다 */
  url: string | null;
  /** 미리보기 제목(= 링크 미리보기 제목과 같은 값) */
  previewTitle: string;
  previewSubtitle?: string;
  previewImageUrl?: string | null;
  /** 기기 공유에 같이 넘길 짧은 글 (없으면 제목만) */
  shareText?: string;
  /** 분석·로그용 (선택) */
  onEvent?: (e: DibayShareSheetEvent) => void;
};

export function DibayShareSheet({
  open,
  onClose,
  url,
  previewTitle,
  previewSubtitle,
  previewImageUrl,
  shareText,
  onEvent,
}: DibayShareSheetProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  /** 시트가 열릴 때 판단 — 운영 주소 밖(로컬·과거 배포 주소)이면 바깥 공유 칸 없음 (§I-5) */
  const { nativeOk, copyOk } = useMemo(() => {
    if (!open || !mounted || !url) return { nativeOk: false, copyOk: false };
    const prod = isProductionShareContext();
    return { nativeOk: prod && canUsePlatformShare(), copyOk: prod };
  }, [open, mounted, url]);

  const showToast = useCallback((message: string, tone: "success" | "error") => {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      setToast(null);
    }, DIBAY_TOAST_MS);
  }, []);

  const run = useCallback(async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const onNative = useCallback(() => {
    if (!url) return;
    void run(async () => {
      const result = await shareViaPlatform({ title: previewTitle, text: shareText, url });
      onEvent?.({ channel: "native", result });
      if (result === "handed_off") {
        onClose();
        return;
      }
      if (result === "cancelled") return;
      showToast(t("share_toast_failed"), "error");
    });
  }, [onClose, onEvent, previewTitle, run, shareText, showToast, t, url]);

  const onCopy = useCallback(() => {
    if (!url) return;
    void run(async () => {
      const result = await copyShareLink(url);
      onEvent?.({ channel: "copy", result });
      if (result === "copied") {
        showToast(t("share_toast_copied"), "success");
        onClose();
        return;
      }
      showToast(t("share_toast_copy_failed"), "error");
    });
  }, [onClose, onEvent, run, showToast, t, url]);

  const items = [
    ...(nativeOk
      ? [
          {
            key: "native",
            icon: <Share2 aria-hidden />,
            label: t("share_option_native"),
            loading: busy,
            onClick: onNative,
          },
        ]
      : []),
    ...(copyOk
      ? [
          {
            key: "copy",
            icon: <Link2 aria-hidden />,
            label: t("share_option_copy"),
            disabled: busy,
            onClick: onCopy,
          },
        ]
      : []),
  ];

  const toastNode =
    mounted && toast && typeof document !== "undefined"
      ? createPortal(<DibayToast message={toast.message} tone={toast.tone} />, document.body)
      : null;

  return (
    <>
      <DibayBottomSheet open={open} onClose={onClose} ariaLabel={t("share_sheet_title")}>
        <DibaySheetHeader title={t("share_sheet_title")} onClose={onClose} closeLabel={t("common_close")} />
        <div
          className="flex items-center gap-3 rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] p-2.5"
          data-dibay-share-preview=""
        >
          {previewImageUrl ? (
            <SamarketThumbnail src={previewImageUrl} alt="" size={52} roundedClassName="rounded-[8px]" />
          ) : null}
          <div className="grid min-w-0 flex-1">
            <span className="truncate text-[15px] font-semibold text-[color:var(--overlay-text-primary)]">
              {previewTitle}
            </span>
            {previewSubtitle ? (
              <span className="truncate text-[12px] text-[color:var(--overlay-text-secondary)]">{previewSubtitle}</span>
            ) : null}
          </div>
        </div>
        {items.length > 0 ? (
          <DibayQuickActions items={items} />
        ) : (
          <p className="py-6 text-center text-[14px] text-[color:var(--overlay-text-secondary)]">
            {t("share_no_option")}
          </p>
        )}
      </DibayBottomSheet>
      {toastNode}
    </>
  );
}
