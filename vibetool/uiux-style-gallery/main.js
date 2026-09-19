(function(){
"use strict";

var STYLES = [
  /* ===================== 通用 General ===================== */
  {
    id:1, cat:"general", name:"极简瑞士风", en:"Minimalism & Swiss Style",
    desc:"大留白、高对比、网格对齐、无装饰",
    intro:"起源于 1950 年代瑞士的国际主义平面设计，强调「内容即设计」。以严格的网格系统、克制的留白、无衬线字体和极高的对比度为核心，剥离一切非必要装饰。信息层级靠排版而非视觉花活建立。",
    prompt:"Design a minimalist interface using Swiss style principles. Use: strict 12-column grid, generous white space, sans-serif typography (Helvetica/Inter), high contrast black on white, no shadows or gradients, geometric alignment, content-driven hierarchy. Keep only essential elements.",
    colors:[
      {hex:"#000000",name:"纯黑"},
      {hex:"#FFFFFF",name:"纯白"},
      {hex:"#F5F1E8",name:"米色"},
      {hex:"#808080",name:"中灰"}
    ],
    goodFor:"企业应用、仪表板、文档站、SaaS 平台、专业工具",
    badFor:"创意作品集、娱乐产品、趣味品牌、艺术实验",
    demoHtml:'<div class="d1"><div class="sq"></div><div><div class="tag">INTERNATIONAL</div><div class="big">网格·留白</div></div><div class="row3"><span>01</span><span>02</span><span>03</span></div></div>'
  },
  {
    id:2, cat:"general", name:"新拟态", en:"Neumorphism",
    desc:"软硬阴影、凸起凹陷、低对比灰",
    intro:"用同色系的双向光影模拟物理凹凸，元素看似从背景「长」出来，柔和无边界。是拟物与扁平之间的中庸之道，主打柔和沉浸，但需谨慎保证可读性对比。",
    prompt:"Design a neumorphism UI. Use: same-color background and elements, dual soft shadows (light top-left, dark bottom-right) for extruded look, inset shadows for pressed states, low-contrast muted palette. Avoid high-saturation colors. Ensure sufficient text contrast for accessibility.",
    colors:[
      {hex:"#E8ECF2",name:"雾灰"},
      {hex:"#5C6B80",name:"石蓝灰"},
      {hex:"#96A3B6",name:"浅雾"},
      {hex:"#FFFFFF",name:"高光白"}
    ],
    goodFor:"音乐播放器、智能家居面板、健康类 App、柔和氛围产品",
    badFor:"数据密集后台、需要强对比的文档、无障碍要求高的政务场景",
    demoHtml:'<div class="d2"><div class="pad">Soft</div><div class="in">Inset</div><div class="rnd">●</div><div class="bar"><i></i></div></div>'
  },
  {
    id:3, cat:"general", name:"毛玻璃", en:"Glassmorphism",
    desc:"半透明、背景模糊、层次感、柔和边框",
    intro:"通过 backdrop-filter 模糊背景营造「毛玻璃」质感，半透明卡片叠加在丰富渐变或图片之上，配合细边框和柔和阴影形成纵深层次。视觉轻盈但不失高级感，是 Apple 风格的标志元素之一。",
    prompt:"Design a glassmorphism UI. Use: semi-transparent cards (rgba with 0.4-0.7 alpha), backdrop-filter: blur(16px), layered over a vibrant gradient or image background, thin 1px light borders, subtle inner highlights, frosted glass effect. Ensure readable text contrast on glass surfaces.",
    colors:[
      {hex:"#0080FF",name:"电光蓝"},
      {hex:"#FF6B9D",name:"粉红"},
      {hex:"#7B5BFF",name:"紫罗兰"},
      {hex:"#FFFFFF",name:"透白"}
    ],
    goodFor:"音乐/创意应用、卡片式仪表板、Apple 风格生态、视觉优先的落地页",
    badFor:"高密度数据表格、需要极致性能的页面、低端安卓设备（blur 性能差）",
    demoHtml:'<div class="d3"><div class="glass"><div class="t">Glass Card</div><div class="l"></div><div class="l"></div></div></div>'
  },
  {
    id:4, cat:"general", name:"粗野主义", en:"Brutalism",
    desc:"大字号衬线、生硬黑块、原始排版",
    intro:"网页版的「清水混凝土」：放弃圆角与渐变，用巨大衬线标题、生硬色块和原始网格表达力量感与诚实。它不讨好，却以原始的真实感在精致设计中脱颖而出。",
    prompt:"Design a brutalist web UI. Use: huge serif display type, raw black blocks, no rounded corners, no gradients, harsh grid, high contrast, visible structure. Embrace an unfinished, honest, anti-decoration aesthetic.",
    colors:[
      {hex:"#FFFFFF",name:"纸白"},
      {hex:"#000000",name:"纯黑"},
      {hex:"#111111",name:"近黑"},
      {hex:"#888888",name:"灰"}
    ],
    goodFor:"独立媒体、个人主页、艺术家作品集、反主流品牌",
    badFor:"企业 SaaS、电商、需要亲和力的消费产品",
    demoHtml:'<div class="d4"><div class="h">RAW<br>POWER</div><div class="row"><div class="blk"></div><div class="txt">破坏精致<br>回归粗粝</div></div><div class="lnk">了解更多 →</div></div>'
  },
  {
    id:5, cat:"general", name:"3D 超写实", en:"3D Hyperrealism",
    desc:"逼真光影、体积感、拟真材质",
    intro:"用 CSS 3D 变换与多重内外阴影模拟真实物体的体积与材质，强调高光反射与落地投影，营造可「拿起」的拟真质感，让平面界面拥有物理重量。",
    prompt:"Design a 3D hyperrealistic UI element. Use: CSS 3D transforms, layered inner and drop shadows for volume, specular highlights, realistic material gradients, soft contact shadow on the floor. Make the object feel physically present.",
    colors:[
      {hex:"#2A2F45",name:"深空蓝"},
      {hex:"#8FA8FF",name:"亮蓝"},
      {hex:"#3B2A7A",name:"紫调"},
      {hex:"#0D1020",name:"近黑"}
    ],
    goodFor:"产品展示、游戏 UI、奖励动效、科技发布会",
    badFor:"阅读密集页、低性能设备、极简文档",
    demoHtml:'<div class="d5"><div class="cube"></div><div class="floor"></div></div>'
  },
  {
    id:6, cat:"general", name:"活力色块", en:"Vibrant Color Blocks",
    desc:"撞色大色块、网格拼贴、年轻感",
    intro:"用高饱和的大色块在网格中拼贴，靠撞色制造视觉活力。信息被「塞」进色块，适合年轻化品牌、活动页与需要一眼抓住注意力的场景。",
    prompt:"Design a vibrant color-block UI. Use: large high-saturation color blocks in a grid, clashing complementary colors (pink/orange/blue), bold white labels, generous gaps. Maximize visual energy and youthfulness.",
    colors:[
      {hex:"#FF4D6D",name:"玫红"},
      {hex:"#FFB703",name:"暖橙"},
      {hex:"#3A86FF",name:"亮蓝"},
      {hex:"#FFFFFF",name:"白"}
    ],
    goodFor:"活动页、年轻品牌、教育产品、内容社区封面",
    badFor:"金融/医疗严肃场景、极简文档、低饱和偏好品牌",
    demoHtml:'<div class="d6"><div class="k a">活力<small>VIBE</small></div><div class="k b">橙</div><div class="k c">蓝</div></div>'
  },
  {
    id:7, cat:"general", name:"深色模式 OLED", en:"Dark Mode (OLED)",
    desc:"纯黑底、高对比、省电护眼、霓虹点缀",
    intro:"专为 OLED 屏幕优化，使用纯黑（#000000）背景让像素完全关闭以省电。高对比白字配合少量饱和点缀色（绿/蓝/紫）形成科技感。长时间使用更护眼，是开发者工具和内容消费应用的主流选择。",
    prompt:"Design an OLED-optimized dark mode UI. Use: pure #000000 background, high contrast white (#FFF) text, sparingly use saturated accent colors (green/blue/purple) for highlights and status, avoid gray backgrounds that waste OLED pixels, ensure WCAG AA contrast. Ideal for code editors and media apps.",
    colors:[
      {hex:"#000000",name:"纯黑"},
      {hex:"#FFFFFF",name:"纯白"},
      {hex:"#30D158",name:"霓虹绿"},
      {hex:"#1C1C1E",name:"深灰"}
    ],
    goodFor:"代码编辑器、媒体/视频应用、夜间使用场景、开发者社区",
    badFor:"打印输出、儿童产品、需要长时间阅读文字的学术场景",
    demoHtml:'<div class="d7"><div><div class="k">USAGE</div><div class="v"><b>68</b>%</div></div><div class="bar"><i></i></div></div>'
  },
  {
    id:8, cat:"general", name:"无障碍优先", en:"Accessibility-First",
    desc:"高对比、清晰焦点、可读优先",
    intro:"以 WCAG 为底线，强调高对比文字、清晰可见的焦点环与大号可点区域，让所有人（含视障/运动障碍）都能顺畅使用。无障碍不是附加项，而是设计的起点。",
    prompt:"Design an accessibility-first UI. Use: WCAG AA+ contrast, visible focus rings (not color-only), large tap targets (min 44px), clear labels, scalable text, high-contrast outline mode. Do not rely on color alone to convey meaning.",
    colors:[
      {hex:"#FFFFFF",name:"白"},
      {hex:"#111111",name:"近黑"},
      {hex:"#0B3D91",name:"深蓝"},
      {hex:"#FFB000",name:"焦点黄"}
    ],
    goodFor:"政务/公共服务、教育、医疗、面向全龄的产品",
    badFor:"追求极致视觉炫技的创意实验、暗黑风格艺术站",
    demoHtml:'<div class="d8"><div class="t">人人可用<br>的设计</div><div class="f"><i></i><div class="lbl">高对比模式</div></div><div class="btn">开启</div></div>'
  },
  {
    id:9, cat:"general", name:"黏土拟态", en:"Claymorphism",
    desc:"圆润膨胀、柔光、软萌体积",
    intro:"新拟态的「软萌进化」：超大圆角与膨胀泡泡形，辅以柔和双色内阴影，营造捏得出手的黏土质感。温暖、亲和、儿童友好，是可爱系产品的首选。",
    prompt:"Design a claymorphism UI. Use: extra-large border-radius, puffy inflated shapes, soft dual-tone inner shadows (light + dark) for a squishy clay look, pastel gradients, rounded friendly typography. Avoid sharp edges and hard shadows.",
    colors:[
      {hex:"#EEF1FF",name:"雾紫白"},
      {hex:"#C3B5FF",name:"浅紫"},
      {hex:"#8F7BF0",name:"紫"},
      {hex:"#4A3FA8",name:"深紫"}
    ],
    goodFor:"儿童产品、教育 App、可爱系品牌、健康打卡",
    badFor:"金融/严肃 B 端、极简文档、高信息密度后台",
    demoHtml:'<div class="d9"><div class="blob"></div><div class="card"><b>Clay UI</b><span></span><span></span></div></div>'
  },
  {
    id:10, cat:"general", name:"极光渐变", en:"Aurora Gradient",
    desc:"流动彩光、暗底发光、梦幻",
    intro:"在深色底上用 conic-gradient 旋转出极光般的流动彩光，叠半透明玻璃片，制造梦幻深邃的氛围。色彩即主角，适合氛围驱动的品牌与英雄区。",
    prompt:"Design an aurora gradient UI. Use: dark background, rotating conic-gradient of cyan/violet/pink light blurred heavily, semi-transparent glass overlay, dreamy glow. Let color be the hero, keep text minimal and luminous.",
    colors:[
      {hex:"#07091A",name:"深蓝黑"},
      {hex:"#00E0FF",name:"极光青"},
      {hex:"#7B5BFF",name:"紫"},
      {hex:"#FF4FD8",name:"玫粉"}
    ],
    goodFor:"音乐 App、夜间品牌、科幻主题、氛围落地页",
    badFor:"数据密集后台、打印、需高可读性的长文",
    demoHtml:'<div class="d10"><div class="glass"><b>Aurora</b><span>流动的光与色</span></div></div>'
  },
  {
    id:11, cat:"general", name:"复古未来主义", en:"Retro-Futurism",
    desc:"网格地平线、霓虹描边、80s 科幻",
    intro:"致敬 80 年代对未来的想象：紫色网格地平线、霓虹描边文字与青粉双影，营造 Synthwave 式的复古科幻。怀旧又前卫，是潮牌与音乐节的偏爱。",
    prompt:"Design a retro-futurism (synthwave) UI. Use: purple grid horizon with perspective, neon outlined text with cyan/magenta double-shadow, dark violet background, 80s sci-fi vibe. Mix nostalgia with futuristic glow.",
    colors:[
      {hex:"#120A24",name:"深紫黑"},
      {hex:"#FFD166",name:"暖黄"},
      {hex:"#FF2FB9",name:"霓虹粉"},
      {hex:"#21D4FD",name:"霓虹青"}
    ],
    goodFor:"音乐节、潮牌、游戏宣传、复古科技主题",
    badFor:"企业办公、医疗教育、严肃金融",
    demoHtml:'<div class="d11"><div class="t">RETRO<br>FUTURE</div><div class="s">// 1984 DREAMS</div></div>'
  },
  {
    id:12, cat:"general", name:"扁平化", en:"Flat Design",
    desc:"纯色块、无阴影、简洁图标、信息清晰",
    intro:"抛弃拟物化的阴影与纹理，用纯色块、简洁线条图标和清晰排版传递信息。微软 Metro 与 Google Material Design 的基石。加载快、适配易、辨识度高，是移动端最经久耐用的风格。",
    prompt:"Design a flat UI. Use: solid color blocks without shadows or gradients, simple line/solid icons, bold typography, clear color-coded sections, 2D elements only. Rely on color and spacing for hierarchy. Avoid skeuomorphic textures, bevels, or realistic shadows.",
    colors:[
      {hex:"#FF6B6B",name:"珊瑚红"},
      {hex:"#4ECDC4",name:"青绿"},
      {hex:"#FFE66D",name:"柠檬黄"},
      {hex:"#222222",name:"炭黑"}
    ],
    goodFor:"移动端 App、跨平台响应式、工具类应用、信息密集列表",
    badFor:"奢侈品品牌、需要质感表达的高端产品、3D/沉浸式体验",
    demoHtml:'<div class="d12"><div class="ic a"></div><div class="txt"><div class="t">任务清单</div><div class="s">3 项待办</div></div><div class="btn">完成</div></div>'
  },
  {
    id:13, cat:"general", name:"拟物化", en:"Skeuomorphism",
    desc:"拟真材质、旋钮开关、真实阴影",
    intro:"让界面元素模仿真实物理物件：木纹旋钮、皮质开关、金属高光，用写实阴影与材质唤起熟悉感。在 iOS 早期大行其道，今多用于需要「实体感」的控件。",
    prompt:"Design a skeuomorphic UI control. Use: realistic material textures (wood/leather/metal), detailed gradients for volume, hard drop shadows, inset highlights, physical-looking knobs and toggles. Mimic real-world objects faithfully.",
    colors:[
      {hex:"#CBAB7D",name:"木纹"},
      {hex:"#A9875A",name:"棕"},
      {hex:"#B9A179",name:"浅木"},
      {hex:"#6B5A3C",name:"深棕"}
    ],
    goodFor:"智能家居控件、乐器 App、游戏道具、需要实体暗示的设置",
    badFor:"信息密集后台、极简品牌、小屏高密度",
    demoHtml:'<div class="d13"><div class="knob"></div><div class="sw"><i></i></div><div class="label">SETTINGS</div></div>'
  },
  {
    id:14, cat:"general", name:"液态玻璃", en:"Liquid Glass",
    desc:"高饱和流光、强模糊、通透",
    intro:"苹果 Liquid Glass 的方向：在高饱和渐变上叠加强模糊的半透玻璃，边缘高光与流光让界面像水面般通透流动。比传统毛玻璃更亮、更润、更具动感。",
    prompt:"Design a liquid glass UI. Use: vivid gradient background, heavy backdrop-filter blur with saturation boost, translucent glass panels with bright edge highlights, flowing specular sheen, rounded organic shapes. Make it feel like moving water.",
    colors:[
      {hex:"#FF6FAE",name:"樱粉"},
      {hex:"#8A5BFF",name:"紫"},
      {hex:"#25C9FF",name:"青"},
      {hex:"#FFFFFF",name:"透白"}
    ],
    goodFor:"iOS 风格组件、音乐播放器、视觉优先产品、导航栏",
    badFor:"低端设备（blur 重）、打印、高对比需求页",
    demoHtml:'<div class="d14"><div class="glass"><b>Liquid Glass</b><span></span><span></span></div></div>'
  },
  {
    id:15, cat:"general", name:"动效驱动", en:"Motion-Driven",
    desc:"流动条、脉冲点、动效语言",
    intro:"把动效当作第一语言：加载条流动、状态点脉冲、元素呼吸，用持续运动传达「系统正在工作」。动效不是装饰，而是状态与反馈的载体。",
    prompt:"Design a motion-driven UI. Use: continuously animated progress bars, pulsing status dots, breathing elements, smooth easing. Let animation communicate system state and liveliness, not just decoration. Keep motion purposeful.",
    colors:[
      {hex:"#0F1115",name:"深黑"},
      {hex:"#4F8CFF",name:"蓝"},
      {hex:"#7EF0C0",name:"薄荷绿"},
      {hex:"#FFD166",name:"黄"}
    ],
    goodFor:"加载态、进度反馈、音乐可视化、实时状态",
    badFor:"阅读场景、无障碍敏感用户、省电模式",
    demoHtml:'<div class="d15"><div class="t">MOTION</div><div class="strip"><i></i></div><div class="b"><i></i><i></i><i></i></div></div>'
  },
  {
    id:16, cat:"general", name:"微交互", en:"Microinteraction",
    desc:"点击反馈、弹性动画、愉悦细节",
    intro:"在按钮点击、勾选等微小动作上加入弹性缩放与脉冲，累积出「手感好」的愉悦体验。细节处的回应让用户感到被界面「听见」。",
    prompt:"Design delightful microinteractions. Use: springy scale on tap, pulsing checkmarks, subtle hover transitions, tactile feedback on small actions. Make every interaction feel responsive and alive without being distracting.",
    colors:[
      {hex:"#FFFFFF",name:"白"},
      {hex:"#E0245E",name:"玫红"},
      {hex:"#34C759",name:"成功绿"},
      {hex:"#3A3A3F",name:"深灰"}
    ],
    goodFor:"社交产品、电商按钮、表单提交、任何需「手感」的控件",
    badFor:"极简严肃场景、无障碍 reduce-motion 用户（需降级）",
    demoHtml:'<div class="d16"><div class="btn">点我</div><div class="chk"><i>✓</i>已订阅</div></div>'
  },
  {
    id:17, cat:"general", name:"包容性设计", en:"Inclusive Design",
    desc:"多语言、图标化、人人可达",
    intro:"面向多元人群：多语言切换、清晰图标、大点区，让不同年龄/能力/文化背景的用户都能用。包容不是为少数，而是让多数更顺手。",
    prompt:"Design an inclusive UI. Use: multi-language switcher, clear recognizable icons, large tap targets, simple language, culturally neutral symbols. Serve diverse ages, abilities, and backgrounds without friction.",
    colors:[
      {hex:"#FBFBFD",name:"浅灰白"},
      {hex:"#1D1D1F",name:"近黑"},
      {hex:"#E0ECFF",name:"浅蓝"},
      {hex:"#3A3A3F",name:"深灰"}
    ],
    goodFor:"国际化产品、公共服务、教育平台、全龄应用",
    badFor:"小众极致风格、纯视觉实验",
    demoHtml:'<div class="d17"><div class="lang"><span class="on">中</span><span>EN</span><span>日</span><span>한</span></div><div class="row"><div class="tile"><i></i>语音</div><div class="tile"><i></i>大字</div><div class="tile"><i></i>高对比</div></div></div>'
  },
  {
    id:18, cat:"general", name:"零界面", en:"Zero UI",
    desc:"语音脉冲、无按钮、无形交互",
    intro:"界面「消失」为一次语音交互：脉动光晕与声波条取代按钮，把操作交给自然语言。最极致的简约，也是语音助手的终极形态。",
    prompt:"Design a zero-UI voice interface. Use: no buttons, a pulsing glow and voice-wave bars as the only visual, minimal text. The conversation is the interface. Keep the canvas calm and focused on listening.",
    colors:[
      {hex:"#F2F4F8",name:"浅雾"},
      {hex:"#2B6CFF",name:"蓝"},
      {hex:"#90A0C0",name:"灰蓝"},
      {hex:"#FFFFFF",name:"白"}
    ],
    goodFor:"语音助手、车载、智能家居、免触控场景",
    badFor:"需要精确操作的后台、无声环境、复杂录入",
    demoHtml:'<div class="d18"><div class="pulse"></div><div class="voice"><i></i><i></i><i></i><i></i><i></i></div></div>'
  },
  {
    id:19, cat:"general", name:"软 UI 进化", en:"Soft UI Evolved",
    desc:"渐变卡片、轻浮起、呼吸感",
    intro:"在扁平之上加入极轻的渐变与浮起阴影，让卡片像悬浮的薄层，柔和而现代。比纯扁平多一分温度，比拟物少一分重量。",
    prompt:"Design a soft UI evolved interface. Use: subtle gradients on cards, very light floating shadows, rounded corners, gentle depth, pastel business palette. Balance flat clarity with a touch of soft dimensionality.",
    colors:[
      {hex:"#F6F7FB",name:"浅雾白"},
      {hex:"#8FB6FF",name:"浅蓝"},
      {hex:"#4F74E0",name:"蓝"},
      {hex:"#25304D",name:"深蓝字"}
    ],
    goodFor:"SaaS 后台、金融概览、健康类 App、现代工具",
    badFor:"超极简文档、强对比需求、复古风",
    demoHtml:'<div class="d19"><div class="card"><div class="dot"></div><div class="t"><b>Soft UI</b><span>柔和的层次</span></div></div><div class="pill">升级 Pro</div></div>'
  },

  /* ===================== 落地页 Landing ===================== */
  {
    id:20, cat:"landing", name:"英雄中心", en:"Hero-Centric Design",
    desc:"巨型标题、视觉冲击、单一焦点、强 CTA",
    intro:"落地页首屏即全部：超大标题占据视觉中心，配合一句副标题和一个高对比 CTA 按钮，其余元素全部弱化。用尺寸建立层级，用留白引导视线，3 秒内传达核心价值主张。",
    prompt:"Design a hero-centric landing page. Use: one massive headline (64px+) as the focal point, concise subheadline, single prominent CTA button, minimal navigation, full-width hero with subtle gradient or product visual. Everything else is secondary. The hero must communicate value in under 3 seconds.",
    colors:[
      {hex:"#0A0A23",name:"深空蓝"},
      {hex:"#6366F1",name:"靛蓝"},
      {hex:"#FFFFFF",name:"白"},
      {hex:"#A0A0C0",name:"淡紫灰"}
    ],
    goodFor:"产品发布页、SaaS 首页、移动端引导页、单功能产品",
    badFor:"多功能仪表板、内容聚合站、需要展示大量信息的首页",
    demoHtml:'<div class="d20"><div class="h">极简<br>即极致</div><div class="sub">3 秒说清价值</div><div class="cta">立即体验</div></div>'
  },
  {
    id:21, cat:"landing", name:"转化优化", en:"Conversion-Optimized",
    desc:"强 CTA、紧迫感、表单前置、A/B 驱动",
    intro:"每一个元素都为转化率服务：醒目的 CTA 用对比色、限时优惠制造紧迫、表单字段最少化、社会证明紧随其后。配色和文案都经过 A/B 测试验证，是增长黑客的视觉武器。",
    prompt:"Design a conversion-optimized landing page. Use: high-contrast CTA button in a distinct color, urgency signals (limited time/countdown), minimal form fields (email only), social proof near CTA, benefit-driven headline, remove navigation links that distract. Every element must serve the conversion goal.",
    colors:[
      {hex:"#E74C3C",name:"警示红"},
      {hex:"#1A1A2E",name:"深蓝黑"},
      {hex:"#FFFFFF",name:"白"},
      {hex:"#27AE60",name:"成功绿"}
    ],
    goodFor:"电商促销、注册引导页、课程销售、限时活动落地页",
    badFor:"品牌形象站、内容社区、需要用户深度浏览的页面",
    demoHtml:'<div class="d21"><div class="p">免费试用 7 天</div><div class="o">仅剩 12 个名额</div><div class="input"></div><div class="go">立即开通</div></div>'
  },
  {
    id:22, cat:"landing", name:"功能矩阵展示", en:"Feature Matrix",
    desc:"功能图标网格、一览全貌、清晰分组",
    intro:"把产品能力铺成图标矩阵，让用户一屏看全功能，适合功能丰富的工具型产品首屏。网格化降低认知负担，每个格子自证其能。",
    prompt:"Design a feature matrix landing section. Use: grid of icon+label feature cards, consistent padding, 2x2 or 2x4 layout, clear grouping, subtle borders. Let users grasp the full capability set at a glance.",
    colors:[
      {hex:"#FFFFFF",name:"白"},
      {hex:"#0F172A",name:"深蓝黑"},
      {hex:"#E0ECFF",name:"浅蓝"},
      {hex:"#3A4459",name:"深灰蓝"}
    ],
    goodFor:"工具型产品、SaaS 功能页、平台型首页、开发者产品",
    badFor:"单一功能产品、故事型品牌站",
    demoHtml:'<div class="d22"><div class="h">全功能矩阵</div><div class="g"><div class="f"><i></i><span>极速</span></div><div class="f"><i></i><span>安全</span></div><div class="f"><i></i><span>协作</span></div><div class="f"><i></i><span>智能</span></div></div></div>'
  },
  {
    id:23, cat:"landing", name:"极简直接", en:"Minimal Direct",
    desc:"一句话主张、单一 CTA、零干扰",
    intro:"极致克制：一句核心价值主张配一个按钮，去掉所有导航与装饰，逼用户立刻决策。诺贝尔式留白把全部注意力让给那一个行动。",
    prompt:"Design a minimal direct landing page. Use: one bold value proposition sentence, a single CTA button, no nav, no decoration, lots of white space. Force an immediate decision with zero distraction.",
    colors:[
      {hex:"#FFFFFF",name:"白"},
      {hex:"#000000",name:"纯黑"},
      {hex:"#666666",name:"灰"},
      {hex:"#DDDDDD",name:"浅线"}
    ],
    goodFor:"单功能产品、_waitlist 落地页、个人作品集、活动页",
    badFor:"多功能平台、需要解释复杂价值的企业产品",
    demoHtml:'<div class="d23"><div class="h">少即是多</div><div class="s">去掉一切干扰，只留核心。</div><div class="cta">开始</div></div>'
  },
  {
    id:24, cat:"landing", name:"社会证明", en:"Social Proof-Focused",
    desc:"评价卡、星级、用户头像、信任锚点",
    intro:"用真实用户评价、星级评分、合作品牌 logo 和使用数据建立信任。评价卡居中展示，配头像与姓名增加真实感。适用于高客单价或需要降低决策门槛的产品，让访客「看见别人都在用」。",
    prompt:"Design a social proof focused landing page. Use: testimonial cards with 5-star ratings, real user avatars and names, usage statistics (trusted by 10k+ companies), client logos grid, case study links. Place proof sections strategically after each benefit claim. Make trust visible and verifiable.",
    colors:[
      {hex:"#F5A623",name:"金星黄"},
      {hex:"#A18CD1",name:"淡紫"},
      {hex:"#333333",name:"深灰"},
      {hex:"#FAFAFA",name:"浅灰底"}
    ],
    goodFor:"B2B SaaS、高客单价产品、新品牌建立信任、课程/咨询服务",
    badFor:"内部工具、政府/严肃机构、无需决策的 utility 应用",
    demoHtml:'<div class="d24"><div class="stars">★★★★★</div><div class="quote">"三天上手，效率翻倍"</div><div class="who"><div class="av"></div><div class="n">产品经理 · 李</div></div></div>'
  },
  {
    id:25, cat:"landing", name:"交互式产品演示", en:"Interactive Product Demo",
    desc:"屏幕录屏、光标引导、可玩预览",
    intro:"首屏即一个可交互的产品录屏，光标自动演示关键操作，让用户「先玩后下载」。把产品能力变成可感知的体验，比截图更有说服力。",
    prompt:"Design an interactive product-demo hero. Use: a mock product screen with an auto-moving cursor demonstrating key actions, glowing click rings, dark UI frame, subtle highlight on the feature being shown. Let users feel the product before signing up.",
    colors:[
      {hex:"#0F1115",name:"深黑"},
      {hex:"#35405A",name:"深蓝灰"},
      {hex:"#5B82FF",name:"亮蓝"},
      {hex:"#4F74E0",name:"蓝"}
    ],
    goodFor:"SaaS 产品、开发者工具、设计软件、任何可演示的产品",
    badFor:"实体/线下服务、无界面产品",
    demoHtml:'<div class="d25"><div class="screen"><i></i><i></i><i></i></div><div class="cursor"></div></div>'
  },
  {
    id:26, cat:"landing", name:"信任权威", en:"Trust & Authority",
    desc:"认证盾、资质墙、数据背书",
    intro:"用认证图标、资质墙与权威数据建立信任，适合金融/医疗/企业等高决策门槛场景。把「我们靠谱」变成可视的符号矩阵。",
    prompt:"Design a trust & authority landing section. Use: certification shield icon, a wall of credential badges (ISO/CE/3C), authoritative stats with big numbers, navy business palette. Build credibility visually for high-stakes decisions.",
    colors:[
      {hex:"#FFFFFF",name:"白"},
      {hex:"#0B3D91",name:"深蓝"},
      {hex:"#54617A",name:"灰蓝"},
      {hex:"#0B2545",name:"海军蓝"}
    ],
    goodFor:"金融、医疗、企业 SaaS、安全产品、政府合作",
    badFor:"年轻潮牌、娱乐产品、反权威调性品牌",
    demoHtml:'<div class="d26"><div class="top"><div class="shield"></div><div><b>权威认证</b></div></div><div class="certs"><span>ISO</span><span>3C</span><span>CE</span><span>等保</span></div><div class="stat"><span>可信用户</span><b>99%</b></div></div>'
  },
  {
    id:27, cat:"landing", name:"故事驱动", en:"Storytelling-Driven",
    desc:"分段叙事、引号、情感图、滚动展开",
    intro:"把产品价值包装成一段故事：起承转合分段呈现，配合大引号、情感化文案和渐进式滚动展开。用户不是在「读功能」，而是在「经历一段旅程」。适合有情怀的品牌和公益项目。",
    prompt:"Design a storytelling-driven landing page. Use: narrative structure with beginning/conflict/resolution, large pull quotes, emotional imagery, scroll-triggered section reveals, first-person voice, minimal CTAs until the story concludes. Let the narrative carry the persuasion, not feature lists.",
    colors:[
      {hex:"#E91E63",name:"玫红"},
      {hex:"#4A148C",name:"深紫"},
      {hex:"#FCE4EC",name:"粉雾"},
      {hex:"#F3E5F5",name:"淡紫雾"}
    ],
    goodFor:"品牌故事站、公益项目、文创产品、个人作品集",
    badFor:"技术文档、比价表格、需要快速决策的功能页",
    demoHtml:'<div class="d27"><div class="q">"</div><div class="t">每一个设计都始于一个未被听见的需求。</div><div class="more">阅读全文 →</div></div>'
  },

  /* ===================== 仪表板 Dashboard ===================== */
  {
    id:28, cat:"dashboard", name:"数据密集", en:"Data-Dense Dashboard",
    desc:"多图表块、密集数字、紧凑布局、深色底",
    intro:"在有限屏幕内塞入尽可能多的指标：KPI 卡片、折线图、柱状图、热力图按网格紧凑排列。深色底降低视觉疲劳，紧凑间距提升信息密度。是运维监控和专业分析工具的标配。",
    prompt:"Design a data-dense dashboard. Use: dark background to reduce eye strain, compact card grid with multiple chart types (line/bar/spark), small-caps labels, monospace numbers, color-coded deltas (green up/red down), minimal chrome. Maximize information per pixel while keeping scannable.",
    colors:[
      {hex:"#1E293B",name:"深石板"},
      {hex:"#334155",name:"中石板"},
      {hex:"#34D399",name:"翡翠绿"},
      {hex:"#F87171",name:"珊瑚红"}
    ],
    goodFor:"运维监控、广告投放后台、交易所终端、专业分析平台",
    badFor:"高管汇报、面向新手的工具、移动端小屏（密度过高）",
    demoHtml:'<div class="d28"><div class="b"><div class="k">CPU</div><div class="v g">68%</div></div><div class="b"><div class="k">REQ</div><div class="v">2.4k</div></div><div class="b"><div class="k">ERR</div><div class="v r">0.2%</div></div><div class="b"><div class="k">LAT</div><div class="v">42ms</div><div class="ln"><i style="height:40%"></i><i style="height:70%"></i><i style="height:55%"></i><i style="height:80%"></i></div></div></div>'
  },
  {
    id:29, cat:"dashboard", name:"热力图", en:"Heatmap",
    desc:"色阶密度、时间栅格、一眼趋势",
    intro:"用色阶方格呈现场景活跃度随时间的变化，密集但规律，适合行为/贡献可视化。颜色即数据，绿得越深越活跃。",
    prompt:"Design a heatmap dashboard module. Use: grid of squares colored by a green intensity scale (light=low, dark=high), week/month axis labels, a legend from less to more, white background. Make activity trends readable at a glance.",
    colors:[
      {hex:"#FFFFFF",name:"白"},
      {hex:"#1F7A3A",name:"深绿"},
      {hex:"#4FAE61",name:"中绿"},
      {hex:"#EBF2EC",name:"浅绿底"}
    ],
    goodFor:"贡献日历、活跃度分析、 occupancy 报表、行为趋势",
    badFor:"实时秒级监控、强对比需求、色盲用户（需辅以数字）",
    demoHtml:'<div class="d29"><div class="hd"><span>活跃度</span><span>近 18 周</span></div><div class="hm"><i class="l1"></i><i></i><i class="l2"></i><i class="l3"></i><i></i><i class="l4"></i><i class="l2"></i><i class="l1"></i><i></i><i class="l3"></i><i class="l4"></i><i class="l2"></i><i></i><i class="l1"></i><i class="l3"></i><i class="l2"></i><i></i><i class="l4"></i></div><div class="lg"><b></b><b class="l1"></b><b class="l2"></b><b class="l3"></b><b class="l4"></b><span>少→多</span></div></div>'
  },
  {
    id:30, cat:"dashboard", name:"高管仪表板", en:"Executive Dashboard",
    desc:"大 KPI 数字、留白、商务蓝、决策导向",
    intro:"给 CEO 看的仪表板：每屏只放 3-5 个核心 KPI，数字大到占满视线，配同比/环比箭头。大量留白、克制的商务蓝灰配色、无图表噪音。一眼看清「公司在变好还是变坏」。",
    prompt:"Design an executive dashboard. Use: 3-5 large KPI numbers per screen (48px+), generous white space, muted business palette (navy/slate), period-over-period comparison arrows, minimal charts (only if they aid the number), clear section titles. Optimize for 5-second glance comprehension by a busy executive.",
    colors:[
      {hex:"#FFFFFF",name:"白"},
      {hex:"#111111",name:"近黑"},
      {hex:"#16A34A",name:"商务绿"},
      {hex:"#E5E5EA",name:"浅灰线"}
    ],
    goodFor:"高管汇报、董事会演示、周会数据屏、投资人尽调",
    badFor:"一线运营的实时操作台、需要下钻细节的分析场景",
    demoHtml:'<div class="d30"><div class="kpi"><div class="lab">月营收</div><div class="num">¥4.2M <small>↑12%</small></div></div><div class="chart"><svg viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="0,25 14,20 28,23 42,15 56,17 70,9 84,12 100,4"/></svg></div><div class="foot"><span>DAU 82.4k</span><span class="up">↑ 6.1%</span></div></div>'
  },
  {
    id:31, cat:"dashboard", name:"实时监控", en:"Real-Time Monitoring",
    desc:"动态折线、状态点、脉冲、即时更新",
    intro:"数据每秒刷新，折线图持续向左滚动，绿色脉冲点表示「系统活着」。异常时整屏泛红警示。是 DevOps、IoT、直播监控的眼睛，强调「此刻」而非「历史」。",
    prompt:"Design a real-time monitoring UI. Use: auto-scrolling time-series charts, live status indicators with pulse animation, color-coded alert states (green/yellow/red), timestamp in monospace, auto-refresh every 1-5s, alert toast notifications. The UI must feel alive and surface anomalies within seconds.",
    colors:[
      {hex:"#0D1117",name:"GitHub 黑"},
      {hex:"#3FB950",name:"状态绿"},
      {hex:"#C9D1D9",name:"浅灰文"},
      {hex:"#F85149",name:"警报红"}
    ],
    goodFor:"DevOps 监控、IoT 设备、直播数据、安全态势感知",
    badFor:"月度报表、静态分析、低频更新的业务数据",
    demoHtml:'<div class="d31"><div class="top"><div class="t">LIVE · 2s</div><div class="dot"><i></i><span>HEALTHY</span></div></div><div class="chart"><svg viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="0,30 15,22 30,26 45,14 60,18 75,8 100,12" fill="none" stroke="#3fb950" stroke-width="1.5"/></svg></div></div>'
  },
  {
    id:32, cat:"dashboard", name:"下钻分析", en:"Drill-Down Analysis",
    desc:"面包屑、进度条、层级钻取",
    intro:"支持从总览逐级下钻到区域/明细，面包屑与横向进度条让层级关系一目了然。先把全局看小，再把局部看大，是分析型后台的标准范式。",
    prompt:"Design a drill-down analytics view. Use: breadcrumb navigation showing the hierarchy path, horizontal progress bars per segment with values, a highlighted active node, monospace numbers, clickable rows that expand into detail. Make the path from overview to detail always visible.",
    colors:[
      {hex:"#FFFFFF",name:"白"},
      {hex:"#4F74E0",name:"蓝"},
      {hex:"#7EA8FF",name:"浅蓝"},
      {hex:"#8A919E",name:"灰"}
    ],
    goodFor:"区域销售分析、渠道下钻、用户分群、运营归因",
    badFor:"单一指标页、无需层级的简单报表",
    demoHtml:'<div class="d32"><div class="crumb">总览 / <b>区域</b></div><div class="bar"><div class="lb">华北</div><div class="tk"><i style="width:82%"></i></div><div class="vl">82%</div></div><div class="bar"><div class="lb">华东</div><div class="tk"><i style="width:64%"></i></div><div class="vl">64%</div></div><div class="bar"><div class="lb">华南</div><div class="tk"><i style="width:47%"></i></div><div class="vl">47%</div></div></div>'
  },
  {
    id:33, cat:"dashboard", name:"对比分析", en:"Comparison Analysis",
    desc:"双栏对照、高亮优选、差异可见",
    intro:"把多个方案并排对照，高亮推荐项并用数字拉开差距，帮助快速选型。对照即理解，眼见为实。",
    prompt:"Design a comparison analysis view. Use: two or more columns side by side, highlight the recommended option with a colored border and tint, large contrasting numbers, small labels. Make differences immediately visible to aid quick decisions.",
    colors:[
      {hex:"#FFFFFF",name:"白"},
      {hex:"#2B57D6",name:"高亮蓝"},
      {hex:"#4F74E0",name:"蓝"},
      {hex:"#3A4459",name:"深灰蓝"}
    ],
    goodFor:"方案选型、A/B 结果、套餐对比、竞品分析",
    badFor:"单一对象展示、无对照需求页",
    demoHtml:'<div class="d33"><div class="cols"><div class="col hi"><b>方案 A</b><span>92</span><small>采用率</small></div><div class="col"><b>方案 B</b><span>68</span><small>采用率</small></div></div></div>'
  },
  {
    id:34, cat:"dashboard", name:"预测分析", en:"Predictive Analytics",
    desc:"实线历史、虚线未来、趋势外推",
    intro:"实线代表历史，虚线外推未来，深色科技底配合图例，专注「接下来会怎样」。把不确定性画成可预期的曲线，是决策支持的核心。",
    prompt:"Design a predictive analytics chart. Use: solid line for historical data, dashed line for forecast, dark tech background, legend distinguishing actual vs predicted, monospace labels. Focus the view on what comes next.",
    colors:[
      {hex:"#0B1020",name:"深蓝黑"},
      {hex:"#4F8CFF",name:"蓝"},
      {hex:"#FFD166",name:"黄"},
      {hex:"#8B93A7",name:"灰"}
    ],
    goodFor:"销售预测、流量预估、风险建模、容量规划",
    badFor:"纯历史回溯、无预测场景",
    demoHtml:'<div class="d34"><div class="t">FORECAST</div><div class="chart"><svg viewBox="0 0 100 40" preserveAspectRatio="none"><polyline class="solid" points="0,30 20,24 40,28 60,16 80,20 100,12"/><polyline class="dash" points="60,16 80,14 100,8"/></svg></div><div class="legend"><span><b style="background:#4f8cff"></b>实际</span><span><b style="background:#ffd166"></b>预测</span></div></div>'
  },
  {
    id:35, cat:"dashboard", name:"用户行为分析", en:"User Behavior Analysis",
    desc:"漏斗转化、逐级流失、人群标签",
    intro:"用漏斗呈现从访问到付费的逐级转化，标注流失与人群，定位增长瓶颈。哪一级漏得最多，就先补哪一级。",
    prompt:"Design a user-behavior funnel. Use: horizontal funnel with progressively narrower bars, percentage labels per stage, a user avatar chip with a caption, gradient blue bars. Surface where users drop off most.",
    colors:[
      {hex:"#FFFFFF",name:"白"},
      {hex:"#4F74E0",name:"蓝"},
      {hex:"#7EA8FF",name:"浅蓝"},
      {hex:"#6B7280",name:"灰"}
    ],
    goodFor:"增长分析、转化优化、漏斗诊断、运营复盘",
    badFor:"非流程型产品、无步骤数据场景",
    demoHtml:'<div class="d35"><div class="funnel"><div class="f">访问 100%</div><div class="f">注册 77%</div><div class="f">激活 54%</div><div class="f">付费 32%</div></div><div class="who"><i></i>上周新增 1.2k 用户</div></div>'
  },
  {
    id:36, cat:"dashboard", name:"金融仪表板", en:"Financial Dashboard",
    desc:"红绿涨跌、K 线蜡烛、密集报价、专业感",
    intro:"交易终端的视觉语言：红跌绿涨（或红涨绿跌，依地区）、蜡烛 K 线图、密集报价列表、等宽数字对齐。深色底配高饱和红绿，让涨跌一眼可辨。信息密度极高但不混乱。",
    prompt:"Design a financial dashboard. Use: candlestick or OHLC charts, red/green color coding for down/up (respect regional convention), monospace tabular numbers for alignment, dense quote list with bid/ask/spread, dark background, subtle grid lines. Prioritize glanceable price movement over decoration.",
    colors:[
      {hex:"#0F172A",name:"深蓝黑"},
      {hex:"#22C55E",name:"涨绿"},
      {hex:"#EF4444",name:"跌红"},
      {hex:"#64748B",name:"石板灰"}
    ],
    goodFor:"股票/加密货币交易、基金组合、外汇终端、量化回测",
    badFor:"非金融产品、儿童理财教育、弱视觉差异的纯文本报表",
    demoHtml:'<div class="d36"><div class="pair"><div class="sym">BTC/USDT</div><div class="val up">68,420 ↑</div></div><div class="candles"><div class="c up"><i class="wick"></i><i class="body"></i></div><div class="c dn"><i class="wick"></i><i class="body"></i></div><div class="c up"><i class="wick"></i><i class="body"></i></div><div class="c up"><i class="wick"></i><i class="body"></i></div><div class="c dn"><i class="wick"></i><i class="body"></i></div></div></div>'
  },
  {
    id:37, cat:"dashboard", name:"销售智能", en:"Sales Intelligence",
    desc:"大号 GMV、柱状趋势、环比箭标",
    intro:"把销售业绩浓缩为大号数字 + 柱状趋势，环比箭头让增长「看得见」。业务同学一眼知涨跌，无需读表。",
    prompt:"Design a sales intelligence dashboard. Use: one large GMV number with a green up-arrow delta, a bar chart of recent periods in amber gradient, monospace numbers, clean white card. Make performance trends obvious at a glance.",
    colors:[
      {hex:"#FFFFFF",name:"白"},
      {hex:"#FF8F00",name:"琥珀橙"},
      {hex:"#FFC23D",name:"浅橙"},
      {hex:"#111111",name:"近黑"}
    ],
    goodFor:"销售看板、电商经营、GMV 周报、业务驾驶舱",
    badFor:"技术监控、非销售指标场景",
    demoHtml:'<div class="d37"><div class="kpi"><div class="lab">本月 GMV</div><div class="val">¥1.8M<em>↑9%</em></div></div><div class="bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>'
  },

  /* ===================== 现代 Modern ===================== */
  {
    id:38, cat:"modern", name:"新粗野主义", en:"Neubrutalism",
    desc:"粗黑边、硬阴影、错位、鲜艳撞色",
    intro:"对精致设计的反叛：粗黑边框、硬边阴影（无模糊）、鲜艳撞色块、刻意错位。充满 Y2K 与 Z 世代的张扬能量，在千篇一律的圆角卡片中脱颖而出。是独立产品和创意社区的新宠。",
    prompt:"Design a neubrutalism UI. Use: thick black borders (2-4px), hard offset shadows (3px 3px 0 #000, no blur), clashing vibrant colors (yellow/pink/blue), intentionally misaligned elements, bold sans-serif at extreme weights, no rounded corners or subtle gradients. Embrace raw, loud, anti-aesthetic energy.",
    colors:[
      {hex:"#FEF08A",name:"亮黄"},
      {hex:"#FF5470",name:"热粉"},
      {hex:"#4D96FF",name:"电蓝"},
      {hex:"#000000",name:"硬黑"}
    ],
    goodFor:"独立产品、创意社区、Z 世代品牌、艺术展览",
    badFor:"企业级 SaaS、金融医疗、政府严肃产品、需要长期信赖的品牌",
    demoHtml:'<div class="d38"><div class="dot"></div><div class="t">BOLD</div><div class="b">CLICK ME</div></div>'
  },
  {
    id:39, cat:"modern", name:"便当盒网格", en:"Bento Box Grid",
    desc:"不等高圆角块、模块化、留白节奏",
    intro:"灵感来自日式便当盒：大小不一的圆角块按网格拼贴，每块自成一个信息单元。视觉节奏富于变化又不失秩序，是 Apple 近年发布会和众多产品官网的新主流布局。",
    prompt:"Design a bento box grid layout. Use: varied-size rounded cards (16-24px radius) in a CSS grid, each card a self-contained info unit, mix sizes (1x1, 2x1, 2x2) for visual rhythm, subtle shadows and borders, generous gap, consistent padding within cards. Let important content occupy larger cells.",
    colors:[
      {hex:"#667EEA",name:"靛蓝"},
      {hex:"#764BA2",name:"紫"},
      {hex:"#F093FB",name:"粉"},
      {hex:"#F5F5F7",name:"浅灰底"}
    ],
    goodFor:"产品功能展示、官网首页、移动端概览页、特性矩阵",
    badFor:"线性流程页、长文档、需要严格对齐的数据表格",
    demoHtml:'<div class="d39"><div class="cell a"><div class="t">主打功能</div></div><div class="cell b"><div class="t">次级</div></div><div class="cell c"><div class="t">亮点</div></div></div>'
  },
  {
    id:40, cat:"modern", name:"Y2K 美学", en:"Y2K Aesthetic",
    desc:"珠光渐变、圆润高光、千禧怀旧",
    intro:"千禧年网络审美回潮：珠光粉蓝渐变、圆润高光徽章与泡泡元素，甜腻又未来。是复古怀旧与赛博甜心的混合体，深受年轻潮牌喜爱。",
    prompt:"Design a Y2K aesthetic UI. Use: iridescent pastel gradients (pink/blue/lilac), glossy rounded badges with white highlights, bubble shapes, chrome-like accents, playful bold type. Mix millennium nostalgia with futuristic shine.",
    colors:[
      {hex:"#D6F1FF",name:"珠光蓝"},
      {hex:"#C3A8FF",name:"珠光紫"},
      {hex:"#FFB3EC",name:"珠光粉"},
      {hex:"#4A2C8F",name:"深紫"}
    ],
    goodFor:"潮牌、美妆、音乐人主页、年轻女性向产品",
    badFor:"金融/严肃 B 端、极简科技风",
    demoHtml:'<div class="d40"><div class="badge">Y2K</div><div class="t">千禧<br>未来感</div><div class="chips"><i></i><i></i><i></i></div></div>'
  },
  {
    id:41, cat:"modern", name:"赛博朋克", en:"Cyberpunk UI",
    desc:"霓虹光、扫描线、故障感、反乌托邦",
    intro:"《银翼杀手》的视觉延伸：霓虹青粉撞色、CRT 扫描线、RGB 分离故障效果、等宽科技字体。营造高科技低生活的反乌托邦氛围，是游戏、Web3 和极客工具的偏爱风格。",
    prompt:"Design a cyberpunk UI. Use: neon cyan (#0ff) and magenta (#f0f) on near-black, CRT scanline overlay, RGB-split/glitch effects on hover, monospace tech font, glowing text-shadows, angular clip-path shapes, HUD-style data readouts. Evolve a dystopian high-tech atmosphere.",
    colors:[
      {hex:"#0A0A12",name:"近黑"},
      {hex:"#00FFFF",name:"霓虹青"},
      {hex:"#FF00FF",name:"霓虹粉"},
      {hex:"#00FF00",name:"毒绿"}
    ],
    goodFor:"游戏界面、Web3/加密产品、极客工具、科幻主题活动",
    badFor:"企业办公、医疗教育、面向大众的日常工具、需要长时间阅读的场景",
    demoHtml:'<div class="d41"><div class="t">SYS_ONLINE</div><div class="s">// NEURAL LINK OK</div><div class="bar"></div></div>'
  },
  {
    id:42, cat:"modern", name:"有机亲自然", en:"Organic & Biophilic",
    desc:"叶片形、自然绿、柔和弧线",
    intro:"把自然元素引入界面：叶片形图标、低饱和绿与柔和弧线，唤起亲近自然的放松感。是健康、环保、 wellness 品牌的天然盟友。",
    prompt:"Design an organic biophilic UI. Use: leaf-shaped icons, soft asymmetric rounded corners, low-saturation greens, creamy off-white backgrounds, gentle curves. Evoke calm, nature-connected, wellness feeling.",
    colors:[
      {hex:"#EEF7EE",name:"浅绿雾"},
      {hex:"#2F7D4F",name:"叶绿"},
      {hex:"#79C98A",name:"浅绿"},
      {hex:"#1F4D33",name:"深绿"}
    ],
    goodFor:"健康/养生、环保品牌、有机食品、冥想类 App",
    badFor:"金融科技、硬核科技、需要高效率的 B 端",
    demoHtml:'<div class="d42"><div class="leaf"></div><div class="card"><b>自然共生</b><span></span><span></span></div></div>'
  },
  {
    id:43, cat:"modern", name:"AI 原生界面", en:"AI-Native UI",
    desc:"对话气泡、渐变球、灵动效、自适应",
    intro:"为对话式交互而生：渐变球代表 AI 头像、对话气泡区分用户与模型、打字动画暗示思考、卡片式结构化输出。界面随对话动态生成，是 ChatGPT 时代的新设计范式。",
    prompt:"Design an AI-native conversational UI. Use: chat bubble layout distinguishing user vs AI, animated gradient orb as AI avatar, typing indicator while waiting, streaming text reveal, card/inline-citation for structured outputs, suggested follow-up prompts, minimal chrome. The conversation is the interface.",
    colors:[
      {hex:"#A8EDEA",name:"薄荷"},
      {hex:"#FED6E3",name:"樱粉"},
      {hex:"#FFFFFF",name:"白"},
      {hex:"#333333",name:"深灰文"}
    ],
    goodFor:"AI 助手、对话式搜索、智能客服、Copilot 类产品",
    badFor:"传统表单 CRUD、数据密集表格、需要精确操控的专业工具",
    demoHtml:'<div class="d43"><div class="orb"></div><div class="bubble">帮我总结这段设计…</div><div class="typing"><i></i><i></i><i></i></div></div>'
  },
  {
    id:44, cat:"modern", name:"孟菲斯", en:"Memphis Design",
    desc:"几何撞色、黑边、随意点缀",
    intro:"80 年代孟菲斯派的平面复兴：三角圆点锯齿随机撒落，高饱和撞色配黑描边，俏皮反秩序。用「乱」表达欢乐，是儿童与创意品牌的活力之选。",
    prompt:"Design a Memphis-style UI. Use: scattered geometric shapes (triangles, dots, zigzags), high-saturation clashing colors, bold black outlines, cream background, playful random placement. Celebrate joyful anti-order.",
    colors:[
      {hex:"#FDF6E3",name:"奶油底"},
      {hex:"#FF5C8A",name:"玫红"},
      {hex:"#2EC4B6",name:"青绿"},
      {hex:"#FFD166",name:"黄"}
    ],
    goodFor:"儿童产品、创意工作室、活动海报、趣味品牌",
    badFor:"严肃金融/医疗、极简文档、高端奢华",
    demoHtml:'<div class="d44"><div class="sq"></div><div class="tri"></div><div class="circ"></div><div class="zig"></div><div class="lbl">MEMPHIS</div></div>'
  },
  {
    id:45, cat:"modern", name:"蒸汽波", en:"Vaporwave",
    desc:"落日网格、粉紫渐变、故障怀旧",
    intro:"蒸汽波美学：粉紫渐变天空、像素落日与透视网格地面，配 glitch 标题，复古又迷幻。是网络怀旧文化与赛博甜心的交汇。",
    prompt:"Design a vaporwave UI. Use: pink-to-purple gradient sky, pixelated sun, perspective grid floor, glitchy title text with magenta shadow, 80s/90s retro-futuristic nostalgia. Make it dreamy and slightly broken.",
    colors:[
      {hex:"#2B1055",name:"深紫"},
      {hex:"#7597DE",name:"雾蓝"},
      {hex:"#FF77E1",name:"粉"},
      {hex:"#FFD166",name:"落日黄"}
    ],
    goodFor:"音乐专辑页、潮牌、虚拟空间、怀旧主题",
    badFor:"商务严肃、高可读长文、金融",
    demoHtml:'<div class="d45"><div class="t">VAPOR</div></div>'
  },
  {
    id:46, cat:"modern", name:"维度分层", en:"Layered Depth",
    desc:"错位卡片、纵深叠放、透视层次",
    intro:"用多层错位卡片叠出纵深，前景清晰、背景渐隐，营造空间层次。让平面界面拥有「厚度」，引导视线由浅入深。",
    prompt:"Design a layered-depth UI. Use: multiple offset cards stacked with rotation, front card sharp and opaque, back cards tinted and faded, soft shadows for separation. Create a sense of physical space and hierarchy.",
    colors:[
      {hex:"#EEF1F7",name:"浅蓝灰"},
      {hex:"#C7D6F7",name:"浅蓝"},
      {hex:"#9FB8EF",name:"中蓝"},
      {hex:"#2A3A63",name:"深蓝字"}
    ],
    goodFor:"卡片概览、作品集、产品特性、空间感首页",
    badFor:"高密度数据、严格对齐表格",
    demoHtml:'<div class="d46"><div class="l l1"></div><div class="l l2"></div><div class="l l3">LAYER</div></div>'
  },
  {
    id:47, cat:"modern", name:"夸张极简", en:"Exaggerated Minimal",
    desc:"巨型数字、超大留白、极致反差",
    intro:"极简到夸张：一个占满视野的巨型数字 + 极小标签，用尺度反差制造记忆点。少即是多，多到极致。",
    prompt:"Design an exaggerated minimal UI. Use: one gigantic number or letter filling the view, tiny label with wide letter-spacing, massive white space, pure black on white. Make scale contrast the entire statement.",
    colors:[
      {hex:"#FFFFFF",name:"白"},
      {hex:"#000000",name:"纯黑"},
      {hex:"#9A9AA0",name:"浅灰"},
      {hex:"#EEEEEE",name:"浅线"}
    ],
    goodFor:"成就页、记分牌、数据爆点、品牌主张",
    badFor:"信息密集页、多功能界面",
    demoHtml:'<div class="d47"><div class="n">99</div><div class="l">SCORE</div></div>'
  },
  {
    id:48, cat:"modern", name:"动态排版", en:"Kinetic Typography",
    desc:"弹跳文字、逐字律动、节奏感",
    intro:"让文字本身跳舞：逐字上下弹跳与错落节奏，把排版变成动效主角。文字不再静止，而是带着情绪跳动。",
    prompt:"Design a kinetic typography UI. Use: per-character vertical bounce animation, staggered delays, bold display type, dark background, rhythmic motion. Make the text itself the moving hero.",
    colors:[
      {hex:"#111111",name:"近黑"},
      {hex:"#FFFFFF",name:"白"},
      {hex:"#6B7280",name:"灰"},
      {hex:"#444444",name:"深灰"}
    ],
    goodFor:"标语页、音乐视觉、品牌动画、创意首页",
    badFor:"长文阅读、可访问性优先、静态文档",
    demoHtml:'<div class="d48"><div class="r"><span>设</span><span>计</span><span>动</span><span>起</span><span>来</span></div><div class="r b"><span>kinetic</span><span>typography</span></div></div>'
  },
  {
    id:49, cat:"modern", name:"视差叙事", en:"Parallax Narrative",
    desc:"月夜山丘、层叠视差、氛围叙事",
    intro:"用月、远山、近丘多层视差构建静谧夜景，文字浮于其上，适合氛围叙事。景深引导视线，安静中讲故事。",
    prompt:"Design a parallax narrative scene. Use: layered moon, far hills, near hills with depth, dark blue gradient sky, text floating on top, subtle scroll-linked parallax. Build a calm atmospheric story frame.",
    colors:[
      {hex:"#0D1B3E",name:"深夜蓝"},
      {hex:"#2B4A8F",name:"中蓝"},
      {hex:"#1D3A76",name:"远山蓝"},
      {hex:"#9FB4E0",name:"月光"}
    ],
    goodFor:"品牌故事、旅行产品、沉浸式首页、情感叙事",
    badFor:"工具型后台、信息密集页",
    demoHtml:'<div class="d49"><div class="moon"></div><div class="hill f"></div><div class="hill n"></div><div class="t">夜航<small>PARALLAX STORY</small></div></div>'
  },
  {
    id:50, cat:"modern", name:"瑞士现代主义 2.0", en:"Swiss Modernism 2.0",
    desc:"网格化、信息分区、克制秩序",
    intro:"经典瑞士网格的当代版：顶部分隔线、双栏信息块与底部栏目，秩序中带数字活力。把严谨排版做成可扩展的模块系统。",
    prompt:"Design a Swiss modernism 2.0 layout. Use: strict grid, top rule line, two-column info blocks, bottom column labels, bold black type, generous spacing, numbered sections. Modernize classic Swiss order with digital rhythm.",
    colors:[
      {hex:"#FFFFFF",name:"白"},
      {hex:"#000000",name:"纯黑"},
      {hex:"#6E6E73",name:"灰"},
      {hex:"#EEEEEE",name:"浅线"}
    ],
    goodFor:"新闻/杂志站、产品手册、资讯首页、专业平台",
    badFor:"娱乐化、强情感品牌",
    demoHtml:'<div class="d50"><div class="hd"><span>NEWS</span><span>2026</span></div><div class="grid2"><b>设计<br>周报</b><span>每周精选全球最佳界面趋势与实践。</span><span>来自 200+ 团队的真实案例拆解。</span></div><div class="ft"><span>A</span><span>B</span><span>C</span></div></div>'
  },
  {
    id:51, cat:"modern", name:"科幻 HUD", en:"Sci-Fi HUD",
    desc:"同心环、扫描、青色数据",
    intro:"机甲风 HUD：多层同心环旋转扫描，青色等宽数据读数，营造未来作战界面。把信息框进环里，科技感拉满。",
    prompt:"Design a sci-fi HUD interface. Use: concentric rotating rings, scanning animations, cyan monospace telemetry readouts, radial layout, dark background with glow. Evoke a futuristic cockpit/head-up display.",
    colors:[
      {hex:"#04222B",name:"深青黑"},
      {hex:"#00FFE1",name:"HUD 青"},
      {hex:"#0A0C11",name:"近黑"},
      {hex:"#008B8B",name:"暗青"}
    ],
    goodFor:"游戏 UI、航天/军事主题、数据大屏、科技展",
    badFor:"日常工具、阅读场景、严肃办公",
    demoHtml:'<div class="d51"><div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div><div class="hd">HUD · ON</div><div class="bd">SYS 99%</div></div>'
  },
  {
    id:52, cat:"modern", name:"像素风", en:"Pixel Art",
    desc:"像素精灵、硬黑边、复古游戏",
    intro:"8-bit 像素美学：方块拼出精灵图、硬黑描边按钮与等宽字体，唤起复古游戏情怀。粗糙即风格，方块即表达。",
    prompt:"Design a pixel-art UI. Use: blocky 8-bit sprites built from squares, hard black outlines, no anti-aliasing, monospace pixel font, limited palette (green/amber/red). Evoke retro game nostalgia.",
    colors:[
      {hex:"#1A1C2C",name:"深墨"},
      {hex:"#38B764",name:"像素绿"},
      {hex:"#FFCD75",name:"像素黄"},
      {hex:"#EF7D57",name:"像素橙"}
    ],
    goodFor:"游戏官网、复古社区、独立开发者、像素艺术展",
    badFor:"高端商务、精致品牌、长文阅读",
    demoHtml:'<div class="d52"><div class="spr"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="t">PIXEL</div><div class="btn">START</div></div>'
  },
  {
    id:53, cat:"modern", name:"便当网格", en:"Bento Grid",
    desc:"规整九宫、跨格重点、清爽排布",
    intro:"比便当盒更规整的九宫格：用跨列/跨行块突出重点，平衡且好扫读。是信息概览页的清爽解法。",
    prompt:"Design a tidy bento grid. Use: a 3-column 2-row grid, one tall cell spanning both rows as the hero, one wide cell spanning two columns, remaining small cells, white cards with soft shadow, clean labels. Balanced and scannable.",
    colors:[
      {hex:"#F6F6F8",name:"浅灰底"},
      {hex:"#4F74E0",name:"蓝"},
      {hex:"#8A5BFF",name:"紫"},
      {hex:"#5B5B66",name:"深灰"}
    ],
    goodFor:"移动端概览、个人信息中心、功能速览、仪表板首页",
    badFor:"长文、严格流程页",
    demoHtml:'<div class="d53"><div class="b tall">主</div><div class="b">1</div><div class="b">2</div><div class="b w2">宽块</div></div>'
  },
  {
    id:55, cat:"modern", name:"空间界面", en:"Spatial Interface",
    desc:"3D 倾斜面板、景深玻璃、悬浮卡",
    intro:"把面板摆进 3D 空间：倾斜的玻璃面板带景深与投影，营造悬浮的操作台。是 visionOS 时代的空间计算视觉语言。",
    prompt:"Design a spatial interface. Use: 3D-rotated glass panels with perspective, depth blur, soft drop shadows, translucent layers, centered floating card. Evoke a visionOS-style spatial computing surface.",
    colors:[
      {hex:"#3A2B5F",name:"深紫空"},
      {hex:"#150F24",name:"近黑紫"},
      {hex:"#FFFFFF",name:"透白"},
      {hex:"#8A7BFF",name:"浅紫"}
    ],
    goodFor:"空间计算 App、visionOS 风格、3D 产品、沉浸首页",
    badFor:"平面文档、低性能设备",
    demoHtml:'<div class="d55"><div class="panel"><b>Spatial OS</b><span></span><span></span></div></div>'
  },
  {
    id:56, cat:"modern", name:"电子墨水纸感", en:"E-Ink Paper",
    desc:"米色纸底、衬线、墨条段落",
    intro:"模仿电子墨水屏：米色纸底、衬线字体与墨色段落条，专注长文阅读不刺眼。把界面变成一本安静的书。",
    prompt:"Design an e-ink paper UI. Use: warm off-white paper background, serif typeface, ink-gray paragraph bars, subtle top/bottom rules, no shadows, high readability. Mimic a calm e-reader surface.",
    colors:[
      {hex:"#F4F1E8",name:"纸黄"},
      {hex:"#2B2B2B",name:"墨黑"},
      {hex:"#C9C4B6",name:"浅墨"},
      {hex:"#8A8577",name:"灰墨"}
    ],
    goodFor:"阅读器、长文博客、笔记 App、杂志、电子书",
    badFor:"数据密集、强色彩品牌、动效驱动",
    demoHtml:'<div class="d56"><div class="ttl">纸感阅读</div><div class="pg"><i></i><i></i><i></i><i></i></div><div class="ft"><span>第 12 页</span><span>晨读</span></div></div>'
  },
  {
    id:57, cat:"modern", name:"Z 世代极繁", en:"Gen-Z Maximalism",
    desc:"荧光撞色、倾斜贴纸、信息过载",
    intro:"Z 世代的极繁主义：荧光黄底撒满倾斜贴纸与字母，故意「乱」出活力。信息过载即态度，是社交媒体的原生审美。",
    prompt:"Design a Gen-Z maximalist UI. Use: neon yellow background, scattered tilted stickers and badges with black outlines, bold mixed-type letters, clashing accents (pink/cyan/purple), deliberate visual chaos. Energy over order.",
    colors:[
      {hex:"#C6FF3D",name:"荧光黄"},
      {hex:"#FF2FB9",name:"荧光粉"},
      {hex:"#00E0FF",name:"荧光青"},
      {hex:"#7C5CFF",name:"紫"}
    ],
    goodFor:"社媒滤镜、潮玩、音乐人、年轻向活动",
    badFor:"商务、极简偏好、严肃场景",
    demoHtml:'<div class="d57"><div class="e"></div><div class="a">NEW!</div><div class="b">HOT</div><div class="c">MAX</div><div class="d"></div></div>'
  },
  {
    id:58, cat:"modern", name:"仿生有机 2.0", en:"Biomimicry 2.0",
    desc:"流动有机形、呼吸动画、生命感",
    intro:"用会呼吸变形的有机色块模拟生命体，深色自然底配青绿，强调「活着的界面」。形态随动，界面如生物。",
    prompt:"Design a biomimicry 2.0 UI. Use: morphing blob shapes that breathe and rotate, organic gradients (teal/emerald/cyan), dark nature background, soft glow. Make the interface feel alive like a living organism.",
    colors:[
      {hex:"#0F2B23",name:"深林"},
      {hex:"#4ADE80",name:"亮绿"},
      {hex:"#0F766E",name:"青绿"},
      {hex:"#22D3EE",name:"青"}
    ],
    goodFor:"生物科技、环保品牌、健康 App、生成艺术",
    badFor:"硬核金融、直角偏好、极简文档",
    demoHtml:'<div class="d58"><div class="pair"><div class="o"></div><div class="o s"></div></div><div class="t">ORGANIC</div></div>'
  },
  {
    id:59, cat:"modern", name:"反抛光原始", en:"Anti-Polished Raw",
    desc:"手绘框、错位、刻意粗糙",
    intro:"刻意保留「未完成」：手绘感黑框、错位卡片与粗糙阴影，对抗过度精致的工业感。粗糙即真实，缺陷即风格。",
    prompt:"Design an anti-polished raw UI. Use: hand-drawn black borders, slightly rotated misaligned cards, rough hard shadows, monospace type, visible imperfections. Reject over-polished corporate smoothness for honest rawness.",
    colors:[
      {hex:"#F2F0EC",name:"糙白"},
      {hex:"#111111",name:"墨黑"},
      {hex:"#9B9B9B",name:"灰"},
      {hex:"#FFFFFF",name:"白"}
    ],
    goodFor:"独立刊物、手作品牌、实验项目、反主流表达",
    badFor:"金融医疗、企业严肃、需要信赖感场景",
    demoHtml:'<div class="d59"><div class="cell"><i class="l"></i><i class="l"></i><i class="l"></i></div><div class="note">raw.txt</div></div>'
  },
  {
    id:60, cat:"modern", name:"触感可变 UI", en:"Tactile Morphing UI",
    desc:"果冻形变、弹性进度、可捏感",
    intro:"元素像果冻般形变回弹，进度条弹性伸缩，强调可被「捏」的物理触感。用形变传达可操控的弹性，是触屏时代的手感实验。",
    prompt:"Design a tactile morphing UI. Use: jelly-like shapes that squash and stretch, elastic progress bars, springy easing, soft gradients, rounded blobs. Convey physical squishiness and controllability on touch.",
    colors:[
      {hex:"#F7F7F9",name:"浅雾"},
      {hex:"#4F74E0",name:"蓝"},
      {hex:"#8FB6FF",name:"浅蓝"},
      {hex:"#E4E7EF",name:"浅线"}
    ],
    goodFor:"触屏游戏、趣味控件、儿童产品、加载反馈",
    badFor:"严肃 B 端、高信息密度、reduce-motion 用户",
    demoHtml:'<div class="d60"><div class="jelly"></div><div class="bar"><i></i></div></div>'
  },
  {
    id:61, cat:"modern", name:"自然提炼", en:"Refined Nature",
    desc:"米色留白、细线、人文衬线",
    intro:"从自然中提炼的极简：米色留白、细金线与人文衬线，安静而有质感。少装饰，多呼吸，是高端品牌的克制表达。",
    prompt:"Design a refined nature UI. Use: warm off-white space, thin gold rule lines, humanist serif headings, muted earthy text, generous breathing room. Quiet, premium, nature-derived minimalism.",
    colors:[
      {hex:"#FAF8F3",name:"米白"},
      {hex:"#3B3A34",name:"墨褐"},
      {hex:"#A8996F",name:"金线"},
      {hex:"#8A8477",name:"灰褐"}
    ],
    goodFor:"高端品牌、文化机构、精品电商、人文内容",
    badFor:"科技炫酷、数据密集、年轻潮牌",
    demoHtml:'<div class="d61"><div class="line"></div><div class="tag">ESSENCE</div><div class="t">回归本质的留白</div><div class="s">少装饰，多呼吸。</div></div>'
  },
  {
    id:62, cat:"modern", name:"交互光标", en:"Cursor Interaction",
    desc:"跟随光标、光环、指针叙事",
    intro:"让自定义光标成为主角：光环跟随指针移动，引导用户在暗色画布上探索。指针即向导，视线随它走。",
    prompt:"Design a cursor-interaction UI. Use: a custom glowing ring cursor that follows the pointer with lag, a small pointer arrow, dark canvas, minimal labels. Let the cursor guide exploration and narrative.",
    colors:[
      {hex:"#0E1116",name:"深黑"},
      {hex:"#7C5CFF",name:"紫"},
      {hex:"#A08CFF",name:"浅紫"},
      {hex:"#6B7280",name:"灰"}
    ],
    goodFor:"作品集、创意官网、沉浸式体验、游戏菜单",
    badFor:"触控优先、无障碍严格、表单密集",
    demoHtml:'<div class="d62"><div class="cur"></div><div class="ptr"></div><div class="t">CURSOR FOCUS</div></div>'
  },
  {
    id:63, cat:"modern", name:"语音优先", en:"Voice-First",
    desc:"渐变球、声波、聆听态",
    intro:"为语音交互设计：旋转渐变球 + 实时声波条，明确传达「我正在听」。把听见的动作可视化，是无手场景的天然界面。",
    prompt:"Design a voice-first UI. Use: a rotating conic-gradient orb, real-time voice-wave bars, a 'listening' caption, soft gradient background, minimal chrome. Visualize active listening for hands-free interaction.",
    colors:[
      {hex:"#EEF2FF",name:"浅紫白"},
      {hex:"#4F74E0",name:"蓝"},
      {hex:"#8AB4FF",name:"浅蓝"},
      {hex:"#6B7280",name:"灰"}
    ],
    goodFor:"语音助手、车载、智能音箱 App、免触控",
    badFor:"精确录入、无声环境、数据后台",
    demoHtml:'<div class="d63"><div class="orb"></div><div class="wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="cap">正在聆听…</div></div>'
  },
  {
    id:64, cat:"modern", name:"3D 产品预览", en:"3D Product Preview",
    desc:"旋转展品、展台、环绕弧",
    intro:"居中展台托起可旋转的 3D 展品，环绕弧线暗示 360° 预览，适合电商。让商品自己转起来，比静态图更有说服力。",
    prompt:"Design a 3D product preview module. Use: a centered stage platform with a rotating product object, a dashed arc hinting 360° view, soft shadows, light gradient background. Invite users to spin the product.",
    colors:[
      {hex:"#EEF0F5",name:"浅雾白"},
      {hex:"#8FA3CF",name:"浅蓝灰"},
      {hex:"#CFD8EE",name:"浅蓝"},
      {hex:"#8A94AD",name:"灰蓝"}
    ],
    goodFor:"电商商品页、硬件展示、3D 配置器、作品集",
    badFor:"纯内容页、低性能设备",
    demoHtml:'<div class="d64"><div class="stage"><div class="obj"></div><div class="arc"></div></div><div class="hint">360°</div></div>'
  },
  {
    id:65, cat:"modern", name:"渐变网格", en:"Gradient Mesh",
    desc:"模糊彩斑、暗底玻璃、梦幻光",
    intro:"用模糊的极光色斑在暗底晕开，叠半透明玻璃卡，营造流动梦幻的网格光。色彩如雾，信息如窗。",
    prompt:"Design a gradient mesh UI. Use: heavily blurred aurora color blobs (pink/cyan/violet) on near-black, a translucent glass card on top, soft glow, dreamy flowing light. Let color haze carry the mood.",
    colors:[
      {hex:"#08080F",name:"深黑"},
      {hex:"#FF2FB9",name:"粉"},
      {hex:"#00E0FF",name:"青"},
      {hex:"#7C5CFF",name:"紫"}
    ],
    goodFor:"音乐 App、夜间品牌、氛围首页、艺术项目",
    badFor:"高可读长文、数据密集、打印",
    demoHtml:'<div class="d65"><div class="m1"></div><div class="m2"></div><div class="m3"></div><div class="card"><b>Mesh</b><span>流动的渐变网格</span></div></div>'
  },
  {
    id:66, cat:"modern", name:"杂志编辑网格", en:"Editorial Magazine Grid",
    desc:"刊头、大标题、图文分栏",
    intro:"借鉴杂志排版：刊头小字、衬线大标题与图文分栏，让产品页像一期特稿。把功能写成文章，把界面做成刊物。",
    prompt:"Design an editorial magazine grid. Use: a kicker label, a large serif headline, a body column of gray bars, a byline rule, and a photo block, magazine-style two-column layout. Make the page read like a feature spread.",
    colors:[
      {hex:"#FFFFFF",name:"白"},
      {hex:"#141414",name:"墨黑"},
      {hex:"#B08D57",name:"金棕"},
      {hex:"#BFA27C",name:"暖棕"}
    ],
    goodFor:"品牌故事、内容站、特稿页、文创产品",
    badFor:"工具型后台、极简科技",
    demoHtml:'<div class="d66"><div class="left"><div class="kick">FEATURE</div><div class="hl">设计的克制</div><div class="body"><i></i><i></i><i></i><i></i></div><div class="by">文 / 编辑部</div></div><div class="ph"></div></div>'
  },
  {
    id:67, cat:"modern", name:"RGB 分离故障", en:"RGB Glitch",
    desc:"三色错位、扫描条、故障美学",
    intro:"用红青双影错位与扫描条制造数字故障感，致敬故障艺术与坏帧美学。不完美即态度，错位即风格。",
    prompt:"Design an RGB glitch UI. Use: red/cyan channel split with offset text, scanline bar, periodic glitch keyframes, near-black background, monospace tech type. Celebrate digital error as an aesthetic.",
    colors:[
      {hex:"#0B0B0F",name:"深黑"},
      {hex:"#FF0040",name:"故障红"},
      {hex:"#00FFF0",name:"故障青"},
      {hex:"#6B7280",name:"灰"}
    ],
    goodFor:"音乐视觉、赛博主题、故障艺术展、潮牌",
    badFor:"严肃商务、长文阅读、无障碍严格",
    demoHtml:'<div class="d67"><div class="word" data-t="GLITCH">GLITCH</div><div class="bar"></div><div class="cap">ERROR 0x66</div></div>'
  },
  {
    id:68, cat:"modern", name:"复古胶片", en:"Retro Film",
    desc:"白框照片、做旧、邮票章",
    intro:"模仿拍立得与胶片：白框照片、做旧暖调与歪斜印章，唤起实体照片的温度。数字里找回冲洗的仪式感。",
    prompt:"Design a retro film UI. Use: white-bordered photo with sepia warm gradient, subtle grain overlay, a tilted stamp badge, off-white background. Evoke the tactile warmth of printed film.",
    colors:[
      {hex:"#E8DCC8",name:"做旧白"},
      {hex:"#D9A76A",name:"暖棕"},
      {hex:"#A5643A",name:"深棕"},
      {hex:"#B9532F",name:"印章红"}
    ],
    goodFor:"摄影社区、旅行产品、纪念册、文创品牌",
    badFor:"科技炫酷、数据密集、现代极简",
    demoHtml:'<div class="d68"><div class="ph"></div><div class="col"><b>旧时光</b><span>一卷胶片的温度。</span><div class="stamp">RETRO</div></div></div>'
  }
];

/* zh 用于分组标题与详情页；tab 是顶栏 tab 的短名（必须 2 字，见 index.html「分类 tab」
   注释：Android 8 字体更宽，3 字标签会把整行顶到第二行），缺省回落到 zh。 */
var CATS = [
  {key:"general", zh:"通用", en:"General"},
  {key:"landing", zh:"落地页", en:"Landing", tab:"落地"},
  {key:"dashboard", zh:"仪表板", en:"Dashboard", tab:"仪表"},
  {key:"modern", zh:"现代", en:"Modern"}
];

var app = document.getElementById("app");
var tabs = document.getElementById("tabs");
var titleEl = document.getElementById("title");
var toastEl = document.getElementById("toast");
var fabTop = document.getElementById("fabTop");
var fabBack = document.getElementById("fabBack");
var activeCat = "all";
var viewMode = "list";      /* "list" | "detail"，用于判断该不该记列表的滚动位置 */
var listScrollY = 0;        /* 离开列表时的滚动位置，从详情返回时原地接上 */

var ICON_CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
var ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';

function $(cls, el){ return (el||app).querySelector("." + cls); }

function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(function(){ toastEl.classList.remove("show"); }, 1800);
}

function renderTabs(){
  tabs.innerHTML = "";
  var all = document.createElement("button");
  all.className = "tab" + (activeCat === "all" ? " active" : "");
  all.textContent = "全部";
  all.addEventListener("click", function(){ activeCat = "all"; renderTabs(); renderList(); });
  tabs.appendChild(all);
  CATS.forEach(function(c){
    var b = document.createElement("button");
    b.className = "tab" + (activeCat === c.key ? " active" : "");
    b.textContent = c.tab || c.zh;
    b.addEventListener("click", function(){ activeCat = c.key; renderTabs(); renderList(); });
    tabs.appendChild(b);
  });
}

function renderList(restoreY){
  titleEl.textContent = "设计风格图鉴";
  fabBack.classList.remove("show");
  tabs.style.display = "flex";
  app.innerHTML = "";
  var wrap = document.createElement("div");
  wrap.className = "list";

  CATS.forEach(function(c){
    if(activeCat !== "all" && activeCat !== c.key) return;
    var list = STYLES.filter(function(s){ return s.cat === c.key; });
    if(!list.length) return;

    var sec = document.createElement("section");
    sec.className = "section";
    var head = document.createElement("div");
    head.className = "section-head";
    head.innerHTML = '<h2>' + c.zh + '</h2><span class="en">' + c.en + '</span><span class="cnt">' + list.length + ' 种</span>';
    sec.appendChild(head);

    var grid = document.createElement("div");
    grid.className = "grid";
    list.forEach(function(s){
      var card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        '<div class="demo"><div class="demo-body">' + s.demoHtml + '</div></div>' +
        '<div class="card-info">' +
          '<div class="card-head"><span class="name">' + s.name + '</span>' + ICON_CHEV + '</div>' +
          '<div class="desc">' + s.desc + '</div>' +
        '</div>';
      card.addEventListener("click", function(){ location.hash = "#/s/" + s.id; });
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    wrap.appendChild(sec);
  });
  app.appendChild(wrap);
  /* 卡片高度固定，恢复滚动位置不必等布局变化；
     从详情返回时用离开前记下的位置，切分类 / 首次进入则为 0（回到顶部）。 */
  window.scrollTo(0, restoreY || 0);
}

function renderDetail(id){
  var s = null;
  for(var i = 0; i < STYLES.length; i++){ if(STYLES[i].id === id){ s = STYLES[i]; break; } }
  if(!s){ location.hash = "#/"; return; }

  var catZh = "通用";
  for(var j = 0; j < CATS.length; j++){ if(CATS[j].key === s.cat){ catZh = CATS[j].zh; break; } }

  titleEl.textContent = s.name;
  fabBack.classList.add("show");
  tabs.style.display = "none";
  app.innerHTML = "";

  var d = document.createElement("div");
  d.className = "detail";

  var hero = document.createElement("div");
  hero.className = "hero";
  hero.innerHTML = '<div class="demo"><div class="demo-body">' + s.demoHtml + '</div></div>';
  d.appendChild(hero);

  var catBadge = document.createElement("div");
  catBadge.className = "cat-badge";
  catBadge.textContent = catZh;
  d.appendChild(catBadge);

  var h2 = document.createElement("h2");
  h2.textContent = s.name;
  d.appendChild(h2);

  var en = document.createElement("div");
  en.className = "en-name";
  en.textContent = s.en;
  d.appendChild(en);

  var intro = document.createElement("div");
  intro.className = "block";
  intro.innerHTML = '<h3 class="h3-a">风格介绍</h3><p>' + s.intro + '</p>';
  d.appendChild(intro);

  var promptBlock = document.createElement("div");
  promptBlock.className = "block";
  promptBlock.innerHTML =
    '<h3 class="h3-b">AI 提示词</h3>' +
    '<p class="hint">点按下方提示词可全选，长按文字即可手动复制，再粘贴给 AI 生成该风格界面</p>' +
    '<div class="prompt-box"><pre>' + escapeHtml(s.prompt) + '</pre></div>' +
    '<button class="copy-btn" id="copyBtn">' + ICON_COPY + '复制提示词</button>';
  d.appendChild(promptBlock);

  var colorBlock = document.createElement("div");
  colorBlock.className = "block";
  var colorHtml = '<h3 class="h3-c">配色方案</h3>';
  colorHtml += '<div class="swatches">';
  s.colors.forEach(function(c){
    colorHtml += '<div class="swatch"><div class="chip" style="background:' + c.hex + '"></div><div class="cname">' + c.name + '</div><div class="hex">' + c.hex + '</div></div>';
  });
  colorHtml += '</div>';
  colorBlock.innerHTML = colorHtml;
  d.appendChild(colorBlock);

  var sceneBlock = document.createElement("div");
  sceneBlock.className = "block";
  sceneBlock.innerHTML =
    '<h3 class="h3-d">适用场景</h3>' +
    '<div class="scene">' +
      '<div class="col good"><h4>✓ 适用</h4><p>' + s.goodFor + '</p></div>' +
      '<div class="col bad"><h4>✗ 不适用</h4><p>' + s.badFor + '</p></div>' +
    '</div>';
  d.appendChild(sceneBlock);

  app.appendChild(d);

  var copyBtn = document.getElementById("copyBtn");
  copyBtn.addEventListener("click", function(){
    copyText(s.prompt, copyBtn);
  });

  window.scrollTo(0, 0);
}

function escapeHtml(str){
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function copyText(text, btn){
  // 容器禁用剪贴板 API（见 device-capabilities.md §3），改为选中提示词文本，
  // 引导用户长按文字手动复制。
  var box = btn && btn.closest ? btn.closest(".block") : null;
  var pre = box ? box.querySelector(".prompt-box pre") : null;
  if (pre) {
    var range = document.createRange();
    range.selectNodeContents(pre);
    var sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  }
  showToast("已选中提示词，请长按文字手动复制");
}

function route(){
  var h = location.hash || "#/";
  var m = h.match(/^#\/s\/(\d+)$/);
  if(m){
    /* 进详情前先记下列表翻到哪儿了（只在"列表 → 详情"时记，详情页内部跳转不覆盖）；
       详情页自己会回到顶部，返回列表时再原地接上，不必每次都从头翻。 */
    if(viewMode === "list"){
      listScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    }
    viewMode = "detail";
    renderDetail(parseInt(m[1], 10));
  } else {
    viewMode = "list";
    renderTabs();                  /* 保留已选分类：返回后仍是刚才那一组 */
    renderList(listScrollY);
  }
}

fabBack.addEventListener("click", function(){ location.hash = "#/"; });

fabTop.addEventListener("click", function(){
  try { window.scrollTo({top:0, behavior:"smooth"}); }
  catch(e){ window.scrollTo(0, 0); }
});

var scrollTicking = false;
window.addEventListener("scroll", function(){
  if(scrollTicking) return;
  scrollTicking = true;
  window.requestAnimationFrame(function(){
    scrollTicking = false;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if(y > 400){ fabTop.classList.add("show"); }
    else { fabTop.classList.remove("show"); }
  });
}, {passive:true});

window.addEventListener("hashchange", route);
route();

})();
