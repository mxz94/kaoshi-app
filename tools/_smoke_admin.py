# 后台页面冒烟：登录 → 大盘 → 题库 → 题目列表 → 返回
# 依赖本机 playwright（venv）+ chromium-1228
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3400"
CHROME = r"C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, headless=True)
        pg = b.new_page(viewport={"width": 1280, "height": 900})
        errors = []
        pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        pg.on("console", lambda m: errors.append("console." + m.type + ": " + m.text)
              if m.type == "error" else None)

        pg.goto(BASE + "/admin/", wait_until="networkidle")
        assert pg.locator("#lgUser").count() == 1, "登录页未渲染"

        # 错误密码：应显示提示且不进入
        pg.fill("#lgUser", "admin")
        pg.fill("#lgPass", "wrong-pwd")
        pg.click("#lgBtn")
        pg.wait_for_timeout(800)
        assert "错误" in pg.inner_text("#lgErr"), "错误密码未提示"
        assert pg.locator("#appView").is_hidden(), "错误密码却进入了主界面"

        # 正确密码
        pg.fill("#lgPass", "qq67607301")
        pg.click("#lgBtn")
        pg.wait_for_selector("#appView", state="visible", timeout=8000)
        pg.wait_for_timeout(1200)

        stats = pg.inner_text("#stats")
        assert "题库数" in stats and "总正确率" in stats, "大盘卡片未渲染: " + stats[:80]
        print("大盘卡片 OK:", " / ".join(stats.split("\n")[:6]))

        # 切到题库管理
        pg.click('.tab[data-view="banks"]')
        pg.wait_for_selector("#bankTable tbody tr", timeout=8000)
        rows = pg.locator("#bankTable tbody tr").count()
        print("题库行数:", rows)
        assert rows >= 1, "题库表为空"

        # 进题目列表
        pg.locator('#bankTable tbody tr button[data-act="qs"]').first.click()
        pg.wait_for_selector("#qListPane", state="visible", timeout=8000)
        pg.wait_for_timeout(1200)
        qcount = pg.inner_text("#qCount")
        print("题目统计:", qcount)

        # 打开编辑弹窗（若有题）
        edit_btns = pg.locator("#qList button[data-edit]")
        if edit_btns.count() > 0:
            edit_btns.first.click()
            pg.wait_for_selector("#qStem", timeout=8000)
            print("编辑弹窗 OK，题干长度:", len(pg.input_value("#qStem")))
            pg.click("#qCancel")
            pg.wait_for_timeout(300)

        # 返回题库
        pg.click("#backToBanks")
        pg.wait_for_selector("#bankListPane", state="visible", timeout=5000)
        print("返回题库 OK")

        # 刷新后凭 token 免登录
        pg.reload(wait_until="networkidle")
        pg.wait_for_timeout(1500)
        assert pg.locator("#appView").is_visible(), "刷新后未保持登录"
        assert pg.locator("#loginView").is_hidden(), "刷新后又回到登录页"
        print("刷新保持登录 OK")

        b.close()
        # 401 是「故意输错密码」用例产生的，属预期；其余错误都要暴露
        real = [e for e in errors if "401" not in e]
        if errors:
            print("\n（含预期的 401 登录失败提示）原始错误：")
            for e in errors[:10]:
                print(" -", e)
        if real:
            raise SystemExit(1)
        print("\nSMOKE_OK")

main()
