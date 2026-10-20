// @vitest-environment jsdom
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminTabs, nextAdminTabId } from "@/components/admin/ui/AdminTabs";
import { AdminDetailDrawer } from "@/components/admin/ui/AdminDetailDrawer";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";

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

/** 확인 팝업은 DibayDialog 포털 대신 단순 버튼으로 (닫기 확인 흐름만 검증). */
vi.mock("@/components/admin/ui/AdminActionConfirmDialog", () => ({
  AdminActionConfirmDialog: ({
    open,
    title,
    confirmLabel,
    cancelLabel,
    onCancel,
    onConfirm,
  }: {
    open: boolean;
    title: string;
    confirmLabel: string;
    cancelLabel: string;
    onCancel: () => void;
    onConfirm: (r: string) => void;
  }) =>
    open ? (
      <div data-testid="confirm">
        <p>{title}</p>
        <button type="button" data-testid="confirm-cancel" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" data-testid="confirm-ok" onClick={() => onConfirm("")}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(node: ReactNode) {
  act(() => root!.render(node));
}

function key(el: Element | Document | Window, k: string, opts: KeyboardEventInit = {}) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...opts }));
  });
}

function click(el: Element | null) {
  act(() => {
    (el as HTMLElement).click();
  });
}

beforeEach(() => {
  search = "";
  replaceMock.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

const TABS = [
  { id: "a", label: "A" },
  { id: "b", label: "B", disabled: true },
  { id: "c", label: "C" },
];

describe("AdminTabs", () => {
  it("nextAdminTabId — 비활성 건너뜀 · 순환 · Home/End", () => {
    expect(nextAdminTabId(TABS, "a", "ArrowRight")).toBe("c");
    expect(nextAdminTabId(TABS, "c", "ArrowRight")).toBe("a");
    expect(nextAdminTabId(TABS, "a", "ArrowLeft")).toBe("c");
    expect(nextAdminTabId(TABS, "c", "Home")).toBe("a");
    expect(nextAdminTabId(TABS, "a", "End")).toBe("c");
    expect(nextAdminTabId(TABS, "a", "Enter")).toBeNull();
  });

  it("클릭·화살표 → 주소 ?tab= 갱신(기본 탭은 생략) · page 제거 · onChange", () => {
    search = "page=4&status=x";
    const onChange = vi.fn();
    mount(<AdminTabs tabs={TABS} ariaLabel="t" idBase="tb" onChange={onChange} />);
    click(document.getElementById("tb-tab-c"));
    expect(replaceMock).toHaveBeenLastCalledWith("/admin/sample?status=x&tab=c", { scroll: false });
    expect(onChange).toHaveBeenLastCalledWith("c");
    mount(<AdminTabs tabs={TABS} ariaLabel="t" idBase="tb" onChange={onChange} />);
    expect(document.getElementById("tb-tab-c")?.getAttribute("aria-selected")).toBe("true");
    key(document.getElementById("tb-tab-c")!, "ArrowRight");
    expect(replaceMock).toHaveBeenLastCalledWith("/admin/sample?status=x", { scroll: false });
    expect(document.activeElement?.id).toBe("tb-tab-a");
  });

  it("다른 param · syncUrl=false", () => {
    const onChange = vi.fn();
    mount(<AdminTabs tabs={TABS} ariaLabel="t" idBase="tb" param="view" syncUrl={false} onChange={onChange} />);
    click(document.getElementById("tb-tab-c"));
    expect(replaceMock).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith("c");
  });
});

describe("AdminFilterBar / AdminPagination 동작", () => {
  it("Enter(submit) → onSubmit, 초기화 → onReset, 상태 변경 → 즉시 onChange", () => {
    const onSubmit = vi.fn();
    const onReset = vi.fn();
    const onStatus = vi.fn();
    mount(
      <AdminFilterBar
        ko
        draft={{ q: "", from: "", to: "" }}
        onDraftChange={() => {}}
        onSubmit={onSubmit}
        onReset={onReset}
        status={{ value: "", onChange: onStatus, options: [{ value: "x", label: "X" }] }}
      />
    );
    const form = document.querySelector("form")!;
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    click(document.querySelector('[data-admin-filter-reset="1"]'));
    expect(onReset).toHaveBeenCalledTimes(1);
    const select = document.querySelector<HTMLSelectElement>('select[name="status"]')!;
    act(() => {
      select.value = "x";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onStatus).toHaveBeenCalledWith("x");
  });

  it("페이지 이동·크기 변경", () => {
    const onPage = vi.fn();
    const onSize = vi.fn();
    mount(<AdminPagination ko page={2} size={20} total={100} onPageChange={onPage} onSizeChange={onSize} />);
    click(document.querySelector('[aria-label="다음 페이지"]'));
    expect(onPage).toHaveBeenLastCalledWith(3);
    click(document.querySelector('[aria-label="5쪽"]'));
    expect(onPage).toHaveBeenLastCalledWith(5);
    const select = document.querySelector<HTMLSelectElement>('[data-admin-pagination-size="1"]')!;
    act(() => {
      select.value = "100";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSize).toHaveBeenCalledWith(100);
  });
});

function DrawerHarness({ dirty = false, onClose }: { dirty?: boolean; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="opener" onClick={() => setOpen(true)}>
        open
      </button>
      <AdminDetailDrawer
        open={open}
        ko
        dirty={dirty}
        title="상세"
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        primaryActions={<button type="button">승인</button>}
      >
        <input data-testid="field" />
      </AdminDetailDrawer>
    </>
  );
}

describe("AdminDetailDrawer", () => {
  it("열면 첫 요소 포커스 · Esc 닫기 · 포커스 복귀 · body 포털", () => {
    const onClose = vi.fn();
    mount(<DrawerHarness onClose={onClose} />);
    const opener = document.querySelector<HTMLButtonElement>('[data-testid="opener"]')!;
    opener.focus();
    click(opener);
    const panel = document.querySelector('[data-admin-detail-drawer-panel="1"]');
    expect(panel).not.toBeNull();
    expect(host!.contains(panel)).toBe(false); // body 포털
    expect(document.activeElement?.getAttribute("data-admin-detail-drawer-close")).toBe("1");
    expect(document.body.style.overflow).toBe("hidden");
    key(window, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-admin-detail-drawer-panel="1"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
  });

  it("Tab 순환 (마지막 → 첫, Shift+Tab 첫 → 마지막)", () => {
    mount(<DrawerHarness onClose={() => {}} />);
    click(document.querySelector('[data-testid="opener"]'));
    const panel = document.querySelector<HTMLElement>('[data-admin-detail-drawer-panel="1"]')!;
    const items = Array.from(panel.querySelectorAll<HTMLElement>("button, input"));
    const first = items[0];
    const last = items[items.length - 1];
    last.focus();
    key(last, "Tab");
    expect(document.activeElement).toBe(first);
    key(first, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("dirty → 확인 후 닫기 (계속 편집이면 유지, Esc 는 팝업 우선)", () => {
    const onClose = vi.fn();
    mount(<DrawerHarness dirty onClose={onClose} />);
    click(document.querySelector('[data-testid="opener"]'));
    click(document.querySelector('[data-admin-detail-drawer-close="1"]'));
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="confirm"]')?.textContent).toContain("저장하지 않은 변경 사항이 있습니다");
    key(window, "Escape"); // 팝업이 떠 있으면 드로어는 무시
    expect(onClose).not.toHaveBeenCalled();
    click(document.querySelector('[data-testid="confirm-cancel"]'));
    expect(document.querySelector('[data-testid="confirm"]')).toBeNull();
    expect(document.querySelector('[data-admin-detail-drawer-panel="1"]')).not.toBeNull();
    key(window, "Escape");
    click(document.querySelector('[data-testid="confirm-ok"]'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-admin-detail-drawer-panel="1"]')).toBeNull();
  });
});
