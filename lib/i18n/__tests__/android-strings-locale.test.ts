import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 언어 SSOT S8-2 — Android 문자열 리소스 언어 계약.
 * - values-ko 의 키는 기본 values 에 있고, 기본값은 한글이 없다(영어) → ko·en 외 기기 언어는 영어.
 * - 기본 values 에 남은 한글 문자열(통화·알림 — S8-3·S8-4 대상)은 줄기만 한다.
 */
const read = (p: string) => readFileSync(p, "utf8");
const parse = (xml: string) =>
  Object.fromEntries([...xml.matchAll(/<string name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g)].map((m) => [m[1], m[2]]));
const HANGUL = /[가-힣]/;

const base = parse(read("android/app/src/main/res/values/strings.xml"));
const ko = parse(read("android/app/src/main/res/values-ko/strings.xml"));

/** 기본 values 의 한글 문자열 수 — S8-2 45 → S8-3 통화 44 → S8-4a 알림 1 을 옮겨 0 */
const BASE_HANGUL_CEILING = 0;

describe("Android strings 언어 계약 (S8-2)", () => {
  it("values-ko 의 키는 기본 values 에 있고, 그 기본값은 영어(한글 없음)", () => {
    for (const key of Object.keys(ko)) {
      expect(base[key], key).toBeDefined();
      expect(HANGUL.test(base[key] ?? ""), `${key} 기본값에 한글`).toBe(false);
      expect(HANGUL.test(ko[key] ?? ""), `${key} 한국어 값`).toBe(true);
    }
  });

  it("웹 연결 오류 화면 5개는 기본 영어 + 한국어", () => {
    for (const key of [
      "dibay_webview_error_title",
      "dibay_webview_error_body",
      "dibay_webview_error_retry",
      "dibay_webview_renderer_gone_title",
      "dibay_webview_renderer_gone_body",
      // S8-2b: 화면 넘김 덮개 연결 실패 — 한국어는 이전 코드 문구 그대로
      "dibay_handoff_error",
      "dibay_handoff_error_with_reason",
    ]) {
      expect(ko[key], key).toBeDefined();
    }
  });

  it("S8-4a 알림 채널 문구: 한국어 = 이전 코드 글자(승인된 2개 제외), 기본값은 영어", () => {
    const before: Record<string, string> = {
      dibay_notif_ch_chat_name: "채팅 메시지",
      dibay_notif_ch_chat_desc: "채팅·메신저 메시지 알림",
      dibay_notif_ch_trade_name: "거래 알림",
      dibay_notif_ch_trade_desc: "거래 채팅·거래 상태 알림",
      dibay_notif_ch_orders_name: "주문 알림",
      dibay_notif_ch_orders_desc: "스토어·주문 알림",
      dibay_notif_ch_delivery_name: "배달 알림",
      dibay_notif_ch_delivery_desc: "배달·매장 주문 알림",
      dibay_notif_ch_community_name: "커뮤니티 알림",
      dibay_notif_ch_community_desc: "커뮤니티 활동 알림",
      dibay_notif_ch_notice_name: "공지 알림",
      dibay_notif_ch_notice_desc: "공지·마케팅 알림",
      dibay_notif_ch_silent_name: "무음 알림",
      dibay_notif_ch_silent_desc: "알림음·진동을 끈 상태의 알림",
      dibay_notif_ch_novibrate_name: "진동 없는 알림",
      dibay_notif_ch_novibrate_desc: "진동을 끈 상태의 알림",
      dibay_notif_ch_default_name: "DIBAY 알림",
      dibay_notif_ch_default_desc: "메시지 알림",
      dibay_notif_sound_no_vibrate_name: "%1$s · 진동 없음",
      dibay_notif_sound_desc: "%1$s · DIBAY 알림음",
      dibay_notif_ch_app_icon_name: "읽지 않은 알림",
      dibay_notif_self_name: "나",
      dibay_app_icon_summary_body: "읽지 않은 알림 %1$d개가 있습니다. 탭하여 확인하세요.",
      // Owner 승인(2026-11-08)으로 바뀐 한국어: 「(legacy)」→「(이전)」, 개발 용어 설명 → 한국어
      dibay_notif_ch_legacy_chat_desc: "채팅 메시지 알림 (이전)",
      dibay_notif_ch_app_icon_desc: "읽지 않은 알림 개수 요약",
    };
    for (const [key, value] of Object.entries(before)) {
      expect(ko[key], key).toBe(value);
      expect(HANGUL.test(base[key] ?? "한"), `${key} 기본값`).toBe(false);
    }
  });

  it("알림 네이티브 코드에 한글 문자열 없음 (S8-4a)", () => {
    for (const f of [
      "DibayNotificationChannelRegistry.java",
      "DibayNotificationSoundChannelStore.java",
      "DibayAppIconDeliveryAdapter.java",
      "DibayNotificationPresentation.java",
      "DibayNotificationChannelLabels.java",
    ]) {
      const code = read(`android/app/src/main/java/com/dibay/app/${f}`)
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && !/Log\./.test(l))
        .join("\n");
      const hangulLiterals = [...code.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).filter((v) => HANGUL.test(v));
      expect(hangulLiterals, f).toEqual([]);
    }
  });

  it("values-en 폴더 없음 — 기본 values 가 영어 (S8-4a)", () => {
    expect(existsSync("android/app/src/main/res/values-en")).toBe(false);
  });

  it("기본 values 의 한글 문자열은 늘지 않는다 (통화·알림은 S8-3·S8-4 에서 옮김)", () => {
    const count = Object.values(base).filter((v) => HANGUL.test(v)).length;
    expect(count).toBeLessThanOrEqual(BASE_HANGUL_CEILING);
  });
});
