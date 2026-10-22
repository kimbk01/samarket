import { describe, expect, it } from "vitest";
import { mergePostBodyImages, resolveMemberPostImages } from "@/lib/philife/post-body-images";

const base = "https://x.supabase.co/storage/v1/object/public/post-images";
const own = (n: string) => `${base}/u1/community/${n}.webp`;
const other = (n: string) => `${base}/u2/community/${n}.webp`;

describe("post body images SSOT", () => {
  it("본문 순서가 우선, 본문 밖 첨부는 뒤에 보존 — 붙여넣기 + 사진 추가 혼합에서 사진 누락 없음 (CM-P1-02)", () => {
    const content = `기사\n\n![](${own("p1")})\n\n본문\n\n![](${own("p2")})`;
    expect(mergePostBodyImages({ content, candidates: [own("f1"), own("p1"), own("f2")] })).toEqual([
      own("p1"),
      own("p2"),
      own("f1"),
      own("f2"),
    ]);
  });

  it("이전 본문에 있던 사진을 본문에서 지우면 후보에서도 빠진다", () => {
    expect(
      mergePostBodyImages({
        content: `글\n![](${own("b")})`,
        previousContent: `글\n![](${own("a")})\n![](${own("b")})`,
        candidates: [own("a"), own("b"), own("g")],
      })
    ).toEqual([own("b"), own("g")]);
  });

  it("갤러리 전용 글(본문에 이미지 없음)은 기존 images 를 그대로 유지", () => {
    expect(mergePostBodyImages({ content: "텍스트만", previousContent: "텍스트만", candidates: [own("a")] })).toEqual([
      own("a"),
    ]);
  });

  it("회원: 본인 post-images 만 허용 — 외부·data·타인 URL 거부 (CM-P2-11)", () => {
    expect(resolveMemberPostImages({ userId: "u1", content: `![](https://evil.example/a.jpg)`, candidates: [] }).ok).toBe(false);
    expect(resolveMemberPostImages({ userId: "u1", content: `![](data:image/png;base64,AAAA)`, candidates: [] }).ok).toBe(false);
    expect(resolveMemberPostImages({ userId: "u1", content: "x", candidates: [other("z")] }).ok).toBe(false);
    expect(resolveMemberPostImages({ userId: "u1", content: `![](${own("a")})`, candidates: [own("b")] })).toEqual({
      ok: true,
      images: [own("a"), own("b")],
    });
  });

  it("수정: 이미 저장돼 있던 URL 은 그대로 허용(기존 글 보존)", () => {
    const legacy = "https://legacy.example/old.jpg";
    expect(
      resolveMemberPostImages({
        userId: "u1",
        content: "본문",
        candidates: [legacy],
        previousContent: "본문",
        previousImages: [legacy],
      })
    ).toEqual({ ok: true, images: [legacy] });
  });

  it("10장 초과는 조용히 자르지 않고 거부", () => {
    const many = Array.from({ length: 11 }, (_, i) => own(`i${i}`));
    const r = resolveMemberPostImages({ userId: "u1", content: "x", candidates: many });
    expect(r).toMatchObject({ ok: false, error: "too_many_images" });
    expect(resolveMemberPostImages({ userId: "u1", content: "x", candidates: many.slice(0, 10) }).ok).toBe(true);
  });
});

describe("관리자 수정 이미지 정합성 계약 (CM-W-07)", () => {
  it("관리자 PATCH 는 native 글에만 같은 규칙을 적용하고 imported 는 건드리지 않는다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/admin/community-admin/community-post-admin-patch.ts", "utf8");
    expect(src).toContain("mergePostBodyImages");
    expect(src).toMatch(/if \(!isImported\) \{[\s\S]*?mergePostBodyImages/);
    expect(src).toContain("syncCommunityPostImageRows");
    // CAS·리비전·감사 경로 유지
    expect(src).toContain('.eq("updated_at", String(before.updated_at))');
    expect(src).toContain("appendCommunityAdminAudit");
  });
});
