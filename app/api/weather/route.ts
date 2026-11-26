import { NextResponse, type NextRequest } from "next/server";
import { roundWeatherCoord, WEATHER_DEFAULT_COORD } from "@/lib/home/home-info-strip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 홈 정보 띠 날씨 — 슈퍼앱 개편 설계 §3① (Owner D2 「허용」 2026-11-26).
 * Open-Meteo(키 없음)에 **소수 둘째 자리로 줄인 좌표**만 보낸다(약 1km). Supabase 호출 0.
 * 응답 캐시 30분 — 같은 좌표(반올림)는 엣지에서 다시 쓴다.
 */
const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const WEATHER_HTTP_CACHE_CONTROL = "public, max-age=600, s-maxage=1800, stale-while-revalidate=3600";
export async function GET(req: NextRequest) {
  const lat = roundWeatherCoord(req.nextUrl.searchParams.get("lat"), 90) ?? WEATHER_DEFAULT_COORD.lat;
  const lng = roundWeatherCoord(req.nextUrl.searchParams.get("lng"), 180) ?? WEATHER_DEFAULT_COORD.lng;
  const url = `${OPEN_METEO}?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=Asia%2FManila`;
  try {
    /** 바깥 서비스가 느려도 4초 안에 답한다 — 앱의 「DIBAY 연결 원활하지 않음」 판정(8초)에 걸리지 않게 */
    const res = await fetch(url, {
      next: { revalidate: 1800 },
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "upstream_failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    const data = (await res.json()) as { current?: { temperature_2m?: unknown; weather_code?: unknown; time?: unknown } };
    const temp = data.current?.temperature_2m;
    const code = data.current?.weather_code;
    if (typeof temp !== "number" || typeof code !== "number") {
      return NextResponse.json({ ok: false, error: "bad_upstream_shape" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(
      { ok: true, tempC: Math.round(temp), code, time: typeof data.current?.time === "string" ? data.current.time : null },
      { headers: { "Cache-Control": WEATHER_HTTP_CACHE_CONTROL } }
    );
  } catch (e) {
    console.error("[weather]", e);
    return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
