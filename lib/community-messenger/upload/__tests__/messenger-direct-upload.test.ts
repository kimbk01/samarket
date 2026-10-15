import { describe, expect, it } from "vitest";
import { uploadMessengerFile, uploadMessengerImages } from "@/lib/community-messenger/upload/messenger-direct-upload";

const MB = 1024 * 1024;
const BASE = "/api/community-messenger/rooms/r1";

function fileOf(bytes: number, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

type Call = { url: string; init?: RequestInit };

function jsonRes(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("D-3 client transport", () => {
  it("small file → multipart POST …/files with the cid in the form", async () => {
    const calls: Call[] = [];
    const out = await uploadMessengerFile({
      roomResourcePath: BASE,
      file: fileOf(1 * MB, "a.pdf", "application/pdf"),
      clientMessageId: "cid-1",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return jsonRes(200, { ok: true, message: { id: "m1" } });
      },
    });
    expect(out.ok).toBe(true);
    expect(out.transport).toBe("multipart");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${BASE}/files`);
    expect((calls[0]!.init!.body as FormData).get("clientMessageId")).toBe("cid-1");
  });

  it("15MB file → upload-url → direct PUT → JSON finalize with the same cid", async () => {
    const calls: Call[] = [];
    const out = await uploadMessengerFile({
      roomResourcePath: BASE,
      file: fileOf(15 * MB, "big.pdf", "application/pdf"),
      clientMessageId: "cid-2",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        if (url.endsWith("/files/upload-url")) return jsonRes(200, { ok: true, path: "p/x.pdf", signedUrl: "https://s/put" });
        if (url === "https://s/put") return new Response("{}", { status: 200 });
        return jsonRes(200, { ok: true, message: { id: "m2" } });
      },
    });
    expect(out.ok).toBe(true);
    expect(out.transport).toBe("staged");
    expect(calls.map((c) => [c.init?.method, c.url])).toEqual([
      ["POST", `${BASE}/files/upload-url`],
      ["PUT", "https://s/put"],
      ["POST", `${BASE}/files`],
    ]);
    expect(JSON.parse(String(calls[2]!.init!.body))).toEqual({
      stagedPath: "p/x.pdf",
      fileName: "big.pdf",
      clientMessageId: "cid-2",
    });
  });

  it("album over threshold → one upload-urls call, N PUTs, ONE finalize message", async () => {
    const calls: Call[] = [];
    const files = Array.from({ length: 3 }, (_, i) => fileOf(2 * MB, `p${i}.jpg`, "image/jpeg"));
    const out = await uploadMessengerImages({
      roomResourcePath: BASE,
      files,
      clientMessageId: "cid-3",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        if (url.endsWith("/images/upload-urls")) {
          return jsonRes(200, {
            ok: true,
            uploads: files.map((_, i) => ({ path: `s/${i}.jpg`, signedUrl: `https://s/${i}` })),
          });
        }
        if (url.startsWith("https://s/")) return new Response("{}", { status: 200 });
        return jsonRes(200, { ok: true, message: { id: "album" } });
      },
    });
    expect(out.ok).toBe(true);
    expect(calls.filter((c) => c.init?.method === "PUT")).toHaveLength(3);
    const finalize = calls.filter((c) => c.url === `${BASE}/images`);
    expect(finalize).toHaveLength(1);
    expect(JSON.parse(String(finalize[0]!.init!.body))).toEqual({
      stagedPaths: ["s/0.jpg", "s/1.jpg", "s/2.jpg"],
      clientMessageId: "cid-3",
    });
  });

  it("Vercel non-JSON 413 maps to file_too_large (definitive)", async () => {
    const out = await uploadMessengerFile({
      roomResourcePath: BASE,
      file: fileOf(1 * MB, "a.pdf", "application/pdf"),
      clientMessageId: "c",
      fetchImpl: async () => new Response("Request Entity Too Large", { status: 413 }),
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("file_too_large");
    expect(out.failure).toBe("definitive");
  });

  it("network exception on finalize and failed PUT are indeterminate (retryable)", async () => {
    const net = await uploadMessengerFile({
      roomResourcePath: BASE,
      file: fileOf(10, "a.pdf", "application/pdf"),
      clientMessageId: "c",
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(net.ok).toBe(false);
    if (!net.ok) expect(net.failure).toBe("indeterminate");

    const put = await uploadMessengerFile({
      roomResourcePath: BASE,
      file: fileOf(6 * MB, "b.pdf", "application/pdf"),
      clientMessageId: "c",
      fetchImpl: async (url) => {
        if (url.endsWith("/upload-url")) return jsonRes(200, { ok: true, path: "p", signedUrl: "https://s/put" });
        return new Response("", { status: 400 });
      },
    });
    expect(put.ok).toBe(false);
    if (!put.ok) {
      expect(put.failure).toBe("indeterminate");
      expect(put.beforeCommit).toBe(true);
    }
  });

  it("upload-url rejection (4xx) is definitive", async () => {
    const out = await uploadMessengerFile({
      roomResourcePath: BASE,
      file: fileOf(6 * MB, "b.pdf", "application/pdf"),
      clientMessageId: "c",
      fetchImpl: async () => jsonRes(400, { ok: false, error: "room_blocked" }),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toBe("room_blocked");
      expect(out.failure).toBe("definitive");
    }
  });
});
