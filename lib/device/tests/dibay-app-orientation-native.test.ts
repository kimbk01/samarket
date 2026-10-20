import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setRouteMode } = vi.hoisted(() => ({ setRouteMode: vi.fn() }));
let shell: "android" | "ios" | null = null;
let deviceClass = "TABLET_ANDROID";
let capturedEffect: (() => void | (() => void)) | null = null;

vi.mock("@capacitor/core", () => ({
  registerPlugin: () => ({ setRouteMode }),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  resolveCapacitorShellPlatform: () => shell,
}));

vi.mock("@/lib/device/dibay-device-class", () => ({
  resolveDibayDeviceClass: async () => ({ deviceClass, source: "test" }),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (fn: () => void | (() => void)) => {
      capturedEffect = fn;
    },
  };
});

import {
  DIBAY_APP_ORIENTATION_PLUGIN_ID,
  setDibayAppRouteOrientationMode,
} from "@/lib/device/dibay-app-orientation-native";
import { useDibayAdminLandscapeRouteMode } from "@/lib/device/use-dibay-admin-landscape-route-mode";

type GlobalWithWindow = { window?: unknown };

function setWindow(headers?: Array<{ name: string }>) {
  (globalThis as GlobalWithWindow).window = headers ? { Capacitor: { PluginHeaders: headers } } : {};
}

async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

beforeEach(() => {
  setRouteMode.mockReset();
  setRouteMode.mockResolvedValue({});
  shell = null;
  deviceClass = "TABLET_ANDROID";
  capturedEffect = null;
  setWindow();
});

afterEach(() => {
  delete (globalThis as GlobalWithWindow).window;
});

describe("setDibayAppRouteOrientationMode", () => {
  it("web (no Capacitor shell) → no-op", async () => {
    await expect(setDibayAppRouteOrientationMode("ADMIN_LANDSCAPE")).resolves.toBe(false);
    expect(setRouteMode).not.toHaveBeenCalled();
  });

  it("old binary whose plugin headers lack DibayAppOrientation → no-op", async () => {
    shell = "android";
    setWindow([{ name: "DibayDeviceClass" }]);
    await expect(setDibayAppRouteOrientationMode("ADMIN_LANDSCAPE")).resolves.toBe(false);
    expect(setRouteMode).not.toHaveBeenCalled();
  });

  it("plugin present → sends wire mode", async () => {
    shell = "ios";
    setWindow([{ name: DIBAY_APP_ORIENTATION_PLUGIN_ID }]);
    await expect(setDibayAppRouteOrientationMode("ADMIN_LANDSCAPE")).resolves.toBe(true);
    expect(setRouteMode).toHaveBeenCalledWith({ mode: "admin" });
    await setDibayAppRouteOrientationMode("DEFAULT");
    expect(setRouteMode).toHaveBeenLastCalledWith({ mode: "default" });
  });

  it("plugin rejects (UNIMPLEMENTED) → swallowed", async () => {
    shell = "android";
    setRouteMode.mockRejectedValue(new Error("not implemented"));
    await expect(setDibayAppRouteOrientationMode("ADMIN_LANDSCAPE")).resolves.toBe(false);
  });
});

describe("useDibayAdminLandscapeRouteMode", () => {
  function mount() {
    useDibayAdminLandscapeRouteMode();
    const cleanup = capturedEffect?.();
    return typeof cleanup === "function" ? cleanup : () => {};
  }

  it("tablet in app shell: admin on mount, default on unmount", async () => {
    shell = "android";
    const unmount = mount();
    await flush();
    expect(setRouteMode).toHaveBeenCalledWith({ mode: "admin" });
    unmount();
    await flush();
    expect(setRouteMode).toHaveBeenLastCalledWith({ mode: "default" });
  });

  it("iPad in app shell requests admin", async () => {
    shell = "ios";
    deviceClass = "TABLET_IPAD";
    mount();
    await flush();
    expect(setRouteMode).toHaveBeenCalledWith({ mode: "admin" });
  });

  it("phone in app shell: no native call", async () => {
    shell = "ios";
    deviceClass = "PHONE_IOS";
    const unmount = mount();
    await flush();
    unmount();
    await flush();
    expect(setRouteMode).not.toHaveBeenCalled();
  });

  it("browser: no native call", async () => {
    const unmount = mount();
    await flush();
    unmount();
    expect(setRouteMode).not.toHaveBeenCalled();
  });

  it("unmount before device class resolves: no lock is requested", async () => {
    shell = "android";
    const unmount = mount();
    unmount();
    await flush();
    expect(setRouteMode).not.toHaveBeenCalled();
  });
});
