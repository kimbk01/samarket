import { describe, expect, it } from "vitest";
import { tradeWriteImagesToDraftRefs } from "@/lib/posts/trade-write-form-session-draft";

/**
 * P0-D 데이터 손실 회귀: 임시저장은 blob URL 을 저장하지 않는다(https 또는 기기 보관 localId) —
 * 그래서 화면 URL 을 해제(삭제·교체·언마운트)해도 초안 사진이 사라지지 않는다.
 */
describe("Blob URL 해제와 임시저장 사진 보존", () => {
  it("blob URL 항목은 localId 로, https 는 url 로 저장되고 blob 문자열은 초안에 남지 않음", () => {
    const refs = tradeWriteImagesToDraftRefs([
      { url: "blob:http://x/1", localId: "loc-1" },
      { url: "https://cdn.example.com/a.jpg" },
      { url: "blob:http://x/2", localId: "loc-2" },
    ] as never);
    expect(refs.imageRefs).toEqual([
      { localId: "loc-1" },
      { url: "https://cdn.example.com/a.jpg" },
      { localId: "loc-2" },
    ]);
    expect(refs.imageUrls).toEqual(["https://cdn.example.com/a.jpg"]);
    expect(JSON.stringify(refs)).not.toContain("blob:");
  });
});
