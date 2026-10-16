import { describe, expect, it } from "vitest";
import { defaultOperatorDraftEdit } from "@/lib/community-operator-import/draft-apply";
import { carryEditToArticle } from "@/lib/community-operator-import/draft-store";
import {
  applyBulkDisplayPure,
  interleaveShuffle,
  itemDueAt,
  normalizeSchedule,
  pickNextItem,
} from "@/lib/community-operator-import/jobs";
import { unthumbnailUrl } from "@/lib/community-operator-import/normalize";
import { articleFetchUrl, knownFeedFor, naverBlogId } from "@/lib/community-operator-import/platforms";
import { toIsoDisplayDate } from "@/lib/community-operator-import/publish";
import type { OperatorNormalizedArticle } from "@/lib/community-operator-import/types";

const article: OperatorNormalizedArticle = {
  sourceSite: "philsamo",
  sourceBoard: "travel",
  sourceBoardLabel: "필리핀 여행",
  canonicalUrl: "https://philsamo.com/bbs/board.php?bo_table=travel&wr_id=64",
  sourceArticleKey: "64",
  title: "휴양지 세부",
  author: "필사모매니저",
  sourcePublishedDate: "2023-10-30T09:16:47.000Z",
  orderedContentBlocks: [{ type: "paragraph", text: "본문" }],
};

/** Deterministic PRNG so shuffles are reproducible in tests. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

describe("interleaveShuffle", () => {
  const items = [
    ...Array.from({ length: 4 }, (_, i) => ({ src: "a", n: i })),
    ...Array.from({ length: 3 }, (_, i) => ({ src: "b", n: i })),
    ...Array.from({ length: 3 }, (_, i) => ({ src: "c", n: i })),
  ];

  it("keeps every item exactly once", () => {
    const out = interleaveShuffle(items, (x) => x.src, seeded(7));
    expect(out).toHaveLength(items.length);
    expect(new Set(out)).toEqual(new Set(items));
  });

  it("never puts the same source twice in a row when avoidable", () => {
    for (let seed = 1; seed < 40; seed++) {
      const out = interleaveShuffle(items, (x) => x.src, seeded(seed));
      for (let i = 1; i < out.length; i++) expect(out[i]!.src).not.toBe(out[i - 1]!.src);
    }
  });

  it("is random (different seeds give different orders)", () => {
    const a = interleaveShuffle(items, (x) => x.src, seeded(1)).map((x) => `${x.src}${x.n}`).join();
    const b = interleaveShuffle(items, (x) => x.src, seeded(99)).map((x) => `${x.src}${x.n}`).join();
    expect(a).not.toBe(b);
  });
});

describe("spread schedule", () => {
  const createdAt = "2026-10-16T00:00:00.000Z";

  it("now mode is always due", () => {
    expect(itemDueAt(null, 5, createdAt)).toBe(0);
    expect(itemDueAt({ mode: "now" }, 5, createdAt)).toBe(0);
  });

  it("spread mode publishes one item per interval from startAt", () => {
    const s = { mode: "spread" as const, startAt: "2026-10-16T01:00:00.000Z", intervalMinutes: 30 };
    expect(new Date(itemDueAt(s, 0, createdAt)).toISOString()).toBe("2026-10-16T01:00:00.000Z");
    expect(new Date(itemDueAt(s, 3, createdAt)).toISOString()).toBe("2026-10-16T02:30:00.000Z");
  });

  it("validates the interval", () => {
    expect(() => normalizeSchedule({ mode: "spread", intervalMinutes: 1 })).toThrow("invalid_spread_interval");
    expect(normalizeSchedule({ mode: "now" })).toBeNull();
    expect(normalizeSchedule({ mode: "spread", startAt: "2026-10-16T01:00:00Z", intervalMinutes: 60 })).toEqual({
      mode: "spread",
      startAt: "2026-10-16T01:00:00.000Z",
      intervalMinutes: 60,
    });
  });

  it("picks the next pending item in publish order with its slot", () => {
    const row = (k: string) => ({ source_site: "s", source_board: "b", source_article_key: k });
    const params = { order: ["s|b|3", "s|b|1", "s|b|2"], schedule: { mode: "spread" as const, startAt: createdAt, intervalMinutes: 60 } };
    const next = pickNextItem([row("2"), row("1")], params, createdAt);
    expect(next?.item.source_article_key).toBe("1");
    expect(new Date(next!.dueAt).toISOString()).toBe("2026-10-16T01:00:00.000Z");
    expect(pickNextItem([], params, createdAt)).toBeNull();
  });
});

describe("bulk 작성자 · 날짜 · 출처", () => {
  const base = defaultOperatorDraftEdit(article);

  it("keeps the draft when nothing is overridden", () => {
    expect(applyBulkDisplayPure({ ...base, displayAuthor: "편집" }, article, {}, "필사모")).toMatchObject({ displayAuthor: "편집" });
  });

  it("applies author modes", () => {
    expect(applyBulkDisplayPure(base, article, { authorMode: "source" }, "필사모").displayAuthor).toBe("필사모");
    expect(applyBulkDisplayPure({ ...base, displayAuthor: "x" }, article, { authorMode: "original" }, "").displayAuthor).toBe("필사모매니저");
    expect(applyBulkDisplayPure(base, article, { authorMode: "custom", customAuthor: " 디바이 편집부 " }, "").displayAuthor).toBe("디바이 편집부");
  });

  it("applies attribution and date modes", () => {
    const hidden = applyBulkDisplayPure(base, article, { showAttribution: false, dateMode: "publish" }, "");
    expect(hidden.showAttribution).toBe(false);
    expect(toIsoDisplayDate(hidden, article)).toBeNull();
    const shown = applyBulkDisplayPure(hidden, article, { showAttribution: true, dateMode: "original" }, "");
    expect(shown.showAttribution).toBe(true);
    expect(toIsoDisplayDate(shown, article)).toBe("2023-10-30T09:16:00.000Z");
  });

  it("re-fetch keeps the operator's 출처 / 날짜 choices", () => {
    const edit = { ...base, showAttribution: false, dateMode: "publish" as const };
    const changed = { ...article, orderedContentBlocks: [...article.orderedContentBlocks, { type: "paragraph" as const, text: "추가" }] };
    expect(carryEditToArticle(edit, article, changed)).toMatchObject({ showAttribution: false, dateMode: "publish" });
  });
});

describe("Korean blog platforms", () => {
  it("Naver blog: id, feed and readable article page", () => {
    expect(naverBlogId("https://blog.naver.com/diadem68")).toBe("diadem68");
    expect(naverBlogId("https://blog.naver.com/PostView.naver?blogId=diadem68&logNo=223")).toBe("diadem68");
    expect(naverBlogId("https://example.com/diadem68")).toBeNull();
    expect(knownFeedFor("https://blog.naver.com/diadem68")).toBe("https://rss.blog.naver.com/diadem68.xml");
    expect(knownFeedFor("https://cesimo.tistory.com/")).toBeNull();
    expect(articleFetchUrl("https://blog.naver.com/diadem68/223456789?fromRss=true&trackingCode=rss")).toBe(
      "https://m.blog.naver.com/diadem68/223456789",
    );
    expect(articleFetchUrl("https://cesimo.tistory.com/329")).toBe("https://cesimo.tistory.com/329");
  });

  it("asks Naver for full-size images instead of the blurred placeholder", () => {
    expect(unthumbnailUrl("https://postfiles.pstatic.net/a/b.jpg?type=w80_blur")).toBe("https://postfiles.pstatic.net/a/b.jpg?type=w966");
    expect(unthumbnailUrl("https://e.com/x.jpg?type=w80_blur")).toBe("https://e.com/x.jpg?type=w80_blur");
  });
});
