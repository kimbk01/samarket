/** Dev-only warnings for call timeline SSOT fallbacks — production no-op. */
export function logCallTimelineDevWarning(
  code: string,
  context?: Record<string, unknown>
): void {
  if (process.env.NODE_ENV === "production") return;
  console.warn("[cm-call-timeline]", code, context ?? {});
}
