import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIG = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20271114230000_community_post_image_gc_unreferenced_set_match.sql"),
  "utf8"
);

describe("커뮤니티 사진 정리 미참조 판정 — 집합 대조 + 잔여만 position 재확인 (F · 2026-11-14)", () => {
  it("참조 글자에서 uuid 를 한 번만 뽑아 집합으로 대조한다", () => {
    expect(MIG).toMatch(/found as materialized/);
    expect(MIG).toMatch(/regexp_matches\(r\.t, '\(\[0-9a-f\]\{8\}-/);
  });

  it("집합에 없는 후보만 기존 position() 으로 재확인 — 참조된 사진을 미참조로 판정하지 않는다", () => {
    const restIdx = MIG.indexOf("rest as materialized");
    const posIdx = MIG.indexOf("position(x.stem in r.t)");
    expect(restIdx).toBeGreaterThan(0);
    expect(posIdx).toBeGreaterThan(restIdx);
  });

  it("참조 열 목록은 운영 현재 정의와 같은 50줄 — 옛 모임·community_chat_* 표 없음", () => {
    expect(MIG.match(/union all select/g)?.length).toBe(50);
    expect(MIG).not.toMatch(/public\.meeting/);
    expect(MIG).not.toMatch(/public\.community_chat_/);
  });

  it("권한은 service_role 만", () => {
    expect(MIG).toMatch(/grant execute on function public\.community_post_image_unreferenced\(text\[\]\) to service_role/);
  });
});
