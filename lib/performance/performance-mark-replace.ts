/**
 * 같은 이름의 `performance.mark` 를 「마지막 1개만」 남기고 찍는다.
 *
 * 운영에서 화면에 들어갈 때마다 mark 를 찍고 지우지 않으면 User Timing 버퍼가 앱 수명 내내 커진다
 * (장시간 실행 감사 2026-11-09 C). 이 저장소의 mark 소비자는 모두 같은 이름의 **마지막 항목**만 읽으므로
 * (`getEntriesByName(name, "mark")` 의 끝 원소) 이전 항목을 지워도 측정값은 같다.
 */
export function replacePerformanceMark(name: string): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  try {
    if (typeof performance.clearMarks === "function") performance.clearMarks(name);
  } catch {
    /* clear 실패 → mark 만 */
  }
  performance.mark(name);
}

/** measure 결과를 읽은 뒤 이름이 같은 measure 와 시작·끝 mark 를 지운다. */
export function clearPerformanceMeasureAndMarks(measureName: string, ...markNames: string[]): void {
  if (typeof performance === "undefined") return;
  try {
    if (typeof performance.clearMeasures === "function") performance.clearMeasures(measureName);
    if (typeof performance.clearMarks === "function") {
      for (const m of markNames) performance.clearMarks(m);
    }
  } catch {
    /* ignore */
  }
}
