/**
 * C-3 / C-10 — 메신저 방 발신 실패(재전송 가능) 상태 단일 정의.
 *
 * 응답 유실·5xx·네트워크 예외처럼 서버 커밋 여부를 알 수 없는(indeterminate) 미디어 전송 실패는
 * 낙관적 말풍선을 지우지 않고 `sendFailed` 로 표시한다. 재전송은 **같은 clientMessageId** 로
 * 원본 바이트(사진·파일·녹음 Blob)를 다시 보내 서버 UNIQUE 멱등으로 1행만 남긴다.
 * 말풍선 행(UI)은 이 레지스트리에서 행 id 로 retry/discard 핸들러를 찾는다(타임라인 prop 전파 없음).
 */
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

export type MessengerOutboundRow = CommunityMessengerMessage & { pending?: boolean; sendFailed?: boolean };

export type MessengerOutboundFailedSendHandlers = {
  /** 같은 clientMessageId 로 재전송 */
  retry: () => void;
  /** 실패 말풍선 삭제(+ 미리보기 blob URL 해제) */
  discard: () => void;
  /** 방 이탈(언마운트) 시 리소스만 해제 — 상태 갱신 없음 */
  dispose?: () => void;
};

const registry = new Map<string, MessengerOutboundFailedSendHandlers>();

export function registerMessengerOutboundFailedSend(rowId: string, handlers: MessengerOutboundFailedSendHandlers): void {
  const id = rowId.trim();
  if (!id) return;
  registry.set(id, handlers);
}

export function getMessengerOutboundFailedSend(rowId: string): MessengerOutboundFailedSendHandlers | null {
  return registry.get(rowId.trim()) ?? null;
}

export function clearMessengerOutboundFailedSend(rowId: string): void {
  registry.delete(rowId.trim());
}

/** 언마운트 정리 — 지정 행들의 dispose 실행 후 제거 */
export function disposeMessengerOutboundFailedSends(rowIds: Iterable<string>): void {
  for (const raw of rowIds) {
    const id = raw.trim();
    const h = registry.get(id);
    registry.delete(id);
    try {
      h?.dispose?.();
    } catch {
      /* ignore */
    }
  }
}

/** 실패 표시(행 유지·pending 유지 → mergeRoomMessages 가 보존, 같은 cid 확정 행 도착 시 자동 제거) */
export function markMessengerOutboundRowFailed<T extends MessengerOutboundRow>(rows: T[], rowId: string): T[] {
  let changed = false;
  const next = rows.map((row) => {
    if (row.id !== rowId || row.sendFailed === true) return row;
    changed = true;
    return { ...row, pending: true, sendFailed: true } as T;
  });
  return changed ? next : rows;
}

/** 재전송 시작 — 다시 "전송 중" */
export function markMessengerOutboundRowRetrying<T extends MessengerOutboundRow>(rows: T[], rowId: string): T[] {
  let changed = false;
  const next = rows.map((row) => {
    if (row.id !== rowId || !row.sendFailed) return row;
    changed = true;
    return { ...row, pending: true, sendFailed: false } as T;
  });
  return changed ? next : rows;
}

export function isMessengerOutboundRowDisplayed(rows: readonly MessengerOutboundRow[], rowId: string): boolean {
  return rows.some((row) => row.id === rowId);
}

/**
 * C-5 — 텍스트 재전송 clientMessageId 보존 정책.
 * indeterminate 실패는 같은 (내용, cid) 를 보존해 수동 재전송이 서버 멱등으로 1행만 남게 하고,
 * definitive 거절(4xx)은 보존분이 이 cid 면 폐기한다(새 전송은 새 cid).
 */
export type MessengerUnconfirmedTextSend = { content: string; clientMessageId: string };

export function nextUnconfirmedTextSendAfterFailure(
  current: MessengerUnconfirmedTextSend | null,
  attempt: MessengerUnconfirmedTextSend,
  failure: "definitive" | "indeterminate"
): MessengerUnconfirmedTextSend | null {
  if (failure === "indeterminate") return { content: attempt.content, clientMessageId: attempt.clientMessageId };
  return current?.clientMessageId === attempt.clientMessageId ? null : current;
}

/** 성공 시 — 보존분이 이 cid 면 폐기 */
export function nextUnconfirmedTextSendAfterSuccess(
  current: MessengerUnconfirmedTextSend | null,
  clientMessageId: string
): MessengerUnconfirmedTextSend | null {
  return current?.clientMessageId === clientMessageId ? null : current;
}

/** 텍스트 전송에 쓸 cid — 같은 내용의 보존분이 있으면 재사용 */
export function pickTextSendClientMessageId(
  current: MessengerUnconfirmedTextSend | null,
  content: string,
  create: () => string
): string {
  return current && current.content === content ? current.clientMessageId : create();
}

/**
 * C-3 — '하나씩 보내기' 루프: 한 항목이 실패(또는 throw)해도 나머지를 계속 보내고 요약을 돌려준다.
 */
export async function runMessengerSequentialSends<T>(
  items: readonly T[],
  sendOne: (item: T, index: number) => Promise<boolean>
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += 1) {
    let ok = false;
    try {
      ok = await sendOne(items[i]!, i);
    } catch {
      ok = false;
    }
    if (ok) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

/**
 * C-3 / C-10 — 미디어(이미지·파일·음성) 전송 실패 처리 계획.
 * indeterminate: 행을 '전송 실패'로 유지하고 원본 바이트(녹음 Blob·파일)·cid·미리보기 URL 을 보존(재전송용).
 * definitive: 행 제거·미리보기 해제·바이트 폐기(재전송해도 같은 거절).
 */
export function planMessengerMediaSendFailure(failure: "definitive" | "indeterminate"): {
  keepRowAsFailed: boolean;
  keepBytesForRetry: boolean;
  releasePreview: boolean;
} {
  return failure === "indeterminate"
    ? { keepRowAsFailed: true, keepBytesForRetry: true, releasePreview: false }
    : { keepRowAsFailed: false, keepBytesForRetry: false, releasePreview: true };
}

/**
 * M-8 — 텍스트 전송 실패 처리 계획 (미디어 `planMessengerMediaSendFailure` 와 같은 기준).
 * indeterminate(네트워크·5xx·본문 유실): 낙관 행을 지우지 않고 '전송 실패'로 유지 → 같은 cid 재전송.
 *   행이 내용을 들고 있으므로 입력창에는 되돌리지 않는다(중복 방지).
 * definitive(4xx 거절): 재전송해도 같은 거절이라 행을 지우고, 입력창이 **비어 있을 때만** 내용을 되돌린다.
 */
export function planMessengerTextSendFailure(failure: "definitive" | "indeterminate"): {
  keepRowAsFailed: boolean;
  restoreInputIfEmpty: boolean;
} {
  return failure === "indeterminate"
    ? { keepRowAsFailed: true, restoreInputIfEmpty: false }
    : { keepRowAsFailed: false, restoreInputIfEmpty: true };
}

/** M-8 / K-3 — 실패 복원은 사용자가 그 사이 새로 입력한 내용을 덮어쓰지 않는다. */
export function shouldRestoreComposerTextOnFailure(currentInputValue: string | null | undefined, restoreText: string): boolean {
  if (!restoreText.trim()) return false;
  return !(currentInputValue ?? "").trim();
}
