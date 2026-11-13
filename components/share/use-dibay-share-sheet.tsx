"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { canUsePlatformShare, shareViaPlatform } from "@/lib/share/platform-share";
import { isProductionShareContext } from "@/lib/share/share-url";
import { DibayShareSheet, type DibayShareSheetProps } from "./DibayShareSheet";

export type DibayShareSheetConfig = Omit<DibayShareSheetProps, "open" | "onClose">;

/**
 * 통합 공유 실행 훅 — 모든 「공유」 버튼이 이 함수 하나로 동작한다.
 * Owner 2026-11-14: 「공유되는 기기의 저장되어진 SNS 가 모두 나오게」 →
 *   설계 `docs/audit/dibay-unified-share-audit-design-2026-11-14.md` §N-3.
 *
 * `openShare(config)` 누름 1번 =
 * - 운영 주소 + (앱 또는 브라우저 공유 지원) → **기기 공유 창을 바로 연다**(설치된 SNS·복사가 OS 목록에 모두 나옴).
 *   취소·넘김 = 아무 것도 안 함. 실패(예: 브라우저가 공유를 막음) → 아래 시트를 열어 다시 누르거나 복사하게 한다.
 * - 기기 공유 창이 없음(데스크톱 웹 등) → 시트(「링크 복사」 한 칸).
 * - 운영 주소 아님(로컬·과거 배포 주소) → 시트(「공유할 수 없어요」 안내 — 시트가 칸을 숨김, §I-5).
 * `shareSheet` 는 화면 아무 곳에 한 번 그린다.
 */
export function useDibayShareSheet(): {
  openShare: (config: DibayShareSheetConfig) => void;
  shareSheet: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<DibayShareSheetConfig | null>(null);
  const busyRef = useRef(false);

  const openSheet = useCallback((next: DibayShareSheetConfig) => {
    setConfig(next);
    setOpen(true);
  }, []);

  const openShare = useCallback(
    (next: DibayShareSheetConfig) => {
      if (busyRef.current) return;
      const url = next.url;
      if (!url || !isProductionShareContext() || !canUsePlatformShare()) {
        openSheet(next);
        return;
      }
      busyRef.current = true;
      void shareViaPlatform({ title: next.previewTitle, text: next.shareText, url })
        .then((result) => {
          next.onEvent?.({ channel: "native", result });
          if (result === "failed" || result === "unavailable") openSheet(next);
        })
        .finally(() => {
          busyRef.current = false;
        });
    },
    [openSheet]
  );

  const onClose = useCallback(() => setOpen(false), []);

  const shareSheet = config ? <DibayShareSheet {...config} open={open} onClose={onClose} /> : null;

  return { openShare, shareSheet };
}
