/**
 * K-5 — 방별 입력 초안. sessionStorage 실패 시에도 메모리 Map 으로 입력 유지.
 */

const PREFIX = "cm-composer-draft:v1:";

const memoryDraftByRoom = new Map<string, string>();

function keyFor(roomId: string): string {
  return `${PREFIX}${String(roomId ?? "").trim()}`;
}

export function readRoomComposerDraft(roomId: string): string {
  const rid = String(roomId ?? "").trim();
  if (!rid) return "";
  if (memoryDraftByRoom.has(rid)) return memoryDraftByRoom.get(rid) ?? "";
  try {
    if (typeof sessionStorage === "undefined") return "";
    const stored = sessionStorage.getItem(keyFor(rid));
    if (typeof stored === "string") {
      memoryDraftByRoom.set(rid, stored);
      return stored;
    }
  } catch {
    /* private mode / quota — fall through */
  }
  return "";
}

export function writeRoomComposerDraft(roomId: string, value: string): void {
  const rid = String(roomId ?? "").trim();
  if (!rid) return;
  const next = String(value ?? "");
  memoryDraftByRoom.set(rid, next);
  try {
    if (typeof sessionStorage === "undefined") return;
    if (!next.trim()) sessionStorage.removeItem(keyFor(rid));
    else sessionStorage.setItem(keyFor(rid), next);
  } catch {
    /* ignore — memory Map still holds draft */
  }
}

export function clearRoomComposerDraft(roomId: string): void {
  writeRoomComposerDraft(roomId, "");
}
