/**
 * 브라우저 Geolocation — 권한 거부·타임아웃 시 완화 옵션으로 한 번 더 시도.
 */

export type GeolocationResult =
  | { ok: true; latitude: number; longitude: number; accuracy?: number }
  | { ok: false; code: GeolocationPositionError["code"]; message: string };

function toMessage(code: GeolocationPositionError["code"]): string {
  switch (code) {
    case 1:
      return "위치 권한이 거부되었습니다. 주소창 왼쪽 자물쇠·사이트 정보에서 「위치」를 허용하거나, 브라우저 설정에서 이 사이트의 위치 접근을 켜 주세요.";
    case 2:
      return "위치 정보를 가져올 수 없습니다. 잠시 후 다시 시도해 주세요.";
    case 3:
      return "위치 확인 시간이 초과되었습니다. 네트워크 상태를 확인한 뒤 다시 눌러 주세요.";
    default:
      return "현재 위치를 확인할 수 없습니다.";
  }
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
    return {
      ok: false,
      code: 2,
      message:
        "이 브라우저 또는 보안 설정에서 이 사이트의 위치 사용이 막혀 있습니다. HTTPS로 접속했는지, 주소창의 사이트 설정에서 위치가 허용됐는지 확인해 주세요.",
    };
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
      return { ok: false, code: 1, message: toMessage(1) };
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
      return { ok: false, code: code2, message: toMessage(code2) };
    }
  }
}
