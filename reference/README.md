# reference/ — 他人优秀小工具归档

收集梳理其他博主发布的优秀小工具，作为后期生成图文笔记的素材库。本目录为**参考资料**性质，与工作区四个自研顶层目录（`vibetool/`、`vibegame/`、`vibeart/`、`vibeknow/`）性质不同，不参与自研产出，仅作学习借鉴与素材留存。

## 目录结构

```
reference/
├── README.md                           # 本文件：总索引与规范说明
├── <博主名-工具名>/                    # 单个工具归档目录（扁平一级）
│   ├── README.md                       # 元信息：博主、原文链接、简介、亮点、技术栈
│   └── screenshots/                   # 截图目录
│       ├── cover.png                  # 封面图（必填，总索引与笔记封面取用）
│       └── *.png                      # 关键交互截图（按需多张）
└── vibecoding-gallery/                # 归档浏览工具（非参赛作品，本目录唯一含代码的目录）
```

## 命名规范

- 一级子目录命名格式：`<博主名-工具名>/`，博主名与工具名之间用单个连字符 `-`。
- 优先用**英文短名或拼音**作目录名，避免中文目录在 shell/git 中编码问题；博主中文原名在子目录 `README.md` 里记录原貌。
- 全小写，单词间用连字符，不用下划线或空格。
- 示例：`ding-offwork-heatmap/`、`laoma-password-manager/`、`aigc-emoji-mixer/`。

## 单工具 README 模板

每个 `<博主名-工具名>/README.md` 按以下结构填写：

```markdown
# <工具名>

- 博主：<博主中文原名 / 账号名>
- 原文链接：<小红书笔记 / GitHub / 博文 URL>
- 归档日期：YYYY-MM-DD
- 工具类型：<h5 / minitool / webapp / browser-extension / ...>
- 技术栈：<HTML+JS / React / Three.js / ...>

## 简介

<一句话说明工具做什么>

## 亮点

- <亮点 1>
- <亮点 2>
- <亮点 3>

## 截图

| 文件 | 说明 |
| --- | --- |
| screenshots/cover.png | 封面图 |
| screenshots/01-main.png | 主界面 |
| screenshots/02-interaction.png | 关键交互 |

## 备注

<可选：可借鉴点、待拆解问题、笔记选题方向等>
```

## 总索引

| 博主 | 工具名 | 类型 | 原文链接 | 亮点 | 归档日期 | 目录 |
| --- | --- | --- | --- | --- | --- | --- |
| 哲学咖啡师 | 我的户外烟花秀 | h5 | https://www.xiaohongshu.com/discovery/item/6aaeafa10000000028035c68?source=webshare&xhsshare=pc_web&xsec_token=ABASlAyw-oFk4DQ1E09kO4pGBCPEdt7uDgxP3uotmSgyI=&xsec_source=pc_share | 换城市/照片背景+手绘轮廓抠图+开关式烟花触发 | 2026-09-20 | zhexue-kafeishi-fireworks/ |
| 哲学咖啡师 | 掌上博物馆 | h5 | https://www.xiaohongshu.com/discovery/item/6aa680510000000027017115?source=webshare&xhsshare=pc_web&xsec_token=ABsDDQqKSCJ6ra2Jw8P6hzv0mMskfKsXFV1i5aJ8DZnx0=&xsec_source=pc_share | 3D 展品 360°旋转/缩放+编号部件导览+系列化连载（#vibetool 参赛） | 2026-09-20 | zhexue-kafeishi-pocket-museum/ |
| 猫哥 | 丝丝入扣（苏绣小工具） | h5 | https://www.xiaohongshu.com/discovery/item/6a8823880000000035026757?source=webshare&xhsshare=pc_web&xsec_token=ABjwmmtNGBw4T3KfDz7nGZAdLZOToZMB5YDH5zguCBhvc=&xsec_source=pc_share | 照片转苏绣针迹+飞针动画+针法密度参数化（GLM 5.3 生成） | 2026-09-20 | maoge-suxiu/ |
| 词元AI编程 | 极速漂移 SPEED DRIFT | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6a9e4a79000000001001cfbb?source=webshare&xhsshare=pc_web&xsec_token=ABjfgcEzSWOdluSkNocbyo4N5eb-Z6sM-xpWT2ujwxPXQ=&xsec_source=pc_share | 移动端 3D 漂移赛车+拖转/双指缩放入场动线+单点手感定位（#vibegame 参赛） | 2026-09-20 | ciyuan-ai-speed-drift/ |
| CarryTzz | 哆啦A梦的家·串门探险记 | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6aa27919000000000b001536?source=webshare&xhsshare=pc_web&xsec_token=ABFiDNjaWzftGW-0uFR5xOMtUdaeLQD8xbmnKrVjV8n8M=&xsec_source=pc_share | 3D 探索寻宝+能力解锁+道具解谜链+双层收集结构（#vibecoding大赛 参赛） | 2026-09-20 | carrytzz-doraemon-house/ |
| 倪的AI笔记 | 中国人能飞 | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6a8ec88d0000000028004e1d?source=webshare&xhsshare=pc_web&xsec_token=ABH92no4SUJ9uKAhFMk4qJj1-QeYASJDmF8mY6A5x-wFg=&xsec_source=pc_share | 像素风自动飞升攀高+单手双区操控+高度三件套HUD（#vibegame 参赛） | 2026-09-20 | nide-ai-fly/ |
| Way的AI创造社 | 跳吧小球 | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6aa56fe8000000002502e51a?source=webshare&xhsshare=pc_web&xsec_token=ABiV9qFHzzYiVTv08KCbyCv4O-Y9usH1NQ_saM593eE3k=&xsec_source=pc_share | 星标货币皮肤商店+成就系统+版本更新召回运营，玩家破38万（#vibegame 参赛） | 2026-09-20 | way-ai-jump-ball/ |
| 哈哈要去哪里 | 迷你飞行 | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6aabb29e000000002a004eaf?source=webshare&xhsshare=pc_web&xsec_token=ABPb7oRjzFejpo01O9T4uVvFJdc8GnR1x9g2I6U4XLODM=&xsec_source=pc_share | Q版 3D 模拟飞行+多机型阵容+海报级宣传图（#vibegame 参赛） | 2026-09-20 | haha-mini-flight/ |
| 左手 | 科目二挑战赛 | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6a964de100000000270080fe?source=webshare&xhsshare=pc_web&xsec_token=ABZs6wR8HZcFeuHtJqDOYFblF1dS7pzmheZDs_FUikkR0=&xsec_source=pc_share | 关卡制停车解谜+用时/擦撞/挪车三维结算+星级+科目二题材共鸣（#vibecoding 参赛） | 2026-09-20 | zuoshou-keer-parking/ |
| 星空下的人 | 挖掘机抓猪 | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6aad360500000000270160bf?source=webshare&xhsshare=pc_web&xsec_token=ABETpofYcFUKQ_zp2e1gqaLGkaDxFcGDsHWH7uRjo6Al4=&xsec_source=pc_share | 热梗题材+玩家反馈驱动改默认视角+听劝式迭代叙事+评论投票（#vibegame 参赛） | 2026-09-20 | xingkong-excavator-pig/ |
| 豆米AI | 下一个蓝点 | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6aaa7aa30000000026031dba?source=webshare&xhsshare=pc_web&xsec_token=AB9XjDaMmirGGm8W5Dc5rH1GkqfszYQJ_EplEG_4WQfGg=&xsec_source=pc_share | 三手势六阶段玩法+米到百万光年尺度尺HUD+真实系外行星结局+100KB零图片零音频（#vibegame 参赛） | 2026-09-20 | doumi-next-blue-dot/ |
| 机器旁白 | 编钟演奏·三十秒学会弹《晴天》 | h5 音乐工具 | https://www.xiaohongshu.com/discovery/item/6a969de6000000002800208c?source=webshare&xhsshare=pc_web&xsec_token=AB1omuMyMDrRAcOZGilD3vqXlNQfLL5gdHiOwFivPxaSw=&xsec_source=pc_share | 国乐编钟数字化（一钟双音/三层形制）+热门曲目嫁接+三十秒教学承诺（#vibecoding/#vibemusic 参赛，⚠️ 曲目版权仅作参考） | 2026-09-20 | jiqi-bianzhong-qingtian/ |
| 木渡川 | 文物放大镜·掌上赏珍 | h5 教程 / webapp | https://www.xiaohongshu.com/discovery/item/6aa226ad0000000011031465?source=webshare&xhsshare=pc_web&xsec_token=ABFiDNjaWzftGW-0uFR5xOMt_W-xOGTmZvHKhvK6HOdds=&xsec_source=pc_share | 3D 文物交互全流程教程+博物馆展签式版面+揭顶剖切/细节导览/图鉴导出完整观展动线（#国风vibecoding 参赛） | 2026-09-20 | muduchuan-relic-viewer/ |
| 阿毛的脑洞 | 捏捏乐 | h5 游戏 | https://www.xiaohongshu.com/discovery/item/6aa36e010000000026017522?source=webshare&xhsshare=pc_web&xsec_token=ABcTHjdkq5QNPXfFz4D5TzMsSOIjq2rFkuUGpO2Oi98f8=&xsec_source=pc_share | 实物捏捏乐数字化+摸鱼场景定位+八种捏捏SKU化更新+评论区征集新模型（#vibegame 参赛） | 2026-09-20 | amao-squeeze-toy/ |
| 闲话AI\|造物日记 | 月下寄笺局（月亮信） | h5 互动工具 | https://www.xiaohongshu.com/discovery/item/6a9c2c180000000026018fe2?source=webshare&xhsshare=pc_web&xsec_token=ABgyjiKnSj8-cKE2Iozok0qDqjOG9u-i57Z-4uXb7E3wo=&xsec_source=pc_share | 中秋节令情绪工具+「当面太浓烈微信怕唐突」痛点文案+「寄笺局」品牌化包装+可截图分享的个人化产出（#国风vibecoding 参赛） | 2026-09-20 | xianhua-moon-letter/ |
| Mingo 🥕 | bala bala（解压球球） | h5 互动工具 | https://www.xiaohongshu.com/discovery/item/6aae76ec0000000029019a9b?source=webshare&xhsshare=pc_web&xsec_token=ABdAl8pX503j3i3ttrJOJ4N7GEJLepe3-I3lEmRKEbSGQ=&xsec_source=pc_share | 戳/按/扒拉触觉解压+照片自定义球（老板球梗）+粉圈解锁密码专享彩蛋+桌面时钟陪伴形态（#vibetool 参赛） | 2026-09-20 | mingo-bala-bala/ |
| 生姜醋饭 | Piece of Moonlight（月相互动音乐） | h5 音乐工具 | https://www.xiaohongshu.com/discovery/item/6a9e7f0e0000000028035dd9?source=webshare&xhsshare=pc_web&xsec_token=ABRPKZVc37eJxffwd4-y1n57h5JKGNT8u0ZTmFUsA1tTs=&xsec_source=pc_share | 15 种月相映射 C3–C5 音高+短按半拍/长按长音实时落谱+播放月亮反色高亮跟随+7 音色 4 主题+月相谱卡可保存分享（#国风vibecoding/#vibeart 参赛，中秋·月亮节） | 2026-09-20 | piece-of-moonlight/ |

> 新增工具时在此表追加一行；目录列指向本目录下的子目录路径。

## 使用流程

1. 发现优秀工具 → 在 `reference/` 下新建 `<博主名-工具名>/` 目录。
2. 保存截图到 `screenshots/`，至少一张 `cover.png`。
3. 复制上方「单工具 README 模板」填写 `README.md`。
4. 回到本文件「总索引」表格追加一行。
5. 积累到一定数量后，从本索引中选品，基于截图与亮点撰写图文笔记（笔记产物放对应自研项目的 `xiaohongshu/` 目录，不放本目录）。

## 归档浏览工具（vibecoding-gallery/）

`vibecoding-gallery/` 把本目录归档的作品做成**复刻小红书信息流形态**的展示小工具：双列瀑布流 + 笔记详情页 + 扭蛋机「随机邂逅」彩蛋。
它**不是参赛作品**，不占四个赛道目录，也不在 `TRACKS.md` 的赛道清单里，只是归档数据的“浏览器”，所以放在这里与数据同生共死。

```bash
cd reference/vibecoding-gallery
python _dev/make_covers.py   # 归档截图有变时重跑：重生成 covers/ 与 covers-data.js
python _dev/build_zip.py     # 前置校验 → 构建 dist/ → 打包 vibecoding-gallery.zip
```

新增 / 更新归档后的同步顺序：本目录建 `<博主-工具>/` 与 `screenshots/cover.png` → 填子 `README.md` → 本文件总索引追加一行 →
`_dev/make_covers.py` 的 `ORDER` 加目录名并重跑 → `main.js` 的 `WORKS`（+`NOTES`）加一条 → `_dev/works_raw.json` 加一条 → 重新打包。
（`build_zip.py` 会把 `main.js` 的链接与 `works_raw.json` **逐字比对**，任何截断 / 改动都会直接拒绝打包。）

## 约定

- 本目录**只归档他人作品**，不放自研产出。
- **不存放源代码**：仅留截图与元信息，避免版权与仓库体积问题。如需拆解源码，另行 clone 到本地工作目录之外。
  - **唯一例外**：`vibecoding-gallery/`——它是浏览本目录归档的展示小工具，**不是参赛作品**；因为要跟着截图更新直接重跑构建，才与归档数据放在一起。详见 `vibecoding-gallery/README.md`（它不占 `vibetool/` 等赛道目录，也不在 `TRACKS.md` 的赛道清单里）。
- 截图优先保留**原图分辨率**，便于后期笔记裁切。
- 涉及商用/付费工具，在 `README.md` 里标注授权情况，截图仅作学习引用。
