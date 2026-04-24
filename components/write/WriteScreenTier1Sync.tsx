"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppModal } from "@/components/app-shell/AppModal";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { AppCloseIcon } from "@/components/navigation/AppBackButton";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import { MyHubHeaderActions } from "@/components/my/MyHubHeaderActions";

/**
 * 글쓰기 화면 1단
 * - `global`: 전역 `RegionBar` 슬롯(`MainTier1Extras`)에 동기화
 * - `embedded`: `/write` 시트 등 — DOM 안에 1단을 직접 렌더(닫기 시 본문과 함께 transform 가능)
 */
export function WriteScreenTier1Sync({
  title,
  backHref,
  subtitle,
  onRequestClose,
  tier1Mode = "global",
}: {
  title: string;
  backHref: string;
  subtitle?: string;
  onRequestClose?: () => void;
  tier1Mode?: "global" | "embedded";
}) {
  const setExtras = useSetMainTier1ExtrasOptional();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const openConfirm = useCallback(() => setConfirmOpen(true), []);

  const handleConfirmLeave = useCallback(() => {
    setConfirmOpen(false);
    if (onRequestClose) {
      onRequestClose();
      return;
    }
    router.push(backHref);
  }, [router, backHref, onRequestClose]);

  useLayoutEffect(() => {
    if (tier1Mode === "embedded") return;
    if (!setExtras) return;
    setExtras({
      tier1: {
        titleText: title,
        subtitle: subtitle?.trim() ? subtitle.trim() : undefined,
        leftSlot: (
          <button
            type="button"
            onClick={onRequestClose ?? openConfirm}
            aria-label="닫기"
            className="sam-header-action flex h-10 w-10 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center text-sam-fg"
          >
            <AppCloseIcon />
          </button>
        ),
        showHubQuickActions: true,
      },
    });
    return () => setExtras(null);
  }, [setExtras, title, subtitle, backHref, openConfirm, onRequestClose, tier1Mode]);

  const subtitleText = subtitle?.trim() ?? "";

  const embeddedHeader = (
    <header className="sticky top-0 z-30 w-full shrink-0 overflow-x-hidden border-b border-sam-border bg-sam-surface/95 backdrop-blur-[10px]">
      <div className={`flex h-12 min-w-0 items-center gap-2 overflow-hidden ${APP_MAIN_HEADER_INNER_CLASS}`}>
        <div className="flex w-auto min-w-[44px] max-w-[min(200px,50vw)] shrink-0 items-center justify-start">
          <button
            type="button"
            onClick={onRequestClose ?? openConfirm}
            aria-label="닫기"
            className="sam-header-action flex h-10 w-10 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center text-sam-fg"
          >
            <AppCloseIcon />
          </button>
        </div>
        <div className="min-w-0 flex-1 overflow-hidden px-1 text-center">
          <h1 className="flex min-w-0 w-full flex-col items-center justify-center overflow-hidden text-sam-fg">
            <span className="truncate sam-text-section-title font-semibold">{title}</span>
            {subtitleText ? (
              <p className="truncate sam-text-xxs leading-tight text-sam-muted">{subtitleText}</p>
            ) : null}
          </h1>
        </div>
        <div className="flex min-w-[44px] shrink-0 items-center justify-end">
          <MyHubHeaderActions />
        </div>
      </div>
    </header>
  );

  return (
    <>
      {tier1Mode === "embedded" ? embeddedHeader : null}
      {!onRequestClose ? (
        <AppModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="글쓰기 취소"
          className="sm:max-w-[24rem] sm:rounded-sam-md sm:border-b"
          footer={
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmOpen(false)} className="sam-btn sam-btn--outline flex-1">
                계속 쓰기
              </button>
              <button type="button" onClick={handleConfirmLeave} className="sam-btn sam-btn--primary flex-1">
                취소
              </button>
            </div>
          }
        >
          <p className="sam-text-body text-sam-fg">입력한 내용이 저장되지 않습니다.</p>
        </AppModal>
      ) : null}
    </>
  );
}
