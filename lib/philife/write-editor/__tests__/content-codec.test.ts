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
  it("파싱 → 직렬화 → 재파싱: 원문·줄바꿈·이미지 URL·순서 무손실", () => {
    const rows = JSON.parse(readFileSync(fixture!, "utf8")) as Array<{ id: string; origin_kind: string; content: string }>;
    type Bucket = { total: number; ok: number; fallback: number; contentMismatch: number; reparseMismatch: number; lineMismatch: number; imageMismatch: number; imageLines: number; reasons: Record<string, number> };
    const mk = (): Bucket => ({ total: 0, ok: 0, fallback: 0, contentMismatch: 0, reparseMismatch: 0, lineMismatch: 0, imageMismatch: 0, imageLines: 0, reasons: {} });
    const by: Record<string, Bucket> = {};
    const failures: string[] = [];
    for (const r of rows) {
      const b = (by[r.origin_kind] ??= mk());
      b.total += 1;
      const content = r.content ?? "";
      const parsed = parseCommunityBodyToBlocks(content);
      if (!parsed.ok) {
        b.fallback += 1;
        b.reasons[parsed.reason] = (b.reasons[parsed.reason] ?? 0) + 1;
        continue;
      }
      const snap = communityDocToSnapshot(communityBodyBlocksToDoc(parsed.blocks) as never);
      const reparsed = parseCommunityBodyToBlocks(snap.content);
      const expectedImages = parsed.blocks.flatMap((x) => (x.type === "image" ? [x.src] : []));
      b.imageLines += expectedImages.length;
      let bad = false;
      if (snap.content !== content) {
        b.contentMismatch += 1;
        bad = true;
      }
      if (!reparsed.ok || JSON.stringify(reparsed.blocks) !== JSON.stringify(parsed.blocks)) {
        b.reparseMismatch += 1;
        bad = true;
      }
      if (snap.content.split("\n").length !== content.split("\n").length) {
        b.lineMismatch += 1;
        bad = true;
      }
      if (JSON.stringify(snap.imageUrls) !== JSON.stringify(expectedImages)) {
        b.imageMismatch += 1;
        bad = true;
      }
      if (bad) failures.push(r.id);
      else b.ok += 1;
    }
    console.info("[community-body-roundtrip]", JSON.stringify({ rows: rows.length, byOrigin: by, failures }));
    expect(failures).toEqual([]);
  });
});
