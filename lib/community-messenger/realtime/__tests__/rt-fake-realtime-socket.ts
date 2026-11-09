/**
 * RT-B·RT-C 선행 검증 전용 — **실제** `@supabase/realtime-js` RealtimeClient 에 가짜 WebSocket 만 끼운다.
 * 라이브러리 동작(채널 재사용·subscribe·removeChannel·setAuth)은 그대로 실행되고, 서버 응답만 테스트가 흉내 낸다.
 * (운영 코드·라이브러리 수정 없음)
 */
import { RealtimeClient } from "@supabase/realtime-js";

export type FakeFrame = {
  topic: string;
  event: string;
  payload: Record<string, unknown>;
  ref: string | null;
  join_ref?: string | null;
};

export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 1;
  binaryType = "arraybuffer";
  sent: FakeFrame[] = [];
  onopen: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as FakeFrame);
  }
  close(): void {
    this.readyState = 3;
  }
}

export type FakeRealtime = {
  rt: RealtimeClient;
  ws: () => FakeWebSocket;
  frames: (filter?: { topic?: string; event?: string }) => FakeFrame[];
  serverReply: (frame: FakeFrame, status?: "ok" | "error", response?: Record<string, unknown>) => void;
  /** 해당 토픽의 마지막 phx_join 에 ok 응답 (postgres_changes 바인딩 id 부여 가능) */
  ackLastJoin: (topic: string, response?: Record<string, unknown>) => FakeFrame | null;
  ackLastLeave: (topic: string) => FakeFrame | null;
  serverBroadcast: (topic: string, event: string, payload: Record<string, unknown>) => void;
  serverPostgresChange: (topic: string, ids: number[], data: Record<string, unknown>) => void;
  /** supabase-js SupabaseClient 중 앱이 쓰는 표면만 */
  sb: {
    channel: RealtimeClient["channel"];
    removeChannel: RealtimeClient["removeChannel"];
    realtime: RealtimeClient;
    auth: { getSession: () => Promise<{ data: { session: { access_token: string } | null } }> };
  };
  dispose: () => void;
};

export function realtimeTopic(name: string): string {
  return `realtime:${name}`;
}

export function createFakeRealtime(initialToken = "jwt-A"): FakeRealtime {
  FakeWebSocket.instances = [];
  const rt = new RealtimeClient("wss://fake.supabase.test/realtime/v1", {
    params: { apikey: "anon-test" },
    vsn: "1.0.0",
    transport: FakeWebSocket as never,
    heartbeatIntervalMs: 60 * 60 * 1000,
  });
  let token = initialToken;
  const ws = () => {
    const last = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    if (!last) throw new Error("socket not opened");
    return last;
  };
  const deliver = (frame: FakeFrame) => {
    ws().onmessage?.({ data: JSON.stringify(frame) });
  };
  const frames = (filter?: { topic?: string; event?: string }) => {
    const all = FakeWebSocket.instances.flatMap((s) => s.sent);
    return all.filter(
      (f) =>
        (!filter?.topic || f.topic === realtimeTopic(filter.topic)) && (!filter?.event || f.event === filter.event)
    );
  };
  const serverReply: FakeRealtime["serverReply"] = (frame, status = "ok", response = {}) => {
    deliver({
      topic: frame.topic,
      event: "phx_reply",
      payload: { status, response },
      ref: frame.ref,
      join_ref: frame.join_ref ?? null,
    });
  };
  const lastOf = (topic: string, event: string) => {
    const list = frames({ topic, event });
    return list.length ? list[list.length - 1]! : null;
  };
  const sb = {
    channel: rt.channel.bind(rt),
    removeChannel: rt.removeChannel.bind(rt),
    realtime: rt,
    auth: {
      getSession: async () => ({ data: { session: { access_token: token } } }),
    },
  };
  void rt.setAuth(initialToken);
  return {
    rt,
    ws,
    frames,
    serverReply,
    ackLastJoin: (topic, response = {}) => {
      const f = lastOf(topic, "phx_join");
      if (f) serverReply(f, "ok", response);
      return f;
    },
    ackLastLeave: (topic) => {
      const f = lastOf(topic, "phx_leave");
      if (f) serverReply(f, "ok", {});
      return f;
    },
    serverBroadcast: (topic, event, payload) =>
      deliver({
        topic: realtimeTopic(topic),
        event: "broadcast",
        payload: { type: "broadcast", event, payload },
        ref: null,
      }),
    serverPostgresChange: (topic, ids, data) =>
      deliver({
        topic: realtimeTopic(topic),
        event: "postgres_changes",
        payload: { ids, data },
        ref: null,
      }),
    sb,
    dispose: () => {
      token = "";
      try {
        rt.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

export async function flushMicrotasks(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
}
