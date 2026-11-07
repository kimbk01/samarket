/**
 * 설계 2026-11-08 ① — 고객 문의 「관련 항목」에 uuid 대신 표시용 제목. 제목은 표시만(권한·저장 = 종류+id).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSupportEnterHref, supportContextFromEnterQuery } from "@/lib/support/support-enter-href";
import { buildMemberSupportContext } from "@/lib/support/support-context";
import { initSupportTriageFromContext, buildTriageOpenContext } from "@/lib/support/support-triage-model";

describe("① 관련 항목 표시용 제목", () => {
  it("주소 → 맥락: 제목이 넘어가고 80자로 자른다", () => {
    const href = buildSupportEnterHref({ category: "AD", referenceType: "TRADE_POST", referenceId: "p1", referenceTitle: "  글   제목 " + "x".repeat(100) });
    const ctx = supportContextFromEnterQuery(new URL(href, "https://x").searchParams)!;
    expect(ctx.referenceType).toBe("TRADE_POST");
    expect(ctx.referenceId).toBe("p1");
    expect(ctx.referenceTitle?.startsWith("글 제목 ")).toBe(true);
    expect(ctx.referenceTitle!.length).toBe(80);
  });

  it("id 가 없으면 제목도 넘기지 않음 · 제목 없으면 지금과 같음", () => {
    expect(buildSupportEnterHref({ category: "AD", referenceTitle: "t" })).not.toContain("referenceTitle");
    const ctx = buildMemberSupportContext({ enabled: true, category: "AD", sourceSurface: "x", referenceType: "TRADE_POST", referenceId: "p1" });
    expect("referenceTitle" in ctx).toBe(false);
  });

  it("문의 흐름 상태가 제목을 들고 다니고, 화면은 제목이 있으면 제목을 그린다", () => {
    const ctx = buildMemberSupportContext({ enabled: true, category: "AD", sourceSurface: "x", referenceType: "TRADE_POST", referenceId: "p1", referenceTitle: "글 제목" });
    const st = initSupportTriageFromContext(ctx);
    expect(st.referenceTitle).toBe("글 제목");
    expect(buildTriageOpenContext(st).referenceTitle).toBe("글 제목");
    const flow = readFileSync(join(process.cwd(), "components/support/SupportTriageFlow.tsx"), "utf8");
    expect(flow.match(/state\.referenceTitle \? ` · \$\{state\.referenceTitle\}`/g)?.length).toBe(2);
  });

  it("권한 판정 입력에는 제목이 들어가지 않는다", () => {
    const auth = readFileSync(join(process.cwd(), "lib/support/support-reference-authority.ts"), "utf8");
    expect(auth).not.toContain("referenceTitle");
  });
});
