import { describe, expect, it, vi } from "vitest";
import { deactivateBoundDeviceByTokenProof } from "@/lib/push/dispatch/deactivate-bound-device-by-token-proof";

function mockSvc(updateResult: { data: unknown; error: unknown }) {
  const select = vi.fn().mockResolvedValue(updateResult);
  const chain: { eq: ReturnType<typeof vi.fn>; select: typeof select } = {
    eq: vi.fn(),
    select,
  };
  chain.eq.mockReturnValue(chain);
  const update = vi.fn(() => chain);
  const from = vi.fn(() => ({ update }));
  return { from, update, chain, select };
}

describe("deactivateBoundDeviceByTokenProof", () => {
  it("rejects missing device_id or push_token without touching DB", async () => {
    const svc = mockSvc({ data: [], error: null });
    const missDevice = await deactivateBoundDeviceByTokenProof(svc as never, {
      deviceId: "",
      pushToken: "tok",
      environment: "production",
    });
    const missToken = await deactivateBoundDeviceByTokenProof(svc as never, {
      deviceId: "dev",
      pushToken: "",
      environment: "production",
    });
    expect(missDevice).toEqual({ ok: false, error: "invalid_proof" });
    expect(missToken).toEqual({ ok: false, error: "invalid_proof" });
    expect(svc.from).not.toHaveBeenCalled();
  });

  it("deactivates only rows matching device_id + push_token + provider + environment", async () => {
    const svc = mockSvc({ data: [{ id: "row-1" }], error: null });
    const result = await deactivateBoundDeviceByTokenProof(svc as never, {
      deviceId: "device-a",
      pushToken: "fcm-token-xyz",
      pushProvider: "fcm",
      environment: "production",
    });
    expect(result).toEqual({ ok: true, deactivated: 1 });
    expect(svc.from).toHaveBeenCalledWith("user_devices");
    expect(svc.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: false }),
    );
    const eqCalls = svc.chain.eq.mock.calls.map((c) => c[0]);
    expect(eqCalls).toEqual(
      expect.arrayContaining(["device_id", "push_token", "push_provider", "environment", "is_active"]),
    );
  });

  it("returns no_matching_device when proof does not match any active row", async () => {
    const svc = mockSvc({ data: [], error: null });
    const result = await deactivateBoundDeviceByTokenProof(svc as never, {
      deviceId: "device-a",
      pushToken: "stale-or-wrong",
      environment: "production",
    });
    expect(result).toEqual({ ok: false, error: "no_matching_device" });
  });
});
