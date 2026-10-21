/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import React, { act, memo } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  bumpCmPolishComposerRender,
  getCmPolishComposerRenderSessionCount,
  resetCmPolishAnalysisSession,
} from "@/lib/community-messenger/monitoring/cm-polish-analysis";
import {
  MessengerRoomComposerPhase1Provider,
  useMessengerRoomComposerPhase1Context,
  type MessengerRoomComposerPhase1Value,
} from "@/lib/community-messenger/room/messenger-room-composer-phase1-context";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 입력창과 같은 방식 — memo + 렌더마다 bumpCmPolishComposerRender */
const ComposerProbe = memo(function ComposerProbe() {
  bumpCmPolishComposerRender();
  const ctx = useMessengerRoomComposerPhase1Context();
  return <span data-reply={ctx.replyToMessage?.id ?? ""} />;
});

const stable = {
  notifyComposerTextareaVisibleForSeededBootstrap: () => undefined,
  setReplyToMessage: () => undefined,
  setEditingMessage: () => undefined,
  setMessage: () => undefined,
  focusTimelineMessage: async () => undefined,
} as unknown as MessengerRoomComposerPhase1Value;

/** RoomClientInner 처럼 매 렌더 새 phase1 객체(메시지·스크롤 값 포함)를 넘긴다 */
function Host({ tick, reply }: { tick: number; reply: { id: string } | null }) {
  const phase1 = {
    ...stable,
    replyToMessage: reply,
    editingMessage: null,
    roomMessages: Array.from({ length: tick }, (_, i) => ({ id: `m${i}` })),
    scrollTick: tick,
  } as unknown as MessengerRoomComposerPhase1Value;
  return (
    <MessengerRoomComposerPhase1Provider phase1={phase1}>
      <ComposerProbe />
    </MessengerRoomComposerPhase1Provider>
  );
}

describe("P-4 composer-scoped phase1 context", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE_CM_POLISH = "1";
    resetCmPolishAnalysisSession();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE_CM_POLISH;
  });

  it("does not re-render the composer when unrelated phase1 values change (message/scroll)", () => {
    const reply = { id: "r1" };
    act(() => root.render(<Host tick={0} reply={null} />));
    expect(getCmPolishComposerRenderSessionCount()).toBe(1);
    for (let i = 1; i <= 5; i += 1) {
      act(() => root.render(<Host tick={i} reply={null} />));
    }
    expect(getCmPolishComposerRenderSessionCount()).toBe(1);
    act(() => root.render(<Host tick={6} reply={reply} />));
    expect(getCmPolishComposerRenderSessionCount()).toBe(2);
    expect(container.querySelector("span")?.getAttribute("data-reply")).toBe("r1");
    act(() => root.render(<Host tick={7} reply={reply} />));
    expect(getCmPolishComposerRenderSessionCount()).toBe(2);
  });

  it("composer reads the scoped context, not the whole phase1 context", () => {
    const root = path.resolve(__dirname, "../../../..");
    const composer = readFileSync(
      path.join(root, "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer.tsx"),
      "utf8"
    );
    expect(composer).toContain("useMessengerRoomComposerPhase1Context()");
    expect(composer).not.toContain("useMessengerRoomClientPhase1Context");
    const inner = readFileSync(
      path.join(root, "components/community-messenger/CommunityMessengerRoomClientInner.tsx"),
      "utf8"
    );
    expect(inner).toContain("<MessengerRoomComposerPhase1Provider phase1={phase1}>");
    const slide = readFileSync(
      path.join(root, "components/community-messenger/room/phase2/TradePostDetailSlideHostContext.tsx"),
      "utf8"
    );
    expect(slide).toContain("useMemo(() => ({ openPostDetail, closeSlide }), [openPostDetail, closeSlide])");
  });
});
