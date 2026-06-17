"use client";

import { fetchWith401Recovery } from "@/lib/auth/api-auth-recovery";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type CommunityMessengerDirectStartResult = {
  ok: boolean;
  roomId?: string;
  created?: boolean;
  error?: string;
  httpStatus?: number;
  snapshot?: CommunityMessengerRoomSnapshot | null;
};

export type CommunityMessengerDirectStartOpts = {
  /** false — 통화 ensure 전용(roomId 만). 기본 true */
  includeSnapshot?: boolean;
};

const PREFETCH_TTL_MS = 30_000;
const recentByPeer = new Map<string, { at: number; result: CommunityMessengerDirectStartResult }>();

function peerKey(peerUserId: string): string {
  return peerUserId.trim();
}

function flightKey(peerUserId: string): string {
  return `cm:direct-start:${peerKey(peerUserId)}`;
}

async function fetchDirectStart(
  peerUserId: string,
  opts?: CommunityMessengerDirectStartOpts
): Promise<CommunityMessengerDirectStartResult> {
  const targetUserId = peerKey(peerUserId);
  if (!targetUserId) return { ok: false, error: "bad_target" };
  const includeSnapshot = opts?.includeSnapshot !== false;
  const res = await fetchWith401Recovery(
    "/api/community-messenger/direct/start",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId, includeSnapshot }),
    },
    "cm-direct-start"
  );
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    roomId?: string;
    created?: boolean;
    error?: string;
    snapshot?: CommunityMessengerRoomSnapshot | null;
  };
  const result: CommunityMessengerDirectStartResult = {
    ok: Boolean(res.ok && json.ok && json.roomId),
    roomId: json.roomId,
    created: json.created,
    error: json.error,
    httpStatus: res.status,
    snapshot: json.snapshot ?? null,
  };
  if (result.ok && result.roomId) {
    recentByPeer.set(targetUserId, { at: Date.now(), result });
  }
  return result;
}

/**
 * 검색·통화 확인 등 — 방이 없을 때 direct/start 선행.
 * 통화는 `includeSnapshot: false` 로 roomId 만 빠르게 확보.
 */
export function prefetchCommunityMessengerDirectStart(
  peerUserId: string,
  opts?: CommunityMessengerDirectStartOpts
): void {
  const key = peerKey(peerUserId);
  if (!key) return;
  const hit = recentByPeer.get(key);
  if (hit && Date.now() - hit.at <= PREFETCH_TTL_MS && hit.result.ok) return;
  void runSingleFlight(flightKey(key), () => fetchDirectStart(key, opts));
}

/** 탭·발신 bootstrap — 진행 중이면 동일 peer single-flight 에 합류 */
export async function resolveCommunityMessengerDirectStart(
  peerUserId: string,
  opts?: CommunityMessengerDirectStartOpts
): Promise<CommunityMessengerDirectStartResult> {
  const key = peerKey(peerUserId);
  if (!key) return { ok: false, error: "bad_target" };
  const wantSnapshot = opts?.includeSnapshot !== false;
  const hit = recentByPeer.get(key);
  if (hit && Date.now() - hit.at <= PREFETCH_TTL_MS && hit.result.ok) {
    if (!wantSnapshot || hit.result.snapshot) {
      return hit.result;
    }
  }
  return runSingleFlight(flightKey(key), () => fetchDirectStart(key, opts));
}

/** 발신 직전 — 프리패치된 roomId 가 있으면 bootstrap ensure 생략 */
export function peekPrefetchedDirectStart(peerUserId: string): CommunityMessengerDirectStartResult | null {
  const key = peerKey(peerUserId);
  if (!key) return null;
  const hit = recentByPeer.get(key);
  if (!hit || Date.now() - hit.at > PREFETCH_TTL_MS || !hit.result.ok) return null;
  return hit.result;
}
