/**
 * 대기 통화 지원 판정 (서버 · docs/audit/call-waiting-stage2-design-2026-11-15.md WS2 · Owner 「서버 단계 진행」 2026-11-15).
 *
 * 대기 통화(받는 사람이 다른 통화에 연결된 중 「거절 / 종료 후 받기」)는 받는 사람 기기가 그 화면을 그릴 수 있을 때만
 * 울린다. 그 밖은 1단계(`peer_busy` + 부재중) 그대로 — 구 빌드 기기는 대기 수신을 숨겨 상대만 30초 울리는 나쁜 경험이 된다.
 *
 * 조건 (모두):
 * - 받는 사람의 활성 기기가 **정확히 1대**(device_id 기준). 2대 이상이면 통화 중이 아닌 기기가 평범한 수신처럼 울릴 수 있음.
 *   맥(iOS 앱 on Mac)은 같은 계정의 별도 기기로 잡혀 이 조건에서 빠진다.
 * - 그 기기가 플랫폼별 최소 빌드 이상(대기 통화 네이티브 코드 포함 빌드).
 * - iOS 는 VoIP 등록(`voip_apns`)이 있어야 함(맥은 VoIP 미등록).
 * - 받는 사람이 진행 중 통화의 수신자였다면 그 통화를 받은 기기(`answered_device_id`)가 그 기기여야 함(웹에서 받은 통화 제외).
 *
 * 서버 전용 의존성 없음(순수 함수) — 조회는 service.ts 가 한다.
 */

/** 대기 통화 네이티브 코드(PR #324)가 들어간 첫 설치 빌드 — 그 빌드를 만들 때 번호 확인 후 맞춘다. */
export const CALL_WAITING_MIN_BUILD = {
  android: 55,
  ios: 41,
} as const;

export type CallWaitingDeviceRow = {
  device_id: string | null;
  platform: string | null;
  push_provider: string | null;
  app_version: string | null;
};

/** "1.2.7 (54)" → 54. 형식이 다르면 null. */
export function parseAppBuildNumber(appVersion: string | null | undefined): number | null {
  const m = /\((\d+)\)\s*$/.exec(String(appVersion ?? "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export type CallWaitingDecision =
  | { ok: true; deviceId: string; platform: "android" | "ios" }
  | { ok: false; reason: string };

export function decideCallWaitingSupport(input: {
  devices: CallWaitingDeviceRow[];
  /** 받는 사람이 진행 중 통화의 수신자였으면 그 통화를 받은 기기. 발신자였으면 null(서버에 발신 기기 기록 없음). */
  answeredDeviceIdIfRecipient: string | null;
}): CallWaitingDecision {
  const rows = input.devices.filter((d) => String(d.device_id ?? "").trim());
  const deviceIds = [...new Set(rows.map((d) => String(d.device_id).trim()))];
  if (deviceIds.length === 0) return { ok: false, reason: "no_active_device" };
  if (deviceIds.length > 1) return { ok: false, reason: "multiple_devices" };
  const deviceId = deviceIds[0];
  const platforms = [...new Set(rows.map((d) => String(d.platform ?? "").trim().toLowerCase()))];
  if (platforms.length !== 1) return { ok: false, reason: "mixed_platform" };
  const platform = platforms[0];
  if (platform !== "android" && platform !== "ios") return { ok: false, reason: `platform_${platform || "unknown"}` };
  const builds = rows.map((d) => parseAppBuildNumber(d.app_version)).filter((n): n is number => n != null);
  if (builds.length === 0) return { ok: false, reason: "unknown_build" };
  if (Math.min(...builds) < CALL_WAITING_MIN_BUILD[platform]) return { ok: false, reason: "build_too_old" };
  if (platform === "ios" && !rows.some((d) => String(d.push_provider ?? "").trim() === "voip_apns")) {
    return { ok: false, reason: "ios_no_voip" };
  }
  const answered = String(input.answeredDeviceIdIfRecipient ?? "").trim();
  if (answered && answered !== deviceId) return { ok: false, reason: "live_call_on_other_device" };
  return { ok: true, deviceId, platform };
}

export type CallWaitingLiveRow = {
  id: string;
  status: string | null;
  answered_at: string | null;
  initiator_user_id: string | null;
  recipient_user_id: string | null;
  answered_device_id?: string | null;
};

/**
 * 받는 사람의 다른 방 live 통화들로 대기 통화 후보인지 판정(기기 조건 제외).
 * 대기 후보 = live 가 정확히 1건이고 그것이 연결됨(`active` + `answered_at`). 울리는 통화(발신·수신·기존 대기)가
 * 하나라도 있으면 후보 아님 → 1단계.
 */
export function pickCallWaitingLiveRow(rows: CallWaitingLiveRow[]): CallWaitingLiveRow | null {
  if (rows.length !== 1) return null;
  const row = rows[0];
  if (String(row.status ?? "").trim() !== "active") return null;
  if (!String(row.answered_at ?? "").trim()) return null;
  return row;
}
