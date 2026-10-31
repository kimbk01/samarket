import { describe, expect, it, vi } from "vitest";

const lookupMock = vi.fn();
vi.mock("node:dns", async (orig) => {
  const real = await orig<typeof import("node:dns")>();
  return { ...real, lookup: (...args: unknown[]) => lookupMock(...args) };
});

describe("publicOnlyLookup — 연결 시점 IP 재검사 (D11 DNS 재바인딩)", () => {
  it("사전 검사 뒤 DNS 가 사설 IP 로 바뀌면 연결 주소를 주지 않는다", async () => {
    const { publicOnlyLookup } = await import("@/lib/security/remote-image-import-url");
    lookupMock.mockImplementation((_h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) =>
      cb(null, [{ address: "127.0.0.1", family: 4 }])
    );
    const err = await new Promise<NodeJS.ErrnoException | null>((r) => publicOnlyLookup("evil.example", {}, (e) => r(e)));
    expect(err?.code).toBe("EPRIVATEADDR");
  });
  it("공개·사설이 섞여도 막는다", async () => {
    const { publicOnlyLookup } = await import("@/lib/security/remote-image-import-url");
    lookupMock.mockImplementation((_h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) =>
      cb(null, [{ address: "93.184.215.14", family: 4 }, { address: "169.254.169.254", family: 4 }])
    );
    const err = await new Promise<NodeJS.ErrnoException | null>((r) => publicOnlyLookup("mixed.example", {}, (e) => r(e)));
    expect(err?.code).toBe("EPRIVATEADDR");
  });
  it("공개 주소만이면 all 여부에 맞춰 돌려준다", async () => {
    const { publicOnlyLookup } = await import("@/lib/security/remote-image-import-url");
    lookupMock.mockImplementation((_h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) =>
      cb(null, [{ address: "93.184.215.14", family: 4 }])
    );
    const single = await new Promise<unknown[]>((r) => publicOnlyLookup("ok.example", {}, (e, a, f) => r([e, a, f])));
    expect(single).toEqual([null, "93.184.215.14", 4]);
    const all = await new Promise<unknown[]>((r) => publicOnlyLookup("ok.example", { all: true }, (e, a) => r([e, a])));
    expect(all).toEqual([null, [{ address: "93.184.215.14", family: 4 }]]);
  });
});
