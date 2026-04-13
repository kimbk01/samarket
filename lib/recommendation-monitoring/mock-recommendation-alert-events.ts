/**
 * 알림 이벤트 — 메모리 상태는 `recommendation-runtime-state`와 동기화됩니다.
 */
export {
  getRecommendationAlertEvents,
  addRecommendationAlertEvent,
  acknowledgeAlertEvent,
} from "@/lib/recommendation-ops/recommendation-runtime-state";
