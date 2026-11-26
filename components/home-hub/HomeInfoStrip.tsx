"use client";

import { useCallback, useEffect, useState } from "react";
import { Cloud, CloudFog, CloudLightning, CloudRain, Sun, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { fetchExchangeRatesViaApp, type ExchangeRates } from "@/lib/exchange/fetchExchangeRates";
import { untilLaunchDestinationSettled } from "@/lib/startup/launch-push-destination-pending";
import { fetchAddressDefaultsSnapshot, peekFreshAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { resolveExplorationAddressLineFromSnapshot } from "@/lib/addresses/address-defaults-snapshot-resolvers";
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import {
  HOME_WEATHER_LABEL_KEYS,
  krwChangePercent,
  rateSparklinePaths,
  roundWeatherCoord,
  weatherKindFromWmo,
  WEATHER_DEFAULT_COORD,
  type HomeWeatherKind,
} from "@/lib/home/home-info-strip";
import { HomeRateCalcSheet } from "@/components/home-hub/HomeRateCalcSheet";
import { FlagKR, FlagPH } from "@/components/home-hub/home-flags";

const WEATHER_ICON: Record<HomeWeatherKind, LucideIcon> = {
  clear: Sun,
  cloudy: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  storm: CloudLightning,
};

type WeatherState = { tempC: number; code: number; place: string | null } | null;

/**
 * 대표 주소 좌표·지역 이름 — 이미 받은 주소 스냅샷만(머리글 주소와 같은 값).
 * 이름 = 시 → 동네(바랑가이) → 주소 칩 첫 부분. 좌표가 없을 때만 「마닐라」 (설계 v2 §3-2, W8).
 */
function masterCoord(snap: AddressDefaultsSnapshot | null): { lat: number; lng: number; place: string | null } | null {
  const m = snap?.defaults?.master as
    | { latitude?: unknown; longitude?: unknown; cityMunicipality?: unknown; barangay?: unknown }
    | null
    | undefined;
  const lat = roundWeatherCoord(m?.latitude as number | null, 90);
  const lng = roundWeatherCoord(m?.longitude as number | null, 180);
  if (lat == null || lng == null) return null;
  const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const chipFirst = resolveExplorationAddressLineFromSnapshot(snap)?.split(/[,·]/)[0]?.trim() || null;
  return { lat, lng, place: pick(m?.cityMunicipality) ?? pick(m?.barangay) ?? chipFirst };
}

function RateDelta({ pct, variant }: { pct: number; variant: "inline" | "badge" }) {
  const up = pct > 0;
  return (
    <span className={`home-info-delta home-info-delta--${variant} ${up ? "is-up" : "is-down"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function RateSparkline({ series }: { series: { krw: number }[] }) {
  const w = 150;
  const h = 40;
  const paths = rateSparklinePaths(
    series.map((p) => p.krw),
    w,
    h
  );
  if (!paths) return null;
  return (
    <svg className="home-info-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="home-rate-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1C9A4A" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#1C9A4A" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={paths.area} fill="url(#home-rate-spark-fill)" />
      <path d={paths.line} fill="none" stroke="#1C9A4A" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={paths.last.x} cy={paths.last.y} r="3" fill="#0B6B2E" />
    </svg>
  );
}

/**
 * 홈 ① 환율·날씨 — 시안 v2 §3-1·§3-2 (Owner 「v2대로 구현」 2026-11-26).
 * 휴대폰 = 연초록 두 칸(🇵🇭⇄🇰🇷 환율 · 지역/☀ 온도 맑음) · 태블릿 = 흰 한 카드(환율 + ▲ 알약 + 꺾은선 │ 날씨).
 * 기준일은 칸에 쓰지 않고 환율 계산 시트 안에만. 환율 칸 누르면 환율 계산 시트.
 */
export function HomeInfoStrip({
  isMember,
  refreshSeq,
  rateCalcOpen,
  onRateCalcOpenChange,
}: {
  isMember: boolean;
  refreshSeq: number;
  rateCalcOpen: boolean;
  onRateCalcOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [rate, setRate] = useState<ExchangeRates | null>(null);
  const [rateStatus, setRateStatus] = useState<"loading" | "ok" | "fail">("loading");
  const [weather, setWeather] = useState<WeatherState>(null);
  const [weatherFailed, setWeatherFailed] = useState(false);
  const defaultPlace = t("home_info_weather_default_place");

  const loadRate = useCallback(async () => {
    setRateStatus((s) => (s === "ok" ? s : "loading"));
    // 재감사 2026-11-26 §9 A5: 시작 목적지(알림·직전 화면 복원)가 그려지기 전에는 홈 전용 요청을 내지 않는다(§24 D1-웹과 같은 규칙)
    await untilLaunchDestinationSettled();
    const r = await fetchExchangeRatesViaApp();
    if (r) {
      setRate(r);
      setRateStatus("ok");
    } else {
      setRateStatus((s) => (s === "ok" ? s : "fail"));
    }
  }, []);

  useEffect(() => {
    void loadRate();
  }, [loadRate, refreshSeq]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await untilLaunchDestinationSettled();
      if (!alive) return;
      let coord: { lat: number; lng: number; place: string | null } | null = null;
      if (isMember) {
        const snap =
          peekFreshAddressDefaultsSnapshot() ??
          (await fetchAddressDefaultsSnapshot({ caller: "home_info_strip_weather", reason: "header_address_load" }).catch(
            () => null
          ));
        coord = masterCoord(snap);
      }
      const lat = coord?.lat ?? WEATHER_DEFAULT_COORD.lat;
      const lng = coord?.lng ?? WEATHER_DEFAULT_COORD.lng;
      try {
        const res = await fetch(`/api/weather?lat=${lat}&lng=${lng}`);
        const j = (await res.json()) as { ok?: boolean; tempC?: number; code?: number };
        if (!alive) return;
        if (res.ok && j.ok && typeof j.tempC === "number" && typeof j.code === "number") {
          // 좌표가 있으면 그 주소의 이름 · 좌표가 없을 때만 「마닐라」
          setWeather({ tempC: j.tempC, code: j.code, place: coord ? coord.place : defaultPlace });
          setWeatherFailed(false);
        } else {
          setWeatherFailed(true);
        }
      } catch {
        if (alive) setWeatherFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isMember, refreshSeq, defaultPlace]);

  const pct = rate ? krwChangePercent(rate.KRW, rate.prevKRW) : null;
  const showWeather = !weatherFailed;
  const kind = weather ? weatherKindFromWmo(weather.code) : null;
  const WIcon = kind ? WEATHER_ICON[kind] : null;

  return (
    <section className={`home-info${showWeather ? "" : " home-info--solo"}`} data-home-info-strip>
      {rateStatus === "fail" && !rate ? (
        <div className="home-info-cell home-info-cell--fail" data-home-info-rate-failed>
          <span className="min-w-0 truncate">{t("home_info_rate_failed")}</span>
          <button type="button" className="home-press home-info-retry home-hit" onClick={() => void loadRate()}>
            {t("home_info_retry")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="home-press home-info-cell home-info-rate"
          disabled={!rate}
          aria-label={t("home_rate_calc_title")}
          onClick={() => onRateCalcOpenChange(true)}
          data-home-info-rate
        >
          <span className="home-info-head">
            <span className="home-info-flags" aria-hidden>
              <FlagPH className="home-info-flag" />
              <span className="home-info-swap">⇄</span>
              <FlagKR className="home-info-flag" />
            </span>
            <span className="home-info-title">{t("home_info_rate_title")}</span>
          </span>
          {rate ? (
            <>
              <span className="home-info-main">
                {t("home_info_rate_label", { krw: rate.KRW.toFixed(2) })}
                {pct != null && pct !== 0 ? <RateDelta pct={pct} variant="inline" /> : null}
              </span>
              <span className="home-info-trend">
                {pct != null && pct !== 0 ? <RateDelta pct={pct} variant="badge" /> : <span />}
                {rate.series && rate.series.length > 1 ? <RateSparkline series={rate.series} /> : null}
              </span>
            </>
          ) : (
            <span aria-hidden className="home-info-skel" />
          )}
        </button>
      )}
      {showWeather ? (
        <div className="home-info-cell home-info-weather" data-home-info-weather>
          <span className="home-info-title home-info-title--weather">{t("home_info_weather_title")}</span>
          {weather && WIcon && kind ? (
            <>
              <span className="home-info-place">{weather.place ?? ""}</span>
              <span className="home-info-wrow">
                <WIcon className="home-info-wicon" strokeWidth={2.2} aria-hidden />
                <span className="home-info-temp">{weather.tempC}°</span>
                <span className="home-info-wlabel">{t(HOME_WEATHER_LABEL_KEYS[kind])}</span>
              </span>
            </>
          ) : (
            <span aria-hidden className="home-info-skel" />
          )}
        </div>
      ) : null}
      <HomeRateCalcSheet open={rateCalcOpen} onClose={() => onRateCalcOpenChange(false)} rate={rate} />
    </section>
  );
}
