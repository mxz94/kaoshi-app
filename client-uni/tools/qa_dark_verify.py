# -*- coding: utf-8 -*-
"""独立验证：H5 深色主题逐页渲染实测（背景色 / 文字对比度 / console error）。"""
import json
import os
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8899/h5/"
CHROME = r"C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
SHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "qa-shots")
os.makedirs(SHOT_DIR, exist_ok=True)

ROUTES = [
    "pages/index/index",
    "pages/banks/banks",
    "pages/arena/arena",
    "pages/arena-room/arena-room",
    "pages/stats/stats",
    "pages/mine/mine",
    "pages/bank-detail/bank-detail",
    "pages/practice/practice",
    "pages/summary/summary",
    "pages/bank-add/bank-add",
    "pages/question-add/question-add",
    "pages/wrong/wrong",
    "pages/setting/setting",
    "pages/agreement/agreement",
    "pages/login/login",
    "pages/exam-setup/exam-setup",
    "pages/exam-run/exam-run",
    "pages/exam-report/exam-report",
    "pages/migrate/migrate",
    "pages/import/import",
    "pages/favorite/favorite",
    "pages/about/about",
]

# 在页面内执行的测量脚本
MEASURE_JS = r"""
() => {
  function parseColor(c) {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(s => parseFloat(s.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function effBg(el) {
    let e = el;
    while (e && e !== document.documentElement) {
      const c = parseColor(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0.5) return c;
      e = e.parentElement;
    }
    const c = parseColor(getComputedStyle(document.body).backgroundColor);
    return c || { r: 255, g: 255, b: 255, a: 1 };
  }
  function lum(c) {
    const f = v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b);
  }
  function contrast(fg, bg) {
    const L1 = lum(fg), L2 = lum(bg);
    const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  }
  function hex(c) {
    const h = n => Math.round(n).toString(16).padStart(2, '0');
    return '#' + h(c.r) + h(c.g) + h(c.b);
  }
  const body = document.querySelector('uni-page-body') || document.body;
  const bodyBg = effBg(body);
  const htmlBg = parseColor(getComputedStyle(document.documentElement).backgroundColor);
  const docBg = parseColor(getComputedStyle(document.body).backgroundColor);

  // 抽取有可见文字的元素
  const out = [];
  const els = document.querySelectorAll('uni-page-body uni-text, uni-page-body uni-button, uni-page-body uni-view');
  const seen = new Set();
  for (const el of els) {
    const txt = (el.innerText || '').trim();
    if (!txt) continue;
    const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(el);
    const fg = parseColor(cs.color);
    if (!fg) continue;
    const fs = parseFloat(cs.fontSize);
    const fw = parseInt(cs.fontWeight) || 400;
    const bg = effBg(el);
    const cr = contrast(fg, bg);
    const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    const key = txt + '|' + cs.color + '|' + Math.round(fs);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      text: txt.slice(0, 24), color: hex(fg), bg: hex(bg),
      fontSize: fs, bold: fw >= 700, contrast: Math.round(cr * 100) / 100,
      large: large, pass: cr >= (large ? 3.0 : 4.5)
    });
  }
  return {
    bodyBg: hex(bodyBg), htmlBg: htmlBg ? hex(htmlBg) : null,
    docBg: docBg ? hex(docBg) : null,
    samples: out.sort((a, b) => a.contrast - b.contrast).slice(0, 6)
  };
}
"""


def main():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, headless=True)
        for route in ROUTES:
            url = BASE + "#/" + route
            page = browser.new_page(viewport={"width": 390, "height": 844})
            errors, pageerrors = [], []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: pageerrors.append(str(e)))
            rec = {"url": url}
            try:
                page.goto(url, wait_until="networkidle", timeout=20000)
                page.wait_for_timeout(800)
                rec["measure"] = page.evaluate(MEASURE_JS)
                safe = route.replace("/", "_")
                page.screenshot(path=os.path.join(SHOT_DIR, safe + ".png"), full_page=True)
            except Exception as e:
                rec["error"] = str(e)
            rec["console_errors"] = errors
            rec["page_errors"] = pageerrors
            results[route] = rec
            m = rec.get("measure", {})
            print(f"[{route}] bodyBg={m.get('bodyBg')} htmlBg={m.get('htmlBg')} "
                  f"docBg={m.get('docBg')} consErr={len(errors)} pageErr={len(pageerrors)}")
            for s in m.get("samples", []):
                flag = "OK " if s["pass"] else "LOW"
                print(f"      {flag} cr={s['contrast']:>5} fg={s['color']} bg={s['bg']} "
                      f"fs={s['fontSize']} bold={s['bold']} '{s['text']}'")
            for e in errors[:4]:
                print("      CONSOLE-ERR:", e[:200])
            for e in pageerrors[:4]:
                print("      PAGE-ERR:", e[:200])
            page.close()
        browser.close()
    with open(os.path.join(SHOT_DIR, "results.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print("\nSaved:", os.path.join(SHOT_DIR, "results.json"))


if __name__ == "__main__":
    main()
