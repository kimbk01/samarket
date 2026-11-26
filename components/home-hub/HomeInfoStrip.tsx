"use client";

import { useCallback, useEffect, useState } from "react";
import { Cloud, CloudFog, CloudLightning, CloudRain, Sun, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { fetchExchangeRatesViaApp, type ExchangeRates } from "@/lib/exchange/fetchExchangeRates";
import { fetchAddressDefaultsSnapshot, peekFreshAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import {
  HOME_WEATHER_LABEL_KEYS,
  krwChangePercent,
  roundWeatherCoord,
  weatherKindFromWmo,
  WEATHER_DEFAULT_COORD,
  type HomeWeatherKind,
} from "@/lib/home/home-info-strip";
import { homePressFromClick } from "@/lib/ui/home-press-feedback";
import { HomeRateCalcSheet } from "@/components/home-hub/HomeRateCalcSheet";

const WEATHER_ICON: Record<HomeWeatherKind, LucideIcon> = {
  clear: Sun,
  cloudy: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  storm: CloudLightning,
};

/** YYYY-MM-DD → MM.DD */
export function shortRateDate(date: string | undefined): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(date ?? "");
  return m ? `${m[1]}.${m[2]}` : "";
}

type WeatherState = { tempC: number; code: number; place: string | null } | null;

/** 대표 주소의 좌표·시 이름 — 이미 받은 주소 스냅샷만(헤더가 같은 값을 받음, 새 요청 없음 또는 단일 비행 공유) */
function masterCoord(snap: AddressDefaultsSnapshot | null): { lat: number; lng: number; place: string | null } | null {
  const m = snap?.defaults?.master as
    | { latitude?: unknown; longitude?: unknown; cityMunicipality?: unknown }
    | null
    | undefined;
  const lat = roundWeatherCoord(m?.latitude as number | null, 90);
  const lng = roundWeatherCoord(m?.longitude as number | null, 180);
  if (lat == null || lng == null) return null;
  const place = typeof m?.cityMunicipality === "string" && m.cityMunicipality.trim() ? m.cityMunicipality.trim() : null;
  return { lat, lng, place };
}

/**
 * 홈 ① 정보 띠 — 환율(누르면 환율 계산) · 날씨(누름 없음). 설계 §3① (Owner 「제안대로 승인」 2026-11-26).
 * 환율 = ECB 영업일 1회 갱신이라 「실시간」이라 쓰지 않고 기준일을 함께 보인다.
 * 날씨 좌표 = 회원 대표 주소(소수 둘째 자리), 없으면·비로그인 = 마닐라.
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

  const loadRate = useCallback(async () => {
    setRateStatus((s) => (s === "ok" ? s : "loading"));
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
          setWeather({ tempC: j.tempC, code: j.code, place: coord?.place ?? null });
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
  }, [isMember, refreshSeq]);

  const pct = rate ? krwChangePercent(rate.KRW, rate.prevKRW) : null;
  const showWeather = !weatherFailed;
  const kind = weather ? weatherKindFromWmo(weather.code) : null;
  const WIcon = kind ? WEATHER_ICON[kind] : null;

  return (
    <section className={`home-info${showWeather ? "" : " home-info--solo"}`} data-home-info-strip>
      {rateStatus === "fail" && !rate ? (
        <div className="home-info-cell home-info-cell--fail" data-home-info-rate-failed>
          <span className="min-w-0 truncate">{t("home_info_rate_failed")}</span>
          <button
            type="button"
            className="home-press home-info-retry"
            onClick={(e) => {
              homePressFromClick("tap", e);
              void loadRate();
            }}
          >
            {t("home_info_retry")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="home-press home-info-cell"
          disabled={!rate}
          aria-label={t("home_rate_calc_title")}
          onClick={(e) => {
            homePressFromClick("tap", e);
            onRateCalcOpenChange(true);
          }}
          data-home-info-rate
        >
          {rate ? (
            <>
              <span className="home-info-flag" aria-hidden>
                ₱
              </span>
              <span className="min-w-0">
                <span className="home-info-main">
                  {t("home_info_rate_label", { krw: rate.KRW.toFixed(2) })}
                  {pct != null && pct !== 0 ? (
                    <span className={`home-info-delta ${pct > 0 ? "is-up" : "is-down"}`}>
                      {pct > 0 ? (
                        <TrendingUp className="h-3 w-3" strokeWidth={2.6} aria-hidden />
                      ) : (
                        <TrendingDown className="h-3 w-3" strokeWidth={2.6} aria-hidden />
                      )}
                      {Math.abs(pct).toFixed(2)}%
                    </span>
                  ) : null}
                </span>
                {rate.date ? (
                  <span className="home-info-sub">{t("home_info_rate_base_date", { date: shortRateDate(rate.date) })}</span>
                ) : null}
              </span>
            </>
          ) : (
            <span aria-hidden className="home-info-skel" />
          )}
        </button>
      )}
      {showWeather ? (
        <div className="home-info-cell home-info-cell--static" data-home-info-weather>
          {weather && WIcon && kind ? (
            <>
              <WIcon className="h-6 w-6 shrink-0 text-[#E0A800]" strokeWidth={2} aria-hidden />
              <span className="min-w-0">
                <span className="home-info-main">
                  {weather.tempC}° {t(HOME_WEATHER_LABEL_KEYS[kind])}
                </span>
                <span className="home-info-sub">{weather.place ?? t("home_info_weather_default_place")}</span>
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
