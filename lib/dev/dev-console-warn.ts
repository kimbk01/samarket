/** `NODE_ENV === "development"` 일 때만 `console.warn` — production 로그·노이즈 방지 */
export function devConsoleWarn(message: string, meta?: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") return;
  if (meta && Object.keys(meta).length > 0) {
    console.warn(message, meta);
  } else {
    console.warn(message);
  }
}
