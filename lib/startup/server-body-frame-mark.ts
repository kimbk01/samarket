/**
 * 설계 H1 (Owner 「Approve design H」 2026-11-18 · docs/audit/app-entry-device-fail-root-cause-design-2026-11-17.md §11·§12).
 *
 * 서버 본문 끝에서 문서 해석 중에 도는 아주 작은 인라인 스크립트 — 「서버 본문이 렌더러 프레임에 들어갔다」는 표시를
 * hydration 스크립트보다 먼저 남긴다.
 * - 실측(샤오미 Perfetto p1): 본문 그림 1243ms · 렌더러 프레임 1287~1633ms → 그 뒤 hydration 스크립트가 1681~2732ms
 *   연달아 실행돼 프레임이 없었다. 번들 안의 P3 는 그 뒤(2761ms)에야 해제했다.
 * - 다음 프레임 2번 뒤 = 본문이 든 프레임의 커밋이 끝났다. 표시만 남기고 해제는 하지 않는다 — 해제 판단(알림 목적지 ·
 *   직전 화면 복원 · 인트로)은 번들의 `releaseNativeSplashAtServerBodyFrame` 하나가 한다(중복 판단 없음).
 * - 네이티브 새 해제(`DibayBootBridge.dismissSplashPainted`, Android 71~)가 있는 앱에서만 돈다. 그 밖(웹·iOS·구 설치 앱)은 무동작.
 */

/** 표시 — 본문이 든 렌더러 프레임이 지나갔다 */
export const SERVER_BODY_FRAME_MARK_KEY = "__DIBAY_SERVER_BODY_FRAME__";
/** 표시가 생길 때 부를 함수(번들이 먼저 등록해 둔 경우) */
export const SERVER_BODY_FRAME_LISTENER_KEY = "__dibayServerBodyFrame";

export const SERVER_BODY_FRAME_MARK_SCRIPT = `(function(){try{var w=window,b=w.DibayBootBridge;if(!b||typeof b.dismissSplashPainted!=="function"||typeof w.requestAnimationFrame!=="function")return;w.requestAnimationFrame(function(){w.requestAnimationFrame(function(){w.${SERVER_BODY_FRAME_MARK_KEY}=true;var f=w.${SERVER_BODY_FRAME_LISTENER_KEY};if(typeof f==="function"){try{f()}catch(e){}}})})}catch(e){}})();`;

type MarkWindow = Window & {
  __DIBAY_SERVER_BODY_FRAME__?: boolean;
  __dibayServerBodyFrame?: () => void;
};

export function hasServerBodyFrameMark(): boolean {
  return typeof window !== "undefined" && (window as MarkWindow).__DIBAY_SERVER_BODY_FRAME__ === true;
}

/** 표시가 아직 없을 때 — 표시가 생기면 부른다(1회 덮어쓰기 · 마지막 등록만 유효). */
export function onServerBodyFrameMark(run: () => void): void {
  if (typeof window === "undefined") return;
  (window as MarkWindow).__dibayServerBodyFrame = run;
}
