/**
 * 채팅 Admin R1-A (C-3) — 레거시 채팅방 하드 삭제 계획 (순수 함수).
 * - super_admin + 확인 문구 재입력 + 사유 10자 이상 (라우트에서 검증).
 * - 신고(`chat_reports`·`reports`)가 연결된 방은 삭제 대상에서 제외 — FK CASCADE 로 증거가 지워지지 않게.
 * - `moderation_actions` 는 삭제하지 않는다 (대상 id 텍스트 참조로 보존).
 */
import {
  CHAT_ROOM_HARD_DELETE_CONFIRM_TEXT,
  CHAT_ROOM_HARD_DELETE_REASON_MIN_LENGTH,
  normalizeChatAdminReason,
} from "@/lib/admin/chat-admin/chat-content-access-policy";

export const CHAT_ROOM_HARD_DELETE_MAX_BATCH = 50;

export type ChatHardDeleteStorage = "chat_rooms" | "product_chats";
export type ChatHardDeleteItem = { id: string; storage: ChatHardDeleteStorage };

export type ChatHardDeleteRequest =
  | { ok: true; items: ChatHardDeleteItem[]; reason: string }
  | { ok: false; error: "items_required" | "too_many_items" | "reason_required" | "confirm_mismatch" };

export function parseChatHardDeleteRequest(body: unknown): ChatHardDeleteRequest {
  if (!body || typeof body !== "object") return { ok: false, error: "items_required" };
  const raw = body as { items?: unknown; reason?: unknown; confirmText?: unknown };
  const items: ChatHardDeleteItem[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.items)) {
    for (const row of raw.items) {
      if (!row || typeof row !== "object") continue;
      const id = typeof (row as { id?: unknown }).id === "string" ? (row as { id: string }).id.trim() : "";
      const storage = (row as { storage?: unknown }).storage;
      if (!id || (storage !== "chat_rooms" && storage !== "product_chats")) continue;
      const key = `${storage}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ id, storage });
    }
  }
  if (!items.length) return { ok: false, error: "items_required" };
  if (items.length > CHAT_ROOM_HARD_DELETE_MAX_BATCH) return { ok: false, error: "too_many_items" };
  const reason = normalizeChatAdminReason(raw.reason);
  if (reason.length < CHAT_ROOM_HARD_DELETE_REASON_MIN_LENGTH) return { ok: false, error: "reason_required" };
  const confirm = typeof raw.confirmText === "string" ? raw.confirmText.trim() : "";
  if (confirm !== CHAT_ROOM_HARD_DELETE_CONFIRM_TEXT) return { ok: false, error: "confirm_mismatch" };
  return { ok: true, items, reason };
}

export type ChatHardDeletePlan = {
  deleteChatRoomIds: string[];
  deleteProductChatIds: string[];
  skipped: Array<{ id: string; storage: ChatHardDeleteStorage; reason: "evidence_preserved" }>;
};

/** `evidenceRoomIds` = 신고 증거가 연결된 방 id (저장소 무관). */
export function planChatHardDelete(
  items: ChatHardDeleteItem[],
  evidenceRoomIds: ReadonlySet<string>
): ChatHardDeletePlan {
  const plan: ChatHardDeletePlan = { deleteChatRoomIds: [], deleteProductChatIds: [], skipped: [] };
  for (const item of items) {
    if (evidenceRoomIds.has(item.id)) {
      plan.skipped.push({ id: item.id, storage: item.storage, reason: "evidence_preserved" });
      continue;
    }
    if (item.storage === "chat_rooms") plan.deleteChatRoomIds.push(item.id);
    else plan.deleteProductChatIds.push(item.id);
  }
  return plan;
}
