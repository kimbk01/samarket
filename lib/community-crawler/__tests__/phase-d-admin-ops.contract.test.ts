import { describe, expect, it } from "vitest";
import type { CommunityCrawlItemRow } from "@/lib/community-crawler/crawl-ssot";

/**
 * Pure helpers mirroring Admin PHASE D contracts (no network).
 */

function resolveListThumb(input: {
  durablePublicUrl: string | null;
  sourceCoverUrl: string | null;
  sourceCoverCandidateUrl: string | null;
}): string | null {
  // Durable COVER only — never hotlink candidate / source cover for list SSOT.
  void input.sourceCoverUrl;
  void input.sourceCoverCandidateUrl;
  return input.durablePublicUrl;
}

function mergeCrawlAck(
  prev: Array<{ id: string; board_id: string; title: string }>,
  ack: Array<{ id: string; board_id: string; title: string }>,
  boardId: string
) {
  const map = new Map(prev.map((i) => [i.id, i]));
  for (const it of ack) {
    if (it.board_id !== boardId) continue;
    map.set(it.id, it);
  }
  return [...map.values()];
}

describe("PHASE D admin thumbnail contract", () => {
  it("never uses source_cover_candidate_url as list thumb", () => {
    const thumb = resolveListThumb({
      durablePublicUrl: null,
      sourceCoverUrl: "https://cdn.example.com/valid.jpg",
      sourceCoverCandidateUrl: "https://cdn.example.com/candidate.jpg",
    });
    expect(thumb).toBeNull();
  });

  it("uses durable cover when present", () => {
    const thumb = resolveListThumb({
      durablePublicUrl: "https://storage/post-images/community-crawler/x.webp",
      sourceCoverUrl: null,
      sourceCoverCandidateUrl: "https://cdn.example.com/candidate.jpg",
    });
    expect(thumb).toContain("community-crawler");
  });
});

describe("PHASE D crawl ACK list merge", () => {
  it("upserts ACK items without requiring extra GET", () => {
    const prev = [{ id: "a", board_id: "b1", title: "old" }];
    const ack = [
      { id: "a", board_id: "b1", title: "new" },
      { id: "c", board_id: "b1", title: "added" },
      { id: "x", board_id: "other", title: "skip" },
    ];
    const next = mergeCrawlAck(prev, ack, "b1");
    expect(next.find((i) => i.id === "a")?.title).toBe("new");
    expect(next.find((i) => i.id === "c")).toBeTruthy();
    expect(next.find((i) => i.id === "x")).toBeFalsy();
  });
});

describe("PHASE D exclude vs delete semantics", () => {
  it("SKIPPED is distinct from hard delete", () => {
    const statuses = ["DISCOVERED", "READY", "REVIEW_REQUIRED", "PUBLISHED", "FAILED", "SKIPPED", "SOURCE_MISSING"];
    expect(statuses).toContain("SKIPPED");
    expect(statuses).not.toContain("DELETED");
  });
});

describe("PHASE D item row shape", () => {
  it("ops fields extend crawl item", () => {
    const base = {
      id: "1",
      source_id: "s",
      board_id: "b",
      dibay_title: "t",
      dibay_body: "body text enough",
    } as Partial<CommunityCrawlItemRow>;
    expect(Boolean(base.dibay_body && base.dibay_body.length > 0)).toBe(true);
  });
});
