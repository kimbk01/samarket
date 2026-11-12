import { useEffect } from "react";
import { registerOpenOverlay } from "@/lib/ui/open-overlay-registry";

/**
 * 재감사 R3 (G-8 마무리): `DibayOverlayRoot` 를 쓰지 않는 자체 시트·대화상자·전체 화면 창도 열려 있는 동안
 * 「열린 창」으로 등록한다 — 팝업 광고가 그 위에 겹치지 않게(`GlobalPopupHost` 가 수를 읽는다).
 * `open` 이 true 인 동안만 센다. 항상 마운트된 창(서랍 등)은 열림 상태를 넘긴다.
 */
export function useRegisterOpenOverlay(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    return registerOpenOverlay({ ad: false });
  }, [open]);
}
