export function logCallV3(event: string, payload?: Record<string, unknown>): void {
  console.info(`[call-v3] ${event}`, payload ?? {});
}
