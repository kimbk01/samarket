/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  isMessengerRoomComposerHeightSynced,
  resolveMessengerRoomEntryScrollPaintReady,
  snapshotMessengerRoomTimelineViewportProbe,
} from "@/lib/community-messenger/room/messenger-room-entry-scroll-ready";

function mockViewport(input: {
  clientHeight?: number;
  scrollHeight?: number;
  scrollTop?: number;
  rowCount?: number;
  offsetParent?: Element | null;
  composerHeightPx?: string;
}): HTMLElement {
  const shell = document.createElement("div");
  shell.dataset.cmRoomId = "room-1";
  if (input.composerHeightPx != null) {
    shell.style.setProperty("--chat-composer-height", input.composerHeightPx);
  }

  const vp = document.createElement("div");
  Object.defineProperty(vp, "clientHeight", { value: input.clientHeight ?? 400 });
  Object.defineProperty(vp, "scrollHeight", { value: input.scrollHeight ?? 800 });
  Object.defineProperty(vp, "scrollTop", { value: input.scrollTop ?? 0, writable: true });
  Object.defineProperty(vp, "offsetParent", { value: input.offsetParent ?? document.body });

  const rows = input.rowCount ?? 0;
  for (let i = 0; i < rows; i += 1) {
    const row = document.createElement("div");
    row.dataset.cmTimelineMessageRow = "";
    vp.appendChild(row);
  }

  shell.appendChild(vp);
  document.body.appendChild(shell);
  return vp;
}

describe("messenger-room-entry-scroll-ready", () => {
  it("blocks when clientHeight is 0", () => {
    const vp = mockViewport({ clientHeight: 0, rowCount: 2, composerHeightPx: "52px" });
    expect(
      resolveMessengerRoomEntryScrollPaintReady({
        viewport: vp,
        messageCount: 2,
        composerHeightSynced: true,
      })
    ).toBe(false);
  });

  it("blocks when no rows and virtualizer totalSize 0", () => {
    const vp = mockViewport({ composerHeightPx: "52px" });
    expect(
      resolveMessengerRoomEntryScrollPaintReady({
        viewport: vp,
        messageCount: 3,
        virtualizer: { getTotalSize: () => 0 },
        composerHeightSynced: true,
      })
    ).toBe(false);
  });

  it("allows when rows exist and composer synced", () => {
    const vp = mockViewport({ rowCount: 1, composerHeightPx: "52px" });
    expect(
      resolveMessengerRoomEntryScrollPaintReady({
        viewport: vp,
        messageCount: 1,
        composerHeightSynced: true,
      })
    ).toBe(true);
    expect(isMessengerRoomComposerHeightSynced(vp)).toBe(true);
  });

  it("requires composer sync when flagged", () => {
    const vp = mockViewport({ rowCount: 1, composerHeightPx: "0px" });
    expect(
      resolveMessengerRoomEntryScrollPaintReady({
        viewport: vp,
        messageCount: 1,
        composerHeightSynced: true,
      })
    ).toBe(false);
  });

  it("snapshot probe exposes row count and parent hidden", () => {
    const vp = mockViewport({ rowCount: 2, composerHeightPx: "48px" });
    const probe = snapshotMessengerRoomTimelineViewportProbe(vp, { getTotalSize: () => 1200 });
    expect(probe.timelineRowCount).toBe(2);
    expect(probe.timelineClientHeight).toBe(400);
    expect(probe.parentHidden).toBe(false);
    expect(probe.composerHeightPx).toBe("48px");
  });
});
