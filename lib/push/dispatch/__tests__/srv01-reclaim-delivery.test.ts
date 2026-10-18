import { describe, expect, it, vi } from "vitest";
import {
  isPermanentPushFailureResponse,
  reclaimNotificationDeliveryForRetry,
} from "@/lib/push/dispatch/load-active-push-targets";

function svcWith(existing: Record<string, unknown> | null, claimedRows: unknown[] = [{ id: "row-1" }]) {
  const updateEqs: Array<[string, unknown]> = [];
  const selectChain = {
    eq: vi.fn(() => selectChain),
    maybeSingle: vi.fn(async () => ({ data: existing, error: null })),
  };
  const updateChain = {
    eq: vi.fn((col: string, val: unknown) => {
      updateEqs.push([col, val]);
      return updateChain;
    }),
    select: vi.fn(async () => ({ data: claimedRows, error: null })),
  };
  const update = vi.fn(() => updateChain);
  const svc = {
    from: vi.fn(() => ({ select: vi.fn(() => selectChain), update })),
  };
  return { svc: svc as never, update, updateEqs };
}

const input = { notification_event_id: "ev", device_id: "dev", provider_response: { tokenPrefix: "x" } };

describe("reclaimNotificationDeliveryForRetry", () => {
  it("re-arms a transient failure with a conditional failed→pending update", async () => {
    const { svc, update, updateEqs } = svcWith({ id: "row-1", status: "failed", provider_response: { http_status: 503 } });
    const r = await reclaimNotificationDeliveryForRetry(svc, input);
    expect(r).toEqual({ kind: "reclaimed", id: "row-1", attempt: 2 });
    expect(update).toHaveBeenCalledTimes(1);
    expect(updateEqs).toContainEqual(["status", "failed"]);
  });

  it("counts attempts from the stored delivery_attempt", async () => {
    const { svc } = svcWith({ id: "row-1", status: "failed", provider_response: { delivery_attempt: 3 } });
    expect(await reclaimNotificationDeliveryForRetry(svc, input)).toEqual({ kind: "reclaimed", id: "row-1", attempt: 4 });
  });

  it("loses the race → in_flight (no double send)", async () => {
    const { svc } = svcWith({ id: "row-1", status: "failed", provider_response: {} }, []);
    expect(await reclaimNotificationDeliveryForRetry(svc, input)).toEqual({ kind: "in_flight" });
  });

  it.each([
    ["sent", { kind: "already_sent" }],
    ["pending", { kind: "in_flight" }],
  ])("status %s is never re-armed", async (status, expected) => {
    const { svc, update } = svcWith({ id: "row-1", status, provider_response: {} });
    expect(await reclaimNotificationDeliveryForRetry(svc, input)).toEqual(expected);
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps a policy skip as-is", async () => {
    const { svc, update } = svcWith({ id: "row-1", status: "skipped", provider_response: { reason: "voip_reserved_for_call_push" } });
    expect(await reclaimNotificationDeliveryForRetry(svc, input)).toEqual({
      kind: "skipped_existing",
      reason: "voip_reserved_for_call_push",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("does not re-arm a permanent provider verdict", async () => {
    const { svc, update } = svcWith({ id: "row-1", status: "failed", provider_response: { invalid_token: true } });
    expect(await reclaimNotificationDeliveryForRetry(svc, input)).toEqual({ kind: "permanent" });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("isPermanentPushFailureResponse", () => {
  it.each([
    [{ bad_device_token: true }, true],
    [{ gone: true }, true],
    [{ invalid_token: true }, true],
    [{ error: "NotRegistered" }, true],
    [{ error: "The pending stream has been canceled" }, false],
    [{ http_status: 503 }, false],
    [null, false],
  ])("%j → %s", (resp, expected) => {
    expect(isPermanentPushFailureResponse(resp as Record<string, unknown> | null)).toBe(expected);
  });
});
