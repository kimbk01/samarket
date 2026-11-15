import { describe, expect, it } from "vitest";
import {
  messengerPhotoBubbleMaxWidthPx,
  messengerPhotoBubbleSize,
} from "@/lib/community-messenger/media/messenger-photo-bubble-size";

/** 텔레그램 `ChatMessageCell.java:9155,9264-9276` 높이 규칙 — 최대 = 폭+100(넘으면 폭 축소·비율 유지), 최소 120(그때만 자름) */
describe("messengerPhotoBubbleSize", () => {
  const maxWidth = 238; // 휴대폰 384px × 0.62

  it.each([
    ["가로 4:3", 1600, 1200, { width: 238, height: 179 }],
    ["가로 16:9", 1920, 1080, { width: 238, height: 134 }],
    ["정사각", 1000, 1000, { width: 238, height: 238 }],
    ["세로 3:4 (높이 317 ≤ 338)", 960, 1280, { width: 238, height: 317 }],
    ["세로 9:16 → 높이 338 고정, 폭 축소", 1080, 1920, { width: 190, height: 338 }],
    ["아주 긴 화면 캡처 883×1920 → 폭 축소", 883, 1920, { width: 155, height: 338 }],
    ["파노라마 3:1 → 최소 높이 120 (가운데 자름)", 3000, 1000, { width: 238, height: 120 }],
  ])("%s", (_label, w, h, expected) => {
    expect(messengerPhotoBubbleSize({ photoWidth: w, photoHeight: h, maxWidth })).toEqual(expected);
  });

  it("크기 정보 없으면 4:5 고정", () => {
    expect(messengerPhotoBubbleSize({ photoWidth: null, photoHeight: null, maxWidth })).toEqual({ width: 238, height: 298 });
  });

  it("최대 폭 = 지금 말풍선 규칙 min(62vw, 280/320/360)", () => {
    expect(messengerPhotoBubbleMaxWidthPx(384)).toBe(238);
    expect(messengerPhotoBubbleMaxWidthPx(600)).toBe(280);
    expect(messengerPhotoBubbleMaxWidthPx(700)).toBe(320);
    expect(messengerPhotoBubbleMaxWidthPx(1006)).toBe(360);
  });
});
