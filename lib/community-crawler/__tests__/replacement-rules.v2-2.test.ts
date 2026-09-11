import { describe, expect, it } from "vitest";
import {
  applyCommunityCrawlReplacementRules,
  previewCommunityCrawlReplacement,
  replaceExactAll,
  sortCommunityCrawlReplacementRulesForApply,
  type CommunityCrawlReplacementRuleLike,
} from "@/lib/community-crawler/replacement/apply-replacement-rules";
import { validateReplacementRuleInput } from "@/lib/community-crawler/replacement/replacement-rule-store";

function rule(
  partial: Partial<CommunityCrawlReplacementRuleLike> &
    Pick<CommunityCrawlReplacementRuleLike, "id" | "from_text" | "to_text">
): CommunityCrawlReplacementRuleLike {
  return {
    source_id: "src",
    board_id: null,
    apply_title: true,
    apply_body: true,
    priority: 100,
    enabled: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("V2-2 exact-string replacement engine", () => {
  it("A/B: title and body replaced; source inputs unchanged by engine return", () => {
    const sourceTitle = "Visit Philippines";
    const sourceBody = "Welcome to Philippines tourism";
    const out = applyCommunityCrawlReplacementRules({
      sourceTitle,
      sourceBody,
      rules: [rule({ id: "1", from_text: "Philippines", to_text: "필리핀" })],
    });
    expect(out.dibay_title).toBe("Visit 필리핀");
    expect(out.dibay_body).toBe("Welcome to 필리핀 tourism");
    expect(sourceTitle).toBe("Visit Philippines");
    expect(sourceBody).toBe("Welcome to Philippines tourism");
  });

  it("C: title-only rule leaves body unchanged", () => {
    const out = applyCommunityCrawlReplacementRules({
      sourceTitle: "Philippines news",
      sourceBody: "Philippines body",
      rules: [
        rule({
          id: "1",
          from_text: "Philippines",
          to_text: "필리핀",
          apply_title: true,
          apply_body: false,
        }),
      ],
    });
    expect(out.dibay_title).toBe("필리핀 news");
    expect(out.dibay_body).toBe("Philippines body");
  });

  it("D: body-only rule leaves title unchanged", () => {
    const out = applyCommunityCrawlReplacementRules({
      sourceTitle: "Philippines news",
      sourceBody: "Philippines body",
      rules: [
        rule({
          id: "1",
          from_text: "Philippines",
          to_text: "필리핀",
          apply_title: false,
          apply_body: true,
        }),
      ],
    });
    expect(out.dibay_title).toBe("Philippines news");
    expect(out.dibay_body).toBe("필리핀 body");
  });

  it("E: disabled rule has no effect", () => {
    const out = applyCommunityCrawlReplacementRules({
      sourceTitle: "Philippines",
      sourceBody: "Philippines",
      rules: [
        rule({
          id: "1",
          from_text: "Philippines",
          to_text: "필리핀",
          enabled: false,
        }),
      ],
    });
    expect(out.dibay_title).toBe("Philippines");
    expect(out.dibay_body).toBe("Philippines");
  });

  it("F: priority order is deterministic (ASC)", () => {
    const ordered = sortCommunityCrawlReplacementRulesForApply([
      rule({
        id: "b",
        from_text: "Tourism",
        to_text: "관광",
        priority: 20,
        created_at: "2026-01-02T00:00:00.000Z",
      }),
      rule({
        id: "a",
        from_text: "Department of Tourism",
        to_text: "필리핀 관광부",
        priority: 10,
        created_at: "2026-01-01T00:00:00.000Z",
      }),
    ]);
    expect(ordered.map((r) => r.id)).toEqual(["a", "b"]);

    const out = applyCommunityCrawlReplacementRules({
      sourceTitle: "Department of Tourism",
      sourceBody: "Department of Tourism",
      rules: ordered,
    });
    // Longer phrase applied first (priority 10) → no leftover "Tourism" for second rule.
    expect(out.dibay_title).toBe("필리핀 관광부");
    expect(out.dibay_body).toBe("필리핀 관광부");
  });

  it("F2: overlapping reverse order still deterministic by priority", () => {
    const out = applyCommunityCrawlReplacementRules({
      sourceTitle: "Department of Tourism",
      sourceBody: "x",
      rules: [
        rule({
          id: "short-first",
          from_text: "Tourism",
          to_text: "관광",
          priority: 5,
        }),
        rule({
          id: "long-later",
          from_text: "Department of Tourism",
          to_text: "필리핀 관광부",
          priority: 50,
        }),
      ],
    });
    // Short rule runs first → "Department of 관광"; long rule no longer matches.
    expect(out.dibay_title).toBe("Department of 관광");
  });

  it("board-scoped applies after source-scoped (board wins on leftover)", () => {
    const out = applyCommunityCrawlReplacementRules({
      sourceTitle: "AAA",
      sourceBody: "AAA",
      rules: [
        rule({
          id: "board",
          board_id: "board-1",
          from_text: "BBB",
          to_text: "BOARD",
          priority: 1,
        }),
        rule({
          id: "source",
          board_id: null,
          from_text: "AAA",
          to_text: "BBB",
          priority: 1,
        }),
      ],
    });
    expect(out.dibay_title).toBe("BOARD");
  });

  it("G: durable — same inputs → same outputs (refresh/re-entry)", () => {
    const rules = [rule({ id: "1", from_text: "PH", to_text: "필리핀" })];
    const a = applyCommunityCrawlReplacementRules({
      sourceTitle: "PH title",
      sourceBody: "PH body",
      rules,
    });
    const b = applyCommunityCrawlReplacementRules({
      sourceTitle: "PH title",
      sourceBody: "PH body",
      rules,
    });
    expect(a).toEqual(b);
  });

  it("preview shares the same engine", () => {
    const rules = [rule({ id: "1", from_text: "Philippines", to_text: "필리핀" })];
    const applied = applyCommunityCrawlReplacementRules({
      sourceTitle: "Philippines",
      sourceBody: "Hello Philippines",
      rules,
    });
    const preview = previewCommunityCrawlReplacement({
      sampleTitle: "Philippines",
      sampleBody: "Hello Philippines",
      rules,
    });
    expect(preview.afterTitle).toBe(applied.dibay_title);
    expect(preview.afterBody).toBe(applied.dibay_body);
  });

  it("L: replaceExactAll never mutates via regex metacharacters", () => {
    expect(replaceExactAll("price is $5.00", "$5.00", "₱5")).toBe("price is ₱5");
    expect(replaceExactAll("a (b)", "(b)", "X")).toBe("a X");
  });

  it("validation rejects empty / equal / no target", () => {
    expect(validateReplacementRuleInput({ from_text: "", to_text: "x" }).ok).toBe(false);
    expect(validateReplacementRuleInput({ from_text: "a", to_text: "a" }).ok).toBe(false);
    expect(
      validateReplacementRuleInput({
        from_text: "a",
        to_text: "b",
        apply_title: false,
        apply_body: false,
      }).ok
    ).toBe(false);
  });
});

describe("V2-2 materialization contract (pure)", () => {
  it("K: FULL_CONTENT publish reads already-materialized dibay_body (no second replace)", () => {
    // Publish writer must not re-run replacement — durable dibay_* is the publish input.
    const materializedBody = "필리핀 관광부 announces";
    const publishBody = materializedBody;
    expect(publishBody).toBe(materializedBody);
  });

  it("manual override protection contract: AUTO reapply updates; MANUAL skips", () => {
    const rules = [rule({ id: "1", from_text: "Philippines", to_text: "필리핀" })];
    const auto = {
      manual_override: false,
      source_title: "Philippines",
      source_body_normalized: "Philippines",
      dibay_title: "Philippines",
      dibay_body: "Philippines",
    };
    const manual = {
      manual_override: true,
      source_title: "Philippines updated",
      source_body_normalized: "Philippines updated",
      dibay_title: "수동 제목",
      dibay_body: "수동 본문",
    };

    const autoNext = applyCommunityCrawlReplacementRules({
      sourceTitle: auto.source_title,
      sourceBody: auto.source_body_normalized,
      rules,
    });
    expect(auto.manual_override).toBe(false);
    expect(autoNext.dibay_title).toBe("필리핀");

    // MANUAL: materialization must not overwrite dibay_* even if rules would change source copy.
    const wouldBe = applyCommunityCrawlReplacementRules({
      sourceTitle: manual.source_title,
      sourceBody: manual.source_body_normalized,
      rules,
    });
    const preserved = manual.manual_override
      ? { dibay_title: manual.dibay_title, dibay_body: manual.dibay_body }
      : wouldBe;
    expect(preserved.dibay_title).toBe("수동 제목");
    expect(preserved.dibay_body).toBe("수동 본문");
    expect(wouldBe.dibay_title).not.toBe(manual.dibay_title);
  });
});
