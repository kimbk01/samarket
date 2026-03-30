import { describe, expect, it } from "vitest";
import { deterministicUuid } from "@/lib/server/deterministic-uuid";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("deterministicUuid", () => {
  it("RFC 4122 v4 형식(네 번째 그룹 4 hex)을 만족한다", () => {
    const u = deterministicUuid("samarket_neighborhood_location", "ph:Manila:Ermita");
    expect(u).toMatch(UUID_V4);
    const parts = u.split("-");
    expect(parts).toHaveLength(5);
    expect(parts[3]!.length).toBe(4);
    expect(parts[4]!.length).toBe(12);
  });

  it("동일 입력은 항상 동일 UUID", () => {
    const a = deterministicUuid("ns", "key");
    const b = deterministicUuid("ns", "key");
    expect(a).toBe(b);
  });

  it("다른 입력은 다른 UUID", () => {
    expect(deterministicUuid("ns", "a")).not.toBe(deterministicUuid("ns", "b"));
  });
});
