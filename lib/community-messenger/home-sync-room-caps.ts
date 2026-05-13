/**
 * 홈 sync 방 목록 상한 — `service.ts` 와 분리해 라우트·번들이 거대 모듈을 **정적으로** 끌어오지 않게 한다.
 * 값 변경 시 `service` 의 `listCommunityMessengerMyChatsAndGroups` 상한 로직과 일치해야 한다.
 */

/** home-sync RPC·목록 상한 상단 캡 (critical/full 공통 최대) */
export const COMMUNITY_MESSENGER_HOME_SYNC_ROOM_CAP_HARD_MAX = 30;
/** 홈 silent `GET ...?tier=critical` — 최근 활동 방만 (RPC LIMIT) */
export const COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP = 20;
/** 홈 silent `tier=full` 보강 — 최근 상위만 */
export const COMMUNITY_MESSENGER_HOME_SYNC_FULL_ROOM_CAP = 30;
