// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { predecodeMessengerLocalPreviews } from "@/lib/community-messenger/attachment/messenger-predecode-local-previews";

describe("predecodeMessengerLocalPreviews", () => {
  const proto = HTMLImageElement.prototype as unknown as { decode?: () => Promise<void> };
  const prev = proto.decode;
  afterEach(() => {
    vi.useRealTimers();
    if (prev) proto.decode = prev;
    else delete proto.decode;
  });

  it("모든 사진 디코딩이 끝나면 바로 끝나고 크기를 돌려준다", async () => {
    const calls: string[] = [];
    proto.decode = function (this: HTMLImageElement) {
      calls.push(this.src);
      return Promise.resolve();
    };
    const nw = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalWidth");
    const nh = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "naturalHeight");
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", { configurable: true, get: () => 1600 });
    Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", { configurable: true, get: () => 1200 });
    try {
      const sizes = await predecodeMessengerLocalPreviews(["blob:a", "blob:b"]);
      expect(calls).toEqual(["blob:a", "blob:b"]);
      expect(sizes).toEqual([
        { width: 1600, height: 1200 },
        { width: 1600, height: 1200 },
      ]);
    } finally {
      if (nw) Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", nw);
      if (nh) Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", nh);
    }
  });

  it("오래 걸리면 상한 시간 뒤 기다리지 않는다 (전송 지연 상한)", async () => {
    vi.useFakeTimers();
    proto.decode = () => new Promise<void>(() => {});
    let done = false;
    let sizes: unknown = undefined;
    const p = predecodeMessengerLocalPreviews(["blob:slow"], 300).then((s) => {
      sizes = s;
      done = true;
    });
    await vi.advanceTimersByTimeAsync(299);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await p;
    expect(done).toBe(true);
    expect(sizes).toEqual([null]);
  });
});
