/**
 * 브라우저 Geolocation — 권한 거부·타임아웃 시 완화 옵션으로 한 번 더 시도.
 */
import type { MessageKey } from "@/lib/i18n/messages";

/** 실패 이유 코드 — 화면 문구는 `geolocationFailMessageKey(reason)` (키 `reaudit_trade_geo_*`) */
export type GeolocationFailReason = "denied" | "unavailable" | "timeout" | "unsupported";

export type GeolocationResult =
  | { ok: true; latitude: number; longitude: number; accuracy?: number }
  | {
      ok: false;
      code: GeolocationPositionError["code"];
      reason: GeolocationFailReason;
      /** @deprecated 화면 문구 아님 — `reason` 과 같은 코드 값(옛 호출처 호환). 화면은 `geolocationFailMessageKey` */
      message: GeolocationFailReason;
    };

function reasonOf(code: GeolocationPositionError["code"]): GeolocationFailReason {
  switch (code) {
    case 1:
      return "denied";
    case 3:
      return "timeout";
    default:
      return "unavailable";
  }
}

function fail(code: GeolocationPositionError["code"], reason: GeolocationFailReason = reasonOf(code)): GeolocationResult {
  return { ok: false, code, reason, message: reason };
}

const FAIL_MESSAGE_KEYS = {
  denied: "reaudit_trade_geo_denied",
  unavailable: "reaudit_trade_geo_unavailable",
  timeout: "reaudit_trade_geo_timeout",
  unsupported: "reaudit_trade_geo_unsupported",
} as const satisfies Record<GeolocationFailReason, MessageKey>;

export function geolocationFailMessageKey(reason: GeolocationFailReason): MessageKey {
  return FAIL_MESSAGE_KEYS[reason] ?? "trade_location_geo_failed";
}

function getOnce(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(Object.assign(new Error("no_geolocation"), { code: 2 as const }));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/** 사용자 제스처(버튼 탭) 안에서 호출하는 것이 권장됩니다. */
export async function getBestCurrentPosition(): Promise<GeolocationResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return fail(2, "unsupported");
  }

  const tryHigh: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 20_000,
    maximumAge: 0,
  };
  const tryLow: PositionOptions = {
    enableHighAccuracy: false,
    timeout: 25_000,
    maximumAge: 120_000,
  };

  try {
    const pos = await getOnce(tryHigh);
    return {
      ok: true,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    };
  } catch (e: unknown) {
    const err = e as Partial<GeolocationPositionError>;
    const code = typeof err?.code === "number" ? err.code : 2;
    if (code === 1) {
      return fail(1);
    }
    try {
      const pos = await getOnce(tryLow);
      return {
        ok: true,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
    } catch (e2: unknown) {
      const err2 = e2 as Partial<GeolocationPositionError>;
      const code2 = typeof err2?.code === "number" ? err2.code : code;
      return fail(code2);
    }
  }
}
