#!/usr/bin/env node
/**
 * `/stores` header 1·2·3 runtime audit — inject in browser console or Playwright evaluate.
 */
(function storesHomeHeaderRuntimeAudit() {
  const tierSel = {
    1: '[data-stores-home-tier="1"]',
    2: '[data-stores-home-tier="2"]',
    3: '[data-stores-home-tier="3"]',
  };

  function countVisible(sel) {
    return [...document.querySelectorAll(sel)].filter((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 2 && style.visibility !== "hidden" && Number(style.opacity) > 0.05;
    });
  }

  function edgeX(el) {
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right) };
  }

  const report = {
    tier1InstanceMax: document.querySelectorAll(tierSel[1]).length,
    tier2InstanceMax: document.querySelectorAll(tierSel[2]).length,
    tier3InstanceMax: document.querySelectorAll(tierSel[3]).length,
    tier1Visible: countVisible(tierSel[1]).length,
    tier2Visible: countVisible(tierSel[2]).length,
    tier3Visible: countVisible(tierSel[3]).length,
    tier1Hidden: document.querySelector("[data-stores-home-tier1-shell]")?.getAttribute("data-hidden"),
    tier2Revealed: document.querySelector("[data-stores-home-tier2-reveal]")?.getAttribute("data-revealed"),
    scrollTop: document.querySelector("[data-main-hub-scroll-body]")?.scrollTop ?? null,
    contentStartTop: document.querySelector("[data-stores-home-scroll-content-start]")?.getBoundingClientRect().top ?? null,
    tier3Bottom: document.querySelector("[data-stores-home-tier3-boundary]")?.getBoundingClientRect().bottom ?? null,
    proxySentinel: document.querySelectorAll("[data-stores-home-secondary-reveal-sentinel]").length,
  };

  const t1 = document.querySelector(tierSel[1]);
  const t2 = document.querySelector(tierSel[2]);
  const t3 = document.querySelector(tierSel[3]);
  const body = document.querySelector(".stores-home-hub");

  const edges = {};
  if (t1) edges.tier1 = edgeX(t1);
  if (t2) edges.tier2 = edgeX(t2);
  if (t3) edges.tier3 = edgeX(t3);
  if (body) edges.body = edgeX(body);

  const xs = Object.values(edges);
  if (xs.length >= 2) {
    const lefts = xs.map((x) => x.left);
    const rights = xs.map((x) => x.right);
    report.widthMaxDelta = Math.max(Math.max(...lefts) - Math.min(...lefts), Math.max(...rights) - Math.min(...rights));
  }

  console.log(JSON.stringify(report, null, 2));
  return report;
})();
