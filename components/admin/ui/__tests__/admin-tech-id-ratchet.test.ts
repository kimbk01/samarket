/**
 * 설계 v4 §7 「기술 정보」 ratchet — 관리자 화면에서 UUID 조각(`.slice(0, 8)`)을 직접 만들지 않는다.
 *
 * 짧은 ID 표시는 `components/admin/ui/AdminTechId.tsx` 한 곳에서만 한다:
 *  - JSX 표시 → `<AdminTechId id={…} />` (흐린 고정폭 + 복사 버튼, 전체 ID 는 title·aria)
 *  - 문자열 문맥(이름 대체·결과 문구·aria) → `formatAdminShortId` / `formatAdminShortIdEllipsis`
 *  - 상세 화면 원시 값 모음 → `<AdminTechInfo rows={…} />` (접이식 「기술 정보」)
 *
 * 대상: app/admin/**, components/admin/** (테스트 제외). AdminTechId.tsx 자체는 제외.
 * `ADMIN_RAW_ID_SLICE_ALLOWLIST` = 파일별 허용 개수(정당한 비표시 사용 · 동시 작업 보류). **줄어들기만 해야 한다.**
 * `concurrent` 항목(다른 작업이 동시에 고치는 파일)은 상한만 검사한다 — 그 작업 병합 후 AdminTechId 로 옮기고 지운다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCAN_DIRS = ["app/admin", "components/admin"];
const CANONICAL_FILE = "components/admin/ui/AdminTechId.tsx";
const SLICE_0_8 = /\.slice\(\s*0\s*,\s*8\s*\)/g;

/** 파일 → 허용 개수 + 사유. */
const ADMIN_RAW_ID_SLICE_ALLOWLIST: Readonly<Record<string, { count: number; reason: string; concurrent?: true }>> = {
  // ── 비표시 사용 (ID 가 아님 / 저장 데이터)
  "components/admin/users/AdminMemberListBulkBar.tsx": {
    count: 1,
    reason: "선택 회원 배열 앞 8명 미리보기 (Array.slice, ID 축약 아님)",
  },
  "components/admin/community-messenger/AdminCommunityMessengerPage.tsx": {
    count: 2,
    reason: "통계 상위 8개 행 (Array.slice, ID 축약 아님)",
  },
  "components/admin/business/AdminBusinessCcManageEditors.tsx": {
    count: 1,
    reason: "API 로 저장하는 policy_name 값 (데이터 계약 — 표시 변경 금지 범위)",
  },
  // ── 동시 작업 파일 (F6-B 범위 밖 — 해당 작업 병합 후 AdminTechId 로 교체)
  "components/admin/finance/AdminStoreFinancialStatement.tsx": {
    count: 7,
    reason: "날짜 시간대 ratchet allowlist 파일 — 동시 수정 중이라 보류",
    concurrent: true,
  },
  "components/admin/stores/AdminStoreFeePoliciesPage.tsx": {
    count: 2,
    reason: "날짜 시간대 ratchet allowlist 파일 — 동시 수정 중이라 보류",
    concurrent: true,
  },
  "components/admin/platform-popup/AdminPlatformPopupListPage.tsx": {
    count: 1,
    reason: "platform-popup 동시 수정 중 — 보류",
    concurrent: true,
  },
  "components/admin/platform-popup/AdminPlatformPopupDetailWorkspace.tsx": {
    count: 1,
    reason: "platform-popup 동시 수정 중 — 보류",
    concurrent: true,
  },
  "components/admin/platform-popup/AdminPlatformPopupRequestQueue.tsx": {
    count: 1,
    reason: "platform-popup 동시 수정 중 — 보류",
    concurrent: true,
  },
};

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function countSlices(): Map<string, number> {
  const out = new Map<string, number>();
  for (const dir of SCAN_DIRS) {
    for (const file of listSourceFiles(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      if (rel === CANONICAL_FILE) continue;
      const n = (readFileSync(file, "utf8").match(SLICE_0_8) ?? []).length;
      if (n > 0) out.set(rel, n);
    }
  }
  return out;
}

describe("설계 v4 §7 기술 정보 — 원시 ID 표시 ratchet", () => {
  const current = countSlices();

  it("허용 목록 밖에서 `.slice(0, 8)` 을 쓰지 않는다 (AdminTechId / formatAdminShortId 사용)", () => {
    const over = [...current.entries()]
      .filter(([file, n]) => n > (ADMIN_RAW_ID_SLICE_ALLOWLIST[file]?.count ?? 0))
      .map(([file, n]) => `${file}: ${n} > ${ADMIN_RAW_ID_SLICE_ALLOWLIST[file]?.count ?? 0}`);
    expect(over).toEqual([]);
  });

  it("허용 목록은 줄어들기만 한다 (고쳐진 파일은 개수를 낮추거나 지운다)", () => {
    const stale = Object.entries(ADMIN_RAW_ID_SLICE_ALLOWLIST)
      .filter(([file, { count, concurrent }]) => !concurrent && (current.get(file) ?? 0) < count)
      .map(([file, { count }]) => `${file}: ${current.get(file) ?? 0} < ${count}`);
    expect(stale).toEqual([]);
  });

  it("허용 항목마다 사유가 있다", () => {
    for (const [file, { reason }] of Object.entries(ADMIN_RAW_ID_SLICE_ALLOWLIST)) {
      expect(reason.trim().length, file).toBeGreaterThan(0);
    }
  });

  it("정규 컴포넌트가 짧은 ID·복사·기술 정보를 제공한다", () => {
    const src = readFileSync(path.join(ROOT, CANONICAL_FILE), "utf8");
    expect(src).toContain("export function AdminTechId");
    expect(src).toContain("export function AdminTechInfo");
    expect(src).toContain("navigator.clipboard");
    expect(src).toContain("admin_tech_info_title");
  });
});

describe("formatAdminShortId", () => {
  it("8자 초과만 자르고, 말줄임은 잘렸을 때만", async () => {
    const { formatAdminShortId, formatAdminShortIdEllipsis } = await import("@/components/admin/ui/AdminTechId");
    expect(formatAdminShortId("0123456789abcdef")).toBe("01234567");
    expect(formatAdminShortId("abc")).toBe("abc");
    expect(formatAdminShortId(null)).toBe("");
    expect(formatAdminShortIdEllipsis("0123456789abcdef")).toBe("01234567…");
    expect(formatAdminShortIdEllipsis("abc")).toBe("abc");
  });
});
