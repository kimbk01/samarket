import { canonicalDocumentJson, type IntroShowDocument } from "./document";

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < view.length; i += 1) {
    out += view[i].toString(16).padStart(2, "0");
  }
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
    return bytesToHex(digest);
  }
  throw new Error("sha256_unavailable");
}

export async function checksumDocument(doc: IntroShowDocument): Promise<string> {
  return sha256Hex(canonicalDocumentJson(doc));
}
