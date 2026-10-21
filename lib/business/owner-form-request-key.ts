/**
 * IA-22 / FIN-04 — one idempotency key per money form submission.
 *
 * The form holds the key in state (`useState(() => newOwnerFormRequestKey("bc_topup"))`), sends the SAME key on
 * every retry / double tap, and replaces it only after a successful response. Never derive keys from Date.now()
 * at submit time: each retry would become a new request.
 */
export function newOwnerFormRequestKey(prefix: string): string {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${id}`;
}

/** Deposit method label for the Cash top-up form (keys come from the DB policy). */
export function ownerCashTopUpMethodLabel(method: string, ko: boolean): string {
  switch (method) {
    case "bank_transfer":
      return ko ? "은행 이체" : "Bank transfer";
    case "gcash":
      return "GCash";
    case "maya":
      return "Maya";
    case "other":
      return ko ? "기타" : "Other";
    default:
      return method;
  }
}
