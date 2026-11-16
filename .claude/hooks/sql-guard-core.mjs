// 운영 DB MCP 조회 검사 — 순수 로직 (docs/audit/mcp-sql-guard-hook-design-2026-11-16.md)
// SQL 을 DB 에 보내기 전에 ① 문법 ② 쓰기 여부 ③ 표·컬럼 이름을 운영 스키마 사진과 대조한다.
// 판단이 애매하면 통과(잘못 막지 않음). 실행해야 알 수 있는 의미 오류는 잡지 않는다.
import { parse } from "libpg-query";

/** Postgres 시스템 컬럼 — 모든 표에 있음 */
const SYSTEM_COLUMNS = new Set(["ctid", "xmin", "xmax", "cmin", "cmax", "tableoid"]);
/** 스키마 사진에 없는(검사하지 않는) 스키마 */
const SKIP_SCHEMAS = new Set(["pg_catalog", "information_schema", "pg_toast"]);

/** 읽기 전용으로 허용하는 문장 */
function classifyStatement(stmt) {
  const [kind] = Object.keys(stmt);
  const body = stmt[kind];
  switch (kind) {
    case "SelectStmt":
      if (body.intoClause) return "write";
      if (body.lockingClause?.length) return "write";
      if (hasModifyingCte(body)) return "write";
      return "read";
    case "ExplainStmt": {
      const inner = body.query ? classifyStatement(body.query) : "write";
      return inner;
    }
    case "VariableShowStmt":
      return "read";
    case "TransactionStmt":
      return "read";
    case "VariableSetStmt": {
      const name = String(body.name ?? "").toLowerCase();
      if (name === "role" || name === "session_authorization") return "write";
      if (name === "transaction_read_only" || name === "transaction") return "read";
      return body.is_local ? "read" : "write";
    }
    default:
      return "write";
  }
}

function hasModifyingCte(selectBody) {
  for (const cte of selectBody.withClause?.ctes ?? []) {
    const q = cte.CommonTableExpr?.ctequery;
    if (!q) continue;
    const [k] = Object.keys(q);
    if (k !== "SelectStmt") return true;
    if (hasModifyingCte(q.SelectStmt)) return true;
  }
  for (const side of ["larg", "rarg"]) {
    if (selectBody[side] && hasModifyingCte(selectBody[side])) return true;
  }
  return false;
}

function strFields(fields) {
  return (fields ?? []).map((f) => (f.String ? f.String.sval : f.A_Star ? "*" : null));
}

/** 스키마 사진 → { tables: Map("schema.table" → Set(cols)), schemas: Set } */
export function indexSchema(snapshot) {
  const tables = new Map();
  const schemas = new Set();
  for (const [key, cols] of Object.entries(snapshot?.tables ?? {})) {
    tables.set(key, new Set(cols));
    schemas.add(key.split(".")[0]);
  }
  return { tables, schemas };
}

function levenshtein(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

function similar(name, candidates, n = 3) {
  return [...candidates]
    .map((c) => ({ c, d: c.includes(name) || name.includes(c) ? 0 : levenshtein(name, c) }))
    .sort((x, y) => x.d - y.d || x.c.localeCompare(y.c))
    .slice(0, n)
    .map((x) => x.c);
}

/**
 * 이름 검사. 반환: 문제 목록 [{ kind: "table"|"column", message }]
 * 출처(source): { kind: "table", key, cols } | { kind: "opaque" } (CTE·하위 쿼리·함수 — 컬럼 검사 안 함)
 */
function checkNames(stmts, idx) {
  const problems = [];

  function resolveRangeVar(rv, scopes) {
    const rel = rv.relname;
    const schema = rv.schemaname;
    if (!schema) {
      for (const s of scopes) if (s.ctes.has(rel)) return { kind: "opaque" };
    }
    if (schema && SKIP_SCHEMAS.has(schema)) return { kind: "opaque" };
    if (!schema && rel.startsWith("pg_")) return { kind: "opaque" };
    const sch = schema ?? "public";
    const key = `${sch}.${rel}`;
    const cols = idx.tables.get(key);
    if (cols) return { kind: "table", key, cols };
    if (!idx.schemas.has(sch)) return { kind: "opaque" };
    const names = [...idx.tables.keys()].filter((k) => k.startsWith(`${sch}.`)).map((k) => k.slice(sch.length + 1));
    problems.push({
      kind: "table",
      name: key,
      message: `표 ${key} 가 운영 DB 에 없습니다. 비슷한 표: ${similar(rel, names).join(", ") || "없음"}`,
    });
    return { kind: "opaque" };
  }

  function addFrom(node, scope, scopes) {
    if (!node) return;
    const [k] = Object.keys(node);
    const b = node[k];
    if (k === "RangeVar") {
      const src = resolveRangeVar(b, scopes);
      scope.sources.set(b.alias?.aliasname ?? b.relname, src);
    } else if (k === "JoinExpr") {
      addFrom(b.larg, scope, scopes);
      addFrom(b.rarg, scope, scopes);
      if (b.alias) scope.sources.set(b.alias.aliasname, { kind: "opaque" });
      if (b.usingClause?.length) scope.opaqueUnqualified = true;
      scope.pending.push(b.quals);
    } else if (k === "RangeSubselect") {
      visit(b.subquery, scopes);
      scope.sources.set(b.alias?.aliasname ?? `__sub${scope.sources.size}`, { kind: "opaque" });
    } else {
      // RangeFunction·RangeTableFunc 등 — 컬럼 모양 모름
      walk(b, scopes);
      const alias = b.alias?.aliasname;
      scope.sources.set(alias ?? `__fn${scope.sources.size}`, { kind: "opaque" });
    }
  }

  function checkColumnRef(cr, scopes) {
    const f = strFields(cr.fields);
    if (f.some((x) => x === null)) return;
    if (f.length === 1) {
      const col = f[0];
      if (col === "*" || SYSTEM_COLUMNS.has(col)) return;
      // 별칭 없는 컬럼: 모든 바깥 범위까지 출처가 전부 아는 표이고, 어디에도 없을 때만 문제
      const known = [];
      for (const s of scopes) {
        // 별칭 자체(행 전체 참조: row_to_json(p))·결과 컬럼 이름
        if (s.opaqueUnqualified || s.outputNames.has(col) || s.sources.has(col)) return;
        for (const src of s.sources.values()) {
          if (src.kind !== "table") return;
          if (src.cols.has(col)) return;
          known.push(src);
        }
      }
      if (known.length === 0) return;
      problems.push({
        kind: "column",
        name: `${known[0].key}.${col}`,
        message:
          known.length === 1
            ? `컬럼 ${col} 이 ${known[0].key} 에 없습니다. 실제 컬럼: ${[...known[0].cols].join(", ")}`
            : `컬럼 ${col} 이 ${known.map((k) => k.key).join(", ")} 어디에도 없습니다`,
      });
      return;
    }
    let ref;
    let col;
    if (f.length === 2) [ref, col] = f;
    else if (f.length === 3) {
      ref = f[1];
      col = f[2];
    } else return;
    if (col === "*" || SYSTEM_COLUMNS.has(col)) return;
    for (const s of scopes) {
      const src = s.sources.get(ref);
      if (!src) continue;
      if (src.kind !== "table") return;
      if (src.cols.has(col)) return;
      problems.push({
        kind: "column",
        name: `${src.key}.${col}`,
        message: `컬럼 ${ref}.${col} 이 ${src.key} 에 없습니다. 실제 컬럼: ${[...src.cols].join(", ")}`,
      });
      return;
    }
    // 범위에 없는 이름(복합 타입 필드 등) — 판단하지 않음
  }

  function walk(node, scopes) {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x, scopes);
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === "SelectStmt") visitSelect(v, scopes);
      else if (k === "ColumnRef") checkColumnRef(v, scopes);
      else if (k === "InsertStmt" || k === "UpdateStmt" || k === "DeleteStmt" || k === "MergeStmt") {
        /* 쓰기는 확인 창 대상 — 이름 검사 생략 */
      } else walk(v, scopes);
    }
  }

  function visit(node, scopes) {
    walk(node, scopes);
  }

  function visitSelect(b, outer) {
    if (b.op && b.op !== "SETOP_NONE") {
      const scopeW = { sources: new Map(), ctes: new Set(), outputNames: new Set(), pending: [] };
      for (const cte of b.withClause?.ctes ?? []) scopeW.ctes.add(cte.CommonTableExpr.ctename);
      const s2 = [scopeW, ...outer];
      for (const cte of b.withClause?.ctes ?? []) walk(cte.CommonTableExpr.ctequery, s2);
      if (b.larg) visitSelect(b.larg, s2);
      if (b.rarg) visitSelect(b.rarg, s2);
      // ORDER BY 는 결과 컬럼 이름 기준 — 검사 생략
      return;
    }
    const scope = { sources: new Map(), ctes: new Set(), outputNames: new Set(), pending: [] };
    for (const cte of b.withClause?.ctes ?? []) scope.ctes.add(cte.CommonTableExpr.ctename);
    const scopes = [scope, ...outer];
    for (const cte of b.withClause?.ctes ?? []) walk(cte.CommonTableExpr.ctequery, scopes);
    for (const t of b.targetList ?? []) if (t.ResTarget?.name) scope.outputNames.add(t.ResTarget.name);
    for (const fr of b.fromClause ?? []) addFrom(fr, scope, scopes);
    for (const q of scope.pending) walk(q, scopes);
    if (b.valuesLists) walk(b.valuesLists, scopes);
    walk(b.targetList, scopes);
    walk(b.whereClause, scopes);
    walk(b.groupClause, scopes);
    walk(b.havingClause, scopes);
    walk(b.sortClause, scopes);
    walk(b.windowClause, scopes);
    walk(b.distinctClause, scopes);
    walk(b.limitCount, scopes);
    walk(b.limitOffset, scopes);
  }

  for (const s of stmts) walk(s.stmt, []);
  return problems;
}

/**
 * @returns {Promise<{decision: "allow"|"deny"|"ask", reason?: string, problems?: Array<{kind:string,name:string,message:string}>}>}
 */
export async function analyzeSql(sql, snapshot) {
  let tree;
  try {
    tree = await parse(sql);
  } catch (e) {
    const pos = e?.sqlDetails?.cursorPosition;
    const near = typeof pos === "number" ? ` (위치 ${pos}: «${sql.slice(Math.max(0, pos - 20), pos + 20).replace(/\s+/g, " ")}»)` : "";
    return {
      decision: "deny",
      reason: `운영 DB 조회 검사(sql-guard): SQL 문법 오류 — ${e?.message ?? e}${near}. DB 에 보내지 않았습니다. 고쳐서 다시 보내세요.`,
    };
  }
  const stmts = tree.stmts ?? [];
  const writes = stmts.filter((s) => s.stmt && classifyStatement(s.stmt) === "write");
  if (writes.length) {
    const kinds = [...new Set(writes.map((s) => Object.keys(s.stmt)[0]))].join(", ");
    return {
      decision: "ask",
      reason:
        `운영 DB 조회 검사(sql-guard): 읽기 전용이 아닌 문장(${kinds}) — 운영 쓰기는 「운영 시험 저장 규칙」·운영 DB 적용 승인 대상입니다. ` +
        `시험 실행은 DO … RAISE 대신 begin; … ; rollback; 으로 하세요(RAISE 는 오류 기록이 남음).`,
    };
  }
  if (!snapshot) return { decision: "allow" };
  const problems = checkNames(stmts, indexSchema(snapshot));
  if (problems.length) {
    return {
      decision: "deny",
      problems,
      reason:
        `운영 DB 조회 검사(sql-guard): 운영 DB 에 없는 이름 — ${problems.map((p) => p.message).join(" / ")}. ` +
        `DB 에 보내지 않았습니다. AGENTS.md 「운영 DB 임의 조회 규칙」: 컬럼을 추측하지 말고 위 실제 이름으로 고치세요.`,
    };
  }
  return { decision: "allow" };
}
