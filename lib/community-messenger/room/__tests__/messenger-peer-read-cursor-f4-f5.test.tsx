// @vitest-environment jsdom
/**
 * F4·F5 (설계 2026-11-18 PR-1) 읽음 커서:
 *  - F4: 상대 participant(커서 id) 가 메시지 행보다 먼저 와도 체크2 유지 → 행 도착 후 전진
 *  - F5: 가드와 판정이 같은 비교(ms → µs → id)
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  carryDirectPeerReadCursorKey,
  compareMessengerReadOrderKey,
  messengerReadOrderKey,
  resolveDirectPeerReadCursorKey,
  resolveMessengerOutboundReadState,
  type MessengerReadOrderKey,
} from "@/lib/community-messenger/room/messenger-outbound-read-state";
import {
  applyPeerReadReceiptRealtimePatch,
  shouldAdvancePeerReadReceiptCursor,
} from "@/lib/community-messenger/room/messenger-peer-read-cursor-guard";
import { useCarriedDirectPeerReadCursorKey } from "@/lib/community-messenger/room/use-carried-direct-peer-read-cursor-key";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Row = { id: string; createdAt: string; isMine: boolean; messageType: string; pending?: boolean };
const mine = (id: string, createdAt: string): Row => ({ id, createdAt, isMine: true, messageType: "text" });
const peer = (id: string, createdAt: string): Row => ({ id, createdAt, isMine: false, messageType: "text" });

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

/** Timeline 과 같은 순서: resolve → carry 훅 → 행 판정 */
function renderStates(propsSeq: Array<{ rows: Row[]; cursorId: string | null; cursorCreatedAt: string | null }>) {
  const out: string[][] = [];
  function Probe(p: { rows: Row[]; cursorId: string | null; cursorCreatedAt: string | null }) {
    const resolved = resolveDirectPeerReadCursorKey({
      lastReadMessageId: p.cursorId,
      lastReadMessageCreatedAt: p.cursorCreatedAt,
      rows: p.rows,
    });
    const key = useCarriedDirectPeerReadCursorKey({ roomId: "r1", resolved, cursorId: p.cursorId });
    out.push(p.rows.filter((r) => r.isMine).map((r) => resolveMessengerOutboundReadState(r, "direct", key)));
    return null;
  }
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  for (const p of propsSeq) act(() => root!.render(<Probe {...p} />));
  return out;
}

describe("F4 커서 행 미발견 시 직전 키 유지", () => {
  it("상대 participant 먼저(새 커서 id 행 없음) → 체크2 유지 → 행 도착 후 전진", () => {
    const base = [mine("a", "2026-11-18T00:00:01.000Z"), mine("b", "2026-11-18T00:00:02.000Z")];
    const withPeer = [...base, peer("p", "2026-11-18T00:00:03.000Z"), mine("c", "2026-11-18T00:00:04.000Z")];
    const states = renderStates([
      { rows: base, cursorId: "b", cursorCreatedAt: "2026-11-18T00:00:02.000Z" },
      // 상대가 새 글 p 를 쓰고 읽음 커서를 p 로 → participant 가 먼저, 행 p 는 아직(created_at 비움 — 패치 규칙)
      { rows: base, cursorId: "p", cursorCreatedAt: null },
      // 행 p·c 도착
      { rows: withPeer, cursorId: "p", cursorCreatedAt: null },
    ]);
    expect(states[0]).toEqual(["read", "read"]);
    expect(states[1]).toEqual(["read", "read"]); // 예전: ["unread","unread"] (체크2→체크1)
    expect(states[states.length - 1]).toEqual(["read", "read", "unread"]);
  });

  it("carry 규칙: 계산 성공이면 그 키, 실패면 직전 키(시각·id 통째), 커서 없으면 null", () => {
    const prev: MessengerReadOrderKey = { t: 1, us: 0, id: "old" };
    const now: MessengerReadOrderKey = { t: 2, us: 0, id: "new" };
    expect(carryDirectPeerReadCursorKey({ resolved: now, cursorId: "new", previous: prev })).toBe(now);
    expect(carryDirectPeerReadCursorKey({ resolved: null, cursorId: "new", previous: prev })).toBe(prev);
    expect(carryDirectPeerReadCursorKey({ resolved: null, cursorId: "", previous: prev })).toBeNull();
  });

  it("패치는 새 id + 옛 시각 조합을 만들지 않는다(시각 비움)", () => {
    const next = applyPeerReadReceiptRealtimePatch(
      { lastReadMessageId: "b", lastReadAt: "2026-11-18T00:00:02.000Z", lastReadMessageCreatedAt: "2026-11-18T00:00:02.000Z" } as never,
      { lastReadMessageId: "p", lastReadAt: "2026-11-18T00:00:05.000Z", createdAtForCursor: null }
    );
    expect(next.lastReadMessageId).toBe("p");
    expect(next.lastReadMessageCreatedAt).toBeNull();
  });
});

describe("F5 가드·판정 같은 비교", () => {
  it("같은 ms·다른 µs — 가드가 판정과 같은 순서로 전진/거부", () => {
    const early = "2026-11-18T00:00:01.000100Z";
    const late = "2026-11-18T00:00:01.000900Z";
    // id 문자열 순서는 µs 순서와 반대("z" > "a")로 둬 예전 localeCompare 규칙과 갈리게 한다
    const times = new Map([
      ["z-early", early],
      ["a-late", late],
    ]);
    const prev = { lastReadMessageId: "z-early", lastReadAt: null } as never;
    expect(shouldAdvancePeerReadReceiptCursor({ prev, nextMessageId: "a-late", nextReadAt: null, messageCreatedAtById: times })).toBe(true);
    const prev2 = { lastReadMessageId: "a-late", lastReadAt: null } as never;
    expect(shouldAdvancePeerReadReceiptCursor({ prev: prev2, nextMessageId: "z-early", nextReadAt: null, messageCreatedAtById: times })).toBe(false);
    const kEarly = messengerReadOrderKey(early, "z-early")!;
    const kLate = messengerReadOrderKey(late, "a-late")!;
    expect(compareMessengerReadOrderKey(kLate, kEarly)).toBeGreaterThan(0);
  });

  it("같은 시각(µs 까지)이면 id 순서 — 판정과 같은 방향", () => {
    const t = "2026-11-18T00:00:01.000500Z";
    const times = new Map([
      ["m1", t],
      ["m2", t],
    ]);
    expect(
      shouldAdvancePeerReadReceiptCursor({
        prev: { lastReadMessageId: "m1", lastReadAt: null } as never,
        nextMessageId: "m2",
        nextReadAt: null,
        messageCreatedAtById: times,
      })
    ).toBe(true);
    expect(
      shouldAdvancePeerReadReceiptCursor({
        prev: { lastReadMessageId: "m2", lastReadAt: null } as never,
        nextMessageId: "m1",
        nextReadAt: null,
        messageCreatedAtById: times,
      })
    ).toBe(false);
  });
});
