/**
 * FIN-10 · 운영 DB ↔ 저장소 스키마 드리프트 (읽기 전용) — 순수 파서·비교 로직.
 *
 * - 저장소 기대치: supabase/migrations/*.sql 를 파일명 순으로 재생해
 *   public 테이블 → 컬럼, public 함수 이름을 계산한다.
 *   (CREATE TABLE · ALTER TABLE ADD/DROP/RENAME COLUMN · RENAME TO · DROP TABLE ·
 *    CREATE [OR REPLACE] FUNCTION · DROP FUNCTION. DO 블록 본문도 파싱, 함수 본문·문자열은 제외.)
 * - 운영 스냅샷: scripts/prod-schema-drift/snapshot.sql 결과 JSON.
 * DB 접속 없음 — 이 모듈은 문자열만 다룬다.
 */

/**
 * SQL 텍스트를 문장 단위로 나눈다. 주석 제거, '...' 문자열은 '' 로 비움,
 * 달러 인용 본문은 자리표시자로 바꾸고 bodies 에 보관한다.
 * @param {string} sql
 * @returns {{ text: string, bodies: string[] }[]}
 */
export function splitStatements(sql) {
  const out = [];
  let buf = "";
  let bodies = [];
  let i = 0;
  const n = sql.length;
  const flush = () => {
    if (buf.trim() || bodies.length) out.push({ text: buf.trim(), bodies });
    buf = "";
    bodies = [];
  };
  while (i < n) {
    const c = sql[i];
    const c2 = sql[i + 1];
    if (c === "-" && c2 === "-") {
      const e = sql.indexOf("\n", i);
      i = e < 0 ? n : e;
      buf += " ";
      continue;
    }
    if (c === "/" && c2 === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth--;
          i += 2;
        } else i++;
      }
      buf += " ";
      continue;
    }
    if (c === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") {
          i++;
          break;
        } else i++;
      }
      buf += "''";
      continue;
    }
    if (c === '"') {
      const e = sql.indexOf('"', i + 1);
      const end = e < 0 ? n : e + 1;
      buf += sql.slice(i, end);
      i = end;
      continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      const prev = i > 0 ? sql[i - 1] : " ";
      if (m && !/[A-Za-z0-9_]/.test(prev)) {
        const tag = m[0];
        const start = i + tag.length;
        const e = sql.indexOf(tag, start);
        const end = e < 0 ? n : e;
        bodies.push(sql.slice(start, end));
        buf += ` $body${bodies.length - 1}$ `;
        i = e < 0 ? n : e + tag.length;
        continue;
      }
    }
    if (c === ";") {
      flush();
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

const IDENT = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QNAME = String.raw`(${IDENT})(?:\s*\.\s*(${IDENT}))?`;

/** @param {string} raw */
export function normIdent(raw) {
  const s = raw.trim();
  if (s.startsWith('"')) return s.slice(1, -1).replace(/""/g, '"');
  return s.toLowerCase();
}

/**
 * 스키마 한정 이름 → public 객체면 이름, 아니면 null (미한정 = public 으로 간주).
 * @param {string} a @param {string | undefined} b
 */
function publicName(a, b) {
  if (b === undefined) return normIdent(a);
  return normIdent(a) === "public" ? normIdent(b) : null;
}

/** 최상위 괄호 깊이에서 쉼표 분할 */
export function splitTopLevel(s, sep = ",") {
  const parts = [];
  let depth = 0;
  let cur = "";
  let inQ = false;
  for (const ch of s) {
    if (ch === '"') inQ = !inQ;
    if (!inQ) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === sep && depth === 0) {
        parts.push(cur);
        cur = "";
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** s[openIdx] === "(" 일 때 짝 괄호 안쪽 문자열 */
function parenContent(s, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return s.slice(openIdx + 1, i);
    }
  }
  return s.slice(openIdx + 1);
}

const TYPE_ALIASES = new Map([
  ["int", "integer"],
  ["int4", "integer"],
  ["int8", "bigint"],
  ["int2", "smallint"],
  ["bool", "boolean"],
  ["varchar", "character varying"],
  ["float8", "double precision"],
  ["float4", "real"],
  ["timestamptz", "timestamp with time zone"],
  ["timestamp", "timestamp without time zone"],
  ["timetz", "time with time zone"],
  ["decimal", "numeric"],
]);
const TYPE_START_WORDS = new Set([
  "double",
  "timestamp",
  "time",
  "character",
  "bit",
  "interval",
  "varchar",
  "int",
  "integer",
  "bigint",
  "smallint",
  "text",
  "uuid",
  "boolean",
  "bool",
  "jsonb",
  "json",
  "numeric",
  "date",
  "timestamptz",
]);

/**
 * 함수 인자 목록 → 타입만의 정규화 시그니처 (create 의 "p_x uuid" 와 drop 의 "uuid" 를 같게).
 * @param {string} args
 */
export function normalizeArgSignature(args) {
  return splitTopLevel(args)
    .map((arg) => {
      let a = arg.replace(/\s+(default\b|=)[\s\S]*$/i, "").trim();
      a = a.replace(/^(in|out|inout|variadic)\s+/i, "");
      const toks = a.split(/\s+/);
      if (toks.length >= 2 && !TYPE_START_WORDS.has(toks[0].toLowerCase())) toks.shift();
      let t = toks.join(" ").toLowerCase().replace(/\bpublic\./g, "").replace(/\s*\(\s*[\d,\s]*\)/g, "");
      t = t.replace(/\s+/g, " ").trim();
      const arr = t.endsWith("[]") ? "[]" : "";
      const base = arr ? t.slice(0, -2).trim() : t;
      return (TYPE_ALIASES.get(base) ?? base) + arr;
    })
    .join(",");
}

/** @returns {{ tables: Map<string, Set<string>>, functions: Map<string, Set<string>> }} */
export function emptyState() {
  return { tables: new Map(), functions: new Map() };
}

function ensureTable(state, t) {
  let cols = state.tables.get(t);
  if (!cols) {
    cols = new Set();
    state.tables.set(t, cols);
  }
  return cols;
}

const RE_DDL_START =
  /\b(create\s+(?:or\s+replace\s+)?(?:unlogged\s+)?table|create\s+(?:or\s+replace\s+)?function|alter\s+table|drop\s+table|drop\s+function)\b/i;
const NON_COLUMN_ELEMENT = /^(constraint|primary|unique|check|foreign|exclude|like)\b/i;

/**
 * 한 문장(또는 DO 본문 내 조각)에서 DDL 을 찾아 상태에 반영.
 * @param {string} stmt
 */
function applyDdl(state, stmt) {
  const m = RE_DDL_START.exec(stmt);
  if (!m) return;
  const s = stmt.slice(m.index);
  const kind = m[1].toLowerCase().replace(/\s+/g, " ");

  if (kind.endsWith(" table") && kind.startsWith("create")) {
    const r = new RegExp(String.raw`^${m[1].replace(/\s+/g, "\\s+")}\s+(?:if\s+not\s+exists\s+)?${QNAME}`, "i").exec(
      s,
    );
    if (!r) return;
    const t = publicName(r[1], r[2]);
    if (!t) return;
    // CREATE TABLE IF NOT EXISTS 는 이미 있는 테이블이면 no-op (컬럼 추가 안 됨)
    if (/\bif\s+not\s+exists\s/i.test(r[0]) && state.tables.has(t)) return;
    const cols = ensureTable(state, t);
    const rest = s.slice(r[0].length);
    const po = /^\s*\(/.exec(rest);
    if (!po) return; // PARTITION OF / AS SELECT 등 — 테이블만
    for (const el of splitTopLevel(parenContent(rest, po[0].length - 1))) {
      if (NON_COLUMN_ELEMENT.test(el)) continue;
      const cm = new RegExp(`^${IDENT}`).exec(el);
      if (cm) cols.add(normIdent(cm[0]));
    }
    return;
  }

  if (kind === "drop table") {
    const body = s.replace(/^drop\s+table\s+(?:if\s+exists\s+)?/i, "").replace(/\s+(cascade|restrict)\s*$/i, "");
    for (const part of splitTopLevel(body)) {
      const r = new RegExp(`^${QNAME}`).exec(part);
      if (!r) continue;
      const t = publicName(r[1], r[2]);
      if (t) state.tables.delete(t);
    }
    return;
  }

  if (kind.endsWith(" function") && kind.startsWith("create")) {
    const r = new RegExp(String.raw`^${m[1].replace(/\s+/g, "\\s+")}\s+${QNAME}\s*\(`, "i").exec(s);
    if (!r) return;
    const f = publicName(r[1], r[2]);
    if (!f) return;
    const sig = normalizeArgSignature(parenContent(s, r[0].length - 1));
    let sigs = state.functions.get(f);
    if (!sigs) {
      sigs = new Set();
      state.functions.set(f, sigs);
    }
    sigs.add(sig);
    return;
  }

  if (kind === "drop function") {
    const body = s.replace(/^drop\s+function\s+(?:if\s+exists\s+)?/i, "").replace(/\s+(cascade|restrict)\s*$/i, "");
    for (const part of splitTopLevel(body)) {
      const r = new RegExp(`^${QNAME}\\s*(\\()?`).exec(part);
      if (!r) continue;
      const f = publicName(r[1], r[2]);
      if (!f) continue;
      const sigs = state.functions.get(f);
      if (!sigs) continue;
      if (r[3]) sigs.delete(normalizeArgSignature(parenContent(part, r[0].length - 1)));
      else sigs.clear();
      if (sigs.size === 0) state.functions.delete(f);
    }
    return;
  }

  if (kind === "alter table") {
    const r = new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${QNAME}\s*`, "i").exec(s);
    if (!r) return;
    const t = publicName(r[1], r[2]);
    if (!t) return;
    const rest = s.slice(r[0].length);
    const rt = new RegExp(String.raw`^rename\s+to\s+(${IDENT})`, "i").exec(rest);
    if (rt) {
      const cols = state.tables.get(t) ?? new Set();
      state.tables.delete(t);
      state.tables.set(normIdent(rt[1]), cols);
      return;
    }
    for (const action of splitTopLevel(rest)) {
      let am = new RegExp(String.raw`^add\s+(column\s+)?(?:if\s+not\s+exists\s+)?(${IDENT})`, "i").exec(action);
      if (am) {
        if (!am[1] && NON_COLUMN_ELEMENT.test(am[2])) continue;
        ensureTable(state, t).add(normIdent(am[2]));
        continue;
      }
      am = new RegExp(String.raw`^drop\s+(column\s+)?(?:if\s+exists\s+)?(${IDENT})`, "i").exec(action);
      if (am) {
        if (!am[1] && /^(constraint|default|not)$/i.test(am[2])) continue;
        state.tables.get(t)?.delete(normIdent(am[2]));
        continue;
      }
      am = new RegExp(String.raw`^rename\s+(column\s+)?(${IDENT})\s+to\s+(${IDENT})`, "i").exec(action);
      if (am) {
        if (!am[1] && /^constraint$/i.test(am[2])) continue;
        const cols = ensureTable(state, t);
        cols.delete(normIdent(am[2]));
        cols.add(normIdent(am[3]));
      }
    }
  }
}

/**
 * 마이그레이션 하나를 상태에 적용. DO 블록 본문은 재귀 파싱(함수 본문은 무시).
 * @param {ReturnType<typeof emptyState>} state @param {string} sql
 */
export function applyMigrationSql(state, sql) {
  for (const st of splitStatements(sql)) {
    if (/^do\b/i.test(st.text)) {
      for (const b of st.bodies) applyMigrationSql(state, b);
      continue;
    }
    applyDdl(state, st.text);
  }
  return state;
}

/**
 * @param {{ name: string, sql: string }[]} files 마이그레이션 (정렬 전 가능)
 * @returns {{ tables: Record<string, string[]>, functions: string[] }}
 */
export function buildManifest(files) {
  const state = emptyState();
  for (const f of [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    applyMigrationSql(state, f.sql);
  }
  /** @type {Record<string, string[]>} */
  const tables = {};
  for (const t of [...state.tables.keys()].sort()) tables[t] = [...state.tables.get(t)].sort();
  return { tables, functions: [...state.functions.keys()].sort() };
}

/**
 * 스냅샷 파일은 {snapshot:{...}} · SQL 결과 그대로([{snapshot:{...}}]) · 본문 객체 모두 허용.
 * @param {any} raw
 * @returns {{ captured_at?: string, columns: Record<string, string[]>, functions: string[] }}
 */
export function unwrapSnapshot(raw) {
  let s = raw;
  if (Array.isArray(s)) s = s[0];
  if (s && s.snapshot) s = s.snapshot;
  if (typeof s === "string") s = JSON.parse(s);
  return s;
}

/**
 * @param {{ tables: Record<string, string[]>, functions: string[] }} manifest
 * @param {{ columns: Record<string, string[]>, functions: string[] }} snapshot 운영
 * @param {{ entries?: { object: string, reason: string }[] }} [allowlist]
 *   object: "table" | "table.column" | "function()"
 */
export function compareSchema(manifest, snapshot, allowlist = {}) {
  const allowed = new Map((allowlist.entries ?? []).map((e) => [e.object, e.reason]));
  const prodCols = snapshot.columns ?? {};
  const prodFns = new Set(snapshot.functions ?? []);
  const missingTables = [];
  const missingColumns = [];
  const missingFunctions = [];
  for (const [t, cols] of Object.entries(manifest.tables)) {
    const have = prodCols[t];
    if (!have) {
      missingTables.push(t);
      continue;
    }
    const set = new Set(have);
    for (const c of cols) if (!set.has(c)) missingColumns.push(`${t}.${c}`);
  }
  for (const f of manifest.functions) if (!prodFns.has(f)) missingFunctions.push(`${f}()`);

  const manifestFns = new Set(manifest.functions);
  const extraTables = Object.keys(prodCols).filter((t) => !(t in manifest.tables)).sort();
  const extraColumns = [];
  for (const [t, cols] of Object.entries(manifest.tables)) {
    const set = new Set(cols);
    for (const c of prodCols[t] ?? []) if (!set.has(c)) extraColumns.push(`${t}.${c}`);
  }
  const extraFunctions = [...prodFns].filter((f) => !manifestFns.has(f)).sort();

  const all = [...missingTables, ...missingColumns, ...missingFunctions];
  const allowedMissing = all.filter((o) => allowed.has(o)).map((o) => ({ object: o, reason: allowed.get(o) }));
  const blocking = all.filter((o) => !allowed.has(o));
  return {
    missingTables,
    missingColumns,
    missingFunctions,
    allowedMissing,
    blocking,
    extra: { tables: extraTables, columns: extraColumns.sort(), functions: extraFunctions },
    counts: {
      manifestTables: Object.keys(manifest.tables).length,
      manifestColumns: Object.values(manifest.tables).reduce((s, c) => s + c.length, 0),
      manifestFunctions: manifest.functions.length,
      prodTables: Object.keys(prodCols).length,
      prodFunctions: prodFns.size,
    },
    ok: blocking.length === 0,
  };
}
