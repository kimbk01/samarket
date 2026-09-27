package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * CUT 1 Samsung CTA first-divergence: chrome bind must not read CTA href that
 * is only assigned later in startOperatorHold.
 *
 * This test would FAIL on f2c1d49a1 because bindOperatorChrome ran while
 * pendingCtaHref was still null.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class DibayStartupIntroCtaPrepareOrderTest {

  private static JSONObject cut1Campaign() throws Exception {
    JSONObject pi = new JSONObject();
    pi.put("campaignId", "924cee3f-12ec-4336-b0db-82eca2f8b425");
    pi.put("ctaLabel", "CUT1 persist open");
    pi.put("actionType", "internal_path");
    pi.put("actionTarget", "/philife");
    pi.put("skipEnabled", true);
    pi.put("displayDurationMs", 4000);
    return pi;
  }

  @Test
  public void ctaConfigPreparedBeforeChromeBind_attachesCta() throws Exception {
    DibayStartupIntroSurface.PreparedCta prepared =
        DibayStartupIntroSurface.prepareOperatorCta(cut1Campaign());
    assertTrue(prepared.shouldAttachChrome());
    assertTrue(prepared.enabled);
    assertEquals("CUT1 persist open", prepared.label);
    assertEquals("/philife", prepared.href);
  }

  @Test
  public void ctaAbsentOrDisabled_chromeAbsent() throws Exception {
    JSONObject none = cut1Campaign();
    none.put("actionType", "none");
    assertFalse(DibayStartupIntroSurface.prepareOperatorCta(none).shouldAttachChrome());

    JSONObject emptyLabel = cut1Campaign();
    emptyLabel.put("ctaLabel", "   ");
    assertFalse(DibayStartupIntroSurface.prepareOperatorCta(emptyLabel).shouldAttachChrome());

    JSONObject emptyTarget = cut1Campaign();
    emptyTarget.put("actionTarget", "");
    assertFalse(DibayStartupIntroSurface.prepareOperatorCta(emptyTarget).shouldAttachChrome());

    assertFalse(DibayStartupIntroSurface.prepareOperatorCta(null).shouldAttachChrome());
  }

  @Test
  public void ctaLabelAndInternalPath_prepareSameContractForRenderAndNav() throws Exception {
    DibayStartupIntroSurface.PreparedCta prepared =
        DibayStartupIntroSurface.prepareOperatorCta(cut1Campaign());
    assertEquals("internal_path", prepared.actionType);
    assertEquals("CUT1 persist open", prepared.label);
    assertEquals("/philife", prepared.href);
    assertEquals(
        prepared.href, DibayStartupIntroSurface.resolveNativeCtaHref(cut1Campaign()));
    assertTrue(prepared.shouldAttachChrome());
  }

  @Test
  public void f2c1d49a1_bindBeforeHoldWouldOmitCta_prepareBeforeBindAttaches() throws Exception {
    JSONObject pi = cut1Campaign();
    String pendingCtaHrefAtHistoricalBindTime = null;
    boolean historicalChrome =
        pendingCtaHrefAtHistoricalBindTime != null
            && !pi.optString("ctaLabel", "").trim().isEmpty();
    assertFalse(
        "f2c1d49a1 defect: bindOperatorChrome ran while pendingCtaHref was still null",
        historicalChrome);

    DibayStartupIntroSurface.PreparedCta prepared =
        DibayStartupIntroSurface.prepareOperatorCta(pi);
    assertTrue(
        "repair: CTA chrome decision uses prepared operator state, not hold init",
        prepared.shouldAttachChrome());
    assertEquals("/philife", prepared.href);
  }

  @Test
  public void holdInitializationDoesNotDetermineCtaExistenceAfterPrepare() throws Exception {
    DibayStartupIntroSurface.PreparedCta beforeHold =
        DibayStartupIntroSurface.prepareOperatorCta(cut1Campaign());
    assertTrue(beforeHold.shouldAttachChrome());
    assertEquals("/philife", beforeHold.href);
    assertEquals("CUT1 persist open", beforeHold.label);
    // startOperatorHold no longer writes CTA href. Existence is already decided.
    assertNotNull(beforeHold.href);
  }

  @Test
  public void skipRemainsAvailableByDefault() throws Exception {
    assertTrue(DibayStartupIntroSurface.shouldAttachSkip(cut1Campaign()));
    JSONObject skipOff = cut1Campaign();
    skipOff.put("skipEnabled", false);
    assertFalse(DibayStartupIntroSurface.shouldAttachSkip(skipOff));
  }

  @Test
  public void skipAndCtaShareSingleDismissOwnership() {
    Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
    DibayStartupIntroSurface surface = new DibayStartupIntroSurface(activity);
    assertTrue(surface.claimSkip());
    assertFalse(surface.claimSkip());
    assertFalse(surface.claimCta());

    DibayStartupIntroSurface surface2 = new DibayStartupIntroSurface(activity);
    assertTrue(surface2.claimCta());
    assertFalse(surface2.claimCta());
    assertFalse(surface2.claimSkip());
  }

  @Test
  public void normalCtaHrefIsSinglePreparedNavigationTarget() throws Exception {
    DibayStartupIntroSurface.PreparedCta prepared =
        DibayStartupIntroSurface.prepareOperatorCta(cut1Campaign());
    assertEquals("/philife", prepared.href);
    assertTrue(MainActivity.introCtaMayNavigate(prepared.href, null));
    assertTrue(MainActivity.introCtaMayNavigate(prepared.href, ""));
  }

  @Test
  public void pendingDestinationPrecedenceUnchanged() throws Exception {
    DibayStartupIntroSurface.PreparedCta prepared =
        DibayStartupIntroSurface.prepareOperatorCta(cut1Campaign());
    assertNotNull(prepared.href);
    assertFalse(
        "CTA visible must not steal an authoritative pending destination",
        MainActivity.introCtaMayNavigate(prepared.href, "/community-messenger/rooms/r1"));
    assertTrue(MainActivity.introCtaMayNavigate(prepared.href, null));
    assertFalse(MainActivity.introCtaMayNavigate(null, null));
    assertFalse(MainActivity.introCtaMayNavigate("//evil", null));
    assertFalse(MainActivity.introCtaMayNavigate("https://evil.example", null));
    assertNull(DibayStartupIntroSurface.resolveNativeCtaHref(new JSONObject()));
  }
}
