import "server-only";
import { createHash } from "node:crypto";

/**
 * 재감사 F-01 (2026-11-04 · P1): 중복 방지 키의 「보는 사람」은 **서버가** 정한다.
 * 로그인 = 회원 id · 비로그인 = 접속 IP 해시(원문 IP 는 저장하지 않음). 앱이 보낸 화면 세션·자리 번호는 키에 쓰지 않는다.
 * → 한 사람·한 소재·1시간에 노출 1 · 클릭 1 이 최대다(예전에는 세션 값만 바꿔 보내면 무한히 늘었다).
 * IP 를 알 수 없는 비로그인 요청은 기록하지 않는다.
 */
export function feedAdViewerKey(input: { userId: string | null; ip: string | null }): string | null {
  if (input.userId) return `u:${input.userId}`;
  const ip = String(input.ip ?? "").trim();
  if (!ip) return null;
  return `ip:${createHash("sha256").update(`dibay-feed-ad-viewer:${ip}`).digest("hex")}`;
}
