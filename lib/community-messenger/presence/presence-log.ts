/** presence 진단 로그 — prod 에서는 샘플링(기본 5%)으로 제한 */
export function presenceLog(phase: string, fields?: Record<string, unknown>): void {
  const isDev = process.env.NODE_ENV === "development";
  if (!isDev && Math.random() > 0.05) return;
  try {
    // eslint-disable-next-line no-console -- presence hot-path 진단(샘플링)
    console.info("[presence]", { phase, ...fields });
  } catch {
    /* ignore */
  }
}
