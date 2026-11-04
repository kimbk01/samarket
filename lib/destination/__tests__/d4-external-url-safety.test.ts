import { describe, expect, it } from "vitest";
import {
  EXTERNAL_URL_SHORTENER_HOSTS,
  externalUrlHadNonAsciiHost,
  parseDestinationHref,
} from "@/lib/destination/destination-contract";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import { validateDeliveryFirstPartyBannerDestination } from "@/lib/destination/delivery-banner-destination";

/** D-4 (Owner 조건부 승인 · 2026-11-04) — 금지 유형별 단위 시험 */
const err = (raw: string) => {
  const r = parseDestinationHref(raw);
  return r.ok ? "ok" : r.error;
};

describe("D-4 외부 주소 안전 검사", () => {
  it("① 계정 정보(user@) 거부", () => {
    expect(err("https://user@example.com/a")).toBe("external_url_credentials");
    expect(err("https://user:pw@example.com/a")).toBe("external_url_credentials");
  });
  it("② IPv4 주소 거부(사설·공인 모두)", () => {
    expect(err("https://192.168.0.1/x")).toBe("external_url_private_host");
    expect(err("https://8.8.8.8/x")).toBe("external_url_private_host");
  });
  it("② 숫자·16진 표기 IP 도 거부(URL 정규화 후)", () => {
    expect(err("https://2130706433/")).toBe("external_url_private_host");
    expect(err("https://0x7f.1/")).toBe("external_url_private_host");
  });
  it("② IPv6 거부", () => {
    expect(err("https://[::1]/")).toBe("external_url_private_host");
  });
  it("② localhost · .local · 점 없는 이름 거부", () => {
    expect(err("https://localhost/a")).toBe("external_url_private_host");
    expect(err("https://app.localhost/a")).toBe("external_url_private_host");
    expect(err("https://printer.local/a")).toBe("external_url_private_host");
    expect(err("https://intranet/a")).toBe("external_url_private_host");
  });
  it("③ 2,048자 초과 거부 · 경계는 통과", () => {
    const base = "https://example.com/";
    expect(err(base + "a".repeat(2048 - base.length))).toBe("ok");
    expect(err(base + "a".repeat(2049 - base.length))).toBe("external_url_too_long");
  });
  it("④ 한글 도메인은 punycode 로 정규화해 저장 · 원래 입력이 비ASCII 였는지 알려 준다", () => {
    const r = parseDestinationHref("https://한국.kr/path");
    expect(r.ok && r.ref.kind === "external_url" && r.ref.url).toBe("https://xn--3e0b707e.kr/path");
    expect(externalUrlHadNonAsciiHost("https://한국.kr/path")).toBe(true);
    expect(externalUrlHadNonAsciiHost("https://example.com/한글경로")).toBe(false);
  });
  it("⑤ 단축·리다이렉트 서비스 거부 (목록 전체 + 하위 도메인 · 대소문자)", () => {
    for (const h of EXTERNAL_URL_SHORTENER_HOSTS) expect(err(`https://${h}/abc`), h).toBe("external_url_shortener");
    expect(err("https://BIT.LY/x")).toBe("external_url_shortener");
    expect(err("https://www.tinyurl.com/x")).toBe("external_url_shortener");
    // 이름만 닮은 정상 도메인은 막지 않는다
    expect(err("https://notbit.ly.example.com/x")).toBe("ok");
  });
  it("기존 규칙 유지: http · javascript · data 거부, 정상 https 통과", () => {
    expect(err("http://example.com")).toBe("https_required");
    expect(err("javascript:alert(1)")).toBe("invalid_url");
    expect(err("data:text/html,x")).toBe("invalid_url");
    expect(err("https://example.com/final-d")).toBe("ok");
  });
  it("⑦ 고객 응답 단계(팝업 CTA 검사)도 같은 함수로 다시 거른다 — 옛 데이터 차단", () => {
    expect(validatePlatformPopupCta({ ctaType: "external_url", externalUrl: "https://bit.ly/x" }, null).ok).toBe(false);
    expect(validatePlatformPopupCta({ ctaType: "external_url", externalUrl: "https://10.0.0.1/" }, null).ok).toBe(false);
    expect(validatePlatformPopupCta({ ctaType: "external_url", externalUrl: "https://example.com/x" }, null).ok).toBe(true);
  });
});

describe("DS-6 · C-2 배달 자체 배너 목적지", () => {
  it("매장 있음 = 그 매장 3종만 · 다른 매장 거부", () => {
    expect(validateDeliveryFirstPartyBannerDestination({ ctaHref: "/stores/aa11", storeSlug: "aa11" }).ok).toBe(true);
    expect(validateDeliveryFirstPartyBannerDestination({ ctaHref: "/stores/aa11#menu", storeSlug: "aa11" }).ok).toBe(true);
    expect(validateDeliveryFirstPartyBannerDestination({ ctaHref: "/stores/aa11?tab=promo", storeSlug: "aa11" }).ok).toBe(true);
    expect(validateDeliveryFirstPartyBannerDestination({ ctaHref: "/stores/bb22", storeSlug: "aa11" })).toEqual({
      ok: false,
      error: "store_destination_mismatch",
    });
    expect(validateDeliveryFirstPartyBannerDestination({ ctaHref: "/events/e1", storeSlug: "aa11" }).ok).toBe(false);
  });
  it("매장 없음 = 이벤트·배달 안 화면만 · 매장 상세·외부 거부", () => {
    expect(validateDeliveryFirstPartyBannerDestination({ ctaHref: "/events/e1", storeSlug: null }).ok).toBe(true);
    expect(validateDeliveryFirstPartyBannerDestination({ ctaHref: "/stores", storeSlug: null }).ok).toBe(true);
    expect(validateDeliveryFirstPartyBannerDestination({ ctaHref: "/stores/browse/food", storeSlug: null }).ok).toBe(true);
    expect(validateDeliveryFirstPartyBannerDestination({ ctaHref: "/stores/aa11", storeSlug: null })).toEqual({
      ok: false,
      error: "store_required_for_store_page",
    });
    expect(validateDeliveryFirstPartyBannerDestination({ ctaHref: "https://example.com", storeSlug: null })).toEqual({
      ok: false,
      error: "external_forbidden",
    });
    expect(validateDeliveryFirstPartyBannerDestination({ ctaHref: "/market", storeSlug: null }).ok).toBe(false);
    expect(validateDeliveryFirstPartyBannerDestination({ ctaHref: "", storeSlug: null }).ok).toBe(false);
  });
});
