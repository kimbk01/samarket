"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
      {confirmOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-ui-rect bg-white p-4 shadow-lg">
            <p className="text-[15px] text-gray-800">
              글쓰기를 취소할까요? 입력한 내용이 저장되지 않습니다.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-ui-rect border border-gray-200 py-2.5 text-[14px] font-medium text-gray-700"
              >
                계속 쓰기
              </button>
              <button
                type="button"
                onClick={handleConfirmLeave}
                className="flex-1 rounded-ui-rect bg-gray-900 py-2.5 text-[14px] font-medium text-white"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
