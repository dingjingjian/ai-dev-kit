from PIL import Image
import sys
sys.stdout.reconfigure(encoding="utf-8")
im = Image.open(r"C:\Users\dingj\Documents\git\ai-dev-kit\vibegame\perler-city\_dev\shots\util-demand2.png").convert("RGB")
# deviceScaleFactor=2, CSS px * 2 = pixel
# 发展需求住宅 bar: CSS y=803.25 h=6 x=13 w=364; fill y=803.25 h=6 x=177.875 w=109.1875
# 市政电力 mbar: CSS y=507.25 h=7 x=13 w=364; fill y=508.25 h=5 x=14 w=362
def crop(tag, cy, ch, cx=13, cw=364):
    px0, py0 = int(cx*2)-4, int(cy*2)-20
    px1, py1 = int((cx+cw)*2)+4, int((cy+ch)*2)+20
    c = im.crop((px0, py0, px1, py1))
    c = c.resize((c.width*4, c.height*4), Image.NEAREST)
    c.save(rf"C:\Users\dingj\Documents\git\ai-dev-kit\vibegame\perler-city\_dev\shots\crop_{tag}.png")
    print(f"{tag}: CSS y={cy} h={ch} -> 像素 crop {(px0,py0,px1,py1)} 放大4x")
crop("udm_house", 803.25, 6)
crop("res_power", 507.25, 7)
# 再 dump 每一行像素的颜色，看 fill 区垂直分布
def dumprows(tag, cy, ch, cx=13, cw=364):
    print(f"\n=== {tag} CSS y={cy} h={ch} ===")
    px0, py0 = int(cx*2), int(cy*2)
    px1, py1 = int((cx+cw)*2), int((cy+ch)*2)
    pix = im.load()
    for y in range(py0-2, py1+2):
        # 取 bar 中间 x 处的颜色（避开 fill 边缘），以及 fill 区颜色
        midbar_x = (px0+px1)//2
        # 找这一行最亮的非背景色
        row = [pix[x, y] for x in range(px0, px1, 8)]
        # 分类: 深背景(max<60) / 绿色(g>120 and r<120) / 亮色
        greens = sum(1 for r,g,b in row if g>120 and r<150 and b<150)
        darks = sum(1 for r,g,b in row if max(r,g,b)<60)
        sample = pix[midbar_x, y]
        print(f"  y={y} (CSS≈{(y-py0)/2:+.1f}): midbar={sample} greens={greens} darks={darks}")
dumprows("udm_house", 803.25, 6)
dumprows("res_power", 507.25, 7)
