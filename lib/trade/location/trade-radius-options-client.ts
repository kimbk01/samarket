"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_TRADE_RADIUS_OPTIONS_KM,
  getTradeRadiusOptionsKm,
  subscribeTradeRadiusOptionsKm,
} from "@/lib/trade/location/trade-radius-options";

const DEFAULT_SNAPSHOT = [...DEFAULT_TRADE_RADIUS_OPTIONS_KM];

/** 거래 D — 📍 시트가 그릴 반경 선택지(서버 목록 응답 값, 받기 전에는 10·20·40) */
export function useTradeRadiusOptionsKm(): number[] {
  return useSyncExternalStore(subscribeTradeRadiusOptionsKm, getTradeRadiusOptionsKm, () => DEFAULT_SNAPSHOT);
}
