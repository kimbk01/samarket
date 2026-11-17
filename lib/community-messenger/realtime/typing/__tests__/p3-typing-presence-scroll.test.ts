/**
 * P3 (Owner 2026-11-18 「권장안대로 반영」, 레거시 Telegram 기준) — 입력 중 문구·수신 등록부·목록 슬롯·
 * 메시지 도착 시 해제 · 「자리 비움」 삭제 · 「↓」 읽기 상태 · append 경로 scrollToIndex 제거 · 차단 제외 마이그레이션.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMessengerTypingLabel } from "@/lib/community-messenger/realtime/typing/resolve-messenger-typing-label";
import {
  selectMessengerTypingUserIdsKey,
  splitMessengerTypingUserIdsKey,
} from "@/lib/community-messenger/realtime/typing/messenger-typing-select";
import {
  MESSENGER_TYPING_IDLE_MS,
  MESSENGER_TYPING_RESEND_MS,
  MESSENGER_TYPING_TTL_MS,
} from "@/lib/community-messenger/realtime/typing/messenger-typing-timing";
import {
  acquireMessengerTypingTopic,
  __messengerTypingTopicRegistryStateForTests,
} from "@/lib/community-messenger/realtime/typing/messenger-typing-topic-registry";
import {
  MESSENGER_CHAT_LIST_TYPING_MAX_ROOMS,
  requestMessengerChatListTypingSlot,
  __messengerChatListTypingSlotStateForTests,
} from "@/lib/community-messenger/realtime/typing/messenger-chat-list-typing-slots";
import { resetMessengerTypingStore, useMessengerTypingStore } from "@/lib/community-messenger/stores/useMessengerTypingStore";
import { applyIncomingMessageEvent } from "@/lib/community-messenger/stores/messenger-realtime-store";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import {
  derivePresenceFromDbRow,
  deriveLivePresenceFromSignals,
  normalizeLegacyPresenceState,
} from "@/lib/community-messenger/presence/presence-policy";
import { applyPresenceSyncToMap } from "@/lib/community-messenger/realtime/presence/apply-presence-sync";
import { formatMessengerPeerPresenceLine } from "@/lib/community-messenger/realtime/presence/format-messenger-peer-presence-line";
import { translate } from "@/lib/i18n/messages";
import { createChatThreadScrollEngine } from "@/lib/chat-thread-scroll/engine";

const ROOT = process.cwd();

describe("입력 중 시간 계약 = 레거시", () => {
  it("재전송 5초 · 수신 유지 5.9초 · 유휴 2.6초", () => {
    expect(MESSENGER_TYPING_RESEND_MS).toBe(5_000);
    expect(MESSENGER_TYPING_TTL_MS).toBe(5_900);
    expect(MESSENGER_TYPING_IDLE_MS).toBe(2_600);
  });
});

describe("resolveMessengerTypingLabel — 문서 §3 / 레거시 이름 규칙", () => {
  const names: Record<string, string> = { a: "철수", b: "영희", c: "민수", d: "지수" };
  const run = (roomType: string, ids: string[], lang: "ko" | "en" = "ko", nameOf = (id: string) => names[id]) =>
    resolveMessengerTypingLabel({
      roomType,
      typingUserIds: ids,
      nameOf,
      t: (k, v) => translate(lang, k, v),
    });
  it("ko", () => {
    expect(run("direct", ["a"])).toBe("입력 중");
    expect(run("private_group", ["a"])).toBe("철수 입력 중");
    expect(run("private_group", ["a", "b"])).toBe("철수, 영희 입력 중");
    expect(run("private_group", ["a", "b", "c", "d"])).toBe("철수, 영희 외 2명 입력 중");
    expect(run("private_group", ["x", "a"], "ko", (id) => names[id] ?? null)).toBe("2명 입력 중");
    expect(run("private_group", [])).toBeNull();
  });
  it("en", () => {
    expect(run("direct", ["a"], "en")).toBe("typing");
    expect(run("open_group", ["a"], "en")).toBe("철수 is typing");
    expect(run("open_group", ["a", "b"], "en")).toBe("철수 and 영희 are typing");
    expect(run("open_group", ["a", "b", "c"], "en")).toBe("철수, 영희 and 1 more are typing");
  });
});

describe("selectMessengerTypingUserIdsKey", () => {
  it("본인 제외·만료 제외·1:1 은 상대만", () => {
    const now = 1_000;
    const by = { r1: { me: { expiresAt: 5_000 }, a: { expiresAt: 5_000 }, b: { expiresAt: 500 }, c: { expiresAt: 9_000 } } };
    expect(splitMessengerTypingUserIdsKey(selectMessengerTypingUserIdsKey(by, { roomId: "R1", viewerUserId: "me", now }))).toEqual(["a", "c"]);
    expect(selectMessengerTypingUserIdsKey(by, { roomId: "r1", viewerUserId: "me", peerUserId: "b", now })).toBe("");
    expect(selectMessengerTypingUserIdsKey(by, { roomId: "r1", viewerUserId: "me", peerUserId: "c", now })).toBe("c");
  });
});

function fakeSb() {
  const removed: string[] = [];
  const created: string[] = [];
  const resolvers: Array<() => void> = [];
  const sb = {
    realtime: { accessTokenValue: "jwt" },
    channel: (topic: string) => {
      created.push(topic);
      const ch = {
        topic,
        on: () => ch,
        subscribe: () => ch,
      };
      return ch;
    },
    removeChannel: (ch: { topic: string }) =>
      new Promise<void>((resolve) => {
        resolvers.push(() => {
          removed.push(ch.topic);
          resolve();
        });
      }),
  };
  return { sb: sb as never, removed, created, resolvers };
}

describe("입력 중 수신 토픽 등록부 — 토픽당 채널 1개 + 참조 수, 제거 완료 뒤 재생성", () => {
  it("방 화면·목록이 같은 토픽을 공유하고, 떠나는 채널을 재사용하지 않는다", async () => {
    const { sb, created, removed, resolvers } = fakeSb();
    const relA = acquireMessengerTypingTopic({ sb, roomId: "room-x", viewerUserId: "me" });
    const relB = acquireMessengerTypingTopic({ sb, roomId: "room-x", viewerUserId: "me" });
    expect(created).toEqual(["community-messenger-typing:room-x"]);
    relA();
    expect(resolvers).toHaveLength(0);
    relB();
    await new Promise((r) => setTimeout(r, 0));
    expect(resolvers).toHaveLength(1);
    /** 제거 진행 중 다시 획득 → 제거 끝날 때까지 새 채널을 만들지 않는다 */
    const relC = acquireMessengerTypingTopic({ sb, roomId: "room-x", viewerUserId: "me" });
    expect(created).toHaveLength(1);
    resolvers[0]!();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(removed).toEqual(["community-messenger-typing:room-x"]);
    expect(created).toHaveLength(2);
    relC();
    await new Promise((r) => setTimeout(r, 0));
    resolvers[1]?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(__messengerTypingTopicRegistryStateForTests().topics).toHaveLength(0);
  });
});

describe("등록부 — leave 실패로 남은 채널·subscribe throw 복구(검토 2)", () => {
  it("같은 토픽 잔존 채널을 강제 제거한 뒤 새로 열고, subscribe throw 는 1회 재시도, 거부는 새지 않는다", async () => {
    const topic = "community-messenger-typing:room-stale";
    const sockets: { topic: string; joined: boolean }[] = [{ topic: `realtime:${topic}`, joined: true }];
    let subscribeThrowsOnce = true;
    const removeCalls: string[] = [];
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    const sb = {
      realtime: {
        accessTokenValue: "jwt",
        _remove: (c: { topic: string }) => {
          const i = sockets.findIndex((x) => x === c || x.topic === c.topic);
          if (i >= 0) sockets.splice(i, 1);
        },
      },
      getChannels: () => sockets,
      channel: (t: string) => {
        const full = `realtime:${t}`;
        const existing = sockets.find((x) => x.topic === full);
        if (existing) {
          /** realtime-js 처럼 남아 있는 인스턴스를 돌려줌 → subscribe throw */
          return { ...existing, on() { return this; }, subscribe() { throw new Error("tried to subscribe multiple times"); } };
        }
        const ch = { topic: full, joined: false } as { topic: string; joined: boolean };
        sockets.push(ch);
        return {
          ...ch,
          on() {
            return this;
          },
          subscribe() {
            if (subscribeThrowsOnce) {
              subscribeThrowsOnce = false;
              throw new Error("boom");
            }
            ch.joined = true;
            return this;
          },
        };
      },
      /** leave 응답 error — throw 없이 끝나고 채널은 목록에 남음(realtime-js 동작) */
      removeChannel: (c: { topic: string }) => {
        removeCalls.push(c.topic);
        return Promise.resolve("error");
      },
    };
    const rel = acquireMessengerTypingTopic({ sb: sb as never, roomId: "room-stale", viewerUserId: "me" });
    for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0));
    const open = __messengerTypingTopicRegistryStateForTests().topics.find((x) => x.topic === topic);
    expect(open?.open).toBe(true);
    expect(sockets.filter((x) => x.topic === `realtime:${topic}`)).toHaveLength(1);
    expect(sockets[0]!.joined).toBe(true);
    expect(removeCalls.length).toBeGreaterThanOrEqual(2);
    rel();
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0));
    /** 해제 뒤 leave 가 error 여도 소켓 목록에서 빠짐 */
    expect(sockets).toHaveLength(0);
    process.off("unhandledRejection", onUnhandled);
    expect(unhandled).toEqual([]);
  });
});

describe("대화 목록 행 수신 슬롯 — 최대 15방", () => {
  it("16번째는 대기, 앞 행이 빠지면 받는다", () => {
    const { sb } = fakeSb();
    const rels = Array.from({ length: MESSENGER_CHAT_LIST_TYPING_MAX_ROOMS + 1 }, (_, i) =>
      requestMessengerChatListTypingSlot({ sb, roomId: `list-${i}`, viewerUserId: "me" })
    );
    expect(__messengerChatListTypingSlotStateForTests()).toEqual({ active: 15, waiting: 1 });
    rels[0]!();
    expect(__messengerChatListTypingSlotStateForTests()).toEqual({ active: 15, waiting: 0 });
    for (const r of rels) r();
    expect(__messengerChatListTypingSlotStateForTests()).toEqual({ active: 0, waiting: 0 });
  });
});

describe("상대 메시지 도착 → 그 사람 입력 중 해제", () => {
  beforeEach(() => resetMessengerTypingStore());
  it("새 메시지(INSERT)면 해제, 오래된 메시지·수정(UPDATE)·종류 모름은 유지", () => {
    const store = useMessengerTypingStore.getState();
    store.setTyping("room-m", "peer", 60_000);
    const nowIso = new Date().toISOString();
    applyIncomingMessageEvent({
      viewerUserId: "me",
      roomId: "room-m",
      messageEvent: "insert",
      messageRow: { id: "m-old", room_id: "room-m", sender_id: "peer", created_at: new Date(Date.now() - 60_000).toISOString() },
    });
    expect(useMessengerTypingStore.getState().byRoomId["room-m"]?.peer).toBeTruthy();
    /** 검토 1: 링크 미리보기·반응 등 UPDATE 는 입력 중을 지우지 않는다 */
    applyIncomingMessageEvent({
      viewerUserId: "me",
      roomId: "room-m",
      messageEvent: "update",
      messageRow: { id: "m-0", room_id: "room-m", sender_id: "peer", created_at: nowIso },
    });
    applyIncomingMessageEvent({
      viewerUserId: "me",
      roomId: "room-m",
      messageRow: { id: "m-0", room_id: "room-m", sender_id: "peer", created_at: nowIso },
    });
    expect(useMessengerTypingStore.getState().byRoomId["room-m"]?.peer).toBeTruthy();
    applyIncomingMessageEvent({
      viewerUserId: "me",
      roomId: "room-m",
      messageEvent: "insert",
      messageRow: { id: "m-1", room_id: "room-m", sender_id: "peer", created_at: nowIso },
    });
    expect(useMessengerTypingStore.getState().byRoomId["room-m"]?.peer).toBeUndefined();
  });

  it("호출처: 방 ingest·목록 INSERT·버스·bump 만 insert 를 넘긴다(소스 계약)", () => {
    const ingest = readFileSync(join(ROOT, "lib/community-messenger/room/use-messenger-room-realtime-message-ingest.ts"), "utf8");
    expect(ingest).toContain('messageEvent: event.eventType === "INSERT" ? "insert" : "update"');
    const bump = readFileSync(join(ROOT, "lib/community-messenger/room/use-messenger-room-bump-broadcast-subscription.ts"), "utf8");
    expect(bump).toContain('messageEvent: firstSeen ? "insert" : "update"');
    const catchup = readFileSync(join(ROOT, "lib/community-messenger/room/use-messenger-room-remote-catchup.ts"), "utf8");
    expect(catchup).not.toContain("messageEvent");
  });
});

describe("「↓」 읽기 상태 — bump 가 위치를 덮지 않는다(X2)", () => {
  afterEach(() => useMessengerRoomReaderStateStore.getState().clearRoom("room-r"));
  it("at-bottom 은 유지하고 대기 수만 늘린다", () => {
    const st = useMessengerRoomReaderStateStore.getState();
    st.setScrollPosition("room-r", "at-bottom");
    st.bumpPendingNewFromOthers("room-r", 2);
    const row = useMessengerRoomReaderStateStore.getState().byRoom["room-r"]!;
    expect(row.scrollPosition).toBe("at-bottom");
    expect(row.pendingNewBelow).toBe(2);
  });
});

describe("접속 — 「자리 비움」 없음 (레거시 안 B)", () => {
  const now = Date.parse("2026-11-18T10:00:00Z");
  const iso = (ms: number) => new Date(ms).toISOString();
  it("앞화면 + 최근 하트비트면 무입력 3분이어도 온라인, 백그라운드는 오프라인", () => {
    const base = { nowMs: now, lastPingAtIso: iso(now - 5_000), lastSeenAtIso: null, updatedAtIso: null };
    expect(derivePresenceFromDbRow({ ...base, lastActivityAtIso: iso(now - 180_000), appVisibility: "foreground" })).toBe("online");
    expect(derivePresenceFromDbRow({ ...base, lastActivityAtIso: iso(now), appVisibility: "background" })).toBe("offline");
    /** 검토 5: 하트비트 1회 지연(20초)은 온라인 유지, 30초 초과면 오프라인 */
    expect(
      derivePresenceFromDbRow({ ...base, lastPingAtIso: iso(now - 20_000), lastActivityAtIso: null, appVisibility: "foreground" })
    ).toBe("online");
    expect(
      derivePresenceFromDbRow({ ...base, lastPingAtIso: iso(now - 31_000), lastActivityAtIso: null, appVisibility: "foreground" })
    ).toBe("offline");
    expect(deriveLivePresenceFromSignals({ nowMs: now, channelSubscribed: true, documentVisible: true, lastActivityMs: now - 600_000 })).toBe("online");
    expect(deriveLivePresenceFromSignals({ nowMs: now, channelSubscribed: true, documentVisible: false, lastActivityMs: now })).toBe("offline");
    expect(normalizeLegacyPresenceState("away")).toBe("offline");
  });
  it("온라인 → 백그라운드(오프라인 track) 순간이 마지막 접속", () => {
    const prev = { u: { userId: "u", state: "online" as const, lastSeenAt: null, updatedAt: null } };
    const next = applyPresenceSyncToMap(
      prev,
      { u: { userId: "u", state: "offline", lastSeenAt: null, updatedAt: "2026-11-18T10:00:00Z" } },
      "2026-11-18T10:00:01Z"
    );
    expect(next.u).toMatchObject({ state: "offline", lastSeenAt: "2026-11-18T10:00:01Z" });
  });
  it("접속 문구 i18n (ko 문구 그대로, en)", () => {
    const ko = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate("ko", k, v);
    const en = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate("en", k, v);
    expect(formatMessengerPeerPresenceLine({ userId: "u", state: "online", lastSeenAt: null }, ko)).toBe("온라인");
    expect(formatMessengerPeerPresenceLine({ userId: "u", state: "away", lastSeenAt: null }, ko)).toBe("오프라인");
    expect(formatMessengerPeerPresenceLine(null, en)).toBe("Offline");
    /** P4-B: 레거시 「…까지 접속함」 / 「last seen …」 (상세는 format-messenger-peer-presence-line 시험) */
    expect(formatMessengerPeerPresenceLine({ userId: "u", state: "offline", lastSeenAt: "2026-11-13T20:15:17Z" }, ko)).toMatch(
      /까지 접속함$/
    );
    expect(formatMessengerPeerPresenceLine({ userId: "u", state: "offline", lastSeenAt: "2026-11-13T20:15:17Z" }, en)).toMatch(
      /^last seen /
    );
  });
});

describe("새 메시지 따라가기 — append 경로는 scrollToIndex 를 부르지 않는다(N2)", () => {
  it("notifyAppend = DOM scrollTop 만, 진입 = scrollToIndex 유지", () => {
    let st = 0;
    let sh = 1000;
    const vp = {
      get scrollHeight() {
        return sh;
      },
      clientHeight: 100,
      get scrollTop() {
        return st;
      },
      set scrollTop(v: number) {
        st = v;
      },
      querySelectorAll: () => [1],
    } as unknown as HTMLElement;
    const scrollToIndex = vi.fn();
    const ctx = { viewport: vp, messageCount: 10, virtualizer: { scrollToIndex, getTotalSize: () => 1000 } };
    const engine = createChatThreadScrollEngine();
    engine.notifyEntry();
    engine.notifyMessagesReady(true);
    engine.notifyLayoutCommitted();
    engine.tryCompleteEntry(ctx as never);
    expect(scrollToIndex).toHaveBeenCalledTimes(1);
    sh = 1200;
    expect(engine.notifyAppend(ctx as never)).toBe(true);
    expect(st).toBe(1200);
    expect(scrollToIndex).toHaveBeenCalledTimes(1);
  });
});

describe("소스 계약", () => {
  it("타임라인 입력 중 행 삭제 · 머리글 TypingIndicatorLine · 600ms 대기 삭제 · 따라가기 useLayoutEffect", () => {
    const timeline = readFileSync(
      join(ROOT, "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx"),
      "utf8"
    );
    expect(timeline).not.toMatch(/useMessengerTypingStore/);
    const header = readFileSync(join(ROOT, "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx"), "utf8");
    expect(header).toContain("<TypingIndicatorLine");
    expect(header).not.toContain("chats_peer_typing");
    const composer = readFileSync(join(ROOT, "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer.tsx"), "utf8");
    expect(composer).not.toContain("typingPublisherEnabled");
    expect(composer).toMatch(/inputRef: vm\.composerTextareaRef/);
    const controller = readFileSync(join(ROOT, "lib/community-messenger/room/messenger-room-scroll-anchor-controller.ts"), "utf8");
    expect(controller).toMatch(/useLayoutEffect\(\(\) => \{\n\s+const last = roomMessages\[roomMessages\.length - 1\];/);
    expect(controller).toContain("scheduleReaderStateSyncAfterEntry();");
  });

  it("차단 제외 마이그레이션 — typing 분기만 교체, 방 접근 함수·left_at 불변", () => {
    const sql = readFileSync(join(ROOT, "supabase/migrations/20271118150000_cm_typing_signal_block_exclusion.sql"), "utf8");
    expect(sql).toContain("create or replace function internal.cm_can_signal_typing_in_room(p_room_id uuid)");
    expect(sql).toContain("pg_get_functiondef('internal.cm_realtime_can_send_topic(text)'::regprocedure)");
    expect(sql).toMatch(/if v_hits <> 1 then\s+raise exception/);
    expect(sql).toContain("relation_type = 'blocked'");
    expect(sql).toContain("owner_user_id");
    expect(sql).toContain("target_user_id");
    expect(sql).toContain("r.room_type = 'direct'");
    expect(sql).not.toMatch(/left_at\s+is/i);
    expect(sql).not.toMatch(/create or replace function public\.cm_can_access_messenger_room/i);
    expect(sql).not.toMatch(/cm_realtime_can_read_topic\s*\(/);
  });
});
