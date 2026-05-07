/** 이전 말풍선과의 시간 간격이 이 값을 넘으면 프로필·꼬리 말풍선 다시 표시 (Viber 스타일, 기본 5분) */
export const CM_CLUSTER_GAP_MS = 5 * 60 * 1000;

/** 최신 말풍선 행이 스크롤 루트 안에서 이만큼 이상(높이 비율) 보일 때만 “읽음 후보” (가상 리스트·작은 말풍선 대비 완화) */
export const CM_READ_LATEST_MESSAGE_MIN_VISIBLE_RATIO = 0.08;

/**
 * `mark_read` 후보 — 스크롤 루트 하단까지 남은 거리(px)가 이 값 이하면 “대화 꼬리를 보고 있다”고 본다.
 * 사용자가 실제로 꼬리를 볼 수 있는 거리만 허용한다.
 */
export const CM_MARK_READ_VIEWPORT_BOTTOM_GAP_PX = 120;

/** 스크롤·레이아웃 연속 변화 시 mark_read(cursor) 배치 — 요청 폭주 방지 */
export const CM_MARK_READ_SCROLL_DEBOUNCE_MS = 350;

/** 타임라인 `@tanstack/react-virtual` — 빠른 스크롤·append 시 빈 틈 완화(10→14) */
export const MESSENGER_TIMELINE_VIRTUAL_OVERSCAN = 14;

/** 초기 행 높이 추정(px). 실제 높이는 `measureElement` 로 보정 */
export const MESSENGER_TIMELINE_VIRTUAL_ESTIMATE_PX = 96;

/**
 * 타임라인 메시지 배열 상한(메모리·클라 diff 비용). DOM은 가상 스크롤로 일정하게 유지.
 * 이전 100은 가상화 전 완충용 — 로드 더 보기·긴 스레드와 함께 쓰이면 상한을 크게 둔다.
 */
export const MESSENGER_TIMELINE_MESSAGES_CAP = 2500;
