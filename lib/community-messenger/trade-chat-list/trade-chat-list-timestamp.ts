/** 거래 채팅 리스트 우측 시간 — 짧은 포맷(360px 잘림 방지) */
export function formatTradeChatListTimestamp(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const date = new Date(time);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameDate =
    sameYear && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (sameDate) return `${hh}:${mm}`;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (sameYear) return `${month}/${day}`;
  const yy = String(date.getFullYear()).slice(-2);
  return `${yy}/${month}/${day}`;
}
