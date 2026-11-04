/**
 * 광고 ② D-12·PB-26·PB-29 (2026-11-04) — 고객 화면 날짜·시각 PHT(Asia/Manila) 고정.
 * 기기 시간대(TZ)를 바꿔도 같은 문자열 · ko 「11월 6일 18:00」 · en 「Nov 6, 18:00」 · 24시간제.
 */
import { afterEach, describe, expect, it } from "vitest";
import { formatPhtDisplayDateTime } from "@/lib/time/format-pht-display";

const prevTz = process.env.TZ;
afterEach(() => {
  if (prevTz === undefined) delete process.env.TZ;
  else process.env.TZ = prevTz;
});

/** 2026-11-06 10:00 UTC = 18:00 PHT */
const ISO = "2026-11-06T10:00:00Z";
const ZONES = ["UTC", "America/Los_Angeles", "Asia/Seoul", "Asia/Manila", "Europe/Berlin"];

describe("formatPhtDisplayDateTime", () => {
  it("ko 「11월 6일 18:00」 · en 「Nov 6, 18:00」", () => {
    expect(formatPhtDisplayDateTime(ISO, "ko")).toBe("11월 6일 18:00");
    expect(formatPhtDisplayDateTime(ISO, "en")).toBe("Nov 6, 18:00");
  });

  it("기기 시간대가 달라도 같은 문자열 (옛 toLocaleString 은 달라진다)", () => {
    const ours = new Set<string>();
    const legacy = new Set<string>();
    for (const tz of ZONES) {
      process.env.TZ = tz;
      ours.add(formatPhtDisplayDateTime(ISO, "ko"));
      legacy.add(
        new Date(ISO).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      );
    }
    expect([...ours]).toEqual(["11월 6일 18:00"]);
    expect(legacy.size).toBeGreaterThan(1);
  });

  it("PHT 자정 넘김·0시·한 자리 분은 두 자리로", () => {
    expect(formatPhtDisplayDateTime("2026-12-31T16:05:00Z", "ko")).toBe("1월 1일 00:05");
    expect(formatPhtDisplayDateTime("2026-12-31T16:05:00Z", "en")).toBe("Jan 1, 00:05");
    expect(formatPhtDisplayDateTime(new Date("2026-03-01T04:09:00Z"), "ko")).toBe("3월 1일 12:09");
  });

  it("잘못된 값이면 빈 문자열", () => {
    expect(formatPhtDisplayDateTime(null, "ko")).toBe("");
    expect(formatPhtDisplayDateTime("", "ko")).toBe("");
    expect(formatPhtDisplayDateTime("not-a-date", "en")).toBe("");
  });
});
