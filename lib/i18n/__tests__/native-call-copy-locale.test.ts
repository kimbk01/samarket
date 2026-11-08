import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 언어 SSOT S8-3 — 통화 네이티브 문구 계약 (docs/audit/i18n-s8-native-plan-2026-11-08.md §13).
 * - Android: 기본 values = 영어, values-ko = 한국어. iOS: ko.lproj·en.lproj/Localizable.strings 키 대칭.
 * - 한국어 값은 S8-3 이전 화면 문구와 글자 하나까지 같다(아래 고정표 = S8-3 직전 main 의 값).
 * - 통화 코드에 남는 한글 문자열은 동작 판정 토큰·대체값뿐. 통화 채널 이름·설명은 리소스(S8-4b).
 */
const read = (p: string) => readFileSync(p, "utf8");
const HANGUL = /[가-힣]/;
const xml = (p: string) =>
  Object.fromEntries([...read(p).matchAll(/<string name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g)].map((m) => [m[1], m[2]]));
const strings = (p: string) =>
  Object.fromEntries([...read(p).matchAll(/^"([^"]+)" = "(.*)";$/gm)].map((m) => [m[1], m[2]]));
const walk = (dir: string, ext: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : [];
  });

const RES = "android/app/src/main/res";
const JAVA = "android/app/src/main/java/com/dibay/app";
const IOS = "ios/App/App";

/** S8-3 직전 Android 통화 문구(한국어) — 리소스 44 + 코드에서 옮긴 9 */
const ANDROID_KO_BEFORE: Record<string, string> = {
  dibay_incoming_accept: "수락",
  dibay_incoming_reject: "거절",
  dibay_incoming_voice_brand: "DiBay 음성 통화",
  dibay_incoming_video_brand: "DiBay 영상 통화",
  dibay_voice_call_incoming: "음성 통화 수신",
  dibay_voice_call_calling: "연결 중…",
  dibay_voice_call_dialing: "전화 거는 중 …",
  dibay_call_control_speaker: "스피커",
  dibay_call_control_video: "영상",
  dibay_call_control_mute: "음소거",
  dibay_call_control_unmute: "음소거 해제",
  dibay_voice_call_connecting: "연결 중…",
  dibay_voice_call_connected: "통화 중",
  dibay_voice_call_ending: "통화 종료 중",
  dibay_voice_call_end: "종료",
  dibay_voice_call_cancel: "취소",
  dibay_voice_speaker_on: "스피커 켬",
  dibay_voice_speaker_off: "스피커 끔",
  dibay_video_call_incoming: "영상 통화 수신",
  dibay_video_call_calling: "연결 중…",
  dibay_video_call_connecting: "연결 중…",
  dibay_video_call_connected: "통화 중",
  dibay_video_call_ending: "통화 종료 중",
  dibay_video_call_end: "종료",
  dibay_video_call_cancel: "취소",
  dibay_video_camera_flip: "카메라 전환",
  dibay_video_camera_on: "카메라 켬",
  dibay_video_camera_off: "카메라 끔",
  dibay_video_network_quality_good: "좋음",
  dibay_video_network_quality_fair: "보통",
  dibay_video_network_quality_poor: "나쁨",
  dibay_video_network_quality_very_poor: "매우 나쁨",
  dibay_call_dock_resume: "통화로 돌아가기",
  dibay_call_minimize: "통화 화면 줄이기",
  incoming_call_connecting: "연결 중…",
  dibay_call_notice_peer_busy: "상대방이 현재 통화중입니다.",
  dibay_call_notice_peer_declined: "상대방이 통화를 거절했습니다",
  dibay_call_notice_call_failed: "통화를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  dibay_call_notice_remote_ended: "통화가 종료되었습니다",
  dibay_call_notice_missed: "부재중 알림",
  dibay_call_notice_reconnecting: "다시 연결하는 중…",
  dibay_call_notice_network_warning: "네트워크 상태를 확인해 주세요.",
  dibay_call_notice_mic_mute_failed: "음소거를 적용하지 못했습니다.",
  dibay_call_notice_permission_required: "마이크 권한이 필요합니다",
  dibay_call_fgs_voice_ringing: "음성 통화 수신 중",
  dibay_call_fgs_video_ringing: "영상 통화 수신 중",
  dibay_call_fgs_keeping_active: "%1$s · 통화 서비스 유지 중",
  dibay_call_fgs_voice_label: "음성 통화",
  dibay_call_fgs_video_label: "영상 통화",
  dibay_call_fgs_ongoing: "%1$s 진행 중 · 탭하여 복귀",
  dibay_call_notification_title: "DIBAY 통화",
  dibay_call_missed_title: "부재중 통화",
  dibay_call_missed_from: "%1$s님의 부재중 통화",
};

/** S8-3 직전 iOS 통화 문구(한국어, Swift 코드의 값) */
const IOS_KO_BEFORE: Record<string, string> = {
  call_accept: "수락",
  call_decline: "거절",
  call_voice_incoming: "음성 통화 수신",
  call_video_incoming: "영상 통화 수신",
  call_dialing: "전화 거는 중 …",
  call_connecting: "연결 중…",
  call_connected: "통화 중",
  call_ending: "통화 종료 중",
  call_end: "종료",
  call_cancel: "취소",
  call_control_speaker: "스피커",
  call_control_video: "영상",
  call_control_mute: "음소거",
  call_control_unmute: "음소거 해제",
  call_camera_flip: "카메라 전환",
  call_camera_on: "카메라 켬",
  call_camera_off: "카메라 끔",
  call_minimize: "통화 화면 줄이기",
  call_quality_good: "좋음",
  call_quality_fair: "보통",
  call_quality_poor: "나쁨",
  call_quality_very_poor: "매우 나쁨",
  call_notice_peer_busy: "상대방이 현재 통화중입니다.",
  call_notice_peer_declined: "상대방이 통화를 거절했습니다",
  call_notice_call_failed: "통화를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  call_notice_remote_ended: "통화가 종료되었습니다",
  call_notice_missed: "부재중 알림",
  call_notice_reconnecting: "다시 연결하는 중…",
  call_notice_network_warning: "네트워크 상태를 확인해 주세요.",
  call_notice_permission_required: "마이크 권한이 필요합니다",
  call_perm_mic_off_title: "마이크 권한이 꺼져 있어요",
  call_perm_mic_off_body: "음성·영상 통화를 하려면 설정 > DIBAY에서 마이크를 켜 주세요.",
  call_perm_camera_off_title: "카메라 권한이 꺼져 있어요",
  call_perm_camera_off_body: "영상 통화를 하려면 설정 > DIBAY에서 카메라를 켜 주세요.",
  call_perm_later: "나중에",
  call_perm_settings: "설정",
  call_incoming_fallback: "수신 통화",
};

/** 통화 코드에 남아도 되는 한글 문자열 — 동작 판정 토큰(§1-6·§13-0)·대체값 (채널 이름은 S8-4b 에서 리소스로) */
const ALLOWED_HANGUL_LITERALS: Record<string, string[]> = {
  "IncomingCallUiCopy.java": ["DiBay 영상 통화", "DiBay 음성 통화", "영상", "님의 전화", "음성 통화", "영상 통화"],
  "FcmPayloadResolver.java": ["수신 통화"],
  "IncomingCallCallerIdentity.swift": ["영상통화", "음성통화", "영상 통화", "음성 통화", "님의 전화"],
};
const CALL_CODE = [
  ...["IncomingCallUiCopy.java", "FcmPayloadResolver.java", "IncomingCallNotificationBuilder.java", "MissedCallNotificationHelper.java", "IncomingCallActionCoordinator.java", "IncomingCallActivity.java", "call/CallForegroundService.java"].map((f) => join(JAVA, f)),
  ...walk(join(JAVA, "nativevoice"), ".java"),
  ...walk(join(JAVA, "nativevideo"), ".java"),
  ...walk(join(JAVA, "nativecall"), ".java"),
  ...walk(join(IOS, "Call"), ".swift"),
  join(IOS, "Push/CallKitProvider.swift"),
  join(IOS, "Push/IncomingCallCallerIdentity.swift"),
];
const hangulLiterals = (src: string) =>
  src
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && !/(Log\.|NSLog|print\(|os_log|DibayCallLog)/.test(l))
    .flatMap((l) => [...l.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]))
    .filter((s) => HANGUL.test(s));

describe("통화 네이티브 문구 언어 계약 (S8-3)", () => {
  const base = xml(`${RES}/values/strings.xml`);
  const ko = xml(`${RES}/values-ko/strings.xml`);
  const iosKo = strings(`${IOS}/ko.lproj/Localizable.strings`);
  const iosEn = strings(`${IOS}/en.lproj/Localizable.strings`);

  it("Android: 통화 문구 한국어 = S8-3 이전 값, 기본값은 영어", () => {
    for (const [key, before] of Object.entries(ANDROID_KO_BEFORE)) {
      expect(ko[key], key).toBe(before);
      expect(base[key], key).toBeDefined();
      expect(HANGUL.test(base[key] ?? ""), `${key} 기본값에 한글`).toBe(false);
    }
  });

  it("Android: 통화 코드가 읽는 문구 키는 모두 기본 values 에 있다", () => {
    const used = new Set(
      CALL_CODE.filter((p) => p.endsWith(".java")).flatMap((p) => [...read(p).matchAll(/R\.string\.(\w+)/g)].map((m) => m[1]))
    );
    // 통화 문구 키만 (dibay_supabase_url 등 빌드 설정 값은 다른 리소스 파일)
    const callKeys = [...used].filter((k) => /^(dibay_(incoming|voice|video|call)_|incoming_call_)/.test(k));
    expect(callKeys.length).toBeGreaterThan(30);
    for (const key of callKeys) expect(base[key], key).toBeDefined();
  });

  it("iOS: ko·en 키 대칭, 한국어 = S8-3 이전 값, 영어에 한글 없음", () => {
    expect(Object.keys(iosEn).sort()).toEqual(Object.keys(iosKo).sort());
    expect(iosKo).toEqual(IOS_KO_BEFORE);
    for (const [key, v] of Object.entries(iosEn)) expect(HANGUL.test(v), `${key} 영어에 한글`).toBe(false);
  });

  it("iOS: 코드가 읽는 문구 키는 ko·en 에 모두 있다", () => {
    const keys = walk(IOS, ".swift").flatMap((p) => [...read(p).matchAll(/DibayNativeCopy\.text\("([^"]+)"\)/g)].map((m) => m[1]));
    expect(keys.length).toBeGreaterThan(40);
    for (const key of keys) {
      expect(iosKo[key], key).toBeDefined();
      expect(iosEn[key], key).toBeDefined();
    }
  });

  it("S8-4b: 통화 알림 채널 이름·설명은 리소스 — 코드에 글자 없음·개발 용어 없음", () => {
    for (const p of CALL_CODE.filter((f) => f.endsWith(".java"))) {
      const src = read(p);
      expect(/new NotificationChannel\(\s*\w+,\s*"/.test(src), `${p} 채널 이름 글자`).toBe(false);
      expect(/setDescription\(\s*"/.test(src), `${p} 채널 설명 글자`).toBe(false);
    }
    const callChannelValues = Object.entries(base).filter(([k]) => k.startsWith("dibay_call_ch_"));
    expect(callChannelValues.length).toBe(14);
    for (const [k, v] of callChannelValues) {
      expect(/Native|RingOwner|foreground|FSI|UI only/i.test(v), `${k} 개발 용어`).toBe(false);
      expect(ko[k], k).toBeDefined();
    }
  });

  it("통화 코드의 한글 문자열은 허용 목록(판정 토큰·대체값)뿐", () => {
    for (const p of CALL_CODE) {
      const name = p.split("/").pop() ?? p;
      const allowed = new Set(ALLOWED_HANGUL_LITERALS[name] ?? []);
      const extra = hangulLiterals(read(p)).filter((s) => !allowed.has(s));
      expect(extra, p).toEqual([]);
    }
  });
});
