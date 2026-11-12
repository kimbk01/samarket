// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { HTML_SHELL_FLAGS_INLINE_SCRIPT, syncHtmlShellFlagsFromDom } from "@/lib/layout/html-shell-flags";

const ROOT = join(__dirname, "../../..");

describe("D1 F1 — html·body :has 규칙 대체 셸 속성", () => {
  it("app/*.css 에 html·body 주어 :has 규칙이 없다 (문서 전체 스타일 재계산 원인)", () => {
    const offenders: string[] = [];
    for (const f of readdirSync(join(ROOT, "app")).filter((n) => n.endsWith(".css"))) {
      const css = readFileSync(join(ROOT, "app", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      if (/(^|[\s,{}])(html|body|:root)(:not\()?:has\(/m.test(css)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("DOM 조건을 예전 :has 와 같게 판정", () => {
    document.body.innerHTML = `
      <div class="app-shell" data-dibay-nav-presentation="DESKTOP_SIDE_RAIL"></div>
      <nav class="app-bottom-nav-shell app-bottom-nav-shell--delivery app-bottom-nav-shell--scroll-hidden">
        <a class="app-bottom-nav-item--domain-hub"><div class="app-bottom-nav-icon-slot--domain-hub-orbit"></div></a>
      </nav>
      <div class="stores-home-hub"></div>
      <div data-stores-browse-ptr-hint=""></div>
      <div class="dibay-overlay-root"></div>
      <div data-admin-console="v2"></div>`;
    syncHtmlShellFlagsFromDom(document);
    const h = document.documentElement;
    for (const a of [
      "data-shell-bottom-nav",
      "data-shell-bottom-nav-delivery",
      "data-shell-bottom-nav-scroll-hidden",
      "data-shell-bottom-nav-orbit",
      "data-shell-desktop-side-rail",
      "data-shell-stores-home-hub",
      "data-shell-stores-browse-ptr-hint",
      "data-shell-overlay-open",
      "data-shell-admin-console-v2",
    ]) {
      expect(h.getAttribute(a)).toBe("1");
    }
    expect(h.hasAttribute("data-shell-bottom-nav-side-rail")).toBe(false);
    document.body.innerHTML = "";
    syncHtmlShellFlagsFromDom(document);
    expect(h.getAttributeNames().filter((n) => n.startsWith("data-shell-"))).toEqual([]);
  });

  it("하단 탭이 여러 개면 그중 하나라도 해당하면 참 — 예전 :has 와 같음 (D1 R4)", () => {
    document.body.innerHTML = `<nav class="app-bottom-nav-shell"></nav><nav class="app-bottom-nav-shell app-bottom-nav-shell--delivery app-bottom-nav-shell--scroll-hidden"><a class="app-bottom-nav-item--domain-hub"><span class="app-bottom-nav-icon-slot--domain-hub-orbit"></span></a></nav>`;
    syncHtmlShellFlagsFromDom(document);
    const h = document.documentElement;
    expect(h.getAttribute("data-shell-bottom-nav")).toBe("1");
    expect(h.getAttribute("data-shell-bottom-nav-delivery")).toBe("1");
    expect(h.getAttribute("data-shell-bottom-nav-scroll-hidden")).toBe("1");
    expect(h.getAttribute("data-shell-bottom-nav-orbit")).toBe("1");
    document.body.innerHTML = "";
    syncHtmlShellFlagsFromDom(document);
    expect(h.hasAttribute("data-shell-bottom-nav-delivery")).toBe(false);
  });

  it("인라인 스크립트는 외부 참조 없이 실행된다 (첫 그림 전)", () => {
    document.body.innerHTML = `<nav class="app-bottom-nav-shell"></nav>`;
    document.documentElement.removeAttribute("data-shell-bottom-nav");
    new Function(HTML_SHELL_FLAGS_INLINE_SCRIPT)();
    expect(document.documentElement.getAttribute("data-shell-bottom-nav")).toBe("1");
  });

  it("소유 컴포넌트가 갱신을 요청한다", () => {
    for (const f of [
      "components/layout/BottomNav.tsx",
      "components/layout/ConditionalAppShell.tsx",
      "components/stores/home/hub/StoresHomeHub.tsx",
      "components/stores/browse/StoresBrowsePullRefreshHint.tsx",
      "components/ui/dibay-overlay/DibayOverlayRoot.tsx",
      "components/admin/users/MemberAdminDialog.tsx",
      "components/admin/shell/AdminPlatformShell.tsx",
      "components/stores/owner/OwnerMobileBottomNav.tsx",
    ]) {
      expect(readFileSync(join(ROOT, f), "utf8")).toContain("useHtmlShellFlagsSync(");
    }
    expect(readFileSync(join(ROOT, "components/layout/ConditionalAppShell.tsx"), "utf8")).toContain(
      "HTML_SHELL_FLAGS_INLINE_SCRIPT"
    );
  });

  it("하단 탭(`BOTTOM_NAV_SHELL.outerClassName`)을 그리는 컴포넌트는 모두 갱신을 요청한다 (2026-11-12 재감사 FAIL 2)", () => {
    const out = execFileSync("git", ["grep", "-l", "BOTTOM_NAV_SHELL.outerClassName", "--", "components", "app"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const files = out.split("\n").filter((f) => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const f of files) {
      expect(readFileSync(join(ROOT, f), "utf8"), f).toContain("useHtmlShellFlagsSync(");
    }
  });
});
