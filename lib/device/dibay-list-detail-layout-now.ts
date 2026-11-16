import { peekDibayDeviceClassSession, type DibayDeviceClass } from "@/lib/device/dibay-device-class";
import {
  DIBAY_LIST_DETAIL_SPLIT_MIN_CSS,
  resolveDibayListDetailLayout,
  type DibayListDetailLayout,
} from "@/lib/device/dibay-device-profile";

/**
 * S4 — 지금 이 순간의 한 화면/두 칸 (화면 전환 연출 판정처럼 훅을 쓸 수 없는 순수 경로용).
 * 판정은 훅(`useDibayListDetailLayout`)과 같은 함수·같은 미디어 조건. 서버·시험 환경(창 없음)은 STACK.
 */
export function readDibayListDetailLayoutNow(): DibayListDetailLayout {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "STACK";
  const deviceClass: DibayDeviceClass = peekDibayDeviceClassSession()?.deviceClass ?? "UNKNOWN";
  const wide = window.matchMedia(`(min-width: ${DIBAY_LIST_DETAIL_SPLIT_MIN_CSS}px)`).matches;
  return resolveDibayListDetailLayout({ deviceClass, widthCss: wide ? DIBAY_LIST_DETAIL_SPLIT_MIN_CSS : 0 });
}
