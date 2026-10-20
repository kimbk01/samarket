/**
 * 관리자 확인창 호스트 연결 (수정 계획 2-3) — `confirmAdminAction` 이 관리자 셸에 붙은
 * `AdminConfirmHost`(= AdminActionConfirmDialog 하나)를 열도록 잇는다. 셸 밖(호스트 없음)이면 null.
 * 클라이언트 안전.
 */

import type { AdminMutationConfirmTone } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";

export type AdminConfirmHostRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: AdminMutationConfirmTone;
  reasonRequired: boolean;
  reasonMinLength?: number;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  confirmMatchText?: string;
  confirmMatchLabel?: string;
};

export type AdminConfirmHostResult = { ok: boolean; reason: string };

type Opener = (req: AdminConfirmHostRequest) => Promise<AdminConfirmHostResult>;

let opener: Opener | null = null;

/** 호스트가 마운트될 때 등록한다. 돌려받은 함수로 해제. */
export function registerAdminConfirmHost(fn: Opener): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

/** 호스트가 있으면 확인창을 열고 결과를, 없으면 null 을 돌려준다. */
export function openAdminConfirmHost(req: AdminConfirmHostRequest): Promise<AdminConfirmHostResult> | null {
  return opener ? opener(req) : null;
}
