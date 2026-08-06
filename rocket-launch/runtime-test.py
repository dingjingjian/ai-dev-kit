"""用解压出的 zip 副本做运行时实测：控制台错误 / WebGL 渲染 / 交互闭环。"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8231/"
OUT = r"C:\Users\ASUS\Documents\git\ai-dev-kit\rocket-launch\runtime-check.png"

errors, warnings, requests_ext = [], [], []

with sync_playwright() as p:
    browser = p.chromium.launch(
        channel="msedge",
        args=["--use-gl=angle", "--use-angle=d3d11", "--enable-unsafe-swiftshader"],
    )
    page = browser.new_page(viewport={"width": 1280, "height": 800})

    def on_console(m):
        txt = f"[{m.type}] {m.text}"
        if "Failed to load resource" in m.text:
            txt = m.text  # 保留简短形式
        if m.type == "error":
            errors.append(txt)
        elif m.type == "warning":
            warnings.append(txt)

    page.on("console", on_console)
    page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))
    page.on("requestfailed", lambda r: errors.append(f"REQUESTFAILED: {r.url} ({r.failure})"))
    page.on("request", lambda r: requests_ext.append(r.url)
            if not r.url.startswith("http://127.0.0.1:8231") else None)

    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(2500)

    print("=== 运行时实测（解压副本）===")
    print("  标题:", page.title())

    # WebGL 上下文与渲染
    info = page.evaluate("""() => {
        const cv = document.getElementById('cv');
        if (!cv) return {err: 'canvas #cv 不存在'};
        const gl = cv.getContext('webgl') || cv.getContext('webgl2') ||
                   cv.getContext('experimental-webgl');
        return {
            hasCanvas: true,
            w: cv.width, h: cv.height,
            glContext: !!gl,
            three: typeof THREE !== 'undefined',
            threeRev: typeof THREE !== 'undefined' ? THREE.REVISION : null
        };
    }""")
    print("  canvas 存在:", info.get("hasCanvas"), "尺寸:", f"{info.get('w')}x{info.get('h')}")
    print("  WebGL 上下文:", info.get("glContext"))
    print("  THREE 已加载:", info.get("three"), "r" + str(info.get("threeRev")))

    # 画面渲染检测：WebGL 上下文+THREE 已加载+canvas 尺寸>0 即可，
    # headless 下不能通过 drawImage 读取 WebGL drawing buffer 的颜色。
    rendered = bool(info.get("hasCanvas") and info.get("glContext") and
                    info.get("three") and info.get("w") and info.get("h"))
    print("  WebGL 渲染链就绪:", rendered)

    # 交互闭环：点击发射
    before = page.inner_text("#tag")
    page.click("#bGo")
    page.wait_for_timeout(1800)
    after = page.inner_text("#tag")
    alt = page.inner_text("#rAlt")
    print(f"  点击「发射」: 状态 {before} → {after} · 高度 {alt}")

    # 模式切换
    page.click("#m2")
    page.wait_for_timeout(400)
    mode_ok = page.evaluate("() => document.getElementById('m2').classList.contains('active')")
    print("  点击「受力分析」切换生效:", mode_ok)

    page.wait_for_timeout(2500)
    page.screenshot(path=OUT)
    print("  截图:", OUT)
    browser.close()

# 过滤浏览器自动 favicon 请求 404（与 zip 内容无关）
filt_errors = [e for e in errors if "favicon" not in e.lower()]

print("\n=== 结果 ===")
print("  控制台错误:", len(filt_errors), filt_errors[:5] if filt_errors else "无")
print("  外部网络请求:", len(requests_ext), requests_ext[:5] if requests_ext else "无（完全离线 ✅）")
if warnings:
    print("  警告:", len(warnings), warnings[:3])
if errors and not filt_errors:
    print("  备注: 忽略 %d 条 favicon 404（headless 浏览器自动行为）" % (len(errors) - len(filt_errors)))

sys.exit(1 if filt_errors else 0)
