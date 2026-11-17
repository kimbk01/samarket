/** @vitest-environment jsdom */
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLastRunSnapshot } from "@/hooks/use-last-run-snapshot";
import { updateLastRunSnapshot } from "@/lib/startup/last-run-snapshot";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COOKIE = "sb-proj-auth-token";
let renders: Array<string | null> = [];

function Probe() {
  const snap = useLastRunSnapshot();
  const line = snap?.addressLine ?? null;
  renders.push(line);
  return <span data-line>{line ?? "pending"}</span>;
}

describe("useLastRunSnapshot hydration safety (F3-a)", () => {
  beforeEach(() => {
    renders = [];
    localStorage.clear();
    document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify({ user: { id: "user-a" } }))}; path=/`;
    updateLastRunSnapshot({ member: true, addressLine: "Pasig City" }, "user-a");
  });
  afterEach(() => {
    document.cookie = `${COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.body.innerHTML = "";
  });

  it("server HTML = first client (hydration) render; snapshot applied only after mount", async () => {
    const serverHtml = renderToString(<Probe />);
    expect(serverHtml).toContain("pending");
    expect(serverHtml).not.toContain("Pasig City");

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    renders = [];
    const onRecoverableError = vi.fn();
    await act(async () => {
      hydrateRoot(container, <Probe />, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    // first client render (hydration) had no snapshot → identical to server; the layout-effect re-render applied it
    expect(renders[0]).toBeNull();
    expect(renders[renders.length - 1]).toBe("Pasig City");
    expect(container.textContent).toBe("Pasig City");
  });

  it("another account's snapshot is never shown", async () => {
    document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify({ user: { id: "user-b" } }))}; path=/`;
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Probe />);
    document.body.appendChild(container);
    await act(async () => {
      hydrateRoot(container, <Probe />);
    });
    expect(container.textContent).toBe("pending");
  });
});
