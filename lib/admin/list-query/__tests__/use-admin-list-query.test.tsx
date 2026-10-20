// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useAdminListQuery,
  type UseAdminListQueryResult,
} from "@/lib/admin/list-query/use-admin-list-query";

let search = "";
const replaceMock = vi.fn((href: string) => {
  const i = href.indexOf("?");
  search = i >= 0 ? href.slice(i + 1) : "";
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/admin/sample",
  useSearchParams: () => new URLSearchParams(search),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let latest: UseAdminListQueryResult<"domain"> | null = null;

function capture(r: UseAdminListQueryResult<"domain">) {
  latest = r;
}

function Probe() {
  const r = useAdminListQuery<"domain">({ statuses: ["pending", "completed"], extras: ["domain"] });
  useEffect(() => capture(r));
  return null;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render() {
  act(() => {
    root!.render(<Probe />);
  });
}

function run(fn: (r: UseAdminListQueryResult<"domain">) => void) {
  act(() => fn(latest!));
  render(); // 주소 변경을 반영해 다시 그림 (실제 앱에서는 router 가 다시 그린다)
}

describe("useAdminListQuery", () => {
  beforeEach(() => {
    search = "tab=queue&page=3&status=pending";
    replaceMock.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    render();
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    latest = null;
  });

  it("주소에서 조건을 읽는다", () => {
    expect(latest!.query).toMatchObject({ page: 3, status: "pending", size: 20 });
    expect(latest!.apiQueryString).toBe("limit=20&offset=40&status=pending");
    expect(latest!.isFiltered).toBe(true);
  });

  it("상태 변경은 즉시 적용 + 1쪽 + tab 유지", () => {
    run((r) => r.setStatus("completed"));
    expect(replaceMock).toHaveBeenLastCalledWith("/admin/sample?tab=queue&status=completed", { scroll: false });
    expect(latest!.query.page).toBe(1);
  });

  it("검색어는 draft 에만 — submit 때 적용", () => {
    run((r) => r.setDraft({ q: "hello" }));
    expect(replaceMock).not.toHaveBeenCalled();
    expect(latest!.draft.q).toBe("hello");
    expect(latest!.query.q).toBe("");
    run((r) => r.submit());
    expect(replaceMock).toHaveBeenLastCalledWith("/admin/sample?tab=queue&status=pending&q=hello", { scroll: false });
    expect(latest!.query.q).toBe("hello");
  });

  it("페이지·크기", () => {
    run((r) => r.setPage(5));
    expect(search).toBe("tab=queue&status=pending&page=5");
    run((r) => r.setSize(100));
    expect(search).toBe("tab=queue&status=pending&size=100");
  });

  it("추가 키는 즉시 적용", () => {
    run((r) => r.setExtra("domain", "trade"));
    expect(search).toBe("tab=queue&status=pending&domain=trade");
  });

  it("reset — 기본값 + draft 비움, tab 유지", () => {
    run((r) => r.setDraft({ q: "draft-only" }));
    run((r) => r.reset());
    expect(search).toBe("tab=queue");
    expect(latest!.draft).toEqual({ q: "", from: "", to: "" });
    expect(latest!.isFiltered).toBe(false);
  });

  it("refresh — 같은 조건, refreshKey 만 바뀐다", () => {
    const before = latest!.refreshKey;
    run((r) => r.refresh());
    expect(replaceMock).not.toHaveBeenCalled();
    expect(latest!.refreshKey).not.toBe(before);
    expect(latest!.refreshKey.startsWith(latest!.apiQueryString)).toBe(true);
  });

  it("같은 조건으로 submit 하면 주소 대신 refreshKey 가 바뀐다", () => {
    search = "tab=queue&status=pending";
    render();
    const before = latest!.refreshKey;
    run((r) => r.submit());
    expect(replaceMock).not.toHaveBeenCalled();
    expect(latest!.refreshKey).not.toBe(before);
  });

  it("주소가 바뀌면(뒤로가기) draft 를 다시 맞춘다", () => {
    run((r) => r.setDraft({ q: "typing" }));
    search = "q=from-history";
    render();
    expect(latest!.draft.q).toBe("from-history");
  });
});
