/**
 * Phase 11B — QA gate (secret) + write-forbidden static tests.
 * Live DB 실측은 scripts/run-phase11b-isolated-live-loaders.mts
 */
import { describe, expect, it } from "vitest";
import {
  DIBAY_MESSENGER_DOMAIN_API_ISOLATED_HEADER,
  DIBAY_MESSENGER_DOMAIN_API_ISOLATED_VALUE,
} from "@/lib/messenger/contracts/phase11a-domain-api-gate";
import {
  DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_ENV,
  DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_HEADER,
  PHASE11B_LIVE_LOADER_PRODUCTION_WIRING,
  PHASE11B_PERSISTENT_CACHE_WRITE,
  PHASE11B_REALTIME_PUBLISH,
  resolvePhase11bApiAccessMode,
  phase11bApiGateResponse,
} from "@/lib/messenger/contracts/phase11b-isolated-qa-gate";
import { gateDomainBootstrapApiRequest } from "@/lib/messenger/contracts/phase6-api-route";
import { MESSENGER_DOMAIN_BUILD_PHASE_ORDER } from "@/lib/messenger/contracts/phase-order";
import { PHASE1_DEFAULT_CUTOVER } from "@/lib/messenger/contracts/cutover";

describe("Phase 11B — QA secret gate (no arbitrary isolated bypass)", () => {
  it("mode=isolated alone without secret env → rejected", () => {
    const req = new Request("http://localhost/x", {
      headers: { [DIBAY_MESSENGER_DOMAIN_API_ISOLATED_HEADER]: DIBAY_MESSENGER_DOMAIN_API_ISOLATED_VALUE },
    });
    const env = { ...process.env };
    delete env[DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_ENV];
    expect(resolvePhase11bApiAccessMode(req, env)).toBe("isolated_rejected_no_secret_env");
    const denied = phase11bApiGateResponse("general_direct", "isolated_rejected_no_secret_env");
    expect(denied?.status).toBe(503);
  });

  it("wrong secret → rejected even with isolated mode", () => {
    const env = {
      ...process.env,
      [DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_ENV]: "correct-secret-16chars",
    };
    const req = new Request("http://localhost/x", {
      headers: {
        [DIBAY_MESSENGER_DOMAIN_API_ISOLATED_HEADER]: DIBAY_MESSENGER_DOMAIN_API_ISOLATED_VALUE,
        [DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_HEADER]: "wrong-secret-16chars!",
      },
    });
    expect(resolvePhase11bApiAccessMode(req, env)).toBe("isolated_rejected_bad_secret");
  });

  it("matching secret + isolated mode → authorized", () => {
    const secret = "correct-secret-16chars";
    const prev = process.env[DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_ENV];
    process.env[DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_ENV] = secret;
    try {
      const req = new Request("http://localhost/x", {
        headers: {
          [DIBAY_MESSENGER_DOMAIN_API_ISOLATED_HEADER]: DIBAY_MESSENGER_DOMAIN_API_ISOLATED_VALUE,
          [DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_HEADER]: secret,
        },
      });
      expect(resolvePhase11bApiAccessMode(req)).toBe("isolated_authorized");
      expect(gateDomainBootstrapApiRequest(req, "trade").ok).toBe(true);
    } finally {
      if (prev == null) delete process.env[DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_ENV];
      else process.env[DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_ENV] = prev;
    }
  });

  it("production request still 503 disabled", () => {
    const req = new Request("http://localhost/x");
    const gate = gateDomainBootstrapApiRequest(req, "group");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(503);
  });

  it("wiring flags OFF; cutover OFF; no cache/realtime write", () => {
    expect(PHASE11B_LIVE_LOADER_PRODUCTION_WIRING).toBe(false);
    expect(PHASE11B_PERSISTENT_CACHE_WRITE).toBe(false);
    expect(PHASE11B_REALTIME_PUBLISH).toBe(false);
    expect(PHASE1_DEFAULT_CUTOVER.every((c) => c.mode === "off")).toBe(true);
  });
});

describe("Phase 11B — phase order", () => {
  it("lists 11B domain live runtime", () => {
    const row = MESSENGER_DOMAIN_BUILD_PHASE_ORDER.find((p) => Number(p.phase) === 11.2);
    expect(row?.domain).toBe("domain_live_loader_11b");
    expect(row?.status).toBe("done");
  });
});
