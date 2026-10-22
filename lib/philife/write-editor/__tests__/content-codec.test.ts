import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMMUNITY_IMAGE_NODE,
  communityBodyBlocksToDoc,
  communityDocToSnapshot,
  parseCommunityBodyToBlocks,
  serializeCommunityBodyBlocks,
  textToCommunityBodyBlocks,
} from "@/lib/philife/write-editor/content-codec";

const IMG = "https://x.supabase.co/storage/v1/object/public/post-images/u1/community/a.webp";
const IMG2 = "https://x.supabase.co/storage/v1/object/public/post-images/u1/community/b.webp";

function roundTrip(content: string): string {
  const r = parseCommunityBodyToBlocks(content);
  if (!r.ok) throw new Error(r.reason);
  return communityDocToSnapshot(communityBodyBlocksToDoc(r.blocks) as never).content;
}

describe("community body codec — 무손실 왕복", () => {
  const samples = [
    "",
    "한 줄",
    "첫 줄\n둘째 줄",
    "문단\n\n빈 줄 뒤 문단\n\n\n세 줄 띄움",
    "  앞뒤 공백 유지  \n\t탭",
    `글\n\n![](${IMG})\n\n이미지 다음 글`,
    `![](${IMG})\n![alt 텍스트](${IMG2})`,
    `글\n![](${IMG})`,
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ\n영상 아래 글",
    "#해시태그 #필리핀 생활 #tag_1",
    "이모지 😀👍 그리고 한글 조합 ㄱㄴ",
    "URL 문장 안 https://example.com/a?b=c 링크",
    "![]( 공백 )",
  ];
  it.each(samples.filter((s) => !s.includes("( 공백 )")))("parse→doc→serialize 원문 동일: %j", (c) => {
    expect(roundTrip(c)).toBe(c);
  });

  it("이미지 블록과 문단 순서를 보존한다", () => {
    const r = parseCommunityBodyToBlocks(`a\n![](${IMG})\nb\n![x](${IMG2})`);
    expect(r.ok && r.blocks.map((b) => b.type)).toEqual(["paragraph", "image", "paragraph", "image"]);
    const snap = communityDocToSnapshot(communityBodyBlocksToDoc(r.ok ? r.blocks : []) as never);
    expect(snap.imageUrls).toEqual([IMG, IMG2]);
  });

  it("무손실로 다룰 수 없는 본문은 거부 — 기존 편집기로 연다", () => {
    expect(parseCommunityBodyToBlocks("a\r\nb")).toEqual({ ok: false, reason: "carriage_return" });
    expect(parseCommunityBodyToBlocks(`문장 안 ![](${IMG}) 이미지`)).toEqual({ ok: false, reason: "inline_image" });
    expect(parseCommunityBodyToBlocks(` ![](${IMG})`)).toEqual({ ok: false, reason: "inline_image" });
    expect(parseCommunityBodyToBlocks("![]( 공백 )")).toEqual({ ok: false, reason: "inline_image" });
  });

  it("업로드 중·실패 이미지는 저장 본문에서 빠지고 개수로 보고된다", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "글" }] },
        { type: COMMUNITY_IMAGE_NODE, attrs: { src: IMG, alt: "", status: "done" } },
        { type: COMMUNITY_IMAGE_NODE, attrs: { src: "", alt: "", status: "uploading" } },
        { type: COMMUNITY_IMAGE_NODE, attrs: { src: "", alt: "", status: "failed" } },
      ],
    };
    const snap = communityDocToSnapshot(doc);
    expect(snap.content).toBe(`글\n![](${IMG})`);
    expect(snap).toMatchObject({ uploadingCount: 1, failedCount: 1, imageNodeCount: 3, imageUrls: [IMG] });
  });

  it("빈 본문은 빈 문단 하나로 열린다", () => {
    expect(communityBodyBlocksToDoc([])).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(serializeCommunityBodyBlocks([{ type: "paragraph", text: "" }])).toBe("");
  });

  it("붙여넣기 텍스트: CRLF 정리 + 독립 이미지 줄 인식", () => {
    expect(textToCommunityBodyBlocks(`a\r\n![](${IMG})\r\nb`)).toEqual([
      { type: "paragraph", text: "a" },
      { type: "image", alt: "", src: IMG },
      { type: "paragraph", text: "b" },
    ]);
  });
});

/**
 * 운영 데이터 왕복 검증 — 저장소에 운영 데이터를 넣지 않는다.
 * `COMMUNITY_BODY_ROUNDTRIP_FIXTURE=<scratch json>` 일 때만 실행(로컬 1회 검증용).
 */
const fixture = process.env.COMMUNITY_BODY_ROUNDTRIP_FIXTURE;
describe.runIf(Boolean(fixture && existsSync(fixture)))("운영 게시글 왕복(읽기 전용 스냅샷)", () => {
  it("파싱 가능한 본문은 모두 원문과 바이트 동일, 불가 본문은 사유와 함께 기존 편집기 경로", () => {
    const rows = JSON.parse(readFileSync(fixture!, "utf8")) as Array<{ id: string; origin_kind: string; content: string }>;
    const out = { total: rows.length, ok: 0, fallback: 0, mismatch: 0, memberTotal: 0, memberOk: 0, reasons: {} as Record<string, number> };
    for (const r of rows) {
      const parsed = parseCommunityBodyToBlocks(r.content);
      if (r.origin_kind === "member") out.memberTotal += 1;
      if (!parsed.ok) {
        out.fallback += 1;
        out.reasons[parsed.reason] = (out.reasons[parsed.reason] ?? 0) + 1;
        continue;
      }
      const back = communityDocToSnapshot(communityBodyBlocksToDoc(parsed.blocks) as never).content;
      if (back === r.content) {
        out.ok += 1;
        if (r.origin_kind === "member") out.memberOk += 1;
      } else out.mismatch += 1;
    }
    console.info("[community-body-roundtrip]", JSON.stringify(out));
    expect(out.mismatch).toBe(0);
    expect(out.memberOk).toBe(out.memberTotal);
  });
});
