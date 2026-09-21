# assets/audio/ —— 背景音乐

| 文件 | 角色 | 进 zip 吗 |
|------|------|-----------|
| `bgm.js` | **运行时资源**：`window.AOS3D_BGM` = base64 音频，由 `app.js` 交给 Web Audio 解码播放 | ✅ 进 |
| `bgm.mp3` | **构建输入**：源曲目（158.1s / MPEG-2 Layer III / 22.05kHz / 80kbps CBR / 无 ID3） | ❌ 不进（`pack.mjs` 的 excludes） |
| `README.md` | 本文件（容器不支持 `.md`） | ❌ 不进 |

## 为什么是「base64 藏进 .js」而不是一个 mp3

容器**上传白名单只有** `jpg / css / gif / svg / png / js / jpeg / json / html / woff2 / webp / woff`
—— **没有任何音频扩展名**，`bgm.mp3` 会被上传页直接打回；而容器 CSP 又明确
「音视频 `<video>` / `<audio>` 只允许包内媒体文件，禁外部域名与 `data:` / `blob:` 媒体源」。
文档里那句「音视频播放 支持内联播放」实际只对**用户自己选中的媒体 / 内存对象**有意义，
**包内音频文件这条路在容器里不存在**。

所以音频只能以字符串形式藏在白名单类型（`.js`）里，运行时：

```
bgm.js(window.AOS3D_BGM) → atob → ArrayBuffer → AudioContext.decodeAudioData()
                        → AudioBufferSourceNode + GainNode 播放
```

全程**不产生任何 URL**，因此不触碰 CSP 的资源加载规则。详见 `assets/app.js` 的「背景音乐」段。

## 改曲目 / 改长度

```bash
# 1. 换掉源曲目（保持文件名 assets/audio/bgm.mp3）
# 2. 重新生成 base64 产物
node tools/make-bgm.mjs                 # 默认：按 MPEG 帧边界裁到 base64 解码后 ≤ 1MiB
node tools/make-bgm.mjs --frames 3872   # 指定保留帧数（当前值，= 101.15s）
node tools/make-bgm.mjs --all           # 不裁，全曲（会超 base64 门禁，能上传但违反规范）
```

`tools/make-bgm.mjs` 会打印门禁核对表。**帧级裁剪不重编码**：保留下来的音频与源文件逐字节一致，
音质零损失，只是变短。

## 两条硬约束

1. **单条 Base64 解码后 ≤ 1 MiB**（`performance-budget.md` §1）。源曲目 1.51MB 超标，
   所以默认裁到 101.15s / 988KB（0.96MiB）。这条规则的常规补救办法是"改成独立包内文件"——
   而容器不收音频文件，所以补救办法不存在，只能靠裁长度。
2. **循环接缝**。源曲目不是为无缝循环做的：把整段首尾相接（曲头 0s 对裁剪点 101.15s）
   的包络相似度只有 0.730、波形相关 0.069，直接 `loop` 会在接缝上撞出一个强拍。
   所以 `app.js` 循环的**不是整段音频**，而是曲子内部**一段 60 小节的完整乐句**
   （`BGM_A` 19.54s → `BGM_B` 97.56s）：这两处波形相关 **0.554**、最佳时移仅 **−1ms**，
   即本来就是同一段音乐的重复，交叠时两遍同相；再叠 1.300s（整 1 小节）交叉淡化。
   选点由 `tools/analyze-bgm.mjs` 给出（判据：织体相似 + 接缝安静 + 整小节 + 波形互相关）。

## 待确认

- ⚠️ **版权**：`bgm.mp3` 没有任何 ID3 标签（没有曲名 / 艺术家 / 版权字段），无从自证来源。
  上线前请确认授权（免版税 / CC0 / 已购商用 / 自生成）。
