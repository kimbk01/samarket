/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  CALL_LOG_SWIPE_ACTION_ATTR,
  shouldCloseCallLogSwipeOnOutsidePointerDown,
} from "@/lib/community-messenger/call-history/call-log-swipe";

describe("shouldCloseCallLogSwipeOnOutsidePointerDown", () => {
  it("does not close when tapping open swipe surface", () => {
    const root = document.createElement("div");
    const surface = document.createElement("div");
    surface.setAttribute("data-call-log-swipe-surface", "open");
    const row = document.createElement("button");
    surface.appendChild(row);
    root.appendChild(surface);
    expect(shouldCloseCallLogSwipeOnOutsidePointerDown(row)).toBe(false);
  });

  it("does not close when tapping swipe action (delete)", () => {
    const root = document.createElement("div");
    const actionWrap = document.createElement("div");
    actionWrap.setAttribute(CALL_LOG_SWIPE_ACTION_ATTR, "delete");
    const deleteBtn = document.createElement("button");
    deleteBtn.setAttribute("data-call-log-delete-action", "true");
    actionWrap.appendChild(deleteBtn);
    root.appendChild(actionWrap);
    expect(shouldCloseCallLogSwipeOnOutsidePointerDown(deleteBtn)).toBe(false);
    expect(shouldCloseCallLogSwipeOnOutsidePointerDown(actionWrap)).toBe(false);
  });

  it("closes when tapping outside row and actions", () => {
    const outside = document.createElement("div");
    expect(shouldCloseCallLogSwipeOnOutsidePointerDown(outside)).toBe(true);
  });

  it("returns false for non-Element targets", () => {
    expect(shouldCloseCallLogSwipeOnOutsidePointerDown(null)).toBe(false);
    expect(shouldCloseCallLogSwipeOnOutsidePointerDown(document.createTextNode("x"))).toBe(false);
  });
});
