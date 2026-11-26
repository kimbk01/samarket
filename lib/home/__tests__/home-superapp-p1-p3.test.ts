import { describe, expect, it } from "vitest";
import { resolveHomeTopAreas } from "@/lib/home/home-top-areas";
import {
  convertPhpKrw,
  krwChangePercent,
  pickLatestTwoKrw,
  roundWeatherCoord,
  weatherKindFromWmo,
} from "@/lib/home/home-info-strip";
import { DEFAULT_HOME_LAYOUT, cloneHomeLayout, resolveHomeServiceTiles, splitHomeBannerTitle } from "@/lib/home/home-layout-contract";
import { rateSparklinePaths, pickKrwSeries } from "@/lib/home/home-info-strip";
import { homeOrderReadyMinutes } from "@/lib/home/home-my-activity";
import { resolveHomePressPermission } from "@/lib/ui/home-press-feedback";

describe("홈 슈퍼앱 개편 P1~P3 (2026-11-26)", () => {
  it("태블릿 2열 반반 — 1행 배너|서비스, 2행 telRING|정보 띠+내 진행 중", () => {
    const all = resolveHomeTopAreas({ banner: true, services: true, telring: true, info: true, my: true })!;
    expect(all.cols).toBe("minmax(0, 1fr) minmax(0, 1fr)");
    expect(all.areas).toBe('"banner svc" "rule rule" "ring info" "ring my"');
    expect(all.hasRule).toBe(true);
    expect(resolveHomeTopAreas({ banner: true, services: false, telring: true, info: true, my: false })!.areas).toBe(
      '"banner banner" "rule rule" "ring info"'
    );
    expect(resolveHomeTopAreas({ banner: false, services: false, telring: false, info: true, my: true })!.areas).toBe('"info my"');
    expect(resolveHomeTopAreas({ banner: false, services: false, telring: false, info: false, my: false })).toBeNull();
  });

  it("환율 — 시계열에서 마지막 두 영업일 · 전일 대비 % · 계산", () => {
    const p = pickLatestTwoKrw({ "2026-11-24": { KRW: 21.078 }, "2026-11-25": { KRW: 21.151 }, bad: { KRW: 1 } });
    expect(p).toEqual({ date: "2026-11-25", krw: 21.151, prevKrw: 21.078 });
    expect(pickLatestTwoKrw({})).toBeNull();
    expect(krwChangePercent(21.151, 21.078)).toBe(0.35);
    expect(krwChangePercent(21, null)).toBeNull();
    expect(convertPhpKrw(1000, 21.151, "php_to_krw")).toBe(21151);
    expect(convertPhpKrw(21151, 21.151, "krw_to_php")).toBe(1000);
  });

  it("날씨 — 외부로 보내는 좌표는 소수 둘째 자리(D2) · WMO 코드 분류", () => {
    expect(roundWeatherCoord("14.58765", 90)).toBe(14.59);
    expect(roundWeatherCoord(121.00321, 180)).toBe(121);
    expect(roundWeatherCoord("abc", 90)).toBeNull();
    expect(roundWeatherCoord("200", 90)).toBeNull();
    expect(weatherKindFromWmo(0)).toBe("clear");
    expect(weatherKindFromWmo(3)).toBe("cloudy");
    expect(weatherKindFromWmo(61)).toBe("rain");
    expect(weatherKindFromWmo(95)).toBe("storm");
  });

  it("서비스 칸 순서 = 시안 고정, 어드민 끈 칸만 빠짐 (v2 §3-4)", () => {
    const c = cloneHomeLayout(DEFAULT_HOME_LAYOUT);
    expect(resolveHomeServiceTiles(c.services)).toEqual(["philife", "trade", "moim", "stores", "chat", "events"]);
    // 운영 저장 순서(마켓·DIPICK·정보 공유…)여도 시안 순서
    c.services = [...c.services].reverse();
    c.services.find((x) => x.key === "events")!.visible = false;
    expect(resolveHomeServiceTiles(c.services)).toEqual(["philife", "trade", "moim", "stores", "chat"]);
  });

  it("배너 제목 노랑 강조 {} (v2 §3-3)", () => {
    expect(splitHomeBannerTitle("오늘 저녁,\n{동네 맛집}이 집 앞까지")).toEqual([
      { text: "오늘 저녁,\n", hi: false },
      { text: "동네 맛집", hi: true },
      { text: "이 집 앞까지", hi: false },
    ]);
    expect(splitHomeBannerTitle("강조 없음 {")).toEqual([{ text: "강조 없음 {", hi: false }]);
  });

  it("환율 꺾은선 — 날짜순 · 끝 점", () => {
    const s = pickKrwSeries({ "2026-11-25": { KRW: 21.2 }, "2026-11-24": { KRW: 21.0 }, "2026-11-23": { KRW: 21.1 } });
    expect(s.map((p) => p.date)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
    const p = rateSparklinePaths(s.map((x) => x.krw), 150, 40)!;
    expect(p.line.startsWith("M")).toBe(true);
    expect(p.last.x).toBe(147);
    expect(p.last.y).toBe(3);
    expect(rateSparklinePaths([1], 150, 40)).toBeNull();
  });

  it("누름 소리 — 회원 설정 모르면 소리 없음·설정 불러오기, 끔이면 끔 (v2 §4, W7)", () => {
    expect(resolveHomePressPermission(null, true)).toEqual({ sound: false, vibration: true, needSettings: true });
    expect(resolveHomePressPermission(null, false)).toEqual({ sound: true, vibration: true, needSettings: false });
    expect(resolveHomePressPermission({ sound: false, vibration: false }, true)).toEqual({
      sound: false,
      vibration: false,
      needSettings: false,
    });
  });

  it("주문 「준비 n분」 — 조리 전 단계·미래 시각만 (도착 시간 아님, v2 §3-6)", () => {
    const now = Date.parse("2026-11-26T10:00:00Z");
    expect(homeOrderReadyMinutes({ status: "preparing", readyAt: "2026-11-26T10:11:30Z" }, now)).toBe(12);
    expect(homeOrderReadyMinutes({ status: "delivering", readyAt: "2026-11-26T10:11:30Z" }, now)).toBeNull();
    expect(homeOrderReadyMinutes({ status: "preparing", readyAt: "2026-11-26T09:00:00Z" }, now)).toBeNull();
    expect(homeOrderReadyMinutes({ status: "accepted", readyAt: null }, now)).toBeNull();
  });
});
