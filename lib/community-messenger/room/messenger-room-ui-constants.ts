/** 이전 말풍선과의 시간 간격이 이 값을 넘으면 프로필·꼬리 말풍선 다시 표시 (Viber 스타일, 기본 5분) */
export const CM_CLUSTER_GAP_MS = 5 * 60 * 1000;

/**
 * 방을 실제로 연 직후 읽음·배지가 즉시 풀려야 하므로 기본 지연을 두지 않는다.
 * (`useMessengerRoomOpenMarkReadEffect` 는 여전히 가시성/포커스/최신 말풍선 노출 조건은 유지)
 */
export const CM_ROOM_BOTTOM_READ_DWELL_MS = 0;

/** 최신 말풍선 행이 스크롤 루트 안에서 이만큼 이상(높이 비율) 보일 때만 “읽음 후보” (가상 리스트·작은 말풍선 대비 완화) */
export const CM_READ_LATEST_MESSAGE_MIN_VISIBLE_RATIO = 0.08;

/**
 * `mark_read` 후보 — 스크롤 루트 하단까지 남은 거리(px)가 이 값 이하면 “대화 꼬리를 보고 있다”고 본다.
 * stickToBottomRef·말풍선 가시 비율보다 우선(가상 스크롤·짧은 텍스트에서 비율·ref 가 거짓인 경우가 많음).
 */
export const CM_MARK_READ_VIEWPORT_BOTTOM_GAP_PX = 280;

/** 스크롤·레이아웃 연속 변화 시 mark_read(cursor) 배치 — 요청 폭주 방지 */
export const CM_MARK_READ_SCROLL_DEBOUNCE_MS = 150;

/** 타임라인 `@tanstack/react-virtual` — 뷰포트 대비 대략 20~40개 DOM 노드(가시 + 오버스캔) 목표 */
export const MESSENGER_TIMELINE_VIRTUAL_OVERSCAN = 10;

/** 초기 행 높이 추정(px). 실제 높이는 `measureElement` 로 보정 */
export const MESSENGER_TIMELINE_VIRTUAL_ESTIMATE_PX = 96;

/**
 * 타임라인 메시지 배열 상한(메모리·클라 diff 비용). DOM은 가상 스크롤로 일정하게 유지.
 * 이전 100은 가상화 전 완충용 — 로드 더 보기·긴 스레드와 함께 쓰이면 상한을 크게 둔다.
 */
export const MESSENGER_TIMELINE_MESSAGES_CAP = 2500;
