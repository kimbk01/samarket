/** 매장 오너 주문 PATCH — 목록·상세·스테퍼 공용 */
export async function patchOwnerStoreOrderStatus(
  storeId: string,
  orderId: string,
  body: { order_status: string; estimated_prep_minutes?: number }
): Promise<{ ok: true } | { ok: false; error: string }> {
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
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j?.ok) {
      return { ok: false, error: typeof j?.error === "string" ? j.error : "update_failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "network_error" };
  }
}
