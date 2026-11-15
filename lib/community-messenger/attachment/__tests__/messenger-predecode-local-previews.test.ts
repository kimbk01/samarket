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

  it("모든 사진 디코딩이 끝나면 바로 끝난다", async () => {
    const calls: string[] = [];
    proto.decode = function (this: HTMLImageElement) {
      calls.push(this.src);
      return Promise.resolve();
    };
    await predecodeMessengerLocalPreviews(["blob:a", "blob:b"]);
    expect(calls).toEqual(["blob:a", "blob:b"]);
  });

  it("오래 걸리면 상한 시간 뒤 기다리지 않는다 (전송 지연 상한)", async () => {
    vi.useFakeTimers();
    proto.decode = () => new Promise<void>(() => {});
    let done = false;
    const p = predecodeMessengerLocalPreviews(["blob:slow"], 300).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(299);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await p;
    expect(done).toBe(true);
  });
});
