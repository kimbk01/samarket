/**
 * 실기 v6 FAIL 1 (Owner 「설계안대로 진행」 2026-11-07): 원장 종류 칩이 5개(계열)뿐 — PTR·인트로·이벤트 히어로·마이 배너를
 * 고를 칩이 없었다(주소 `?kind=` 로만). 설계 §5 「전체 광고 = 종류·상태·도메인·위치 필터」.
 * 화면 전체 렌더는 무거워 코드 구조 + 문구 키만 본다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADS_LEDGER_KINDS, adsLedgerKindLabel } from "@/lib/admin/ads-ledger/ad-ledger-presentation";

const src = readFileSync(join(process.cwd(), "components/admin/ads/AdminAdvertisingWorkspace.tsx"), "utf8");

describe("v6 FAIL 1 원장 종류 칩", () => {
  it("칩 = 원장 13종 전부(PTR·인트로·이벤트 히어로·마이 배너 포함) + 전체", () => {
    expect(ADS_LEDGER_KINDS).toHaveLength(13);
    for (const k of ["ptr", "intro", "event_hero", "my_banner"]) expect(ADS_LEDGER_KINDS).toContain(k);
    expect(src).toContain('data-shell-kind-tabs="1"');
    expect(src).toMatch(/ADS_LEDGER_KINDS\.map\(\(k\) =>/);
    expect(src).toContain('data-kind-tab="all"');
  });

  it("모든 종류에 한국어 이름이 있다(키 그대로 노출 0)", () => {
    for (const k of ADS_LEDGER_KINDS) {
      const label = adsLedgerKindLabel(k, true);
      expect(label).not.toMatch(/^ads_ledger_kind_/);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("칩 수는 종류 거름을 뺀 값(도메인·광고주·매장 거름만 넣어 1번 더 읽음)", () => {
    const block = src.slice(src.indexOf("const showKindChips"), src.indexOf("const setKindFilter"));
    expect(block).toContain("fetchAdsControlPlane(");
    expect(block).toContain("domain: domainFilter || undefined");
    expect(block).toContain("advertiser: advertiserFilter || undefined");
    expect(block).not.toMatch(/kind:\s*kindFilter/);
  });

  it("전체 광고·이력 모드에서만 · 칩을 누르면 ?kind= 바꾸고 계열·쪽은 처음으로", () => {
    expect(src).toContain('const showKindChips = mode === "all" || mode === "history";');
    const block = src.slice(src.indexOf("const setKindFilter"), src.indexOf("/** 광고주 거름 칩"));
    expect(block).toContain('next.set("kind", kind)');
    expect(block).toContain('next.delete("family")');
    expect(block).toContain('next.delete("page")');
  });

  it("계열 칩(5개)은 남는다 — 메뉴·팝업 대기열 링크가 ?family= 를 쓴다", () => {
    expect(src).toContain('data-shell-family-tabs="1"');
  });
});
