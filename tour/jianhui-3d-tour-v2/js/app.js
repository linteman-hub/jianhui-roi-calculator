/* ============================================================
   简会 AI · 数字孪生总览（V2 · 第一阶段）
   仅包含 Logo 首页 + 3D 总览两屏；六个场景入口为占位。
   依赖：vendor/three.global.js、OrbitControls.global.js、kit.global.js
   ============================================================ */
(function () {
  'use strict';

  var THREE = window.THREE;
  var K = window.KIT;
  var TAU = Math.PI * 2;
  var PLATFORM_H = 0.55;

  var splash = document.getElementById('splash');
  var appEl = document.getElementById('app');
  var stage = document.getElementById('stage');
  var canvas = document.getElementById('gl');
  var moonEl = document.getElementById('nightMoon');
  var toastEl = document.getElementById('toast');
  var autoState = document.getElementById('autoState');
  var fallback = document.getElementById('stageFallback');
  var entered = false;

  function fatal(msg) {
    if (fallback) {
      fallback.hidden = false;
      var b = fallback.querySelector('b');
      if (b) b.textContent = msg;
    }
  }

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 2600);
  }

  function bindSplashOnly() {
    splash.addEventListener('click', function () {
      splash.classList.add('out');
      appEl.classList.add('in');
      appEl.setAttribute('aria-hidden', 'false');
    });
  }

  if (!THREE || !K) {
    fatal('3D 引擎加载失败');
    bindSplashOnly();
    return;
  }

  /* ---------------- 封面 → 总览 ---------------- */
  // 封面为独立一页：3D 场景自动旋转，点击 button/整页后才进入总览
  var coverActive = true;
  var coverTrans = null;

  function enterOverview() {
    if (entered || introPageActive) return;
    entered = true;
    coverActive = false;
    paused = true;
    splash.classList.add('out');
    splash.setAttribute('aria-hidden', 'true');
    appEl.classList.remove('cover');
    appEl.classList.add('in');
    appEl.setAttribute('aria-hidden', 'false');
    // 相机从封面当前角度平滑收束到总览机位，避免跳变
    var homePos = CAM_TARGET.clone().add(CAM_DIR.clone().multiplyScalar(fitDist));
    coverTrans = {
      startedAt: performance.now(),
      duration: 950,
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPos: homePos,
      toTarget: CAM_TARGET.clone()
    };
    viewShiftTarget = 0;
    setTimeout(function () {
      if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
    }, 760);
    setTimeout(measureNavTextBox, 700);
  }

  splash.addEventListener('click', enterOverview);
  splash.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      enterOverview();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!introPageActive && entered) return;
    e.preventDefault();
    if (introPageActive) dismissIntro();
    else enterOverview();
  });

  /* ---------------- 黑底 LOGO 入场页 → 封面 ---------------- */
  // 三段式：入场页 3.4s 自动淡出（可点击任意处跳过）→ 封面 → 总览
  var introEl = document.getElementById('intro');
  var introPageActive = !!introEl;
  var introTimer = null;
  function dismissIntro() {
    if (!introPageActive) return;
    introPageActive = false;
    clearTimeout(introTimer);
    if (!introEl) return;
    introEl.classList.add('out');
    introEl.setAttribute('aria-hidden', 'true');
    setTimeout(function () {
      if (introEl && introEl.parentNode) introEl.parentNode.removeChild(introEl);
    }, 720);
  }
  if (introEl) {
    introEl.addEventListener('click', dismissIntro);
    introTimer = setTimeout(dismissIntro, 3400);
  }

  /* ---------------- 渲染基础 ---------------- */
  var isMobile = window.matchMedia('(max-width: 900px)').matches;
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
  } catch (err) {
    fatal('浏览器未启用 WebGL');
    bindSplashOnly();
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // 场景静置时阴影贴图只在状态变化时重算，省掉每帧一整个 shadow pass
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.setClearColor(0x000000, 0);

  // 封面是一层独立页面：canvas 先可见（右侧 3D 自动旋转），UI 由 .cover 隐藏
  appEl.classList.add('in', 'cover');

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xEDF2F8, 120, 235);

  var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 320);
  var controls = new window.OrbitControls(camera, canvas);
  var CAM_TARGET = new THREE.Vector3(0, 3.0, 0);
  var CAM_DIR = new THREE.Vector3(0.56, 0.67, 0.5).normalize();
  var fitDist = 90;
  var introActive = false;
  var introT = 0;
  var introStartedAt = 0;
  var introScale = 1;

  camera.position.copy(CAM_TARGET).add(CAM_DIR.clone().multiplyScalar(fitDist));
  controls.target.copy(CAM_TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.42;
  controls.minPolarAngle = 0.5;
  controls.maxPolarAngle = 1.32;
  controls.rotateSpeed = 0.62;
  controls.zoomSpeed = 0.62;

  var paused = false;
  var resumeTimer = null;
  // 总览按参考图不做自动旋转；进入场景后同样保持关闭
  var autoRotateAllowed = false;

  controls.addEventListener('start', function () {
    if (!entered) return;
    paused = true;
    clearTimeout(resumeTimer);
    if (autoState) autoState.textContent = '已暂停 · 松开后继续';
  });
  controls.addEventListener('end', function () {
    if (!entered) return;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(function () {
      paused = false;
      if (autoState) autoState.textContent = autoRotateAllowed ? '缓慢自动旋转中' : '手动浏览';
    }, 3000);
  });

  /* ---------------- 灯光 ---------------- */
  var hemi = new THREE.HemisphereLight(0xFFFFFF, 0xC8D2DF, 0.9);
  scene.add(hemi);

  var sun = new THREE.DirectionalLight(0xFFF7EA, 2.0);
  sun.position.set(38, 54, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isMobile ? 512 : 1024, isMobile ? 512 : 1024);
  sun.shadow.camera.left = -46;
  sun.shadow.camera.right = 46;
  sun.shadow.camera.top = 46;
  sun.shadow.camera.bottom = -46;
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 150;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  var fill = new THREE.DirectionalLight(0xDCEAFF, 0.52);
  fill.position.set(-32, 28, -26);
  scene.add(fill);

  var bounce = new THREE.AmbientLight(0xFFFFFF, 0.1);
  scene.add(bounce);

  // 冷色月光（仅场景①夜色时点亮）
  var moonLight = new THREE.DirectionalLight(0x9DB8E8, 0);
  moonLight.position.set(-22, 30, -16);
  scene.add(moonLight);

  // 夜色插值：0 = 白天，1 = 夜景。由每帧按目标值平滑过渡，避免瞬间切换。
  var nightMix = 0;
  var nightTarget = 0;

  /* ---------------- 场景容器 ---------------- */
  var world = new THREE.Group();
  scene.add(world);

  var campus = new THREE.Group();
  campus.position.y = PLATFORM_H;
  world.add(campus);

  var anims = [];
  var zoneTags = [];
  var zoneDefs = [];
  var sceneRefs = {};
  var clickScreens = [];
  var interactives = [];
  var demoVideoEl = null;

  /* ---------------- 通用工具 ---------------- */
  function box(w, h, d, mat) {
    return K.box(w, h, d, mat);
  }

  function glassMat(color, opacity) {
    return new THREE.MeshStandardMaterial({
      color: color || 0xD7EBFA,
      transparent: true,
      opacity: opacity == null ? 0.22 : opacity,
      roughness: 0.12,
      metalness: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }

  function roundedShape(w, d, r) {
    var s = new THREE.Shape();
    var x = -w / 2;
    var y = -d / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + d - r);
    s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    s.lineTo(x + r, y + d);
    s.quadraticCurveTo(x, y + d, x, y + d - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  function ellipseLine(rx, rz, y, color, opacity, dashed) {
    var pts = [];
    for (var i = 0; i <= 160; i++) {
      var a = (i / 160) * TAU;
      pts.push(new THREE.Vector3(Math.cos(a) * rx, y, Math.sin(a) * rz));
    }
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    var mat = dashed
      ? new THREE.LineDashedMaterial({ color: color, dashSize: 0.8, gapSize: 0.9, transparent: true, opacity: opacity })
      : new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity });
    var line = new THREE.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    return line;
  }

  function makeWalker(x0, z0, x1, z1, speed, shirt) {
    var p = K.person({ shirt: shirt || '#4A6FA5', pants: '#39424E', pose: 'walk', s: 0.92 });
    p.position.set(x0, 0, z0);
    p.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    p.userData.tick = function (t) {
      var u = ((t * speed) % 1 + 1) % 1;
      var e = u * u * (3 - 2 * u);
      p.position.x = x0 + (x1 - x0) * e;
      p.position.z = z0 + (z1 - z0) * e;
      var limbs = p.userData.limbs;
      if (limbs) {
        limbs.armL.rotation.x = Math.sin(t * 5) * 0.45;
        limbs.armR.rotation.x = -Math.sin(t * 5) * 0.45;
      }
    };
    campus.add(p);
    return p;
  }

  function makeScreen(w, h, drawFn) {
    var cvs = K.canvasTexture(512, 320, function (c) {
      drawFn(c, 512, 320, 0);
    });
    var mesh = K.screenMesh(cvs, w);
    var last = -1;
    mesh.userData.tick = function (t) {
      var step = Math.floor(t * 2.2);
      if (step === last) return;
      last = step;
      drawFn(cvs.ctx, 512, 320, t);
      cvs.tex.needsUpdate = true;
    };
    mesh.userData.h = w * 320 / 512;
    return mesh;
  }

  function drawDashboard(c, w, h, t) {
    c.fillStyle = '#07182C';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(74, 142, 255, .13)';
    c.lineWidth = 1;
    for (var x = 0; x < w; x += 32) {
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
    }
    for (var y = 0; y < h; y += 32) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
    }
    c.fillStyle = '#2F5BE8';
    c.fillRect(0, 0, w, 5);
    c.fillStyle = 'rgba(53, 162, 255, .23)';
    c.fillRect(24, 36, 96, 4);
    c.fillRect(24, 48, 58, 3);

    for (var i = 0; i < 12; i++) {
      var bh = 26 + (Math.sin(t * 1.5 + i * 0.7) * 0.5 + 0.5) * 54;
      var bx = 34 + i * 35;
      c.fillStyle = i % 3 === 0 ? '#35A2FF' : 'rgba(79, 132, 236, .78)';
      c.fillRect(bx, 250 - bh, 18, bh);
    }

    c.strokeStyle = '#7EE7FF';
    c.lineWidth = 2.4;
    c.beginPath();
    for (var px = 0; px <= w - 70; px += 6) {
      var py = 120 + Math.sin(px * 0.026 + t * 1.2) * 18 + Math.sin(px * 0.01 + t * 0.4) * 10;
      if (px === 0) c.moveTo(30 + px, py); else c.lineTo(30 + px, py);
    }
    c.stroke();

    c.fillStyle = 'rgba(53, 162, 255, .9)';
    for (var d = 0; d < 7; d++) {
      var a = t * 0.5 + d * TAU / 7;
      c.beginPath();
      c.arc(w - 92 + Math.cos(a) * 34, 86 + Math.sin(a) * 34, 3.2, 0, TAU);
      c.fill();
    }
    c.strokeStyle = 'rgba(126, 231, 255, .45)';
    c.lineWidth = 1.2;
    c.beginPath(); c.arc(w - 92, 86, 42, 0, TAU); c.stroke();
  }

  function drawMatrix(c, w, h, t) {
    c.fillStyle = '#081A31';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(84, 146, 255, .15)';
    c.lineWidth = 1;
    for (var i = 0; i < 9; i++) {
      var x = 30 + i * 55;
      c.beginPath(); c.moveTo(x, 22); c.lineTo(x, h - 22); c.stroke();
    }
    for (var row = 0; row < 5; row++) {
      var yy = 50 + row * 52;
      c.beginPath(); c.moveTo(24, yy); c.lineTo(w - 24, yy); c.stroke();
    }
    for (var n = 0; n < 28; n++) {
      var ax = 42 + (n % 7) * 68;
      var ay = 62 + Math.floor(n / 7) * 52;
      var pulse = Math.sin(t * 1.1 + n * 0.9) * 0.5 + 0.5;
      c.fillStyle = n % 4 === 0 ? 'rgba(255, 192, 0, .9)' : 'rgba(53, 162, 255, .8)';
      c.beginPath();
      c.arc(ax + Math.sin(t * 0.3 + n) * 2, ay, 3 + pulse * 4, 0, TAU);
      c.fill();
    }
    c.strokeStyle = '#7EE7FF';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(30, h - 44);
    for (var p = 0; p < 12; p++) {
      c.lineTo(30 + p * 40, h - 44 - (Math.sin(t * 1.4 + p * 0.8) * 0.5 + 0.5) * 46);
    }
    c.stroke();
  }

  /* ---------------- 场景②质检屏：AI 识别画面（图纸线框 + 气泡 + 识别列表） ---------------- */
  function drawAiScreen(c, w, h, t) {
    c.fillStyle = '#0A1B30';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(94, 148, 220, .5)';
    c.lineWidth = 1.4;
    c.strokeRect(22, 28, 304, 246);
    // 图纸线框
    c.strokeStyle = 'rgba(160, 200, 255, .85)';
    c.lineWidth = 1.6;
    c.strokeRect(58, 66, 132, 92);
    c.beginPath(); c.arc(232, 192, 42, 0, TAU); c.stroke();
    c.beginPath(); c.arc(232, 192, 24, 0, TAU); c.stroke();
    c.setLineDash([6, 5]);
    c.strokeStyle = 'rgba(120, 170, 255, .45)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(232, 132); c.lineTo(232, 252); c.stroke();
    c.beginPath(); c.moveTo(172, 192); c.lineTo(292, 192); c.stroke();
    c.setLineDash([]);
    // 呼吸气泡 ×5
    var bubbles = [[58, 58], [158, 58], [300, 118], [232, 258], [108, 222]];
    bubbles.forEach(function (bp, i) {
      var pu = Math.sin(t * 2 + i * 1.3) * 0.5 + 0.5;
      c.strokeStyle = 'rgba(255, 192, 0, ' + (0.5 + pu * 0.5) + ')';
      c.lineWidth = 2;
      c.beginPath(); c.arc(bp[0], bp[1], 11 + pu * 2.5, 0, TAU); c.stroke();
      c.fillStyle = '#FFC000';
      c.font = 'bold 11px monospace';
      c.fillText('0' + (i + 1), bp[0] - 7, bp[1] + 4);
    });
    // 右侧识别列表
    c.fillStyle = 'rgba(46, 91, 232, .16)';
    c.fillRect(346, 28, 146, 246);
    c.fillStyle = '#7EA6F5';
    c.font = 'bold 12px sans-serif';
    c.fillText('AI 识别 · 95%+', 356, 50);
    var rows = [['Φ12 ±0.02', '已识别'], ['Φ30 ±0.05', '已识别'], ['M8 螺纹孔', '已核对'], ['R5 圆角', '已识别'], ['45° 倒角', '已核对']];
    rows.forEach(function (r, i) {
      var y = 76 + i * 40;
      c.fillStyle = 'rgba(255, 255, 255, .08)';
      c.fillRect(354, y - 16, 130, 30);
      c.fillStyle = '#DCE8FF';
      c.font = '11px sans-serif';
      c.fillText(r[0], 362, y + 3);
      c.fillStyle = r[1] === '已核对' ? '#35D0A0' : '#35A2FF';
      c.font = 'bold 10px sans-serif';
      c.fillText(r[1], 440, y + 3);
      var pu2 = Math.sin(t * 2 + i * 1.3) * 0.5 + 0.5;
      c.fillStyle = 'rgba(255, 192, 0, ' + (0.3 + pu2 * 0.4) + ')';
      c.fillRect(354, y + 10, 130 * (0.55 + pu2 * 0.4), 2);
    });
  }

  /* ---------------- 场景②质检屏：真实系统入口（静态） ---------------- */
  function drawLinkScreen(c, w, h) {
    var grd = c.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#122B52');
    grd.addColorStop(1, '#2F5BE8');
    c.fillStyle = grd;
    c.fillRect(0, 0, w, h);
    c.textAlign = 'center';
    c.fillStyle = 'rgba(255, 255, 255, .95)';
    c.font = 'bold 30px sans-serif';
    c.fillText('简会 AI 图纸识别系统', w / 2, h / 2 - 40);
    c.font = '14px monospace';
    c.fillStyle = 'rgba(126, 231, 255, .9)';
    c.fillText('balloondemo.xmjianhui.com', w / 2, h / 2 - 10);
    var bx = w / 2 - 78, by = h / 2 + 16, bw = 156, bh = 38, br = 19;
    c.fillStyle = '#FFC000';
    c.beginPath();
    c.moveTo(bx + br, by);
    c.arcTo(bx + bw, by, bx + bw, by + bh, br);
    c.arcTo(bx + bw, by + bh, bx, by + bh, br);
    c.arcTo(bx, by + bh, bx, by, br);
    c.arcTo(bx, by, bx + bw, by, br);
    c.fill();
    c.fillStyle = '#12203C';
    c.font = 'bold 15px sans-serif';
    c.fillText('点击打开真实系统 →', w / 2, by + 25);
    c.textAlign = 'left';
  }

  /* ---------------- 场景②工位屏：演示视频预览（静帧，点击后播放） ---------------- */
  function drawVideoPreview(c, w, h) {
    c.fillStyle = '#0A1424';
    c.fillRect(0, 0, w, h);
    // 顶部播放器条
    c.fillStyle = '#101E36';
    c.fillRect(0, 0, w, 42);
    c.fillStyle = 'rgba(53, 162, 255, .18)';
    c.fillRect(0, 0, w, 3);
    c.fillStyle = '#8FA6C8';
    c.font = 'bold 16px monospace';
    c.fillText('AI DRAWING · DEMO', 20, 27);
    c.fillStyle = 'rgba(255, 192, 0, .95)';
    c.beginPath(); c.arc(w - 44, 21, 6, 0, TAU); c.fill();
    c.fillStyle = '#DCE8FF';
    c.font = '13px monospace';
    c.fillText('02:00', w - 128, 26);
    // 缩略画面：图纸 + 识别框
    c.strokeStyle = 'rgba(120, 170, 255, .35)';
    c.lineWidth = 1.2;
    c.strokeRect(28, 64, w - 56, h - 104);
    c.strokeStyle = 'rgba(170, 205, 255, .8)';
    c.lineWidth = 1.8;
    c.strokeRect(70, 92, 150, 104);
    c.strokeRect(250, 92, 190, 62);
    c.setLineDash([5, 4]);
    c.strokeStyle = 'rgba(255, 192, 0, .55)';
    c.beginPath(); c.moveTo(70, 210); c.lineTo(220, 210); c.stroke();
    c.setLineDash([]);
    // 播放按钮
    c.fillStyle = 'rgba(47, 91, 232, .92)';
    c.beginPath(); c.arc(w / 2, h / 2 + 6, 34, 0, TAU); c.fill();
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(w / 2 - 9, h / 2 - 8);
    c.lineTo(w / 2 + 15, h / 2 + 6);
    c.lineTo(w / 2 - 9, h / 2 + 20);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(220, 232, 255, .72)';
    c.font = 'bold 15px sans-serif';
    c.textAlign = 'center';
    c.fillText('点击播放演示视频', w / 2, h - 22);
    c.textAlign = 'left';
  }

  /* ---------------- 车间墙面看板（场景①②背景墙内容） ---------------- */
  function makeWallBoard(pw, drawFn) {
    var cvs = K.canvasTexture(1024, 384, function (c, w, h) { drawFn(c, w, h); });
    var mesh = K.screenMesh(cvs, pw);
    return mesh;
  }

  function drawPainBoard(c, w, h) {
    c.fillStyle = '#FFFFFF';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#D8E0EA';
    c.lineWidth = 6;
    c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = '#D64545';
    c.fillRect(0, 0, 14, h);
    c.fillStyle = '#D64545';
    c.font = 'bold 24px monospace';
    c.fillText('PAIN POINTS / 车间现场', 48, 42);
    c.fillStyle = '#132039';
    c.font = 'bold 56px "Microsoft YaHei",sans-serif';
    c.fillText('质检做图纸 · 现状痛点', 46, 100);
    c.fillStyle = '#7A8AA0';
    c.font = '24px "Microsoft YaHei",sans-serif';
    c.fillText('传统人工质检 · 一张图纸 2 小时', 46, 136);
    c.fillStyle = '#D64545';
    c.font = 'bold 86px "Microsoft YaHei",sans-serif';
    c.fillText('100-200', 44, 240);
    c.fillStyle = '#4A5A70';
    c.font = '30px "Microsoft YaHei",sans-serif';
    c.fillText('个尺寸 / 张图纸', 372, 240);

    // 底部三个结论标签（远看可辨认，细节由右侧卡片承载）
    var tags = ['效率低', '易疲劳', '易出错'];
    tags.forEach(function (t, i) {
      var x = 48 + i * 312;
      c.fillStyle = 'rgba(214, 69, 69, .12)';
      c.fillRect(x, 296, 292, 58);
      c.strokeStyle = 'rgba(214, 69, 69, .5)';
      c.lineWidth = 2;
      c.strokeRect(x, 296, 292, 58);
      c.fillStyle = '#C23B3B';
      c.font = 'bold 40px "Microsoft YaHei",sans-serif';
      c.textAlign = 'center';
      c.fillText(t, x + 146, 337);
      c.textAlign = 'left';
    });
  }

  function drawGainBoard(c, w, h) {
    var grd = c.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#0E2144');
    grd.addColorStop(1, '#1B3E86');
    c.fillStyle = grd;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(126, 231, 255, .35)';
    c.lineWidth = 5;
    c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = 'rgba(126, 231, 255, .85)';
    c.font = 'bold 24px monospace';
    c.fillText('AI VISION / BENEFITS', 48, 42);
    c.fillStyle = '#FFFFFF';
    c.font = 'bold 56px "Microsoft YaHei",sans-serif';
    c.fillText('用了 AI 识图 · 带来的好处', 46, 100);
    c.fillStyle = 'rgba(180, 208, 255, .85)';
    c.font = '24px "Microsoft YaHei",sans-serif';
    c.fillText('简会 AI 图纸识别 · 单张约 10 分钟', 46, 136);
    c.fillStyle = '#7EE7FF';
    c.font = 'bold 86px "Microsoft YaHei",sans-serif';
    c.fillText('10 分钟', 44, 240);
    c.fillStyle = 'rgba(200, 220, 255, .8)';
    c.font = '30px "Microsoft YaHei",sans-serif';
    c.fillText('AI 识别 / 张图纸', 350, 240);

    var tags = ['效率 ×10', '更准确', '更轻松'];
    tags.forEach(function (t, i) {
      var x = 48 + i * 312;
      c.fillStyle = 'rgba(126, 231, 255, .14)';
      c.fillRect(x, 296, 292, 58);
      c.strokeStyle = 'rgba(126, 231, 255, .55)';
      c.lineWidth = 2;
      c.strokeRect(x, 296, 292, 58);
      c.fillStyle = '#C7F1FF';
      c.font = 'bold 40px "Microsoft YaHei",sans-serif';
      c.textAlign = 'center';
      c.fillText(t, x + 146, 337);
      c.textAlign = 'left';
    });
  }

  /* ---------------- 场景②：PPT 真实数据小看板（静态，不虚构） ---------------- */
  function makeMetricScreen(pw, cfg) {
    var cvs = K.canvasTexture(512, 320, function (c, w, h) {
      var grd = c.createLinearGradient(0, 0, w, h);
      grd.addColorStop(0, '#07182C');
      grd.addColorStop(1, '#12356B');
      c.fillStyle = grd;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(126, 231, 255, .35)';
      c.lineWidth = 3;
      c.strokeRect(2, 2, w - 4, h - 4);
      c.fillStyle = cfg.accent;
      c.fillRect(0, 0, w, 6);
      c.fillStyle = 'rgba(126, 231, 255, .9)';
      c.font = 'bold 15px monospace';
      c.fillText(cfg.tag, 24, 38);
      c.fillStyle = cfg.accent;
      c.font = 'bold 64px monospace';
      c.fillText(cfg.big, 22, 124);
      c.fillStyle = '#FFFFFF';
      c.font = 'bold 21px "Microsoft YaHei",sans-serif';
      c.fillText(cfg.sub, 22, 160);
      c.fillStyle = 'rgba(190, 214, 255, .9)';
      c.font = '16px "Microsoft YaHei",sans-serif';
      c.fillText(cfg.line, 22, 196);
      c.fillStyle = 'rgba(79, 132, 236, .55)';
      for (var i = 0; i < 10; i++) {
        var bh = 14 + ((i * 37) % 52);
        c.fillRect(24 + i * 46, 300 - bh, 16, bh);
      }
      c.fillStyle = 'rgba(126, 231, 255, .8)';
      c.fillRect(24, 302, 464, 2);
    });
    return K.screenMesh(cvs, pw);
  }

  /* ---------------- 平台 ---------------- */
  function buildPlatform() {
    var shadowCvs = K.canvasTexture(256, 256, function (c, w, h) {
      var grad = c.createRadialGradient(w / 2, h / 2, 8, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(28, 48, 78, .42)');
      grad.addColorStop(0.55, 'rgba(28, 48, 78, .16)');
      grad.addColorStop(1, 'rgba(28, 48, 78, 0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
    });
    var underShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(66, 50),
      new THREE.MeshBasicMaterial({ map: shadowCvs.tex, transparent: true, opacity: 0.65, depthWrite: false })
    );
    underShadow.rotation.x = -Math.PI / 2;
    underShadow.position.y = -0.02;
    world.add(underShadow);

    var shape = roundedShape(56, 40, 5.5);
    var geo = new THREE.ExtrudeGeometry(shape, { depth: PLATFORM_H, bevelEnabled: false, curveSegments: 14 });
    geo.rotateX(-Math.PI / 2);
    var topMat = new THREE.MeshStandardMaterial({ color: 0xE6EBF2, roughness: 0.95, metalness: 0 });
    var sideMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.9, metalness: 0 });
    var mesh = new THREE.Mesh(geo, [topMat, sideMat]);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    world.add(mesh);

    var pts = roundedShape(55.2, 39.2, 5.2).getPoints(120).map(function (p) {
      return new THREE.Vector3(p.x, PLATFORM_H + 0.008, -p.y);
    });
    var outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x6F8ABD, transparent: true, opacity: 0.24 })
    );
    world.add(outline);
    return mesh;
  }

  /* ---------------- 道路与广场 ---------------- */
  function buildRoads() {
    var ring = new THREE.Mesh(new THREE.RingGeometry(19.8, 22.8, 96, 1), K.M('#D3DAE5', { rough: 0.96 }));
    ring.rotation.x = -Math.PI / 2;
    ring.scale.y = 0.72;
    ring.position.y = 0.012;
    ring.receiveShadow = true;
    campus.add(ring);

    var curbOuter = ellipseLine(22.9, 22.9 * 0.72, 0.016, 0xFFFFFF, 0.72, false);
    var curbInner = ellipseLine(19.7, 19.7 * 0.72, 0.016, 0xFFFFFF, 0.55, false);
    campus.add(curbOuter, curbInner);

    var dash = ellipseLine(21.3, 21.3 * 0.72, 0.02, 0xFFFFFF, 0.7, true);
    campus.add(dash);

    var plaza = new THREE.Mesh(new THREE.CircleGeometry(4.7, 64), K.M('#EDF1F6', { rough: 0.95 }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.014;
    plaza.receiveShadow = true;
    campus.add(plaza);

    var plazaRing = new THREE.Mesh(new THREE.RingGeometry(4.45, 4.7, 64), K.M('#2F5BE8', { rough: 0.5, op: 0.18 }));
    plazaRing.rotation.x = -Math.PI / 2;
    plazaRing.position.y = 0.017;
    campus.add(plazaRing);

    var cross1 = box(16.2, 0.02, 2.5, K.M('#D3DAE5'));
    cross1.position.set(-12.2, 0.014, 1.0);
    cross1.receiveShadow = true;
    campus.add(cross1);
    var cross2 = cross1.clone();
    cross2.position.x = 12.2;
    campus.add(cross2);

    var centerLine1 = box(13.6, 0.018, 0.06, K.M('#FFFFFF'));
    centerLine1.position.set(-12.2, 0.026, 1.0);
    campus.add(centerLine1);
    var centerLine2 = centerLine1.clone();
    centerLine2.position.x = 12.2;
    campus.add(centerLine2);

    var entry = box(4.4, 0.02, 4.2, K.M('#D3DAE5'));
    entry.position.set(-8, 0.014, 17.3);
    entry.receiveShadow = true;
    campus.add(entry);

    for (var i = 0; i < 5; i++) {
      var stripe = box(0.5, 0.018, 2.4, K.M('#FFFFFF'));
      stripe.position.set(-9.4 + i * 0.7, 0.027, 17.4);
      campus.add(stripe);
    }

    var lot = box(6.2, 0.02, 2.6, K.M('#D3DAE5'));
    lot.position.set(-14.5, 0.014, 17.35);
    lot.receiveShadow = true;
    campus.add(lot);

    for (var s = 0; s < 3; s++) {
      var slot = box(0.05, 0.018, 2.2, K.M('#FFFFFF', { op: 0.75 }));
      slot.position.set(-16.1 + s * 1.8, 0.027, 17.35);
      campus.add(slot);
    }

    var c1 = K.car('#FFFFFF'); c1.position.set(-15.4, 0, 17.35); c1.rotation.y = Math.PI / 2; campus.add(c1);
    var c2 = K.car('#9AA6B6'); c2.position.set(-13.6, 0, 17.35); c2.rotation.y = Math.PI / 2; campus.add(c2);
    var c3 = K.car('#D64545'); c3.position.set(-11.8, 0, 17.35); c3.rotation.y = Math.PI / 2; campus.add(c3);

    var t1 = K.truck('#FFFFFF'); t1.position.set(-5.4, 0, 1.8); t1.rotation.y = Math.PI / 2; campus.add(t1);
    var c4 = K.car('#2F5BE8'); c4.position.set(7.2, 0, 1.5); c4.rotation.y = -Math.PI / 2; campus.add(c4);

    var lightL = K.lightStrip(0.9, 14, -12.2, 1.0, Math.PI / 2, '#35A2FF');
    lightL.position.y = 0.032;
    campus.add(lightL);
    var lightR = K.lightStrip(0.9, 14, 12.2, 1.0, Math.PI / 2, '#35A2FF');
    lightR.position.y = 0.032;
    campus.add(lightR);

    var street = new THREE.Group();
    for (var a = 0; a < 8; a++) {
      var ang = a / 8 * TAU;
      var pole = box(0.07, 2.7, 0.07, K.M('#B9C4D2'));
      pole.position.set(Math.cos(ang) * 23.2, 1.35, Math.sin(ang) * 23.2 * 0.72);
      var arm = box(0.7, 0.05, 0.05, K.M('#B9C4D2'));
      arm.position.set(pole.position.x - 0.28, 2.66, pole.position.z);
      var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xFFF2C4 }));
      lamp.position.set(pole.position.x - 0.56, 2.63, pole.position.z);
      street.add(pole, arm, lamp);
    }
    campus.add(street);
  }

  /* ---------------- 景观 ---------------- */
  function buildLandscape() {
    var seed = 1977;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

    var positions = [];
    for (var x = -25; x <= 25; x += 4.1) {
      if (Math.abs(x + 8) > 4.6) positions.push([x, 18.55]);
    }
    for (var x2 = -24; x2 <= 24; x2 += 4.4) positions.push([x2, -18.55]);
    for (var z = -17; z <= 17; z += 4.2) {
      positions.push([-26.2, z]);
      positions.push([26.2, z]);
    }
    [
      [-8, 15.2], [10, 13.2], [11.5, 0.6], [9.2, -1.6], [-2.6, 12.4],
      [-20.2, -0.6], [1.8, -5.2], [7.2, -4.6], [-1.8, 15.4], [24.6, 13.6]
    ].forEach(function (p) { positions.push(p); });

    positions.forEach(function (p, i) {
      if (i > 30 && rnd() < 0.28) return;
      var tr = K.tree(p[0], p[1], 0.86 + rnd() * 0.42);
      campus.add(tr);
    });

    for (var b = 0; b < 16; b++) {
      var ang = rnd() * TAU;
      var rr = 24 + rnd() * 2.2;
      var bush = new THREE.Mesh(new THREE.SphereGeometry(0.28 + rnd() * 0.18, 7, 6), K.M('#9DC7A8'));
      bush.position.set(Math.cos(ang) * rr, 0.18, Math.sin(ang) * rr * 0.72);
      bush.scale.y = 0.65;
      bush.castShadow = true;
      campus.add(bush);
    }

    var bench1 = new THREE.Group();
    var seat1 = box(1.5, 0.08, 0.4, K.M('#C9A876'));
    seat1.position.y = 0.42; bench1.add(seat1);
    var leg1 = box(0.08, 0.38, 0.08, K.M('#8B939E'));
    leg1.position.set(-0.55, 0.19, 0); bench1.add(leg1);
    var leg2 = leg1.clone(); leg2.position.x = 0.55; bench1.add(leg2);
    bench1.position.set(-3.2, 0, 2.5); bench1.rotation.y = 0.4; campus.add(bench1);
  }

  /* ---------------- 中央 AI 装置 ---------------- */
  function buildCenter() {
    var g = new THREE.Group();
    campus.add(g);

    var base = K.cyl(1.45, 1.7, 0.3, '#FFFFFF', 28);
    base.position.y = 0.15;
    base.castShadow = true;
    g.add(base);

    var baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.7, 0.04, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0x35A2FF, transparent: true, opacity: 0.65 })
    );
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = 0.32;
    g.add(baseRing);

    var beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.08, 3.1, 10),
      new THREE.MeshBasicMaterial({ color: 0x7EE7FF, transparent: true, opacity: 0.55 })
    );
    beam.position.y = 1.9;
    g.add(beam);

    var core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.16, 1),
      new THREE.MeshStandardMaterial({ color: 0x2F5BE8, wireframe: true, transparent: true, opacity: 0.78, roughness: 0.3 })
    );
    core.position.y = 3.55;
    g.add(core);

    var shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.02, 1),
      new THREE.MeshStandardMaterial({ color: 0xBFE9FF, transparent: true, opacity: 0.12, roughness: 0.1, metalness: 0.2 })
    );
    shell.position.y = 3.55;
    g.add(shell);

    var ringA = new THREE.Mesh(
      new THREE.TorusGeometry(1.72, 0.035, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0x35A2FF, transparent: true, opacity: 0.55 })
    );
    ringA.position.y = 3.55;
    ringA.rotation.x = Math.PI / 2.4;
    g.add(ringA);

    var ringB = ringA.clone();
    ringB.material = new THREE.MeshBasicMaterial({ color: 0xFFC000, transparent: true, opacity: 0.4 });
    ringB.rotation.set(Math.PI / 3.1, 0.7, 0);
    g.add(ringB);

    var satellites = new THREE.Group();
    for (var i = 0; i < 7; i++) {
      var cube = box(0.16, 0.16, 0.16, K.M(i % 2 === 0 ? '#35A2FF' : '#FFC000', { rough: 0.3 }));
      var a = i / 7 * TAU;
      cube.position.set(Math.cos(a) * 2.25, 3.55 + Math.sin(a * 2) * 0.45, Math.sin(a) * 2.25);
      satellites.add(cube);
    }
    g.add(satellites);

    var holo = K.holoRing(2.55, 0x35A2FF);
    holo.position.y = 1.15;
    g.add(holo);

    for (var b = 0; b < 8; b++) {
      var ang = b / 8 * TAU;
      var post = K.cyl(0.055, 0.055, 0.55, '#D6E0EC', 8);
      post.position.set(Math.cos(ang) * 5.35, 0.275, Math.sin(ang) * 5.35);
      var cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x35A2FF })
      );
      cap.position.set(post.position.x, 0.57, post.position.z);
      g.add(post, cap);
    }

    g.userData.tick = function (t) {
      core.rotation.y = t * 0.38;
      core.rotation.x = Math.sin(t * 0.3) * 0.12;
      shell.rotation.y = -t * 0.22;
      ringA.rotation.z = t * 0.5;
      ringB.rotation.y = -t * 0.35;
      satellites.rotation.y = t * 0.55;
      baseRing.material.opacity = 0.5 + Math.sin(t * 1.6) * 0.14;
    };
  }

  /* ---------------- 夜景天空 + 月亮（场景①专用） ---------------- */
  function buildNightSky(parent) {
    var group = new THREE.Group();

    var skyCvs = K.canvasTexture(1024, 512, function (c, w, h) {
      var g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#04070E');
      g.addColorStop(0.40, '#0A1322');
      g.addColorStop(0.76, '#152238');
      g.addColorStop(1, '#243553');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      var seed = 911;
      function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
      for (var i = 0; i < 170; i++) {
        var x = rnd() * w, y = rnd() * h * 0.74;
        var a = 0.18 + rnd() * 0.55, r = 0.5 + rnd() * 1.4;
        c.fillStyle = 'rgba(214,232,255,' + a.toFixed(2) + ')';
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      }
      var hg = c.createLinearGradient(0, h * 0.58, 0, h);
      hg.addColorStop(0, 'rgba(90,130,200,0)');
      hg.addColorStop(1, 'rgba(96,140,214,.22)');
      c.fillStyle = hg;
      c.fillRect(0, h * 0.58, w, h * 0.42);
    });
    var sky = new THREE.Mesh(new THREE.PlaneGeometry(120, 60),
      new THREE.MeshBasicMaterial({ map: skyCvs.tex, transparent: true, opacity: 0, depthWrite: false }));
    sky.position.set(0, 16, -32);
    sky.renderOrder = -1;
    group.add(sky);

    // 月亮：柔和边缘圆盘 + 极淡光晕（不做发光球体）
    var moonCvs = K.canvasTexture(256, 256, function (c, w, h) {
      var cx = w / 2, cy = h / 2;
      var halo = c.createRadialGradient(cx, cy, 26, cx, cy, 124);
      halo.addColorStop(0, 'rgba(206,226,255,.22)');
      halo.addColorStop(.45, 'rgba(170,198,244,.085)');
      halo.addColorStop(1, 'rgba(120,160,230,0)');
      c.fillStyle = halo; c.fillRect(0, 0, w, h);
      c.beginPath(); c.arc(cx, cy, 76, 0, TAU);
      var mg = c.createRadialGradient(cx - 24, cy - 26, 6, cx, cy, 78);
      mg.addColorStop(0, '#F5F8FF');
      mg.addColorStop(.55, '#DDE7F7');
      mg.addColorStop(1, '#B7C6DC');
      c.fillStyle = mg; c.fill();
      [[-16, -8, 20], [14, 12, 15], [-4, 26, 11], [24, -18, 9]].forEach(function (m) {
        c.fillStyle = 'rgba(148,168,198,.18)';
        c.beginPath(); c.arc(cx + m[0], cy + m[1], m[2], 0, TAU); c.fill();
      });
    });
    var moon = new THREE.Mesh(new THREE.CircleGeometry(1.9, 40),
      new THREE.MeshBasicMaterial({ map: moonCvs.tex, transparent: true, opacity: 0, depthWrite: false }));
    moon.position.set(3.8, 7.2, -27);
    group.add(moon);

    group.userData.mats = [sky.material, moon.material];
    parent.add(group);
    return group;
  }

  /* ---------------- 共享：可拆顶厂房外壳（场景①②共用） ---------------- */
  function makeFactoryShell(sx, sy, sz, label, position, colors, keep) {
    var shell = new THREE.Group();
    shell.name = label;
    shell.position.copy(position);

    // 底座
    var base = box(sx + 0.3, 0.25, sz + 0.3, K.M(colors.shade));
    base.position.y = 0.12;
    base.castShadow = true; base.receiveShadow = true;
    shell.add(base);

    // 墙体：四面薄墙，每面独立材质（进入场景时按 keep 列表单独淡出）
    var wallT = 0.12;
    var walls = {};
    var fadeMats = [];
    function newMat(color, op) {
      var m = new THREE.MeshStandardMaterial({
        color: color, roughness: 0.88, metalness: 0,
        flatShading: true, transparent: true, opacity: op == null ? 1 : op
      });
      m.userData.baseOp = op == null ? 1 : op;
      return m;
    }
    function addWall(key, w, h, d, x, y, z) {
      var mat = newMat(colors.wall);
      var mesh = box(w, h, d, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      shell.add(mesh);
      walls[key] = mesh;
      if ((keep || []).indexOf(key) === -1) fadeMats.push(mat);
      return mesh;
    }
    addWall('S', sx, sy, wallT, 0, sy / 2, sz / 2 - wallT / 2);
    addWall('N', sx, sy, wallT, 0, sy / 2, -(sz / 2 - wallT / 2));
    addWall('W', wallT, sy, sz - wallT * 2, -(sx / 2 - wallT / 2), sy / 2, 0);
    addWall('E', wallT, sy, sz - wallT * 2, (sx / 2 - wallT / 2), sy / 2, 0);

    // 墙面装饰：随墙一起淡出
    function fadeMat(color, op) {
      var m = newMat(color, op);
      fadeMats.push(m);
      return m;
    }
    var door = box(1.7, 1.9, 0.08, fadeMat(colors.shade));
    door.position.set(0, 0.95, sz / 2 + 0.02);
    shell.add(door);

    var winFront = box(sx * 0.78, 0.8, 0.06, fadeMat(colors.glass, 0.3));
    winFront.position.set(0, sy * 0.62, sz / 2 + 0.03);
    shell.add(winFront);
    var frameF = box(sx * 0.78 + 0.12, 0.9, 0.04, fadeMat(colors.shade));
    frameF.position.set(0, sy * 0.62, sz / 2 + 0.015);
    shell.add(frameF);

    var winSide = box(0.06, 0.7, sz * 0.7, fadeMat(colors.glass, 0.3));
    winSide.position.set(sx / 2 + 0.03, sy * 0.6, 0);
    shell.add(winSide);

    // 保留墙上的横向饰带（增加进深层次，不额外淡出）
    if ((keep || []).indexOf('W') !== -1) {
      var band = box(0.05, 0.12, sz - 0.5, K.M(colors.shade));
      band.position.set(-(sx / 2 + 0.01), sy * 0.72, 0);
      shell.add(band);
    }

    // 屋顶 - 分两半，进入场景时整片垂直上升并淡出（不做铰链翻开）
    var roofPivotA = new THREE.Group();
    roofPivotA.position.set(-(sx / 2 + 0.1), sy + 0.11, 0);
    roofPivotA.userData.baseY = sy + 0.11;
    var roofMatA = new THREE.MeshStandardMaterial({
      color: colors.roof, roughness: 0.86, metalness: 0,
      flatShading: true, transparent: true, opacity: 1
    });
    var roofA = box(sx / 2 + 0.25, 0.22, sz + 0.4, roofMatA);
    roofA.position.set(sx / 4 + 0.05, 0, 0);
    roofA.castShadow = true; roofA.receiveShadow = true;
    roofPivotA.add(roofA);
    roofPivotA.userData.roofMats = [roofMatA];
    shell.add(roofPivotA);

    var roofPivotB = new THREE.Group();
    roofPivotB.position.set(sx / 2 + 0.1, sy + 0.11, 0);
    roofPivotB.userData.baseY = sy + 0.11;
    var roofMatB = new THREE.MeshStandardMaterial({
      color: colors.roof, roughness: 0.86, metalness: 0,
      flatShading: true, transparent: true, opacity: 1
    });
    var roofB = box(sx / 2 + 0.25, 0.22, sz + 0.4, roofMatB);
    roofB.position.set(-(sx / 4 + 0.05), 0, 0);
    roofB.castShadow = true; roofB.receiveShadow = true;
    roofPivotB.add(roofB);
    roofPivotB.userData.roofMats = [roofMatB];
    shell.add(roofPivotB);

    // 烟囱（仅场景①；挂在屋顶上，随屋顶一起上升淡出）
    if (colors.chimney) {
      var chimMat = new THREE.MeshStandardMaterial({
        color: colors.shade, roughness: 0.88, metalness: 0,
        flatShading: true, transparent: true, opacity: 1
      });
      var chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 1.4, 10), chimMat);
      chimney.position.set(sx / 6 + 0.1, 0.69, -sz / 3);
      chimney.castShadow = true;
      roofPivotA.add(chimney);
      roofPivotA.userData.roofMats.push(chimMat);
    }

    return {
      shell: shell,
      roofPivotA: roofPivotA,
      roofPivotB: roofPivotB,
      roofPivots: [roofPivotA, roofPivotB],
      walls: walls,
      fadeMats: fadeMats,
      sy: sy, sx: sx, sz: sz
    };
  }

  /* ---------------- 共享：车间暖光 ×2（进入场景时点亮） ---------------- */
  function addWarmLights(floor, color, baseI) {
    var lights = [];
    [[-2.6, 0.2], [0, 0.2], [2.6, 0.2]].forEach(function (lp) {
      var pl = new THREE.PointLight(color, 0, 9.5, 1.6);
      pl.position.set(lp[0], 2.55, lp[1]);
      pl.userData.baseI = baseI;
      floor.add(pl);
      lights.push(pl);
      var rod = box(0.03, 0.35, 0.03, K.M('#8B939E'));
      rod.position.set(lp[0], 2.78, lp[1]);
      floor.add(rod);
      var bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xFFE9C4 })
      );
      bulb.position.set(lp[0], 2.58, lp[1]);
      floor.add(bulb);
    });
    return lights;
  }

  /* ---------------- 场景① 传统工厂 ---------------- */
  function buildTraditional() {
    var g = new THREE.Group();
    g.position.set(-13.8, 0, 7.7);
    g.name = 'traditionalScene';
    campus.add(g);

    var C_gray = { wall: '#F4F5F7', shade: '#D8DDE4', roof: '#C4CAD3', glass: 0xCFE6F7, chimney: true };

    // 体量放大：10.2 × 3.4 × 5.6（原 8.4 × 3.2 × 4.4），内部空间更通透
    // 进入场景只保留 2 堵墙：后墙（prod.N）+ 左侧连续墙（prod.W + qc.W）
    var prod = makeFactoryShell(10.2, 3.4, 5.6, 'prod', new THREE.Vector3(0, 0, -2.9), C_gray, ['N', 'W']);
    var qc   = makeFactoryShell(10.2, 3.4, 5.6, 'qc',   new THREE.Vector3(0, 0,  2.9), C_gray, ['W']);
    g.add(prod.shell, qc.shell);

    // 夜景天空 + 月亮（随夜色淡入）
    var sky = buildNightSky(g);

    // --- 外部元素（进入场景时隐藏） ---
    var extHide = new THREE.Group();
    g.add(extHide);
    // 西侧遮篷 + 码头
    var canopy1 = box(3.4, 0.12, 1.6, K.M('#DDE3EA'));
    canopy1.position.set(-6.0, 2.75, 3.0); canopy1.rotation.y = Math.PI / 2; canopy1.castShadow = true;
    extHide.add(canopy1);
    var dock1 = box(2.8, 0.14, 1.1, K.M('#B7BEC7'));
    dock1.position.set(-5.7, 0.07, 3.0); dock1.rotation.y = Math.PI / 2;
    extHide.add(dock1);
    // 正面遮篷 + 码头
    var canopy2 = box(3.4, 0.12, 1.6, K.M('#DDE3EA'));
    canopy2.position.set(0, 2.75, 6.6); canopy2.castShadow = true;
    extHide.add(canopy2);
    var dock2 = dock1.clone(); dock2.position.set(0, 0.07, 6.6); dock2.rotation.y = 0;
    extHide.add(dock2);
    // 护栏（边界）
    var fence = K.fenceRun(6.2); fence.position.set(-13.6, 0, 12.0);
    extHide.add(fence);
    // 叉车 + 卡车
    var f1 = K.forklift(); f1.position.set(-9.2, 0, 12.4); f1.rotation.y = 0.15;
    extHide.add(f1);
    var t1 = K.truck('#FFFFFF'); t1.position.set(-5.6, 0, 12.7); t1.rotation.y = Math.PI / 2;
    extHide.add(t1);
    var t2 = K.truck('#E8EBF0'); t2.position.set(-3.0, 0, 12.7); t2.rotation.y = Math.PI / 2;
    extHide.add(t2);
    var pallet = box(1.2, 0.12, 0.9, K.M('#C9A876')); pallet.position.set(-7.4, 0.06, 10.2);
    extHide.add(pallet);
    for (var pb = 0; pb < 4; pb++) {
      var pbox = box(0.46, 0.36, 0.42, K.M('#E7E2D2'));
      pbox.position.set(-7.8 + (pb % 2) * 0.5, 0.3, 10.0 + Math.floor(pb / 2) * 0.46);
      pbox.castShadow = true;
      extHide.add(pbox);
    }
    // 散落蓝图（10 张）
    for (var p = 0; p < 10; p++) {
      var paper = box(0.62, 0.045, 0.44, K.M('#FFFFFF'));
      paper.position.set(-8.4 + (p % 3) * 0.7, 0.05 + Math.floor(p / 3) * 0.05, 8.0 + (p % 2) * 0.5);
      paper.rotation.y = (p % 4) * 0.16 - 0.24;
      paper.castShadow = true;
      extHide.add(paper);
    }
    var redBin = box(0.72, 0.68, 0.72, K.M('#D64545')); redBin.position.set(-6.9, 0.34, 8.8);
    extHide.add(redBin);
    // 屋顶管道（外部装饰，进入场景时一并隐藏）
    var roofPipe = K.cyl(0.18, 0.18, 2.4, '#B4BCC7', 10); roofPipe.rotation.z = Math.PI / 2;
    roofPipe.position.set(-3.4, 4.5, -3.6);
    extHide.add(roofPipe);
    // 所有外部元素统一标为 scene1-ext
    extHide.userData.extGroup = true;
    g.userData.extGroup = extHide;

    // --- 生产车间内部（6 台旧式机床 + 毛坯/货架/废料） ---
    var prodFloor = new THREE.Group();
    prodFloor.position.set(0, 0.26, -2.9);
    prodFloor.name = 'prodFloor';
    g.add(prodFloor);
    // 6 台旧式机床（3 列 × 2 排）
    var machineColors = ['#8B939E', '#6E7F94', '#9AA6B6', '#7C8CA0', '#8B939E', '#6E7F94'];
    for (var mi = 0; mi < 6; mi++) {
      var m = new THREE.Group();
      var mx = -3.0 + (mi % 3) * 3.0;
      var mz = -1.5 + Math.floor(mi / 3) * 2.1;
      m.position.set(mx, 0, mz);
      var base = box(1.4, 0.2, 1.0, K.M(machineColors[mi]));
      base.position.y = 0.1; base.castShadow = true; base.receiveShadow = true;
      m.add(base);
      var bed = box(0.9, 0.5, 0.7, K.M('#4A5568'));
      bed.position.y = 0.45; bed.castShadow = true;
      m.add(bed);
      var col = box(0.18, 0.9, 0.18, K.M('#39424E'));
      col.position.set(-0.3, 0.95, 0); col.castShadow = true;
      m.add(col);
      var spindle = K.cyl(0.11, 0.11, 0.3, '#2F5BE8', 10);
      spindle.position.set(-0.3, 1.4, 0.1);
      m.add(spindle);
      prodFloor.add(m);
    }

    // 生产车间：6 名工人实际作业（站 / 弯腰 / 操作机床），不是空场
    var workerShirts = ['#3F5E86', '#4A6FA5', '#556E8A', '#6E7F94', '#3E5A78', '#4E7396'];
    for (var wk = 0; wk < 6; wk++) {
      var wmx = -3.0 + (wk % 3) * 3.0;
      var wmz = -1.5 + Math.floor(wk / 3) * 2.1;
      var wp = K.person({
        shirt: workerShirts[wk],
        pants: '#2A3444',
        pose: 'stand',
        s: 0.9
      });
      wp.position.set(wmx + 0.74, 0, wmz + 0.34);
      wp.rotation.y = Math.PI - 0.42;
      // 前两名弯腰俯身对刀，其余伸手操作机床
      if (wk < 2) {
        wp.rotation.x = 0.26;
        wp.userData.limbs.armR.rotation.x = -1.3;
        wp.userData.limbs.armL.rotation.x = -1.05;
        wp.userData.limbs.head.rotation.x = 0.3;
      } else {
        wp.userData.setPose('stand');
        wp.userData.limbs.armR.rotation.x = -1.18;
        wp.userData.limbs.armL.rotation.x = -0.34;
        wp.userData.limbs.head.rotation.x = 0.2;
      }
      prodFloor.add(wp);
    }
    // 搬运工（推料车穿行）+ 弯腰点数毛坯
    var cart = new THREE.Group();
    var cartBed = box(1.1, 0.08, 0.62, K.M('#8B939E'));
    cartBed.position.y = 0.42;
    cart.add(cartBed);
    [[-0.45, 0.24], [0.45, 0.24], [-0.45, -0.24], [0.45, -0.24]].forEach(function (cw) {
      var wheel = K.cyl(0.1, 0.1, 0.08, '#39424E', 10);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(cw[0], 0.1, cw[1]);
      cart.add(wheel);
    });
    var cartBox = box(0.9, 0.4, 0.5, K.M('#C9A876'));
    cartBox.position.y = 0.66;
    cart.add(cartBox);
    cart.position.set(-1.1, 0, 1.55);
    cart.rotation.y = 0.1;
    prodFloor.add(cart);
    var porter = K.person({ shirt: '#4A6FA5', pants: '#2A3444', pose: 'walk', s: 0.9 });
    porter.position.set(-1.9, 0, 1.62);
    porter.rotation.y = Math.PI / 2;
    porter.userData.tick = function (t) {
      var u = ((t * 0.16) % 2 + 2) % 2;
      var k = u > 1 ? 2 - u : u;
      porter.position.z = 1.62 - k * 3.9;
      porter.rotation.y = u > 1 ? Math.PI / 2 : Math.PI / 2;
      var L = porter.userData.limbs;
      if (L) {
        L.armL.rotation.x = Math.sin(t * 4.6) * 0.4;
        L.armR.rotation.x = -Math.sin(t * 4.6) * 0.4;
      }
    };
    prodFloor.add(porter);
    // 搬运小车往返（持续动态）
    cart.userData.tick = function (t) {
      var u = ((t * 0.13 + 0.35) % 2 + 2) % 2;
      var k = u > 1 ? 2 - u : u;
      cart.position.z = 1.35 - k * 2.7;
      cart.rotation.y = u > 1 ? 0.1 : Math.PI + 0.1;
    };

    var crouch = K.person({ shirt: '#556E8A', pants: '#2A3444', pose: 'stand', s: 0.9 });
    crouch.position.set(2.55, 0, 1.75);
    crouch.rotation.x = 0.5;
    crouch.rotation.y = -2.4;
    crouch.userData.limbs.armR.rotation.x = -1.35;
    crouch.userData.limbs.armL.rotation.x = -1.0;
    crouch.userData.limbs.head.rotation.x = 0.35;
    crouch.userData.tick = function (t) {
      crouch.userData.limbs.armR.rotation.x = -1.35 + Math.sin(t * 7) * 0.12;
      crouch.userData.limbs.armL.rotation.x = -1.0 + Math.sin(t * 7 + 1) * 0.1;
    };
    prodFloor.add(crouch);

    // 西墙货架 ×2（进深层次）
    [[-1.7], [0.4]].forEach(function (s) {
      var sh = K.shelf(3);
      sh.position.set(-4.4, 0, s[0]);
      sh.rotation.y = Math.PI / 2;
      sh.castShadow = true;
      prodFloor.add(sh);
    });
    // 毛坯堆（金属色方块）
    for (var bi = 0; bi < 8; bi++) {
      var blk = box(0.58, 0.28, 0.42, K.M('#C9CCD1'));
      blk.position.set(3.6 + (bi % 2) * 0.62, 0.14 + Math.floor(bi / 4) * 0.3, -2.0 + Math.floor((bi % 4) / 2) * 0.5);
      blk.castShadow = true; blk.receiveShadow = true;
      prodFloor.add(blk);
    }
    // 角落废料箱
    var scrap = box(0.9, 0.8, 0.9, K.M('#D64545'));
    scrap.position.set(4.1, 0.4, 1.9); scrap.castShadow = true; scrap.receiveShadow = true;
    prodFloor.add(scrap);
    // 生产车间背景墙：人工生产看板
    var prodBoard = makeWallBoard(4.2, function (c, w, h) {
      c.fillStyle = '#F6F8FB';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#C9D4E2';
      c.lineWidth = 6;
      c.strokeRect(3, 3, w - 6, h - 6);
      c.fillStyle = '#1B75BC';
      c.fillRect(0, 0, 12, h);
      c.fillStyle = '#1B75BC';
      c.font = 'bold 22px monospace';
      c.fillText('WORKSHOP / MANUAL', 44, 52);
      c.fillStyle = '#15243C';
      c.font = 'bold 40px "Microsoft YaHei",sans-serif';
      c.fillText('生产车间 · 人工生产', 44, 104);
      c.fillStyle = '#7A8AA0';
      c.font = '21px "Microsoft YaHei",sans-serif';
      c.fillText('旧式机床加工 · 毛坯下线后送质检', 44, 140);
      [['待检', '48 件'], ['今日', '8 张'], ['质检员', '4 名']].forEach(function (r, i) {
        var x = 60 + i * 300;
        c.fillStyle = '#1B75BC';
        c.font = 'bold 46px monospace';
        c.fillText(r[1], x, 238);
        c.fillStyle = '#7A8AA0';
        c.font = '19px "Microsoft YaHei",sans-serif';
        c.fillText(r[0], x, 268);
      });
      c.fillStyle = 'rgba(214, 69, 69, .1)';
      c.fillRect(44, 300, w - 88, 42);
      c.fillStyle = '#C23B3B';
      c.font = 'bold 22px "Microsoft YaHei",sans-serif';
      c.fillText('图纸打印 · 手工核对 · 逐张签字确认', 60, 328);
    });
    prodBoard.position.set(0, 1.98, -2.66);
    prodFloor.add(prodBoard);

    // --- 质检车间内部（4 张 desk + 4 名质检员 + 图纸看板） ---
    var qcFloor = new THREE.Group();
    qcFloor.position.set(0, 0.26, 2.9);
    qcFloor.name = 'qcFloor';
    g.add(qcFloor);
    for (var qi = 0; qi < 4; qi++) {
      var desk = K.desk({ papers: 5 });
      desk.position.set(-2.2 + (qi % 2) * 3.2, 0, -0.4 + Math.floor(qi / 2) * 1.9);
      desk.rotation.y = 0;
      qcFloor.add(desk);
      var person = K.person({
        shirt: ['#4A6FA5', '#5B7DA8', '#6E7F94', '#7C8CA0'][qi],
        pants: '#2A3444',
        pose: qi < 2 ? 'sit' : 'type',
        s: 0.92
      });
      person.position.copy(desk.position);
      person.position.z += 0.55;
      person.rotation.y = Math.PI;  // 面朝 desk
      qcFloor.add(person);
    }
    // 背景墙：质检做图纸的痛点大看板（挂在保留的左侧连续墙上）
    var painBoard = makeWallBoard(5.0, drawPainBoard);
    painBoard.position.set(-4.96, 1.95, 0);
    painBoard.rotation.y = Math.PI / 2;
    qcFloor.add(painBoard);
    // 西侧白板（近处可读的痛点细节）
    var wb = K.whiteboard();
    wb.position.set(-3.7, 0, -2.0);
    qcFloor.add(wb);
    // 东墙文件柜 ×3 + 图纸卷
    [-1.4, 0.0, 1.4].forEach(function (cz) {
      var cab = K.cabinet(true);
      cab.position.set(4.5, 0, cz);
      cab.rotation.y = Math.PI / 2;
      qcFloor.add(cab);
    });
    for (var pr = 0; pr < 3; pr++) {
      var roll = K.cyl(0.12, 0.12, 0.9, '#FFFFFF', 10);
      roll.rotation.z = Math.PI / 2;
      roll.position.set(4.0, 0.14 + pr * 0.05, -2.15 + pr * 0.28);
      roll.castShadow = true;
      qcFloor.add(roll);
    }
    // 打印机（打印纸质图纸）
    var printer = K.printer();
    printer.position.set(3.7, 0, 2.05);
    qcFloor.add(printer);
    // 签字台 + 红章
    var stamp = K.cyl(0.09, 0.09, 0.18, '#D64545', 12);
    stamp.position.set(1.2, 0.82, -0.55);
    qcFloor.add(stamp);
    // 西墙长条图纸台（纸质图纸堆 / 图纸卷，补足进深层次）
    var benchTop = box(0.8, 0.06, 2.4, K.M('#C9A876'));
    benchTop.position.set(-4.1, 0.78, 0.7);
    benchTop.castShadow = true; benchTop.receiveShadow = true;
    qcFloor.add(benchTop);
    [[-0.55], [0.2], [0.95]].forEach(function (bp) {
      var leg = box(0.07, 0.78, 0.07, K.M('#8B939E'));
      leg.position.set(-4.45, 0.39, 0.7 + bp[0]);
      qcFloor.add(leg);
    });
    for (var pz = 0; pz < 4; pz++) {
      var paperStack = box(0.42, 0.1, 0.3, K.M('#FFFFFF'));
      paperStack.position.set(-4.1, 0.86 + (pz % 2) * 0.1, -0.3 + Math.floor(pz / 2) * 1.6);
      paperStack.castShadow = true;
      qcFloor.add(paperStack);
    }
    for (var rr = 0; rr < 3; rr++) {
      var tube = K.cyl(0.1, 0.1, 0.85, '#F2F5F9', 10);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(-4.1, 0.91, 1.45 + rr * 0.24);
      tube.castShadow = true;
      qcFloor.add(tube);
    }

    // 车间暖光（进入场景时点亮，配合夜色；生产 + 质检两间都补光）
    var warmLights = addWarmLights(qcFloor, 0xFFD9A0, 2.6)
      .concat(addWarmLights(prodFloor, 0xFFD9A0, 2.2));

    // --- 时钟（固定 12:00 AM） ---
    var clock = K.clockFast();
    clock.position.set(0, 4.35, 0);
    // 移除 tick 让指针停在默认位置（rotation.z=0 即 12 点顶部）
    delete clock.userData.tick;
    // 确认时针/分针都固定在顶部（0 度 = 12 点）
    clock.traverse(function (o) {
      if (o.rotation !== undefined && (o === clock.children[1] || o === clock.children[2])) {
        o.rotation.z = 0;
      }
    });
    g.add(clock);

    // --- 场景引用（便于 enterScene 时操作） ---
    g.userData.roofs = [prod.roofPivotA, prod.roofPivotB, qc.roofPivotA, qc.roofPivotB];
    g.userData.warmLights = warmLights;
    g.userData.extGroup = extHide;
    g.userData.wallFadeMats = prod.fadeMats.concat(qc.fadeMats);
    g.userData.sky = sky;
    sceneRefs[1] = g;
  }

  /* ---------------- 场景② 智能工厂 ---------------- */
  function buildSmart() {
    var g = new THREE.Group();
    g.position.set(-13.8, 0, -7.4);
    g.name = 'smartScene';
    campus.add(g);

    var C_blue = { wall: '#FFFFFF', shade: '#D8DEE4', roof: '#5B6BE8', glass: 0xD7EBFA, chimney: false };

    // 体量放大：10.2 × 3.6 × 5.6（原 8.4 × 3.4 × 4.4）
    // 进入场景只保留 2 堵墙：后墙（prod.N）+ 左侧连续墙（prod.W + qc.W）
    var prod = makeFactoryShell(10.2, 3.6, 5.6, 'prod', new THREE.Vector3(0, 0, -2.9), C_blue, ['N', 'W']);
    var qc   = makeFactoryShell(10.2, 3.6, 5.6, 'qc',   new THREE.Vector3(0, 0,  2.9), C_blue, ['W']);
    g.add(prod.shell, qc.shell);

    // --- 外部元素（进入场景时隐藏；太阳能板挂屋顶故一并隐藏） ---
    var extHide = new THREE.Group();
    extHide.userData.extGroup = true;
    g.add(extHide);

    // 太阳能板 ×8（prod 顶 4 + qc 顶 4）
    var solarMat = K.M('#23406B', { rough: 0.35, metal: 0.15 });
    [[-2.9, 3.95], [2.9, 3.95]].forEach(function (cfg) {
      for (var sp = 0; sp < 4; sp++) {
        var panel = box(1.3, 0.05, 0.9, solarMat);
        panel.position.set(-2.4 + (sp % 2) * 2.6, cfg[1], cfg[0] - 0.9 + Math.floor(sp / 2) * 1.6);
        panel.rotation.x = -0.28;
        panel.castShadow = true;
        extHide.add(panel);
      }
    });

    // AGV（carrier 包裹做位移，保留自身灯闪 tick）
    var agvCarrier = new THREE.Group();
    agvCarrier.position.set(6.0, 0, -4.2);
    agvCarrier.add(K.agv('#2F5BE8'));
    extHide.add(agvCarrier);
    agvCarrier.userData.tick = function (t) {
      var u = Math.sin(t * 0.32) * 0.5 + 0.5;
      agvCarrier.position.z = -4.2 + u * 6.4;
      agvCarrier.rotation.y = Math.cos(t * 0.32) >= 0 ? 0 : Math.PI;
    };

    // 无人机巡航（carrier 包裹，保留桨叶 tick）
    var droneCarrier = new THREE.Group();
    droneCarrier.position.set(2.5, 6.2, -3.0);
    droneCarrier.add(K.drone());
    extHide.add(droneCarrier);
    droneCarrier.userData.tick = function (t) {
      droneCarrier.position.x = 2.5 + Math.cos(t * 0.25) * 2.1;
      droneCarrier.position.z = -3.0 + Math.sin(t * 0.25) * 1.3;
      droneCarrier.rotation.y = t * 0.3;
    };

    // 叉车 + 货车（车间东侧装卸动线）
    var fk = K.forklift();
    fk.position.set(6.6, 0, -3.4);
    fk.rotation.y = -Math.PI / 2 + 0.1;
    extHide.add(fk);
    var tk = K.truck('#E8EBF0');
    tk.position.set(7.6, 0, -0.6);
    tk.rotation.y = Math.PI / 2;
    extHide.add(tk);

    // 巡检工人 ×2
    [[6.3, -4.9, 2.7, 'point', '#FFFFFF'], [6.6, 1.7, -0.9, 'stand', '#DCE9F7']].forEach(function (cfg) {
      var w = K.person({ shirt: cfg[4], pants: '#2F4D8A', pose: cfg[3], s: 0.9 });
      w.position.set(cfg[0], 0, cfg[1]);
      w.rotation.y = cfg[2];
      extHide.add(w);
    });

    // 地面光带
    var strip = K.lightStrip(1.0, 9, 6.1, -1.0, Math.PI / 2, '#35A2FF');
    strip.position.y = 0.025;
    extHide.add(strip);

    // --- 生产车间内部（机械臂 + 输送线 + 数字看板 + 料架） ---
    var prodFloor = new THREE.Group();
    prodFloor.position.set(0, 0.26, -2.9);
    prodFloor.name = 'prodFloor';
    g.add(prodFloor);

    var arm1 = K.robotArm('#F0A03C'); arm1.position.set(-3.0, 0, -1.2); prodFloor.add(arm1);
    var arm2 = K.robotArm('#F0A03C'); arm2.position.set(3.0, 0, -1.2); arm2.rotation.y = Math.PI; prodFloor.add(arm2);

    var belt = K.conveyor(5.4, '#39424E');
    belt.rotation.y = Math.PI / 2;
    belt.position.set(0, 0, 1.0);
    prodFloor.add(belt);

    // 输送线上的移动工件 ×3
    for (var pi = 0; pi < 3; pi++) {
      var part = box(0.34, 0.2, 0.34, K.M('#BFD9EE'));
      part.castShadow = true;
      part.userData.offset = pi / 3;
      part.position.set(-2.6 + pi * 1.7, 0.75, 1.0);
      part.userData.tick = function (t) {
        var u = (t * 0.1 + this.userData.offset) % 1;
        this.position.x = -2.6 + u * 5.2;
      };
      prodFloor.add(part);
    }

    // 数字看板（挂车间南墙，正对视口）
    var boardFrame = box(3.4, 1.86, 0.1, K.M('#1C2A3C'));
    boardFrame.position.set(0, 2.0, -2.64);
    prodFloor.add(boardFrame);
    var board = makeScreen(2.9, 1.7, drawDashboard);
    board.position.set(0, 2.0, -2.57);
    prodFloor.add(board);

    // 后墙两侧再挂 2 块数据看板（PPT 真实数据）
    [{
      accent: '#7EE7FF', tag: 'ACCURACY / 识别', big: '95%+',
      sub: '识别准确率', line: 'DWG / DXF / PDF / JPG / PNG / TIF'
    }, {
      accent: '#7EA6FF', tag: 'CLIENTS / 客户', big: '50+',
      sub: '大型企业已落地', line: '已商用上线 3 年'
    }].forEach(function (cfg, mi) {
      var bx = mi === 0 ? -3.6 : 3.6;
      var mFrame = box(2.72, 1.72, 0.1, K.M('#12233C'));
      mFrame.position.set(bx, 2.0, -2.63);
      prodFloor.add(mFrame);
      var mScr = makeMetricScreen(2.45, cfg);
      mScr.position.set(bx, 2.0, -2.56);
      prodFloor.add(mScr);
    });

    // 西墙料架 ×2
    [[-1.8], [0.3]].forEach(function (s) {
      var sh = K.shelf(3);
      sh.position.set(-4.4, 0, s[0]);
      sh.rotation.y = Math.PI / 2;
      sh.castShadow = true;
      prodFloor.add(sh);
    });

    // 料箱 ×3
    [[4.0, 1.5], [4.0, 0.5], [4.0, -0.5]].forEach(function (p) {
      var binBox = box(0.7, 0.5, 0.5, K.M('#5B6BE8'));
      binBox.position.set(p[0], 0.25, p[1]);
      binBox.castShadow = true;
      prodFloor.add(binBox);
    });

    // --- 质检车间内部（4 工位 + 4 名质检员用电脑 + 好处看板） ---
    var qcFloor = new THREE.Group();
    qcFloor.position.set(0, 0.26, 2.9);
    qcFloor.name = 'qcFloor';
    g.add(qcFloor);

    var deskPos = [[-2.3, -0.4], [1.1, -0.4], [-2.3, 1.6], [1.1, 1.6]];
    var desks = [];
    deskPos.forEach(function (dp, qi) {
      var desk = K.desk({});
      desk.position.set(dp[0], 0, dp[1]);
      qcFloor.add(desk);
      desks.push(desk);
      var person = K.person({
        shirt: ['#2F5BE8', '#35A2FF', '#5B6BE8', '#1B75BC'][qi],
        pants: '#2A3444',
        pose: 'type',
        s: 0.92
      });
      person.position.set(dp[0], 0, dp[1] + 0.55);
      person.rotation.y = Math.PI;  // 面朝 desk
      qcFloor.add(person);
    });

    // 视频宿主（默认静音待在隐藏容器里，点击屏幕后再全屏播放）
    var demoVideo = document.createElement('video');
    demoVideo.src = 'assets/demo.mp4';
    demoVideo.muted = true;
    demoVideo.loop = true;
    demoVideo.playsInline = true;
    demoVideo.setAttribute('playsinline', '');
    demoVideo.preload = 'auto';
    var videoSink = document.getElementById('videoSink');
    if (videoSink) videoSink.appendChild(demoVideo);
    demoVideoEl = demoVideo;

    // 工位屏：1 号（质检员 1）= 演示视频静帧预览；2 号（质检员 2）= 在线系统预览；3/4 = AI 识别画面
    var videoScreen = K.screenMesh(K.canvasTexture(512, 288, drawVideoPreview), 0.9);
    videoScreen.position.set(-0.2, 1.065, -0.15);
    videoScreen.rotation.x = -0.08;
    videoScreen.userData.action = 'video';
    desks[0].add(videoScreen);
    clickScreens.push(videoScreen);

    var linkScreen = K.screenMesh(K.canvasTexture(512, 288, drawLinkScreen), 0.9);
    linkScreen.position.set(-0.2, 1.065, -0.15);
    linkScreen.rotation.x = -0.08;
    linkScreen.userData.action = 'link';
    desks[1].add(linkScreen);
    clickScreens.push(linkScreen);

    [2, 3].forEach(function (di) {
      var ai = makeScreen(0.9, 0.56, drawAiScreen);
      ai.position.set(-0.2, 1.065, -0.15);
      ai.rotation.x = -0.08;
      desks[di].add(ai);
    });

    // 背景墙：AI 识图带来的好处大看板（挂在保留的左侧连续墙上）
    var gainBoard = makeWallBoard(5.0, drawGainBoard);
    gainBoard.position.set(-4.96, 1.95, 0);
    gainBoard.rotation.y = Math.PI / 2;
    qcFloor.add(gainBoard);
    // 西侧白板
    var wb = K.whiteboard();
    wb.position.set(-3.6, 0, -2.0);
    qcFloor.add(wb);

    // 暖光 ×2（沿用场景①标准，白天补氛围）
    var warmLights = addWarmLights(qcFloor, 0xFFE3B8, 0.55);

    // 东侧智能数据立柱 ×3（替代原文件柜：多点位、多块屏，数据取自 PPT）
    [{
      accent: '#FFC000', tag: 'EFFICIENCY / 效率', big: '10×',
      sub: '标注效率提升', line: '单张图纸 2 小时 → 约 10 分钟'
    }, {
      accent: '#35D0A0', tag: 'WORKLOAD / 工作量', big: '90%+',
      sub: '工作量与出错率降低', line: '每条产线减少 1 个人力'
    }, {
      accent: '#FF8AB0', tag: 'DEPLOY / 上线', big: '2 周',
      sub: '从部署到正式上线', line: '本地化部署 · 开放架构'
    }].forEach(function (cfg, ki) {
      var kiosk = new THREE.Group();
      kiosk.position.set(4.4, 0, -1.5 + ki * 1.5);
      kiosk.rotation.y = Math.PI / 2;
      qcFloor.add(kiosk);
      var kBase = K.cyl(0.4, 0.5, 0.14, '#F2F6FB', 18);
      kBase.position.y = 0.07;
      kiosk.add(kBase);
      var kPole = K.cyl(0.06, 0.06, 0.9, K.M('#C8D6E6'), 8);
      kPole.position.y = 0.58;
      kiosk.add(kPole);
      var kFrame = box(1.7, 1.16, 0.09, K.M('#12233C'));
      kFrame.position.y = 1.74;
      kiosk.add(kFrame);
      var kScr = makeMetricScreen(1.55, cfg);
      kScr.position.set(0, 1.74, 0.055);
      kiosk.add(kScr);
    });

    // --- 时钟（固定 5:00 PM，时针指 5） ---
    var clock2 = K.clockFast();
    clock2.position.set(0, 4.35, 0);
    delete clock2.userData.tick;
    if (clock2.children[2]) clock2.children[2].rotation.z = -(5 / 12) * TAU;
    g.add(clock2);

    // --- 场景引用 ---
    g.userData.roofs = [prod.roofPivotA, prod.roofPivotB, qc.roofPivotA, qc.roofPivotB];
    g.userData.warmLights = warmLights;
    g.userData.extGroup = extHide;
    g.userData.wallFadeMats = prod.fadeMats.concat(qc.fadeMats);
    sceneRefs[2] = g;
  }

  /* ---------------- 场景③ 四类角色 ---------------- */
  /* ---------------- 场景③ 四类角色（四间房 + 可点击人物） ---------------- */
  function buildRolesLegacy() {
    var g = new THREE.Group();
    g.position.set(5, 0, 7.6);
    g.name = 'rolesScene';
    campus.add(g);

    var W = 10.2, D = 7.6, H = 3.0;

    // 底板
    var slab = box(W, 0.18, D, K.M('#E9EEF5'));
    slab.position.y = 0.09;
    slab.receiveShadow = true;
    g.add(slab);

    // 「两堵墙」：后墙 N + 左墙 W
    var wallMat = new THREE.MeshStandardMaterial({ color: 0xF7F9FC, roughness: 0.9, metalness: 0 });
    var wallN = box(W, H, 0.12, wallMat);
    wallN.position.set(0, H / 2, -D / 2 + 0.06);
    wallN.castShadow = true; wallN.receiveShadow = true;
    g.add(wallN);
    var wallW = box(0.12, H, D, wallMat);
    wallW.position.set(-W / 2 + 0.06, H / 2, 0);
    wallW.castShadow = true; wallW.receiveShadow = true;
    g.add(wallW);

    // 墙面竖向饰条（后墙，进深层次）
    for (var wn = 0; wn < 5; wn++) {
      var stripN = box(0.06, H - 0.55, 0.03, K.M('#DCE5F0'));
      stripN.position.set(-4.0 + wn * 2.0, H / 2, -D / 2 + 0.14);
      g.add(stripN);
    }

    // 低玻璃隔断（十字），只做分区提示，不挡视线
    var partMat = new THREE.MeshStandardMaterial({
      color: 0xCFE2F5, roughness: 0.15, metalness: 0.2,
      transparent: true, opacity: 0.32, side: THREE.DoubleSide
    });
    var partX = box(0.08, 1.1, D - 0.4, partMat);
    partX.position.set(0, 0.55, 0);
    partX.renderOrder = 2;
    g.add(partX);
    var partZ = box(W - 0.4, 1.1, 0.08, partMat);
    partZ.position.set(0, 0.55, 0);
    partZ.renderOrder = 2;
    g.add(partZ);

    var rooms = [
      { label: '老板办公室', x: -2.55, z: -1.95, pad: '#E8F0FB' },
      { label: '品质管理者办公室', x: 2.55, z: -1.95, pad: '#EAF5F1' },
      { label: '质检员车间', x: -2.55, z: 1.95, pad: '#F4EFE5' },
      { label: 'IT 办公室', x: 2.55, z: 1.95, pad: '#EDEFF6' }
    ];
    rooms.forEach(function (r) {
      var pad = box(4.65, 0.03, 3.45, K.M(r.pad, { rough: 0.95 }));
      pad.position.set(r.x, 0.19, r.z);
      pad.receiveShadow = true;
      g.add(pad);
      var plate = K.textPlane(r.label, {
        bg: '#FFFFFF', fg: '#22334C', border: '#D7E1EE', fs: 50, w: 512, h: 112, pw: 1.56
      });
      plate.position.set(r.x, 1.02, r.z - 1.34);
      g.add(plate);
      var post = box(0.05, 1.0, 0.05, K.M('#C8D4E2'));
      post.position.set(r.x - 0.5, 0.5, r.z - 1.34);
      g.add(post);
    });

    function officeDesk(w, d) {
      var grp = new THREE.Group();
      var top = box(w, 0.07, d, K.M('#C9A876'));
      top.position.y = 0.78;
      top.castShadow = true; top.receiveShadow = true;
      grp.add(top);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        var leg = box(0.07, 0.76, 0.07, K.M('#8B939E'));
        leg.position.set(q[0] * (w / 2 - 0.12), 0.38, q[1] * (d / 2 - 0.08));
        grp.add(leg);
      });
      return grp;
    }

    function officeChair(x, z, ry) {
      var c = new THREE.Group();
      var seat = box(0.46, 0.07, 0.46, K.M('#39424E'));
      seat.position.y = 0.46;
      c.add(seat);
      var back = box(0.46, 0.52, 0.07, K.M('#39424E'));
      back.position.set(0, 0.74, -0.24);
      c.add(back);
      var stem = K.cyl(0.04, 0.04, 0.42, '#8B939E', 8);
      stem.position.y = 0.23;
      c.add(stem);
      c.position.set(x, 0, z);
      c.rotation.y = ry || 0;
      return c;
    }

    function roomSign(text, x, y, z, color) {
      var plate = K.textPlane(text, {
        bg: '#0E2144', fg: color || '#7EE7FF', border: 'rgba(126,231,255,.4)',
        fs: 44, w: 512, h: 112, pw: 1.9
      });
      plate.position.set(x, y, z);
      return plate;
    }

    // ---------- ① 老板办公室 ----------
    var bossDesk = officeDesk(2.3, 1.0);
    bossDesk.position.set(-2.55, 0, -2.55);
    g.add(bossDesk);
    var bossScreen = K.screenMesh(K.canvasTexture(256, 160, function (c, w, h) {
      c.fillStyle = '#0B1830'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#7EE7FF'; c.font = 'bold 20px monospace';
      c.fillText('P&L · 2026', 18, 34);
      c.fillStyle = '#35D0A0'; c.font = 'bold 42px monospace';
      c.fillText('+18%', 18, 96);
      c.fillStyle = 'rgba(190,214,255,.8)'; c.font = '14px sans-serif';
      c.fillText('质量成本 ↓', 18, 128);
    }), 0.62);
    bossScreen.position.set(-2.55, 1.05, -2.72);
    bossScreen.rotation.x = -0.2;
    g.add(bossScreen);
    g.add(officeChair(-2.28, -1.55, Math.PI));
    var boss = K.person({ shirt: '#2C3E66', pants: '#242C38', pose: 'stand', s: 0.98 });
    boss.position.set(-2.75, 0, -1.45);
    boss.rotation.y = 0.06;
    boss.userData.action = 'role';
    boss.userData.roleId = 'boss';
    interactives.push(boss);
    g.add(boss);
    var bossPlant = K.plant(1.15);
    bossPlant.position.set(-4.45, 0, -3.1);
    g.add(bossPlant);
    g.add(roomSign('每条产线减少 1 个人力', -2.55, 2.15, -3.66, '#7EE7FF'));

    // ---------- ② 品质管理者办公室 ----------
    var qaDesk = K.desk({ screen: { cvs: K.canvasTexture(512, 288, function (c, w, h) {
      c.fillStyle = '#0B1830'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(94,148,220,.4)'; c.lineWidth = 2;
      c.strokeRect(20, 30, w - 40, h - 60);
      c.fillStyle = '#7EE7FF'; c.font = 'bold 18px monospace';
      c.fillText('SPC · 全流程追溯', 32, 62);
      c.strokeStyle = '#35D0A0'; c.lineWidth = 2;
      c.beginPath();
      for (var qx = 40; qx <= w - 40; qx += 12) {
        var qy = 190 - Math.sin(qx * 0.03) * 30 - qx * 0.05;
        if (qx === 40) c.moveTo(qx, qy); else c.lineTo(qx, qy);
      }
      c.stroke();
      c.fillStyle = '#FFC000'; c.font = 'bold 26px monospace';
      c.fillText('出错率 ↓ 约 90%', 32, 246);
    }) } });
    qaDesk.position.set(2.55, 0, -2.5);
    g.add(qaDesk);
    g.add(officeChair(2.93, -1.86, Math.PI));
    var qa = K.person({ shirt: '#2E9E5B', pants: '#2A3444', pose: 'stand', s: 0.94 });
    qa.position.set(2.2, 0, -1.6);
    qa.rotation.y = -0.24;
    qa.userData.limbs.armR.rotation.x = -0.9;
    qa.userData.action = 'role';
    qa.userData.roleId = 'qa';
    interactives.push(qa);
    g.add(qa);
    g.add(roomSign('批次与工序全流程留痕', 2.55, 2.15, -3.66, '#9FE8C8'));

    // ---------- ③ 质检员车间 ----------
    var qcBench = officeDesk(2.4, 1.1);
    qcBench.position.set(-2.55, 0, 1.15);
    g.add(qcBench);
    var qcScreen = K.screenMesh(K.canvasTexture(512, 288, function (c, w, h) {
      drawAiScreen(c, w, h, 0.4);
    }), 0.95);
    qcScreen.position.set(-2.55, 1.2, 0.86);
    qcScreen.rotation.x = -0.12;
    g.add(qcScreen);
    [[-3.6, 1.4], [-2.9, 1.5], [-2.2, 1.5]].forEach(function (pp) {
      var tray = box(0.5, 0.05, 0.36, K.M('#39424E'));
      tray.position.set(pp[0], 0.86, pp[1]);
      g.add(tray);
      var part = box(0.16, 0.06, 0.16, K.M('#BFD9EE'));
      part.position.set(pp[0], 0.9, pp[1]);
      g.add(part);
    });
    var qcinsp = K.person({ shirt: '#F0A03C', pants: '#2A3444', pose: 'stand', s: 0.92 });
    qcinsp.position.set(-2.55, 0, 2.35);
    qcinsp.rotation.y = Math.PI;
    qcinsp.userData.limbs.armR.rotation.x = -1.0;
    qcinsp.userData.limbs.head.rotation.x = 0.28;
    qcinsp.userData.action = 'role';
    qcinsp.userData.roleId = 'qcinsp';
    interactives.push(qcinsp);
    g.add(qcinsp);
    g.add(roomSign('10 分钟完成原本两小时的核数', -2.55, 2.15, 0.05, '#FFC000'));

    // ---------- ④ IT 办公室 ----------
    var itDesk = K.desk({ screen: { cvs: K.canvasTexture(512, 288, function (c, w, h) {
      c.fillStyle = '#07182C'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#7EE7FF'; c.font = 'bold 17px monospace';
      c.fillText('DEPLOY / 本地化部署', 24, 44);
      c.fillStyle = '#35D0A0'; c.font = 'bold 46px monospace';
      c.fillText('2 周', 24, 120);
      c.fillStyle = 'rgba(190,214,255,.85)'; c.font = '17px sans-serif';
      c.fillText('从部署到正式上线', 24, 160);
      c.fillStyle = '#FFC000'; c.font = 'bold 16px monospace';
      c.fillText('MES / ERP 开放接口', 24, 210);
    }) } });
    itDesk.position.set(2.55, 0, 1.15);
    g.add(itDesk);
    var rack1 = K.serverRack();
    rack1.position.set(4.55, 0, 0.35);
    g.add(rack1);
    var rack2 = K.serverRack();
    rack2.position.set(4.55, 0, 1.45);
    g.add(rack2);
    var itP = K.person({ shirt: '#7C5CE8', pants: '#2A3444', pose: 'stand', s: 0.94 });
    itP.position.set(2.15, 0, 2.35);
    itP.rotation.y = Math.PI + 0.2;
    itP.userData.limbs.armL.rotation.x = -0.85;
    itP.userData.action = 'role';
    itP.userData.roleId = 'it';
    interactives.push(itP);
    g.add(itP);
    g.add(officeChair(2.93, 1.85, Math.PI));
    g.add(roomSign('本地部署 · 图纸不出厂', 2.55, 2.15, 0.05, '#C8B6FF'));

    // 可点击提示环
    [boss, qa, qcinsp, itP].forEach(function (p) {
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(0.34, 0.4, 24),
        new THREE.MeshBasicMaterial({ color: 0x35A2FF, transparent: true, opacity: 0.5 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      p.add(ring);
    });

    sceneRefs[3] = g;
  }

  /* ---------------- 场景④ F06 大楼（实拍外观 + 顶层俯视办公室平面） ---------------- */
  function buildTowerLegacy() {
    var g = new THREE.Group();
    g.position.set(14, 0, -7.2);
    g.name = 'towerScene';
    campus.add(g);

    var W = 11, D = 7, H = 11.0;
    var planY = H - 0.55;

    // 前广场
    var plaza = new THREE.Mesh(new THREE.CircleGeometry(6.0, 48), K.M('#EEF2F7'));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.014, 0);
    plaza.receiveShadow = true;
    g.add(plaza);

    // 主体（浅色石材）：顶面做透明处理，屋顶打开后可看到内部平面而不被顶盖遮挡
    var bodyMat = new THREE.MeshStandardMaterial({ color: 0xF1F4F8, roughness: 0.72, metalness: 0.04 });
    var bodyTopMat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, depthWrite: false, colorWrite: false
    });
    var body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [
      bodyMat, bodyMat, bodyTopMat, bodyMat, bodyMat, bodyMat
    ]);
    body.position.y = H / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // 玻璃幕墙（南 / 东）
    var glass = new THREE.MeshStandardMaterial({
      color: 0x9FC3DD, roughness: 0.18, metalness: 0.35,
      transparent: true, opacity: 0.55
    });
    var glassS = box(W - 0.7, H - 1.0, 0.06, glass);
    glassS.position.set(0, H / 2 - 0.1, D / 2 + 0.03);
    g.add(glassS);
    var glassE = box(0.06, H - 1.0, D - 0.7, glass);
    glassE.position.set(W / 2 + 0.03, H / 2 - 0.1, 0);
    g.add(glassE);

    // 白色竖向 fins（实拍立面特征）
    for (var sx = -5.1; sx <= 5.1; sx += 0.62) {
      var finS = box(0.13, H - 0.5, 0.24, K.M('#FFFFFF', { rough: 0.6 }));
      finS.position.set(sx, H / 2, D / 2 + 0.12);
      finS.castShadow = true;
      g.add(finS);
    }
    for (var sz = -3.1; sz <= 3.1; sz += 0.62) {
      var finE = box(0.24, H - 0.5, 0.13, K.M('#FFFFFF', { rough: 0.6 }));
      finE.position.set(W / 2 + 0.12, H / 2, sz);
      finE.castShadow = true;
      g.add(finE);
    }
    // 横向楼层带
    for (var fb = 1; fb <= 5; fb++) {
      var bandS = box(W + 0.1, 0.1, 0.1, K.M('#DDE4EE'));
      bandS.position.set(0, fb * 1.95, D / 2 + 0.2);
      g.add(bandS);
    }

    // 顶部红牌：福建省（厦门）人工智能产业园 + F06
    var banner = K.textPlane('福建省（厦门）人工智能产业园', {
      bg: '#C0392B', fg: '#FFFFFF', fs: 64, w: 1024, h: 120, pw: 8.4
    });
    banner.position.set(-0.6, H - 0.55, D / 2 + 0.26);
    g.add(banner);
    var f06 = K.textPlane('F06', {
      bg: '#C0392B', fg: '#FFFFFF', fs: 90, w: 256, h: 128, pw: 1.5
    });
    f06.position.set(4.1, H - 1.55, D / 2 + 0.26);
    g.add(f06);

    // 入口雨棚 + 门厅
    var canopy = box(4.2, 0.14, 1.8, K.M('#FFFFFF'));
    canopy.position.set(0, 3.1, D / 2 + 0.9);
    canopy.castShadow = true;
    g.add(canopy);
    var lobby = box(3.0, 2.4, 0.08, glass);
    lobby.position.set(0, 1.35, D / 2 + 0.06);
    g.add(lobby);
    var doorLine = box(3.0, 0.09, 0.12, K.M('#C9D3E0'));
    doorLine.position.set(0, 2.6, D / 2 + 0.1);
    g.add(doorLine);

    // ---- 顶层办公室平面（屋顶打开后可见）----
    var planSlab = box(10.4, 0.12, 7.2, K.M('#EEF3FA'));
    planSlab.position.set(0, planY, 0);
    planSlab.receiveShadow = true;
    g.add(planSlab);

    // 「两堵墙」：N + W 围合，S / E 敞开
    var parapetMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.8, metalness: 0 });
    var parN = box(10.4, 0.75, 0.12, parapetMat);
    parN.position.set(0, planY + 0.375, -3.55);
    g.add(parN);
    var parW = box(0.12, 0.75, 7.2, parapetMat);
    parW.position.set(-5.14, planY + 0.375, 0);
    g.add(parW);

    var roomDefs = [
      ['总经理室', -3.9, -2.2, '#E8F0FB'],
      ['会议室 1', -1.3, -2.2, '#EAF3FA'],
      ['会议室 2', 1.3, -2.2, '#EAF3FA'],
      ['机房', 3.9, -2.2, '#EDEFF6'],
      ['开发部', -3.9, 1.6, '#E9F5F0'],
      ['人事部', -1.3, 1.6, '#F5F1E8'],
      ['业务增长部', 1.3, 1.6, '#F3EEF8'],
      ['阳台', 3.9, 1.6, '#E8F3E9']
    ];
    roomDefs.forEach(function (r) {
      var tile = box(2.42, 0.05, 2.5, K.M(r[3], { rough: 0.96 }));
      tile.position.set(r[1], planY + 0.09, r[2]);
      tile.receiveShadow = true;
      g.add(tile);
      var label = K.textPlane(r[0], {
        bg: r[3], fg: '#1B2B44', fs: 52, w: 512, h: 112, pw: 2.0
      });
      label.rotation.x = -Math.PI / 2;
      label.position.set(r[1], planY + 0.16, r[2] - 0.92);
      g.add(label);
    });

    // 低隔断（房间分隔，高度 0.3，不遮挡平面）
    var sepMat = K.M('#FFFFFF', { rough: 0.85 });
    [-2.6, 0, 2.6].forEach(function (sx2) {
      var sep = box(0.1, 0.3, 5.2, sepMat);
      sep.position.set(sx2, planY + 0.19, -0.3);
      g.add(sep);
    });
    [-0.9, 0.4].forEach(function (sz2) {
      var sep2 = box(10.2, 0.3, 0.1, sepMat);
      sep2.position.set(0, planY + 0.19, sz2);
      g.add(sep2);
    });

    // 平面内的小家具（让房间可辨认，均为示意体块）
    function miniDesk(x, z, w, d, ry) {
      var top = box(w, 0.05, d, K.M('#C9A876'));
      top.position.set(x, planY + 0.22, z);
      if (ry) top.rotation.y = ry;
      g.add(top);
    }
    miniDesk(-3.9, -2.5, 1.5, 0.55);
    miniDesk(-1.3, -2.45, 1.3, 0.6);
    miniDesk(1.3, -2.45, 1.3, 0.6);
    miniDesk(-3.9, 1.5, 1.2, 0.55);
    miniDesk(-2.9, 2.0, 1.2, 0.55);
    miniDesk(-1.3, 1.5, 1.1, 0.5);
    miniDesk(-1.3, 2.1, 1.1, 0.5);
    miniDesk(1.3, 1.5, 1.4, 0.6);
    // 机房机柜（放在「机房」房间内：z 负向；不要落到「阳台」）
    [0.4, 1.4, 2.4].forEach(function (cz2) {
      var rack = box(0.5, 0.55, 0.8, K.M('#3B4657'));
      rack.position.set(3.9, planY + 0.32, -2.7 + (cz2 - 0.4));
      g.add(rack);
    });
    // 阳台绿植
    [2.9, 4.1].forEach(function (px) {
      var pot = box(0.5, 0.32, 0.5, K.M('#FFFFFF'));
      pot.position.set(px, planY + 0.24, 1.7);
      g.add(pot);
      var shrub = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), K.M('#8FBF9F'));
      shrub.position.set(px, planY + 0.48, 1.7);
      g.add(shrub);
    });

    // 2 处「待确认」模糊区（不编造）
    function hatchPatch(x, z) {
      var cvs = K.canvasTexture(512, 160, function (c, w, h) {
        c.fillStyle = '#E7EBF1';
        c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(120, 136, 158, .45)';
        c.lineWidth = 8;
        for (var d = -h; d < w + h; d += 26) {
          c.beginPath(); c.moveTo(d, h); c.lineTo(d + h, 0); c.stroke();
        }
        c.strokeStyle = 'rgba(93, 108, 130, .7)';
        c.lineWidth = 4;
        c.strokeRect(2, 2, w - 4, h - 4);
        c.fillStyle = '#5D6C82';
        c.font = 'bold 54px "Microsoft YaHei",sans-serif';
        c.textAlign = 'center';
        c.fillText('待确认', w / 2, h / 2 + 18);
        c.textAlign = 'left';
      });
      var mesh = K.screenMesh(cvs, 2.0);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, planY + 0.12, z);
      g.add(mesh);
    }
    hatchPatch(-2.0, 3.18);
    hatchPatch(2.0, 3.18);

    // 屋顶盖（进入场景时上升淡出，露出平面）
    var roofPivot = new THREE.Group();
    roofPivot.position.set(0, H + 0.09, 0);
    roofPivot.userData.baseY = H + 0.09;
    var roofMat = new THREE.MeshStandardMaterial({
      color: 0xE4EAF2, roughness: 0.85, metalness: 0,
      transparent: true, opacity: 1
    });
    var roofLid = box(W + 0.5, 0.18, D + 0.5, roofMat);
    roofLid.castShadow = true;
    roofPivot.add(roofLid);
    roofPivot.userData.roofMats = [roofMat];
    g.add(roofPivot);

    // 地面人物 / 车辆（远景氛围）
    var p1 = K.person({ shirt: '#2F5BE8', pants: '#2A3444', pose: 'walk', s: 0.88 });
    p1.position.set(-2.6, 0, 4.2); p1.rotation.y = 2.2; g.add(p1);
    var p2 = K.person({ shirt: '#FFFFFF', pants: '#39424E', pose: 'stand', s: 0.88 });
    p2.position.set(2.8, 0, 4.0); p2.rotation.y = -2.4; g.add(p2);
    var c1 = K.car('#FFFFFF'); c1.position.set(-1.9, 0, 5.4); g.add(c1);
    var c2 = K.car('#39424E'); c2.position.set(1.9, 0, 5.4); g.add(c2);

    g.userData.roofs = [roofPivot];
    g.userData.planY = planY;
    sceneRefs[4] = g;
  }

  /* ---------------- 场景⑤ 已合作客户矩阵 ---------------- */
  // 客户数据全部来自《已合作客户全景信息表.xlsx》，无虚构、无补 Logo
  var CUSTOMERS = [
    { n: '01', name: '日立电梯（中国）有限公司', short: '日立电梯', city: '广州', ind: '电梯整机与服务', cat: '电梯', note: '国内行业前三甲，年产能超7万台；房地产TOP500首选电梯供应商榜首' },
    { n: '02', name: '宁波敏实汽车零部件技术研发有限公司', short: '敏实汽车零部件', city: '宁波（集团总部嘉兴）', ind: '汽车外饰件 / 电池盒', cat: '汽车零部件', note: '敏实集团子公司；全球外饰与车身结构部件领导者、全球最大电池盒供应商，全球汽车零部件百强' },
    { n: '03', name: '上海西门子开关有限公司', short: '上海西门子开关', city: '上海闵行', ind: '中压开关设备', cat: '工业装备·软件', note: '西门子能源配电集团成员，中压开关一线品牌，2023年营收约13.8亿元' },
    { n: '04', name: '通达集团控股有限公司', short: '通达集团', city: '香港（基地：福建石狮/厦门）', ind: '消费电子精密结构件', cat: '电子·光学', note: '全球领先的消费电子外壳一站式供应商，中国电子元件百强企业' },
    { n: '05', name: '合肥协力液压科技有限公司', short: '协力液压', city: '合肥', ind: '液压元件', cat: '精密制造', note: '中国农机零部件龙头企业，农机协会零部件分会会长单位，安徽省专精特新' },
    { n: '06', name: '江苏全盛座舱技术股份有限公司', short: '全盛座舱', city: '无锡', ind: '汽车座椅骨架总成', cat: '汽车零部件', note: '国内汽车座椅骨架龙头，2025年营收超21亿元，国内外19个生产基地（含泰国）' },
    { n: '07', name: '福建新峰科技股份有限公司', short: '新峰科技', city: '漳州长泰（源自厦门）', ind: '光学镜头关键零部件', cat: '电子·光学', note: '全球细分单项冠军：手机摄像头垫片全球份额超20%，车载摄像头镜筒全球占比超40%' },
    { n: '08', name: '上海汽车变速器有限公司', short: '上汽变速器', city: '上海嘉定', ind: '汽车变速器 / 电驱', cat: '汽车零部件', note: '上汽集团全资子公司（前身1925年郑兴泰汽配厂），国内最具影响力的变速器专业制造企业之一，六大生产基地，国家企业技术中心' },
    { n: '09', name: '陕西法士特汽车传动集团有限责任公司', short: '法士特', city: '西安', ind: '商用车传动系统', cat: '汽车零部件', note: '全球最大商用车变速器生产基地，重卡变速器市占率超70%，产销量连续约20年全球第一' },
    { n: '10', name: '厦门立洲精密科技股份有限公司', short: '立洲精密', city: '厦门', ind: '精密弹性件', cat: '精密制造', note: '国家级专精特新小巨人，国家弹簧行业标准制定单位，聚焦中高端非标弹性件' },
    { n: '11', name: '上海阿为特精密机械股份有限公司', short: '阿为特', city: '上海宝山', ind: '精密机械零部件', cat: '精密制造', note: '国家级专精特新小巨人，细胞切片机微分进刀系统全球少数供应商之一' },
    { n: '12', name: '上海聚克流体控制有限公司', short: '聚克流体', city: '上海青浦', ind: '半导体超高纯流体控制', cat: '半导体·陶瓷', note: '半导体超高纯气路核心部件国产替代成长型企业，上海+海宁+马来西亚三大基地' },
    { n: '13', name: '东实底盘（湖北）有限公司', short: '东实底盘', city: '湖北十堰', ind: '汽车底盘系统', cat: '汽车零部件', note: '贮气筒总成国内市占率第一，细分隐形冠军，湖北省专精特新小巨人（东风系改制企业）' },
    { n: '14', name: '江苏同力日升机械股份有限公司', short: '同力日升', city: '江苏丹阳', ind: '电梯零部件 + 储能', cat: '电梯', note: '国内电梯零部件领先企业，产品线最丰富之一；2022年收购天启鸿源切入储能' },
    { n: '15', name: '厦门唯科模塑科技股份有限公司', short: '唯科模塑', city: '厦门', ind: '精密注塑模具及注塑件', cat: '精密制造', note: '中国精密注塑模具重点骨干企业、国家级专精特新小巨人、国家企业技术中心，国内领先' },
    { n: '16', name: '无锡卓瓷科技有限公司', short: '卓瓷科技', city: '无锡', ind: '半导体精密陶瓷部件', cat: '半导体·陶瓷', note: '国家高新技术企业、江苏省专精特新、江苏潜在独角兽；半导体高端陶瓷部件国产替代' },
    { n: '17', name: '厦门市翌东塑胶有限公司', short: '翌东塑胶', city: '厦门', ind: '精密塑胶模具与注塑件', cat: '精密制造', note: '小型民企，以细分精度见长：导光板最薄0.25mm、公差±0.03mm' },
    { n: '18', name: '湖南省美程新材料科技股份有限公司', short: '美程新材', city: '湖南娄底', ind: '先进特种陶瓷零部件', cat: '半导体·陶瓷', note: '国家专精特新重点小巨人、国家制造业单项冠军产品企业，湖南省先进陶瓷龙头' },
    { n: '19', name: '厦工（三明）重型机器有限公司', short: '厦工三明', city: '福建三明', ind: '路面机械 / 大型非标结构件', cat: '工业装备·软件', note: '中国主要道路机械制造企业、福建省机械行业龙头、福建省单项冠军；氢氟酸反应炉全国市占80%以上' },
    { n: '20', name: '广东鸿图科技股份有限公司', short: '广东鸿图', city: '广东肇庆', ind: '精密铝合金压铸件', cat: '汽车零部件', note: '国内压铸行业龙头，华南最大精密铝合金压铸企业，年产能12万吨' },
    { n: '21', name: '广州丰达电机有限公司', short: '广州丰达', city: '广州番禺', ind: '电声器件', cat: '电子·光学', note: '日本FOSTER集团在华主体，FOSTER为全球最大扬声器专业制造商之一' },
    { n: '22', name: '苏州亚太精睿传动科技股份有限公司', short: '亚太精睿', city: '苏州', ind: '重载高精行星齿轮传动', cat: '精密制造', note: '国家专精特新小巨人，油气压裂传动部件长期占北美市场约一半份额，多项产品进口替代' },
    { n: '23', name: '厦门华盛弘精密塑胶模具有限公司', short: '华盛弘', city: '厦门', ind: '大型精密注塑模具', cat: '精密制造', note: '厦门地区最有影响力的模具企业之一，国家级专精特新小巨人；年产模具800多套，70%出口' },
    { n: '24', name: '厦门瑞尔特卫浴科技股份有限公司', short: '瑞尔特', city: '厦门', ind: '卫浴配件 / 智能卫浴', cat: '精密制造', note: '冲水组件国内市占率第一、全球前三（与吉博力、福马并列）；智能马桶ODM+自主品牌' },
    { n: '25', name: '奥的斯电梯制造有限公司', short: '奥的斯制造', city: '浙江海宁', ind: '电梯及特种设备制造', cat: '电梯', note: '奥的斯体系在华新设制造基地（规模较小）' },
    { n: '26', name: '奥的斯机电电梯有限公司', short: '奥的斯机电', city: '杭州', ind: '电梯整机制造与服务', cat: '电梯', note: '奥的斯在华曾最大控股子公司，浙江省规模最大电梯企业之一，产品销往110多国（原西子奥的斯）' },
    { n: '27', name: '奥的斯电梯（中国）有限公司', short: '奥的斯中国', city: '天津', ind: '电梯 / 扶梯 / 维保', cat: '电梯', note: '全球最大电梯公司奥的斯在华核心主体；天津泰达基地为奥的斯全球最大制造基地，财富中国500强' },
    { n: '28', name: '奥的斯机电电梯（重庆）有限公司', short: '奥的斯重庆', city: '重庆两江新区', ind: '电梯整机制造', cat: '电梯', note: '奥的斯在华第七家工厂，服务西部市场，初始产能约8000台/年' },
    { n: '29', name: '广州奥的斯电梯有限公司', short: '广州奥的斯', city: '广州', ind: '电梯 / 扶梯', cat: '电梯', note: '年产能约3000台电梯+1000台扶梯，1993年奥的斯与广州机电集团合资老厂' },
    { n: '30', name: '鼎捷数智股份有限公司', short: '鼎捷数智', city: '上海（源自台湾鼎新）', ind: '制造业 ERP / MES / PLM', cat: '工业装备·软件', note: '中国制造业ERP本土厂商市占第一（约14.8%），MES离散制造国产品牌第一，累计客户超5万家' }
  ];

  function buildClientsLegacy() {
    var g = new THREE.Group();
    g.position.set(19.6, 0, 5.8);
    g.name = 'clientsScene';
    campus.add(g);

    var W = 10.2, D = 7.6, H = 3.2;
    var wallMat = new THREE.MeshStandardMaterial({ color: 0x14243D, roughness: 0.62, metalness: 0.08 });
    var wallN = box(W, H, 0.14, wallMat);
    wallN.position.set(0, H / 2, -D / 2 + 0.07);
    wallN.castShadow = true; wallN.receiveShadow = true;
    g.add(wallN);
    var wallW = box(0.14, H, D, wallMat);
    wallW.position.set(-W / 2 + 0.07, H / 2, 0);
    wallW.castShadow = true; wallW.receiveShadow = true;
    g.add(wallW);

    // 墙面导光条（冷色科技感，不发光球）
    [[-4.6, -D / 2 + 0.16], [4.6, -D / 2 + 0.16]].forEach(function (p) {
      var strip = box(0.14, H - 0.4, 0.05, K.M('#35A2FF', { op: 0.32, rough: 0.3 }));
      strip.position.set(p[0], H / 2, p[1]);
      g.add(strip);
    });
    var floor = box(W - 0.3, 0.08, D - 0.3, K.M('#0B1626'));
    floor.position.y = 0.04;
    floor.receiveShadow = true;
    g.add(floor);

    // 四块客户名录屏（N 墙 ×2 + W 墙 ×2）
    var cats = ['电梯', '汽车零部件', '精密制造', '电子·光学', '半导体·陶瓷', '其他'];
    var accent = { '电梯': '#35A2FF', '汽车零部件': '#FFC000', '精密制造': '#7EE7FF', '电子·光学': '#8FD8B6', '半导体·陶瓷': '#C8B6FF', '其他': '#FF8AB0' };
    function drawClientBoard(title, items, ac) {
      return K.canvasTexture(1024, 640, function (c, w, h) {
        var bg = c.createLinearGradient(0, 0, w, h);
        bg.addColorStop(0, '#0A1830');
        bg.addColorStop(1, '#132A4D');
        c.fillStyle = bg;
        c.fillRect(0, 0, w, h);
        c.fillStyle = ac;
        c.fillRect(0, 0, w, 8);
        c.fillStyle = 'rgba(126,231,255,.9)';
        c.font = 'bold 26px monospace';
        c.fillText(title, 40, 54);
        c.fillStyle = '#FFFFFF';
        c.font = 'bold 34px "Microsoft YaHei",sans-serif';
        c.fillText('已合作客户 · 真实名录', 40, 102);
        c.fillStyle = 'rgba(180,208,255,.78)';
        c.font = '19px "Microsoft YaHei",sans-serif';
        c.fillText('数据来源：已合作客户全景信息表.xlsx · 只列出真实客户，不使用 Logo', 40, 134);
        items.forEach(function (it, i) {
          var col = i % 2;
          var row = Math.floor(i / 2);
          var x = 40 + col * 496;
          var y = 172 + row * 74;
          c.fillStyle = 'rgba(255,255,255,.055)';
          c.fillRect(x, y, 456, 62);
          c.fillStyle = ac;
          c.fillRect(x, y, 5, 62);
          c.fillStyle = 'rgba(158,186,230,.9)';
          c.font = 'bold 18px monospace';
          c.fillText(it.n, x + 16, y + 26);
          c.fillStyle = '#FFFFFF';
          c.font = 'bold 23px "Microsoft YaHei",sans-serif';
          c.fillText(it.short, x + 54, y + 27);
          c.fillStyle = 'rgba(186,208,240,.72)';
          c.font = '16px "Microsoft YaHei",sans-serif';
          c.fillText(it.ind + ' · ' + it.city, x + 54, y + 51);
        });
        c.fillStyle = 'rgba(126,231,255,.35)';
        c.font = '18px monospace';
        c.fillText('JIANHUI · CUSTOMER MATRIX', 40, h - 22);
      });
    }

    var groups = [CUSTOMERS.slice(0, 8), CUSTOMERS.slice(8, 15), CUSTOMERS.slice(15, 23), CUSTOMERS.slice(23, 30)];
    var titles = ['ELEVATOR / 电梯 · 7 家', 'AUTOMOTIVE / 汽车零部件 · 6 家', 'PRECISION / 精密制造 · 6 家', 'MIXED / 电子·光学 3 · 半导体·陶瓷 3 · 其他 5'];
    groups.forEach(function (items, bi) {
      var cvs = drawClientBoard(titles[bi], items, accent[items[0].cat] || '#35A2FF');
      var pw = 4.24;
      var board = K.screenMesh(cvs, pw);
      if (bi < 2) {
        board.position.set(bi === 0 ? -2.42 : 2.42, 1.72, -D / 2 + 0.16);
      } else {
        board.rotation.y = Math.PI / 2;
        board.position.set(-W / 2 + 0.16, 1.72, bi === 2 ? -1.82 : 1.82);
      }
      g.add(board);
    });

    // 地面 30 格客户矩阵（编号 + 简称，按行业配色）
    var tileCols = ['#15304F', '#2C2612', '#173A44', '#123328', '#2A2142', '#3A1B2A'];
    CUSTOMERS.forEach(function (it, i) {
      var col = i % 6;
      var row = Math.floor(i / 6);
      var x = -2.55 + col * 1.02;
      var z = -0.55 + row * 0.78;
      var ci = cats.indexOf(it.cat);
      var tile = box(0.86, 0.06, 0.6, K.M(tileCols[ci], { rough: 0.72 }));
      tile.position.set(x, 0.1, z);
      tile.receiveShadow = true;
      g.add(tile);
      var edge = box(0.9, 0.02, 0.64, K.M(accent[it.cat] || '#35A2FF', { op: 0.4, rough: 0.4 }));
      edge.position.set(x, 0.075, z);
      g.add(edge);
      var label = K.textPlane(it.n, {
        bg: tileCols[ci], fg: '#EAF4FF', fs: 92, w: 256, h: 128, pw: 0.62
      });
      label.rotation.x = -Math.PI / 2;
      label.rotation.z = 0;
      label.position.set(x, 0.14, z);
      g.add(label);
    });

    // 两名讲解人员（不遮挡屏幕）
    var v1 = K.person({ shirt: '#2F5BE8', pants: '#2A3444', pose: 'point', s: 0.9 });
    v1.position.set(-3.4, 0, 2.8);
    v1.rotation.y = 0.5;
    v1.userData.limbs.armR.rotation.x = -1.5;
    g.add(v1);
    var v2 = K.person({ shirt: '#8B99AD', pants: '#39424E', pose: 'stand', s: 0.9 });
    v2.position.set(3.3, 0, 2.9);
    v2.rotation.y = -0.4;
    g.add(v2);

    sceneRefs[5] = g;
  }

  /* ---------------- 场景⑥ 品牌结尾 · 动态海面 ---------------- */
  function buildFinaleLegacy() {
    var g = new THREE.Group();
    // 放到园区北侧的平台之外，形成「海面 + 栈台 + 品牌墙」的独立收尾场景
    g.position.set(0, 0, -27);
    g.name = 'finaleScene';
    campus.add(g);

    // 亲水栈台（观众位于北侧海面回望；品牌墙在栈台南端）
    var deck = box(13.2, 0.24, 5.2, K.M('#F4F7FB', { rough: 0.9 }));
    deck.position.set(0, 0.12, 0);
    deck.receiveShadow = true;
    g.add(deck);
    var deckLine = box(13.2, 0.03, 0.08, K.M('#35A2FF', { op: 0.6, rough: 0.35 }));
    deckLine.position.set(0, 0.26, -2.62);
    g.add(deckLine);

    // 「两堵墙」：品牌墙（南）+ 西侧短墙，形成 L 形围合
    var wallMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.78, metalness: 0.02 });
    var wallN = box(13.2, 3.9, 0.16, wallMat);
    wallN.position.set(0, 1.95, 2.55);
    wallN.castShadow = true; wallN.receiveShadow = true;
    g.add(wallN);
    var wallW = box(0.16, 3.9, 4.4, wallMat);
    wallW.position.set(-6.52, 1.95, 0.55);
    wallW.castShadow = true; wallW.receiveShadow = true;
    g.add(wallW);

    // 品牌墙竖缝（避开主屏区域）
    [-5.4, -4.2, 4.2, 5.4].forEach(function (bs) {
      var seam = box(0.06, 3.5, 0.04, K.M('#DCE6F2'));
      seam.position.set(bs, 1.95, 2.46);
      g.add(seam);
    });
    // 西墙导光条
    var wStrip = box(0.05, 0.1, 3.9, K.M('#35A2FF', { op: 0.72, rough: 0.3 }));
    wStrip.position.set(-6.42, 2.9, 0.55);
    g.add(wStrip);

    // 品牌主屏：PPT 末页原文（联系方式 / 地址，不外扩）
    var finalCvs = K.canvasTexture(1024, 576, function (c, w, h) {
      var bg = c.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#08182E');
      bg.addColorStop(1, '#123C74');
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(126,231,255,.45)';
      c.lineWidth = 4;
      c.strokeRect(6, 6, w - 12, h - 12);
      c.fillStyle = '#7EE7FF';
      c.font = 'bold 26px monospace';
      c.fillText('JIANHUI  ·  THANK YOU', 46, 60);
      c.fillStyle = '#FFFFFF';
      c.font = 'bold 58px "Microsoft YaHei",sans-serif';
      c.fillText('携手并进 · 共创智造未来', 44, 148);
      c.fillStyle = 'rgba(196,220,255,.9)';
      c.font = '24px "Microsoft YaHei",sans-serif';
      c.fillText('以AI赋能制造业质量管理数字化转型，', 46, 202);
      c.fillText('构建全流程、智能化、可追溯的质量闭环体系', 46, 240);
      c.strokeStyle = 'rgba(126,231,255,.32)';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(46, 282); c.lineTo(w - 46, 282); c.stroke();

      var cols = [
        ['联系电话', '15759627233'],
        ['电子邮箱', 'hongsongxian@xmjianhui.com'],
        ['公司地址', '厦门市集美区软件园三期 F06 栋 1004 室']
      ];
      cols.forEach(function (col, i) {
        var x = 46 + i * 318;
        c.fillStyle = 'rgba(126,231,255,.72)';
        c.font = '18px monospace';
        c.fillText(col[0], x, 344);
        c.fillStyle = '#FFFFFF';
        c.font = i === 2 ? 'bold 21px "Microsoft YaHei",sans-serif' : 'bold 26px monospace';
        if (i === 2) {
          c.fillText('厦门市集美区软件园三期', x, 392);
          c.fillText('F06 栋 1004 室', x, 426);
        } else {
          c.fillText(col[1], x, 392);
        }
      });
      c.fillStyle = 'rgba(126,231,255,.5)';
      c.font = 'bold 34px "Microsoft YaHei",sans-serif';
      c.fillText('简会', 46, h - 34);
      c.fillStyle = 'rgba(190,212,240,.45)';
      c.font = '18px monospace';
      c.fillText('AI DRAWING RECOGNITION SYSTEM', 132, h - 38);
    });
    var finalScreen = K.screenMesh(finalCvs, 5.8);
    // 屏幕朝北（面向海面上的镜头）
    finalScreen.rotation.y = Math.PI;
    finalScreen.position.set(0, 2.05, 2.46);
    g.add(finalScreen);

    // 动态海面（顶点波动 + 水面高光，纯 shader）
    var waterMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: [
        'uniform float uTime;',
        'varying vec2 vUv;',
        'varying float vWave;',
        'void main(){',
        '  vUv = uv;',
        '  vec3 p = position;',
        '  float w1 = sin(p.x * 0.62 + uTime * 0.85) * 0.16;',
        '  float w2 = cos(p.y * 0.9 - uTime * 0.65) * 0.11;',
        '  float w3 = sin((p.x + p.y) * 0.42 + uTime * 1.1) * 0.06;',
        '  p.z += w1 + w2 + w3;',
        '  vWave = w1 + w2 + w3;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime;',
        'varying vec2 vUv;',
        'varying float vWave;',
        'void main(){',
        '  float d = clamp(vUv.y, 0.0, 1.0);',
        '  vec3 deep = vec3(0.035, 0.145, 0.30);',
        '  vec3 near = vec3(0.11, 0.38, 0.62);',
        '  vec3 col = mix(near, deep, d);',
        '  float band = sin(vUv.x * 34.0 + uTime * 1.8 + vUv.y * 18.0) * 0.5 + 0.5;',
        '  col += band * 0.035;',
        '  float glint = smoothstep(0.55, 0.92, band) * (0.35 + vWave * 1.4);',
        '  col += vec3(0.42, 0.72, 0.94) * max(glint, 0.0);',
        '  float edge = smoothstep(0.0, 0.14, vUv.y);',
        '  gl_FragColor = vec4(col, 0.96 * edge + 0.02);',
        '}'
      ].join('\n'),
      transparent: true,
      depthWrite: false
    });
    var water = new THREE.Mesh(new THREE.PlaneGeometry(74, 35, 64, 40), waterMat);
    water.rotation.x = -Math.PI / 2;
    // 只铺在园区平台之外（世界 z -55 ~ -20），避免与园区地面重叠
    water.position.set(0, -0.53, -10.5);
    g.add(water);

    // 木栈桥（伸入海面，作为前景引导线）
    for (var pk = 0; pk < 5; pk++) {
      var plank = box(2.5, 0.08, 0.5, K.M(pk % 2 ? '#C9A876' : '#BF9D6E', { rough: 0.85 }));
      plank.position.set(0, 0.28, -3.3 - pk * 0.62);
      plank.receiveShadow = true;
      g.add(plank);
    }
    [-1.3, 1.3].forEach(function (px) {
      [-3.5, -4.7, -5.9].forEach(function (pz) {
        var post = K.cyl(0.07, 0.08, 1.5, '#8B6A45', 8);
        post.position.set(px, -0.4, pz);
        g.add(post);
      });
    });
    var railMat = K.M('#DCE4EE', { rough: 0.5 });
    [-1.3, 1.3].forEach(function (px) {
      var rail = box(0.05, 0.05, 3.1, railMat);
      rail.position.set(px, 1.02, -4.7);
      g.add(rail);
    });

    // 栈台四角木桩（落在海面上）
    [[-6.2, -2.2], [6.2, -2.2], [-6.2, 2.2], [6.2, 2.2]].forEach(function (p) {
      var pile = K.cyl(0.13, 0.15, 1.5, '#8B6A45', 10);
      pile.position.set(p[0], -0.4, p[1]);
      g.add(pile);
    });

    // 栈台两侧导光柱（品牌感，不做发光球）
    [-5.9, 5.9].forEach(function (px) {
      var pole = K.cyl(0.07, 0.09, 3.0, '#DCE6F2', 10);
      pole.position.set(px, 1.5, -1.4);
      g.add(pole);
      var tube = K.cyl(0.05, 0.05, 2.6, '#7EE7FF', 8);
      tube.position.set(px, 1.55, -1.4);
      tube.material = new THREE.MeshBasicMaterial({ color: 0xBFEBFF, transparent: true, opacity: 0.8 });
      g.add(tube);
    });

    water.userData.tick = function (t) {
      waterMat.uniforms.uTime.value = t;
    };

    sceneRefs[6] = g;
  }

  /* ---------------- 构建 ---------------- */
  buildPlatform();
  buildRoads();
  buildLandscape();
  buildCenter();
  buildTraditional();
  buildSmart();
  buildRoles();
  buildTower();
  buildClients();

  world.traverse(function (o) {
    if (typeof o.userData.tick === 'function' && anims.indexOf(o) === -1) {
      anims.push(o);
    }
  });

  /* ============================================================
     静态几何合并：把成百上千个同材质小构件合成一个 Mesh，
     大幅降低 draw call；动态对象（门/轿厢/人物/屏幕/可点击）保持独立。
     ============================================================ */
  (function mergeStatics() {
    var skipMats = [];
    Object.keys(sceneRefs).forEach(function (k) {
      var ref = sceneRefs[k];
      (ref.userData.wallFadeMats || []).forEach(function (m) { skipMats.push(m); });
      (ref.userData.roofs || []).forEach(function (p) {
        (p.userData.roofMats || []).forEach(function (m) { skipMats.push(m); });
      });
    });
    // 需要独立控制可见性/位置的对象：整组标记，内部不再合并
    interactives.forEach(function (o) { if (o) o.userData.noMerge = true; });
    Object.keys(sceneRefs).forEach(function (k) {
      var ref = sceneRefs[k];
      if (ref.userData.extGroup) ref.userData.extGroup.userData.noMerge = true;
      if (ref.userData.skyline) ref.userData.skyline.userData.noMerge = true;
      if (ref.userData.cabin) ref.userData.cabin.userData.noMerge = true;
      (ref.userData.roofs || []).forEach(function (p) { p.userData.noMerge = true; });
      (ref.userData.doorPanels || []).forEach(function (p) {
        if (p.parent) p.parent.userData.noMerge = true;
      });
    });

    var vA = new THREE.Vector3();
    var mtx = new THREE.Matrix4();
    var nmtx = new THREE.Matrix3();

    function mergeRoot(root) {
      if (!root) return 0;
      root.updateWorldMatrix(true, true);
      var inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      var buckets = {};
      var picked = [];
      root.traverse(function (o) {
        if (!o.isMesh) return;
        if (Array.isArray(o.material)) return;
        var mat = o.material;
        if (!mat || !mat.isMeshStandardMaterial || mat.map || mat.transparent) return;
        if (mat === skipMats[0] || skipMats.indexOf(mat) >= 0) return;
        if (o.userData.tick || o.userData.noMerge) return;
        var p = o.parent;
        while (p && p !== root) {
          if (p.userData && (p.userData.tick || p.userData.noMerge)) return;
          p = p.parent;
        }
        if (!o.geometry || !o.geometry.attributes.position) return;
        picked.push(o);
      });
      if (picked.length < 6) return 0;

      picked.forEach(function (o) {
        var mat = o.material;
        var key = mat.uuid;
        var b = buckets[key];
        if (!b) {
          b = buckets[key] = {
            mat: mat, pos: [], nor: [], uv: [], idx: [], off: 0, cast: false, receive: false
          };
        }
        mtx.multiplyMatrices(inv, o.matrixWorld);
        nmtx.getNormalMatrix(mtx);
        var pa = o.geometry.attributes.position;
        var na = o.geometry.attributes.normal;
        var ua = o.geometry.attributes.uv;
        for (var i = 0; i < pa.count; i++) {
          vA.fromBufferAttribute(pa, i).applyMatrix4(mtx);
          b.pos.push(vA.x, vA.y, vA.z);
          if (na) {
            vA.fromBufferAttribute(na, i).applyMatrix3(nmtx).normalize();
            b.nor.push(vA.x, vA.y, vA.z);
          } else {
            b.nor.push(0, 1, 0);
          }
          if (ua) b.uv.push(ua.getX(i), ua.getY(i));
          else b.uv.push(0, 0);
        }
        var index = o.geometry.index;
        if (index) {
          for (var ii = 0; ii < index.count; ii++) b.idx.push(index.getX(ii) + b.off);
        } else {
          for (var j = 0; j < pa.count; j++) b.idx.push(j + b.off);
        }
        b.off += pa.count;
        if (o.castShadow) b.cast = true;
        if (o.receiveShadow) b.receive = true;
      });

      var merged = 0;
      Object.keys(buckets).forEach(function (key) {
        var b = buckets[key];
        if (b.off < 6) return;
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
        geo.setIndex(b.idx);
        geo.computeBoundingSphere();
        var mm = new THREE.Mesh(geo, b.mat);
        mm.castShadow = b.cast;
        mm.receiveShadow = b.receive;
        mm.userData.mergedStatic = true;
        root.add(mm);
        merged++;
      });
      picked.forEach(function (o) {
        if (o.parent) o.parent.remove(o);
      });
      return merged;
    }

    Object.keys(sceneRefs).forEach(function (k) {
      var ref = sceneRefs[k];
      mergeRoot(ref);
      if (ref.userData.extGroup) mergeRoot(ref.userData.extGroup);
      if (ref.userData.skyline) mergeRoot(ref.userData.skyline);
    });

    // 园区静态物（道路/广场线/灌木/路灯/停放车辆/长椅/树木）一并合并。
    // 场景根节点标记 noMerge，保证每个场景仍能独立显隐；带 tick 的组（中央 AI 装置、灯带）自动跳过。
    Object.keys(sceneRefs).forEach(function (k) {
      if (sceneRefs[k]) sceneRefs[k].userData.noMerge = true;
    });
    mergeRoot(campus);
  })();

  // 人物不投阴影：阴影视图里成百上千个肢体是最大开销之一
  world.traverse(function (o) {
    if (!o.isMesh) return;
    var p = o;
    while (p) {
      if (p.userData && p.userData.limbs) { o.castShadow = false; break; }
      p = p.parent;
    }
  });

  /* ============================================================
     新一轮场景实现（2026-11）
     - 场景③：一栋 4 层楼（4F 老板 / 3F IT / 2F 品质管理 / 1F 质检员），可切层
     - 场景④：F06 中间层办公层，按最新 2D/3D 平面图还原，工位均有人
     - 场景⑤：客户矩阵，地面全客户清单 + 墙面按 Excel 真实行业分类
     ============================================================ */

  function boardTexture(draw, w, h) {
    return K.canvasTexture(w || 1024, h || 560, draw);
  }

  function posterBoard(cvs, pw) {
    var m = K.screenMesh(cvs, pw);
    return m;
  }

  function floorLabel(text, x, z, pw, bg, fg) {
    var m = K.textPlane(text, {
      w: 512, h: 128, fs: 54, pw: pw || 1.5,
      bg: bg || '#FFFFFF', fg: fg || '#1F2937',
      border: 'rgba(27,117,188,.35)'
    });
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.12, z);
    return m;
  }

  function walkerLocal(parent, x0, z0, x1, z1, speed, shirt, phase) {
    var p = K.person({ shirt: shirt || '#4A6FA5', pants: '#39424E', pose: 'walk', s: 0.92 });
    p.position.set(x0, 0, z0);
    p.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    p.userData.tick = function (t) {
      var u = (((t * speed + (phase || 0)) % 2) + 2) % 2;
      var k = u > 1 ? 2 - u : u;
      var e = k * k * (3 - 2 * k);
      p.position.x = x0 + (x1 - x0) * e;
      p.position.z = z0 + (z1 - z0) * e;
      var dir = u > 1 ? -1 : 1;
      p.rotation.y = Math.atan2((x1 - x0) * dir, (z1 - z0) * dir);
      var L = p.userData.limbs;
      if (L) {
        L.armL.rotation.x = Math.sin(t * 5) * 0.45;
        L.armR.rotation.x = -Math.sin(t * 5) * 0.45;
      }
    };
    parent.add(p);
    return p;
  }

  /* ---------------- 场景③ 一栋四层楼 ---------------- */
  function buildRoles() {
    var g = new THREE.Group();
    g.position.set(5, 0, 7.6);
    g.name = 'rolesScene';
    campus.add(g);

    var W = 9.6, D = 7.4, WALL_H = 2.9, GAP = 3.55;
    var TOWER_H = GAP * 3 + WALL_H;
    var floors = [];
    var shell = new THREE.Group();
    g.add(shell);
    var wallMat = K.M('#E9EEF5', { rough: 0.72 });
    var wallMat1F = K.M('#DCE3EC', { rough: 0.82 });
    var slabMat = K.M('#C9D3DF', { rough: 0.7 });

    // 楼体基座（不再立全高角柱，避免遮挡各层内部）
    var base = box(W + 1.0, 0.24, D + 1.0, K.M('#B9C5D3'));
    base.position.y = 0.12;
    g.add(base);

    // 电梯井移到楼体东侧，贯穿全楼
    var shaft = new THREE.Group();
    shaft.position.set(W / 2 + 1.05, 0, -D / 2 + 0.9);
    var shaftShell = box(1.3, TOWER_H, 1.3, glassMat(0x9EC8EA, 0.24));
    shaftShell.position.y = TOWER_H / 2;
    shaft.add(shaftShell);
    var shaftFrame = box(1.36, 0.09, 1.36, K.M('#5C6B7D'));
    shaftFrame.position.y = TOWER_H - 0.05;
    shaft.add(shaftFrame);
    var cabin = new THREE.Group();
    var cabBody = box(1.16, 2.0, 1.16, K.M('#DCE4EE', { rough: 0.4 }));
    cabBody.position.y = 1.0;
    cabin.add(cabBody);
    var cabDoor = box(0.9, 1.7, 0.04, K.M('#8FB4D6', { op: 0.55 }));
    cabDoor.position.set(0, 1.0, 0.6);
    cabin.add(cabDoor);
    shaft.add(cabin);
    g.add(shaft);
    g.userData.cabin = cabin;

    var labelFloor = box(W + 1.0, 0.18, D + 1.0, slabMat);
    labelFloor.position.y = 0.06;
    labelFloor.visible = false;
    g.add(labelFloor);

    // 每层独立内容
    function addFloor(idx, name, color) {
      var fg = new THREE.Group();
      fg.position.y = idx * GAP;
      fg.name = 'floor' + idx;
      g.add(fg);

      var slab = box(W + 0.5, 0.16, D + 0.5, slabMat);
      slab.position.y = -0.08;
      fg.add(slab);

      var wm = idx === 0 ? wallMat1F : wallMat;
      var wallN = box(W, WALL_H, 0.16, wm);
      wallN.position.set(0, WALL_H / 2, -D / 2);
      wallN.castShadow = true;
      fg.add(wallN);
      var wallW = box(0.16, WALL_H, D, wm);
      wallW.position.set(-W / 2, WALL_H / 2, 0);
      wallW.castShadow = true;
      fg.add(wallW);

      // 楼层标识：idx 0=1F … 3=4F
      var tag = K.textPlane((idx + 1) + 'F · ' + name, {
        w: 640, h: 110, fs: 46, pw: 2.2, bg: color || '#FFFFFF', fg: '#FFFFFF'
      });
      tag.position.set(-W / 2 + 1.3, WALL_H - 0.3, -D / 2 + 0.1);
      fg.add(tag);

      // 电梯对面（西墙）效果看板：内容取 PPT 真实价值点，避免整墙空白
      var eb = [
        ['单张约 10 分钟', '95%+ 识别准确率', '告别加班 · 专注复盘'],
        ['出错率下降约 90%', '全流程报告可追溯', '新人 1 天即可上手'],
        ['图纸不出厂', '本地化部署 · 2 周上线', '开放接口 · 对接 MES / ERP'],
        ['2 小时 → 10 分钟', '图纸处理效率提升约 10 倍', '客户可在线核验 · 决策有据']
      ][idx];
      var wallBoard = posterBoard(boardTexture(function (c, w, h) {
        var bg = c.createLinearGradient(0, 0, w, h);
        bg.addColorStop(0, '#0B1626');
        bg.addColorStop(1, '#12243C');
        c.fillStyle = bg; c.fillRect(0, 0, w, h);
        c.fillStyle = color || '#2F5BE8'; c.fillRect(0, 0, 12, h);
        c.strokeStyle = 'rgba(126,231,255,.28)'; c.lineWidth = 3; c.strokeRect(8, 8, w - 16, h - 16);
        c.fillStyle = '#7EE7FF'; c.font = '700 24px monospace';
        c.fillText('效果看板 · ' + (idx + 1) + 'F · ' + name, 44, 56);
        c.fillStyle = '#FFFFFF'; c.font = '700 58px "Microsoft YaHei"'; c.fillText(eb[0], 44, 140);
        c.fillStyle = 'rgba(196,220,255,.92)'; c.font = '28px "Microsoft YaHei"';
        c.fillText('· ' + eb[1], 44, 218);
        c.fillText('· ' + eb[2], 44, 270);
        c.fillStyle = 'rgba(126,231,255,.55)'; c.font = '20px monospace';
        c.fillText('JIANHUI AI · VALUE', 44, h - 26);
      }, 1024, 400), 4.4);
      wallBoard.position.set(-W / 2 + 0.12, 1.62, 0.3);
      wallBoard.rotation.y = Math.PI / 2;
      fg.add(wallBoard);

      fg.visible = true;
      return fg;
    }

    // 4F 老板办公室
    var f4 = addFloor(3, '老板', '#2F5BE8');
    var d4 = K.desk({ screen: null, lamp: true });
    d4.position.set(-2.1, 0, -1.2);
    f4.add(d4);
    var bossChair = K.person({ shirt: '#243A66', pants: '#2A2F3A', pose: 'sit', s: 0.96 });
    bossChair.position.set(-1.72, 0, -1.82);
    f4.add(bossChair);
    var boss = K.person({ shirt: '#C9A15A', pants: '#333B49', pose: 'stand', s: 1.0 });
    boss.position.set(-3.85, 0, 0.2);
    boss.rotation.y = Math.PI / 2;
    boss.userData.roleId = 'boss';
    f4.add(boss);
    interactives.push(boss);
    var bossRing = K.holoRing(0.5, 0xFFC000);
    bossRing.position.set(-3.85, 0.05, 0.2);
    f4.add(bossRing);
    var sofa = box(1.6, 0.5, 0.72, K.M('#4F6B8E', { rough: 0.8 }));
    sofa.position.set(2.6, 0.3, 2.0);
    f4.add(sofa);
    var table = box(1.0, 0.06, 0.7, K.M('#C9A876'));
    table.position.set(1.2, 0.42, 2.0);
    f4.add(table);
    var plant4 = K.plant(1.2);
    plant4.position.set(-3.8, 0, 2.4);
    f4.add(plant4);
    var board4 = posterBoard(boardTexture(function (c, w, h) {
      var bg = c.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#FFFFFF');
      bg.addColorStop(1, '#ECF3FB');
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2F5BE8'; c.fillRect(0, 0, 10, h);
      c.fillStyle = '#0F172A'; c.font = '700 36px "Microsoft YaHei"'; c.fillText('品质，从成本中心变成拿单的销售话术', 40, 72);
      c.fillStyle = '#1B75BC'; c.font = '700 64px Consolas'; c.fillText('2 小时 → 10 分钟', 40, 190);
      c.fillStyle = '#64748B'; c.font = '24px "Microsoft YaHei"'; c.fillText('检测数据整理时间压缩', 40, 232);
      c.fillStyle = '#0F766E'; c.font = '700 40px "Microsoft YaHei"'; c.fillText('客户可数字化验证，信任度上升', 40, 320);
      c.fillStyle = '#94A3B8'; c.font = '20px "Microsoft YaHei"'; c.fillText('来源：《四类角色价值传播矩阵》· 企业老板 · 价值 / 提升点', 40, 372);
    }, 1024, 420), 3.4);
    board4.position.set(0.5, 1.55, -D / 2 + 0.12);
    f4.add(board4);
    walkerLocal(f4, -0.4, 2.6, -0.4, -2.2, 0.14, '#6D8FB6', 0.2);
    var cab4 = K.cabinet();
    cab4.position.set(3.7, 0, -2.7);
    f4.add(cab4);
    var sec4 = K.desk({ screen: null, lamp: true });
    sec4.position.set(3.1, 0, -1.3);
    sec4.rotation.y = -Math.PI / 2;
    f4.add(sec4);
    var sec4p = K.person({ shirt: '#5C6E8A', pants: '#303845', pose: 'type', s: 0.88 });
    sec4p.position.set(3.72, 0, -0.92);
    sec4p.rotation.y = -Math.PI / 2;
    f4.add(sec4p);
    var guest4 = K.person({ shirt: '#7A93B0', pose: 'sit', s: 0.86 });
    guest4.position.set(0.7, 0, 1.55);
    f4.add(guest4);

    // 3F IT 办公室
    var f3 = addFloor(2, 'IT', '#0EA5A6');
    [1.9, 2.9, 3.9].forEach(function (rx) {
      var rack = K.serverRack();
      rack.position.set(rx, 0, -2.9);
      f3.add(rack);
    });
    var cvsIt = K.canvasTexture(512, 300, function (c, w, h) {
      c.fillStyle = '#0B1D33'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#35A2FF'; c.font = '700 24px Consolas'; c.fillText('NETWORK / MES / ERP', 24, 36);
      c.fillStyle = '#7EE7FF'; c.font = '700 34px "Microsoft YaHei"'; c.fillText('接口状态：在线', 24, 92);
      c.strokeStyle = '#35A2FF'; c.lineWidth = 2;
      for (var i = 0; i < 4; i++) { c.beginPath(); c.moveTo(24, 130 + i * 34); c.lineTo(120 + i * 70, 130 + i * 34); c.stroke(); }
      c.fillStyle = '#4ADE80'; c.font = '700 26px Consolas'; c.fillText('2 周上线 · 本地部署', 24, 260);
    });
    [0.0, 1.4, 2.8, 4.2].forEach(function (dx, i) {
      var desk = K.desk({ screen: { cvs: cvsIt } });
      desk.position.set(-3.4 + dx, 0, 0.4 + (i % 2 ? 0.3 : 0));
      f3.add(desk);
      var tech = K.person({ shirt: i % 2 ? '#4C8BD6' : '#5A7FA8', pose: 'type', s: 0.9 });
      tech.position.set(-3.4 + dx + 0.38, 0, 0.4 + (i % 2 ? 0.3 : 0) - 0.62);
      tech.userData.tick = function (t) {
        var L = tech.userData.limbs;
        if (L) { L.armL.rotation.x = -1.08 + Math.sin(t * 2.4 + i) * 0.1; L.armR.rotation.x = -1.03 + Math.sin(t * 2.4 + i + 1.2) * 0.09; }
      };
      f3.add(tech);
    });
    var itRole = K.person({ shirt: '#0B7285', pants: '#2C3947', pose: 'stand', s: 1.0 });
    itRole.position.set(-3.85, 0, -1.6);
    itRole.rotation.y = Math.PI / 2;
    itRole.userData.roleId = 'it';
    f3.add(itRole);
    interactives.push(itRole);
    var itRing = K.holoRing(0.5, 0x35D6C8);
    itRing.position.set(-3.85, 0.05, -1.6);
    f3.add(itRing);
    var board3 = posterBoard(boardTexture(function (c, w, h) {
      c.fillStyle = '#0B1D33'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#35D6C8'; c.fillRect(0, 0, 10, h);
      c.fillStyle = '#FFFFFF'; c.font = '700 34px "Microsoft YaHei"'; c.fillText('IT 落地三件事', 40, 66);
      [['本地部署', '图纸不出厂'], ['开放接口', '对接 MES / ERP'], ['2 周', '从部署到正式上线']].forEach(function (r, i) {
        c.fillStyle = '#7EE7FF'; c.font = '700 44px "Microsoft YaHei"'; c.fillText(r[0], 40, 140 + i * 80);
        c.fillStyle = '#BBD6F0'; c.font = '24px "Microsoft YaHei"'; c.fillText(r[1], 250, 140 + i * 80);
      });
      c.fillStyle = '#8FA6C2'; c.font = '20px "Microsoft YaHei"'; c.fillText('来源：《四类角色价值传播矩阵》· 企业 IT · 价值', 40, 390);
    }, 1024, 420), 3.4);
    board3.position.set(-0.8, 1.55, -D / 2 + 0.12);
    f3.add(board3);
    walkerLocal(f3, -3.6, 3.2, 2.6, 3.2, 0.13, '#527EA8', 0.5);
    [[-1.8, 2.4], [2.2, 2.4]].forEach(function (pz, i) {
      var d = K.desk({ screen: { cvs: cvsIt } });
      d.position.set(pz[0], 0, pz[1]);
      d.rotation.y = Math.PI;
      f3.add(d);
      var tp = K.person({ shirt: i ? '#4C8BD6' : '#5F7FA6', pose: 'type', s: 0.88 });
      tp.position.set(pz[0] - 0.38, 0, pz[1] + 0.62);
      tp.rotation.y = Math.PI;
      f3.add(tp);
    });
    var techA = K.person({ shirt: '#3E6E88', pose: 'point', s: 0.94 });
    techA.position.set(0.4, 0, -2.5);
    techA.rotation.y = 0.9;
    f3.add(techA);
    var techB = K.person({ shirt: '#4A6B85', pose: 'stand', s: 0.92 });
    techB.position.set(1.4, 0, -2.2);
    techB.rotation.y = -1.6;
    f3.add(techB);

    // 2F 品质管理
    var f2 = addFloor(1, '品质管理', '#C47A16');
    var mt = box(2.6, 0.07, 1.15, K.M('#C9A876'));
    mt.position.set(0.2, 0.78, 0.2);
    f2.add(mt);
    var ml1 = box(0.07, 0.75, 0.07, K.M('#8A939F'));
    ml1.position.set(-0.9, 0.39, -0.25); f2.add(ml1);
    var ml2 = ml1.clone(); ml2.position.set(1.3, 0.39, -0.25); f2.add(ml2);
    var ml3 = ml1.clone(); ml3.position.set(-0.9, 0.39, 0.65); f2.add(ml3);
    var ml4 = ml1.clone(); ml4.position.set(1.3, 0.39, 0.65); f2.add(ml4);
    [[-0.9, -0.5], [0.2, -0.5], [1.3, -0.5], [-0.9, 0.9], [0.2, 0.9], [1.3, 0.9]].forEach(function (p, i) {
      var ch = box(0.42, 0.06, 0.42, K.M('#46525F'));
      ch.position.set(p[0], 0.46, p[1]);
      f2.add(ch);
      if (i !== 2 && i !== 5) {
        var pm = K.person({ shirt: ['#9A6A3A', '#7B8FA6', '#8C7A62', '#6E7F94'][i % 4], pose: 'sit', s: 0.88 });
        pm.position.set(p[0], 0, p[1]);
        f2.add(pm);
      }
    });
    var qaRole = K.person({ shirt: '#B8791F', pants: '#37404D', pose: 'point', s: 1.0 });
    qaRole.position.set(-3.85, 0, -1.2);
    qaRole.rotation.y = Math.PI / 2;
    qaRole.userData.roleId = 'qa';
    f2.add(qaRole);
    interactives.push(qaRole);
    var qaRing = K.holoRing(0.5, 0xFFC000);
    qaRing.position.set(-3.85, 0.05, -1.2);
    f2.add(qaRing);
    var wb2 = K.whiteboard();
    wb2.position.set(-2.4, 0, -D / 2 + 0.24);
    f2.add(wb2);
    var board2 = posterBoard(boardTexture(function (c, w, h) {
      c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#C47A16'; c.fillRect(0, 0, 10, h);
      c.fillStyle = '#0F172A'; c.font = '700 36px "Microsoft YaHei"'; c.fillText('品质管理的三个答案', 40, 68);
      c.fillStyle = '#B45309'; c.font = '700 62px Consolas'; c.fillText('约 90%', 40, 176);
      c.fillStyle = '#64748B'; c.font = '24px "Microsoft YaHei"'; c.fillText('出错率下降', 40, 214);
      c.fillStyle = '#1B75BC'; c.font = '700 30px "Microsoft YaHei"'; c.fillText('报告可追溯 · 新人快上手', 40, 292);
      c.fillStyle = '#94A3B8'; c.font = '20px "Microsoft YaHei"'; c.fillText('来源：《四类角色价值传播矩阵》· 品质部管理者', 40, 380);
    }, 1024, 420), 3.4);
    board2.position.set(1.0, 1.55, -D / 2 + 0.12);
    f2.add(board2);
    var d2 = K.desk({ screen: null });
    d2.position.set(3.0, 0, 2.2);
    f2.add(d2);
    var p2 = K.person({ shirt: '#6D8FB6', pose: 'type', s: 0.88 });
    p2.position.set(3.38, 0, 1.58);
    f2.add(p2);
    walkerLocal(f2, -3.4, 3.0, -3.4, -1.4, 0.14, '#8A9AB0', 0.7);
    var qaTalk = K.person({ shirt: '#8B6E45', pose: 'point', s: 0.94 });
    qaTalk.position.set(-2.2, 0, 1.6);
    qaTalk.rotation.y = -0.8;
    f2.add(qaTalk);

    // 1F 质检员车间
    var f1 = addFloor(0, '质检员', '#475569');
    [-3.6, -1.2, 1.2, 3.6].forEach(function (bx) {
      var bench = box(1.8, 0.08, 0.8, K.M('#B9BFC7'));
      bench.position.set(bx, 0.8, 0.4);
      f1.add(bench);
      var leg = box(0.08, 0.78, 0.08, K.M('#7E8894'));
      leg.position.set(bx - 0.7, 0.39, 0.4); f1.add(leg);
      var leg2 = leg.clone(); leg2.position.set(bx + 0.7, 0.39, 0.4); f1.add(leg2);
      var part = box(0.4, 0.12, 0.28, K.M('#C9CED6'));
      part.position.set(bx, 0.88, 0.4);
      f1.add(part);
      var worker = K.person({ shirt: '#4B6B8C', pants: '#2F3945', pose: 'tired', s: 0.9 });
      worker.position.set(bx - 0.2, 0, -0.35);
      worker.rotation.y = Math.PI;
      worker.userData.tick = function (t) {
        var L = worker.userData.limbs;
        if (L) { L.head.rotation.x = 0.42 + Math.sin(t * 1.6 + bx) * 0.05; }
      };
      f1.add(worker);
    });
    var cmm1 = K.cmm();
    cmm1.position.set(-3.2, 0, -2.2);
    f1.add(cmm1);
    var arm1 = K.robotArm();
    arm1.position.set(3.2, 0, -2.2);
    f1.add(arm1);
    var conv1 = K.conveyor(3.4);
    conv1.position.set(1.2, 0.32, 2.6);
    f1.add(conv1);
    var qcRole = K.person({ shirt: '#33546F', pants: '#2B333D', pose: 'stand', s: 0.98 });
    qcRole.position.set(-3.85, 0, 1.35);
    qcRole.rotation.y = Math.PI / 2;
    qcRole.userData.roleId = 'qcinsp';
    f1.add(qcRole);
    interactives.push(qcRole);
    var qcRing = K.holoRing(0.5, 0x7EE7FF);
    qcRing.position.set(-3.85, 0.05, 1.35);
    f1.add(qcRing);
    var board1 = posterBoard(boardTexture(function (c, w, h) {
      c.fillStyle = '#0B1626'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#7EE7FF'; c.fillRect(0, 0, 10, h);
      c.fillStyle = '#FFFFFF'; c.font = '700 36px "Microsoft YaHei"'; c.fillText('质检员的一天', 40, 66);
      c.fillStyle = '#FFC000'; c.font = '700 60px Consolas'; c.fillText('约 10 分钟 / 张', 40, 166);
      c.fillStyle = '#9FB3C8'; c.font = '26px "Microsoft YaHei"'; c.fillText('AI 自动提取尺寸与公差', 40, 210);
      c.fillStyle = '#7EE7FF'; c.font = '700 34px Consolas'; c.fillText('95%+ 识别准确率', 40, 286);
      c.fillStyle = '#8FA6C2'; c.font = '20px "Microsoft YaHei"'; c.fillText('来源：PPT · 简会 AI 图纸识别系统', 40, 380);
    }, 1024, 420), 3.4);
    board1.position.set(-0.2, 1.55, -D / 2 + 0.12);
    f1.add(board1);
    var d1 = K.desk({ screen: null });
    d1.position.set(3.2, 0, 1.7);
    f1.add(d1);
    walkerLocal(f1, -3.6, 2.4, 2.2, 2.4, 0.15, '#4F6B88', 0.4);
    var convMan = K.person({ shirt: '#587A99', pose: 'point', s: 0.9 });
    convMan.position.set(2.6, 0, 2.6);
    convMan.rotation.y = Math.PI;
    f1.add(convMan);
    walkerLocal(f1, 2.9, -2.6, -3.4, -2.6, 0.12, '#5C7C9A', 1.2);

    floors.push(f1, f2, f3, f4);
    g.userData.floors = floors;
    roleFloorTargets = [];
    floors.forEach(function (fg, i) {
      var y = i * GAP;
      roleFloorTargets[i] = {
        camPos: new THREE.Vector3(5 + 13.5, y + 12.5, 7.6 + 16.5),
        camTarget: new THREE.Vector3(5, y + 1.0, 7.6),
        shift: 130
      };
    });
    roleFloorIndex = 3;
    sceneRefs[3] = g;
    syncFloorTabs();
  }

  /* ---------------- 场景④ F06 10F 办公层 ---------------- */
  function buildTower() {
    var g = new THREE.Group();
    // 公司在大楼 10F：内景放在塔楼中间层（下方 9 层、上方 2 层）
    var G_FLOOR = 10;
    var SH_FH = 2.65;
    var SH_BELOW = 9, SH_ABOVE = 2;
    var SH_BOTTOM = -SH_BELOW * SH_FH;
    var SH_TOP = (SH_ABOVE + 1) * SH_FH;
    g.position.set(14, -SH_BOTTOM * 0.78, -11);
    g.scale.setScalar(0.78);
    g.name = 'towerScene';
    campus.add(g);

    var W = 17.2, D = 11.7, WALL_H = 3.1;
    var wood = K.M('#D9C4A2', { rough: 0.85 });
    var woodL = K.M('#E7D7BE', { rough: 0.85 });
    var part = K.M('#F3F6FA', { rough: 0.8 });
    var metal = K.M('#5E6B7C', { rough: 0.5 });

    // 楼板 / 地面
    var slab = box(W + 0.7, 0.18, D + 0.7, K.M('#B9C4D2'));
    slab.position.y = -0.09;
    slab.receiveShadow = true;
    g.add(slab);
    var floor = box(W, 0.06, D, wood);
    floor.position.y = 0.01;
    floor.receiveShadow = true;
    g.add(floor);

    // 保留两堵墙：北墙 + 西墙
    var wallN = box(W, WALL_H, 0.18, K.M('#EDF1F6', { rough: 0.75 }));
    wallN.position.set(0, WALL_H / 2, -D / 2);
    wallN.castShadow = true; wallN.receiveShadow = true;
    g.add(wallN);
    var wallW = box(0.18, WALL_H, D, K.M('#EDF1F6', { rough: 0.75 }));
    wallW.position.set(-W / 2, WALL_H / 2, 0);
    wallW.castShadow = true; wallW.receiveShadow = true;
    g.add(wallW);

    // 低隔断
    function partition(x, z, w, d) {
      var p = box(w, 0.94, d, part);
      p.position.set(x, 0.47, z);
      p.castShadow = true;
      g.add(p);
      var cap = box(w + 0.04, 0.05, d + 0.04, K.M('#CBD5E1'));
      cap.position.set(x, 0.97, z);
      g.add(cap);
    }
    partition(-5.9, -4.02, 0.12, 3.66);   // 总经理室 / 东
    partition(-7.25, -2.2, 2.7, 0.12);    // 总经理室 / 南
    partition(-3.15, -2.9, 5.3, 0.12);     // 会议室 2 / 南
    partition(-5.8, -4.38, 0.12, 2.96);   // 会议室 2 / 西
    partition(0.2, -0.7, 0.12, 4.4);       // 会议室 1 / 东
    partition(-2.05, 1.5, 4.5, 0.12);      // 会议室 1 / 南
    partition(-4.3, -0.7, 0.12, 4.4);      // 会议室 1 / 西
    partition(-5.3, 0.4, 0.12, 5.0);       // 人事部 / 东
    partition(-6.95, 2.9, 3.3, 0.12);      // 人事部 / 南
    partition(-7.6, 3.9, 2.3, 0.12);       // 业务增长部 / 北（西段，留门）
    partition(-2.65, 3.9, 3.3, 0.12);      // 业务增长部 / 北（东段，留门）
    partition(-1.0, 4.78, 0.12, 1.74);     // 业务增长部 / 东
    partition(-0.7, 4.68, 0.12, 1.94);     // 机房 / 西
    partition(1.3, 4.68, 0.12, 1.94);      // 机房 / 东
    partition(0.3, 3.7, 2.0, 0.12);        // 机房 / 北
    // 阳台玻璃隔断
    var balc = box(8.8, 1.5, 0.06, glassMat(0xBFE4F5, 0.3));
    balc.position.set(4.0, 0.75, -4.5);
    g.add(balc);

    // 南侧玻璃幕墙 + 两扇推拉门
    var glassS = box(W, WALL_H, 0.06, glassMat(0xCFE6F7, 0.26));
    glassS.position.set(0, WALL_H / 2, D / 2);
    g.add(glassS);
    var frameS = box(W, 0.12, 0.14, metal);
    frameS.position.set(0, WALL_H, D / 2);
    g.add(frameS);
    var frameS2 = box(W, 0.09, 0.14, metal);
    frameS2.position.set(0, 0.05, D / 2);
    g.add(frameS2);
    [-8.6, -5.6, -2.6, 0.4, 3.4, 6.4, 8.6].forEach(function (fx) {
      var mull = box(0.1, WALL_H, 0.12, metal);
      mull.position.set(fx, WALL_H / 2, D / 2);
      g.add(mull);
    });
    var doorGroup = new THREE.Group();
    var doorL = box(1.25, 2.5, 0.06, glassMat(0xBEE0F6, 0.42));
    doorL.position.set(0, 1.25, 0);
    var doorR = doorL.clone();
    doorR.position.set(1.25, 1.25, 0);
    doorL.userData.baseX = 0; doorR.userData.baseX = 1.25;
    doorGroup.add(doorL, doorR);
    doorGroup.position.set(1.4, 0, D / 2 + 0.02);
    g.add(doorGroup);
    g.userData.doorPanels = [doorL, doorR];

    // F06 红色招牌只做大楼顶部外立面（见下方 shell）

    // 公司大楼外立面：总览时整栋可见，进入内部（镜头抵近幕墙前）再隐藏
    // 公司大楼外立面：按实拍图还原（挺拔比例 + 竖向白色鳍片 + 玻璃幕墙 + 顶部红色招牌）
    var shell = new THREE.Group();
    shell.name = 'towerShell';
    var SW = W + 2.0, SD = D + 2.0;
    var SH = SH_TOP - SH_BOTTOM;
    var shellBand = K.M('#E3EAF3', { rough: 0.6 });
    var finMat = K.M('#F3F7FB', { rough: 0.55 });
    var facadeCvs = K.canvasTexture(1024, 1024, function (c, w, h) {
      c.fillStyle = '#E9EFF7'; c.fillRect(0, 0, w, h);
      // 竖向：白色鳍片 + 蓝灰玻璃肋
      for (var fx = 0; fx < w; fx += 26) {
        var gx = c.createLinearGradient(fx, 0, fx + 18, 0);
        gx.addColorStop(0, '#7FA3C4');
        gx.addColorStop(0.5, '#C6DCEE');
        gx.addColorStop(1, '#8AAECB');
        c.fillStyle = gx; c.fillRect(fx, 0, 18, h);
        c.fillStyle = '#FAFCFE'; c.fillRect(fx + 18, 0, 8, h);
      }
      // 横向：每层楼板带（12 层）
      for (var fy = 0; fy <= 12; fy++) {
        var ly = h - fy * (h / 12);
        c.fillStyle = '#D5DFEA'; c.fillRect(0, ly - 10, w, 14);
        c.fillStyle = '#FBFDFF'; c.fillRect(0, ly - 14, w, 4);
      }
      c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(0, h * 0.12, w, 6);
    });
    var facadeTex = facadeCvs.tex;
    facadeTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    var sideTex = facadeTex.clone();
    sideTex.wrapS = THREE.ClampToEdgeWrapping;
    sideTex.wrapT = THREE.ClampToEdgeWrapping;
    sideTex.repeat.set(SD / SW, 1);
    sideTex.offset.set((1 - SD / SW) / 2, 0);
    sideTex.needsUpdate = true;
    var facMat = new THREE.MeshStandardMaterial({ map: facadeTex, roughness: 0.5, metalness: 0.12 });
    var facMatSide = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.5, metalness: 0.12 });
    var midY = (SH_TOP + SH_BOTTOM) / 2;
    function facadePlane(ww, hh, mat, px, pz, ry) {
      var pm = new THREE.Mesh(new THREE.PlaneGeometry(ww, hh), mat);
      pm.position.set(px, midY, pz);
      pm.rotation.y = ry;
      shell.add(pm);
    }
    facadePlane(SW, SH, facMat, 0, SD / 2, 0);
    facadePlane(SW, SH, facMat, 0, -SD / 2, Math.PI);
    facadePlane(SD, SH, facMatSide, SW / 2, 0, Math.PI / 2);
    facadePlane(SD, SH, facMatSide, -SW / 2, 0, -Math.PI / 2);
    // 楼板带（13 道，含屋面）
    for (var sf = 0; sf <= 12; sf++) {
      var sb = box(SW + 0.18, 0.2, SD + 0.18, shellBand);
      sb.position.y = SH_BOTTOM + sf * SH_FH;
      sb.castShadow = true;
      shell.add(sb);
    }
    // 竖向鳍片（3D 出挑，强化实拍的竖线条）
    for (var fx2 = -SW / 2 + 1.2; fx2 <= SW / 2 - 1.19; fx2 += 2.4) {
      var fs1 = box(0.18, SH, 0.34, finMat);
      fs1.position.set(fx2, midY, SD / 2 + 0.12);
      shell.add(fs1);
      var fs2 = box(0.18, SH, 0.34, finMat);
      fs2.position.set(fx2, midY, -SD / 2 - 0.12);
      shell.add(fs2);
    }
    for (var fz = -SD / 2 + 1.2; fz <= SD / 2 - 1.19; fz += 2.4) {
      var fe1 = box(0.34, SH, 0.18, finMat);
      fe1.position.set(SW / 2 + 0.12, midY, fz);
      shell.add(fe1);
      var fe2 = box(0.34, SH, 0.18, finMat);
      fe2.position.set(-SW / 2 - 0.12, midY, fz);
      shell.add(fe2);
    }
    [[-SW / 2, -SD / 2], [SW / 2, -SD / 2], [-SW / 2, SD / 2], [SW / 2, SD / 2]].forEach(function (p) {
      var col = box(0.58, SH, 0.58, finMat);
      col.position.set(p[0], midY, p[1]);
      col.castShadow = true;
      shell.add(col);
    });
    // 女儿墙：四道薄墙围合（中间留空，露出屋顶末页内容）
    [[0, (SD + 0.36) / 2], [0, -(SD + 0.36) / 2]].forEach(function (p) {
      var pn = box(SW + 0.36, 0.55, 0.18, shellBand);
      pn.position.set(p[0], SH_TOP + 0.28, p[1]);
      shell.add(pn);
    });
    [[(SW + 0.36) / 2, 0], [-(SW + 0.36) / 2, 0]].forEach(function (p) {
      var pe = box(0.18, 0.55, SD + 0.36, shellBand);
      pe.position.set(p[0], SH_TOP + 0.28, p[1]);
      shell.add(pe);
    });
    var roofSlab = box(SW, 0.3, SD, K.M('#EDF2F8'));
    roofSlab.position.y = SH_TOP + 0.15;
    shell.add(roofSlab);

    // 顶部红色招牌：F06 在左，跟实拍图同一行
    var signCvs = K.canvasTexture(1600, 170, function (c, w, h) {
      c.fillStyle = '#C0182B'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#FFC000'; c.font = '700 92px Consolas'; c.fillText('F06', 40, 116);
      c.fillStyle = '#FFFFFF'; c.font = '700 62px "Microsoft YaHei"'; c.fillText('福建省（厦门）人工智能产业园', 250, 112);
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 4; c.strokeRect(6, 6, w - 12, h - 12);
    });
    var signExt = posterBoard(signCvs, 13.6);
    signExt.position.set(0, SH_TOP - 2.7, SD / 2 + 0.42);
    shell.add(signExt);

    // 屋顶：PPT 末页内容（联系方式 / 地址 / 品牌信息）
    var roofCvs = K.canvasTexture(1600, 900, function (c, w, h) {
      var bg = c.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#08182E');
      bg.addColorStop(1, '#123C74');
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(126,231,255,.55)'; c.lineWidth = 6; c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#7EE7FF'; c.font = '700 30px monospace'; c.fillText('JIANHUI  ·  THANK YOU', 54, 70);
      c.fillStyle = '#FFFFFF'; c.font = '700 76px "Microsoft YaHei"'; c.fillText('携手并进 · 共创智造未来', 52, 182);
      c.fillStyle = 'rgba(196,220,255,.92)'; c.font = '30px "Microsoft YaHei"';
      c.fillText('以AI赋能制造业质量管理数字化转型，', 54, 242);
      c.fillText('构建全流程、智能化、可追溯的质量闭环体系', 54, 284);
      c.strokeStyle = 'rgba(126,231,255,.34)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(54, 326); c.lineTo(w - 54, 326); c.stroke();
      var cols = [
        ['联系电话', '15759627233'],
        ['电子邮箱', 'hongsongxian@xmjianhui.com'],
        ['公司地址', '厦门市集美区软件园三期 F06 栋 1004 室']
      ];
      cols.forEach(function (col, i) {
        var x = 54 + i * 500;
        c.fillStyle = 'rgba(126,231,255,.78)'; c.font = '22px monospace'; c.fillText(col[0], x, 402);
        c.fillStyle = '#FFFFFF'; c.font = i === 2 ? '700 30px "Microsoft YaHei"' : (i === 0 ? '700 42px monospace' : '700 25px monospace');
        if (i === 2) {
          c.fillText('厦门市集美区软件园三期', x, 452);
          c.fillText('F06 栋 1004 室', x, 494);
        } else {
          c.fillText(col[1], x, 452);
        }
      });
      c.fillStyle = 'rgba(126,231,255,.62)'; c.font = '700 46px "Microsoft YaHei"'; c.fillText('简会', 54, h - 48);
      c.fillStyle = 'rgba(190,212,240,.5)'; c.font = '22px monospace'; c.fillText('AI DRAWING RECOGNITION SYSTEM', 158, h - 52);
    });
    var roofPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(14.8, 8.3),
      new THREE.MeshBasicMaterial({ map: roofCvs.tex })
    );
    roofPanel.rotation.x = -Math.PI / 2;
    roofPanel.position.set(0, SH_TOP + 0.34, 0.2);
    shell.add(roofPanel);

    g.add(shell);
    g.userData.extGroup = shell;

    // 10F 中间层语境：南侧 / 北侧保留上下幕墙片段与楼层带，镜头始终处于楼层中段
    var facGlass = glassMat(0xBBD9EE, 0.16);
    var bandMat = K.M('#C4CFDC', { rough: 0.6 });
    function northSeg(y, hh) {
      var seg = box(W, hh, 0.06, facGlass);
      seg.position.set(0, y, -D / 2 - 0.5);
      g.add(seg);
      var band = box(W + 0.5, 0.22, 0.6, bandMat);
      band.position.set(0, y - hh / 2 - 0.02, -D / 2 - 0.5);
      g.add(band);
      for (var fmx = -8.0; fmx <= 8.01; fmx += 2.0) {
        var fm = box(0.09, hh, 0.1, metal);
        fm.position.set(fmx, y, -D / 2 - 0.47);
        g.add(fm);
      }
    }
    northSeg(WALL_H + 1.35, 2.6);
    northSeg(-1.3, 2.4);

    var facGlassS = glassMat(0xC7E2F4, 0.12);
    function southSeg(y, hh, label) {
      var seg = box(W, hh, 0.05, facGlassS);
      seg.position.set(0, y, D / 2 + 0.2);
      g.add(seg);
      for (var fx = -W / 2 + 1.1; fx <= W / 2 - 1.09; fx += 2.2) {
        var mm = box(0.08, hh, 0.09, metal);
        mm.position.set(fx, y, D / 2 + 0.22);
        g.add(mm);
      }
      var band = box(W + 0.5, 0.24, 0.5, bandMat);
      band.position.set(0, y - hh / 2 - 0.02, D / 2 + 0.28);
      g.add(band);
      if (label) {
        var tp = K.textPlane(label, { w: 440, h: 96, fs: 38, pw: 1.8, bg: '#C4CFDC', fg: '#334155' });
        tp.position.set(-W / 2 + 1.9, y - hh / 2 + 0.16, D / 2 + 0.55);
        g.add(tp);
      }
    }
    southSeg(WALL_H + 1.32, 2.55, '11F');
    southSeg(-1.28, 2.4, '9F');
    var f10Tag = K.textPlane(G_FLOOR + 'F · 办公层', {
      w: 620, h: 104, fs: 44, pw: 2.4, bg: '#2F5BE8', fg: '#FFFFFF'
    });
    // 放在 10F 幕墙开敞段的玻璃外侧，进入场景时正对镜头
    f10Tag.name = 'f10Tag';
    f10Tag.position.set(-1.2, 2.55, D / 2 + 0.55);
    g.add(f10Tag);

    // 墙面看板（PPT 原文信息）
    function officeBoard(x, draw) {
      var b = posterBoard(boardTexture(draw, 960, 520), 3.5);
      b.position.set(x, 1.28, -D / 2 + 0.11);
      g.add(b);
    }
    officeBoard(-3.2, function (c, w, h) {
      c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1B75BC'; c.fillRect(0, 0, 10, h);
      c.fillStyle = '#0F172A'; c.font = '700 34px "Microsoft YaHei"'; c.fillText('AI 识图 · 从图纸到数据', 40, 66);
      c.fillStyle = '#1B75BC'; c.font = '700 66px Consolas'; c.fillText('2 小时 → 约 10 分钟', 40, 168);
      c.fillStyle = '#64748B'; c.font = '24px "Microsoft YaHei"'; c.fillText('单张图纸 · 100–200 个尺寸自动提取', 40, 210);
      c.fillStyle = '#0F766E'; c.font = '700 40px "Microsoft YaHei"'; c.fillText('95%+ 识别准确率 · 结果可复核', 40, 296);
      c.fillStyle = '#94A3B8'; c.font = '20px "Microsoft YaHei"'; c.fillText('内容来源：简会 AI 图纸识别系统 PPT', 40, 452);
    });
    officeBoard(1.4, function (c, w, h) {
      c.fillStyle = '#0B1626'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#35A2FF'; c.fillRect(0, 0, 10, h);
      c.fillStyle = '#FFFFFF'; c.font = '700 36px "Microsoft YaHei"'; c.fillText('50+ 大型企业已落地', 40, 70);
      c.fillStyle = '#FFC000'; c.font = '700 58px "Microsoft YaHei"'; c.fillText('图纸不出厂', 40, 166);
      c.fillStyle = '#9FB3C8'; c.font = '24px "Microsoft YaHei"'; c.fillText('本地部署 · 2 周上线', 40, 208);
      c.fillStyle = '#7EE7FF'; c.font = '700 34px "Microsoft YaHei"'; c.fillText('开放接口 · 对接 MES / ERP', 40, 292);
      c.fillStyle = '#8FA6C2'; c.font = '20px "Microsoft YaHei"'; c.fillText('内容来源：简会 AI 图纸识别系统 PPT', 40, 452);
    });
    // 南向玻璃内侧一张海报
    var posterS = posterBoard(boardTexture(function (c, w, h) {
      c.fillStyle = '#F4F8FC'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2F5BE8'; c.font = '700 40px "Microsoft YaHei"'; c.fillText('简会 AI 图纸识别系统', 40, 70);
      c.fillStyle = '#1B75BC'; c.font = '700 62px Consolas'; c.fillText('识别效率 ×10', 40, 170);
      c.fillStyle = '#334155'; c.font = '26px "Microsoft YaHei"'; c.fillText('质检员从「逐个标气泡」转为「复核结果」', 40, 226);
      c.fillStyle = '#64748B'; c.font = '22px "Microsoft YaHei"'; c.fillText('内容来源：PPT · 客户价值页', 40, 380);
    }, 960, 460), 3.0);
    posterS.position.set(-5.0, 1.5, 5.72);
    posterS.rotation.y = Math.PI;
    g.add(posterS);

    // 工位：开发部 24 个，每个工位都有人
    var sharedScreen = K.aiScreenCvs();
    anims.push({ userData: { tick: function (t) { sharedScreen.tick(t); } } });
    var shirtPool = ['#4C78A8', '#5B8FB9', '#6D8FB6', '#3F6E96', '#7B9FC7', '#4A6FA5'];
    function workstation(x, z, ry, ci) {
      var d = K.desk({ screen: { cvs: sharedScreen } });
      d.position.set(x, 0, z);
      d.rotation.y = ry;
      g.add(d);
      var off = new THREE.Vector3(0.38, 0, -0.62).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      var p = K.person({ shirt: shirtPool[ci % shirtPool.length], pants: '#39424E', pose: 'type', s: 0.88 });
      p.position.set(x + off.x, 0.02, z + off.z);
      p.rotation.y = ry;
      p.userData.tick = function (t) {
        var L = p.userData.limbs;
        if (L) {
          L.armL.rotation.x = -1.1 + Math.sin(t * 2.3 + ci) * 0.11;
          L.armR.rotation.x = -1.03 + Math.sin(t * 2.3 + ci + 1.3) * 0.1;
        }
      };
      g.add(p);
      return p;
    }
    var ci = 0;
    [-3.3, -2.5, -1.7, -0.9, -0.1, 0.7].forEach(function (z) {
      workstation(1.0, z, 0, ci++);
      workstation(2.6, z, 0, ci++);
    });
    [-3.2, -1.7, -0.2].forEach(function (z) {
      [5.2, 6.1, 7.0, 7.9].forEach(function (x) {
        workstation(x, z, Math.PI / 2, ci++);
      });
    });
    // 业务增长部 8 个工位
    var bizX = [-6.8, -5.25, -3.7, -2.15];
    bizX.forEach(function (x, i) {
      var d = K.desk({ screen: { cvs: sharedScreen } });
      d.position.set(x, 0, 4.7);
      g.add(d);
      var p = K.person({ shirt: shirtPool[(i + 2) % shirtPool.length], pose: 'type', s: 0.86 });
      p.position.set(x + 0.38, 0.02, 4.08);
      p.userData.tick = function (t) {
        var L = p.userData.limbs;
        if (L) { L.armL.rotation.x = -1.08 + Math.sin(t * 2.4 + i) * 0.1; L.armR.rotation.x = -1.02 + Math.sin(t * 2.4 + i + 1) * 0.1; }
      };
      g.add(p);
    });

    // 总经理室
    var bossDesk = K.desk({ screen: null, lamp: true });
    bossDesk.position.set(-7.0, 0, -4.3);
    g.add(bossDesk);
    var bossP = K.person({ shirt: '#2F3E55', pose: 'type', s: 0.98 });
    bossP.position.set(-6.62, 0.02, -4.92);
    g.add(bossP);
    var sofa = box(1.5, 0.48, 0.7, K.M('#53657E', { rough: 0.8 }));
    sofa.position.set(-6.8, 0.28, -2.9);
    g.add(sofa);
    var plantB = K.plant(1.1);
    plantB.position.set(-8.1, 0, -2.6);
    g.add(plantB);

    // 会议室 2：椭圆桌 + 6 人
    var mt2 = box(2.6, 0.06, 1.0, K.M('#C9A876'));
    mt2.position.set(-3.1, 0.76, -4.2);
    g.add(mt2);
    [[-4.1, -4.2], [-3.1, -4.2], [-2.1, -4.2], [-4.1, -3.5], [-3.1, -3.5], [-2.1, -3.5]].forEach(function (p, i) {
      var ch = box(0.4, 0.06, 0.4, K.M('#46525F'));
      ch.position.set(p[0], 0.45, p[1]);
      g.add(ch);
      if (i !== 2 && i !== 4) {
        var pm = K.person({ shirt: shirtPool[(i + 3) % shirtPool.length], pose: 'sit', s: 0.86 });
        pm.position.set(p[0], 0, p[1]);
        g.add(pm);
      }
    });

    // 会议室 1：长桌 + 6 人
    var mt1 = box(3.0, 0.06, 1.1, K.M('#C9A876'));
    mt1.position.set(-2.1, 0.76, -0.6);
    g.add(mt1);
    [[-3.0, -1.2], [-2.1, -1.2], [-1.2, -1.2], [-3.0, 0.0], [-2.1, 0.0], [-1.2, 0.0]].forEach(function (p, i) {
      var ch = box(0.4, 0.06, 0.4, K.M('#46525F'));
      ch.position.set(p[0], 0.45, p[1]);
      g.add(ch);
      if (i === 1 || i === 3) {
        var pm = K.person({ shirt: shirtPool[(i + 5) % shirtPool.length], pose: 'sit', s: 0.86 });
        pm.position.set(p[0], 0, p[1]);
        g.add(pm);
      }
    });

    // 人事部：2 个工位
    [-7.0, -5.8].forEach(function (x, i) {
      var d = K.desk({ screen: null });
      d.position.set(x, 0, 0.9);
      g.add(d);
      var p = K.person({ shirt: shirtPool[(i + 4) % shirtPool.length], pose: 'type', s: 0.86 });
      p.position.set(x + 0.38, 0.02, 0.28);
      g.add(p);
    });

    // 机房：3 台机柜
    [3.9, 4.75, 5.6].forEach(function (z) {
      var rack = K.serverRack();
      rack.position.set(-0.05, 0, z);
      g.add(rack);
    });
    var itP = K.person({ shirt: '#2C3E50', pose: 'stand', s: 0.92 });
    itP.position.set(0.9, 0, 4.6);
    itP.rotation.y = Math.PI;
    g.add(itP);

    // 阳台：绿植 + 休闲桌
    [0.8, 2.4, 4.0, 5.6, 7.2].forEach(function (x) {
      var pl = K.plant(1.0);
      pl.position.set(x, 0, -5.2);
      g.add(pl);
    });
    var balTable = box(0.8, 0.05, 0.8, K.M('#D7C4A8'));
    balTable.position.set(6.4, 0.42, -4.9);
    g.add(balTable);

    // 吧台 / 待确认区（平面图未标注用途）
    var bar = box(2.8, 0.9, 0.7, K.M('#F5F7FA', { rough: 0.7 }));
    bar.position.set(6.3, 0.45, 4.9);
    g.add(bar);
    var barTop = box(3.0, 0.06, 0.82, K.M('#2F5BE8'));
    barTop.position.set(6.3, 0.93, 4.9);
    g.add(barTop);
    var coffee = K.coffee();
    coffee.position.set(5.3, 0.96, 4.9);
    g.add(coffee);
    var printer = K.printer();
    printer.position.set(3.2, 0, 4.7);
    g.add(printer);
    var tagUnknown = floorLabel('待确认 · 吧台区', 6.2, 4.1, 1.7, '#FFF4D6', '#B45309');
    g.add(tagUnknown);

    // 房间地面标签
    g.add(floorLabel('总经理室', -7.2, -4.0, 1.5));
    g.add(floorLabel('会议室 2', -3.1, -3.3, 1.5));
    g.add(floorLabel('会议室 1', -2.1, 0.5, 1.4));
    g.add(floorLabel('人事部', -6.8, 1.9, 1.3));
    g.add(floorLabel('业务增长部', -4.6, 5.15, 1.8));
    g.add(floorLabel('机房', 0.3, 3.7, 1.1));
    g.add(floorLabel('开发部', 4.3, 2.2, 1.5));
    g.add(floorLabel('阳台', 2.2, -5.15, 1.2));

    // 持续走动：沿走廊与开发部过道，路径不穿墙不穿桌
    walkerLocal(g, -4.6, 3.4, -4.6, -0.9, 0.11, '#4F6B88', 0.1);
    walkerLocal(g, 4.0, 4.6, 4.0, -4.2, 0.13, '#5A7FA8', 0.55);
    walkerLocal(g, 2.2, 3.4, 7.4, 3.4, 0.10, '#7B8FA6', 0.35);
    walkerLocal(g, -8.0, 2.2, -8.0, -1.5, 0.09, '#6D8FB6', 0.8);

    // 窗外城市天际线（不展示大楼本体，只做玻璃幕墙外的环境）
    var skyline = new THREE.Group();
    var skyMat = K.M('#B7C8DA', { rough: 0.9 });
    [[-8, 6.4], [-3.5, 9.2], [1.6, 5.0], [6.8, 8.4], [11.0, 6.0]].forEach(function (b, i) {
      var h = b[1];
      var bd = box(2.2, h, 2.0, skyMat);
      bd.position.set(b[0], h / 2 - 0.4, 15.5 + i * 1.5);
      skyline.add(bd);
    });
    g.add(skyline);
    // 天际线仅作远景备选，默认隐藏：进入动画从空中下降到幕墙外，避免体块挡镜
    skyline.visible = false;
    g.userData.skyline = skyline;

    sceneRefs[4] = g;
  }

  /* ---------------- 场景⑤ 客户矩阵（地面全清单 + 墙面真实行业分类） ---------------- */
  function buildClients() {
    var g = new THREE.Group();
    g.position.set(19.6, 0, 5.8);
    g.name = 'clientsScene';
    campus.add(g);

    var W = 10.2, D = 7.6, H = 3.2;
    var wallMat = new THREE.MeshStandardMaterial({ color: 0xF3F7FB, roughness: 0.82, metalness: 0 });
    var wallN = box(W, H, 0.14, wallMat);
    wallN.position.set(0, H / 2, -D / 2 + 0.07);
    wallN.castShadow = true; wallN.receiveShadow = true;
    g.add(wallN);
    var wallW = box(0.14, H, D, wallMat);
    wallW.position.set(-W / 2 + 0.07, H / 2, 0);
    wallW.castShadow = true; wallW.receiveShadow = true;
    g.add(wallW);

    [[-4.6, -D / 2 + 0.16], [4.6, -D / 2 + 0.16]].forEach(function (p) {
      var strip = box(0.14, H - 0.4, 0.05, K.M('#2F5BE8', { op: 0.22, rough: 0.3 }));
      strip.position.set(p[0], H / 2, p[1]);
      g.add(strip);
    });

    // 真实行业分类（按 Excel「所属行业」字段归类）
    var GROUPS = [
      { key: '电梯', title: '电梯整机与服务', color: '#35A2FF' },
      { key: '汽车零部件', title: '汽车零部件', color: '#FFC000' },
      { key: '精密制造', title: '精密制造与模具', color: '#7EE7FF' },
      { key: '电子·光学', title: '电子 · 光学 · 电声', color: '#8FD8B6' },
      { key: '半导体·陶瓷', title: '半导体 · 陶瓷 · 流体', color: '#C8B6FF' },
      { key: '工业装备·软件', title: '工业装备 · 软件', color: '#FF8AB0' }
    ];
    function groupItems(key) {
      return CUSTOMERS.filter(function (c) { return c.cat === key; });
    }

    // 地面：整张「部分客户清单」（白底，按行业分列，对齐参考图）
    var floorCvs = K.canvasTexture(1800, 1200, function (c, w, h) {
      var bg = c.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#FFFFFF');
      bg.addColorStop(1, '#F3F8FD');
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1B75BC';
      c.font = '700 30px monospace';
      c.fillText('PARTIAL CLIENT LIST', 56, 68);
      c.fillStyle = '#0F172A';
      c.font = '700 62px "Microsoft YaHei"';
      c.fillText('部分客户清单', 54, 138);
      c.fillStyle = '#7C8CA2';
      c.font = '24px "Microsoft YaHei"';
      c.fillText('按行业分组 · 展示部分合作客户', 56, 184);
      c.fillStyle = 'rgba(47,91,232,.18)';
      c.fillRect(56, 208, w - 112, 2);

      var colW = 286, x0 = 56, y0 = 236;
      GROUPS.forEach(function (grp, gi) {
        var items = groupItems(grp.key);
        var x = x0 + gi * colW;
        c.fillStyle = grp.color; c.fillRect(x, y0 - 24, 54, 6);
        c.fillStyle = '#0F172A'; c.font = '700 27px "Microsoft YaHei"'; c.fillText(grp.title, x, y0 + 12);
        c.fillStyle = grp.color; c.font = '700 18px Consolas'; c.fillText(items.length + ' CLIENTS', x, y0 + 40);
        items.forEach(function (it, i) {
          var y = y0 + 76 + i * 122;
          c.fillStyle = 'rgba(47,91,232,.05)'; c.fillRect(x, y, colW - 26, 108);
          c.fillStyle = grp.color; c.fillRect(x, y, 5, 108);
          c.fillStyle = '#98A8BC'; c.font = '700 17px Consolas'; c.fillText(it.n, x + 18, y + 26);
          c.fillStyle = '#0F172A'; c.font = '700 30px "Microsoft YaHei"'; c.fillText(it.short, x + 18, y + 64);
          c.fillStyle = '#7C8CA2'; c.font = '17px "Microsoft YaHei"'; c.fillText(it.ind, x + 18, y + 94);
        });
      });
      c.fillStyle = 'rgba(140,160,185,.55)';
      c.font = '20px monospace';
      c.fillText('JIANHUI · CUSTOMER MATRIX', 56, h - 24);
    });
    var floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(W - 0.4, D - 0.4),
      new THREE.MeshBasicMaterial({ map: floorCvs.tex })
    );
    floorCvs.tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    floorCvs.tex.needsUpdate = true;
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0.08;
    g.add(floorMesh);
    var floorBase = box(W - 0.2, 0.06, D - 0.2, K.M('#E7EDF5'));
    floorBase.position.y = 0.02;
    g.add(floorBase);

    // 墙面 6 块行业分类板（按真实行业）
    function drawGroupBoard(grp) {
      var items = groupItems(grp.key);
      return K.canvasTexture(1024, 640, function (c, w, h) {
        var bg = c.createLinearGradient(0, 0, w, h);
        bg.addColorStop(0, '#FFFFFF');
        bg.addColorStop(1, '#F2F7FC');
        c.fillStyle = bg; c.fillRect(0, 0, w, h);
        c.fillStyle = grp.color; c.fillRect(0, 0, w, 8);
        c.fillStyle = '#8B9CB5'; c.font = '700 24px monospace'; c.fillText('INDUSTRY / 行业分类', 34, 48);
        c.fillStyle = '#0F172A'; c.font = '700 36px "Microsoft YaHei"'; c.fillText(grp.title, 34, 96);
        c.fillStyle = grp.color; c.font = '700 32px Consolas'; c.fillText(items.length + ' 家', 34, 140);
        items.forEach(function (it, i) {
          var col = i % 2;
          var row = Math.floor(i / 2);
          var x = 34 + col * 492;
          var y = 170 + row * 78;
          c.fillStyle = 'rgba(47,91,232,.05)'; c.fillRect(x, y, 460, 66);
          c.fillStyle = grp.color; c.fillRect(x, y, 5, 66);
          c.fillStyle = '#7C8CA2'; c.font = '700 18px monospace'; c.fillText(it.n, x + 14, y + 27);
          c.fillStyle = '#0F172A'; c.font = '700 23px "Microsoft YaHei"'; c.fillText(it.short, x + 56, y + 28);
          c.fillStyle = '#64748B'; c.font = '16px "Microsoft YaHei"'; c.fillText(it.ind, x + 56, y + 53);
        });
        c.fillStyle = 'rgba(140,160,185,.55)'; c.font = '18px monospace';
        c.fillText('JIANHUI · CUSTOMER MATRIX', 34, h - 24);
      });
    }
    function addBoard(grp, bi) {
      var cvs = drawGroupBoard(grp);
      var board = K.screenMesh(cvs, bi < 3 ? 3.1 : 2.55);
      if (bi < 3) {
        board.position.set(-3.3 + bi * 3.3, 1.62, -D / 2 + 0.16);
      } else {
        board.rotation.y = Math.PI / 2;
        board.position.set(-W / 2 + 0.16, 1.62, -2.55 + (bi - 3) * 2.55);
      }
      g.add(board);
    }
    GROUPS.forEach(addBoard);

    sceneRefs[5] = g;
  }

  /* ---------------- 场景锚点 ---------------- */
  zoneDefs = [
    { id: 1, no: 1, name: '传统工厂', x: -13.8, y: 5.2, z: 7.7 },
    { id: 2, no: 2, name: '智能工厂', x: -13.8, y: 5.1, z: -7.4 },
    { id: 3, no: 3, name: '四类角色', x: 5.0, y: 15.3, z: 7.6 },
    { id: 4, no: 5, name: '公司大楼', x: 14.0, y: 27.6, z: -11 },
    { id: 5, no: 4, name: '客户矩阵', x: 19.6, y: 4.25, z: 5.8 }
  ];

  var zoneLayer = document.getElementById('zoneLayer');
  var sceneButtons = Array.prototype.slice.call(document.querySelectorAll('.bar-item'));
  var selectedId = 1;
  var enterBtn = document.getElementById('enterBtn');
  var enterBtnLabel = document.getElementById('enterBtnLabel');

  zoneDefs.forEach(function (z) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'zone-tag';
    el.setAttribute('aria-label', '场景 0' + z.no + ' · ' + z.name);
    el.innerHTML = '<span class="n">0' + z.no + '</span><span class="t">' + z.name + '</span>';
    el.style.opacity = '0';
    el.addEventListener('click', function () {
      selectScene(z.id);
    });
    el.addEventListener('mouseenter', function () {
      highlightScene(z.id, false);
    });
    el.addEventListener('mouseleave', function () {
      highlightScene(null, false);
    });
    zoneLayer.appendChild(el);
    zoneTags.push({ id: z.id, el: el, x: z.x, y: z.y, z: z.z });
  });

  function refreshBarActive() {
    var cur = sceneState.active || selectedId;
    sceneButtons.forEach(function (btn) {
      btn.classList.toggle('active', Number(btn.dataset.scene) === cur);
    });
    var zone = zoneDefs.filter(function (z) { return z.id === cur; })[0];
    if (enterBtnLabel && zone) enterBtnLabel.textContent = '0' + zone.id + ' · ' + zone.name;
  }

  function highlightScene(id, pulse) {
    zoneTags.forEach(function (z) {
      z.el.classList.toggle('hot', id != null && z.id === id);
      if (pulse && id != null && z.id === id) {
        z.el.classList.remove('pulse');
        void z.el.offsetWidth;
        z.el.classList.add('pulse');
        setTimeout(function () { z.el.classList.remove('pulse'); }, 2400);
      }
    });
  }

  function selectScene(id) {
    var zone = zoneDefs.filter(function (z) { return z.id === id; })[0];
    if (!zone) return;
    selectedId = id;
    refreshBarActive();
    highlightScene(id, true);
    if (sceneTargets[id]) {
      enterScene(id);
    } else {
      showToast('场景 0' + id + ' · ' + zone.name + ' 将在下一阶段开放');
    }
  }

  sceneButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectScene(Number(btn.dataset.scene));
    });
    btn.addEventListener('mouseenter', function () {
      highlightScene(Number(btn.dataset.scene), false);
    });
    btn.addEventListener('mouseleave', function () {
      highlightScene(sceneState.active || selectedId, false);
    });
  });

  if (enterBtn) {
    enterBtn.addEventListener('click', function () {
      selectScene(selectedId);
    });
  }

  /* ---------------- 公司介绍弹窗 ---------------- */
  var aboutBtn = document.getElementById('aboutBtn');
  var aboutModal = document.getElementById('aboutModal');

  function openAbout() { if (aboutModal) aboutModal.hidden = false; }
  function closeAbout() { if (aboutModal) aboutModal.hidden = true; }

  if (aboutBtn) aboutBtn.addEventListener('click', openAbout);
  if (aboutModal) {
    var aboutClose = aboutModal.querySelector('.about-close');
    var aboutMask = aboutModal.querySelector('.about-mask');
    if (aboutClose) aboutClose.addEventListener('click', closeAbout);
    if (aboutMask) aboutMask.addEventListener('click', closeAbout);
  }

  /* ---------------- 场景切换机制 ---------------- */
  var scenePanel = document.getElementById('scenePanel');
  var exitSceneBtn = document.getElementById('exitScene');

  // 总览默认相机（由 fitCamera 初始设定）
  var OVERVIEW_TARGET = CAM_TARGET.clone();
  var OVERVIEW_DIR = CAM_DIR.clone();

  // 场景目标相机配置：整体后撤/抬高，保证一屏看全，同时给右侧详情卡留白
  // 坐标为世界坐标；shift = 右侧详情卡留白（内容左移像素）
  var sceneTargets = {
    1: { camPos: new THREE.Vector3(-3.4, 14.0, 24.8), camTarget: new THREE.Vector3(-13.6, 1.6, 7.1), shift: 100 },
    2: { camPos: new THREE.Vector3(-3.2, 14.5, 8.3), camTarget: new THREE.Vector3(-13.6, 1.6, -8.0), shift: 100 },
    3: { camPos: new THREE.Vector3(23.5, 17.0, 32.0), camTarget: new THREE.Vector3(5, 6.7, 7.6), shift: 112 },
    4: {
      // 10F 中间层：机位低于屋面、高于楼板，镜头始终在楼层中段
      camPos: new THREE.Vector3(23.75, 22.97, 3.04),
      camTarget: new THREE.Vector3(14.0, 19.7, -11.0),
      shift: 118,
      // 一镜到底：从总览降到 10F 幕墙外，贴近推拉门，再退到整层视角
      waypoints: [
        { pos: new THREE.Vector3(23.36, 28.74, 3.82), target: new THREE.Vector3(14, 19.6, -10.6) },
        { pos: new THREE.Vector3(20.24, 20.63, -3.2), target: new THREE.Vector3(14, 19.5, -10.8) }
      ]
    },
    5: { camPos: new THREE.Vector3(29.8, 13.6, 21.8), camTarget: new THREE.Vector3(19.6, 1.6, 5.8), shift: 112 }
  };

  // 总览为整片园区居中构图（对齐参考图），不再为左侧大标题让位
  function overviewShift() {
    return 0;
  }

  // 窄屏把机位沿视线拉远一点，避免 1024 / 移动端裁切
  function adjustedTarget(tgt) {
    var w = window.innerWidth;
    var f = w <= 900 ? 1.22 : (w <= 1180 ? 1.08 : 1);
    var pos = tgt.camPos.clone();
    var target = tgt.camTarget.clone();
    if (f !== 1) {
      pos.sub(target).multiplyScalar(f).add(target);
    }
    return { pos: pos, target: target };
  }

  var sceneState = {
    active: null,
    transitioning: false,
    t: 0,
    startedAt: 0,
    duration: 2.0,
    enterId: null,
    exitingId: null,
    fromCamPos: null,
    fromCamTarget: null,
    toCamPos: null,
    toCamTarget: null,
    ctrl: null,
    curve: null,
    targetKeys: null,
    path4: null,
    othersHidden: false
  };

  // 场景③ 楼层（0=1F … 3=4F）；roleFloorTargets / roleFloorIndex 由 buildRoles 赋值
  var roleFloorTargets;
  var roleFloorIndex;
  var floorState = {
    transitioning: false,
    t: 0,
    startedAt: 0,
    duration: 0.6,
    fromFloor: 0,
    toFloor: 0,
    fromPos: null,
    fromTarget: null,
    toPos: null,
    toTarget: null
  };

  function easeInOutCubic(u) {
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }

  function setRoofOpen(ref, open) {
    if (!ref || !ref.userData.roofs) return;
    var e = easeInOutCubic(Math.min(1, Math.max(0, open)));
    // 不做铰链翻开：整片屋顶垂直上升 + 材质淡出，升到看不见为止
    ref.userData.roofs.forEach(function (p) {
      var baseY = p.userData.baseY != null ? p.userData.baseY : p.position.y;
      p.position.y = baseY + e * 2.9;
      var mats = p.userData.roofMats || [];
      mats.forEach(function (m) {
        m.opacity = Math.max(0, 1 - e * 1.25);
        m.depthWrite = e < 0.5;
      });
      p.visible = e < 0.999;
      p.traverse(function (o) { if (o.isMesh) o.castShadow = e < 0.35; });
    });
  }

  // 进入场景只保留 2 堵墙：非保留墙（含墙面装饰）按 baseOp 淡出
  function setWallsOpen(ref, open) {
    if (!ref || !ref.userData.wallFadeMats) return;
    var e = Math.min(1, Math.max(0, open));
    ref.userData.wallFadeMats.forEach(function (m) {
      var base = m.userData.baseOp != null ? m.userData.baseOp : 1;
      m.opacity = base * (1 - e);
      m.depthWrite = (1 - e) > 0.55;
    });
  }

  function setSceneExtHidden(ref, hide) {
    if (ref && ref.userData.extGroup) ref.userData.extGroup.visible = !hide;
  }

  // 演示态只保留当前场景，避免相邻场景的建筑/展台入镜干扰构图。
  // id == null 表示回到总览：必须把此前被隐藏的场景组全部恢复，
  // 否则退出后整片建模会消失（BUG1 根因）。
  function showOnlyScene(id) {
    for (var k in sceneRefs) {
      if (!Object.prototype.hasOwnProperty.call(sceneRefs, k)) continue;
      var ref = sceneRefs[k];
      if (ref) ref.visible = (id == null) ? true : (Number(k) === id);
    }
  }

  // F06 玻璃推拉门（进入 / 退出时开合）
  function setDoorOpen(ref, open) {
    if (!ref || !ref.userData.doorPanels) return;
    var e = easeInOutCubic(Math.min(1, Math.max(0, open)));
    var panels = ref.userData.doorPanels;
    panels[0].position.x = panels[0].userData.baseX - e * 1.12;
    panels[1].position.x = panels[1].userData.baseX + e * 1.12;
  }

  // 场景③：默认展示整栋楼（各层同时可见，呈现分层完整空间）
  function setRoleFloorVisible(idx, alsoFrom) {
    var ref = sceneRefs[3];
    if (!ref) return;
    if (ref.userData.cabin) ref.userData.cabin.position.y = idx * 3.55;
  }

  function syncFloorTabs() {
    var tabs = document.querySelectorAll('.sp-floor');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('on', Number(tabs[i].dataset.floor) === roleFloorIndex);
    }
  }

  // 楼层切换：一镜到底上下移动，过渡中同时显示起止两层
  function gotoRoleFloor(idx) {
    if (sceneState.active !== 3 || sceneState.transitioning) return;
    if (floorState.transitioning) return;
    var ref = sceneRefs[3];
    var tgt = roleFloorTargets[idx];
    if (!ref || !tgt) return;
    var tv = adjustedTarget(tgt);
    var fromFloor = roleFloorIndex;

    floorState.transitioning = true;
    floorState.t = 0;
    floorState.startedAt = performance.now();
    floorState.fromFloor = fromFloor;
    floorState.toFloor = idx;
    floorState.fromPos = camera.position.clone();
    floorState.fromTarget = controls.target.clone();
    floorState.toPos = tv.pos;
    floorState.toTarget = tv.target;

    ref.userData.floors[fromFloor].visible = true;
    ref.userData.floors[idx].visible = true;
    roleFloorIndex = idx;
    syncFloorTabs();
    paused = true;
  }

  function updateFloorTransition(dt) {
    if (!floorState.transitioning) return;
    // 用真实时钟推进，保证低帧率下时长也不会被 dt 截断拉长
    floorState.t = Math.min(floorState.duration, (performance.now() - floorState.startedAt) / 1000);
    var u = Math.min(1, floorState.t / floorState.duration);
    var e = easeInOutCubic(u);
    var s = floorState;
    // 轻微横向摆动，避免纯垂直电梯感
    var cx = (s.fromPos.x + s.toPos.x) * 0.5 + 1.6;
    var cz = (s.fromPos.z + s.toPos.z) * 0.5 - 0.8;
    var inv = 1 - e;
    camera.position.set(
      inv * inv * s.fromPos.x + 2 * inv * e * cx + e * e * s.toPos.x,
      inv * inv * s.fromPos.y + 2 * inv * e * ((s.fromPos.y + s.toPos.y) * 0.5) + e * e * s.toPos.y,
      inv * inv * s.fromPos.z + 2 * inv * e * cz + e * e * s.toPos.z
    );
    controls.target.lerpVectors(s.fromTarget, s.toTarget, e);
    var ref = sceneRefs[3];
    if (ref && ref.userData.cabin) {
      ref.userData.cabin.position.y = s.fromFloor * 3.55 + (s.toFloor - s.fromFloor) * 3.55 * e;
    }
    if (u >= 1) {
      floorState.transitioning = false;
      if (ref && ref.userData.floors) {
        setRoleFloorVisible(roleFloorIndex);
      }
      if (autoState) autoState.textContent = '场景 03 · ' + (roleFloorIndex + 1) + 'F';
    }
  }

  function setWarmLightsProgress(ref, k) {
    if (!ref || !ref.userData.warmLights) return;
    ref.userData.warmLights.forEach(function (l) {
      l.userData.openK = k;
      l.intensity = l.userData.baseI * k * (1 - 0.45 * nightMix);
    });
  }

  function setWarmLights(ref, on) {
    setWarmLightsProgress(ref, on ? 1 : 0);
  }

  // 昼夜插值应用（0 = 白天，1 = 夜色），由 nightMix 每帧平滑驱动
  var _dayHemi = new THREE.Color(0xFFFFFF);
  var _nightHemi = new THREE.Color(0x8CA2C4);
  var _daySun = new THREE.Color(0xFFF7EA);
  var _nightSun = new THREE.Color(0x7C93B8);
  var _dayFog = new THREE.Color(0xEDF2F8);
  var _nightFog = new THREE.Color(0x16213A);

  function applyNight(m) {
    hemi.intensity = 0.9 - 0.66 * m;
    hemi.color.copy(_dayHemi).lerp(_nightHemi, m);
    sun.intensity = 2.0 - 1.82 * m;
    sun.color.copy(_daySun).lerp(_nightSun, m);
    fill.intensity = 0.52 - 0.48 * m;
    bounce.intensity = 0.1 - 0.085 * m;
    scene.fog.color.copy(_dayFog).lerp(_nightFog, m);
    renderer.setClearColor(0x0B1424, m);
    renderer.toneMappingExposure = 1.04 - 0.30 * m;
    moonLight.intensity = 0.55 * m;
    var ref1 = sceneRefs[1];
    if (ref1 && ref1.userData.warmLights) {
      ref1.userData.warmLights.forEach(function (l) {
        l.intensity = l.userData.baseI * (l.userData.openK || 0) * (1 - 0.15 * m);
      });
    }
    var sky = ref1 && ref1.userData.sky;
    if (sky && sky.userData.mats) {
      sky.userData.mats[0].opacity = m;
      sky.userData.mats[1].opacity = m;
    }
    if (moonEl) moonEl.style.opacity = (m * 0.9).toFixed(3);
  }

  function resetSceneImmediate(id) {
    var ref = sceneRefs[id];
    if (!ref) return;
    // 兜底：任何过渡结束后场景组必须可见
    ref.visible = true;
    setRoofOpen(ref, 0);
    setWallsOpen(ref, 0);
    setSceneExtHidden(ref, false);
    setWarmLights(ref, false);
    if (id === 1) nightTarget = 0;
    if (id === 3) {
      // 复位到默认 4F，避免返回总览后电梯轿厢停在用户最后选择的楼层
      roleFloorIndex = 3;
      setRoleFloorVisible(3);
    }
    if (id === 4) {
      setDoorOpen(ref, 0);
      if (ref.userData.skyline) ref.userData.skyline.visible = false;
    }
  }

  /* ---------------- 场景面板内容 ---------------- */
  // 数字与表述全部取自计划书 / PPT / 参考截图 / DOCX / XLSX，不做改写
  var sceneContent = {
    1: {
      n: 'SCENE 01',
      title: '工厂现状',
      sub: '传统人工质检 · 一张图纸 2 小时',
      hero: { em: '2 小时', b: '100-200', unit: '个尺寸 / 张图纸' },
      rows: [
        ['打印纸质图纸 · 手工标气泡 · 逐个录入电脑', '效率低'],
        ['4 名质检员全负荷 · 加班成常态', '易疲劳'],
        ['手工转录错漏 · 追溯困难', '易出错'],
        ['图纸堆在文件柜 · 找一张要翻半天', '难管理']
      ],
      tip: ''
    },
    2: {
      n: 'SCENE 02',
      title: '智能工厂 · AI 质检',
      sub: '简会 AI 图纸识别 · 单张约 10 分钟',
      hero: { em: '2 小时', b: '10 分钟', unit: 'AI 识别 / 张图纸' },
      rows: [
        ['自动提取尺寸与公差 · 无需逐个标气泡', '效率 ×10'],
        ['95%+ 识别准确率 · 结果可复核', '更准确'],
        ['4 名质检员转为复核 · 告别加班', '更轻松'],
        ['50+ 大型企业已落地 · 方案成熟', '已验证']
      ],
      tip: '点击质检员 1 屏幕看演示视频 · 质检员 2 屏幕打开在线系统'
    }
  };

  // 角色卡文案严格取自《四类角色价值传播矩阵.docx》，保留“约”“可”等限定语
  var ROLES = {
    boss: {
      role: '企业老板', name: '王总', age: '50 岁',
      ask: '核心追问：投入与产出，是否匹配？',
      secs: [
        ['痛点', [
          '品质不稳定：客户退货、投诉频发，客户资源持续流失。',
          '不良率、废品率偏高，隐性成本持续吞噬利润。',
          '品质投入高：专职人员多、报告产出慢，效率与成本两头受压。',
          '人员能力跟不上、流动性大，投入之后仍达不到品质要求。'
        ]],
        ['担心点', [
          '钱花下去了，回报算不出来。',
          '交期不可控，大单不敢接。',
          '图纸外流，工艺被抄走。'
        ]],
        ['价值', [
          '降低综合成本：人力、废品、返工三项同时下降。',
          '提升品质，交付周期变短。',
          '提升知名度：客户可以数字化验证，信任度随之上升。',
          '图纸数据留在厂内，核心工艺参数不外流。',
          '检测数据整理由 2 小时人工压缩至 10 分钟。'
        ]],
        ['提升点', [
          '从「靠人盯」到「靠数据管」，管理半径不再受人数限制。',
          '交期与成本可测算，报价与产能敢承诺。',
          '品质从成本中心，变成拿单的销售话术。'
        ], true]
      ]
    },
    qa: {
      role: '品质部管理者', name: '陈工', age: '42 岁',
      ask: '核心追问：数据能否追溯？人员能否快上手？',
      secs: [
        ['痛点', [
          '上层压力大，出问题第一个被追责。',
          '报告出错，版本信息无从追溯。',
          '新人上手慢，培训周期长。'
        ]],
        ['担心点', [
          '数据不可信，报告被打回，责任还是自己担。',
          '人一走经验就走，知识沉不下来。',
          '系统上线变成给自己加活，而不是减负。'
        ]],
        ['价值', [
          '人员可以减少，团队管理成本下降。',
          '产品质量提升，报告差错率下降。',
          '工作时间下降，精力回到工艺与改善。',
          '出错率下降约 90%。'
        ]],
        ['提升点', [
          '批次与工序全流程留痕，处理记录逐版可查。',
          '新人一天上手，接手成本极低。',
          '从「出报告的人」升级为「定标准的人」。'
        ], true]
      ]
    },
    qcinsp: {
      role: '质检员个人', name: '小周', age: '28 岁',
      ask: '核心追问：工作强度能不能降低？',
      secs: [
        ['痛点', [
          '经常加班，每天约两小时耗在手工核数上。',
          '担心出错挨骂，心理压力大。',
          '没有成长空间，工资低，看不到上升通道。'
        ]],
        ['担心点', [
          '系统难用，反而更慢。',
          '被 AI 取代，岗位不保。',
          '出了问题算谁的，责任边界不清。'
        ]],
        ['价值', [
          '省事：气泡一键自动标注。',
          '不犯错：人工仅需复核签字。',
          '结余时间转向工艺学习与技能成长。',
          '10 分钟完成原本两小时的核数工作。'
        ]],
        ['提升点', [
          '从「抄数的人」变成「判断的人」。',
          '有成长路径，才留得住人。',
          '收入从堆时间，转向拼技能。'
        ], true]
      ]
    },
    it: {
      role: '企业 IT 部门', name: '李工', age: '35 岁',
      ask: '核心追问：系统能否落地？成效归于何处？',
      secs: [
        ['痛点', [
          '维护风险、系统风险，层层压在 IT 身上。',
          '先后上线三套系统，其中两套闲置。',
          '人手少，接不动新系统。'
        ]],
        ['担心点', [
          '这家公司靠不靠谱？东西好不好用？',
          '图纸与数据外流，安全责任谁负？',
          '出了问题，是不是又要 IT 背锅？'
        ]],
        ['价值', [
          '本地部署：图纸不出厂。',
          '开放接口：对接 MES / ERP。',
          '由 IT 主导落地，功劳有归属。',
          '2 周从部署到正式上线。'
        ]],
        ['提升点', [
          '全厂统一口径，告别多套系统各算各的。',
          '从「救火的」变成「定架构的」。',
          '有主导权，才有话语权。'
        ], true]
      ]
    }
  };

  var clientFilterCat = '全部';

  function clientItemsHTML() {
    var list = clientFilterCat === '全部' ? CUSTOMERS : CUSTOMERS.filter(function (c) { return c.cat === clientFilterCat; });
    return list.map(function (c) {
      var idx = CUSTOMERS.indexOf(c);
      return '<div class="sp-c-item" data-client="' + idx + '">' +
        '<div class="sp-c-top"><span>' + c.n + '</span><b>' + c.short + '</b></div>' +
        '<div class="sp-c-meta">' + c.ind + ' · ' + c.city + '</div>' +
        '<div class="sp-c-detail" hidden>' + c.name + '<br>' + c.note + '</div>' +
        '</div>';
    }).join('');
  }

  function fillScenePanel(id) {
    if (!scenePanel) return;
    // 参观顺序：客户矩阵（04）在前，公司大楼（05）收尾，编号与底部场景条一致
    scenePanel.setAttribute('data-num', '0' + (id === 4 ? 5 : id === 5 ? 4 : id));
    var spN = document.getElementById('spN');
    var spTitle = document.getElementById('spTitle');
    var spSub = document.getElementById('spSub');
    var spCard = document.getElementById('spCard');
    var c = sceneContent[id];

    if (c) {
      spN.textContent = c.n;
      spTitle.textContent = c.title;
      spSub.textContent = c.sub;
      var cls = id === 1 ? 'bad' : 'good';
      var html = '<div class="sp-hero"><em>' + c.hero.em + '</em><span>→</span><b>' +
        c.hero.b + '</b><span>' + c.hero.unit + '</span></div>';
      html += '<div class="sp-list">' + c.rows.map(function (r) {
        return '<div class="sp-row"><p>' + r[0] + '</p><i class="' + cls + '">' + r[1] + '</i></div>';
      }).join('') + '</div>';
      if (c.tip) html += '<div class="sp-tip">' + c.tip + '</div>';
      spCard.innerHTML = html;
      return;
    }

    if (id === 3) {
      spN.textContent = 'SCENE 03';
      spTitle.textContent = '四类角色 · 一栋楼里的四个答案';
      spSub.textContent = '文案取自《四类角色价值传播矩阵》· 4F 老板 / 3F IT / 2F 品质管理 / 1F 质检员';
      var floors = [
        [3, '4F', '老板'],
        [2, '3F', 'IT'],
        [1, '2F', '品质管理'],
        [0, '1F', '质检员']
      ];
      var roles = [
        ['boss', '企业老板', '王总 · 50 岁', '投入与产出，是否匹配？'],
        ['qa', '品质部管理者', '陈工 · 42 岁', '数据能否追溯？人员能否快上手？'],
        ['qcinsp', '质检员个人', '小周 · 28 岁', '工作强度能不能降低？'],
        ['it', '企业 IT 部门', '李工 · 35 岁', '系统能否落地？成效归于何处？']
      ];
      spCard.innerHTML =
        '<div class="sp-floors">' + floors.map(function (f) {
          return '<button type="button" class="sp-floor' + (f[0] === roleFloorIndex ? ' on' : '') + '" data-floor="' + f[0] + '"><i>' + f[1] + '</i>' + f[2] + '</button>';
        }).join('') + '</div>' +
        '<div class="sp-list">' + roles.map(function (r) {
          return '<div class="sp-row sp-role-row" data-role="' + r[0] + '"><p>' + r[1] + ' · ' + r[2] + '</p><i class="good">' + r[3] + '</i></div>';
        }).join('') + '</div>' +
        '<div class="sp-tip">点击楼层可上下切换；点击人物或角色条目查看完整「痛点 / 担心点 / 价值 / 提升点」。</div>';
      return;
    }

    if (id === 4) {
      spN.textContent = 'SCENE 05';
      spTitle.textContent = '公司大楼 · 厦门简会信息科技';
      spSub.textContent = '福建省（厦门）人工智能产业园 F06 栋 · 国家高新技术企业';
      spCard.innerHTML =
        '<div class="sp-hero"><b>2014</b><span>成立</span><span>国家高新技术企业</span><span>专注 AI 图纸识别</span></div>' +
        '<div class="sp-list">' +
        '<div class="sp-row"><p>公司简介：厦门简会信息科技有限公司成立于 2014 年，深度聚焦工业 AI 与图纸智能解析，解决传统制造业图纸处理工作量大、人工录入易错等痛点。</p><i class="good">公司简介</i></div>' +
        '<div class="sp-row"><p>自主研发简会 AI 图纸识别引擎，实现对复杂工程图、零件图及各类技术文档的自动提取、校验与建模。</p><i class="good">核心技术</i></div>' +
        '<div class="sp-row"><p>发展使命：通过前沿的技术和持续创新，提供综合解决方案。</p><i class="good">发展使命</i></div>' +
        '<div class="sp-row"><p>持续创新：以智慧平台为支撑，通过数智化赋能，助力传统制造业打破数据孤岛，实现从「纸质文档」到「智能数据」的生产力飞跃。</p><i class="good">持续创新</i></div>' +
        '</div>' +
        '<div class="sp-tags"><span>诚信</span><span>专注</span><span>创新</span><span>卓越</span></div>' +
        '<div class="sp-tip">点击「返回全景」回到园区总览，再选择其它场景。</div>';
      return;
    }

    if (id === 5) {
      spN.textContent = 'SCENE 04';
      spTitle.textContent = '已合作客户 · 真实客户矩阵';
      spSub.textContent = '＞50 家合作客户，展示部分案例';
      var filters = ['全部', '电梯', '汽车零部件', '精密制造', '电子·光学', '半导体·陶瓷', '工业装备·软件'];
      spCard.innerHTML =
        '<div class="sp-client-tools">' + filters.map(function (f) {
          return '<button type="button" class="sp-filter' + (f === clientFilterCat ? ' on' : '') + '" data-filter="' + f + '">' + f + '</button>';
        }).join('') + '</div>' +
        '<div class="sp-clients" id="spClients">' + clientItemsHTML() + '</div>' +
        '<div class="sp-tip">点击客户条目展开行业地位；本场景只列真实客户名称，不使用未提供的 Logo。</div>';
      return;
    }
  }

  /* ---------------- 角色卡 ---------------- */
  var roleCard = document.getElementById('roleCard');
  var rcRole = document.getElementById('rcRole');
  var rcName = document.getElementById('rcName');
  var rcAge = document.getElementById('rcAge');
  var rcAsk = document.getElementById('rcAsk');
  var rcBody = document.getElementById('rcBody');

  function openRoleCard(roleId) {
    var r = ROLES[roleId];
    if (!r || !roleCard) return;
    rcRole.textContent = r.role;
    rcName.textContent = r.name;
    rcAge.textContent = r.age;
    rcAsk.textContent = r.ask;
    rcBody.innerHTML = r.secs.map(function (sec) {
      return '<div class="rc-sec' + (sec[2] ? ' hl' : '') + '"><h4>' + sec[0] + '</h4><ul>' +
        sec[1].map(function (li) { return '<li>' + li + '</li>'; }).join('') + '</ul></div>';
    }).join('');
    roleCard.hidden = false;
    requestAnimationFrame(function () { roleCard.classList.add('show'); });
  }

  function closeRoleCard() {
    if (!roleCard || roleCard.hidden) return;
    roleCard.classList.remove('show');
    setTimeout(function () { roleCard.hidden = true; }, 320);
  }

  if (roleCard) {
    var rcClose = roleCard.querySelector('.rc-close');
    if (rcClose) rcClose.addEventListener('click', closeRoleCard);
  }

  // 面板内事件代理：角色卡 / 客户展开 / 客户筛选 / 结尾按钮
  var spCardEl = document.getElementById('spCard');
  if (spCardEl) {
    spCardEl.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== spCardEl) {
        if (el.getAttribute) {
          var roleId = el.getAttribute('data-role');
          if (roleId) {
            var roleFloorMap = { boss: 3, it: 2, qa: 1, qcinsp: 0 };
            var targetFloor = roleFloorMap[roleId];
            if (targetFloor != null) gotoRoleFloor(targetFloor);
            openRoleCard(roleId);
            return;
          }
          var floorIdx = el.getAttribute('data-floor');
          if (floorIdx != null) {
            gotoRoleFloor(Number(floorIdx));
            return;
          }
          var act = el.getAttribute('data-act');
          if (act === 'exit') { exitScene(); return; }
          if (act === 'about') { openAbout(); return; }
          var filter = el.getAttribute('data-filter');
          if (filter) {
            clientFilterCat = filter;
            var tools = spCardEl.querySelectorAll('.sp-filter');
            for (var i = 0; i < tools.length; i++) {
              tools[i].classList.toggle('on', tools[i].getAttribute('data-filter') === filter);
            }
            var list = document.getElementById('spClients');
            if (list) list.innerHTML = clientItemsHTML();
            return;
          }
          var clientIdx = el.getAttribute('data-client');
          if (clientIdx != null) {
            var detail = el.querySelector('.sp-c-detail');
            if (detail) {
              var open = !detail.hidden;
              detail.hidden = open;
              el.classList.toggle('open', !open);
            }
            return;
          }
        }
        el = el.parentNode;
      }
    });
  }

  function enterScene(id) {
    var tgt = sceneTargets[id];
    if (!tgt) return;
    if (sceneState.active === id || sceneState.transitioning) return;

    var tv = adjustedTarget(tgt);
    var fromExitScene = sceneState.active;
    var fromPos = camera.position.clone();
    var fromTarget = controls.target.clone();

    // 一镜到底：默认二次贝塞尔弧线；场景④使用「高空平滑下降 → 幕墙外 → 穿推拉门 → 内部抬升」
    sceneState.curve = null;
    sceneState.targetKeys = null;
    sceneState.path4 = null;
    var duration = 1.0;
    if (id === 4) {
      sceneState.path4 = {
        fromPos: fromPos.clone(),
        fromTarget: fromTarget.clone(),
        outPos: new THREE.Vector3(16.6, 1.72, 8.6),
        outTarget: new THREE.Vector3(15.2, 1.55, -4.2),
        doorPos: new THREE.Vector3(16.6, 1.72, -3.4),
        doorTarget: new THREE.Vector3(15.2, 1.5, -6.2),
        endPos: tv.pos.clone(),
        endTarget: tv.target.clone(),
        ctrl1: new THREE.Vector3(58, 16, 50),
        ctrl2: new THREE.Vector3(30, 1.9, 24)
      };
      duration = 1.0;
    } else if (tgt.waypoints && tgt.waypoints.length) {
      var pts = [fromPos.clone()];
      var keys = [fromTarget.clone()];
      tgt.waypoints.forEach(function (w) {
        pts.push(w.pos.clone());
        keys.push(w.target.clone());
      });
      pts.push(tv.pos.clone());
      keys.push(tv.target.clone());
      // centripetal 参数化：避免从高空俯冲到门口时曲线下穿楼板
      sceneState.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      sceneState.targetKeys = keys;
      duration = 1.1;
    } else {
      var dist = fromPos.distanceTo(tv.pos);
      var lift = Math.min(10, 4.5 + dist * 0.05);
      sceneState.ctrl = fromPos.clone().add(tv.pos).multiplyScalar(0.5);
      sceneState.ctrl.y += lift;
    }

    sceneState.active = id;
    sceneState.enterId = id;
    // 场景间切换：把上一场景也纳入「反向关闭」，避免它的墙/外景留在打开状态
    sceneState.exitingId = fromExitScene != null ? fromExitScene : null;
    sceneState.transitioning = true;
    sceneState.t = 0;
    sceneState.startedAt = performance.now();
    sceneState.duration = duration;
    sceneState.fromCamPos = fromPos;
    sceneState.fromCamTarget = fromTarget;
    sceneState.toCamPos = tv.pos;
    sceneState.toCamTarget = tv.target;
    sceneState.othersHidden = false;
    floorState.transitioning = false;

    introActive = false;
    introScale = 1;
    paused = true;
    autoRotateAllowed = false;
    if (autoState) autoState.textContent = '一镜到底 · 进入场景';
    if (typeof autoStateClear === 'function') autoStateClear();

    appEl.classList.add('demo');
    viewShiftTarget = tgt.shift;
    if (scenePanel) scenePanel.hidden = true;
    if (roleCard) closeRoleCard();
    zoneTags.forEach(function (z) { z.el.style.opacity = '0'; z.el.style.pointerEvents = 'none'; });

    var ref = sceneRefs[id];
    if (ref) {
      setWallsOpen(ref, 0);
      setRoofOpen(ref, 0);
      // 场景④保留外立面到镜头抵近前再隐藏，避免从总览进入时大楼整栋瞬消
      setSceneExtHidden(ref, id === 4 ? false : true);
      setWarmLightsProgress(ref, 0);
    }
    if (id === 1) nightTarget = 1;
    else nightTarget = 0;
    if (id === 3) {
      roleFloorIndex = 3;
      setRoleFloorVisible(3);
    }
    if (id === 4 && ref) {
      setDoorOpen(ref, 0);
    }

    fillScenePanel(id);
    refreshBarActive();
  }

  function exitScene() {
    if (!sceneState.active || sceneState.transitioning) return;

    var fromPos = camera.position.clone();
    var fromTarget = controls.target.clone();
    fitCamera();
    var off = OVERVIEW_DIR.clone().setLength(fitDist * introScale);
    var toTgt = OVERVIEW_TARGET.clone();
    var toPos = OVERVIEW_TARGET.clone().add(off);
    var dist = fromPos.distanceTo(toPos);
    var lift = Math.min(10, 4.5 + dist * 0.05);

    // 退出时先把 OrbitControls 的距离限制放开，避免过渡结束后被场景尺度的
    // min/maxDistance 夹住，导致回到总览时镜头仍停在近景尺度
    controls.minDistance = 1;
    controls.maxDistance = 400;

    sceneState.exitingId = sceneState.active;
    sceneState.enterId = null;
    sceneState.transitioning = true;
    sceneState.t = 0;
    sceneState.startedAt = performance.now();
    sceneState.duration = 0.8;
    sceneState.fromCamPos = fromPos;
    sceneState.fromCamTarget = fromTarget;
    sceneState.toCamPos = toPos;
    sceneState.toCamTarget = toTgt;
    sceneState.ctrl = fromPos.clone().add(toPos).multiplyScalar(0.5);
    sceneState.ctrl.y += lift;
    sceneState.curve = null;
    sceneState.targetKeys = null;
    sceneState.path4 = null;
    sceneState.othersHidden = false;
    showOnlyScene(null);
    floorState.transitioning = false;

    nightTarget = 0;
    if (roleCard) closeRoleCard();
    if (scenePanel) scenePanel.hidden = true;
    viewShiftTarget = overviewShift();
    if (autoState) autoState.textContent = '连续拉回 · 返回全景';
  }

  if (exitSceneBtn) {
    exitSceneBtn.addEventListener('click', exitScene);
  }

  // 渲染循环中更新过渡：位置走贝塞尔，墙体 / 屋顶 / 暖光随进度联动
  function updateSceneTransition(dt) {
    if (!sceneState.transitioning) return;
    // 用真实时钟推进（dt 在本循环中按 0.05s 截断，低帧率会把过渡拉长）
    sceneState.t = Math.min(sceneState.duration, (performance.now() - sceneState.startedAt) / 1000);
    var u = Math.min(1, sceneState.t / sceneState.duration);
    var e = easeInOutCubic(u);

    var fp = sceneState.fromCamPos;
    var tp = sceneState.toCamPos;
    var cp = sceneState.ctrl;
    if (sceneState.path4) {
      // 场景④专用路径：55% 低空接近幕墙外 → 17% 穿推拉门 → 28% 室内抬升并回到机位
      var p4 = sceneState.path4;
      var pos = new THREE.Vector3();
      var tgtV = new THREE.Vector3();
      if (e < 0.55) {
        var k1 = e / 0.55;
        var inv = 1 - k1;
        var w0 = inv * inv * inv;
        var w1 = 3 * inv * inv * k1;
        var w2 = 3 * inv * k1 * k1;
        var w3 = k1 * k1 * k1;
        pos.copy(p4.fromPos).multiplyScalar(w0)
          .add(p4.ctrl1.clone().multiplyScalar(w1))
          .add(p4.ctrl2.clone().multiplyScalar(w2))
          .add(p4.outPos.clone().multiplyScalar(w3));
        // 视线提前锁定公司楼层，避免高空段镜头对着空地
        tgtV.lerpVectors(p4.fromTarget, p4.outTarget, easeInOutCubic(Math.min(1, k1 * 1.8)));
      } else if (e < 0.72) {
        var k2 = easeInOutCubic((e - 0.55) / 0.17);
        pos.lerpVectors(p4.outPos, p4.doorPos, k2);
        tgtV.lerpVectors(p4.outTarget, p4.doorTarget, k2);
      } else if (e < 0.79) {
        // 保持低机位从东侧开口退出，不横穿玻璃
        var k3 = easeInOutCubic((e - 0.72) / 0.07);
        pos.set(p4.doorPos.x + (p4.endPos.x - p4.doorPos.x) * k3, 1.85, p4.doorPos.z);
        tgtV.lerpVectors(p4.doorTarget, new THREE.Vector3(15.2, 1.3, -7.2), k3);
      } else if (e < 0.91) {
        // 室外抬升到机位高度
        var k4 = easeInOutCubic((e - 0.79) / 0.12);
        pos.set(p4.endPos.x, 1.85 + (p4.endPos.y - 1.85) * k4, p4.doorPos.z);
        tgtV.set(15.2, 1.3, -7.2);
      } else {
        var k5 = easeInOutCubic((e - 0.91) / 0.09);
        pos.set(p4.endPos.x, p4.endPos.y, p4.doorPos.z + (p4.endPos.z - p4.doorPos.z) * k5);
        tgtV.lerpVectors(new THREE.Vector3(15.2, 1.3, -7.2), p4.endTarget, k5);
      }
      camera.position.copy(pos);
      controls.target.copy(tgtV);
    } else if (sceneState.curve) {
      camera.position.copy(sceneState.curve.getPoint(e));
      var keys = sceneState.targetKeys;
      var n = keys.length - 1;
      var f = Math.min(n - 1e-6, e * n);
      var ki = Math.floor(f);
      controls.target.copy(keys[ki]).lerp(keys[ki + 1], f - ki);
    } else {
      var inv = 1 - e;
      camera.position.set(
        inv * inv * fp.x + 2 * inv * e * cp.x + e * e * tp.x,
        inv * inv * fp.y + 2 * inv * e * cp.y + e * e * tp.y,
        inv * inv * fp.z + 2 * inv * e * cp.z + e * e * tp.z
      );
      controls.target.lerpVectors(sceneState.fromCamTarget, sceneState.toCamTarget, e);
    }

    var enterRef = sceneState.enterId != null ? sceneRefs[sceneState.enterId] : null;
    var exitRef = sceneState.exitingId != null ? sceneRefs[sceneState.exitingId] : null;

    // 镜头推进到 18% 后，隐藏其它场景（避免途经相邻场景的体块/客户矩阵入镜）
    if (sceneState.enterId != null && !sceneState.othersHidden && u > 0.18) {
      sceneState.othersHidden = true;
      showOnlyScene(sceneState.enterId);
    }

    if (enterRef) {
      var openIn = Math.min(1, Math.max(0, (u - 0.04) / 0.96));
      setWallsOpen(enterRef, openIn);
      setRoofOpen(enterRef, openIn);
      setWarmLightsProgress(enterRef, openIn);
      setSceneExtHidden(enterRef, openIn > 0.42);
      if (sceneState.enterId === 4) {
        setDoorOpen(enterRef, Math.min(1, Math.max(0, (u - 0.34) / 0.16)));
      }
    }
    if (exitRef) {
      var closeStart = sceneState.enterId != null ? 0.04 : 0.5;
      var closeU = Math.min(1, Math.max(0, (u - closeStart) / (1 - closeStart)));
      setWallsOpen(exitRef, 1 - closeU);
      setRoofOpen(exitRef, 1 - closeU);
      setWarmLightsProgress(exitRef, 1 - closeU);
      setSceneExtHidden(exitRef, 1 - closeU > 0.42);
      if (sceneState.exitingId === 4) setDoorOpen(exitRef, 1 - closeU);
    }

    if (u >= 1) {
      sceneState.transitioning = false;

      if (sceneState.enterId != null) {
        var d = camera.position.distanceTo(controls.target);
        controls.minDistance = Math.max(3, d * 0.35);
        controls.maxDistance = d * 1.6;
        // 场景间切换：把离开的场景复位（墙关闭 / 外景恢复 / 暖光关闭）
        if (sceneState.exitingId != null) resetSceneImmediate(sceneState.exitingId);
        if (scenePanel) scenePanel.hidden = false;
        if (autoState) autoState.textContent = '场景 0' + sceneState.enterId + ' · 手动浏览';
        refreshBarActive();
      } else if (sceneState.exitingId != null) {
        var exited = sceneState.exitingId;
        resetSceneImmediate(exited);
        sceneState.active = null;
        // 恢复总览相机距离范围（退出过程中临时放开，这里重新按总览尺度收紧）
        fitCamera();
        // 总览不再需要左侧留白：返回结束时立刻归零，避免低帧率下残留视口偏移
        viewShiftCur = 0;
        viewShiftTarget = 0;
        applyViewOffset();
        paused = true;
        if (autoState) autoState.textContent = '手动浏览';
        appEl.classList.remove('demo');
        viewShiftTarget = overviewShift();
        zoneTags.forEach(function (z) { z.el.style.pointerEvents = 'auto'; });
        if (scenePanel) scenePanel.hidden = true;
        refreshBarActive();
      }
      sceneState.enterId = null;
      sceneState.exitingId = null;
    }
  }

  /* ---------------- 画面横向偏移（setViewOffset） ---------------- */
  // 总览：内容右移（负值），给左侧文案让位；场景：内容左移（正值），给右侧详情卡片让位。
  var coverShiftPx = -Math.round(stage.clientWidth * 0.17);
  var viewShiftCur = coverActive ? coverShiftPx : overviewShift();
  var viewShiftTarget = viewShiftCur;
  var viewFullW = 0;
  var viewOffX = 0;

  function applyViewOffset() {
    var w = stage.clientWidth;
    var h = stage.clientHeight;
    if (!w || !h) return;
    var d = viewShiftCur;
    if (Math.abs(d) < 0.5) {
      viewFullW = w;
      viewOffX = 0;
    } else if (d > 0) {
      // 内容左移 d：视锥扩宽 2d，向右取 2d 宽的子矩形
      viewFullW = w + d * 2;
      viewOffX = d * 2;
    } else {
      // 内容右移 |d|：视锥扩宽 2|d|，取左侧子矩形
      viewFullW = w - d * 2;
      viewOffX = 0;
    }
    camera.aspect = viewFullW / h;
    camera.setViewOffset(viewFullW, h, viewOffX, 0, w, h);
    camera.updateProjectionMatrix();
  }

  function updateViewShift(dt) {
    if (Math.abs(viewShiftTarget - viewShiftCur) < 0.35) {
      if (viewShiftCur === viewShiftTarget) return;
      viewShiftCur = viewShiftTarget;
    } else {
      viewShiftCur += (viewShiftTarget - viewShiftCur) * Math.min(1, dt * 3.6);
    }
    applyViewOffset();
  }

  /* ---------------- 相机适配 ---------------- */
  function fitCamera() {
    var w = stage.clientWidth;
    var h = stage.clientHeight;
    if (!w || !h) return;
    var mobile = window.innerWidth <= 900;
    var fitW = mobile ? 46 : 64;
    var fitH = mobile ? 44 : 56;
    var aspect = w / h;
    var tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    fitDist = Math.max((fitH / 2) / tan, (fitW / 2) / (tan * aspect));

    // 场景内不重置相机，避免窗口尺寸变化打断取景
    if (sceneState.active != null || sceneState.transitioning) return;

    controls.minDistance = fitDist * 0.5;
    controls.maxDistance = fitDist * 1.7;

    var offset = camera.position.clone().sub(controls.target);
    if (offset.length() < 1) offset.copy(CAM_DIR);
    offset.setLength(fitDist * introScale);
    camera.position.copy(controls.target).add(offset);
  }

  function onResize() {
    var w = stage.clientWidth;
    var h = stage.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(w, h, false);
    applyViewOffset();
    fitCamera();
    coverShiftPx = -Math.round(w * 0.17);
    if (coverActive) {
      viewShiftTarget = coverShiftPx;
    } else if (sceneState.active == null && !sceneState.transitioning) {
      viewShiftTarget = overviewShift();
    }
    measureNavTextBox();
  }

  window.addEventListener('resize', onResize);
  if (window.ResizeObserver) {
    new ResizeObserver(onResize).observe(stage);
  }

  fitCamera();
  onResize();

  /* ---------------- 每帧投影 ---------------- */
  var _v = new THREE.Vector3();
  var _p = new THREE.Vector3();

  // 顶部导航（品牌 + 按钮）的实际范围，用于让总览场景标签避让
  var navTextBox = null;
  function measureNavTextBox() {
    navTextBox = null;
    if (window.innerWidth <= 900) return;
    var nav = document.getElementById('nav');
    if (!nav) return;
    var b = nav.getBoundingClientRect();
    if (!b.width || !b.height) return;
    navTextBox = { left: b.left - 10, top: b.top - 10, right: b.right + 10, bottom: b.bottom + 10 };
  }

  function projectToStage(v) {
    // setViewOffset 已经把「子视口偏移」计入投影矩阵，
    // 因此 NDC 直接线性映射到 canvas 像素即可，不要再叠加 fullW / offX。
    _p.copy(v).project(camera);
    return {
      x: (_p.x * 0.5 + 0.5) * stage.clientWidth,
      y: (-_p.y * 0.5 + 0.5) * stage.clientHeight,
      visible: _p.z < 1
    };
  }

  function updateZoneTags() {
    var w = stage.clientWidth;
    var h = stage.clientHeight;
    var margin = window.innerWidth <= 900 ? 58 : 30;
    var inScene = sceneState.active != null;
    zoneTags.forEach(function (z) {
      if (inScene) {
        z.el.style.opacity = '0';
        z.el.style.pointerEvents = 'none';
        return;
      }
      _v.set(z.x, z.y + PLATFORM_H, z.z);
      var pos = projectToStage(_v);
      var dist = _v.distanceTo(camera.position);
      var tb = navTextBox;
      if (!pos.visible || pos.x < -60 || pos.x > w + 60 || pos.y < -20 || pos.y > h + 40 ||
          (tb && pos.x > tb.left && pos.x < tb.right && pos.y > tb.top && pos.y < tb.bottom)) {
        z.el.style.opacity = '0';
        z.el.style.pointerEvents = 'none';
        return;
      }
      var x = Math.max(margin, Math.min(w - margin, pos.x));
      z.el.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(pos.y) + 'px,0) translate(-50%,-100%)';
      z.el.style.opacity = '1';
      z.el.style.pointerEvents = 'auto';
      z.el.style.zIndex = String(Math.round(1200 - dist * 10));
    });
  }

  /* ---------------- 渲染循环 ---------------- */
  var last = performance.now();
  var clockTime = 0;
  var frameNo = 0;
  var animWorld = new THREE.Vector3();
  var shadowWasDyn = false;

  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clockTime += dt;

    var introApply = false;
    if (introActive) {
      // 开场缩放开镜同样按真实时钟收束，避免低帧率/DOM 卡顿导致总览长期停在 1.12 倍
      introT = Math.min(1, (performance.now() - introStartedAt) / 2400);
      var e = 1 - Math.pow(1 - introT, 3);
      introScale = 1 + 0.12 * (1 - e);
      introApply = true;
      if (introT >= 1) {
        introActive = false;
        introScale = 1;
      }
    }

    // 场景过渡 / 楼层切换期间禁用 OrbitControls，用我们自己的插值驱动 camera
    controls.enabled = !sceneState.transitioning && !floorState.transitioning && !coverTrans;
    controls.autoRotate = (coverActive || (entered && autoRotateAllowed)) && !paused &&
      !sceneState.transitioning && !floorState.transitioning && sceneState.active == null;
    if (controls.enabled) controls.update();

    // 封面 → 总览：真实时钟收束，避免低帧率下过渡忽快忽慢
    if (coverTrans) {
      var ct = Math.min(1, (performance.now() - coverTrans.startedAt) / coverTrans.duration);
      var ce = ct < 0.5 ? 4 * ct * ct * ct : 1 - Math.pow(-2 * ct + 2, 3) / 2;
      camera.position.lerpVectors(coverTrans.fromPos, coverTrans.toPos, ce);
      controls.target.lerpVectors(coverTrans.fromTarget, coverTrans.toTarget, ce);
      if (ct >= 1) {
        camera.position.copy(coverTrans.toPos);
        controls.target.copy(coverTrans.toTarget);
        coverTrans = null;
      }
    }

    updateViewShift(dt);

    // 收束帧也要执行一次，确保首屏总览与「进场景→返回」后的构图完全一致
    if (introApply) {
      var off = camera.position.clone().sub(controls.target);
      off.setLength(fitDist * introScale);
      camera.position.copy(controls.target).add(off);
    }

    updateSceneTransition(dt);
    updateFloorTransition(dt);

    // 昼夜平滑过渡：场景①夜色 / 其余白天
    if (Math.abs(nightTarget - nightMix) > 0.0001) {
      nightMix += (nightTarget - nightMix) * Math.min(1, dt * 3.2);
      if (Math.abs(nightTarget - nightMix) < 0.01) nightMix = nightTarget;
      applyNight(nightMix);
    }

    frameNo++;

    for (var i = 0; i < anims.length; i++) {
      var obj = anims[i];
      if (typeof obj.userData.tick !== 'function') continue;
      // 总览态远处物体降频到 30Hz；进入场景后按帧更新
      if (sceneState.active == null && !sceneState.transitioning && (frameNo % 2 !== 0)) continue;
      // 隐藏场景（切场景后）不再执行动画
      var vis = true;
      var pp = obj;
      while (pp) {
        if (pp.visible === false) { vis = false; break; }
        pp = pp.parent;
      }
      if (!vis) continue;
      // 距离过远（总览）时降低更新频率，进一步省 CPU
      if (sceneState.active == null && obj.getWorldPosition) {
        obj.getWorldPosition(animWorld);
        if (animWorld.distanceToSquared(camera.position) > 80 * 80 && (frameNo % 4 !== 0)) continue;
      }
      obj.userData.tick.call(obj, clockTime);
    }

    // DOM 标签投影：每 2 帧批量更新一次，避免每帧强制 layout/样式写回
    if (frameNo % 2 === 0) updateZoneTags();
    // 仅在镜头/显隐过渡期间重算阴影；结束后再补一帧静止状态
    var shadowDyn = sceneState.transitioning || floorState.transitioning || coverTrans != null;
    if (shadowDyn || shadowWasDyn) renderer.shadowMap.needsUpdate = true;
    shadowWasDyn = shadowDyn;
    renderer.render(scene, camera);
  }

  var loopStarted = false;

  function startLoop() {
    if (loopStarted) return;
    loopStarted = true;
    last = performance.now();
    renderer.setAnimationLoop(loop);
  }

  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    fatal('3D 渲染上下文已丢失，请刷新页面');
  });

  /* ---------------- 3D 屏幕点击（视频 / 外链） ---------------- */
  var raycaster = new THREE.Raycaster();
  var pointerNDC = new THREE.Vector2();
  var pDown = null;

  var videoOverlay = document.getElementById('videoOverlay');
  var voBox = videoOverlay ? videoOverlay.querySelector('.vo-box') : null;
  var voClose = videoOverlay ? videoOverlay.querySelector('.vo-close') : null;
  var voMask = videoOverlay ? videoOverlay.querySelector('.vo-mask') : null;
  var linkConfirm = document.getElementById('linkConfirm');
  var lcMask = linkConfirm ? linkConfirm.querySelector('.lc-mask') : null;
  var lcCancel = linkConfirm ? linkConfirm.querySelector('.lc-cancel') : null;
  var lcOk = linkConfirm ? linkConfirm.querySelector('.lc-ok') : null;

  function openVideo() {
    if (!videoOverlay || !voBox || !demoVideoEl) return;
    voBox.appendChild(demoVideoEl);
    demoVideoEl.controls = true;
    demoVideoEl.muted = false;
    videoOverlay.hidden = false;
    demoVideoEl.play().catch(function () {});
  }

  function closeVideo() {
    if (!videoOverlay || !demoVideoEl) return;
    videoOverlay.hidden = true;
    demoVideoEl.controls = false;
    demoVideoEl.muted = true;
    var sink = document.getElementById('videoSink');
    if (sink) sink.appendChild(demoVideoEl);
    // 离屏后暂停，避免隐藏视频持续解码/占用 GPU
    demoVideoEl.pause();
  }

  function openLinkConfirm() { if (linkConfirm) linkConfirm.hidden = false; }
  function closeLinkConfirm() { if (linkConfirm) linkConfirm.hidden = true; }

  if (voClose) voClose.addEventListener('click', closeVideo);
  if (voMask) voMask.addEventListener('click', closeVideo);
  if (lcCancel) lcCancel.addEventListener('click', closeLinkConfirm);
  if (lcMask) lcMask.addEventListener('click', closeLinkConfirm);
  if (lcOk) {
    lcOk.addEventListener('click', function () {
      window.open('https://balloondemo.xmjianhui.com/', '_blank', 'noopener');
      closeLinkConfirm();
    });
  }

  // 判断命中对象是否属于当前激活场景，且在有效可见链上（隐藏外景不误触）
  function belongsToActiveScene(o) {
    var ref = sceneRefs[sceneState.active];
    if (!ref) return false;
    var hit = false;
    for (var p = o; p; p = p.parent) { if (p === ref) { hit = true; break; } }
    if (!hit) return false;
    for (var q = o; q; q = q.parent) { if (q.visible === false) return false; }
    return true;
  }

  canvas.addEventListener('pointerdown', function (e) {
    pDown = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', function (e) {
    if (!pDown) return;
    var dx = e.clientX - pDown.x;
    var dy = e.clientY - pDown.y;
    pDown = null;
    if (dx * dx + dy * dy > 36) return;   // 拖拽不算点击
    if (sceneState.active == null || sceneState.transitioning) return;
    var picks = clickScreens.concat(interactives);
    if (!picks.length) return;
    var rect = canvas.getBoundingClientRect();
    // 与 projectToStage 对称：NDC 直接由 canvas 像素换算（viewOffset 已含在投影矩阵里）
    pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    var hits = raycaster.intersectObjects(picks, true);
    var target = null;
    for (var i = 0; i < hits.length; i++) {
      if (belongsToActiveScene(hits[i].object)) { target = hits[i].object; break; }
    }
    if (!target) return;
    var data = null;
    for (var o = target; o; o = o.parent) {
      if (o.userData && (o.userData.action || o.userData.roleId)) { data = o.userData; break; }
    }
    if (!data) return;
    if (data.action === 'video') openVideo();
    else if (data.action === 'link') openLinkConfirm();
    else if (data.roleId) openRoleCard(data.roleId);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (videoOverlay && !videoOverlay.hidden) { closeVideo(); return; }
    if (linkConfirm && !linkConfirm.hidden) { closeLinkConfirm(); return; }
    if (aboutModal && !aboutModal.hidden) { closeAbout(); return; }
    if (roleCard && !roleCard.hidden) { closeRoleCard(); }
  });

  /* ---------------- 可访问性：减少动效 ---------------- */
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    introActive = false;
    introScale = 1;
    paused = true;
    if (autoState) autoState.textContent = '已暂停 · 减少动效模式';
  }

  // 测试钩子（供自动化走查投影 3D 点击坐标；对功能无影响）
  window.__JH = {
    camera: camera,
    renderer: renderer,
    scene: scene,
    target: controls.target,
    clickScreens: clickScreens,
    interactives: interactives,
    sceneRefs: sceneRefs,
    customers: CUSTOMERS,
    view: function () { return { fullW: viewFullW, offX: viewOffX }; },
    project: function (x, y, z) {
      return projectToStage(_v.set(x, y, z));
    },
    screenCenter: function (i) {
      var m = clickScreens[i];
      if (!m) return null;
      var p = new THREE.Vector3();
      m.getWorldPosition(p);
      return projectToStage(p);
    },
    objectCenter: function (i) {
      var m = interactives[i];
      if (!m) return null;
      var p = new THREE.Vector3();
      m.getWorldPosition(p);
      p.y += 1.2;
      return projectToStage(p);
    },
    enter: function (id) { selectScene(id); },
    exit: function () { exitScene(); },
    floor: function (i) { gotoRoleFloor(i); },
    roleFloor: function () { return roleFloorIndex; },
    night: function () { return { mix: nightMix, target: nightTarget }; },
    wallsOpen: function (id) {
      var ref = sceneRefs[id];
      if (!ref || !ref.userData.wallFadeMats) return null;
      var m = ref.userData.wallFadeMats[0];
      var base = m.userData.baseOp != null ? m.userData.baseOp : 1;
      return base ? 1 - m.opacity / base : 0;
    },
    openRole: function (id) { openRoleCard(id); },
    state: function () {
      return {
        active: sceneState.active,
        transitioning: sceneState.transitioning,
        demo: appEl.classList.contains('demo'),
        shift: viewShiftCur,
        panel: scenePanel ? !scenePanel.hidden : false,
        roleCard: roleCard ? !roleCard.hidden : false,
        night: nightMix,
        video: videoOverlay ? !videoOverlay.hidden : false,
        about: aboutModal ? !aboutModal.hidden : false
      };
    }
  };

  // 封面起即开始渲染：右侧 3D 场景自动旋转
  startLoop();

})();
