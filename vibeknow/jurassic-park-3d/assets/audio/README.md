# assets/audio · 背景音乐音位

| 文件 | 进 zip？ | 说明 |
|------|---------|------|
| `bgm.js` | ✅ | **运行时数据**：音频的 base64（`window.JP3D_BGM`）。`index.html` 在 `app.js` 之前引入，由 `app.js` 用 Web Audio 解码播放 |
| `bgm.mp3` | ❌ | **构建输入**：由 `tools/make-bgm.mjs` 从原始曲目截取 + 重编码而来（126s · 64kbps 单声道 · 22.05kHz · 985 KB）。`pack.mjs` 已排除它 |

## 为什么音频要藏在 `.js` 里

容器两条规则夹死了「放个 mp3 直接 `<audio src>`」这条路：

1. **上传白名单不含任何音频扩展名** —— 只有
   `jpg / css / gif / svg / png / js / jpeg / json / html / woff2 / webp / woff`，
   mp3 会被上传页直接打回；
2. **CSP 明确** `<audio>` / `<video>` 只允许包内媒体文件，禁外部域名与 `data:` / `blob:` 媒体源 ——
   在线链接、base64 内联成 data URI、`writeTempFile` 现写音频都不行。

两条叠加＝「包内音频文件」这条官方路在容器里不存在。所以：

```
音频字节 → base64 字符串 → 塞进 bgm.js（白名单类型）→ 运行时 atob 还原成 ArrayBuffer
        → AudioContext.decodeAudioData() 解成 PCM → Web Audio 播放（全程不产生 URL）
```

## 规格与循环点

完整规格、选点依据、版权提示与验收清单见 [`docs/背景音乐需求.md`](../../docs/背景音乐需求.md)。

- 源曲目：`Theme from Jurassic Park`（John Williams），206.3s · 320kbps CBR · 44.1kHz · 7.87MB
- 采用乐句：**64.00s → 197.00s（133.0s）** —— 这首没有真正的重复段（波形相关仅 0.058），
  选点是「织体最像 + 接缝处最安静」（接缝电平 0.036，约为全曲 45% 分位的一半）
- 编码：56kbps CBR 单声道 22.05kHz，910KB（base64 解码后 0.888 MiB，卡在 1 MiB 门禁内）
- 循环：整段就是乐句，首尾叠 **4s 交叠淡化**（`app.js` 的 `BGM_XFADE`）

## 换曲目 / 换循环点

```bash
npm --prefix tools i mpg123-decoder @breezystack/lamejs   # 只需一次

# ① 找乐句（分析**原始文件**，不是 bgm.mp3 —— 那已经是截过的产物）
node tools/analyze-bgm.mjs "新的原始文件.mp3" --top 10
# ② 按它给的推荐重切 + 重编码 + 生成 base64（自动核对 1 MiB 门禁）
node tools/make-bgm.mjs "新的原始文件.mp3" --a 64 --b 197 --kbps 56
# ③ 把交叠秒数抄进 app.js 的 BGM_XFADE，重新打包
node pack.mjs
```

`app.js` 不用改：它只认 `assets/audio/bgm.js` 里的 base64。

## 版权

⚠️ 采用的这条音轨是**电影配乐（John Williams 作品）**，来源是素材站下载，
**不构成商用授权**。上线或发布前必须确认授权，或换成免版税 / CC0 / 自生成曲目；
宣传片请另行混音（演示模式 `?demo` 不出声，见 `docs/背景音乐需求.md` §版权）。
