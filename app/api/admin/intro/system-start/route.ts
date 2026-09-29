import { NextResponse } from "next/server";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUILD_PATH = path.join(process.cwd(), "config/system-start.build.json");

type SystemStartBuild = {
  version: number;
  backgroundColor: string;
  matchScene1Appearance: boolean;
  brandMarkEnabled: boolean;
  note?: string;
};

function readBuild(): SystemStartBuild {
  const raw = JSON.parse(fs.readFileSync(BUILD_PATH, "utf8")) as SystemStartBuild;
  return {
    version: Number(raw.version) || 1,
    backgroundColor: String(raw.backgroundColor || "#312E81").toUpperCase(),
    matchScene1Appearance: raw.matchScene1Appearance !== false,
    brandMarkEnabled: !!raw.brandMarkEnabled,
    note:
      raw.note ||
      "Build-bound OS System Start. Changing this requires a native app build/update. Not Live CMS / Service Apply.",
  };
}

function normalizeHex(input: string): string | null {
  const h = String(input || "")
    .trim()
    .replace(/^#/, "")
    .toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(h)) return null;
  return `#${h}`;
}

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const build = readBuild();
    return NextResponse.json({
      ok: true as const,
      systemStart: build,
      buildBound: true,
      appliesVia: "native_app_build_update",
      notLiveCms: true,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "system_start_read_failed" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const body = (await req.json()) as {
      backgroundColor?: string;
      matchScene1Appearance?: boolean;
      brandMarkEnabled?: boolean;
      scene1BackgroundColor?: string | null;
    };
    const current = readBuild();
    const nextColor = normalizeHex(body.backgroundColor ?? current.backgroundColor);
    if (!nextColor) {
      return NextResponse.json({ ok: false, error: "invalid_background_color" }, { status: 400 });
    }
    const matchScene1 =
      body.matchScene1Appearance !== undefined
        ? !!body.matchScene1Appearance
        : current.matchScene1Appearance;
    let backgroundColor = nextColor;
    if (matchScene1 && body.scene1BackgroundColor) {
      const scene1 = normalizeHex(body.scene1BackgroundColor);
      if (scene1) backgroundColor = scene1;
    }
    const next: SystemStartBuild = {
      version: current.version,
      backgroundColor,
      matchScene1Appearance: matchScene1,
      brandMarkEnabled:
        body.brandMarkEnabled !== undefined
          ? !!body.brandMarkEnabled
          : current.brandMarkEnabled,
      note: current.note,
    };
    fs.writeFileSync(BUILD_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    const gen = spawnSync(
      process.execPath,
      [path.join(process.cwd(), "scripts/generate-system-start-build-input.mjs")],
      { encoding: "utf8" },
    );
    if (gen.status !== 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "generate_failed",
          detail: (gen.stderr || gen.stdout || "").slice(0, 500),
        },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true as const,
      systemStart: next,
      buildBound: true,
      requiresNativeRebuild: true,
      message:
        "시스템 시작 설정이 저장되었습니다. 새 앱 빌드/업데이트 후 기기에 반영됩니다. 서비스 적용으로 바뀌지 않습니다.",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "system_start_write_failed" },
      { status: 500 },
    );
  }
}
