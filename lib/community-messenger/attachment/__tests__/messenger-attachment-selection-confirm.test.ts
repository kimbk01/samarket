import { describe, expect, it } from "vitest";
import {
  mergeAttachmentSelectedIds,
  MESSENGER_ATTACHMENT_ALBUM_PICK_MAX,
  takeFilesWithinAttachmentSelectionBudget,
} from "@/lib/community-messenger/attachment/messenger-attachment-recent-store";

function fakeFiles(n: number): File[] {
  return Array.from({ length: n }, (_, i) => new File([`b${i}`], `p${i}.jpg`, { type: "image/jpeg" }));
}

describe("CUT2 photo pick → selection budget (no send)", () => {
  it("pick 1 with empty selection → accepted 1, no overflow", () => {
    const { accepted, overflow } = takeFilesWithinAttachmentSelectionBudget(0, fakeFiles(1));
    expect(accepted).toHaveLength(1);
    expect(overflow).toBe(false);
  });

  it("picker cancel / empty pick → accepted 0, no overflow", () => {
    const { accepted, overflow } = takeFilesWithinAttachmentSelectionBudget(3, []);
    expect(accepted).toHaveLength(0);
    expect(overflow).toBe(false);
  });

  it("multi pick N → accepted N when under max", () => {
    const { accepted, overflow } = takeFilesWithinAttachmentSelectionBudget(0, fakeFiles(4));
    expect(accepted).toHaveLength(4);
    expect(overflow).toBe(false);
  });

  it("merge existing selection + gallery pick respects max 10", () => {
    const { accepted, overflow } = takeFilesWithinAttachmentSelectionBudget(8, fakeFiles(5));
    expect(accepted).toHaveLength(2);
    expect(overflow).toBe(true);
  });

  it("already at max → accepted 0, overflow", () => {
    const { accepted, overflow } = takeFilesWithinAttachmentSelectionBudget(
      MESSENGER_ATTACHMENT_ALBUM_PICK_MAX,
      fakeFiles(3)
    );
    expect(accepted).toHaveLength(0);
    expect(overflow).toBe(true);
  });

  it("mergeAttachmentSelectedIds appends without exceeding max / dedupes", () => {
    const merged = mergeAttachmentSelectedIds(["a", "b"], ["b", "c", "d"], 3);
    expect(merged).toEqual(["a", "b", "c"]);
  });

  it("Send authority is separate: budget helpers never invoke a send callback", () => {
    let sendCalls = 0;
    const send = () => {
      sendCalls += 1;
    };
    const picked = fakeFiles(1);
    const { accepted } = takeFilesWithinAttachmentSelectionBudget(0, picked);
    const selected = mergeAttachmentSelectedIds([], ["id-1"]);
    expect(accepted).toHaveLength(1);
    expect(selected).toEqual(["id-1"]);
    expect(sendCalls).toBe(0);
    send();
    expect(sendCalls).toBe(1);
  });
});
