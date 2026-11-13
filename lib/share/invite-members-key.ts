/**
 * 초대 랜딩·링크 미리보기 인원 문구 키 — 1명이면 단수(영어 「1 member」), 그 밖은 복수.
 * 2026-11-14 실기: 멤버 1명 모임 미리보기가 「1 members」로 나옴. 기존 카탈로그 방식(`_one` 키 별도)을 따른다.
 */
export function inviteMembersKey(count: number): "share_invite_members_one" | "share_invite_members" {
  return count === 1 ? "share_invite_members_one" : "share_invite_members";
}
