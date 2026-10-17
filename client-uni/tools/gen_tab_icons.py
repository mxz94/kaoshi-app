# -*- coding: utf-8 -*-
"""生成 tabBar 图标：81x81，线性风格（viewBox 24 等比放大），激活态 = 蓝底圆角方块 + 白图形"""
from PIL import Image, ImageDraw
import os, math

OUT = r"D:\clean\2026-09-29-16-18-28\kaoshi-app\client-uni\src\static\tab"
os.makedirs(OUT, exist_ok=True)

S = 81
GRAY = (156, 163, 175, 255)   # #9CA3AF
BLUE = (47, 107, 255, 255)    # #2F6BFF
WHITE = (255, 255, 255, 255)
LW = 5  # 线宽（≈2 * 3.375）

def canvas():
    return Image.new("RGBA", (S, S), (0, 0, 0, 0))

def scale(pts):
    return [(x * S / 24.0, y * S / 24.0) for x, y in pts]

def draw_lines(d, pts, color, close=False):
    p = scale(pts)
    if close:
        d.line(p + [p[0]], fill=color, width=LW, joint="curve")
    else:
        d.line(p, fill=color, width=LW, joint="curve")
    # 圆端点
    r = LW / 2
    for pt in (p[0], p[-1]):
        d.ellipse([pt[0]-r, pt[1]-r, pt[0]+r, pt[1]+r], fill=color)

def draw_poly(d, pts, color):
    d.polygon(scale(pts), outline=color, width=LW)

def glyph_home(d, c):
    draw_lines(d, [(3,10.5),(12,3),(21,10.5)], c)
    draw_lines(d, [(5,9.5),(5,21),(19,21),(19,9.5)], c)
    draw_lines(d, [(10,21),(10,14),(14,14),(14,21)], c)

def glyph_edit(d, c):
    draw_lines(d, [(17,3),(21,7),(7,21),(3,21),(3,17),(17,3)], c)
    draw_lines(d, [(14.5,5.5),(18.5,9.5)], c)

def glyph_zap(d, c):
    draw_poly(d, [(13,2),(3,14),(12,14),(11,22),(21,10),(12,10)], c)

def glyph_chart(d, c):
    draw_lines(d, [(5,20),(5,12)], c)
    draw_lines(d, [(12,20),(12,4)], c)
    draw_lines(d, [(19,20),(19,9)], c)
    draw_lines(d, [(3,21),(21,21)], c)

def glyph_user(d, c):
    d.ellipse([8*S/24, 3*S/24, 16*S/24, 11*S/24], outline=c, width=LW)
    draw_lines(d, [(4,21),(4,20),(4.5,18),(6,16),(8.5,14.6),(12,14),(15.5,14.6),(18,16),(19.5,18),(20,20),(20,21)], c)

ICONS = {"home": glyph_home, "edit": glyph_edit, "zap": glyph_zap, "chart": glyph_chart, "user": glyph_user}

for name, fn in ICONS.items():
    # 普通态：灰线
    img = canvas(); fn(ImageDraw.Draw(img), GRAY)
    img.save(os.path.join(OUT, f"{name}.png"))
    # 激活态：蓝底圆角方块(68x68 居中) + 白图形（缩小到 76% 居中）
    img = canvas(); d = ImageDraw.Draw(img)
    d.rounded_rectangle([4, 4, S-4, S-4], radius=18, fill=BLUE)
    layer = canvas(); fn(ImageDraw.Draw(layer), WHITE)
    small = layer.resize((int(S*0.72), int(S*0.72)), Image.LANCZOS)
    off = (S - small.width) // 2
    img.alpha_composite(small, (off, off))
    img.save(os.path.join(OUT, f"{name}-active.png"))

print("generated:", sorted(os.listdir(OUT)))
