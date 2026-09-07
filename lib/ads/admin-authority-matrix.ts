/**
 * Admin Authority CTA map — ADDENDUM LOCK §3.
 * Only writer-backed actions. UI must not invent CTAs from this matrix.
 */

export type AdminAuthorityVerb =
  | "CREATE"
  | "VIEW"
  | "EDIT"
  | "EXTEND_PAID"
  | "EXTEND_COMPENSATION"
  | "SHORTEN"
  | "RESCHEDULE"
  | "APPROVE"
  | "REJECT"
  | "REQUEST_REVISION"
  | "HOLD"
  | "CANCEL_REQUEST"
  | "DELETE_DRAFT"
  | "ARCHIVE"
  | "PAUSE"
  | "RESUME"
  | "END"
  | "TERMINATE"
  | "REFUND"
  | "CHANGE_PLACEMENT"
  | "CHANGE_PRIORITY"
  | "REPLACE_CREATIVE"
  | "VIEW_PAYMENT"
  | "VIEW_HISTORY"
  | "ADD_INTERNAL_MEMO";

export type AdminAuthorityFamily =
  | "delivery_sponsored"
  | "delivery_banner"
  | "feed_banner"
  | "boost_trade"
  | "boost_community"
  | "platform_popup";

/** Y = writer exists · GAP = do not show CTA yet · N = unsupported */
export type AdminAuthoritySupport = "Y" | "GAP" | "N";

export const ADMIN_AUTHORITY_MATRIX: Record<
  AdminAuthorityFamily,
  Partial<Record<AdminAuthorityVerb, AdminAuthoritySupport>>
> = {
  delivery_sponsored: {
    VIEW: "Y",
    APPROVE: "Y",
    REJECT: "Y",
    REQUEST_REVISION: "Y",
    PAUSE: "Y",
    RESUME: "Y",
    END: "Y",
    TERMINATE: "Y",
    EXTEND_PAID: "Y",
    EXTEND_COMPENSATION: "Y",
    SHORTEN: "Y",
    RESCHEDULE: "Y",
    DELETE_DRAFT: "Y",
    ARCHIVE: "Y",
    CREATE: "N", // first-party store_sponsored blocked
    REPLACE_CREATIVE: "N",
    VIEW_PAYMENT: "Y",
    VIEW_HISTORY: "Y",
    ADD_INTERNAL_MEMO: "Y",
    REFUND: "GAP",
  },
  delivery_banner: {
    VIEW: "Y",
    CREATE: "Y", // admin first-party
    APPROVE: "Y",
    REJECT: "Y",
    REQUEST_REVISION: "Y",
    PAUSE: "Y",
    RESUME: "Y",
    END: "Y",
    TERMINATE: "Y",
    EXTEND_PAID: "Y",
    EXTEND_COMPENSATION: "Y",
    SHORTEN: "Y",
    RESCHEDULE: "Y",
    REPLACE_CREATIVE: "Y",
    DELETE_DRAFT: "Y",
    ARCHIVE: "Y",
    CHANGE_PLACEMENT: "GAP",
    VIEW_PAYMENT: "Y",
    VIEW_HISTORY: "Y",
    ADD_INTERNAL_MEMO: "Y",
    REFUND: "GAP",
  },
  feed_banner: {
    VIEW: "Y",
    CREATE: "Y",
    APPROVE: "Y",
    REJECT: "Y",
    PAUSE: "Y",
    RESUME: "Y",
    END: "Y",
    EXTEND_PAID: "N",
    EXTEND_COMPENSATION: "Y",
    REPLACE_CREATIVE: "Y",
    CHANGE_PRIORITY: "Y",
    DELETE_DRAFT: "N",
    VIEW_HISTORY: "Y",
    ADD_INTERNAL_MEMO: "Y",
    REFUND: "GAP",
  },
  boost_trade: {
    VIEW: "Y",
    // OWNER POLICY: new purchases skip approval; legacy pending rows may still approve/reject.
    APPROVE: "Y",
    REJECT: "Y",
    CANCEL_REQUEST: "Y",
    // applyBoostLifecycle pause/resume/end — Admin sanction after auto-live.
    PAUSE: "Y",
    RESUME: "Y",
    END: "Y",
    EXTEND_PAID: "N",
    DELETE_DRAFT: "N",
    VIEW_PAYMENT: "Y",
    VIEW_HISTORY: "Y",
    ADD_INTERNAL_MEMO: "Y",
  },
  boost_community: {
    VIEW: "Y",
    APPROVE: "Y",
    REJECT: "Y",
    CANCEL_REQUEST: "Y",
    PAUSE: "Y",
    RESUME: "Y",
    END: "Y",
    EXTEND_PAID: "N",
    DELETE_DRAFT: "N",
    VIEW_PAYMENT: "Y",
    VIEW_HISTORY: "Y",
    ADD_INTERNAL_MEMO: "Y",
  },
  platform_popup: {
    VIEW: "Y",
    CREATE: "Y",
    APPROVE: "Y",
    REJECT: "Y",
    PAUSE: "Y",
    RESUME: "Y",
    END: "Y",
    CHANGE_PRIORITY: "Y",
    REPLACE_CREATIVE: "Y",
    EXTEND_PAID: "N",
    /** Draft / incomplete Admin Direct only — writer enforces; never live/scheduled. */
    DELETE_DRAFT: "Y",
    VIEW_HISTORY: "Y",
    ADD_INTERNAL_MEMO: "Y",
  },
};

export function isAdminAuthorityCtaAllowed(
  family: AdminAuthorityFamily,
  verb: AdminAuthorityVerb
): boolean {
  return ADMIN_AUTHORITY_MATRIX[family][verb] === "Y";
}

/** Human verb meanings — DELETE ≠ END ≠ TERMINATE ≠ ARCHIVE */
export const ADMIN_AUTHORITY_VERB_MEANING = {
  DELETE_DRAFT: "draft_or_invalid_request_only_physical_delete",
  END: "normal_completion",
  TERMINATE: "admin_force_kill_active_or_scheduled",
  ARCHIVE: "hide_from_ops_list_keep_history",
} as const;

export type InternalMemoRecord = {
  adminId: string;
  memo: string;
  createdAt: string;
};

/** INTERNAL_MEMO ≠ PUBLIC_APPLICANT_MESSAGE */
export function splitAdminMessages(input: {
  internalMemo?: string | null;
  applicantVisibleMessage?: string | null;
}): { internalMemo: string | null; publicAdminMessage: string | null } {
  return {
    internalMemo: input.internalMemo?.trim() || null,
    publicAdminMessage: input.applicantVisibleMessage?.trim() || null,
  };
}
