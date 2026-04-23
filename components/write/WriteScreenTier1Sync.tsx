"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppModal } from "@/components/app-shell/AppModal";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { AppBackButton } from "@/components/navigation/AppBackButton";

/**
 * 글쓰기 화면: 전역 1단(`RegionBar`) 제목·좌측 뒤로를 설정하고, 기존 `WriteHeader` 2단 바는 쓰지 않는다.
 * 우측 알림·설정은 `showHubQuickActions`로 유지.
 */
export function WriteScreenTier1Sync({
  /** 1단 가운데 전체 문구 (예: `중고거래 · 글쓰기`) */
  title,
  /** 취소 확인 후 이동할 경로 */
  backHref,
  /** 1단 제목 아래 보조 문구(선택) */
  subtitle,
}: {
  title: string;
  backHref: string;
  subtitle?: string;
}) {
  const setExtras = useSetMainTier1ExtrasOptional();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const openConfirm = useCallback(() => setConfirmOpen(true), []);

  const handleConfirmLeave = useCallback(() => {
    setConfirmOpen(false);
    router.push(backHref);
  }, [router, backHref]);

  useLayoutEffect(() => {
    if (!setExtras) return;
    setExtras({
      tier1: {
        titleText: title,
        subtitle: subtitle?.trim() ? subtitle.trim() : undefined,
        leftSlot: <AppBackButton onBack={openConfirm} ariaLabel="이전 화면" />,
        showHubQuickActions: true,
      },
    });
    return () => setExtras(null);
  }, [setExtras, title, subtitle, backHref, openConfirm]);

  return (
    <>
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
    </>
  );
}
