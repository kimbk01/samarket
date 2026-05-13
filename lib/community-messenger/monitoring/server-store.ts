/**
 * 호환용 배럴 — 컴파일 그래프 축소를 위해 신규 코드는
 * `server-store-record`(이벤트·부트스트랩 분해) 또는 `server-store-summary`(대시보드 JSON) 를 직접 import 한다.
 */
export {
  ingestClientMessengerEvents,
  recordMessengerBootstrapBreakdown,
  recordMessengerMonitoringEvent,
} from "./server-store-record";
export { getMessengerMonitoringSummary } from "./server-store-summary";
