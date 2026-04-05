/**
 * Supabase·클라이언트 간 UUID 문자열 대소문자/공백 차이로
 * WebRTC 시그널 수신 판별이 실패하는 것을 막는다.
 */
export function messengerUserIdsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}
