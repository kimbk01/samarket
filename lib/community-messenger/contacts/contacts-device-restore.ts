/**
 * 같은 회원 재로그인 후 이 기기 연락처 상태 복구 (SSOT v5 §8 로그아웃 행 · 감사 2026-11-14 R1·R3).
 *
 * 로그아웃 정리는 인증 계약(§1.4)대로 기기 저장값을 전부 지운다 — 설치 ID 만 남는다.
 * 서버에는 이 설치 ID 로 만든 이 기기 출처가 그대로 있으므로, 기기에 출처가 없을 때 1번 조회해 되찾는다.
 * 같은 응답으로 「다른 기기에서 올린 연락처가 있는지」(번호 1개 이상)도 함께 정한다.
 */
import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";
import { contactsApi } from "@/lib/community-messenger/contacts/contacts-api-client";
import { patchContactsLocalState, readContactsLocalState } from "@/lib/community-messenger/contacts/contacts-local-store";

export type ContactsDeviceRestoreResult = {
  /** 서버의 이 기기 출처로 기기 상태를 되찾음 */
  restored: boolean;
  /** 이 기기가 아닌 출처 중 번호가 1개 이상인 것이 있음 — 조회 실패면 undefined */
  othersWithNumbers: boolean | undefined;
};

/** 서버 `GET /sources` 는 active 출처만 준다 (`listContactsSources`) */
type SourceRow = { id: string; entryCount: number; isThisDevice: boolean };

/** 「다른 기기에서 동기화한 연락처가 있어요」 대상 — 다른 설치 · 번호 1개 이상 (R3) */
export function hasOtherDeviceContacts(sources: readonly SourceRow[]): boolean {
  return sources.some((s) => !s.isThisDevice && s.entryCount > 0);
}

/**
 * 기기에 출처 ID 가 없을 때만 부른다 (로그인 1회당 요청 1개).
 * 이 기기 active 출처가 있으면 출처 ID·이 기기 허락을 다시 기록 → 다시 묻지 않고, 번호표가 없으므로 다음 동기화가 전체 스냅숏 1회.
 * 회원이 지운 출처(removed)는 목록에 없으므로 되찾지 않는다 (감사 A9 — 그 기기에서 다시 켤 때만).
 */
export async function restoreContactsDeviceFromServer(userId: string): Promise<ContactsDeviceRestoreResult> {
  if (!userId) return { restored: false, othersWithNumbers: undefined };
  const r = await contactsApi.sources(ensureClientInstanceId());
  if (!r.ok) return { restored: false, othersWithNumbers: undefined };
  const sources: SourceRow[] = r.data.sources;
  const othersWithNumbers = hasOtherDeviceContacts(sources);
  const mine = sources.find((s) => s.isThisDevice);
  if (!mine) return { restored: false, othersWithNumbers };
  // 응답을 기다리는 사이 다른 경로가 출처를 정했으면 덮어쓰지 않는다
  if (readContactsLocalState(userId).sourceId) return { restored: false, othersWithNumbers };
  patchContactsLocalState(userId, { sourceId: mine.id, deviceApproved: true });
  return { restored: true, othersWithNumbers };
}
