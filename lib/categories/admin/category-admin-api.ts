"use client";

/**
 * 카테고리 관리 쓰기 — 서버 API 호출 (거래 Admin 설계 v2 §C-9 · D-05).
 * 예전에는 브라우저에서 categories/category_settings 를 직접 바꿨으나, RLS(profiles.role) 때문에
 * 0행 갱신인데 「성공」으로 보이던 문제가 있었다. 이제 서버(서비스 롤 + 반영 행 확인 + 감사)에서만 쓴다.
 */
import { adminHttpStatusErrorMessage, adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";

/** 실패 시 `error` = 운영자 문구 (오류 맵), `code` = 서버 오류 코드 (화면에 그대로 보이지 않는다). */
export type CategoryAdminWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code: string; httpStatus: number };

const ERROR_KO: Record<string, string> = {
  category_in_use: "글이나 하위 카테고리가 있어 삭제할 수 없습니다. 비활성으로 바꾸거나 글을 옮긴 뒤 삭제해 주세요.",
  not_saved: "저장되지 않았습니다. 새로고침 후 다시 시도해 주세요.",
  not_found: "카테고리를 찾을 수 없습니다.",
  invalid_field_composition: "입력 항목 구성이 올바르지 않습니다.",
  name_slug_required: "이름과 주소(slug)를 입력해 주세요.",
  forbidden_permission: "권한이 없습니다.",
};

/** 오류 코드 → 운영자 문구. 카테고리 전용 코드 → 공용 오류 맵 → (코드 없음) HTTP 상태 문구. 코드·원문을 그대로 돌려주지 않는다. */
export function categoryAdminErrorText(code: string | null | undefined, httpStatus?: number | null): string {
  const c = String(code ?? "").trim();
  if (ERROR_KO[c]) return ERROR_KO[c];
  if ((!c || /^http_\d+$/.test(c)) && httpStatus) return adminHttpStatusErrorMessage(httpStatus, true);
  return adminOperatorErrorMessage(c, true);
}

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
    return { ok: false, error: categoryAdminErrorText(code, res.status), code, httpStatus: res.status };
  } catch {
    return { ok: false, error: categoryAdminErrorText("network_error", 0), code: "network_error", httpStatus: 0 };
  }
}
