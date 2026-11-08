/**
 * 주문 채팅 ensure — 「바뀐 것만 쓴다」 판정 (순수 함수, 단위 테스트 대상).
 *
 * 2026-11-09 S1 (docs/audit/store-order-chat-open-read-request-surge-design-2026-11-09.md §3 S1):
 * 이미 연결된 주문 채팅을 열기만 해도 방·참가자·주문·요약 메시지를 같은 값으로 다시 써
 * Realtime UPDATE 전파와 DB 쓰기가 생겼다. 값이 실제로 다를 때만 쓰도록 비교한다.
 */

/** JSON 으로 저장되는 값 비교 — 객체 키 순서 무시, `undefined` 키는 없는 것으로 본다(jsonb 저장 규칙과 같음). */
export function storeOrderChatJsonValueEqual(a: unknown, b: unknown): boolean {
  return stableJson(normalizeJson(a)) === stableJson(normalizeJson(b));
}

function normalizeJson(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return value;
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(",")}}`;
}

export type StoreOrderChatPlannedParticipant = {
  room_id: string;
  user_id: string;
  role: string;
  store_order_role: string;
};

export type StoreOrderChatExistingParticipant = {
  user_id?: unknown;
  role?: unknown;
  store_order_role?: unknown;
};

/**
 * upsert 가 필요한 참가자만 — 행이 없거나 `role`·`store_order_role` 이 다를 때.
 * 기존 upsert 는 이 두 열만 바꾸므로(`left_at` 등 다른 열은 건드리지 않음) 같은 값이면 쓰기를 생략해도 데이터가 같다.
 */
export function storeOrderChatParticipantsNeedingUpsert(
  planned: ReadonlyArray<StoreOrderChatPlannedParticipant>,
  existing: ReadonlyArray<StoreOrderChatExistingParticipant>
): StoreOrderChatPlannedParticipant[] {
  const byUser = new Map<string, StoreOrderChatExistingParticipant>();
  for (const row of existing) {
    const uid = typeof row.user_id === "string" ? row.user_id.trim().toLowerCase() : "";
    if (uid) byUser.set(uid, row);
  }
  return planned.filter((p) => {
    const cur = byUser.get(p.user_id.trim().toLowerCase());
    if (!cur) return true;
    return cur.role !== p.role || cur.store_order_role !== p.store_order_role;
  });
}

/** 주문 요약 system 메시지 — 본문·메타데이터가 같으면 다시 쓰지 않는다. */
export function storeOrderSummaryMessageNeedsUpdate(input: {
  existingContent: unknown;
  existingMetadata: unknown;
  nextContent: string;
  nextMetadata: Record<string, unknown>;
}): boolean {
  if (typeof input.existingContent !== "string" || input.existingContent !== input.nextContent) return true;
  return !storeOrderChatJsonValueEqual(input.existingMetadata, input.nextMetadata);
}
