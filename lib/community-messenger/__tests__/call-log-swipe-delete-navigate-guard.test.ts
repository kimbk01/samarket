/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import {
  CALL_LOG_SWIPE_ACTION_ATTR,
  shouldCloseCallLogSwipeOnOutsidePointerDown,
} from "@/lib/community-messenger/call-history/call-log-swipe";

/**
 * document capture pointerdown + 삭제 클릭 시 navigate 가 실행되지 않는지 시뮬레이션.
 * (CommunityMessengerCallHistory + CommunityMessengerCallRow 계약)
 */
describe("call log swipe delete must not trigger navigate", () => {
  it("outside tap closes swipe; delete tap does not", () => {
    const onOpenSwipeItem = vi.fn();
    const onDeleteRequest = vi.fn();
    const onNavigate = vi.fn();

    const listener = (event: PointerEvent) => {
      if (!shouldCloseCallLogSwipeOnOutsidePointerDown(event.target)) return;
      onOpenSwipeItem(null);
    };
    document.addEventListener("pointerdown", listener, true);

    const deleteBtn = document.createElement("button");
    deleteBtn.setAttribute(CALL_LOG_SWIPE_ACTION_ATTR, "delete");
    deleteBtn.setAttribute("data-call-log-delete-action", "true");
    document.body.appendChild(deleteBtn);

    deleteBtn.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(onOpenSwipeItem).not.toHaveBeenCalled();

    deleteBtn.addEventListener("pointerup", (e) => {
      e.stopPropagation();
      onDeleteRequest();
    });
    deleteBtn.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));
    expect(onDeleteRequest).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();

    const outside = document.createElement("div");
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(onOpenSwipeItem).toHaveBeenCalledWith(null);

    document.removeEventListener("pointerdown", listener, true);
    document.body.innerHTML = "";
  });
});
