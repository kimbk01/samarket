/**
 * Four-domain pollution quarantine room ids (2026-07-24).
 * Do not auto-merge / auto-backfill / allow new call_sessions domain invent here.
 * @see docs/community-messenger/2026-07-24-four-domain-pollution-quarantine.md
 */
export const FOUR_DOMAIN_POLLUTION_QUARANTINE_ROOM_IDS = [
  "661e27ad-7c8c-4d9d-a16d-ccab83bc1507",
  "30f97067-27f6-4bfa-8dfb-27f4f4f6ca13",
  "901e97e5-81d0-4e13-ae90-993f7aa962d7",
  "6d9f98b7-539c-4271-8e79-de7594422465",
] as const;

const QUARANTINE_SET = new Set<string>(FOUR_DOMAIN_POLLUTION_QUARANTINE_ROOM_IDS);

export function isFourDomainPollutionQuarantineRoom(roomId: unknown): boolean {
  return typeof roomId === "string" && QUARANTINE_SET.has(roomId.trim());
}
