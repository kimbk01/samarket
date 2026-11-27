import type { SupportCaseRow, SupportMessageRow } from "@/lib/support/support-case-types";

/**
 * 고객 문의 최종 감사 L3 (2026-11-28) — 고객 API 응답 필드 고정(화이트리스트).
 * 담당 어드민 id · 우선순위 · 어드민 미읽음 · 안내문 키 · 보낸 어드민 id 등 **내부 값은 고객에게 보내지 않는다**.
 * 남기는 필드 = 고객 화면(`components/support/**` · FAB · 사장님 고객센터)이 실제로 읽는 것 + 고객 본인이 접수한 값.
 * (2026-11-28 grep: 화면이 읽는 필드 = id · public_case_no · audience · owner_store_id · category · issue_type · status ·
 *  requester_unread_count · last_message_at · created_at / 글: id · sender_type · body · created_at · deleted_at)
 */
export type SupportRequesterCaseView = Pick<
  SupportCaseRow,
  | "id"
  | "public_case_no"
  | "audience"
  | "owner_store_id"
  | "category"
  | "issue_type"
  | "reference_type"
  | "reference_id"
  | "initial_summary"
  | "status"
  | "requester_unread_count"
  | "created_at"
  | "updated_at"
  | "last_message_at"
  | "resolved_at"
>;

export type SupportRequesterMessageView = Pick<SupportMessageRow, "id" | "case_id" | "sender_type" | "body" | "created_at"> & {
  edited_at: string | null;
  deleted_at: string | null;
};

export function toSupportRequesterCaseView(row: SupportCaseRow): SupportRequesterCaseView {
  return {
    id: row.id,
    public_case_no: row.public_case_no,
    audience: row.audience,
    owner_store_id: row.owner_store_id ?? null,
    category: row.category,
    issue_type: row.issue_type ?? null,
    reference_type: row.reference_type ?? null,
    reference_id: row.reference_id ?? null,
    initial_summary: row.initial_summary ?? null,
    status: row.status,
    requester_unread_count: Math.max(0, Math.floor(Number(row.requester_unread_count) || 0)),
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_message_at: row.last_message_at,
    resolved_at: row.resolved_at ?? null,
  };
}

/** 고객 화면 글 — 삭제된 어드민 글은 자리만 남기고 내용은 비운다(서비스가 이미 비웠어도 한 번 더). */
export function toSupportRequesterMessageView(m: SupportMessageRow): SupportRequesterMessageView {
  return {
    id: m.id,
    case_id: m.case_id,
    sender_type: m.sender_type,
    body: m.deleted_at ? "" : m.body,
    created_at: m.created_at,
    edited_at: m.edited_at ?? null,
    deleted_at: m.deleted_at ?? null,
  };
}
