/**
 * R5 Store Relationship SSOT — 1 account = 1 store.
 * Canonical ownership authority: public.stores.owner_user_id
 * (+ partial unique index stores_one_owner_one_store_uidx).
 *
 * Do not invent a second owner column, profile.store_id, or staff table.
 */

export const MEMBER_STORE_OWNER_COLUMN = "owner_user_id" as const;
export const MEMBER_STORE_ONE_OWNER_UNIQUE_INDEX = "stores_one_owner_one_store_uidx" as const;

/** Operator-facing R5 operation matrix (not every DB UPDATE is product-supported). */
export type MemberStoreRelationOpSupport =
  | "SUPPORTED"
  | "NOT_SUPPORTED"
  | "DEFERRED"
  | "FORBIDDEN"
  | "NOT_AUTHORIZED";

export const MEMBER_STORE_RELATION_OPERATION_MATRIX = {
  CREATE_RELATION: "SUPPORTED",
  ATTACH_OWNERLESS_STORE: "FORBIDDEN",
  APPROVE_PENDING_RELATION: "SUPPORTED",
  DETACH_RELATION: "NOT_AUTHORIZED",
  TRANSFER_STORE_OWNER: "NOT_AUTHORIZED",
  REPLACE_MEMBER_STORE: "NOT_AUTHORIZED",
  REMOVE_STORE_OWNERSHIP: "NOT_AUTHORIZED",
} as const satisfies Record<string, MemberStoreRelationOpSupport>;

export type MemberStoreRelationOpId = keyof typeof MEMBER_STORE_RELATION_OPERATION_MATRIX;

export type CanonicalMemberStoreRef = {
  id: string;
  name: string;
  slug?: string | null;
  approvalStatus?: string | null;
  isVisible?: boolean | null;
  connectedAt?: string | null;
};

/** Normalize heterogeneous admin store row shapes → canonical primary (1:1). */
export function resolveCanonicalMemberStore(
  stores: ReadonlyArray<{
    id?: string | null;
    store_name?: string | null;
    name?: string | null;
    slug?: string | null;
    approval_status?: string | null;
    approvalStatus?: string | null;
    is_visible?: boolean | null;
    isVisible?: boolean | null;
    created_at?: string | null;
    connectedAt?: string | null;
  }>,
): CanonicalMemberStoreRef | null {
  for (const row of stores) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const name = String(row.store_name ?? row.name ?? "").trim() || `매장 #${id.slice(0, 8)}`;
    return {
      id,
      name,
      slug: row.slug ?? null,
      approvalStatus: row.approval_status ?? row.approvalStatus ?? null,
      isVisible: row.is_visible ?? row.isVisible ?? null,
      connectedAt: row.created_at ?? row.connectedAt ?? null,
    };
  }
  return null;
}

/** Data anomaly flag — DB unique forbids >1, but read path must stay fail-closed. */
export function memberStoreRelationAnomalyCount(
  stores: ReadonlyArray<{ id?: string | null }>,
): number {
  let n = 0;
  for (const row of stores) {
    if (String(row.id ?? "").trim()) n += 1;
  }
  return n;
}

export function memberStoreApprovalStatusLabelKo(status: string | null | undefined): string {
  const s = String(status ?? "").trim().toLowerCase();
  switch (s) {
    case "pending":
      return "신청 대기";
    case "under_review":
      return "심사 중";
    case "revision_requested":
      return "보완 요청";
    case "approved":
      return "승인됨";
    case "rejected":
      return "거절됨";
    case "suspended":
      return "운영 정지";
    default:
      return s ? status!.trim() : "—";
  }
}

export const MEMBER_STORE_RELATION_COPY = {
  manage_cta: "관계 관리",
  dialog_title: "매장 운영 관계",
  dialog_description:
    "한 회원 계정은 최대 1개 매장만 운영할 수 있습니다. 운영 관계는 매장 신청·승인 흐름으로만 성립합니다.",
  none_title: "매장 없음",
  none_body: "등록된 매장 운영 관계가 없습니다. 회원이 매장 신청을 하면 여기에 표시됩니다.",
  current_store: "현재 매장",
  store_name: "매장명",
  store_id: "매장 ID",
  store_status: "매장 상태",
  relationship: "매장 운영 관계",
  relationship_operator: "매장 운영자",
  view_store: "매장 상세 보기",
  cannot_attach: "연결할 수 없음",
  cannot_attach_body:
    "관리자가 임의로 다른 매장을 연결할 수 없습니다. 매장 운영 관계는 회원의 매장 신청으로만 생성됩니다.",
  already_owns: "이미 다른 매장을 운영 중입니다",
  already_owns_body: "한 계정은 매장을 하나만 운영할 수 있어 추가 연결·이전은 허용되지 않습니다.",
  transfer_forbidden: "매장 운영자 이전은 이 화면에서 할 수 없습니다",
  transfer_forbidden_body:
    "정산·주문·권한에 영향을 주는 이전은 별도 정책 없이 진행하지 않습니다.",
  detach_forbidden: "매장 운영 관계 해제는 이 화면에서 할 수 없습니다",
  primary_confirm: "확인",
  anomaly_multi:
    "매장 운영 관계 데이터가 비정상입니다. 새로고침 후에도 계속되면 개발팀에 알려 주세요.",
} as const;
