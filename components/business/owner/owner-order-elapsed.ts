export function formatOwnerOrderElapsedKo(createdAt: string): string {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}시간 ${mm}분 경과`;
  }
  return `${m}분 ${s.toString().padStart(2, "0")}초 경과`;
}
