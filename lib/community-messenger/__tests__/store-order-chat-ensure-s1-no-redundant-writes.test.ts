/**
 * S1 (2026-11-09) — 주문 채팅 ensure 는 바뀐 것만 쓴다.
 * docs/audit/store-order-chat-open-read-request-surge-design-2026-11-09.md §3 S1
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  storeOrderChatJsonValueEqual,
  storeOrderChatParticipantsNeedingUpsert,
  storeOrderSummaryMessageNeedsUpdate,
} from "@/lib/community-messenger/store-order-chat-ensure-diff";

const appendRoomMessageAtomic = vi.fn();
vi.mock("@/lib/community-messenger/room-unread-authority-rpc", () => ({
  appendRoomMessageAtomic: (...args: unknown[]) => appendRoomMessageAtomic(...args),
}));
vi.mock("@/lib/community-messenger/server/publish-messenger-room-bump", () => ({
  publishMessengerRoomBumpAfterMutation: vi.fn().mockResolvedValue(undefined),
}));

type Op = "select" | "insert" | "update" | "upsert";
type Call = { table: string; op: Op; payload?: unknown; filters: Array<[string, string, unknown]> };
type Resolver = (call: Call, terminal: "maybeSingle" | "single" | "many") => { data: unknown; error: unknown };

function fakeSupabase(resolve: Resolver) {
  const calls: Call[] = [];
  const builder = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    let recorded = false;
    const record = () => {
      if (!recorded) {
        calls.push(call);
        recorded = true;
      }
    };
    const b: Record<string, unknown> = {};
    const chain = (name: string) => (...args: unknown[]) => {
      call.filters.push([name, String(args[0]), args[1]]);
      return b;
    };
    b.select = () => b;
    b.insert = (payload: unknown) => {
      call.op = "insert";
      call.payload = payload;
      return b;
    };
    b.update = (payload: unknown) => {
      call.op = "update";
      call.payload = payload;
      return b;
    };
    b.upsert = (payload: unknown) => {
      call.op = "upsert";
      call.payload = payload;
      return b;
    };
    for (const name of ["eq", "in", "is", "filter", "order", "limit"]) b[name] = chain(name);
    b.maybeSingle = async () => {
      record();
      return resolve(call, "maybeSingle");
    };
    b.single = async () => {
      record();
      return resolve(call, "single");
    };
    b.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => {
      record();
      return Promise.resolve(resolve(call, "many")).then(onOk, onErr);
    };
    return b;
  };
  return { sb: { from: (t: string) => builder(t), rpc: vi.fn() }, calls };
}

const ORDER_ID = "ord-1";
const BUYER = "buyer-1";
const OWNER = "owner-1";

function orderRow(linkedRoomId: string | null) {
  return {
    id: ORDER_ID,
    order_no: "SO1",
    store_id: "store-1",
    buyer_user_id: BUYER,
    order_status: "completed",
    fulfillment_type: "local_delivery",
    payment_amount: 300,
    total_amount: 300,
    discount_amount: 0,
    created_at: "2026-11-01T00:00:00.000Z",
    accepted_at: null,
    cancel_kind: null,
    community_messenger_room_id: linkedRoomId,
    stores: {
      store_name: "Store",
      owner_user_id: OWNER,
      profile_image_url: null,
      messenger_voice_messages_enabled: true,
      messenger_voice_calls_enabled: true,
      messenger_video_calls_enabled: true,
    },
  };
}

type World = {
  linkedRoomId: string | null;
  roomSummary: string | null;
  participants: Array<{ user_id: string; role: string; store_order_role: string }>;
  participantsSelectError?: boolean;
  summaryMessage: { id: string; content: unknown; metadata: unknown } | null;
  insertUniqueViolation?: boolean;
  racedRoomId?: string;
};

function resolverFor(world: World): Resolver {
  return (call, terminal) => {
    if (call.table === "store_orders" && call.op === "select") return { data: orderRow(world.linkedRoomId), error: null };
    if (call.table === "store_order_items") {
      return { data: [{ product_title_snapshot: "Tea", price_snapshot: 300, qty: 1, subtotal: 300, options_snapshot_json: null }], error: null };
    }
    if (call.table === "store_order_events") return { data: [], error: null };
    if (call.table === "community_messenger_rooms" && call.op === "select") {
      if (call.filters.some(([, col]) => col === "domain_identity_key")) {
        // insert 전 조회(chat_domain 포함)는 아직 없음 — 경합 후 재조회만 다른 요청이 만든 방을 본다
        const preInsert = call.filters.some(([, col]) => col === "chat_domain");
        if (preInsert) return { data: null, error: null };
        return { data: world.insertUniqueViolation && world.racedRoomId ? { id: world.racedRoomId } : null, error: null };
      }
      if (call.filters.some(([, col]) => col === "direct_key")) return { data: null, error: null };
      return { data: world.roomSummary == null ? null : { summary: world.roomSummary }, error: null };
    }
    if (call.table === "community_messenger_rooms" && call.op === "insert") {
      if (world.insertUniqueViolation) return { data: null, error: { code: "23505", message: "duplicate key" } };
      return { data: { id: "room-new" }, error: null };
    }
    if (call.table === "community_messenger_participants" && call.op === "select") {
      if (world.participantsSelectError) return { data: null, error: { message: "boom" } };
      return { data: world.participants, error: null };
    }
    if (call.table === "community_messenger_messages" && call.op === "select") {
      if (call.filters.some(([name, col]) => name === "filter" && col === "metadata->>kind")) {
        return { data: world.summaryMessage, error: null };
      }
      if (terminal === "many") return { data: [], error: null };
      return { data: { content: "latest", message_type: "text", metadata: null, created_at: "2026-11-01T01:00:00.000Z" }, error: null };
    }
    return { data: null, error: null };
  };
}

function writes(calls: Call[]) {
  return calls.filter((c) => c.op !== "select").map((c) => `${c.op}:${c.table}`);
}

async function runEnsure(world: World) {
  const { sb, calls } = fakeSupabase(resolverFor(world));
  const { ensureStoreOrderMessengerRoom } = await import("@/lib/community-messenger/store-order-chat-service");
  const result = await ensureStoreOrderMessengerRoom(sb as never, { orderId: ORDER_ID, userId: BUYER });
  return { result, calls };
}

const BOTH_PARTICIPANTS = [
  { user_id: BUYER, role: "member", store_order_role: "customer" },
  { user_id: OWNER, role: "owner", store_order_role: "owner" },
];

/** 1회 실행해 서버가 쓰려는 요약 본문·메타·방 summary 를 얻는다(이미 저장된 상태 재현용). */
async function captureCurrentValues() {
  const { calls } = await runEnsure({
    linkedRoomId: "room-1",
    roomSummary: "stale",
    participants: BOTH_PARTICIPANTS,
    summaryMessage: { id: "sum-1", content: "old", metadata: {} },
  });
  const roomUpdate = calls.find((c) => c.table === "community_messenger_rooms" && c.op === "update");
  const msgUpdate = calls.find((c) => c.table === "community_messenger_messages" && c.op === "update");
  const p = msgUpdate?.payload as { content: string; metadata: Record<string, unknown> };
  return {
    summary: (roomUpdate?.payload as { summary: string }).summary,
    content: p.content,
    // jsonb 왕복 재현 — 키 순서를 바꿔 저장값과 같게 만든다
    metadata: JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(p.metadata).reverse()))),
  };
}

beforeEach(() => {
  appendRoomMessageAtomic.mockReset();
  appendRoomMessageAtomic.mockResolvedValue({ ok: true, message: { id: "sum-new" } });
});

describe("S1 diff helpers", () => {
  it("JSON 비교는 키 순서·undefined 키를 무시한다", () => {
    expect(storeOrderChatJsonValueEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(storeOrderChatJsonValueEqual({ a: 1, x: undefined }, { a: 1 })).toBe(true);
    expect(storeOrderChatJsonValueEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(storeOrderChatJsonValueEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });

  it("참가자 — 없는 행·역할이 다른 행만 upsert 대상", () => {
    const planned = BOTH_PARTICIPANTS.map((p) => ({ room_id: "r", ...p }));
    expect(storeOrderChatParticipantsNeedingUpsert(planned, BOTH_PARTICIPANTS)).toEqual([]);
    expect(storeOrderChatParticipantsNeedingUpsert(planned, [BOTH_PARTICIPANTS[1]])).toEqual([planned[0]]);
    expect(
      storeOrderChatParticipantsNeedingUpsert(planned, [
        BOTH_PARTICIPANTS[0],
        { user_id: OWNER, role: "member", store_order_role: "owner" },
      ])
    ).toEqual([planned[1]]);
  });

  it("요약 메시지 — 본문 또는 메타가 다를 때만 갱신", () => {
    const base = { existingContent: "A", existingMetadata: { k: 1 }, nextContent: "A", nextMetadata: { k: 1 } };
    expect(storeOrderSummaryMessageNeedsUpdate(base)).toBe(false);
    expect(storeOrderSummaryMessageNeedsUpdate({ ...base, nextContent: "B" })).toBe(true);
    expect(storeOrderSummaryMessageNeedsUpdate({ ...base, nextMetadata: { k: 2 } })).toBe(true);
    expect(storeOrderSummaryMessageNeedsUpdate({ ...base, existingContent: null })).toBe(true);
  });
});

describe("S1 ensureStoreOrderMessengerRoom — 쓰기 횟수", () => {
  it("기존 방 재진입(모든 값 동일) — DB 쓰기 0건", async () => {
    const cur = await captureCurrentValues();
    const { result, calls } = await runEnsure({
      linkedRoomId: "room-1",
      roomSummary: cur.summary,
      participants: BOTH_PARTICIPANTS,
      summaryMessage: { id: "sum-1", content: cur.content, metadata: cur.metadata },
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.roomId).toBe("room-1");
    expect(writes(calls)).toEqual([]);
    expect(appendRoomMessageAtomic).not.toHaveBeenCalled();
  });

  it("기존(수정 전) 동작 기준 — 값이 낡으면 방·요약 메시지·미리보기를 갱신하고 주문은 다시 쓰지 않는다", async () => {
    const { calls } = await runEnsure({
      linkedRoomId: "room-1",
      roomSummary: "stale",
      participants: BOTH_PARTICIPANTS,
      summaryMessage: { id: "sum-1", content: "old", metadata: {} },
    });
    expect(writes(calls)).toEqual([
      "update:community_messenger_rooms",
      "update:community_messenger_messages",
      "update:community_messenger_rooms",
    ]);
  });

  it("방 summary 만 다름 — 방 1건만 갱신", async () => {
    const cur = await captureCurrentValues();
    const { calls } = await runEnsure({
      linkedRoomId: "room-1",
      roomSummary: "stale",
      participants: BOTH_PARTICIPANTS,
      summaryMessage: { id: "sum-1", content: cur.content, metadata: cur.metadata },
    });
    expect(writes(calls)).toEqual(["update:community_messenger_rooms"]);
  });

  it("참가자 행이 없음(삭제 후 재진입) — 그 참가자만 upsert", async () => {
    const cur = await captureCurrentValues();
    const { calls } = await runEnsure({
      linkedRoomId: "room-1",
      roomSummary: cur.summary,
      participants: [BOTH_PARTICIPANTS[1]],
      summaryMessage: { id: "sum-1", content: cur.content, metadata: cur.metadata },
    });
    expect(writes(calls)).toEqual(["upsert:community_messenger_participants"]);
    const up = calls.find((c) => c.op === "upsert");
    expect(up?.payload).toEqual({ room_id: "room-1", user_id: BUYER, role: "member", store_order_role: "customer" });
  });

  it("참가자 조회 실패 — 기존처럼 둘 다 upsert (안전 쪽)", async () => {
    const cur = await captureCurrentValues();
    const { calls } = await runEnsure({
      linkedRoomId: "room-1",
      roomSummary: cur.summary,
      participants: BOTH_PARTICIPANTS,
      participantsSelectError: true,
      summaryMessage: { id: "sum-1", content: cur.content, metadata: cur.metadata },
    });
    expect(writes(calls)).toEqual([
      "upsert:community_messenger_participants",
      "upsert:community_messenger_participants",
    ]);
  });

  it("신규 채팅 — 방 생성·참가자 2명·주문 연결·요약 메시지 추가 (기존 동작 그대로)", async () => {
    const { result, calls } = await runEnsure({
      linkedRoomId: null,
      roomSummary: null,
      participants: [],
      summaryMessage: null,
    });
    expect(result.ok && result.roomId).toBe("room-new");
    expect(writes(calls)).toEqual([
      "insert:community_messenger_rooms",
      "upsert:community_messenger_participants",
      "upsert:community_messenger_participants",
      "update:store_orders",
    ]);
    // 신규 방은 참가자 조회 없이 넣는다
    expect(calls.some((c) => c.table === "community_messenger_participants" && c.op === "select")).toBe(false);
    expect(appendRoomMessageAtomic).toHaveBeenCalledTimes(1);
  });

  it("동시 생성 경합(23505) — 새로 만들지 않고 먼저 만든 방에 연결", async () => {
    const { result, calls } = await runEnsure({
      linkedRoomId: null,
      roomSummary: null,
      participants: BOTH_PARTICIPANTS,
      summaryMessage: null,
      insertUniqueViolation: true,
      racedRoomId: "room-raced",
    });
    expect(result.ok && result.roomId).toBe("room-raced");
    expect(calls.filter((c) => c.op === "insert" && c.table === "community_messenger_rooms")).toHaveLength(1);
    // 경합 방은 이미 참가자가 있으므로 upsert 없이, 주문만 그 방으로 연결
    expect(writes(calls)).toEqual(["insert:community_messenger_rooms", "update:store_orders"]);
    const link = calls.find((c) => c.table === "store_orders" && c.op === "update");
    expect(link?.payload).toEqual({ community_messenger_room_id: "room-raced" });
  });
});
