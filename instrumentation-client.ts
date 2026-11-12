/**
 * Next 클라이언트 진입 훅 — hydration 전에 1회 실행된다(Next 16 `instrumentation-client`).
 * P3: 서버 본문 화면(홈)은 서버 본문 첫 프레임에서 네이티브 시작 화면 해제 — `releaseNativeSplashAtServerBodyFrame`.
 * 여기에는 그 밖의 일을 넣지 않는다(첫 화면 JS 실행 시간에 그대로 더해진다).
 */
import { releaseNativeSplashAtServerBodyFrame } from "@/lib/startup/startup-metrics";

try {
  releaseNativeSplashAtServerBodyFrame();
} catch {
  /* 해제 실패 시 화면 준비 뒤 기존 경로가 해제한다 */
}
