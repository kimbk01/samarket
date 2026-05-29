import { applyOwnerCompactShellBodyFlag } from "@/lib/business/owner-compact-shell-layout";

/**
 * `/stores/owner/*` 스택 — 헤더·본문 column 폭 단일 변수(`body[data-owner-compact-shell]`).
 * 모바일·태블릿·데스크톱 웹 동일 헤더(중앙 정렬) · 햄버거 드로어에 사용.
 */
export function subscribeOwnerCompactShellBodyFlag(ownerStackPath: boolean): () => void {
  if (typeof window === "undefined") {
    return () => applyOwnerCompactShellBodyFlag(false);
  }

  if (!ownerStackPath) {
    applyOwnerCompactShellBodyFlag(false);
    return () => applyOwnerCompactShellBodyFlag(false);
  }

  applyOwnerCompactShellBodyFlag(true);
  return () => applyOwnerCompactShellBodyFlag(false);
}
