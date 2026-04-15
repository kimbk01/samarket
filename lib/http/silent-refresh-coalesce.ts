import type { MutableRefObject } from "react";

/**
 * 사일런트 갱신이 겹칠 때 **한 번에 한 라운드**만 실행하고, 진행 중 추가 요청은
 * `againRef` 로 표시해 현재 라운드 종료 직후 **정확히 한 번** 재실행한다.
 *
 * 메신저 홈 `refresh(true)` · 방 `createMessengerRoomBootstrapRefresh(...)(true)` 등 동일 계약.
 */
export function tryEnterSilentRefreshRound(
  silent: boolean,
  busyRef: MutableRefObject<boolean>,
  againRef: MutableRefObject<boolean>
): boolean {
  if (!silent) return true;
  if (busyRef.current) {
    againRef.current = true;
    return false;
  }
  busyRef.current = true;
  return true;
}

export function finishSilentRefreshRound(
  silent: boolean,
  busyRef: MutableRefObject<boolean>,
  againRef: MutableRefObject<boolean>,
  rerun: () => void
): void {
  if (!silent) return;
  busyRef.current = false;
  if (againRef.current) {
    againRef.current = false;
    rerun();
  }
}
