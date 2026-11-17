/**
 * P1 (Owner 2026-11-18 「권장안대로 반영」): 비공개 그룹 「읽음 N」 라벨을 말풍선 옆에서 빼고
 * 길게 누름 메뉴의 「읽음 N명」 항목으로 옮긴다. 데이터는 타임라인의 `useGroupMessageReadCounts` 결과를
 * 그대로 재사용(추가 조회 0) — 타임라인이 방별 최신 결과를 여기에 두고, 메뉴가 열릴 때 읽는다.
 * 레거시(Telegram) 기준: 읽은 사람 표시는 그룹 인원 `chatReadMarkSizeThreshold = 100` 이하에서만.
 */
export const GROUP_READ_RECEIPT_MENU_MAX_MEMBERS = 100;

type ReadCountRow = { readCount: number; readerLabels: string[] };

const byRoom = new Map<string, Readonly<Record<string, ReadCountRow | undefined>>>();

export function setGroupReadCountsSnapshot(
  roomId: string,
  counts: Readonly<Record<string, ReadCountRow | undefined>>
): void {
  const id = roomId.trim();
  if (!id) return;
  byRoom.set(id, counts);
}

export function getGroupReadCountForMessage(roomId: string, messageId: string): ReadCountRow | null {
  const row = byRoom.get(roomId.trim())?.[messageId];
  return row ?? null;
}

export function clearGroupReadCountsSnapshot(roomId: string): void {
  byRoom.delete(roomId.trim());
}

/** 메뉴 항목을 보일지 — 비공개 그룹 · 내 확정 메시지 · 100명 이하 · 1명 이상 읽음 */
export function shouldShowGroupReadReceiptMenuRow(args: {
  isPrivateGroupRoom: boolean;
  memberCount: number;
  isMine: boolean;
  pending: boolean;
  readCount: number;
}): boolean {
  return (
    args.isPrivateGroupRoom &&
    args.isMine &&
    !args.pending &&
    args.memberCount > 0 &&
    args.memberCount <= GROUP_READ_RECEIPT_MENU_MAX_MEMBERS &&
    args.readCount >= 1
  );
}
