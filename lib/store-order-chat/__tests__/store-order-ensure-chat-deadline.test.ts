// @vitest-environment jsdom
/**
 * 주문 채팅 ensure-chat POST — 호출별 마감(공유 아님).
 * 멈춤은 마감 뒤 네트워크 오류와 같이 throw(호출처 기존 처리) · 자동 재전송 없음 · 다시 누르면 새 요청 1회.
 * 서버 ensure 는 (chat_domain, domain_identity_key)·direct_key 유니크로 멱등 — 재시도해도 방 중복 없음.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installStallFetch, stallState } from "@/lib/http/__tests__/shared-flight-stall-harness";

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  installStallFetch({ ok: false, error: "forbidden" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Outcome = { state: "pending" | "resolved" | "rejected"; value?: unknown; error?: unknown };
function track(p: Promise<unknown>): Outcome {
  const o: Outcome = { state: "pending" };
  p.then(
    (v) => {
      o.state = "resolved";
      o.value = v;
    },
    (e) => {
      o.state = "rejected";
      o.error = e;
    }
  );
  return o;
}

async function prepare() {
  const m = await import("@/lib/store-order-chat/store-order-messenger-room-entry-client");
  return () => m.prepareStoreOrderMessengerRoomEntryByOrder({ orderId: "o-1", role: "buyer" } as never);
}

describe.each(["header_stall", "body_stall"] as const)("ensure-chat — %s", (kind) => {
  it("마감 안에 throw(네트워크 오류 계약) · 재전송 없음 · 다시 누르면 새 요청 1회", async () => {
    const call = await prepare();
    stallState.behavior = kind;
    const o = track(call());
    await vi.advanceTimersByTimeAsync(12_050);
    expect(o.state).toBe("rejected");
    expect((o.error as Error).name).toBe("SharedFlightDeadlineError");
    expect(stallState.fetchCalls).toBe(1);
    stallState.behavior = "ok";
    const retry = track(call());
    await vi.advanceTimersByTimeAsync(100);
    expect(retry.state).toBe("resolved");
    expect(stallState.fetchCalls).toBe(2);
  });
});

describe("ensure-chat — 기존 계약 보존", () => {
  it("서버 거부 응답은 기존처럼 ok:false 결과(throw 아님)", async () => {
    const call = await prepare();
    const o = track(call());
    await vi.advanceTimersByTimeAsync(100);
    expect(o.state).toBe("resolved");
    expect(o.value).toMatchObject({ ok: false, error: "forbidden" });
    expect(stallState.fetchCalls).toBe(1);
  });

  it("POST · 쿠키 포함 · 캐시 없음 요청 형태 유지", async () => {
    const call = await prepare();
    void call();
    await vi.advanceTimersByTimeAsync(100);
    const [url, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe("/api/me/store-orders/o-1/ensure-chat");
    expect(init).toMatchObject({ method: "POST", credentials: "include", cache: "no-store" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
