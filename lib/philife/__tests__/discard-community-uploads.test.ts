import { afterEach, describe, expect, it, vi } from "vitest";
import { COMMUNITY_UPLOAD_DISCARD_URL, discardCommunityUploads } from "@/lib/philife/discard-community-uploads";

describe("discardCommunityUploads — 안 쓴 사진 정리 요청", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("20장 넘게 올렸다 지운 경우도 전부 보낸다(20장씩 나눠) · 같은 주소는 1번", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", fetchMock);
    const urls = Array.from({ length: 45 }, (_, i) => `https://x/post-images/u/community/${i}.webp`);
    discardCommunityUploads([...urls, urls[0]!, " "]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sent = fetchMock.mock.calls.flatMap(
      (c) => (JSON.parse(String((c as unknown as [string, RequestInit])[1].body)) as { urls: string[] }).urls
    );
    expect(sent).toHaveLength(45);
    expect(new Set(sent).size).toBe(45);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(COMMUNITY_UPLOAD_DISCARD_URL);
  });

  it("보낼 것이 없으면 요청하지 않는다", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    discardCommunityUploads([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
