/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ confirm: vi.fn() }));

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, language: "ko" }),
}));
vi.mock("@/components/admin/AdminPageHeader", () => ({ AdminPageHeader: () => null }));
vi.mock("@/lib/admin/operator-ux/admin-confirm-action", () => ({ confirmAdminAction: h.confirm }));

import { AdminAppMetaPage } from "@/components/admin/app/AdminAppMetaPage";

type Item = { key: string; value: string; updatedAt: string | null };
let root: Root;
let stored: Item[];
const fetchMock = vi.fn();

function items(immediate: string): Item[] {
  return [
    { key: "app_version", value: "", updatedAt: null },
    { key: "app_build", value: "", updatedAt: null },
    { key: "android_min_version_code", value: "", updatedAt: null },
    { key: "android_immediate_update", value: immediate, updatedAt: immediate ? "2026-10-30T00:00:00Z" : null },
  ];
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<AdminAppMetaPage />));
  await flush();
}

const row = () => document.querySelector('[data-app-meta-key="android_immediate_update"]') as HTMLElement;
const sw = () => row().querySelector('[role="switch"]') as HTMLButtonElement;
const saveBtn = () =>
  Array.from(row().querySelectorAll("button")).find((b) => b.textContent === "common_save") as HTMLButtonElement;

beforeEach(() => {
  stored = items("");
  h.confirm.mockReset().mockResolvedValue({ ok: true });
  fetchMock.mockReset().mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as { key: string; value: string };
      stored = stored.map((it) => (it.key === body.key ? { ...it, value: body.value } : it));
      return { ok: true, json: async () => ({ ok: true, ...body }) };
    }
    return { ok: true, json: async () => ({ ok: true, items: stored }) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("앱 버전·업데이트 — Android 강제 업데이트 켜기/끄기 저장", () => {
  it("shows a switch (not a text box) with the saved state", async () => {
    await mount();
    expect(sw()).toBeTruthy();
    expect(row().querySelector("input")).toBeNull();
    expect(sw().getAttribute("aria-checked")).toBe("false");
    expect(row().querySelector("[data-app-meta-saved-state]")?.getAttribute("data-app-meta-saved-state")).toBe("off");
    expect(saveBtn().disabled).toBe(true);
  });

  it("켜기 → 저장 sends value \"true\" after confirmation", async () => {
    await mount();
    await act(async () => sw().click());
    expect(sw().getAttribute("aria-checked")).toBe("true");
    expect(saveBtn().disabled).toBe(false);
    await act(async () => saveBtn().click());
    await flush();
    expect(h.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ description: "admin_app_meta_immediate_confirm_on" })
    );
    const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "PUT");
    expect(JSON.parse(String((put?.[1] as RequestInit).body))).toEqual({
      key: "android_immediate_update",
      value: "true",
    });
    expect(row().querySelector("[data-app-meta-saved-state]")?.getAttribute("data-app-meta-saved-state")).toBe("on");
  });

  it("끄기 → 저장 sends an empty value (default behavior)", async () => {
    stored = items("true");
    await mount();
    expect(sw().getAttribute("aria-checked")).toBe("true");
    await act(async () => sw().click());
    await act(async () => saveBtn().click());
    await flush();
    const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "PUT");
    expect(JSON.parse(String((put?.[1] as RequestInit).body))).toEqual({
      key: "android_immediate_update",
      value: "",
    });
  });

  it("cancelled confirmation does not save", async () => {
    h.confirm.mockResolvedValue({ ok: false });
    await mount();
    await act(async () => sw().click());
    await act(async () => saveBtn().click());
    await flush();
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === "PUT")).toBe(false);
  });

  it("legacy \"false\" row reads as off", async () => {
    stored = items("false");
    await mount();
    expect(sw().getAttribute("aria-checked")).toBe("false");
    expect(saveBtn().disabled).toBe(true);
  });
});
