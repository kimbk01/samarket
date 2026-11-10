/**
 * OS 연락처 권한 철회 안내 (#19) — 답 처리 단일 정의.
 * 앱 전체 안내(메인 레이아웃 `MessengerContactsHeartbeat`)가 쓴다: 친구 탭을 열지 않아도 다음 실행 때 다시 안내.
 * 지우기 = 이 기기 출처 삭제(서버) + 기기 안 삭제 · 유지 = 업로드 중단만 기록.
 */
import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";
import { contactsApi } from "@/lib/community-messenger/contacts/contacts-api-client";
import {
  CONTACTS_CHANGED_EVENT,
  clearContactsDeviceData,
  patchContactsLocalState,
  readContactsLocalState,
} from "@/lib/community-messenger/contacts/contacts-local-store";

export async function answerContactsRevoke(userId: string, choice: "delete" | "keep"): Promise<boolean> {
  if (!userId) return false;
  const local = readContactsLocalState(userId);
  if (local.sourceId) {
    const r = await contactsApi.patchSource(local.sourceId, { installId: ensureClientInstanceId(), revokeChoice: choice });
    if (!r.ok) return false;
  }
  if (choice === "delete") clearContactsDeviceData(userId);
  patchContactsLocalState(userId, { revokePending: false });
  try {
    window.dispatchEvent(new Event(CONTACTS_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
  return true;
}
