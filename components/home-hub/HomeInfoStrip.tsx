"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Cloud, CloudFog, CloudLightning, CloudRain, Sun, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { fetchExchangeRatesViaApp, type ExchangeRates } from "@/lib/exchange/fetchExchangeRates";
import { untilLaunchDestinationSettled } from "@/lib/startup/launch-push-destination-pending";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
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
/** 마지막으로 받은 환율 — 앱을 새로 열 때 첫 그림부터 보여 주고 새 값으로 바꾼다 (2026-11-26 Xiaomi 실측: 홈이 그려진 뒤 환율 칸 약 0.5초 빈칸) */
const HOME_RATE_STORE_KEY = "dibay:home:exchange-rates:v1";

function readStoredHomeRate(): ExchangeRates | null {
  try {
    const raw = window.localStorage.getItem(HOME_RATE_STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as ExchangeRates | null;
    return v && typeof v.KRW === "number" && v.KRW > 0 ? v : null;
  } catch {
    return null;
  }
}

function storeHomeRate(r: ExchangeRates): void {
  try {
    window.localStorage.setItem(HOME_RATE_STORE_KEY, JSON.stringify(r));
  } catch {
    /* 저장 실패는 무시 — 다음 실행에 빈칸만 남는다 */
  }
}

/**
 * 마지막으로 그린 날씨(지역·온도) — 앱을 새로 열 때 첫 그림부터 보이고 새 값으로 바꾼다.
 * 2026-11-26 Xiaomi 실측: 날씨는 로그인 확정 → 내 주소 → 날씨 조회를 차례로 기다려 홈이 그려진 뒤 약 1.2초 회색.
 * 첫 그림 때는 계정 번호를 아직 모른다(로그인 확인 전) — 배너 R1 과 같이 로그인 쿠키가 있으면 마지막 회원 날씨를 먼저 그리고,
 * 확인된 계정이 저장한 계정과 다르면 바로 지운다(2026-11-26 #628 실측 FAIL: 계정 일치를 첫 그림에서 요구해 효과 없음).
 */
const HOME_WEATHER_STORE_KEY = "dibay:home:weather:v1";

type StoredHomeWeather = { viewer: string; tempC: number; code: number; place: string | null };

function readStoredHomeWeather(): StoredHomeWeather | null {
  try {
    const raw = window.localStorage.getItem(HOME_WEATHER_STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredHomeWeather | null;
    if (!v || typeof v.tempC !== "number" || typeof v.code !== "number") return null;
    return { ...v, viewer: typeof v.viewer === "string" ? v.viewer : "" };
  } catch {
    return null;
  }
}

function storeHomeWeather(v: StoredHomeWeather): void {
  try {
    window.localStorage.setItem(HOME_WEATHER_STORE_KEY, JSON.stringify(v));
  } catch {
    /* 저장 실패는 무시 — 다음 실행에 회색만 남는다 */
  }
}

export function HomeInfoStrip({
  isMember,
  memberPending = false,
  refreshSeq,
  rateCalcOpen,
  onRateCalcOpenChange,
}: {
  isMember: boolean;
  /** 회원 확인 중(로그인 쿠키 있음) — 비회원 기본 좌표(마닐라)로 먼저 받지 않는다 */
  memberPending?: boolean;
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
      storeHomeRate(r);
    } else {
      setRateStatus((s) => (s === "ok" ? s : "fail"));
    }
  }, []);

  /** 저장 날씨를 그린 계정 — 확인된 계정과 다르면 지운다 */
  const storedWeatherViewerRef = useRef<string | null>(null);

  /** 회원 확인 중(쿠키 있음)·회원 = 마지막 회원 날씨(계정을 알면 같은 계정만) · 비회원 = 비회원 저장 날씨 */
  useLayoutEffect(() => {
    const stored = readStoredHomeWeather();
    if (!stored) return;
    const memberSide = memberPending || isMember;
    const viewer = memberSide ? (getSyncViewerUserIdForClient() ?? "") : "";
    if (memberSide) {
      if (!stored.viewer) return;
      if (viewer && stored.viewer !== viewer) return;
    } else if (stored.viewer) {
      return;
    }
    setWeather((cur) => {
      if (cur) return cur;
      storedWeatherViewerRef.current = stored.viewer;
      return { tempC: stored.tempC, code: stored.code, place: stored.place };
    });
  }, [memberPending, isMember]);

  /** 회원 확정 뒤 저장 날씨의 계정이 지금 계정과 다르면 지우고 새 조회를 기다린다 */
  useEffect(() => {
    if (!isMember) return;
    const from = storedWeatherViewerRef.current;
    const viewer = getSyncViewerUserIdForClient() ?? "";
    if (from == null || !viewer || from === viewer) return;
    storedWeatherViewerRef.current = null;
    setWeather(null);
  }, [isMember]);

  useLayoutEffect(() => {
    const stored = readStoredHomeRate();
    if (!stored) return;
    setRate((cur) => cur ?? stored);
    setRateStatus((st) => (st === "loading" ? "ok" : st));
  }, []);

  useEffect(() => {
    void loadRate();
  }, [loadRate, refreshSeq]);

  useEffect(() => {
    if (memberPending) return;
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
          const place = coord ? coord.place : defaultPlace;
          storedWeatherViewerRef.current = null;
          setWeather({ tempC: j.tempC, code: j.code, place });
          setWeatherFailed(false);
          storeHomeWeather({
            viewer: isMember ? (getSyncViewerUserIdForClient() ?? "") : "",
            tempC: j.tempC,
            code: j.code,
            place,
          });
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
  }, [isMember, memberPending, refreshSeq, defaultPlace]);

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
