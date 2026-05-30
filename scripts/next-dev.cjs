/**
 * Next.js 16+ 는 프로젝트당 `.next/dev/lock` 하나만 허용합니다.
 * 포트 3000을 쓰는 예전 `next dev`가 살아 있으면, 새 터미널은 3001로 올리려 해도
 * 잠금 때문에 "Unable to acquire lock" 으로 바로 종료됩니다.
 *
 * 이 스크립트는 (Windows 기준) 3000·3001·3002 LISTENING 프로세스를 끄고
 * 잠금 파일을 지운 뒤 `next dev`를 한 번만 실행합니다.
 * 다른 앱이 같은 포트를 쓰면 함께 종료될 수 있으니, 필요하면 `npm run dev:next`만 쓰세요.
 *
 * Windows + Webpack: `.next` 동시 접근 시 `UNKNOWN` / errno -4094 가 나올 수 있어
 * 기본은 안정 모드(직렬 컴파일·메모리 캐시). 빠른 병렬은 `npm run dev:fast` 또는 `--win-fast`.
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

/**
 * Next dev 서버는 heap 사용량이 제한의 80%를 넘으면 자동 재시작합니다.
 * - 이미 NODE_OPTIONS 에 `--max-old-space-size` 가 있으면 절대 덮어쓰지 않음.
 * - 없으면 기본 4096MB (8GB RAM 환경 친화). 16GB+ 에서만 SAMARKET_DEV_HEAP_MB=8192 등으로 명시 권장.
 */
function parseHeapMbFromNodeOptions() {
  const raw = String(process.env.NODE_OPTIONS || "");
  const m = raw.match(/--max-old-space-size=(\d+)/);
  return m ? Number(m[1]) : null;
}

function ensureDevHeapLimitMb() {
  if (parseHeapMbFromNodeOptions() != null) return;

  let mb = 4096;
  const explicit = process.env.SAMARKET_DEV_HEAP_MB?.trim();
  if (explicit) {
    const n = Number(explicit);
    if (Number.isFinite(n) && n > 0) {
      mb = Math.min(8192, Math.max(512, Math.floor(n)));
    }
  }

  const raw = String(process.env.NODE_OPTIONS || "");
  const chunk = `--max-old-space-size=${mb}`;
  process.env.NODE_OPTIONS = raw.length > 0 ? `${raw} ${chunk}` : chunk;
}

function printDevHeapBanner() {
  const mb = parseHeapMbFromNodeOptions();
  const explicit = process.env.SAMARKET_DEV_HEAP_MB?.trim();
  let hint = "";
  if (explicit && mb != null) {
    hint = ` (from SAMARKET_DEV_HEAP_MB=${explicit})`;
  } else if (mb === 4096 && !explicit) {
    hint = " (default; set SAMARKET_DEV_HEAP_MB=8192 on 16GB+ if needed)";
  }
  console.log(`[samarket] Node heap --max-old-space-size: ${mb ?? "?"} MB${hint}`);
}

ensureDevHeapLimitMb();
printDevHeapBanner();

function readNextDistDirFromEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    try {
      const text = fs.readFileSync(p, "utf8");
      const m = text.match(/^\s*NEXT_DIST_DIR\s*=\s*(.+)$/m);
      if (m) {
        return m[1].trim().replace(/^["']|["']$/g, "");
      }
    } catch {
      /* ignore */
    }
  }
  return "";
}

/**
 * next.config 의 distDir 과 lock 경로가 맞아야 함 (.env.local 만 부모가 읽음).
 * 프로젝트 밖 distDir 는 Next 16 에서 모듈 해석이 깨질 수 있어 자동 지정하지 않는다.
 */
function ensureNextDistDirEnv() {
  let dir = process.env.NEXT_DIST_DIR?.trim();
  if (dir) return;
  dir = readNextDistDirFromEnvFiles();
  if (dir) {
    process.env.NEXT_DIST_DIR = dir;
  }
}

function distRootFromEnv() {
  const dir = process.env.NEXT_DIST_DIR?.trim();
  if (!dir) return path.join(root, ".next");
  return path.isAbsolute(dir) ? dir : path.join(root, dir);
}

ensureNextDistDirEnv();
const distRoot = distRootFromEnv();
const lockPath = path.join(distRoot, "dev", "lock");
const PORTS = [3000, 3001, 3002];

function killListenersOnPortsWin(ports) {
  if (process.platform !== "win32") return;
  let netstat;
  try {
    netstat = execSync("netstat -ano", { encoding: "utf8" });
  } catch {
    return;
  }
  const pids = new Set();
  for (const line of netstat.split(/\r?\n/)) {
    if (!line.toUpperCase().includes("LISTENING")) continue;
    for (const port of ports) {
      if (new RegExp(`:${port}\\s`).test(line)) {
        const m = line.trim().match(/(\d+)\s*$/);
        if (m) pids.add(m[1]);
      }
    }
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    } catch {
      /* ignore */
    }
  }
}

function killListenersOnPortsUnix(ports) {
  if (process.platform === "win32") return;
  for (const port of ports) {
    try {
      execSync(`sh -c 'command -v lsof >/dev/null && lsof -ti :${port} | xargs -r kill -9'`, {
        stdio: "ignore",
      });
    } catch {
      /* ignore */
    }
  }
}

killListenersOnPortsWin(PORTS);
killListenersOnPortsUnix(PORTS);

if (process.platform === "win32") {
  try {
    execSync("timeout /t 1 /nobreak >nul 2>&1", { shell: true, stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

try {
  fs.rmSync(lockPath, { force: true });
} catch {
  /* ignore */
}

const extraRaw = process.argv.slice(2);
/** Next CLI 에 넘기면 안 되는 플래그 */
const extra = extraRaw.filter((a) => a !== "--win-stable" && a !== "--win-fast");

const turboRequested =
  process.env.NEXT_DEV_BUNDLER === "turbo" ||
  process.env.NEXT_DEV_BUNDLER === "turbopack" ||
  extra.includes("--turbo") ||
  extra.includes("--turbopack");

const winFastRequested =
  process.platform === "win32" &&
  (extraRaw.includes("--win-fast") || process.env.NEXT_WEBPACK_FAST === "1");

/**
 * Windows + Webpack: UNKNOWN(-4094) open `.next/dev/...` 방지 — 기본 안정 모드.
 * Turbopack 모드에서는 Webpack 설정이 달라 동일 이슈가 적어 안정 플래그 생략.
 */
if (process.platform === "win32" && !winFastRequested && !turboRequested) {
  process.env.NEXT_WEBPACK_WIN_SERIAL = "1";
  process.env.NEXT_WEBPACK_MEMORY_CACHE = "1";
  /** 폴링 — 네이티브 이벤트+백신 경합보다 안정적 (끄기: NEXT_WEBPACK_NO_POLL=1) */
  if (process.env.NEXT_WEBPACK_NO_POLL !== "1") {
    if (
      process.env.NEXT_WEBPACK_POLL_MS === undefined ||
      process.env.NEXT_WEBPACK_POLL_MS === ""
    ) {
      process.env.NEXT_WEBPACK_POLL_MS = "2500";
    }
    process.env.WATCHPACK_POLLING = process.env.WATCHPACK_POLLING || "true";
  }
  console.log(
    "[samarket] Windows Webpack 안정 모드(poll 2.5s). 여전히 UNKNOWN(-4094)이면 백신 제외·동기화 폴더 밖에 저장소 두기  |  빠른 빌드: dev:fast (필요 시 NEXT_WEBPACK_NO_POLL=1)"
  );
  console.log(
    "[samarket] 첫 API·페이지마다 'Compiling …' 수 초는 개발 모드 정상입니다. 체감: npm run dev:fast 또는 npm run dev:turbo — 프로필은 GET /api/me/profile 단일 서버 파이프라인으로 정리됨."
  );
} else if (process.platform === "win32" && winFastRequested) {
  delete process.env.NEXT_WEBPACK_WIN_SERIAL;
  delete process.env.NEXT_WEBPACK_MEMORY_CACHE;
  /** dev:fast 에서도 기본은 폴링 유지 — NO_POLL 은 명시할 때만 */
  if (process.env.NEXT_WEBPACK_NO_POLL !== "1") {
    if (
      process.env.NEXT_WEBPACK_POLL_MS === undefined ||
      process.env.NEXT_WEBPACK_POLL_MS === ""
    ) {
      process.env.NEXT_WEBPACK_POLL_MS = "2500";
    }
    process.env.WATCHPACK_POLLING = process.env.WATCHPACK_POLLING || "true";
  }
}

const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
if (!fs.existsSync(nextCli)) {
  console.error("next CLI not found. Run npm install.");
  process.exit(1);
}

/**
 * Turbopack(next dev 기본)이 간헐적으로 내부 패닉·dev 서버 재시작을 일으키는 경우가 있어
 * (!.next FATAL: unexpected Turbopack error) — 기본은 Webpack 이 더 안정적.
 * Turbopack 을 쓰려면: NEXT_DEV_BUNDLER=turbo npm run dev
 * 또는: node scripts/next-dev.cjs --turbo
 */
const webpackRequested = extra.includes("--webpack");
const devArgs =
  !turboRequested && !webpackRequested ? [...extra, "--webpack"] : extra;

if (!turboRequested && !webpackRequested) {
  console.log(
    "[samarket] Dev bundler: Webpack (default). Turbopack: NEXT_DEV_BUNDLER=turbo npm run dev"
  );
}

const child = spawn(process.execPath, [nextCli, "dev", ...devArgs], {
  stdio: "inherit",
  cwd: root,
});

child.on("exit", (code) => process.exit(code ?? 0));
