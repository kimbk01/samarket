import type { NextRequest } from "next/server";
import { guardMoimWrite, moimNotFound, moimRpcResponse, readMoimJson, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { moimProfileUpdate } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/** 이 모임에서 쓰는 내 프로필 — body { nickname?, avatarUrl?, bio? } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimWrite(req, { rateKey: "profile", limit: 20 });
  if (!g.ok) return g.response;
  const body = (await readMoimJson<{ nickname?: unknown; avatarUrl?: unknown; bio?: unknown }>(req)) ?? {};
  return moimRpcResponse(
    await moimProfileUpdate(
      g.userId,
      moimId,
      {
        nickname: typeof body.nickname === "string" ? body.nickname : undefined,
        avatarUrl: typeof body.avatarUrl === "string" || body.avatarUrl === null ? (body.avatarUrl as string | null) : undefined,
        bio: typeof body.bio === "string" ? body.bio : undefined,
      },
      g.sb
    )
  );
}
