/**
 * Deploy Owner gate — stricter than super_admin.
 * DIBAY_DEPLOY_OWNER_IDS=uuid,uuid (lowercase). Empty → deny all (fail-closed).
 */

import { NextResponse } from "next/server";
import {
  requireSuperAdmin,
  type AdminApiActor,
} from "@/lib/admin/require-admin-permission";
import type { SupabaseClient } from "@supabase/supabase-js";

function parseOwnerIds(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const set = new Set<string>();
  for (const part of (env.DIBAY_DEPLOY_OWNER_IDS ?? "").split(",")) {
    const v = part.trim().toLowerCase();
    if (v) set.add(v);
  }
  return set;
}

export function isDeployOwnerUserId(
  userId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const uid = (userId ?? "").trim().toLowerCase();
  if (!uid) return false;
  const owners = parseOwnerIds(env);
  if (owners.size === 0) return false;
  return owners.has(uid);
}

export async function requireDeployOwner(): Promise<
  | { ok: true; actor: AdminApiActor; sb: SupabaseClient }
  | { ok: false; response: NextResponse }
> {
  const base = await requireSuperAdmin();
  if (!base.ok) return base;

  if (!isDeployOwnerUserId(base.actor.userId)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "deploy_owner_only",
          code: "deploy_owner_only",
          message:
            "운영 배포 승인은 지정 Owner만 할 수 있습니다. 일반 super_admin은 불가합니다.",
        },
        { status: 403 }
      ),
    };
  }
  return base;
}

export function deployOwnerIdsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseOwnerIds(env).size > 0;
}
