import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PHP → KRW 환율 (ECB 기준, Frankfurter) - 1 PHP = ? KRW */
const FRANKFURTER_API = "https://api.frankfurter.app/latest?from=PHP&to=KRW";
const EXCHANGE_RATE_HTTP_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

export const revalidate = 300;

/** 쓰기 시점 현재 환율 조회. Frankfurter(ECB 기준)로 1 PHP = ? KRW 정확히 조회 */
export async function GET() {
  try {
    const res = await fetch(FRANKFURTER_API, {
      next: { revalidate: 300 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "환율 조회 실패", status: res.status },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
    const data = await res.json();
    const krw = data?.rates?.KRW;
    if (krw == null || typeof krw !== "number" || krw <= 0) {
      return NextResponse.json(
        { error: "환율 데이터 형식 오류" },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      {
        PHP: 1,
        KRW: krw,
      },
      { headers: { "Cache-Control": EXCHANGE_RATE_HTTP_CACHE_CONTROL } }
    );
  } catch (e) {
    console.error("[exchange-rates]", e);
    return NextResponse.json(
      { error: "환율 조회 중 오류" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
