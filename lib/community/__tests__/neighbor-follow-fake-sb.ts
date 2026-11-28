/**
 * 관심이웃 시험용 메모리 Supabase 흉내 — `from(table)` 체인의 eq·in·or(and 쌍)·order·range·limit·delete·insert 를
 * 실제로 적용한다(나머지 필터는 무시). 실패 상황을 「데이터로」 재현하려는 용도.
 */
type Row = Record<string, unknown>;

export type FakeDb = Record<string, Row[]>;

type Filter = (r: Row) => boolean;

function parseOrPairs(expr: string): Filter | null {
  /** `and(a.eq.x,b.eq.y),and(...)` 또는 `a.eq.x,b.eq.y` (OR) */
  const ands = [...expr.matchAll(/and\(([^)]*)\)/g)].map((m) => m[1]);
  const clauses = ands.length > 0 ? ands : null;
  const eqOf = (part: string): Filter | null => {
    const m = /^([a-z_]+)\.eq\.(.+)$/.exec(part.trim());
    if (!m) return null;
    return (r) => String(r[m[1]]) === m[2];
  };
  if (clauses) {
    const fs = clauses.map((c) => c.split(",").map(eqOf));
    return (r) => fs.some((group) => group.every((f) => (f ? f(r) : true)));
  }
  const parts = expr.split(",").map(eqOf);
  if (parts.every(Boolean)) return (r) => parts.some((f) => f!(r));
  return null;
}

/**
 * DB 함수 `neighbor_follow_set_for` 흉내 — `supabase/migrations/20271128250000_neighbor_follow_invariants.sql` 와 같은 순서
 * (해제 → 이미 있음 → 탈퇴·프로필 없음 → 양방향 활성 차단 → 상한 → 추가). 라우트가 결과를 그대로 옮기는지 보는 용도이고,
 * SQL 자체는 구조 확인 시험(`neighbor-follow-block-cleanup.test.ts`)과 운영 적용 뒤 확인으로 본다.
 */
function fakeNeighborFollowSetFor(db: FakeDb, a: { p_user: string; p_target: string; p_follow: boolean; p_limit: number }) {
  const mine = () => (db.user_relationships ??= []).filter((r) => r.user_id === a.p_user && r.type === "neighbor_follow");
  if (!a.p_follow) {
    db.user_relationships = (db.user_relationships ?? []).filter(
      (r) => !(r.user_id === a.p_user && r.target_user_id === a.p_target && r.type === "neighbor_follow"),
    );
    return { ok: true, following: false, count: mine().length };
  }
  if (mine().some((r) => r.target_user_id === a.p_target)) return { ok: true, following: true, count: mine().length };
  const prof = (db.profiles ?? []).find((p) => p.id === a.p_target);
  if (!prof || String(prof.status ?? "") === "deleted" || prof.deleted_at) return { ok: false, error: "target_unavailable" };
  const blocked = (db.user_social_relations ?? []).some(
    (s) =>
      s.relation_type === "blocked" &&
      s.is_active !== false &&
      ((s.owner_user_id === a.p_user && s.target_user_id === a.p_target) ||
        (s.owner_user_id === a.p_target && s.target_user_id === a.p_user)),
  );
  if (blocked) return { ok: false, error: "blocked_target" };
  const n = mine().length;
  if (n >= a.p_limit) return { ok: false, error: "neighbor_follow_limit", limit: a.p_limit };
  const rels = (db.user_relationships ??= []);
  rels.push({
    id: `id-${rels.length + 1}`,
    user_id: a.p_user,
    target_user_id: a.p_target,
    type: "neighbor_follow",
    relation_type: "neighbor_follow",
    created_at: new Date().toISOString(),
  });
  return { ok: true, following: true, count: n + 1 };
}

export function createFakeSb(db: FakeDb) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  const sb = {
    calls,
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ table: `rpc:${fn}`, op: "rpc", args: [args] });
      if (fn === "neighbor_follow_set_for") {
        return { data: fakeNeighborFollowSetFor(db, args as never), error: null };
      }
      return { data: null, error: { message: `unknown rpc ${fn}` } };
    },
    from(table: string) {
      const filters: Filter[] = [];
      let mode: "select" | "delete" | "insert" = "select";
      let insertRows: Row[] = [];
      const order: { col: string; asc: boolean }[] = [];
      let range: [number, number] | null = null;
      let limit: number | null = null;
      let single = false;
      let countMode = false;
      let head = false;
      const rows = () => (db[table] ??= []);
      const run = () => {
        if (mode === "insert") {
          for (const r of insertRows) {
            const dup = rows().some(
              (x) => x.user_id === r.user_id && x.target_user_id === r.target_user_id && x.type === r.type,
            );
            if (dup) return { data: null, error: { code: "23505", message: "duplicate" } };
            rows().push({ id: `id-${rows().length + 1}-${Math.random().toString(36).slice(2, 7)}`, created_at: new Date().toISOString(), ...r });
          }
          return { data: null, error: null };
        }
        let out = rows().filter((r) => filters.every((f) => f(r)));
        if (mode === "delete") {
          db[table] = rows().filter((r) => !out.includes(r));
          return { data: null, error: null };
        }
        const count = out.length;
        for (const o of [...order].reverse()) {
          out = [...out].sort((a, b) => {
            const av = String(a[o.col] ?? "");
            const bv = String(b[o.col] ?? "");
            return o.asc ? av.localeCompare(bv) : bv.localeCompare(av);
          });
        }
        if (range) out = out.slice(range[0], range[1] + 1);
        if (limit != null) out = out.slice(0, limit);
        if (single) return { data: out[0] ?? null, error: null };
        return { data: head ? null : out, error: null, count: countMode ? count : null };
      };
      const b: Record<string, unknown> = {
        select(_cols?: string, opts?: { count?: string; head?: boolean }) {
          countMode = Boolean(opts?.count);
          head = Boolean(opts?.head);
          return b;
        },
        insert(r: Row | Row[]) {
          mode = "insert";
          insertRows = Array.isArray(r) ? r : [r];
          calls.push({ table, op: "insert", args: [r] });
          return b;
        },
        delete() {
          mode = "delete";
          calls.push({ table, op: "delete", args: [] });
          return b;
        },
        eq(col: string, v: unknown) {
          filters.push((r) => String(r[col]) === String(v));
          return b;
        },
        in(col: string, vs: unknown[]) {
          calls.push({ table, op: "in", args: [col, vs] });
          const set = new Set(vs.map(String));
          filters.push((r) => set.has(String(r[col])));
          return b;
        },
        or(expr: string) {
          const f = parseOrPairs(expr);
          if (f) filters.push(f);
          return b;
        },
        order(col: string, o?: { ascending?: boolean }) {
          order.push({ col, asc: o?.ascending !== false });
          return b;
        },
        range(a: number, z: number) {
          range = [a, z];
          return b;
        },
        limit(n: number) {
          limit = n;
          return b;
        },
        maybeSingle() {
          single = true;
          return b;
        },
        single() {
          single = true;
          return b;
        },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
          try {
            return Promise.resolve(run()).then(res, rej);
          } catch (e) {
            return rej ? rej(e) : Promise.reject(e);
          }
        },
      };
      return new Proxy(b, {
        get(t, p: string) {
          if (p in t) return t[p];
          /** 그 밖의 필터(not·is·gte·ilike 등)는 무시하고 체인 유지 */
          return () => t;
        },
      });
    },
  };
  return sb;
}
