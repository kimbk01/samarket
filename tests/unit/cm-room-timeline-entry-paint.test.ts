import { describe, expect, it } from "vitest";
import {
  CM_ROOM_ENTRY_SEED_PAINT_ROW_CAP,
  sliceTimelineEntryPaintMessages,
} from "@/lib/community-messenger/room/cm-room-r7-first-row-commit-instrumentation";

describe("sliceTimelineEntryPaintMessages", () => {
  it("returns tail slice during pass2 when over cap", () => {
    const msgs = Array.from({ length: 20 }, (_, i) => ({ id: String(i) }));
    const out = sliceTimelineEntryPaintMessages(msgs, 2);
    expect(out.entrySliceActive).toBe(true);
    expect(out.paintMessages).toHaveLength(CM_ROOM_ENTRY_SEED_PAINT_ROW_CAP);
    expect(out.paintMessages[0]?.id).toBe("8");
    expect(out.seedRowsRenderedCount).toBe(CM_ROOM_ENTRY_SEED_PAINT_ROW_CAP);
  });

  it("returns full list at pass3", () => {
    const msgs = Array.from({ length: 20 }, (_, i) => ({ id: String(i) }));
    const out = sliceTimelineEntryPaintMessages(msgs, 3);
    expect(out.entrySliceActive).toBe(false);
    expect(out.paintMessages).toHaveLength(20);
  });
});
