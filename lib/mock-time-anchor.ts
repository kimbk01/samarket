/**
 * 모듈 최초 평가 시각에 `Date.now()`를 쓰면 Node(SSR)와 브라우저 번들 평가 시각이 달라
 * 동일 mock 배열이라도 타임스탬프가 어긋나 React 하이드레이션 오류가 난다.
 */
export const MOCK_DATA_AS_OF_MS = Date.parse("2026-03-20T06:00:00.000Z");
