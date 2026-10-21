/**
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessengerComposerSector } from "@/components/community-messenger/line-ui/messenger-composer-sector";
import {
  MESSENGER_COMPOSER_TEXTAREA_MAX_HEIGHT_CLASS,
  MESSENGER_COMPOSER_TEXTAREA_MAX_HEIGHT_PX,
  MESSENGER_DELIVERY_COMPOSER_ROW_CLASS,
  MESSENGER_DELIVERY_COMPOSER_SECTOR_HEIGHT_CLASS,
  resolveMessengerComposerTextareaHeight,
} from "@/lib/ui/messenger-chat-viewport-tuning";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("K-2 textarea height resolver", () => {
  it("1 line min, 5 lines (100px) max, scroll beyond", () => {
    expect(MESSENGER_COMPOSER_TEXTAREA_MAX_HEIGHT_PX).toBe(100);
    expect(MESSENGER_COMPOSER_TEXTAREA_MAX_HEIGHT_CLASS).toBe(`max-h-[${MESSENGER_COMPOSER_TEXTAREA_MAX_HEIGHT_PX}px]`);
    expect(resolveMessengerComposerTextareaHeight(0)).toEqual({ heightPx: 20, scrollable: false });
    expect(resolveMessengerComposerTextareaHeight(60)).toEqual({ heightPx: 60, scrollable: false });
    expect(resolveMessengerComposerTextareaHeight(100)).toEqual({ heightPx: 100, scrollable: false });
    expect(resolveMessengerComposerTextareaHeight(180)).toEqual({ heightPx: 100, scrollable: true });
  });
  it("row/sector keep min height but no fixed max-h", () => {
    expect(MESSENGER_DELIVERY_COMPOSER_SECTOR_HEIGHT_CLASS).toContain("min-h-[44px]");
    expect(MESSENGER_DELIVERY_COMPOSER_SECTOR_HEIGHT_CLASS).not.toMatch(/max-h-|(^|\s)h-\[/);
    expect(MESSENGER_DELIVERY_COMPOSER_ROW_CLASS).toContain("min-h-[44px]");
    expect(MESSENGER_DELIVERY_COMPOSER_ROW_CLASS).not.toContain("max-h");
    const css = readFileSync(path.resolve(__dirname, "../../../../app/delivery-chat-room.css"), "utf8");
    expect(css).not.toContain("max-height: 36px");
  });
});

describe("K-1 / K-2 / K-6 MessengerComposerSector", () => {
  let host: HTMLDivElement;
  let root: Root;
  let scrollHeight = 20;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(() => scrollHeight);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  const render = (draft: string, extra: Record<string, unknown> = {}) =>
    act(() =>
      root.render(
        createElement(MessengerComposerSector, {
          draft,
          placeholder: "msg",
          textareaRef: createRef<HTMLTextAreaElement>(),
          onDraftChange: () => undefined,
          onAttach: () => undefined,
          onSend: () => undefined,
          onTextareaKeyDown: () => undefined,
          onTextareaFocus: () => undefined,
          onTextareaBlur: () => undefined,
          textareaDisabled: false,
          sendDisabled: false,
          sendAriaLabel: "send",
          attachAriaLabel: "attach",
          t: (k: string) => k,
          ...extra,
        } as never)
      )
    );

  it("enterKeyHint=enter and grows with content, resets to 1 line when emptied", () => {
    scrollHeight = 20;
    render("");
    const ta = host.querySelector("textarea")!;
    expect(ta.getAttribute("enterkeyhint")).toBe("enter");
    expect(ta.style.height).toBe("20px");
    scrollHeight = 60;
    render("a\nb\nc");
    expect(ta.style.height).toBe("60px");
    scrollHeight = 240;
    render("a\nb\nc\nd\ne\nf\ng");
    expect(ta.style.height).toBe("100px");
    scrollHeight = 20;
    render("");
    expect(ta.style.height).toBe("20px");
  });

  it("wires composition handlers", () => {
    const start = vi.fn();
    const end = vi.fn();
    render("", { onTextareaCompositionStart: start, onTextareaCompositionEnd: end });
    const ta = host.querySelector("textarea")!;
    act(() => {
      ta.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      ta.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("pill has a focus-within visual", () => {
    render("");
    const pill = host.querySelector("[data-delivery-composer-pill]")!;
    expect(pill.className).toContain("focus-within:border-sam-primary");
  });
});
