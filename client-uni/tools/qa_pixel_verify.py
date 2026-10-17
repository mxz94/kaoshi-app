# -*- coding: utf-8 -*-
"""复测 + 像素口径对比度：btn-primary 禁用态（import 用 button 修复版；另 6 页用 view+opacity）。"""
import json, os
from playwright.sync_api import sync_playwright
from PIL import Image
from collections import Counter

BASE = "http://127.0.0.1:8899/h5/"
CHROME = r"C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "qa-shots")
os.makedirs(OUT, exist_ok=True)

TARGETS = [
    ("import", "pages/import/import", ".btn-primary"),
    ("bank-add", "pages/bank-add/bank-add", ".btn-primary"),
    ("exam-setup", "pages/exam-setup/exam-setup", ".btn-primary"),
    ("login", "pages/login/login", ".btn-primary"),
    ("migrate", "pages/migrate/migrate", ".btn-primary"),
    ("practice", "pages/practice/practice", ".btn-primary"),
    ("question-add", "pages/question-add/question-add", ".btn-primary"),
]


def lum(c):
    f = lambda v: (v / 255) / 12.92 if (v / 255) <= 0.03928 else (((v / 255) + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


def contrast(a, b):
    L1, L2 = lum(a), lum(b)
    hi, lo = max(L1, L2), min(L1, L2)
    return round((hi + 0.05) / (lo + 0.05), 2)


def pixel_measure(path):
    """百分位法：忽略外圈 2px（圆角/页面底），bg=中位亮度像素色，fg=98 分位亮度像素色（文字为亮色）。"""
    im = Image.open(path).convert("RGB")
    W, H = im.size
    px = im.load()
    pts = []
    for y in range(2, H - 2):
        for x in range(2, W - 2):
            pts.append(px[x, y])
    pts.sort(key=lum)
    n = len(pts)
    bg = pts[n // 2]
    fg = pts[min(n - 1, int(n * 0.98))]
    # 次亮簇参考（99.5 分位），确认 98 分位已落在文字主体
    fg99 = pts[min(n - 1, int(n * 0.995))]
    return {"size": (W, H), "bg": bg, "fg": fg, "fg99": fg99,
            "contrast": contrast(fg, bg), "contrast_fg99": contrast(fg99, bg)}


def main():
    out = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, headless=True)
        for key, route, sel in TARGETS:
            pg = b.new_page(viewport={"width": 390, "height": 844})
            rec = {"page": key, "route": route}
            try:
                pg.goto(BASE + "#/" + route, wait_until="networkidle", timeout=20000)
                pg.wait_for_timeout(900)
                el = pg.query_selector(sel)
                if not el:
                    # 注入 class 方式：直接测全局 .btn-primary.disabled 规则（App.vue 非 scoped，全局生效）
                    pg.evaluate("""() => {
                        const body = document.querySelector('uni-page-body') || document.body;
                        const v = document.createElement('uni-view');
                        v.className = 'btn-primary disabled';
                        v.textContent = '确认';
                        v.id = '__qa_injected_btn';
                        v.style.width = '324px'; v.style.height = '48px';
                        v.style.lineHeight = '48px'; v.style.textAlign = 'center';
                        v.style.margin = '24px';
                        body.appendChild(v);
                    }""")
                    pg.wait_for_timeout(300)
                    el = pg.query_selector("#__qa_injected_btn")
                    rec["injected"] = True
                if not el:
                    rec["error"] = "no .btn-primary element (and injection failed)"
                else:
                    cls = el.get_attribute("class") or ""
                    cs = pg.evaluate("""(el) => { const c = getComputedStyle(el);
                        return {color:c.color, backgroundColor:c.backgroundColor, backgroundImage:c.backgroundImage,
                        opacity:c.opacity, boxShadow:c.boxShadow, fontSize:c.fontSize, fontWeight:c.fontWeight}; }""", el)
                    rec["class"] = cls
                    rec["disabled"] = ("disabled" in cls.split()) or el.get_attribute("disabled") is not None
                    rec["computed"] = cs
                    # computed-style 口径：文字色 vs 自身背景色（若有）叠加页面底
                    rec["computed_contrast_note"] = "computed color vs backgroundColor（含 opacity 计算前）"
                    shot = os.path.join(OUT, f"pixel-{key}-btn.png")
                    el.screenshot(path=shot)
                    rec["shot"] = shot
                    rec["pixel"] = pixel_measure(shot)
            except Exception as e:
                rec["error"] = str(e)
            out.append(rec)
            pg.close()
        b.close()
    with open(os.path.join(OUT, "pixel-results.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    lines = []
    lines.append(f"{'page':13s} {'inj':4s} {'disabled':8s} {'computed color':20s} {'backgroundColor':18s} {'bgImg':6s} {'opacity':7s} {'pixelBg':16s} {'pixelFg(99.5%)':16s} {'CR':6s} {'PASS'}")
    for r in out:
        if r.get("error") and "computed" not in r:
            lines.append(f"{r['page']:13s} ERROR: {r['error']}")
            continue
        c = r.get("computed", {})
        pxm = r.get("pixel", {})
        bghex = pxm.get("bg"); fghex = pxm.get("fg99"); cr = pxm.get("contrast_fg99")
        lines.append(f"{r['page']:13s} {str(r.get('injected', False)):4s} {str(r.get('disabled')):8s} {c.get('color',''):20s} {c.get('backgroundColor',''):18s} "
                     f"{('yes' if c.get('backgroundImage','none')!='none' else 'no'):6s} {c.get('opacity',''):7s} "
                     f"{str(bghex):16s} {str(fghex):16s} {str(cr):6s} {'OK' if (cr or 0)>=4.5 else 'FAIL'}")
    txt = "\n".join(lines)
    with open(os.path.join(OUT, "pixel-summary.txt"), "w", encoding="utf-8") as f:
        f.write(txt)
    print(txt)


if __name__ == "__main__":
    main()
