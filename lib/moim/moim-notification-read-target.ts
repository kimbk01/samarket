/**
 * 모임 알림 목적지 경로 (모임 R2 N-06 · 설계 §7 「대상 화면에 들어갔을 때 읽음」).
 * 알림 `link_url`(`moimPaths`)과 같은 형식만 — 읽음 API 와 화면 훅이 같은 정의를 쓴다.
 */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MOIM_READ_TARGET_PATH_RE = new RegExp(
  `^/moim(?:/invites|/${UUID}(?:/posts/${UUID}|/schedules/${UUID}|/manage/(?:requests|members))?)?$`,
  "i"
);

export function isMoimNotificationReadTargetPath(path: string): boolean {
  return MOIM_READ_TARGET_PATH_RE.test(path);
}
