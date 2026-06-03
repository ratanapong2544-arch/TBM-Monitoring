# GAS Proxy Setup — move the Gemini key server-side

**Why:** `REACT_APP_GEMINI_KEY` in `.env` is an interim stopgap only. Create-React-App
bakes every `REACT_APP_*` value into the client bundle, so the key still ships to the
browser. The permanent fix is to proxy the Gemini call through the existing Google Apps
Script (GAS) backend, where the key lives in Script Properties and never reaches the client.

The client already talks to GAS via `apiCall(action, data)` (see `src/utils/api.js`), which
POSTs `{ action, data }` and `JSON.parse`s the response. We just add one new action.

---

## Step 1 — Rotate the key (mandatory)

The old key `AIza...dY5gU` is compromised (it was in source / git history / built bundles).
Rotate it in Google AI Studio / Cloud Console and use the **new** key everywhere below.

## Step 2 — Store the rotated key in Script Properties

In the Apps Script project (script.google.com → this project):
**Project Settings (gear) → Script Properties → Add script property**
- Property: `GEMINI_KEY`
- Value: *<your rotated key>*

## Step 3 — Add the `generateSummary` action to your existing `Code.gs`

Paste this function into the project's `Code.gs` (the file is managed online — it is not in
this repo):

```js
/**
 * generateSummary — server-side Gemini proxy.
 * Called from the client via apiCall('generateSummary', { promptText, systemText }).
 * Reads the key from Script Properties (GEMINI_KEY); it never reaches the browser.
 */
function generateSummary(data) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY');
  if (!apiKey) throw new Error('GEMINI_KEY is not set in Script Properties');

  var promptText = data && data.promptText;
  var systemText = (data && data.systemText) ||
    'คุณคือผู้ช่วยวิศวกรควบคุมงานก่อสร้างอุโมงค์ TBM หน้าที่ของคุณคือการนำข้อมูลดิบไปจัดเรียงและสรุปใส่ใน Template รายงานที่กำหนดให้อย่างถูกต้องและเป๊ะที่สุด';

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' +
    encodeURIComponent(apiKey.trim());
  var payload = {
    contents: [{ parts: [{ text: promptText }] }],
    systemInstruction: { parts: [{ text: systemText }] }
  };

  var delays = [1000, 2000, 4000];
  var lastErr;
  for (var i = 0; i < delays.length; i++) {
    try {
      var resp = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      var code = resp.getResponseCode();
      if (code !== 200) throw new Error('HTTP ' + code + ' - ' + resp.getContentText());
      var result = JSON.parse(resp.getContentText());
      var text = result.candidates && result.candidates[0] &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts[0] && result.candidates[0].content.parts[0].text;
      if (text) return { text: text };
      throw new Error('No text in response');
    } catch (err) {
      lastErr = err;
      if (i < delays.length - 1) Utilities.sleep(delays[i]);
    }
  }
  throw lastErr;
}
```

## Step 4 — Route the action in `doPost`

Your `doPost` already dispatches existing actions (data reads/writes work today). Add one case
so `action === 'generateSummary'` calls the function above. For reference, the shape is:

```js
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);   // { action, data }
    var result;
    switch (body.action) {
      // ... your existing cases ...
      case 'generateSummary':
        result = generateSummary(body.data);
        break;
      default:
        result = { error: 'Unknown action: ' + body.action };
    }
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

> Keep your real `doPost` intact — only **add** the `generateSummary` case. Match how your
> existing actions return data (the client `apiCall` already `JSON.parse`s the response, so
> returning a plain `{ text }` object is consistent with the actions that work today).

## Step 5 — Redeploy the web app

Apps Script editor → **Deploy → Manage deployments → (edit the active deployment) → Version:
New version → Deploy**. Keep access = **Anyone**. The `/exec` URL in
`src/utils/constants.js` stays the same.

## Step 6 — Switch the client to the GAS proxy

Replace `generateGeminiSummary` in `src/utils/api.js` with the version below (the
`(promptText, systemText)` signature is unchanged, so the two callers —
`DashboardHeaderActions.jsx` and `ReportView.jsx` — need no edits):

```js
export const generateGeminiSummary = async (promptText, systemText) => {
  const result = await apiCall('generateSummary', { promptText, systemText });
  if (result?.error) throw new Error(result.error);
  if (!result?.text) throw new Error('No text in response');
  return result.text;
};
```

Then remove `REACT_APP_GEMINI_KEY` from `.env` — the client no longer needs it. At this point
the key exists only in GAS Script Properties and never reaches the browser.

## Step 7 — Verify

Restart `npm start`, open a page with the **วิเคราะห์ AI** (Sparkles) button, and confirm the
summary still renders. In DevTools → Network there should be **no** request to
`generativelanguage.googleapis.com` from the browser — only the POST to the GAS `/exec` URL.
