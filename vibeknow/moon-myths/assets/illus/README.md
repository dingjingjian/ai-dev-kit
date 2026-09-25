# 神话配图目录

本目录放 14 张神话卡片配图，**图未生成时卡片显示程序化占位**，所以可以一张一张慢慢补。

## 文件清单（文件名即 `myths.js` 里 `img` 字段指向的文件）

| # | 文明·神话 | 文件名 |
|---|-----------|--------|
| 01 | 中国·嫦娥奔月 | `china-change.webp` |
| 02 | 日本·辉夜姬 | `japan-kaguya.webp` |
| 03 | 印度·月神苏摩 | `india-soma.webp` |
| 04 | 苏美尔·南纳 | `sumer-nanna.webp` |
| 05 | 埃及·孔苏 | `egypt-khonsu.webp` |
| 06 | 希腊·塞勒涅 | `greece-selene.webp` |
| 07 | 北欧·玛尼 | `norse-mani.webp` |
| 08 | 凯尔特·布里吉德 | `celtic-brigid.webp` |
| 09 | 斯拉夫·月亮沙皇 | `slavic-moon-tsar.webp` |
| 10 | 阿兹特克·科约尔沙乌基 | `aztec-coyolxauhqui.webp` |
| 11 | 因纽特·阿宁安 | `inuit-annigan.webp` |
| 12 | 波利尼西亚·马乌伊 | `polynesia-maui.webp` |
| 13 | 班图·恩库伦库鲁 | `bantu-unkulunkulu.webp` |
| 14 | 澳洲原住民·恩加利恩迪 | `aboriginal-ngalindi.webp` |

## 规格

- 1080×360（约 3:1 横幅），主体居中，左右留约 10%、上下留约 12% 安全边
- WebP（质量 78 左右），单张 ≤90KB，14 张合计 ≤1.2MB
- 深靛蓝 + 月白 + 暖金三色，月色为唯一主光源，无文字、无签名、无水印

## 落位

```bash
ffmpeg -i in.png -vf scale=1080:360 -q:v 78 -y assets/illus/<slug>.webp
node pack.mjs   # 放图后重新打包
```

统一风格前缀、逐条提示词、红线与验收标准见 [`../../docs/配图提示词.md`](../../docs/配图提示词.md)。
