/**
 * C2 — hydration 전 청크 실패 초기 가드 (docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md §4 C2 · R1-e).
 *
 * 문제: 앱 번들·초기 청크가 실패하면 React 가 마운트되지 않아 `AppBootProvider` 의 청크 처리기와 셸 해제가 모두 없다
 * → OS 시작 화면(녹색 로고)에 갇힌다.
 *
 * 계약 (루트 `<head>` 인라인, 모듈 import 없음):
 * - React 마운트(`__dibayBootMetrics.reactMounted`) 전에만 동작. 마운트 후에는 기존 처리기가 맡는다.
 * - 감지: `/_next/static/` 스크립트·스타일시트 로드 실패, ChunkLoadError 류 오류·거부.
 * - 같은 빌드(webSha)에서 새로고침은 **1회만** (sessionStorage). 같은 빌드로 다시 실패하면 새로고침해도 소용없으므로
 *   정적 오류 안내 + 「다시 시도」(실제 새로고침) 를 그리고 시작 화면을 해제한다. 무한 자동 새로고침 없음.
 * - 타이머 없음 (D1). 해제는 기존 브리지 이름만 사용 → 설치된 구 네이티브 바이너리와 호환.
 * - 계측(C8): 실패 1건 송신, 새로고침 시 다음 문서가 `after_reload` 로 회복 여부를 남기도록 같은 세션 키를 쓴다.
 * - JS 가 아예 실행되지 않는 경우(오프라인·평문 5xx·HTML 미도착)는 웹으로 해결할 수 없다 → 네이티브 C1·C7.
 */

import {
  ENTRY_TELEMETRY_ENDPOINT,
  ENTRY_TELEMETRY_SCHEMA_VERSION,
} from "@/lib/telemetry/entry-telemetry-contract";

/** 새로고침을 시도한 빌드 SHA — 같은 빌드로 두 번 새로고침하지 않는다. */
export const PRE_HYDRATION_GUARD_RELOADED_SHA_KEY = "dibay:boot-guard:reloaded-sha";
/** C8 계측 세션 키 (entry-telemetry.client.ts 와 동일해야 함 — 계약 테스트로 고정). */
export const ENTRY_TELEMETRY_RECOVERY_KEY = "dibay:entry-telemetry:pending-recovery";
export const ENTRY_TELEMETRY_RELOADS_KEY = "dibay:entry-telemetry:chunk-reloads";

function safeSha(raw: string | undefined | null): string {
  const s = String(raw ?? "").trim().toLowerCase();
  return /^[0-9a-f]{4,40}$/.test(s) ? s : "dev";
}

/**
 * `<script dangerouslySetInnerHTML>` 에 넣을 문자열. 서버 렌더 시 1회 생성.
 * ES5 문법만 사용 (오래된 WebView 에서도 파싱되어야 가드가 의미 있다).
 */
export function buildPreHydrationGuardScript(webShaRaw: string | undefined | null): string {
  const sha = safeSha(webShaRaw);
  const cfg = JSON.stringify({
    sha,
    key: PRE_HYDRATION_GUARD_RELOADED_SHA_KEY,
    recoveryKey: ENTRY_TELEMETRY_RECOVERY_KEY,
    reloadsKey: ENTRY_TELEMETRY_RELOADS_KEY,
    endpoint: ENTRY_TELEMETRY_ENDPOINT,
    v: ENTRY_TELEMETRY_SCHEMA_VERSION,
  });
  return `(function(){try{
var C=${cfg};var done=false;
function mounted(){var m=window.__dibayBootMetrics;return !!(m&&m.reactMounted!=null);}
function isChunk(s){return /ChunkLoadError|Loading chunk|Failed to load chunk|dynamically imported module/i.test(String(s||""));}
function ss(k,v){try{if(v===undefined)return sessionStorage.getItem(k);sessionStorage.setItem(k,v);return v;}catch(e){return null;}}
function platform(){try{var p=window.Capacitor&&window.Capacitor.getPlatform&&window.Capacitor.getPlatform();return p==="android"||p==="ios"?p:"web";}catch(e){return "web";}}
function rid(){var s="";for(var i=0;i<32;i++)s+=Math.floor(Math.random()*16).toString(16);return s;}
function beacon(){try{var n=performance&&performance.now?Math.round(performance.now()):0;var b=JSON.stringify({v:C.v,run:rid(),seq:1,kind:"cold",ev:"failure",platform:platform(),webSha:C.sha==="dev"?null:C.sha.slice(0,7),failure:"pre_hydration_chunk",recovery:"none",reloads:Number(ss(C.reloadsKey)||0)||0,ageMs:n,visible:document.visibilityState==="visible",t:{}});if(navigator.sendBeacon&&navigator.sendBeacon(C.endpoint,new Blob([b],{type:"text/plain"})))return;if(window.fetch)fetch(C.endpoint,{method:"POST",body:b,keepalive:true,credentials:"omit",headers:{"content-type":"text/plain"}})["catch"](function(){});}catch(e){}}
function release(){try{var b=window.DibayBootBridge;if(b&&b.dismissSplash)b.dismissSplash();}catch(e){}try{if(window.__dibayNativeSplashDismiss)window.__dibayNativeSplashDismiss();}catch(e){}try{var w=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.DibayBootBridge;if(w&&w.postMessage){var p=function(){try{w.postMessage({action:"dismissSplash"});}catch(e){}};if(window.requestAnimationFrame)requestAnimationFrame(function(){requestAnimationFrame(p);});else p();}}catch(e){}}
function showError(){var en=document.documentElement&&document.documentElement.lang==="en";var mount=function(){try{if(document.getElementById("dibay-boot-guard-error"))return;var host=document.body||document.documentElement;var d=document.createElement("div");d.id="dibay-boot-guard-error";d.setAttribute("role","alert");d.style.cssText="position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;background:#FFFCFC;font-family:system-ui,-apple-system,'Noto Sans KR','Apple SD Gothic Neo',sans-serif";var t=document.createElement("p");t.style.cssText="margin:0;font-size:15px;font-weight:600;color:#362415";t.textContent=en?"Something went wrong while loading the app":"앱을 불러오는 중 문제가 발생했어요";var s=document.createElement("p");s.style.cssText="margin:8px 0 0;font-size:13px;color:#604C4C";s.textContent=en?"Please try again in a moment.":"잠시 후 다시 시도해 주세요.";var btn=document.createElement("button");btn.type="button";btn.style.cssText="margin-top:32px;padding:10px 24px;border-radius:4px;border:none;background:#0B421A;color:#FFFCFC;font-size:14px;font-weight:500;cursor:pointer";btn.textContent=en?"Try again":"다시 시도";btn.onclick=function(){location.reload();};var box=document.createElement("div");box.appendChild(t);box.appendChild(s);box.appendChild(btn);d.appendChild(box);host.appendChild(d);}catch(e){}release();};if(document.body)mount();else document.addEventListener("DOMContentLoaded",mount);}
function fail(){if(done||mounted())return;done=true;beacon();var prev=ss(C.key);var stored=ss(C.key,C.sha);if(stored!==null&&prev!==C.sha){ss(C.recoveryKey,"pre_hydration_chunk");ss(C.reloadsKey,String((Number(ss(C.reloadsKey)||0)||0)+1));location.reload();return;}showError();}
window.addEventListener("error",function(e){try{var el=e&&e.target;if(el&&el!==window&&el.tagName){var tag=el.tagName;var u="";if(tag==="SCRIPT")u=el.src||"";else if(tag==="LINK"&&String(el.rel||"").toLowerCase()==="stylesheet")u=el.href||"";if(u.indexOf("/_next/static/")>=0)fail();return;}if(isChunk(e&&e.message))fail();}catch(x){}},true);
window.addEventListener("unhandledrejection",function(e){try{var r=e&&e.reason;if(r&&(r.name==="ChunkLoadError"||isChunk(r.message)))fail();}catch(x){}});
}catch(e){}})();`;
}
