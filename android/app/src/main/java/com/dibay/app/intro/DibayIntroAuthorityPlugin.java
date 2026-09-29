package com.dibay.app.intro;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "DibayIntroAuthority")
public class DibayIntroAuthorityPlugin extends Plugin {

  private DibayIntroAuthorityStore store() {
    return new DibayIntroAuthorityStore(getContext());
  }

  @PluginMethod
  public void getAuthorityStatus(PluginCall call) {
    try {
      JSONObject raw = store().getAuthorityStatus();
      call.resolve(JSObject.fromJSONObject(raw));
    } catch (Exception e) {
      call.reject("getAuthorityStatus_failed", e);
    }
  }

  @PluginMethod
  public void beginCandidate(PluginCall call) {
    try {
      String metaJson = call.getString("metaJson");
      if (metaJson == null || metaJson.isEmpty()) {
        call.reject("missing_metaJson");
        return;
      }
      store().beginCandidate(metaJson);
      JSObject o = new JSObject();
      o.put("ok", true);
      call.resolve(o);
    } catch (Exception e) {
      call.reject("beginCandidate_failed", e);
    }
  }

  @PluginMethod
  public void writeCandidatePack(PluginCall call) {
    try {
      String base64 = call.getString("base64");
      if (base64 == null) {
        call.reject("missing_base64");
        return;
      }
      store().writeCandidatePack(base64);
      JSObject o = new JSObject();
      o.put("ok", true);
      call.resolve(o);
    } catch (Exception e) {
      call.reject("writeCandidatePack_failed", e);
    }
  }

  @PluginMethod
  public void writeCandidateAsset(PluginCall call) {
    try {
      String path = call.getString("relativePackPath");
      String base64 = call.getString("base64");
      if (path == null || base64 == null) {
        call.reject("missing_args");
        return;
      }
      store().writeCandidateAsset(path, base64);
      JSObject o = new JSObject();
      o.put("ok", true);
      call.resolve(o);
    } catch (Exception e) {
      call.reject("writeCandidateAsset_failed", e);
    }
  }

  @PluginMethod
  public void markCandidateFailed(PluginCall call) {
    try {
      String metaJson = call.getString("metaJson", "{}");
      String failureCode = call.getString("failureCode", "FAILED");
      store().markCandidateFailed(metaJson, failureCode);
      JSObject o = new JSObject();
      o.put("ok", true);
      call.resolve(o);
    } catch (Exception e) {
      call.reject("markCandidateFailed_failed", e);
    }
  }

  @PluginMethod
  public void promoteCandidateToReady(PluginCall call) {
    try {
      String metaJson = call.getString("metaJson");
      if (metaJson == null) {
        call.reject("missing_metaJson");
        return;
      }
      store().promoteCandidateToReady(metaJson);
      JSObject o = new JSObject();
      o.put("ok", true);
      call.resolve(o);
    } catch (Exception e) {
      call.reject("promoteCandidateToReady_failed", e);
    }
  }

  @PluginMethod
  public void assertFontAuthority(PluginCall call) {
    try {
      DibayIntroAuthorityStore.FontCheck check = store().assertFonts();
      JSObject o = new JSObject();
      o.put("ok", check.ok);
      JSArray missing = new JSArray();
      for (String m : check.missing) missing.put(m);
      o.put("missing", missing);
      call.resolve(o);
    } catch (Exception e) {
      call.reject("assertFontAuthority_failed", e);
    }
  }

  @PluginMethod
  public void recordNoLiveMarker(PluginCall call) {
    try {
      String kind = call.getString("physicalLiveKind", "NO_LIVE_INTRO");
      store().recordNoLiveMarker(kind);
      JSObject o = new JSObject();
      o.put("ok", true);
      call.resolve(o);
    } catch (Exception e) {
      call.reject("recordNoLiveMarker_failed", e);
    }
  }

  @PluginMethod
  public void clearNoLiveMarker(PluginCall call) {
    try {
      store().clearNoLiveMarker();
      JSObject o = new JSObject();
      o.put("ok", true);
      call.resolve(o);
    } catch (Exception e) {
      call.reject("clearNoLiveMarker_failed", e);
    }
  }
}
