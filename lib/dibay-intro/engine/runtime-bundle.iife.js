(() => {
  // lib/dibay-intro/document.ts
  var DIBAY_INTRO_DOCUMENT_VERSION = 1;
  var DIBAY_INTRO_FONT_FAMILY = "Pretendard Variable";
  var DIBAY_INTRO_FONT_WEIGHTS = [400, 500, 600, 700];
  var SCENE_DURATION_MS_MIN = 400;
  var SCENE_DURATION_MS_MAX = 2e4;
  function isRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }
  function isFiniteNumber(v) {
    return typeof v === "number" && Number.isFinite(v);
  }
  function isNormalizedUnit(v) {
    return isFiniteNumber(v) && v >= 0 && v <= 1;
  }
  function parseFrame(raw, path, issues) {
    if (!isRecord(raw)) {
      issues.push({ path, message: "frame required" });
      return null;
    }
    const { x, y, width, height } = raw;
    if (!isNormalizedUnit(x) || !isNormalizedUnit(y) || !isNormalizedUnit(width) || !isNormalizedUnit(height)) {
      issues.push({ path, message: "frame x/y/width/height must be 0..1" });
      return null;
    }
    if (x + width > 1.0001 || y + height > 1.0001) {
      issues.push({ path, message: "frame must stay inside the normalized viewport" });
      return null;
    }
    return { x, y, width, height };
  }
  function parseBackground(raw, path, issues) {
    if (!isRecord(raw) || raw.type !== "solid" || typeof raw.color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(raw.color)) {
      issues.push({ path, message: "background must be solid #RRGGBB" });
      return null;
    }
    return { type: "solid", color: raw.color.toUpperCase() };
  }
  function parseTransition(raw, path, issues) {
    if (!isRecord(raw) || typeof raw.kind !== "string") {
      issues.push({ path, message: "transition required" });
      return null;
    }
    if (raw.kind === "CUT") return { kind: "CUT" };
    if (raw.kind === "FADE") {
      const durationMs = isFiniteNumber(raw.durationMs) ? raw.durationMs : 240;
      if (durationMs < 80 || durationMs > 1200) {
        issues.push({ path, message: "FADE durationMs must be 80..1200" });
        return null;
      }
      return { kind: "FADE", durationMs };
    }
    if (raw.kind === "SLIDE") {
      const durationMs = isFiniteNumber(raw.durationMs) ? raw.durationMs : 320;
      const direction = raw.direction;
      if (durationMs < 80 || durationMs > 1200) {
        issues.push({ path, message: "SLIDE durationMs must be 80..1200" });
        return null;
      }
      if (direction !== "left" && direction !== "right" && direction !== "up" && direction !== "down") {
        issues.push({ path, message: "SLIDE direction must be left|right|up|down" });
        return null;
      }
      return { kind: "SLIDE", durationMs, direction };
    }
    issues.push({ path, message: "transition kind must be CUT|FADE|SLIDE" });
    return null;
  }
  function parseCommonLayer(raw, path, issues) {
    if (typeof raw.id !== "string" || !raw.id) {
      issues.push({ path, message: "layer id required" });
      return null;
    }
    if (!Number.isInteger(raw.z)) {
      issues.push({ path: `${path}.z`, message: "z must be an integer" });
      return null;
    }
    if (typeof raw.visible !== "boolean") {
      issues.push({ path: `${path}.visible`, message: "visible must be boolean" });
      return null;
    }
    if (!isFiniteNumber(raw.opacity) || raw.opacity < 0 || raw.opacity > 1) {
      issues.push({ path: `${path}.opacity`, message: "opacity must be 0..1" });
      return null;
    }
    const frame = parseFrame(raw.frame, `${path}.frame`, issues);
    if (!frame) return null;
    return { id: raw.id, z: raw.z, visible: raw.visible, opacity: raw.opacity, frame };
  }
  function parseLayer(raw, path, issues) {
    if (!isRecord(raw) || typeof raw.type !== "string") {
      issues.push({ path, message: "layer type required" });
      return null;
    }
    const common = parseCommonLayer(raw, path, issues);
    if (!common) return null;
    if (raw.type === "IMAGE") {
      if (typeof raw.mediaId !== "string" || !raw.mediaId) {
        issues.push({ path: `${path}.mediaId`, message: "IMAGE mediaId required" });
        return null;
      }
      if (raw.fit !== "contain" && raw.fit !== "cover") {
        issues.push({ path: `${path}.fit`, message: "IMAGE fit must be contain|cover" });
        return null;
      }
      return { ...common, type: "IMAGE", mediaId: raw.mediaId, fit: raw.fit };
    }
    if (raw.type === "LOGO") {
      if (typeof raw.mediaId !== "string" || !raw.mediaId) {
        issues.push({ path: `${path}.mediaId`, message: "LOGO mediaId required" });
        return null;
      }
      return { ...common, type: "LOGO", mediaId: raw.mediaId, fit: "contain" };
    }
    if (raw.type === "TEXT") {
      if (typeof raw.content !== "string") {
        issues.push({ path: `${path}.content`, message: "TEXT content required" });
        return null;
      }
      if (raw.fontFamily !== DIBAY_INTRO_FONT_FAMILY) {
        issues.push({ path: `${path}.fontFamily`, message: "TEXT fontFamily must be Pretendard Variable" });
        return null;
      }
      if (!isFiniteNumber(raw.fontSizePx) || raw.fontSizePx < 10 || raw.fontSizePx > 96) {
        issues.push({ path: `${path}.fontSizePx`, message: "TEXT fontSizePx must be 10..96" });
        return null;
      }
      if (!DIBAY_INTRO_FONT_WEIGHTS.includes(raw.fontWeight)) {
        issues.push({ path: `${path}.fontWeight`, message: "TEXT fontWeight must be 400|500|600|700" });
        return null;
      }
      if (raw.align !== "left" && raw.align !== "center" && raw.align !== "right") {
        issues.push({ path: `${path}.align`, message: "TEXT align must be left|center|right" });
        return null;
      }
      if (typeof raw.color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(raw.color)) {
        issues.push({ path: `${path}.color`, message: "TEXT color must be #RRGGBB" });
        return null;
      }
      if (!isFiniteNumber(raw.lineHeight) || raw.lineHeight < 1 || raw.lineHeight > 2.4) {
        issues.push({ path: `${path}.lineHeight`, message: "TEXT lineHeight must be 1..2.4" });
        return null;
      }
      return {
        ...common,
        type: "TEXT",
        content: raw.content,
        fontFamily: DIBAY_INTRO_FONT_FAMILY,
        fontSizePx: raw.fontSizePx,
        fontWeight: raw.fontWeight,
        align: raw.align,
        color: raw.color.toUpperCase(),
        lineHeight: raw.lineHeight
      };
    }
    if (raw.type === "CTA") {
      if (typeof raw.label !== "string" || !raw.label.trim()) {
        issues.push({ path: `${path}.label`, message: "CTA label required" });
        return null;
      }
      if (raw.style !== "primary" && raw.style !== "secondary") {
        issues.push({ path: `${path}.style`, message: "CTA style must be primary|secondary" });
        return null;
      }
      if (raw.action !== "CONTINUE" && raw.action !== "FINISH_INTRO" && raw.action !== "APPROVED_INTERNAL_ROUTE") {
        issues.push({ path: `${path}.action`, message: "CTA action invalid" });
        return null;
      }
      const destination = raw.destination == null ? null : raw.destination;
      if (raw.action === "APPROVED_INTERNAL_ROUTE") {
        if (typeof destination !== "string" || !destination.startsWith("/")) {
          issues.push({ path: `${path}.destination`, message: "APPROVED_INTERNAL_ROUTE needs destination" });
          return null;
        }
      } else if (destination != null) {
        issues.push({ path: `${path}.destination`, message: "destination only for APPROVED_INTERNAL_ROUTE" });
        return null;
      }
      return {
        ...common,
        type: "CTA",
        label: raw.label.trim(),
        style: raw.style,
        action: raw.action,
        destination: raw.action === "APPROVED_INTERNAL_ROUTE" ? destination : null
      };
    }
    issues.push({ path, message: "layer type must be IMAGE|LOGO|TEXT|CTA" });
    return null;
  }
  function parseScene(raw, path, issues) {
    if (!isRecord(raw)) {
      issues.push({ path, message: "scene object required" });
      return null;
    }
    if (typeof raw.id !== "string" || !raw.id) {
      issues.push({ path: `${path}.id`, message: "scene id required" });
      return null;
    }
    if (typeof raw.name !== "string") {
      issues.push({ path: `${path}.name`, message: "scene name required" });
      return null;
    }
    if (!Number.isInteger(raw.order) || raw.order < 0) {
      issues.push({ path: `${path}.order`, message: "scene order must be integer >= 0" });
      return null;
    }
    if (!isFiniteNumber(raw.durationMs) || raw.durationMs < SCENE_DURATION_MS_MIN || raw.durationMs > SCENE_DURATION_MS_MAX) {
      issues.push({
        path: `${path}.durationMs`,
        message: `durationMs must be ${SCENE_DURATION_MS_MIN}..${SCENE_DURATION_MS_MAX}`
      });
      return null;
    }
    const background = parseBackground(raw.background, `${path}.background`, issues);
    const transition = parseTransition(raw.transition, `${path}.transition`, issues);
    if (!background || !transition) return null;
    if (!Array.isArray(raw.layers)) {
      issues.push({ path: `${path}.layers`, message: "layers[] required" });
      return null;
    }
    const layers = [];
    raw.layers.forEach((layer, i) => {
      const parsed = parseLayer(layer, `${path}.layers[${i}]`, issues);
      if (parsed) layers.push(parsed);
    });
    const ids = new Set(layers.map((l) => l.id));
    if (ids.size !== layers.length) {
      issues.push({ path: `${path}.layers`, message: "layer ids must be unique" });
    }
    return {
      id: raw.id,
      name: raw.name,
      order: raw.order,
      durationMs: raw.durationMs,
      background,
      transition,
      layers
    };
  }
  function parseDibayIntroDocument(raw) {
    const issues = [];
    if (!isRecord(raw)) {
      return { ok: false, issues: [{ path: "", message: "document object required" }] };
    }
    if ("scene" in raw && !("scenes" in raw)) {
      issues.push({ path: "scenes", message: "singular scene is forbidden; scenes[] is canonical" });
    }
    if (raw.version !== DIBAY_INTRO_DOCUMENT_VERSION) {
      issues.push({ path: "version", message: `version must be ${DIBAY_INTRO_DOCUMENT_VERSION}` });
    }
    if (!isRecord(raw.settings) || typeof raw.settings.defaultBackgroundColor !== "string") {
      issues.push({ path: "settings.defaultBackgroundColor", message: "required" });
    }
    if (!Array.isArray(raw.scenes)) {
      issues.push({ path: "scenes", message: "scenes[] required" });
      return { ok: false, issues };
    }
    if (raw.scenes.length < 1) {
      issues.push({ path: "scenes", message: "at least one scene is required" });
    }
    const scenes = [];
    raw.scenes.forEach((scene, i) => {
      const parsed = parseScene(scene, `scenes[${i}]`, issues);
      if (parsed) scenes.push(parsed);
    });
    const sceneIds = new Set(scenes.map((s) => s.id));
    if (sceneIds.size !== scenes.length) {
      issues.push({ path: "scenes", message: "scene ids must be unique" });
    }
    const orders = scenes.map((s) => s.order).sort((a, b) => a - b);
    if (orders.some((o, i) => o !== i)) {
      issues.push({ path: "scenes", message: "scene order must be 0..n-1 without gaps" });
    }
    if (issues.length) return { ok: false, issues };
    return {
      ok: true,
      document: {
        version: DIBAY_INTRO_DOCUMENT_VERSION,
        settings: {
          defaultBackgroundColor: String(
            raw.settings.defaultBackgroundColor
          ).toUpperCase()
        },
        scenes: scenes.slice().sort((a, b) => a.order - b.order)
      }
    };
  }

  // lib/community/share/community-share-url.ts
  function buildCommunityPostSharePath(postId) {
    const id = postId.trim();
    if (!id) return "/community/posts";
    return `/community/posts/${encodeURIComponent(id)}`;
  }

  // lib/notifications/community-post-notification-destination.ts
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function buildCommunityPostNotificationPath(postId) {
    return buildCommunityPostSharePath(postId);
  }
  function canonicalizeLegacyCommunityPostNotificationPath(pathname) {
    const path = pathname.trim().split("?")[0] ?? "";
    const match = /^\/philife\/posts\/([^/]+)$/i.exec(path);
    if (!match?.[1]) return null;
    let id = match[1];
    try {
      id = decodeURIComponent(id);
    } catch {
      return null;
    }
    if (!UUID_RE.test(id)) return null;
    return buildCommunityPostNotificationPath(id);
  }

  // lib/notifications/policy/notification-internal-route.ts
  var SAFE_NOTIFICATION_ROUTE_PREFIXES = [
    "/community-messenger",
    "/community",
    "/group-chat",
    "/chats",
    "/post",
    "/market",
    "/stores",
    "/orders",
    "/my",
    "/mypage",
    "/philife",
    "/notifications",
    "/business",
    "/admin"
  ];
  function isAllowedSupportNotificationPath(pathname) {
    const path = String(pathname || "").trim();
    if (path === "/support/enter") return true;
    const m = /^\/support\/cases\/([^/]+)$/.exec(path);
    if (!m) return false;
    let id = m[1];
    try {
      id = decodeURIComponent(id);
    } catch {
      return false;
    }
    const trimmed = id.trim();
    if (!trimmed) return false;
    if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) return false;
    if (trimmed === "open" || trimmed === "new" || trimmed === "enter") return false;
    return true;
  }
  function isAllowedPlatformEventNotificationPath(pathname) {
    const path = String(pathname || "").trim();
    const m = /^\/events\/([^/]+)$/.exec(path);
    if (!m) return false;
    let id = m[1];
    try {
      id = decodeURIComponent(id);
    } catch {
      return false;
    }
    const trimmed = id.trim();
    if (!trimmed) return false;
    if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) return false;
    return true;
  }
  function resolveSafeNotificationInternalRoute(value, fallback = null) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw || /[\u0000-\u001f\\]/.test(raw)) return fallback;
    let route = raw;
    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed2 = new URL(raw);
        route = `${parsed2.pathname}${parsed2.search}${parsed2.hash}`;
      } catch {
        return fallback;
      }
    }
    if (!route.startsWith("/") || route.startsWith("//")) return fallback;
    let parsed;
    try {
      parsed = new URL(route, "https://dibay.internal");
    } catch {
      return fallback;
    }
    const healedPath = canonicalizeLegacyCommunityPostNotificationPath(parsed.pathname) ?? parsed.pathname;
    if (healedPath !== parsed.pathname) {
      parsed = new URL(`${healedPath}${parsed.search}${parsed.hash}`, "https://dibay.internal");
    }
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (isAllowedSupportNotificationPath(parsed.pathname)) {
      return normalized;
    }
    if (isAllowedPlatformEventNotificationPath(parsed.pathname)) {
      return normalized;
    }
    if (parsed.pathname !== "/" && !SAFE_NOTIFICATION_ROUTE_PREFIXES.some(
      (prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`)
    )) {
      return fallback;
    }
    return normalized;
  }

  // lib/dibay-intro/cta-routes.ts
  var BLOCKED_PREFIXES = ["/admin", "/stores/owner", "/business"];
  var DIBAY_INTRO_CTA_ROUTE_OPTIONS = [
    { href: "/philife", labelKo: "\uCEE4\uBBA4\uB2C8\uD2F0", labelEn: "Community" },
    { href: "/market", labelKo: "\uAC70\uB798", labelEn: "Market" },
    { href: "/stores", labelKo: "\uBC30\uB2EC", labelEn: "Delivery" },
    { href: "/community-messenger", labelKo: "\uCC44\uD305", labelEn: "Chat" },
    { href: "/mypage", labelKo: "\uB0B4\uC815\uBCF4", labelEn: "My" }
  ];
  function resolveApprovedIntroCtaRoute(value) {
    const resolved = resolveSafeNotificationInternalRoute(value, null);
    if (!resolved) return null;
    const path = resolved.split("?")[0] ?? resolved;
    if (BLOCKED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return null;
    return DIBAY_INTRO_CTA_ROUTE_OPTIONS.some((opt) => path === opt.href) ? path : null;
  }
  function isApprovedIntroCtaRoute(value) {
    return resolveApprovedIntroCtaRoute(value) != null;
  }

  // lib/dibay-intro/engine/cta-action.ts
  function resolveCtaRuntimeAction(layer, document2, elapsedMs) {
    if (layer.action === "FINISH_INTRO") return { kind: "FINISH" };
    if (layer.action === "CONTINUE") {
      let cursor = 0;
      for (let i = 0; i < document2.scenes.length; i += 1) {
        const end = cursor + document2.scenes[i].durationMs;
        if (elapsedMs < end || i === document2.scenes.length - 1) {
          if (i >= document2.scenes.length - 1) return { kind: "FINISH" };
          return { kind: "CONTINUE", seekMs: end };
        }
        cursor = end;
      }
      return { kind: "FINISH" };
    }
    if (layer.action === "APPROVED_INTERNAL_ROUTE") {
      if (!isApprovedIntroCtaRoute(layer.destination)) return { kind: "IGNORE" };
      return { kind: "INTERNAL_ROUTE", destination: layer.destination, navigateAdmin: false };
    }
    return { kind: "IGNORE" };
  }

  // lib/dibay-intro/geometry.ts
  function containRect(sourceW, sourceH, box) {
    if (sourceW <= 0 || sourceH <= 0) return box;
    const source = sourceW / sourceH;
    const dest = box.width / box.height;
    if (source > dest) {
      const height = box.width / source;
      return { x: box.x, y: box.y + (box.height - height) / 2, width: box.width, height };
    }
    const width = box.height * source;
    return { x: box.x + (box.width - width) / 2, y: box.y, width, height: box.height };
  }
  function coverRect(sourceW, sourceH, box) {
    if (sourceW <= 0 || sourceH <= 0) return box;
    const source = sourceW / sourceH;
    const dest = box.width / box.height;
    if (source > dest) {
      const width = box.height * source;
      return { x: box.x - (width - box.width) / 2, y: box.y, width, height: box.height };
    }
    const height = box.width / source;
    return { x: box.x, y: box.y - (height - box.height) / 2, width: box.width, height };
  }

  // lib/dibay-intro/engine/media-fit.ts
  function fittedMediaRect(sourceW, sourceH, box, fit) {
    return fit === "cover" ? coverRect(sourceW, sourceH, box) : containRect(sourceW, sourceH, box);
  }
  function frameToCss(frame) {
    return {
      left: `${frame.x * 100}%`,
      top: `${frame.y * 100}%`,
      width: `${frame.width * 100}%`,
      height: `${frame.height * 100}%`
    };
  }

  // lib/dibay-intro/engine/layer-dom.ts
  function applyFrame(el, layer) {
    const css = frameToCss(layer.frame);
    el.style.position = "absolute";
    el.style.left = css.left;
    el.style.top = css.top;
    el.style.width = css.width;
    el.style.height = css.height;
    el.style.opacity = String(layer.opacity);
    el.style.zIndex = String(layer.z);
    el.style.display = layer.visible ? "block" : "none";
    el.style.pointerEvents = "auto";
    el.dataset.layerId = layer.id;
    el.dataset.layerType = layer.type;
  }
  function renderBitmap(layer, ctx) {
    const wrap = document.createElement("div");
    applyFrame(wrap, layer);
    wrap.style.overflow = "hidden";
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    const url = ctx.mediaUrlById[layer.mediaId] ?? "";
    img.src = url;
    img.style.position = "absolute";
    const size = ctx.mediaSizeById?.[layer.mediaId];
    if (size && size.width > 0 && size.height > 0) {
      const fitted = fittedMediaRect(size.width, size.height, { x: 0, y: 0, width: 1, height: 1 }, layer.fit);
      const css = frameToCss(fitted);
      img.style.left = css.left;
      img.style.top = css.top;
      img.style.width = css.width;
      img.style.height = css.height;
    } else {
      img.style.inset = "0";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = layer.fit;
    }
    wrap.appendChild(img);
    return wrap;
  }
  function renderText(layer) {
    const el = document.createElement("div");
    applyFrame(el, layer);
    el.style.fontFamily = `"${layer.fontFamily}", sans-serif`;
    el.style.fontSize = `${layer.fontSizePx}px`;
    el.style.fontWeight = String(layer.fontWeight);
    el.style.color = layer.color;
    el.style.lineHeight = String(layer.lineHeight);
    el.style.textAlign = layer.align;
    el.style.whiteSpace = "pre-wrap";
    el.style.overflow = "hidden";
    el.textContent = layer.content;
    return el;
  }
  function renderCta(layer, ctx) {
    const button = document.createElement("button");
    button.type = "button";
    applyFrame(button, layer);
    button.textContent = layer.label;
    button.style.border = "0";
    button.style.borderRadius = "8px";
    button.style.cursor = ctx.interactive ? "pointer" : "default";
    button.style.fontFamily = '"Pretendard Variable", sans-serif';
    button.style.fontWeight = "700";
    button.style.fontSize = "16px";
    if (layer.style === "primary") {
      button.style.background = "#FFFFFF";
      button.style.color = "#0B421A";
    } else {
      button.style.background = "transparent";
      button.style.color = "#FFFFFF";
      button.style.border = "1px solid #FFFFFF";
    }
    if (ctx.interactive && ctx.onCta) {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        ctx.onCta?.(layer);
      });
    }
    return button;
  }
  function renderLayer(layer, ctx) {
    if (layer.type === "IMAGE" || layer.type === "LOGO") return renderBitmap(layer, ctx);
    if (layer.type === "TEXT") return renderText(layer);
    return renderCta(layer, ctx);
  }

  // lib/dibay-intro/engine/scene-dom.ts
  function slideOffset(direction, progress) {
    const remaining = 1 - progress;
    if (direction === "left") return { x: `${remaining * 100}%`, y: "0" };
    if (direction === "right") return { x: `${-remaining * 100}%`, y: "0" };
    if (direction === "up") return { x: "0", y: `${remaining * 100}%` };
    return { x: "0", y: `${-remaining * 100}%` };
  }
  function renderScene(scene, ctx) {
    const root = document.createElement("div");
    root.dataset.sceneId = scene.id;
    root.style.position = "absolute";
    root.style.inset = "0";
    root.style.background = scene.background.color;
    root.style.overflow = "hidden";
    const layers = scene.layers.slice().sort((a, b) => a.z - b.z);
    for (const layer of layers) {
      root.appendChild(renderLayer(layer, ctx));
    }
    return root;
  }

  // lib/dibay-intro/engine/timeline.ts
  function sceneTransitionMs(scene) {
    if (scene.transition.kind === "CUT") return 0;
    return scene.transition.durationMs;
  }
  function documentDurationMs(document2) {
    return document2.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
  }
  function resolveTimeline(document2, elapsedMs) {
    const totalMs = documentDurationMs(document2);
    if (document2.scenes.length === 0) {
      return { sceneIndex: 0, previousIndex: null, sceneLocalMs: 0, transitionProgress: 1, done: true, totalMs: 0 };
    }
    if (elapsedMs >= totalMs) {
      const last2 = document2.scenes.length - 1;
      return {
        sceneIndex: last2,
        previousIndex: last2 > 0 ? last2 - 1 : null,
        sceneLocalMs: document2.scenes[last2].durationMs,
        transitionProgress: 1,
        done: true,
        totalMs
      };
    }
    let cursor = 0;
    for (let i = 0; i < document2.scenes.length; i += 1) {
      const scene = document2.scenes[i];
      const next = cursor + scene.durationMs;
      if (elapsedMs < next) {
        const sceneLocalMs = elapsedMs - cursor;
        const tMs = sceneTransitionMs(scene);
        const transitionProgress = tMs <= 0 ? 1 : Math.min(1, Math.max(0, sceneLocalMs / tMs));
        return {
          sceneIndex: i,
          previousIndex: i > 0 ? i - 1 : null,
          sceneLocalMs,
          transitionProgress,
          done: false,
          totalMs
        };
      }
      cursor = next;
    }
    const last = document2.scenes.length - 1;
    return {
      sceneIndex: last,
      previousIndex: last > 0 ? last - 1 : null,
      sceneLocalMs: document2.scenes[last].durationMs,
      transitionProgress: 1,
      done: true,
      totalMs
    };
  }

  // lib/dibay-intro/engine/player.ts
  function applyTransition(current, previous, scene, progress) {
    current.style.opacity = "1";
    current.style.transform = "translate(0,0)";
    if (!previous || progress >= 1 || scene.transition.kind === "CUT") {
      if (previous) previous.style.display = "none";
      return;
    }
    previous.style.display = "block";
    if (scene.transition.kind === "FADE") {
      current.style.opacity = String(progress);
      previous.style.opacity = String(1 - progress);
      return;
    }
    const offset = slideOffset(scene.transition.direction, progress);
    current.style.transform = `translate(${offset.x}, ${offset.y})`;
  }
  function attachIntroPlayer(host, options) {
    let opts = options;
    let elapsed = 0;
    let playing = opts.mode !== "stage";
    let raf = 0;
    let lastTs = 0;
    let firstFrame = false;
    let completed = false;
    const layer = document.createElement("div");
    layer.style.position = "relative";
    layer.style.width = "100%";
    layer.style.height = "100%";
    layer.style.overflow = "hidden";
    host.appendChild(layer);
    const ctx = () => ({
      mediaUrlById: opts.mediaUrlById,
      mediaSizeById: opts.mediaSizeById,
      interactive: Boolean(opts.interactive),
      onCta: opts.onCta
    });
    function paint() {
      layer.replaceChildren();
      const doc = opts.document;
      if (!doc.scenes.length) return;
      if (opts.mode === "stage") {
        const scene = doc.scenes.find((s) => s.id === opts.stageSceneId) ?? doc.scenes[0];
        layer.appendChild(renderScene(scene, ctx()));
        if (!firstFrame) {
          firstFrame = true;
          opts.onFirstFrame?.();
        }
        return;
      }
      const frame = resolveTimeline(doc, elapsed);
      const currentScene = doc.scenes[frame.sceneIndex];
      const previousScene = frame.previousIndex != null ? doc.scenes[frame.previousIndex] : null;
      const previousEl = previousScene ? renderScene(previousScene, ctx()) : null;
      const currentEl = renderScene(currentScene, ctx());
      if (previousEl) layer.appendChild(previousEl);
      layer.appendChild(currentEl);
      applyTransition(currentEl, previousEl, currentScene, frame.transitionProgress);
      if (!firstFrame) {
        firstFrame = true;
        opts.onFirstFrame?.();
      }
      if (frame.done && !completed) {
        completed = true;
        playing = false;
        opts.onComplete?.();
      }
    }
    function tick(ts) {
      if (!playing) return;
      if (!lastTs) lastTs = ts;
      elapsed += ts - lastTs;
      lastTs = ts;
      paint();
      if (playing) raf = window.requestAnimationFrame(tick);
    }
    paint();
    if (playing) raf = window.requestAnimationFrame(tick);
    return {
      destroy() {
        playing = false;
        window.cancelAnimationFrame(raf);
        layer.remove();
      },
      pause() {
        playing = false;
        window.cancelAnimationFrame(raf);
        lastTs = 0;
      },
      play() {
        if (playing) return;
        playing = true;
        completed = false;
        lastTs = 0;
        raf = window.requestAnimationFrame(tick);
      },
      seek(ms) {
        elapsed = Math.max(0, ms);
        completed = false;
        paint();
      },
      refresh(next) {
        opts = { ...opts, ...next };
        paint();
      },
      getElapsedMs() {
        return elapsed;
      }
    };
  }

  // lib/dibay-intro/pack/bootstrap.ts
  var DIBAY_INTRO_BOOTSTRAP_STEPS = [
    "PACK_OPEN",
    "MANIFEST_READ",
    "MANIFEST_PARSE",
    "ENGINE_VERIFY",
    "DOCUMENT_VERIFY",
    "ASSET_MAP",
    "ASSET_VERIFY",
    "FONT_LOAD",
    "MEDIA_LOAD",
    "SCENE_BUILD",
    "FIRST_LAYOUT",
    "FIRST_PAINT",
    "INTRO_FIRST_FRAME_READY"
  ];
  function bootstrapEventName(step, result) {
    return `${step}_${result}`;
  }
  var DIBAY_INTRO_BOOTSTRAP_EVENT_NAMES = DIBAY_INTRO_BOOTSTRAP_STEPS.flatMap(
    (step) => ["BEGIN", "PASS", "FAIL"].map((result) => bootstrapEventName(step, result))
  );
  function createBootstrapTraceBuffer() {
    const traces = [];
    let firstFailure = null;
    function emit(step, result, reason) {
      const trace2 = { step, result, reason, at: Date.now() };
      traces.push(trace2);
      if (result === "FAIL" && !firstFailure) firstFailure = trace2;
      return trace2;
    }
    return {
      emit,
      traces: () => traces.slice(),
      firstFailure: () => firstFailure
    };
  }

  // lib/dibay-intro/pack/manifest.ts
  function parseIntroPackManifest(raw) {
    if (!raw || typeof raw !== "object") return { ok: false, reason: "manifest_not_object" };
    const m = raw;
    if (m.version !== 1) return { ok: false, reason: "manifest_version" };
    if (typeof m.introId !== "string" || typeof m.revisionId !== "string") return { ok: false, reason: "manifest_ids" };
    if (m.completeness !== "READY") return { ok: false, reason: "manifest_not_ready" };
    if (!Array.isArray(m.media)) return { ok: false, reason: "manifest_media" };
    if (typeof m.engineHash !== "string" || !m.engineHash) return { ok: false, reason: "manifest_engine_hash" };
    if (typeof m.documentChecksum !== "string" || !m.documentChecksum) return { ok: false, reason: "manifest_document_checksum" };
    return { ok: true, manifest: m };
  }

  // lib/dibay-intro/engine/runtime-entry.ts
  var buffer = createBootstrapTraceBuffer();
  var currentStep = "PACK_OPEN";
  function trace(step, result, reason) {
    if (result === "BEGIN") currentStep = step;
    buffer.emit(step, result, reason);
    window.DibayIntroHost?.trace?.({ step, result, reason });
  }
  async function readJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path}:${res.status}`);
    return res.json();
  }
  async function boot() {
    try {
      trace("PACK_OPEN", "BEGIN");
      trace("PACK_OPEN", "PASS");
      trace("MANIFEST_READ", "BEGIN");
      const rawManifest = await readJson("./manifest.json");
      trace("MANIFEST_READ", "PASS");
      trace("MANIFEST_PARSE", "BEGIN");
      const parsedManifest = parseIntroPackManifest(rawManifest);
      if (!parsedManifest.ok) {
        trace("MANIFEST_PARSE", "FAIL", parsedManifest.reason);
        return;
      }
      trace("MANIFEST_PARSE", "PASS");
      trace("ENGINE_VERIFY", "BEGIN");
      if (!parsedManifest.manifest.engineHash) {
        trace("ENGINE_VERIFY", "FAIL", "engine_hash_missing");
        return;
      }
      trace("ENGINE_VERIFY", "PASS");
      trace("DOCUMENT_VERIFY", "BEGIN");
      const documentRaw = await readJson("./document.json");
      const parsedDocument = parseDibayIntroDocument(documentRaw);
      if (!parsedDocument.ok) {
        trace("DOCUMENT_VERIFY", "FAIL", parsedDocument.issues[0]?.message ?? "document_invalid");
        return;
      }
      trace("DOCUMENT_VERIFY", "PASS");
      trace("ASSET_MAP", "BEGIN");
      const mediaUrlById = {};
      for (const item of parsedManifest.manifest.media) {
        mediaUrlById[item.id] = `./${item.file}`;
      }
      trace("ASSET_MAP", "PASS");
      trace("ASSET_VERIFY", "BEGIN");
      for (const item of parsedManifest.manifest.media) {
        const res = await fetch(`./${item.file}`);
        if (!res.ok) {
          trace("ASSET_VERIFY", "FAIL", `missing:${item.id}`);
          return;
        }
      }
      trace("ASSET_VERIFY", "PASS");
      trace("FONT_LOAD", "BEGIN");
      try {
        const face = new FontFace("Pretendard Variable", "url(./fonts/PretendardVariable.woff2)");
        await face.load();
        window.document.fonts.add(face);
        trace("FONT_LOAD", "PASS");
      } catch {
        trace("FONT_LOAD", "FAIL", "font_load");
        return;
      }
      trace("MEDIA_LOAD", "BEGIN");
      await Promise.all(Object.values(mediaUrlById).map((url) => fetch(url)));
      trace("MEDIA_LOAD", "PASS");
      trace("SCENE_BUILD", "BEGIN");
      const host = window.document.getElementById("stage");
      if (!host) {
        trace("SCENE_BUILD", "FAIL", "stage_missing");
        return;
      }
      trace("SCENE_BUILD", "PASS");
      trace("FIRST_LAYOUT", "BEGIN");
      const handle = attachIntroPlayer(host, {
        document: parsedDocument.document,
        mediaUrlById,
        mode: "runtime",
        interactive: true,
        onCta: (layer) => {
          const action = resolveCtaRuntimeAction(layer, parsedDocument.document, handle.getElapsedMs());
          if (action.kind === "CONTINUE") handle.seek(action.seekMs);
          if (action.kind === "FINISH") handle.pause();
        },
        onFirstFrame: () => {
          trace("FIRST_LAYOUT", "PASS");
          trace("FIRST_PAINT", "BEGIN");
          trace("FIRST_PAINT", "PASS");
          trace("INTRO_FIRST_FRAME_READY", "BEGIN");
          trace("INTRO_FIRST_FRAME_READY", "PASS");
        }
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      if (!buffer.firstFailure()) {
        trace(currentStep, "FAIL", reason);
      }
    }
  }
  void boot();
})();
