/**
 * 개발 환경에서만 상세 하단 섹션 0건·스킵 사유 로깅 (스펙 2·6절)
 */
export function devLogDetailSection(sectionKey: string, reason: string, meta?: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") return;
  if (meta && Object.keys(meta).length > 0) {
    console.debug(`[detail-sections] ${sectionKey}: ${reason}`, meta);
  } else {
    console.debug(`[detail-sections] ${sectionKey}: ${reason}`);
  }
}
