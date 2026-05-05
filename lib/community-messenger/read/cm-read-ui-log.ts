/** 디버그: `[cm-read-ui]` — `NEXT_PUBLIC_CM_READ_UI_DEBUG=1` 또는 비프로덕션 */
export function cmReadUiLog(event: string, payload: Record<string, unknown>): void {
  if (typeof process === "undefined") return;
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_CM_READ_UI_DEBUG !== "1") return;
  // eslint-disable-next-line no-console
  console.info("[cm-read-ui]", event, payload);
}
