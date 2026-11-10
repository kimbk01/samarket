package com.dibay.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 메신저 연락처 동기화 — 휴대폰 연락처 읽기 (SSOT docs/design/messenger-contacts-sync-plan.md v5 §6-3).
 * 읽기 전용: 연락처 ID · 이름 · 전화번호만 돌려준다. 이름은 웹이 기기 안 화면 표시에만 쓰고 서버로 보내지 않는다.
 * 통화·푸시·인증 코드와 연결 없음.
 */
@CapacitorPlugin(
  name = "DibayContacts",
  permissions = { @Permission(strings = { Manifest.permission.READ_CONTACTS }, alias = DibayContactsPlugin.ALIAS) }
)
public class DibayContactsPlugin extends Plugin {

  static final String ALIAS = "contacts";

  private String stateString() {
    PermissionState s = getPermissionState(ALIAS);
    if (s == PermissionState.GRANTED) return "granted";
    if (s == PermissionState.DENIED) return "denied";
    return "prompt";
  }

  @PluginMethod
  public void checkPermission(PluginCall call) {
    JSObject r = new JSObject();
    r.put("state", stateString());
    call.resolve(r);
  }

  @PluginMethod
  public void requestPermission(PluginCall call) {
    if (getPermissionState(ALIAS) == PermissionState.GRANTED) {
      checkPermission(call);
      return;
    }
    requestPermissionForAlias(ALIAS, call, "contactsPermissionCallback");
  }

  @PermissionCallback
  private void contactsPermissionCallback(PluginCall call) {
    checkPermission(call);
  }

  @PluginMethod
  public void readPhoneContacts(PluginCall call) {
    if (getPermissionState(ALIAS) != PermissionState.GRANTED) {
      call.reject("permission_denied");
      return;
    }
    getBridge().execute(() -> {
      Map<String, JSObject> byId = new LinkedHashMap<>();
      Map<String, JSArray> numbersById = new LinkedHashMap<>();
      ContentResolver resolver = getContext().getContentResolver();
      String[] projection = new String[] {
        ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
        ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
        ContactsContract.CommonDataKinds.Phone.NUMBER,
      };
      try (Cursor c = resolver.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, projection, null, null, null)) {
        if (c != null) {
          int idIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID);
          int nameIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
          int numIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
          while (c.moveToNext()) {
            String id = idIdx >= 0 ? c.getString(idIdx) : null;
            String number = numIdx >= 0 ? c.getString(numIdx) : null;
            if (id == null || number == null || number.trim().isEmpty()) continue;
            if (!byId.containsKey(id)) {
              JSObject o = new JSObject();
              o.put("id", id);
              String name = nameIdx >= 0 ? c.getString(nameIdx) : null;
              o.put("name", name == null ? "" : name);
              byId.put(id, o);
              numbersById.put(id, new JSArray());
            }
            JSArray nums = numbersById.get(id);
            if (nums != null) nums.put(number);
          }
        }
      } catch (RuntimeException e) {
        call.reject("read_failed");
        return;
      }
      JSArray out = new JSArray();
      for (Map.Entry<String, JSObject> e : byId.entrySet()) {
        JSObject o = e.getValue();
        o.put("numbers", numbersById.get(e.getKey()));
        out.put(o);
      }
      JSObject r = new JSObject();
      r.put("contacts", out);
      call.resolve(r);
    });
  }

  @PluginMethod
  public void openAppSettings(PluginCall call) {
    try {
      Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
      intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(intent);
    } catch (RuntimeException ignored) {
      // 설정 화면을 못 열어도 앱 동작에는 영향 없음
    }
    call.resolve();
  }
}
