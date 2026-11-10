import { NextResponse } from "next/server";
import { isStagingDeployHost } from "@/lib/platform/staging-deploy-host";

/**
 * 스테이징(회원 미공개) 주소에서 온 푸시 기기 등록은 저장하지 않는다 — Owner 2026-11-10 「푸시 끄고 진행」.
 *
 * 스테이징·개발용 앱(DIBAY 개발)은 운영 DB 를 함께 쓴다. 여기서 FCM·APNs·VoIP·웹 푸시 토큰이 저장되면
 * 같은 계정의 실제 통화·알림 발송 대상에 섞인다(iOS 개발용 앱은 APNs topic 이 달라 발송 실패까지 생김).
 * 그래서 등록 요청이 들어온 주소(host)가 스테이징이면 저장 없이 성공(skipped)으로 끝낸다.
 * 운영 주소(samarket.vercel.app)·로컬은 아무것도 바뀌지 않는다.
 */
export function stagingHostPushRegisterSkip(req: Request): NextResponse | null {
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host")?.trim() ||
    "";
  const hostname = host.replace(/:\d+$/, "");
  if (!isStagingDeployHost(hostname)) return null;
  return NextResponse.json({ ok: true, skipped: "staging_host" });
}
