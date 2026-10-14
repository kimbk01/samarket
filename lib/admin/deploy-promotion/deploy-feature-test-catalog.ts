/**
 * Owner-facing feature test catalog — distinct from automated gate PASS.
 * Automated evidence may map to a gateId; otherwise remains NOT_PROVEN until human/device proof.
 */

export type FeatureTestMethod = "automated_gate" | "manual_device" | "manual_web";

export type FeatureTestCatalogItem = {
  featureId: string;
  labelKo: string;
  labelEn: string;
  method: FeatureTestMethod;
  /** Optional link to deploy evidence gate */
  gateId?: string;
  platforms: Array<"web" | "android" | "ios">;
};

export const DEPLOY_FEATURE_TEST_CATALOG: readonly FeatureTestCatalogItem[] = [
  {
    featureId: "auth_member",
    labelKo: "로그인·회원관리",
    labelEn: "Login & member admin",
    method: "automated_gate",
    gateId: "auth_login_profile",
    platforms: ["web", "android", "ios"],
  },
  {
    featureId: "admin_ops",
    labelKo: "관리자 기능",
    labelEn: "Admin operations",
    method: "manual_web",
    platforms: ["web"],
  },
  {
    featureId: "community",
    labelKo: "커뮤니티",
    labelEn: "Community",
    method: "automated_gate",
    gateId: "community_trade_write",
    platforms: ["web", "android", "ios"],
  },
  {
    featureId: "trade",
    labelKo: "거래",
    labelEn: "Trade / marketplace",
    method: "automated_gate",
    gateId: "community_trade_write",
    platforms: ["web", "android", "ios"],
  },
  {
    featureId: "delivery_orders",
    labelKo: "배달·매장·주문",
    labelEn: "Delivery / store / orders",
    method: "automated_gate",
    gateId: "delivery_order_crud",
    platforms: ["web", "android", "ios"],
  },
  {
    featureId: "messenger_all",
    labelKo: "일반·그룹·거래·주문 메신저",
    labelEn: "Messenger (all chat types)",
    method: "automated_gate",
    gateId: "messenger_send_receive",
    platforms: ["web", "android", "ios"],
  },
  {
    featureId: "calls",
    labelKo: "음성·영상통화",
    labelEn: "Voice / video calls",
    method: "automated_gate",
    gateId: "call_push_sms",
    platforms: ["android", "ios", "web"],
  },
  {
    featureId: "push",
    labelKo: "알림·푸시",
    labelEn: "Notifications / push",
    method: "automated_gate",
    gateId: "call_push_sms",
    platforms: ["android", "ios", "web"],
  },
  {
    featureId: "media_upload",
    labelKo: "이미지·파일 업로드",
    labelEn: "Image / file upload",
    method: "manual_web",
    platforms: ["web", "android", "ios"],
  },
  {
    featureId: "intro_deeplink",
    labelKo: "인트로·앱 시작·딥링크",
    labelEn: "Intro / launch / deeplink",
    method: "manual_device",
    platforms: ["android", "ios"],
  },
  {
    featureId: "android_app",
    labelKo: "Android 앱 동작",
    labelEn: "Android app runtime",
    method: "manual_device",
    platforms: ["android"],
  },
  {
    featureId: "ios_app",
    labelKo: "iOS 앱 동작",
    labelEn: "iOS app runtime",
    method: "manual_device",
    platforms: ["ios"],
  },
  {
    featureId: "runtime_isolation",
    labelKo: "TEST·운영 데이터 분리",
    labelEn: "TEST / production data isolation",
    method: "automated_gate",
    gateId: "runtime_isolation",
    platforms: ["web"],
  },
] as const;

export type FeatureTestRow = {
  featureId: string;
  labelKo: string;
  labelEn: string;
  method: FeatureTestMethod;
  platforms: string[];
  versionSha: string | null;
  result: "pass" | "fail" | "not_proven";
  executed: boolean;
  evidenceId: string | null;
  executedAt: string | null;
  detail: string | null;
  reverifyNeeded: boolean;
  deviceEnv: string;
};

export function buildFeatureTestRows(input: {
  sha: string | null;
  evidenceByGate: Map<string, { result: string; evidenceId: string | null; executedAt: string | null; detail: string | null }>;
}): FeatureTestRow[] {
  return DEPLOY_FEATURE_TEST_CATALOG.map((item) => {
    const ev = item.gateId ? input.evidenceByGate.get(item.gateId) : undefined;
    const result =
      item.method === "manual_device" || item.method === "manual_web"
        ? ev?.result === "pass" || ev?.result === "fail"
          ? (ev.result as "pass" | "fail")
          : ("not_proven" as const)
        : ev?.result === "pass" || ev?.result === "fail"
          ? (ev.result as "pass" | "fail")
          : ("not_proven" as const);
    return {
      featureId: item.featureId,
      labelKo: item.labelKo,
      labelEn: item.labelEn,
      method: item.method,
      platforms: [...item.platforms],
      versionSha: input.sha,
      result,
      executed: Boolean(ev?.executedAt),
      evidenceId: ev?.evidenceId ?? null,
      executedAt: ev?.executedAt ?? null,
      detail:
        item.method !== "automated_gate" && result === "not_proven"
          ? item.method === "manual_device"
            ? "실기기 테스트 미실행"
            : "수동 웹 확인 미실행"
          : ev?.detail ?? null,
      reverifyNeeded: result !== "pass",
      deviceEnv:
        item.method === "manual_device"
          ? "Android Studio / Xcode / 실기기 — 미등록"
          : item.method === "manual_web"
            ? "TEST 웹 브라우저"
            : "서버 자동 점검",
    };
  });
}
