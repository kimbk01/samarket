/**
 * 서버/클라이언트 Hydration 불일치 방지용 날짜 포맷 유틸리티.
 * toLocaleString / toLocaleDateString 은 Node.js 서버와 브라우저에서
 * ICU 데이터 차이로 다른 결과를 반환할 수 있어 Hydration 오류를 유발합니다.
 * 이 파일의 함수들은 locale에 의존하지 않는 수동 포맷을 사용합니다.
 */

/** "3월 29일" 형식 */
export function formatKorDate(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** "3월 29일 14:30" 형식 */
export function formatKorDateTime(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`;
}

/** "2026년 3월 29일 (일) 14:30" 형식 (모임 일시 표기용) */
export function formatKorDateTimeFull(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "일정 미정";
  const d = new Date(iso);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const day = days[d.getDay()];
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${day}) ${hh}:${mm}`;
}

/** "2026.3.29 14:30" 형식 (컴팩트) */
export function formatDateCompact(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${hh}:${mm}`;
}
