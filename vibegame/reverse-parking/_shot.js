/* 临时视觉自检脚本（交付前删除）：用 Playwright 跑起来截图 */
var PW = "C:/Users/dingj/AppData/Local/npm-cache/_npx/705bc6b22212b352/node_modules/playwright";
var fs = require("fs");
var path = require("path");
var chromium = require(PW).chromium;

var ROOT = "C:/Users/dingj/Documents/git/ai-dev-kit/vibegame/reverse-parking";
var OUT = path.join(ROOT, "_shots");
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

var mode = process.argv[2] || "all";

(async function () {
  var browser = await chromium.launch({
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"]
  });
  var page = await browser.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 1 });
  var logs = [];
  page.on("console", function (m) { logs.push(m.type() + ": " + m.text()); });
  page.on("pageerror", function (e) { logs.push("PAGEERROR: " + e.message); });

  await page.goto("file:///" + ROOT + "/index.html");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "01-menu.png") });

  await page.click("#btnStart");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "02-levels.png") });

  await page.click("#lvlGrid .lvlcard");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, "03-cockpit-lookback.png") });

  // 切回前视（座舱开出去的方向）
  await page.click("#btnGazeFront");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, "04-cockpit-forward.png") });

  // 倒一段距离，看运动状态下的画面
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(1600);
  await page.keyboard.up("ArrowUp");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, "05-reverse-moving.png") });

  // 三面后视镜注视
  await page.click("#btnGazeL");
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, "05b-left-mirror.png") });
  await page.click("#btnGazeC");
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, "05c-center-mirror.png") });
  await page.click("#btnGazeR");
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, "05d-right-mirror.png") });

  // 跟车视角
  await page.click("#btnViewChase");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, "06-chase.png") });

  // 小地图
  await page.click("#btnViewMap");
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "07-chase-map.png") });

  // 座舱 + 小地图（朝后，挂 R）
  await page.click("#btnViewCockpit");
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, "08-cockpit-map.png") });

  // 拖动环顾
  await page.click("#btnGazeFront");
  await page.waitForTimeout(700);
  await page.mouse.move(210, 430);
  await page.mouse.down();
  await page.mouse.move(320, 440, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "08b-drag-look.png") });

  // 暂停 / 设置 / 结算
  await page.click("#btnPause");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "09-pause.png") });
  await page.click("#btnResume");
  await page.waitForTimeout(200);
  await page.evaluate(function () { document.getElementById("settings").classList.remove("hidden"); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "10-settings.png") });
  await page.evaluate(function () { document.getElementById("settings").classList.add("hidden"); });

  console.log("DBG " + JSON.stringify(await page.evaluate(function () {
    var d = new THREE.Vector3(); mainCam.getWorldDirection(d);
    var m = car.userData.mirrorLocals[0];
    var w = new THREE.Vector3(m[0], m[1], m[2]); car.localToWorld(w);
    return { cam: mainCam.position.toArray(), dir: d.toArray(), mir: w.toArray(), gaze: gazeVec, ml: state.mirrorLook };
  })));
  console.log("--- console ---");
  console.log(logs.join("\n") || "(clean)");
  await browser.close();
})();
