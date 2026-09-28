import { bootstrapIntroRuntime, type IntroRuntimeManifest } from "./runtime-bootstrap";

async function main(): Promise<void> {
  const host = document.getElementById("root");
  if (!host) throw new Error("runtime_host_missing");
  const res = await fetch("./manifest.json", { cache: "no-store" });
  if (!res.ok) throw new Error("manifest_missing");
  const manifest = (await res.json()) as IntroRuntimeManifest;
  if (manifest.completeness !== "complete") throw new Error("pack_incomplete");
  await bootstrapIntroRuntime({
    host,
    manifest,
    resolveMediaUrl: (file) => `./media/${file}`,
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "runtime_exception";
  const android = (globalThis as { IntroShowHostBridge?: { onEvent?: (json: string) => void } })
    .IntroShowHostBridge;
  android?.onEvent?.(JSON.stringify({ type: "HANDOFF_FAIL_OPEN", reason: message }));
  const webkit = (
    globalThis as {
      webkit?: { messageHandlers?: { introShowHost?: { postMessage: (value: unknown) => void } } };
    }
  ).webkit;
  webkit?.messageHandlers?.introShowHost?.postMessage({ type: "HANDOFF_FAIL_OPEN", reason: message });
});
