/**
 * L-10 — 목록 액션 busy 키: `action:roomId` (예: archive:uuid).
 */
export function messengerListActionBusyKey(
  action: "archive" | "read" | "leave" | "settings",
  roomId: string
): string {
  return `${action}:${String(roomId ?? "").trim()}`;
}
