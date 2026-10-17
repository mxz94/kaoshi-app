import asyncio
from playwright.async_api import async_playwright

CHROME = r'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'
BASE = 'http://localhost:5180'
out = []


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, headless=True)
        pg = await b.new_page(viewport={'width': 390, 'height': 844})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))

        # 1. 开启「答对后自动下一题」（直接写 storage，绕开 switch 组件定位）
        await pg.goto(BASE + '/#/pages/index/index', wait_until='networkidle', timeout=25000)
        await pg.wait_for_timeout(1200)
        await pg.evaluate("""() => {
            uni.setStorageSync('kaoshi_settings', { dailyGoal: 50, shuffleQuestions: false, autoNextQuestion: true });
        }""")
        await pg.wait_for_timeout(300)
        got = await pg.evaluate("() => JSON.stringify(uni.getStorageSync('kaoshi_settings'))")
        out.append('设置写入: %s' % got)

        # 2. 答题页：拿到正确选项
        await pg.goto(BASE + '/#/pages/practice/practice?bankId=10', wait_until='networkidle', timeout=25000)
        await pg.wait_for_timeout(1500)
        correct = await pg.evaluate("""async () => {
            const r = await fetch('/api/banks/10/questions'); const a = await r.json();
            const q = a.find(x => x.options.some(o => o.isCorrect));
            return { id: q.id, labels: q.options.filter(o => o.isCorrect).map(o => o.label) };
        }""")
        out.append('正确选项: %s' % correct['labels'])

        prog = await pg.locator('.topbar').inner_text()
        out.append('初始进度: %s' % prog.strip())

        # 3. 选正确项 → 确认 → 看是否自动跳下一题
        lbl = correct['labels'][0]
        opts = pg.locator('.opt')
        n = await opts.count()
        # 按 label 文本定位：选项结构为 .opt-label + .opt-content
        for i in range(n):
            t = (await opts.nth(i).inner_text()).strip()
            if t.startswith(lbl):
                await opts.nth(i).click()
                break
        await pg.wait_for_timeout(300)
        await pg.get_by_text('确认答案').click()
        await pg.wait_for_timeout(2400)  # 自动跳转延迟 1.2s
        prog2 = (await pg.locator('.topbar').inner_text()).strip()
        out.append('答对后进度: %s  (自动跳=%s)' % (prog2, prog2 != prog.strip()))

        # 4. 上一题 → 应为可修改态（出现「确认答案」按钮）
        await pg.get_by_text('上一题').click()
        await pg.wait_for_timeout(800)
        body = await pg.inner_text('body')
        prog3 = (await pg.locator('.topbar').inner_text()).strip()
        has_confirm = '确认答案' in body
        out.append('上一题后进度: %s | 可修改(有确认按钮)=%s' % (prog3, has_confirm))

        # 5. 改答案 → 确认 → 应显示「已修改」
        if has_confirm:
            opts = pg.locator('.opt')
            n = await opts.count()
            for i in range(n):
                t = (await opts.nth(i).inner_text()).strip()
                if not t.startswith(lbl):
                    await opts.nth(i).click()
                    break
            await pg.wait_for_timeout(300)
            await pg.get_by_text('确认答案').click()
            await pg.wait_for_timeout(1500)
            body2 = await pg.inner_text('body')
            out.append('改答案后含「已修改」: %s' % ('已修改' in body2))

        await pg.screenshot(path='tools/shots/答题-改答案验证.png')
        out.append('pageerror: %s' % (errs[:2] if errs else '无'))
        await b.close()

asyncio.run(main())
open('tools/shots/_verify_practice.txt', 'w', encoding='utf-8').write('\n'.join(out))
