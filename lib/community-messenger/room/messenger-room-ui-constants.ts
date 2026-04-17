/** 이전 말풍선과의 시간 간격이 이 값을 넘으면 프로필·꼬리 말풍선 다시 표시 (Viber 스타일, 기본 5분) */
export const CM_CLUSTER_GAP_MS = 5 * 60 * 1000;

/**
 * 방 하단(최신 말풍선)에 머문 뒤 서버 `mark_read` 를 보내기까지의 최소 체류 시간.
 * 스크롤만 닿았다가 바로 나가면 읽음·상대 읽음 표시가 오르지 않도록 한다.
 */
export const CM_ROOM_BOTTOM_READ_DWELL_MS = 2000;
