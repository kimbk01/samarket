package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.dibay.app.DibayStartupFaultPolicy.FaultAction;
import com.dibay.app.DibayStartupFaultPolicy.Verdict;
import org.junit.Test;

/** C1 — 시작 화면 고장 판정 (D1: 정상 시작 무발동 · 자동 재시도 상한 · 통화 경로 자동 재로드 금지). */
public class DibayStartupFaultPolicyTest {

  @Test
  public void releasedIsAlwaysDone() {
    assertEquals(Verdict.DONE, DibayStartupFaultPolicy.judge(true, 999_999L, 999_999L));
    assertEquals(Verdict.DONE, DibayStartupFaultPolicy.judge(true, 0L, -1L));
  }

  @Test
  public void healthyStartNeverFaults() {
    // 운영 계측 최악값(해제 8.2s, React 5.3s)보다 오래 걸려도 각 한도 안이면 WAIT.
    assertEquals(Verdict.WAIT, DibayStartupFaultPolicy.judge(false, 7_999L, -1L));
    assertEquals(Verdict.WAIT, DibayStartupFaultPolicy.judge(false, 30_000L, 14_999L));
  }

  @Test
  public void noJsAfterDocFinishedFaults() {
    assertEquals(Verdict.FAULT_NO_JS, DibayStartupFaultPolicy.judge(false, 8_000L, -1L));
  }

  @Test
  public void jsRunningButNoReleaseFaults() {
    assertEquals(Verdict.FAULT_NOT_RELEASED, DibayStartupFaultPolicy.judge(false, 20_000L, 15_000L));
  }

  @Test
  public void autoReloadOnlyOnceThenErrorScreen() {
    assertEquals(FaultAction.RELOAD_ONCE, DibayStartupFaultPolicy.onFault(0, false));
    assertEquals(FaultAction.SHOW_ERROR, DibayStartupFaultPolicy.onFault(1, false));
    assertEquals(FaultAction.SHOW_ERROR, DibayStartupFaultPolicy.onFault(5, false));
  }

  @Test
  public void callRouteNeverAutoReloads() {
    assertEquals(FaultAction.SHOW_ERROR, DibayStartupFaultPolicy.onFault(0, true));
    assertTrue(DibayStartupFaultPolicy.isCallRouteUrl("https://samarket.vercel.app/community-messenger/calls/abc"));
    assertTrue(DibayStartupFaultPolicy.isCallRouteUrl("/calls-v4/x"));
    assertFalse(DibayStartupFaultPolicy.isCallRouteUrl("https://samarket.vercel.app/philife"));
    assertFalse(DibayStartupFaultPolicy.isCallRouteUrl(null));
  }

  @Test
  public void reasonCarriesHttpStatusForErrorDocuments() {
    assertEquals("HTTP_429", DibayStartupFaultPolicy.faultReason(Verdict.FAULT_NO_JS, 429));
    assertEquals("HTTP_401", DibayStartupFaultPolicy.faultReason(Verdict.FAULT_NOT_RELEASED, 401));
    assertEquals("WEB_NOT_READY", DibayStartupFaultPolicy.faultReason(Verdict.FAULT_NO_JS, 0));
    assertEquals("WEB_NOT_RELEASED", DibayStartupFaultPolicy.faultReason(Verdict.FAULT_NOT_RELEASED, 200));
  }

  @Test
  public void sslOnlyForMainDocument() {
    String main = "https://samarket.vercel.app/philife";
    assertTrue(DibayStartupFaultPolicy.isSameDocumentUrl("https://samarket.vercel.app/philife#x", main));
    assertFalse(DibayStartupFaultPolicy.isSameDocumentUrl("https://cdn.example.com/a.png", main));
    assertFalse(DibayStartupFaultPolicy.isSameDocumentUrl(null, main));
  }
}
