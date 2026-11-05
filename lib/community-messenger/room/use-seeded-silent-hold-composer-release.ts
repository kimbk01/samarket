"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import type { SeededSilentHoldSignal } from "@/lib/community-messenger/room/seeded-silent-refresh-hold";

const VISIBILITY_ATTRIBUTES = ["class", "style", "hidden", "inert"];

type ComposerReleaseArgs = {
  enabled: boolean;
  roomId: string;
  snapshotPlaceholder: boolean;
  chatUnavailable: boolean;
  isTextareaVisible: (ta: HTMLTextAreaElement) => boolean;
  /** 보류 중인 hold 세대 — 0 이면 보류 없음(감시하지 않는다) */
  readGeneration: () => number;
  notify: (signal: SeededSilentHoldSignal) => boolean;
};

/**
 * 실제 마운트된 composer 가 준비되면 시드 진입 silent refresh 보류를 해제하도록 신호를 보낸다.
 * 준비 = placeholder 아닌 스냅샷 + (입력 불가 방의 안내 줄 표시 | textarea 가 실제로 보임).
 * textarea 노드 마운트(반환 ref 콜백)·크기·자신/조상 가시성 속성·CSS 전환 종료 이벤트에서만 다시 확인한다.
 * 감시는 보류가 있는 동안만 붙고, 해제 성공·방 전환·언마운트에 떨어진다.
 * 신호에는 감시 시작 시점의 hold 세대를 싣는다 — 방 전환 뒤 늦은 신호는 hold 가 무시한다.
 *
 * @returns `MessengerComposerSector` 의 `onTextareaRef` 에 넘기는 콜백
 */
export function useSeededSilentHoldComposerRelease(
  args: ComposerReleaseArgs
): (node: HTMLTextAreaElement | null) => void {
  const argsRef = useRef(args);
  useLayoutEffect(() => {
    argsRef.current = args;
  });
  const nodeRef = useRef<HTMLTextAreaElement | null>(null);
  const detachRef = useRef<(() => void) | null>(null);

  const detach = useCallback(() => {
    const d = detachRef.current;
    detachRef.current = null;
    d?.();
  }, []);

  const attach = useCallback(() => {
    detach();
    const a = argsRef.current;
    const rid = a.roomId.trim();
    if (!a.enabled || !rid || a.snapshotPlaceholder) return;
    const generation = a.readGeneration();
    if (generation <= 0) return;
    const signal: SeededSilentHoldSignal = { roomId: rid, generation };
    if (a.chatUnavailable) {
      a.notify(signal);
      return;
    }
    const ta = nodeRef.current;
    if (!ta) return;

    let done = false;
    const check = () => {
      if (done || nodeRef.current !== ta || !a.isTextareaVisible(ta)) return;
      if (!a.notify(signal)) return;
      done = true;
      detach();
    };

    const mutation = new MutationObserver(check);
    for (let el: Element | null = ta; el; el = el.parentElement) {
      mutation.observe(el, { attributes: true, attributeFilter: VISIBILITY_ATTRIBUTES });
    }
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(check) : null;
    resize?.observe(ta);
    const doc = ta.ownerDocument;
    doc.addEventListener("transitionend", check, true);
    doc.addEventListener("animationend", check, true);
    detachRef.current = () => {
      done = true;
      mutation.disconnect();
      resize?.disconnect();
      doc.removeEventListener("transitionend", check, true);
      doc.removeEventListener("animationend", check, true);
    };
    check();
  }, [detach]);

  const onTextareaNode = useCallback(
    (node: HTMLTextAreaElement | null) => {
      if (node === nodeRef.current) return;
      nodeRef.current = node;
      if (node) attach();
      else detach();
    },
    [attach, detach]
  );

  const { enabled, roomId, snapshotPlaceholder, chatUnavailable, isTextareaVisible, readGeneration, notify } = args;
  useLayoutEffect(() => {
    attach();
    return detach;
  }, [attach, detach, enabled, roomId, snapshotPlaceholder, chatUnavailable, isTextareaVisible, readGeneration, notify]);

  return onTextareaNode;
}
