# -*- coding: utf-8 -*-
"""定向排查：import 页禁用按钮浅色、index 页 404 资源。"""
import os
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8899/h5/"
CHROME = r"C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "qa-shots")
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, headless=True)

    # --- import 页 ---
    pg = b.new_page(viewport={"width": 390, "height": 844})
    reqfail = []
    pg.on("requestfailed", lambda r: reqfail.append((r.url, r.failure)))
    resp404 = []
    pg.on("response", lambda r: resp404.append((r.status, r.url)) if r.status >= 400 else None)
    pg.goto(BASE + "#/pages/import/import", wait_until="networkidle", timeout=20000)
    pg.wait_for_timeout(800)
    info = pg.evaluate(r"""
    () => {
      const out = [];
      document.querySelectorAll('uni-button, button').forEach(el => {
        const cs = getComputedStyle(el);
        out.push({
          tag: el.tagName, cls: el.className, disabled: el.hasAttribute('disabled'),
          text: (el.innerText || '').trim().slice(0, 20),
          color: cs.color, backgroundColor: cs.backgroundColor, backgroundImage: cs.backgroundImage.slice(0, 60),
          opacity: cs.opacity
        });
      });
      return out;
    }
    """)
    print("=== import.vue 按钮实测 ===")
    for i in info:
        print("  ", i)
    # 截图禁用按钮
    el = pg.query_selector("uni-button.btn-primary") or pg.query_selector("button.btn-primary")
    if el:
        el.screenshot(path=os.path.join(OUT, "import-btn-primary-crop.png"))
        print("  btn-primary box:", el.bounding_box())
    pg.screenshot(path=os.path.join(OUT, "import-zoom.png"), full_page=True)
    print("  404 responses:", resp404)
    pg.close()

    # --- index 页 探测 404 ---
    pg2 = b.new_page(viewport={"width": 390, "height": 844})
    r404 = []
    pg2.on("response", lambda r: r404.append((r.status, r.url)) if r.status >= 400 else None)
    fails = []
    pg2.on("requestfailed", lambda r: fails.append((r.url, r.failure)))
    pg2.goto(BASE + "#/pages/index/index", wait_until="networkidle", timeout=20000)
    pg2.wait_for_timeout(1000)
    print("=== index 页 >=400 响应 ===")
    for x in r404:
        print("  ", x)
    print("=== index 页 requestfailed ===")
    for x in fails:
        print("  ", x[0], x[1])
    pg2.close()
    b.close()
