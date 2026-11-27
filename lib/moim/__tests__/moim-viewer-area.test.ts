import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { masterAddressRowToLgu } from "@/lib/addresses/master-address-lgu.server";

/**
 * 2026-11-27 모임 전체 감사 A1 — 대표 주소가 있는데 모임이 「대표 주소를 먼저 등록」을 요구하던 결함.
 * 운영: 대표 주소 62명 중 26명이 canonical_lgu_id 빈 칸. 모임은 그 칸만 읽어 주소 없음으로 판정했다.
 * 수정: 주소 위치 단일 정의(deriveAddressLocation)로 시/군을 정한다.
 */

const row = (over: Record<string, string | null>) => ({
  canonical_lgu_id: null,
  country_code: "PH",
  province: null,
  city_municipality: null,
  barangay: null,
  district: null,
  street_address: null,
  building_name: null,
  landmark: null,
  full_address: null,
  formatted_address: null,
  road_address: null,
  neighborhood_name: null,
  app_region_id: null,
  app_city_id: null,
  ...over,
});

describe("모임 동네 = 대표 주소 시/군 (주소 위치 단일 정의)", () => {
  it("LGU 칸이 비어 있어도 시/군 칸으로 정한다 (이전 판정: 주소 없음)", () => {
    const r = masterAddressRowToLgu(
      row({ province: "Metro Manila", city_municipality: "Quezon City", formatted_address: "Commonwealth Ave, Quezon City, Metro Manila" })
    );
    expect(r).toEqual({ status: "ok", lguId: "1381300000", stored: false });
  });

  it("시/군 칸도 비어 있으면 주소 문장에서 정한다", () => {
    const r = masterAddressRowToLgu(row({ formatted_address: "Paterno St, Quiapo, Manila, 1001 Metro Manila" }));
    expect(r).toEqual({ status: "ok", lguId: "1380600000", stored: false });
  });

  it("저장된 LGU 가 있으면 그 값을 쓴다", () => {
    expect(masterAddressRowToLgu(row({ canonical_lgu_id: "1380600000", city_municipality: "Quezon City" }))).toEqual({
      status: "ok",
      lguId: "1380600000",
      stored: true,
    });
  });

  it("시/군을 하나로 정할 수 없으면 city_unresolved (주소 없음과 구분)", () => {
    const r = masterAddressRowToLgu(
      row({ province: "Metro Manila", barangay: "Ortigas Center", formatted_address: "Exchange Road, Barangay Ortigas Center, Metro Manila" })
    );
    expect(r).toEqual({ status: "city_unresolved" });
  });

  it("대표 주소가 없으면 no_address", () => {
    expect(masterAddressRowToLgu(null)).toEqual({ status: "no_address" });
  });
});

describe("개설 경로 — 동네 값은 서버 판정만 (구조 확인)", () => {
  const route = readFileSync(join(process.cwd(), "app/api/moim/route.ts"), "utf8");
  const rpc = readFileSync(join(process.cwd(), "lib/moim/server/moim-rpc.server.ts"), "utf8");

  it("개설 라우트는 서버가 판정한 LGU 를 넘기고, 요청 본문의 값을 쓰지 않는다", () => {
    expect(route).toContain("{ masterLguId: area.lguId }");
    expect(route).not.toMatch(/body\.(masterLguId|master_lgu_id)/);
    expect(rpc).toContain("master_lgu_id: opts?.masterLguId ?? null");
  });

  it("최신 moim_create 는 저장된 LGU 우선, 빈 칸일 때만 서버 값을 쓴다", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const latest = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .filter((sql) => /create or replace function public\.moim_create\(/i.test(sql))
      .pop()!;
    const block = latest.slice(latest.indexOf("select a.canonical_lgu_id into v_lgu"), latest.indexOf("select id, is_active, is_restricted into v_cat"));
    // 저장값이 있으면 그대로(이전과 동일), 빈 칸일 때만 서버 값 — 서버 값이 없으면 이전과 같은 오류
    expect(block).toContain("if v_lgu is null or btrim(v_lgu) = '' then");
    expect(block).toContain("v_lgu := nullif(btrim(coalesce(p->>'master_lgu_id', '')), '');");
    expect(block).toContain("if v_lgu is null then perform public.moim__fail('moim_address_required'); end if;");
    expect(block).toContain("moim__fail('moim_address_city_unresolved')");
  });
});
