# 功能走查：逐个打开 uni-app H5 页面，抓控制台报错 / 白屏，并截图
# 用法：python tools/smoke_walk.py
import asyncio
import json
import os
import urllib.request

from playwright.async_api import async_playwright

CHROME = r"C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
BASE = "http://localhost:5180"
HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "shots")
os.makedirs(SHOTS, exist_ok=True)


def first_bank_id():
    """从代理后的后端拿一个真实 bankId，供需要参数的页面使用"""
    try:
        with urllib.request.urlopen(BASE + "/api/banks", timeout=5) as r:
            banks = json.loads(r.read().decode("utf-8"))
        return banks[0]["id"] if banks else 1
    except Exception:
        return 1


async def main():
    bank_id = first_bank_id()
    print(f"使用 bankId={bank_id}\n")

    routes = [
        ("首页", f"/pages/index/index"),
        ("登录", f"/pages/login/login"),
        ("刷题(题库列表)", f"/pages/banks/banks"),
        ("统计", f"/pages/stats/stats"),
        ("我的", f"/pages/mine/mine"),
        ("错题本", f"/pages/wrong/wrong"),
        ("设置", f"/pages/setting/setting"),
        ("添加题库", f"/pages/bank-add/bank-add"),
        ("竞技场", f"/pages/arena/arena"),
        ("模考设置", f"/pages/exam-setup/exam-setup"),
        ("题库详情", f"/pages/bank-detail/bank-detail?id={bank_id}"),
        ("答题页", f"/pages/practice/practice?bankId={bank_id}"),
        ("手动录入", f"/pages/question-add/question-add?id={bank_id}"),
        ("练习总结", f"/pages/summary/summary?bankId={bank_id}"),
        ("模考进行中", f"/pages/exam-run/exam-run?bankId={bank_id}"),
        ("模考报告", f"/pages/exam-report/exam-report?bankId={bank_id}"),
    ]

    report = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME, headless=True)
        ctx = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()

        console_errors = []
        page_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: page_errors.append(str(e)))

        for name, path in routes:
            console_errors.clear()
            page_errors.clear()
            url = BASE + "/#" + path
            status = "OK"
            try:
                await page.goto(url, wait_until="networkidle", timeout=20000)
            except Exception as e:
                status = "GOTO_FAIL: " + str(e)[:80]
            await page.wait_for_timeout(1500)

            # 取可见文本长度，判断是否白屏
            try:
                text = await page.inner_text("body")
            except Exception:
                text = ""
            text_len = len(text.strip())

            shot = os.path.join(SHOTS, name.replace("/", "_") + ".png")
            try:
                await page.screenshot(path=shot, full_page=False)
            except Exception:
                shot = ""

            errs = list(console_errors) + list(page_errors)
            if text_len < 10:
                status = "白屏/无内容"
            elif errs:
                status = "有报错"

            report.append({
                "页面": name,
                "状态": status,
                "文本长度": text_len,
                "错误": errs[:3],
                "截图": shot,
            })
            print(f"[{status:^10}] {name:14} 文本{text_len:5}  {errs[:1]}")

        await browser.close()

    bad = [r for r in report if r["状态"] != "OK"]
    print(f"\n===== 汇总：{len(report)} 页，异常 {len(bad)} 页 =====")
    for r in bad:
        print(f"- {r['页面']}：{r['状态']}")
        for e in r["错误"]:
            print(f"    {e[:160]}")

    with open(os.path.join(HERE, "smoke_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n报告已写入 tools/smoke_report.json；截图在 tools/shots/")


if __name__ == "__main__":
    asyncio.run(main())
