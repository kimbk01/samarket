import { describe, expect, it } from "vitest";
import { resolveHomeTopAreas } from "@/lib/home/home-top-areas";
import {
  convertPhpKrw,
  krwChangePercent,
  pickLatestTwoKrw,
  roundWeatherCoord,
  weatherKindFromWmo,
} from "@/lib/home/home-info-strip";
import { pickActiveTradeRooms } from "@/components/home-hub/HomeMyActivity";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

describe("홈 슈퍼앱 개편 P1~P3 (2026-11-26)", () => {
  it("태블릿 2열 반반 — 1행 배너|서비스, 2행 telRING|정보 띠+내 진행 중", () => {
    const all = resolveHomeTopAreas({ banner: true, services: true, telring: true, info: true, my: true })!;
    expect(all.cols).toBe("minmax(0, 1fr) minmax(0, 1fr)");
    expect(all.areas).toBe('"banner svc" "ring info" "ring my"');
    expect(resolveHomeTopAreas({ banner: true, services: false, telring: true, info: true, my: false })!.areas).toBe(
      '"banner banner" "ring info"'
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

  it("내 진행 중 거래 — 거래 방 중 대화·판매자 완료 전 단계만", () => {
    const room = (id: string, kind: "trade" | "delivery", status?: string) =>
      ({ id, title: id, contextMeta: { v: 1, kind, tradeFlowStatus: status } }) as unknown as CommunityMessengerRoomSummary;
    const picked = pickActiveTradeRooms([
      room("a", "trade", "chatting"),
      room("b", "trade", "buyer_confirmed"),
      room("c", "delivery", "chatting"),
      room("d", "trade", "seller_marked_done"),
      room("e", "trade"),
    ]);
    expect(picked.map((r) => r.id)).toEqual(["a", "d"]);
  });
});
