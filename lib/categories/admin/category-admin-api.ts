"use client";

/**
 * 카테고리 관리 쓰기 — 서버 API 호출 (거래 Admin 설계 v2 §C-9 · D-05).
 * 예전에는 브라우저에서 categories/category_settings 를 직접 바꿨으나, RLS(profiles.role) 때문에
 * 0행 갱신인데 「성공」으로 보이던 문제가 있었다. 이제 서버(서비스 롤 + 반영 행 확인 + 감사)에서만 쓴다.
 */
export type CategoryAdminWriteResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const ERROR_KO: Record<string, string> = {
  category_in_use: "글이나 하위 카테고리가 있어 삭제할 수 없습니다. 비활성으로 바꾸거나 글을 옮긴 뒤 삭제해 주세요.",
  not_saved: "저장되지 않았습니다. 새로고침 후 다시 시도해 주세요.",
  not_found: "카테고리를 찾을 수 없습니다.",
  invalid_field_composition: "입력 항목 구성이 올바르지 않습니다.",
  name_slug_required: "이름과 주소(slug)를 입력해 주세요.",
  forbidden_permission: "권한이 없습니다.",
};

export async function postCategoryAdminOp<T = object>(body: Record<string, unknown>): Promise<CategoryAdminWriteResult<T>> {
  try {
    const res = await fetch("/api/admin/trade/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
    if (res.ok && json.ok) return json as { ok: true } & T;
    const code = String(json.error ?? `http_${res.status}`);
    return { ok: false, error: ERROR_KO[code] ?? code };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "network_error" };
  }
}
