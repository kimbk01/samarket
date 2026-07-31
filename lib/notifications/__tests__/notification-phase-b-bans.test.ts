import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("engine shadow must not become live writer", () => {
  it("runEnginePersistencePipeline keeps executed false", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/engine/run-engine-persistence-pipeline.ts"),
      "utf8"
    );
    expect(src).toContain("executed: false");
    expect(src).toContain("never become a second writer");
  });
});

describe("segment target must not fallback to all", () => {
  it("batch and cron block segment", () => {
    const batch = readFileSync(
      join(process.cwd(), "lib/admin/notification-campaigns/run-campaign-send-batch.ts"),
      "utf8"
    );
    const cron = readFileSync(
      join(process.cwd(), "app/api/cron/notification-campaigns-dispatch-scheduled/route.ts"),
      "utf8"
    );
    const createApi = readFileSync(
      join(process.cwd(), "app/api/admin/notification-campaigns/route.ts"),
      "utf8"
    );
    expect(batch).toContain("segment_unsupported");
    expect(cron).toContain("segment_unsupported");
    expect(createApi).toContain("segment_unsupported");
    expect(batch).not.toMatch(/segment.*all/);
  });
});
