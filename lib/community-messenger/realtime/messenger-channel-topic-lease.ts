"use client";

/**
 * 메신저 Realtime 채널 토픽 임대(lease) — 같은 토픽 재생성 경합(X4) 방지 SSOT.
 *
 * realtime-js 2.99 `RealtimeClient.channel(topic)` 은 **상태와 무관하게** 같은 토픽 객체를 돌려준다.
 * 가입(joined) 채널을 `void removeChannel(ch)` 한 직후 같은 이름으로 `sb.channel()` 을 부르면
 * leaving 상태 객체를 받아 `.on()`·`.subscribe()` 가 무동작이 되고, leave 응답 때 소켓에서 빠져
 * **조용히 죽는다**(재시도 없음).
 *
 * - `releaseMessengerChannel` — 제거 프로미스를 토픽별로 기록(즉시 반환, 호출부는 기다리지 않아도 됨).
 * - `whenMessengerTopicFree` — 같은 토픽의 제거가 끝날 때까지 기다리고, 추적 밖에서 leaving/closed 로 남은
 *   같은 토픽 객체가 있으면 마저 제거한다. 그 뒤 `sb.channel()` 은 새 객체를 만든다.
 *
 * 통화 파일·`subscribe-with-retry.ts` 는 이 도우미를 쓰지 않는다(통화 무접촉 I7).
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

type ChannelLike = Pick<RealtimeChannel, "topic" | "state">;
type ClientLike = {
  removeChannel: (ch: never) => Promise<unknown>;
  getChannels: () => ChannelLike[];
};

const pendingRelease = new Map<string, Promise<unknown>>();

function asClient(sb: SupabaseClient | ClientLike): ClientLike {
  return sb as unknown as ClientLike;
}

/** realtime-js 내부 토픽 키 (`realtime:<name>`) */
export function messengerRealtimeTopicKey(name: string): string {
  return name.startsWith("realtime:") ? name : `realtime:${name}`;
}

/** 채널 제거를 시작하고 토픽별로 완료 프로미스를 기록한다. */
export function releaseMessengerChannel(sb: SupabaseClient | ClientLike, ch: RealtimeChannel | ChannelLike | null): void {
  if (!ch) return;
  const key = messengerRealtimeTopicKey(String(ch.topic ?? ""));
  let p: Promise<unknown>;
  try {
    p = Promise.resolve(asClient(sb).removeChannel(ch as never)).catch(() => "error");
  } catch {
    p = Promise.resolve("error");
  }
  const tracked = p.finally(() => {
    if (pendingRelease.get(key) === tracked) pendingRelease.delete(key);
  });
  pendingRelease.set(key, tracked);
}

/**
 * 같은 토픽 이름으로 새 채널을 만들기 전에 호출 — 이전 제거 완료(ok/timeout/error 로 항상 끝남)를 기다리고,
 * leaving/closed 로 남은 같은 토픽 객체가 있으면 제거한다(errored 는 다른 소유자의 rejoin 대기일 수 있어 건드리지 않음).
 * 반환: 이전 채널 제거를 기다렸으면 true(= 수신 공백이 있었을 수 있음 — 호출부가 정합 1회 판단).
 */
export async function whenMessengerTopicFree(sb: SupabaseClient | ClientLike, name: string): Promise<boolean> {
  const key = messengerRealtimeTopicKey(name);
  const pending = pendingRelease.get(key);
  let waited = false;
  if (pending) {
    waited = true;
    await pending;
  }
  const client = asClient(sb);
  let stale: ChannelLike | undefined;
  try {
    stale = client
      .getChannels()
      .find((c) => c.topic === key && (c.state === "leaving" || c.state === "closed"));
  } catch {
    stale = undefined;
  }
  if (stale) {
    waited = true;
    try {
      await client.removeChannel(stale as never);
    } catch {
      /* ignore */
    }
  }
  return waited;
}

/** 테스트 전용 — 추적 상태 초기화 */
export function __resetMessengerChannelTopicLeaseForTests(): void {
  pendingRelease.clear();
}
