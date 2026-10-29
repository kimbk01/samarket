/**
 * IA-01 (Owner J-2b ②) — 푸시 캠페인 「실제 수신자 발송」 권한 = `manage` 키 (최고관리자는 기본 권한으로 통과).
 *
 * 실제 발송을 일으키는 작업만 이 키를 요구한다:
 * - 즉시 발송·재발송 (`POST .../send`)
 * - 예약·반복 시작 (`schedule`), 일시정지 해제 (`resume`) — 생성 시 예약/반복 모드 포함
 * - 예약·일시정지 상태 캠페인의 내용 수정 (대기 중인 실제 발송의 수신자·문구가 바뀐다)
 * 그대로 두는 것(기존 가드): 초안 작성·수정, 본인 테스트 발송(`test-send`), 취소·중지·일시정지·보관·복제.
 *
 * Client-safe (서버 모듈 import 없음) — 접근표·계약 테스트가 같은 상수를 쓴다.
 */
import type { AdminPermissionKey } from "@/lib/types/admin-staff";

export const CAMPAIGN_SEND_PERMISSION_KEY = "manage" as const satisfies AdminPermissionKey;

/** 실제 발송을 시작·재개하는 수명주기 작업 */
export const CAMPAIGN_SEND_CAUSING_ACTIONS: ReadonlySet<string> = new Set(["schedule", "resume"]);

export function isCampaignSendCausingAction(action: string | null | undefined): boolean {
  return typeof action === "string" && CAMPAIGN_SEND_CAUSING_ACTIONS.has(action);
}

/** 생성 요청이 실제 발송을 예약하는가 (초안·즉시 모드 = 초안으로 저장 → 발송은 `.../send`) */
export function isCampaignCreateSendCausing(input: { saveAsDraft: boolean; sendMode: string | null | undefined }): boolean {
  if (input.saveAsDraft) return false;
  return input.sendMode === "scheduled" || input.sendMode === "recurring";
}

/** 내용 수정이 대기 중인 실제 발송을 바꾸는가 (초안 수정은 아님) */
export function isCampaignEditSendAffecting(status: string | null | undefined): boolean {
  return status === "scheduled" || status === "paused" || status === "active";
}
