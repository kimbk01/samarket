/**
 * 방 스냅샷으로 최소화(detached) 통화 정리를 판단해도 되는지.
 * - loading 중: 스냅샷의 activeCall 을 아직 모른다.
 * - 서버 스냅샷 미확인(foreground bootstrap 마감 초과): 통화 상태를 모르는 것이지 통화가 없다는 근거가 아니다.
 */
export function canRoomSnapshotDisposeDetachedCall(args: {
  loading: boolean;
  serverSnapshotUnknown: boolean;
}): boolean {
  return !args.loading && !args.serverSnapshotUnknown;
}
