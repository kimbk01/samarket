"use client";

import { useSyncExternalStore } from "react";

/**
 * 보내는 중 영상 말풍선의 진행률·취소 — 낙관 행 id(tempId) 단위.
 * 방 메시지 배열을 진행률마다 다시 만들지 않도록 별도 저장소로 둔다(말풍선 1개만 다시 그림).
 *
 * 진행률 0..1 = 압축(네이티브) 40% + 업로드 60%. 웹 경로(압축 없음)는 업로드만 0..1.
 */

type Entry = { progress: number; cancel: (() => void) | null };

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

function emit(id: string): void {
  const set = listeners.get(id);
  if (set) for (const cb of set) cb();
}

export function setMessengerVideoSendProgress(id: string, progress: number): void {
  const p = Math.max(0, Math.min(1, Number(progress) || 0));
  const prev = entries.get(id);
  /* 1% 미만 변화는 다시 그리지 않는다 */
  if (prev && Math.abs(prev.progress - p) < 0.01 && p < 1) return;
  entries.set(id, { progress: p, cancel: prev?.cancel ?? null });
  emit(id);
}

export function setMessengerVideoSendCancel(id: string, cancel: (() => void) | null): void {
  const prev = entries.get(id);
  entries.set(id, { progress: prev?.progress ?? 0, cancel });
  emit(id);
}

export function clearMessengerVideoSend(id: string): void {
  if (!entries.has(id)) return;
  entries.delete(id);
  emit(id);
}

/** 말풍선 ✕ — 등록된 취소 실행(없으면 false) */
export function cancelMessengerVideoSend(id: string): boolean {
  const cancel = entries.get(id)?.cancel;
  if (!cancel) return false;
  cancel();
  return true;
}

export function readMessengerVideoSendProgress(id: string): number | null {
  return entries.get(id)?.progress ?? null;
}

export function useMessengerVideoSendProgress(id: string): { progress: number | null; cancellable: boolean } {
  const subscribe = (cb: () => void) => {
    let set = listeners.get(id);
    if (!set) {
      set = new Set();
      listeners.set(id, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) listeners.delete(id);
    };
  };
  const progress = useSyncExternalStore(
    subscribe,
    () => entries.get(id)?.progress ?? null,
    () => null
  );
  const cancellable = useSyncExternalStore(
    subscribe,
    () => Boolean(entries.get(id)?.cancel),
    () => false
  );
  return { progress, cancellable };
}

/** 압축 40% + 업로드 60% */
export function messengerVideoCombinedProgress(phase: "transcode" | "upload", fraction: number, transcoded: boolean): number {
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  if (!transcoded) return f;
  return phase === "transcode" ? f * 0.4 : 0.4 + f * 0.6;
}
