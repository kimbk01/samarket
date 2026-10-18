/** 매장 오너 주문 PATCH — 목록·상세·스테퍼 공용 */
export async function patchOwnerStoreOrderStatus(
  storeId: string,
  orderId: string,
  body: { order_status: string; estimated_prep_minutes?: number }
): Promise<{ ok: true; order_status: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      order_status?: string;
    };
    if (!res.ok || !j?.ok) {
      return { ok: false, error: typeof j?.error === "string" ? j.error : "update_failed" };
    }
    const order_status =
      typeof j.order_status === "string" && j.order_status.trim()
        ? j.order_status.trim()
        : body.order_status.trim();
    return { ok: true, order_status };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function postOwnerStoreOrderCancelRequest(
  storeId: string,
  orderId: string,
  body: { reason: string; detail_reason?: string }
): Promise<{ ok: true; order_status?: string; mode?: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}/cancel-request`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      order_status?: string;
      mode?: string;
    };
    if (!res.ok || !j?.ok) {
      return { ok: false, error: typeof j?.error === "string" ? j.error : "cancel_request_failed" };
    }
    return { ok: true, order_status: j.order_status, mode: j.mode };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/** 매장 결정 — 고객 취소·환불 요청 승인/반려 (`/decide`, 반려 사유 필수·서버 재확인) */
export async function postOwnerStoreOrderDecision(
  storeId: string,
  orderId: string,
  body: { action: string; reason?: string; expected_status: string }
): Promise<{ ok: true; order_status: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}/decide`,
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; order_status?: string };
    if (!res.ok || !j?.ok) {
      return { ok: false, error: typeof j?.error === "string" ? j.error : "decision_failed" };
    }
    return { ok: true, order_status: String(j.order_status ?? "") };
  } catch {
    return { ok: false, error: "network_error" };
  }
}
