/** 이전 말풍선과의 시간 간격이 이 값을 넘으면 프로필·꼬리 말풍선 다시 표시 (Viber 스타일, 기본 5분) */
export const CM_CLUSTER_GAP_MS = 5 * 60 * 1000;

/**
 * 방 하단(최신 말풍선)에 머문 뒤 서버 `mark_read` 를 보내기까지의 최소 체류 시간.
 * 권장 300~800ms — viewport 가시 + 기타 조건이 연속 유지된 시간으로 본다.
 */
export const CM_ROOM_BOTTOM_READ_DWELL_MS = 550;

/** 최신 말풍선 행이 스크롤 루트 안에서 이만큼 이상(높이 비율) 보일 때만 “읽음 후보” */
export const CM_READ_LATEST_MESSAGE_MIN_VISIBLE_RATIO = 0.12;
