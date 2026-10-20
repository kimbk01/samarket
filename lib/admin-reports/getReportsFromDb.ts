"use client";

/**
 * 어드민 통합 신고 목록·상세 — 서버 API(권한 키 `reports`) 호출 (거래 Admin 설계 v2 D-42 · D-43).
 * 조회·변환 본체: `admin-reports-read.server.ts`. 함수 이름·반환 형태는 기존 화면 호환을 위해 유지.
 */
import type { Report } from "@/lib/types/report";

/**
 * 어드민 신고 목록 — reports 테이블 기준. 실패는 빈 목록이 아니라 예외 (「신고 없음」 오인 방지).
 */
export async function getReportsForAdminFromDb(): Promise<Report[]> {
  const res = await fetch("/api/admin/reports", { credentials: "include", cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; reports?: Report[] };
  if (!res.ok || json.ok === false || !Array.isArray(json.reports)) {
    throw new Error(json.error || `reports_load_failed_${res.status}`);
  }
  return json.reports;
}

/**
 * 통합 신고 서버 페이지 (R7) — `GET /api/admin/reports?limit=&offset=&domain=&status=&target_type=&reason=&target=`.
 * 거래·커뮤니티 신고를 DB 에서 합쳐 필터·정렬·페이지한 결과와 정확한 전체 건수. 실패는 예외.
 */
export async function getReportsPageForAdminFromDb(
  params: URLSearchParams
): Promise<{ reports: Report[]; total: number }> {
  const res = await fetch(`/api/admin/reports?${params.toString()}`, { credentials: "include", cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    reports?: Report[];
    total?: number;
  };
  if (!res.ok || json.ok === false || !Array.isArray(json.reports)) {
    throw Object.assign(new Error(json.error || `reports_load_failed_${res.status}`), { httpStatus: res.status });
  }
  return { reports: json.reports, total: Math.max(0, Math.trunc(Number(json.total) || 0)) };
}

/**
 * 어드민 신고 1건 조회
 */
export async function getReportByIdFromDb(reportId: string): Promise<Report | null> {
  try {
    const res = await fetch(`/api/admin/reports/${encodeURIComponent(reportId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; report?: Report };
    return res.ok && json.ok !== false && json.report ? json.report : null;
  } catch {
    return null;
  }
}
