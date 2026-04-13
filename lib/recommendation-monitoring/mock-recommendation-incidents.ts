/**
 * 운영 이슈 — 메모리 상태는 `recommendation-runtime-state`와 동기화됩니다.
 */
export {
  getRecommendationIncidents,
  getRecommendationIncidentById,
  addRecommendationIncident,
  acknowledgeIncident,
  resolveIncident,
} from "@/lib/recommendation-ops/recommendation-runtime-state";
