// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginMessengerRoomEntrySnapshot,
  dismissMessengerRoomEntrySnapshot,
  hasMessengerRoomEntrySnapshot,
  revealMessengerRoomEntrySnapshot,
  runMessengerRoomExitWithSnapshot,
} from "@/lib/community-messenger/room/messenger-page-snapshot-transition";

function mountShell(html: string): HTMLElement {
  document.body.innerHTML = `<div class="app-shell">${html}</div>`;
  return document.querySelector(".app-shell") as HTMLElement;
}

function layers(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-cm-page-snapshot]"));
}

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = ((q: string) => ({ matches: false, media: q })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  dismissMessengerRoomEntrySnapshot();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("room entry/exit snapshot (no white screen)", () => {
  it("entry: copies the list on top with styling markers intact, ids removed, clone flagged", () => {
    mountShell(
      `<div data-messenger-shell data-cm-messenger-home-root><main data-main-hub-scroll-body id="x"><p>목록</p></main></div>`
    );
    beginMessengerRoomEntrySnapshot();
    expect(hasMessengerRoomEntrySnapshot()).toBe(true);
    const [layer] = layers();
    expect(layer).toBeTruthy();
    expect(layer!.getAttribute("aria-hidden")).toBe("true");
    expect(layer!.style.pointerEvents).toBe("none");
    expect(layer!.textContent).toContain("목록");
    // styling markers stay on the copy (colour tokens depend on [data-messenger-shell])
    expect(layer!.querySelector("[data-messenger-shell]")).toBeTruthy();
    expect(layer!.querySelector("[data-cm-snapshot-clone]")).toBeTruthy();
    // ids only on the real screen; the real screen is still the first match
    expect(document.querySelectorAll("#x").length).toBe(1);
    expect(document.querySelector(".app-shell")!.hasAttribute("data-cm-snapshot-clone")).toBe(false);
  });

  it("entry: spinner appears if the room is slow, layer always removed by the time limit", () => {
    mountShell(`<p>목록</p>`);
    beginMessengerRoomEntrySnapshot();
    vi.advanceTimersByTime(500);
    expect(layers()[0]!.querySelector(".animate-spin")).toBeTruthy();
    vi.advanceTimersByTime(3500);
    expect(layers().length).toBe(0);
    expect(hasMessengerRoomEntrySnapshot()).toBe(false);
  });

  it("entry reveal: clips from the room's start edge to nothing, then removes", () => {
    mountShell(`<p>목록</p>`);
    beginMessengerRoomEntrySnapshot();
    revealMessengerRoomEntrySnapshot({ durationMs: 360, easing: "ease", startOffsetRatio: 0.9 });
    const layer = layers()[0]!;
    expect(layer.style.clipPath).toBe("inset(0 100% 0 0)");
    expect(layer.style.transition).toContain("clip-path 360ms");
    vi.advanceTimersByTime(500);
    expect(layers().length).toBe(0);
  });

  it("exit: copies the room, navigates immediately, slides out once the list is painted", () => {
    const shell = mountShell(`<div data-messenger-room-animation-phase="idle"><p>대화</p></div>`);
    const raf: Array<() => void> = [];
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      raf.push(cb);
      return raf.length;
    });
    const navigate = vi.fn(() => {
      shell.innerHTML = `<div data-cm-messenger-home-root><p>목록</p></div>`;
    });
    expect(runMessengerRoomExitWithSnapshot({ navigate, durationMs: 280, easing: "ease" })).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);
    const layer = layers()[0]!;
    expect(layer.textContent).toContain("대화");
    for (let i = 0; i < 4 && raf.length; i += 1) raf.shift()!();
    expect(layer.style.transform).toMatch(/translate3d\(\d+px/);
    vi.advanceTimersByTime(400);
    expect(layers().length).toBe(0);
    vi.unstubAllGlobals();
  });

  it("reduced motion: does nothing (falls back to existing behaviour)", () => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as unknown as typeof window.matchMedia;
    mountShell(`<p>목록</p>`);
    beginMessengerRoomEntrySnapshot();
    expect(layers().length).toBe(0);
    expect(runMessengerRoomExitWithSnapshot({ navigate: () => {}, durationMs: 280, easing: "ease" })).toBe(false);
  });
});
