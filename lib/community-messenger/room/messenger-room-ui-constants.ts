/** 이전 말풍선과의 시간 간격이 이 값을 넘으면 프로필·꼬리 말풍선 다시 표시 (Viber 스타일, 기본 5분) */
export const CM_CLUSTER_GAP_MS = 5 * 60 * 1000;

/**
 * 방을 실제로 연 직후 읽음·배지가 즉시 풀려야 하므로 기본 지연을 두지 않는다.
 * (`useMessengerRoomOpenMarkReadEffect` 는 여전히 가시성/포커스/최신 말풍선 노출 조건은 유지)
 */
export const CM_ROOM_BOTTOM_READ_DWELL_MS = 0;

/** 최신 말풍선 행이 스크롤 루트 안에서 이만큼 이상(높이 비율) 보일 때만 “읽음 후보” */
export const CM_READ_LATEST_MESSAGE_MIN_VISIBLE_RATIO = 0.12;
