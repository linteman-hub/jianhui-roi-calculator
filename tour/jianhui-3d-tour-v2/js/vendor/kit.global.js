(function () {
// ============ 构件库：低多边形可复用 3D 道具 ============


const C = {
  ground:'#E9ECEF', ground2:'#F3F5F7', road:'#DFE3E8',
  roof:'#4D8FD1', roofL:'#7FB3E0', wall:'#FFFFFF', shade:'#D8DEE4',
  glass:'#EAF1F7', ink:'#374151', gray:'#8B939E', mid:'#B7BEC7',
  tree:'#A8CDB4', treeD:'#8FBF9F', red:'#D64545', blue:'#1B75BC',
  yellow:'#FFC000', green:'#2E9E5B', cyan:'#35A2FF',
  tRoof:'#BFC5CC', tRoofL:'#AEB5BD', tWall:'#F1F2F4', tShade:'#D3D7DC'
};

const matCache = new Map();
function M(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({
    color, roughness: o.rough ?? .88, metalness: o.metal ?? 0,
    flatShading: o.flat ?? true, transparent: !!o.op, opacity: o.op ?? 1,
    side: o.ds ? THREE.DoubleSide : THREE.FrontSide
  }));
  return matCache.get(k);
}
const geoCache = new Map();
function cachedGeo(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}
function boxGeo(w, h, d) { return cachedGeo('b' + w + '|' + h + '|' + d, () => new THREE.BoxGeometry(w, h, d)); }
function box(w, h, d, m) { return new THREE.Mesh(boxGeo(w, h, d), typeof m === 'string' ? M(m) : m); }
function cyl(rt, rb, h, m, seg = 18) {
  return new THREE.Mesh(cachedGeo('c' + rt + '|' + rb + '|' + h + '|' + seg, () => new THREE.CylinderGeometry(rt, rb, h, seg)), typeof m === 'string' ? M(m) : m);
}
function sph(r, m, seg = 12) {
  return new THREE.Mesh(cachedGeo('s' + r + '|' + seg, () => new THREE.SphereGeometry(r, seg, Math.max(8, seg >> 1))), typeof m === 'string' ? M(m) : m);
}
function P(o) { const g = new THREE.Group(); if (o) g.add(o); return g; }
function place(mesh, x, y, z, ry = 0) { mesh.position.set(x, y, z); if (ry) mesh.rotation.y = ry; return mesh; }

// ---------- 画布文字贴图（白卡文字/招牌/屏幕） ----------
function textPlane(text, o = {}) {
  const w = o.w ?? 512, h = o.h ?? 128, fs = o.fs ?? 56, num = o.num;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = o.bg ?? '#FFFFFF'; g.fillRect(0, 0, w, h);
  if (o.border) { g.strokeStyle = o.border; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); }
  if (num) {
    g.fillStyle = o.numBg ?? '#0F172A';
    g.beginPath(); g.roundRect(24, h / 2 - 24, 74, 48, 24); g.fill();
    g.fillStyle = '#fff'; g.font = `700 ${fs * .5}px Consolas,monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(num, 61, h / 2 + 2);
  }
  g.fillStyle = o.fg ?? '#1F2937'; g.font = `700 ${fs}px "Microsoft YaHei",sans-serif`;
  g.textAlign = num ? 'left' : 'center'; g.textBaseline = 'middle';
  if (num) g.fillText(text, 116, h / 2 + 3); else g.fillText(text, w / 2, h / 2 + 3);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const pw = o.pw ?? 2.2, ph = pw * h / w;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph),
    new THREE.MeshBasicMaterial({ map: tex, transparent: false }));
  return mesh;
}
function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return { cv, ctx: cv.getContext('2d'), tex };
}
function screenMesh(cvs, pw = 1.05) {
  const src = cvs.cv ?? cvs; // 兼容 canvasTexture 包装对象与原生 canvas
  const h = pw * src.height / src.width;
  return new THREE.Mesh(new THREE.PlaneGeometry(pw, h),
    new THREE.MeshBasicMaterial({ map: cvs.tex }));
}

// ---------- 地面 / 道路 / 树 ----------
function groundPlane(r = 70, color = C.ground) {
  const g = new THREE.Mesh(new THREE.CircleGeometry(r, 48), M(color));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; return g;
}
function roadStrip(w, l, x, z, ry = 0) {
  const r = box(w, .02, l, M(C.road)); r.position.set(x, .01, z); r.rotation.y = ry; r.receiveShadow = true; return r;
}
function lightStrip(w, l, x, z, ry = 0, color = C.cyan) {
  const cv = canvasTexture(64, 256, (g) => { g.fillStyle = color; g.fillRect(0, 0, 64, 130); });
  cv.tex.wrapS = cv.tex.wrapT = THREE.RepeatWrapping; cv.tex.repeat.set(1, Math.floor(l / 3));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l),
    new THREE.MeshBasicMaterial({ map: cv.tex, transparent: true, opacity: .55 }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = ry; m.position.set(x, .02, z);
  m.userData.tick = (t) => { cv.tex.offset.y = (t * .35) % 1; };
  return m;
}
function tree(x, z, s = 1) {
  const g = P(); const trunk = cyl(.09 * s, .12 * s, .5 * s, '#8A6F52'); trunk.position.y = .25 * s;
  const c1 = sph(.5 * s, M(C.tree, { flat: true }), 7); c1.position.y = .85 * s;
  const c2 = sph(.34 * s, M(C.treeD), 7); c2.position.set(.18 * s, 1.1 * s, .1 * s);
  g.add(trunk, c1, c2); g.position.set(x, 0, z);
  // 树不再逐帧摇摆：静态后可整批合并为 1 个 draw call（性能优先）
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- 厂房（可配色：智能蓝 / 传统灰） ----------
function factory({ x = 0, z = 0, ry = 0, w = 10, d = 6, h = 3.2, roof = C.roof, roofL = C.roofL, wall = C.wall, shade = C.shade, sawtooth = false, sign = '', fan = true, chimney = false } = {}) {
  const g = P(); g.position.set(x, 0, z); g.rotation.y = ry;
  const body = box(w, h, d, wall); body.position.y = h / 2; g.add(body);
  const base = box(w + .3, .25, d + .3, shade); base.position.y = .12; g.add(base);
  // 屋顶
  if (sawtooth) {
    const n = 4, tw = w / n;
    for (let i = 0; i < n; i++) {
      const tooth = P();
      const sl = box(tw * .72, .14, d + .2, roof); sl.position.set(0, .07, 0); sl.rotation.z = .38; tooth.add(sl);
      const gls = box(tw * .3, .1, d + .18, roofL); gls.position.set(tw * .3, .02, 0); tooth.add(gls);
      tooth.position.set(-w / 2 + tw * (i + .5), h, 0); g.add(tooth);
    }
  } else {
    const roofTop = box(w + .4, .22, d + .4, roof); roofTop.position.y = h + .11; g.add(roofTop);
    const cap = box(w * .5, .3, d * .5, roofL); cap.position.y = h + .34; g.add(cap);
    for (let i = 0; i < 3; i++) { const sky = box(.9, .05, d * .7, roofL); sky.position.set(-w / 4 + i * w / 4, h + .24, 0); g.add(sky); }
  }
  // 门与窗带
  const door = box(1.7, 1.9, .08, shade); door.position.set(0, .95, d / 2 + .02); g.add(door);
  const win = box(w * .78, .8, .06, C.glass); win.position.set(0, h * .62, d / 2 + .03); g.add(win);
  const frame = box(w * .78 + .12, .9, .04, shade); frame.position.set(0, h * .62, d / 2 + .015); g.add(frame);
  // 侧墙窗
  const win2 = box(.06, .7, d * .7, C.glass); win2.position.set(w / 2 + .03, h * .6, 0); g.add(win2);
  // 屋顶风机
  if (fan) {
    const fu = P(); const fb = cyl(.28, .34, .3, shade); fu.add(fb);
    const blades = P();
    for (let i = 0; i < 3; i++) { const b = box(.5, .04, .12, C.gray); b.rotation.y = i * Math.PI / 3; blades.add(b); }
    blades.position.y = .2; fu.add(blades); fu.position.set(w * .28, h + .38, 0); g.add(fu);
    g.userData.tick = (t) => { blades.rotation.y = t * 2.4; };
  }
  if (chimney) {
    const ch = cyl(.3, .38, 1.6, shade); ch.position.set(-w * .3, h + .8, -d * .2); g.add(ch);
    const steam = P(); for (let i = 0; i < 3; i++) { const s = sph(.28 + i * .1, M('#FFFFFF', { op: .35 }), 8); s.position.y = i * .5; steam.add(s); }
    steam.position.set(-w * .3, h + 1.8, -d * .2); g.add(steam);
    g.userData.tick = (t) => { steam.children.forEach((s, i) => { s.position.y = ((t * .6 + i * .33) % 1) * 1.6; s.material.opacity = .4 * (1 - (t * .6 + i * .33) % 1); s.scale.setScalar(.7 + ((t * .6 + i * .33) % 1)); }); };
  }
  // 招牌
  if (sign) { const sp = textPlane(sign, { num: sign.slice(0, 2), fs: 50, pw: 3 }); sp.position.set(0, h * .88, d / 2 + .06); g.add(sp); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------- 人物（低模，6 姿态） ----------
function person({ shirt = '#4A6FA5', pants = '#39424E', skin = '#F0C9A0', hair = '#3A3A3A', pose = 'stand', s = 1 } = {}) {
  const g = P();
  const torso = cyl(.16 * s, .2 * s, .5 * s, shirt, 10); torso.position.y = .85 * s; g.add(torso);
  const head = sph(.14 * s, skin, 10); head.position.y = 1.24 * s; g.add(head);
  const hh = sph(.158 * s, M(hair, { flat: true }), 10); hh.position.y = 1.28 * s; hh.scale.set(1, .82, 1); g.add(hh);
  const fringe = sph(.12 * s, M(hair, { flat: true }), 8); fringe.position.set(0, 1.32 * s, .06 * s); fringe.scale.set(1.1, .5, .8); g.add(fringe);
  const hip = box(.3 * s, .28 * s, .2 * s, pants); hip.position.y = .5 * s; g.add(hip);
  const armL = P(), armR = P();
  const aL = cyl(.05 * s, .05 * s, .42 * s, shirt, 8); aL.position.y = -.21 * s; armL.add(aL);
  const aR = cyl(.05 * s, .05 * s, .42 * s, shirt, 8); aR.position.y = -.21 * s; armR.add(aR);
  armL.position.set(.23 * s, 1.06 * s, 0); armR.position.set(-.23 * s, 1.06 * s, 0);
  g.add(armL, armR);
  let legL = null, legR = null;
  if (pose !== 'sit') {
    legL = cyl(.07 * s, .07 * s, .42 * s, pants, 8); legL.position.set(.09 * s, .18 * s, 0); g.add(legL);
    legR = cyl(.07 * s, .07 * s, .42 * s, pants, 8); legR.position.set(-.09 * s, .18 * s, 0); g.add(legR);
  }
  g.userData.limbs = { head, armL, armR, legL, legR, torso };
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.setPose = (p) => {
    const L = g.userData.limbs;
    if (p === 'sit') { L.armL.rotation.x = L.armR.rotation.x = -.9; L.torso.scale.y = .92; if (legL) { legL.visible = legR.visible = false; } }
    else if (p === 'type') { L.armL.rotation.x = -1.15; L.armR.rotation.x = -1.1; L.head.rotation.x = .3; if (legL) { legL.visible = legR.visible = false; } }
    else if (p === 'tired') { L.head.rotation.x = .45; L.armR.rotation.x = -2.4; L.armR.rotation.z = -.5; L.armL.rotation.x = -.2; if (legL) { legL.visible = legR.visible = false; } }
    else if (p === 'walk') { L.armL.rotation.x = .5; L.armR.rotation.x = -.5; }
    else if (p === 'point') { L.armR.rotation.x = -1.5; }
  };
  g.userData.setPose(pose);
  return g;
}

// ---------- 工位（桌+椅+可选屏幕） ----------
function desk({ screen = null, lamp = false, papers = 0 } = {}) {
  const g = P();
  const top = box(1.5, .06, .75, '#C9A876'); top.position.y = .76; g.add(top);
  const l1 = box(.06, .74, .06, C.gray); l1.position.set(.68, .38, .3); g.add(l1);
  const l2 = box(.06, .74, .06, C.gray); l2.position.set(-.68, .38, .3); g.add(l2);
  const l3 = box(.06, .74, .06, C.gray); l3.position.set(.68, .38, -.3); g.add(l3);
  const l4 = box(.06, .74, .06, C.gray); l4.position.set(-.68, .38, -.3); g.add(l4);
  const chair = P(); const seat = box(.44, .06, .44, '#4B5563'); seat.position.y = .45; chair.add(seat);
  const back = box(.44, .5, .06, '#4B5563'); back.position.set(0, .72, -.22); chair.add(back);
  const pole = cyl(.04, .04, .42, C.gray); pole.position.y = .23; chair.add(pole);
  chair.position.set(.38, 0, -.62); g.add(chair);
  if (screen) { const sc = screenMesh(screen.cvs, .9); sc.position.set(-.2, 1.06, -.18); sc.rotation.x = -.08; g.add(sc);
    const fr = box(.98, .6, .05, '#20242B'); fr.position.set(-.2, 1.06, -.22); g.add(fr);
    const st = box(.08, .14, .08, '#20242B'); st.position.set(-.2, .8, -.2); g.add(st);
    // 键盘 + 鼠标（靠人一侧）
    const kb = box(.52, .035, .18, '#39424E'); kb.position.set(.15, .82, .1); g.add(kb);
    const kbk = box(.44, .02, .12, '#525B68'); kbk.position.set(.15, .845, .1); g.add(kbk);
    const mouse = box(.09, .035, .13, '#525B68'); mouse.position.set(.52, .82, .12); g.add(mouse); }
  else { const fr = box(.98, .6, .05, '#20242B'); fr.position.set(-.2, 1.06, -.22); g.add(fr);
    const off = screenMesh(canvasTexture(256, 160, (c) => { c.fillStyle = '#141A22'; c.fillRect(0, 0, 256, 160); c.fillStyle = '#2E3947'; c.font = '16px monospace'; c.fillText('_', 120, 84); }), .9);
    off.position.set(-.2, 1.06, -.18); off.rotation.x = -.08; g.add(off);
    const st = box(.08, .14, .08, '#20242B'); st.position.set(-.2, .8, -.2); g.add(st);
    const kb = box(.52, .035, .18, '#39424E'); kb.position.set(.15, .82, .1); g.add(kb);
    const mouse = box(.09, .035, .13, '#525B68'); mouse.position.set(.52, .82, .12); g.add(mouse); }
  for (let i = 0; i < papers; i++) { const pp = box(.42, .012, .3, '#FFFFFF'); pp.position.set(-.5 + (i % 3) * .12, .805 + Math.floor(i / 3) * .016, -.05 + ((i * 37) % 3) * .12, ); pp.rotation.y = (i % 4) * .18 - .27; g.add(pp); }
  if (lamp) { const lm = P(); const ar = box(.04, .3, .04, C.gray); ar.position.y = .15; lm.add(ar); const hd = sph(.09, M(C.yellow, { rough: .4 }), 8); hd.position.y = .32; lm.add(hd); lm.position.set(.55, .79, -.2); g.add(lm); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- 打印机（吐纸动画） ----------
function printer() {
  const g = P();
  const body = box(.7, .4, .5, '#DDE1E6'); body.position.y = .2; g.add(body);
  const top = box(.6, .1, .4, '#C4CAD2'); top.position.y = .44; g.add(top);
  const slot = box(.5, .05, .1, '#9AA3AF'); slot.position.set(0, .3, .22); g.add(slot);
  const sheet = box(.5, .01, .35, '#FFFFFF'); sheet.position.set(0, .28, .42); g.add(sheet);
  g.userData.tick = (t) => { const p = (t * .5) % 1; sheet.position.z = .32 + p * .3; sheet.position.y = .28 - p * .18; sheet.rotation.x = p * .5; };
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- 挂钟（指针快转） ----------
function clockFast() {
  const g = P();
  const face = cyl(.34, .34, .05, '#FFFFFF', 20); face.rotation.x = Math.PI / 2; g.add(face);
  const rim = cyl(.37, .37, .04, C.ink, 20); rim.rotation.x = Math.PI / 2; rim.position.z = -.01; g.add(rim);
  const hm = box(.03, .18, .015, C.ink); hm.position.set(0, .08, .035); const hp = P(); hp.add(hm); g.add(hp);
  const sM = box(.02, .28, .012, C.red); sM.position.set(0, .12, .045); const mp = P(); mp.add(sM); g.add(mp);
  g.userData.tick = (t) => { hp.rotation.z = -t * 1.6; mp.rotation.z = -t * 9; };
  return g;
}

// ---------- AGV 小车 / 叉车 / 货车 / 轿车 / 巡检机器人 ----------
function agv(color = C.blue) {
  const g = P();
  const b = box(.7, .22, 1, color); b.position.y = .16; g.add(b);
  const top = box(.55, .05, .8, '#2A313C'); top.position.y = .3; g.add(top);
  const light = sph(.06, M(C.yellow, { rough: .3 }), 8); light.position.set(0, .36, .35); g.add(light);
  g.userData.tick = (t) => { light.material.color.setHex(Math.sin(t * 6) > 0 ? 0xFFC000 : 0x554400); };
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function forklift() {
  const g = P();
  const b = box(.8, .6, 1.1, C.yellow); b.position.y = .5; g.add(b);
  const cab = box(.7, .5, .5, '#39424E'); cab.position.set(0, 1, -.2); g.add(cab);
  const mast = box(.08, 1.2, .08, C.gray); mast.position.set(.25, .7, .6); g.add(mast);
  const mast2 = mast.clone(); mast2.position.x = -.25; g.add(mast2);
  const fork = box(.5, .05, .5, C.gray); fork.position.set(0, .12, .8); g.add(fork);
  g.userData.fork = fork; g.userData.tick = (t) => { fork.position.y = .12 + (Math.sin(t * 1.2) * .5 + .5) * .8; };
  return g;
}
function truck(color = '#FFFFFF') {
  const g = P();
  const cabB = box(1.1, 1, 1.2, color); cabB.position.set(0, .8, 1.1); g.add(cabB);
  const win = box(.9, .4, .06, C.glass); win.position.set(0, 1.15, 1.72); g.add(win);
  const boxB = box(1.2, 1.3, 2.4, '#EDEFF2'); boxB.position.set(0, 1, -.6); g.add(boxB);
  for (const [x, z] of [[.55, 1.2], [-.55, 1.2], [.55, -.9], [-.55, -.9], [.55, .1], [-.55, .1]]) {
    const wl = cyl(.22, .22, .14, '#22262C', 12); wl.rotation.z = Math.PI / 2; wl.position.set(x, .22, z); g.add(wl);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function car(color = C.red) {
  const g = P();
  const b = box(.85, .3, 1.7, color); b.position.y = .32; g.add(b);
  const cab = box(.75, .28, .85, color); cab.position.set(0, .6, -.1); g.add(cab);
  const win = box(.77, .18, .87, C.glass); win.position.set(0, .62, -.1); g.add(win);
  for (const [x, z] of [[.4, .55], [-.4, .55], [.4, -.55], [-.4, -.55]]) {
    const wl = cyl(.16, .16, .12, '#22262C', 12); wl.rotation.z = Math.PI / 2; wl.position.set(x, .16, z); g.add(wl);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function inspectorBot() {
  const g = P();
  const b = cyl(.28, .32, .5, '#FFFFFF', 12); b.position.y = .45; g.add(b);
  const head = sph(.18, '#2A313C', 10); head.position.y = .85; g.add(head);
  const eye = sph(.05, M(C.cyan, { rough: .2 }), 8); eye.position.set(0, .86, .15); g.add(eye);
  g.userData.tick = (t) => { head.rotation.y = Math.sin(t * 1.5) * .8; eye.material.color.setHex(Math.sin(t * 4) > 0 ? 0x35A2FF : 0x113048); };
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function drone() {
  const g = P();
  const b = box(.3, .1, .3, '#2A313C'); g.add(b);
  const rotors = P();
  for (const [x, z] of [[.28, .28], [-.28, .28], [.28, -.28], [-.28, -.28]]) {
    const arm = box(.3, .03, .04, C.gray); arm.position.set(x * .5, .02, z * .5); arm.rotation.y = Math.atan2(z, x); g.add(arm);
    const r = cyl(.16, .16, .012, '#39424E', 10); r.position.set(x, .07, z); rotors.add(r);
  }
  g.add(rotors);
  const cam = sph(.05, M(C.red), 8); cam.position.y = -.08; g.add(cam);
  g.userData.tick = (t) => { rotors.children.forEach(r => r.rotation.y = t * 30); };
  return g;
}

// ---------- 机械臂 / 传送带 / CNC / 冲压机 / 三坐标 / 货架 ----------
function robotArm(color = '#F0A03C') {
  const g = P();
  const base = cyl(.32, .4, .3, '#39424E', 12); base.position.y = .15; g.add(base);
  const j1 = P(); const a1 = box(.22, .9, .22, color); a1.position.y = .45; j1.add(a1); j1.position.y = .3; g.add(j1);
  const j2 = P(); const a2 = box(.18, .7, .18, color); a2.position.y = .32; j2.add(a2);
  const claw = box(.3, .1, .12, '#39424E'); claw.position.y = -.04; j2.add(claw);
  j2.position.y = .9; j1.add(j2);
  g.userData.tick = (t) => { j1.rotation.y = Math.sin(t * .8) * 1.1; j2.rotation.z = Math.sin(t * .8 + 1) * .6 - .3; };
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function conveyor(len = 3, color = '#39424E') {
  const g = P();
  const belt = box(.8, .18, len, '#22262C'); belt.position.y = .55; g.add(belt);
  const cv = canvasTexture(64, 64, (c) => { c.fillStyle = '#2E3947'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#454F5C'; c.fillRect(0, 0, 64, 22); });
  cv.tex.wrapS = cv.tex.wrapT = THREE.RepeatWrapping; cv.tex.repeat.set(1, len);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(.7, len), new THREE.MeshBasicMaterial({ map: cv.tex }));
  strip.rotation.x = -Math.PI / 2; strip.position.y = .645; g.add(strip);
  for (let i = 0; i <= len; i += 1.2) { const leg = box(.1, .46, .1, C.gray); leg.position.set(.3, .23, -len / 2 + i); g.add(leg);
    const leg2 = leg.clone(); leg2.position.x = -.3; g.add(leg2); }
  g.userData.tick = (t) => { cv.tex.offset.y = t * .8; };
  g.traverse(o => { if (o.isMesh && o.material === M('#22262C') || o.isMesh) o.castShadow = true; });
  return g;
}
function cnc() {
  const g = P();
  const b = box(1.4, 1.2, 1, '#DDE1E6'); b.position.y = .6; g.add(b);
  const win = box(.7, .45, .05, C.glass); win.position.set(0, .75, .51); g.add(win);
  const lampI = box(.16, .1, .03, C.green); lampI.position.set(.5, 1.1, .51); g.add(lampI);
  g.userData.tick = (t) => { lampI.material.color.setHex(Math.sin(t * 3) > 0 ? 0x2E9E5B : 0x14522F); };
  return g;
}
function press() {
  const g = P();
  const b = box(1.2, .8, 1, '#B7462E'); b.position.y = .4; g.add(b);
  const colL = box(.2, 1.2, .2, '#39424E'); colL.position.set(.4, 1.4, 0); g.add(colL);
  const colR = colL.clone(); colR.position.x = -.4; g.add(colR);
  const top = box(1.2, .3, 1, '#39424E'); top.position.y = 2.05; g.add(top);
  const ram = box(.8, .3, .7, '#8A929C'); ram.position.y = 1.6; g.add(ram);
  g.userData.tick = (t) => { ram.position.y = 1.35 + (Math.sin(t * 2.4) * .5 + .5) * .55; };
  return g;
}
function cmm() {
  const g = P();
  const table = box(1.8, .25, 1.1, '#39424E'); table.position.y = .5; g.add(table);
  const gan = box(.12, 1.4, .12, '#DDE1E6'); gan.position.set(.8, 1.3, 0); g.add(gan);
  const beam = box(1.7, .12, .12, '#DDE1E6'); beam.position.set(0, 1.95, 0); g.add(beam);
  const car = box(.16, .3, .16, C.blue); car.position.set(0, 1.7, 0); g.add(car);
  const probe = cyl(.02, .02, .5, C.red, 8); probe.position.set(0, 1.2, 0); car.add(probe);
  g.userData.tick = (t) => { car.position.x = Math.sin(t * .7) * .7; car.position.z = Math.cos(t * .5) * .3; };
  return g;
}
function shelf(rows = 3) {
  const g = P();
  for (const x of [-.7, .7]) { const p = box(.08, 1.8, .8, '#F0A03C'); p.position.set(x, .9, 0); g.add(p); }
  for (let i = 0; i < rows; i++) {
    const lv = box(1.6, .05, .8, '#F0A03C'); lv.position.y = .3 + i * .6; g.add(lv);
    for (let j = 0; j < 3; j++) { const bx2 = box(.4, .32, .5, ['#C9CED4', '#AEB5BD', '#8B939E'][j]); bx2.position.set(-.5 + j * .5, .5 + i * .6, 0); g.add(bx2); }
  }
  return g;
}

// ---------- 办公类：白板 / 文件柜 / 绿植 / 咖啡机 / 服务器机柜 / 大屏看板 ----------
function whiteboard() {
  const g = P();
  const bd = box(1.8, 1.1, .06, '#FFFFFF'); bd.position.y = 1.5; g.add(bd);
  const fr = box(1.86, 1.16, .04, '#C4CAD2'); fr.position.set(0, 1.5, -.015); g.add(fr);
  const cvs = canvasTexture(256, 160, (c) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, 256, 160); c.strokeStyle = '#DC2626'; c.lineWidth = 3;
    for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(30 + i * 42, 50, 11, 0, 7); c.stroke(); c.font = '12px monospace'; c.fillStyle = '#334155'; c.fillText('Φ' + (10 + i * 4), 16 + i * 42, 78); }
    c.strokeStyle = '#1B75BC'; c.strokeRect(20, 100, 216, 40); c.fillStyle = '#64748B'; c.font = '13px sans-serif'; c.fillText('待检: 12 张 · 今日: 8 张', 30, 124);
  });
  const face = screenMesh(cvs, 1.7); face.position.set(0, 1.5, .035); g.add(face);
  const legs = box(.06, 1, .06, C.gray); legs.position.set(-.8, .5, 0); g.add(legs);
  const legs2 = legs.clone(); legs2.position.x = .8; g.add(legs2);
  return g;
}
function cabinet(messy = true) {
  const g = P();
  const b = box(.9, 1.7, .5, '#C9CED4'); b.position.y = .85; g.add(b);
  for (let i = 0; i < 3; i++) { const d = box(.8, .5, .03, '#AEB5BD'); d.position.set(0, .4 + i * .55, .26); g.add(d); }
  // 柜顶乱堆的纸质文件
  const sheets = messy ? 8 : 4;
  for (let i = 0; i < sheets; i++) {
    const bx2 = box(.5, .05, .36, i % 2 ? '#E8EAED' : '#F6F7F8');
    bx2.position.set((Math.random() - .5) * .18, 1.74 + i * .05, (Math.random() - .5) * .1);
    bx2.rotation.y = (Math.random() - .5) * .9; bx2.rotation.z = (Math.random() - .5) * .06;
    g.add(bx2);
  }
  if (messy) {
    // 侧边散落的文件
    for (let i = 0; i < 3; i++) {
      const sp = box(.3, .012, .22, '#FFFFFF');
      sp.position.set(.62 + Math.random() * .2, .015 + i * .014, .2 + Math.random() * .3);
      sp.rotation.y = Math.random() * 1.2; g.add(sp);
    }
    // 半开的抽屉
    const dr = box(.7, .4, .22, '#DDE1E6'); dr.position.set(.1, 1.5, .4); g.add(dr);
    const dp = box(.5, .02, .3, '#F6F7F8'); dp.position.set(.05, 1.52, .55); dp.rotation.x = .15; g.add(dp);
  }
  return g;
}
function plant(s = 1) {
  const g = P();
  const pot = cyl(.16 * s, .12 * s, .22 * s, '#C96F4A', 10); pot.position.y = .11 * s; g.add(pot);
  const bush = sph(.22 * s, M('#5FA372'), 8); bush.position.y = .4 * s; g.add(bush);
  const bush2 = sph(.15 * s, M('#4C8A5F'), 8); bush2.position.set(.1 * s, .52 * s, .05 * s); g.add(bush2);
  return g;
}
function coffee() {
  const g = P();
  const b = box(.35, .45, .3, '#39424E'); b.position.y = .23; g.add(b);
  const cup = cyl(.05, .04, .08, '#FFFFFF', 8); cup.position.set(.1, .5, .05); g.add(cup);
  const steam = P(); for (let i = 0; i < 2; i++) { const s = sph(.05, M('#FFFFFF', { op: .3 }), 6); s.position.y = i * .12; steam.add(s); }
  steam.position.set(.1, .58, .05); g.add(steam);
  g.userData.tick = (t) => { steam.children.forEach((s, i) => { const p = (t * .8 + i * .5) % 1; s.position.y = p * .3; s.material.opacity = .35 * (1 - p); }); };
  return g;
}
function serverRack() {
  const g = P();
  const b = box(.8, 1.9, .7, '#22262C'); b.position.y = .95; g.add(b);
  const lights = [];
  for (let i = 0; i < 8; i++) { const l = box(.05, .04, .02, C.green); l.position.set(-.22 + (i % 2) * .12, .3 + Math.floor(i / 2) * .4, .36); g.add(l); lights.push(l); }
  g.userData.tick = (t) => { lights.forEach((l, i) => l.material.color.setHex(Math.sin(t * 5 + i * 1.3) > 0 ? 0x2E9E5B : 0x11301F)); };
  return g;
}
function dashBoard() {
  const cvs = canvasTexture(512, 288, () => {});
  const g = P();
  const fr = box(3.4, 2, .1, '#20242B'); fr.position.y = 2; g.add(fr);
  const sc = screenMesh(cvs, 3.3); sc.position.set(0, 2, .07); g.add(sc);
  let tickN = 0;
  g.userData.tick = (t) => {
    if (t - tickN < .12) return; tickN = t;
    const c = cvs.ctx, W = 512, H = 288;
    c.fillStyle = '#0E1B2E'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#1B75BC'; c.fillRect(0, 0, W, 6);
    c.fillStyle = '#EAF2FB'; c.font = '700 22px "Microsoft YaHei"'; c.fillText('智能质检看板 · LIVE', 18, 36);
    c.fillStyle = '#35A2FF'; c.font = '700 40px Consolas';
    c.fillText('95%+', 24, 100); c.fillStyle = '#7C8BA1'; c.font = '14px sans-serif'; c.fillText('合格率', 24, 122);
    c.fillStyle = '#4ADE80'; c.font = '700 40px Consolas'; c.fillText('10min', 190, 100);
    c.fillStyle = '#7C8BA1'; c.font = '14px sans-serif'; c.fillText('单张耗时', 190, 122);
    c.fillStyle = '#FFC000'; c.font = '700 40px Consolas'; c.fillText('128', 360, 100);
    c.fillStyle = '#7C8BA1'; c.font = '14px sans-serif'; c.fillText('今日图纸', 360, 122);
    c.strokeStyle = '#35A2FF'; c.lineWidth = 2.5; c.beginPath();
    for (let x = 0; x <= W - 40; x += 8) { const y = 210 + Math.sin(x * .03 + t * .9) * 22 + Math.sin(x * .011 + t * .3) * 14; x === 0 ? c.moveTo(20 + x, y) : c.lineTo(20 + x, y); }
    c.stroke();
    c.fillStyle = '#7C8BA1'; c.font = '13px sans-serif'; c.fillText('产线 A · 产线 B · 产线 C 实时合格率趋势', 20, 272);
    cvs.tex.needsUpdate = true;
  };
  return g;
}

// ---------- AI 识图屏幕（CanvasTexture 动画：气泡逐个标注+尺寸列表+对勾） ----------
function aiScreenCvs() {
  const cvs = canvasTexture(512, 340, () => {});
  let last = -1;
  cvs.tick = (t) => {
    const step = Math.floor(t * 1.4);
    if (step === last) return; last = step;
    const c = cvs.ctx, W = 512, H = 340;
    c.fillStyle = '#F4F7FA'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#1B75BC'; c.fillRect(0, 0, W, 34);
    c.fillStyle = '#fff'; c.font = '700 15px "Microsoft YaHei"'; c.fillText('简会 AI 图纸识别系统', 14, 23);
    c.fillStyle = '#FFC000'; c.beginPath(); c.roundRect(392, 7, 104, 20, 10); c.fill();
    c.fillStyle = '#0F172A'; c.font = '700 12px sans-serif'; c.fillText('识别中…', 414, 21);
    // 图纸区
    c.fillStyle = '#fff'; c.fillRect(12, 46, 300, 282);
    c.strokeStyle = '#94A3B8'; c.lineWidth = 2; c.strokeRect(30, 66, 264, 200);
    c.strokeStyle = '#CBD5E1';
    c.strokeRect(60, 100, 90, 60); c.strokeRect(190, 100, 70, 60);
    c.beginPath(); c.arc(110, 210, 26, 0, 7); c.stroke();
    c.beginPath(); c.arc(225, 210, 18, 0, 7); c.stroke();
    c.strokeStyle = '#64748B'; c.beginPath(); c.moveTo(30, 286); c.lineTo(294, 286); c.stroke();
    // 气泡逐个出现
    const spots = [[52, 92], [148, 92], [252, 92], [84, 202], [200, 202], [110, 250], [230, 250], [160, 130]];
    const shown = Math.min(spots.length, Math.max(0, step % 12) + 1);
    for (let i = 0; i < shown; i++) {
      const [x, y] = spots[i];
      c.fillStyle = '#1B75BC'; c.beginPath(); c.arc(x, y, 10, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.font = '700 11px Consolas'; c.textAlign = 'center'; c.fillText(String(i + 1), x, y + 4); c.textAlign = 'left';
    }
    // 右侧列表
    c.fillStyle = '#fff'; c.fillRect(322, 46, 178, 282);
    c.fillStyle = '#0F172A'; c.font = '700 13px "Microsoft YaHei"'; c.fillText('尺寸列表', 336, 68);
    const dims = ['Φ25 H7', 'Φ36 ±0.05', '60 ±0.1', 'Φ12 H8', '45 ±0.02', 'M8-6H', '18 H9', 'R5'];
    for (let i = 0; i < 8; i++) {
      const y = 92 + i * 26, ok = i < shown;
      c.fillStyle = ok ? '#F0FDF4' : '#F8FAFC'; c.fillRect(332, y - 14, 158, 21);
      c.fillStyle = ok ? '#16A34A' : '#94A3B8'; c.font = '700 12px Consolas';
      c.fillText(dims[i], 340, y + 1);
      c.fillStyle = ok ? '#16A34A' : '#CBD5E1'; c.font = '700 13px sans-serif'; c.fillText(ok ? '✓' : '·', 470, y + 1);
    }
    cvs.tex.needsUpdate = true;
  };
  return cvs;
}

// ---------- 全息投影圈 / 火花 / 射灯 ----------
function holoRing(r = .8, color = C.cyan) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, .02, 8, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .7 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = .02;
  ring.userData.tick = (t) => { ring.rotation.z = t * 1.2; ring.material.opacity = .45 + Math.sin(t * 3) * .2; };
  return ring;
}
function spotCone(h = 4, color = 0xFFDFA8) {
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, h, 24, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .1, side: THREE.DoubleSide, depthWrite: false }));
  cone.position.y = h / 2;
  return cone;
}

// ---------- F06 研发大楼 ----------
function towerF06() {
  const g = P();
  const shape = new THREE.Shape();
  const w = 6, d = 6, r = 1.4, H = 22;
  const rr = (x, y, wd, ht, rad) => { shape.moveTo(x + rad, y); shape.lineTo(x + wd - rad, y); shape.quadraticCurveTo(x + wd, y, x + wd, y + rad); shape.lineTo(x + wd, y + ht - rad); shape.quadraticCurveTo(x + wd, y + ht, x + wd - rad, y + ht); shape.lineTo(x + rad, y + ht); shape.quadraticCurveTo(x, y + ht, x, y + ht - rad); shape.lineTo(x, y + rad); shape.quadraticCurveTo(x, y, x + rad, y); };
  rr(-w / 2, -d / 2, w, d, r);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: H, bevelEnabled: false });
  const body = new THREE.Mesh(geo, M('#DCE7F1', { flat: false, rough: .35, metal: .1 }));
  body.rotation.x = -Math.PI / 2; body.position.y = 0; g.add(body);
  // 幕墙竖线
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2;
    const fin = box(.05, H, .18, '#C6D4E2');
    fin.position.set(Math.cos(a) * (w / 2 - .1), H / 2, Math.sin(a) * (d / 2 - .1));
    fin.rotation.y = -a; g.add(fin);
  }
  // 横向楼层线
  for (let f = 1; f < 11; f++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(w / 2 + .02, .045, 6, 40), M('#FFFFFF', { flat: false }));
    ring.rotation.x = Math.PI / 2; ring.position.y = f * 2; ring.scale.z = d / w; g.add(ring);
  }
  // 顶部红色招牌
  const sign = textPlane('福建省(厦门)人工智能产业园', { bg: '#D64545', fg: '#FFFFFF', fs: 54, w: 1024, h: 128, pw: 7.4 });
  sign.position.set(0, H + 1.2, d / 2 - .6); g.add(sign);
  const sign2 = sign.clone(); sign2.rotation.y = Math.PI / 2; sign2.position.set(w / 2 - .6, H + 1.2, 0); g.add(sign2);
  const f06 = textPlane('F06', { bg: '#D64545', fg: '#FFFFFF', fs: 90, w: 256, h: 128, pw: 1.7 });
  f06.position.set(-w / 2 + .5, H * .82, 2.4); f06.rotation.y = Math.PI / 2; g.add(f06);
  // 顶部设备
  const pent = box(2.4, 1, 2, '#C6D4E2'); pent.position.y = H + .5; g.add(pent);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.h = H;
  return g;
}

// ---------- 围墙 / 大门 / 门卫 ----------
function gate() {
  const g = P();
  const p1 = box(.4, 3.4, .4, '#FFFFFF'); p1.position.set(-2.6, 1.7, 0); g.add(p1);
  const p2 = p1.clone(); p2.position.x = 2.6; g.add(p2);
  const beam = box(5.6, .5, .35, C.blue); beam.position.y = 3.2; g.add(beam);
  const sign = textPlane('简会信息 JIANHUI', { bg: '#1B75BC', fg: '#fff', fs: 52, pw: 3.4 });
  sign.position.y = 3.2; sign.position.z = .2; g.add(sign);
  const guard = box(1.6, 2.2, 1.6, '#FFFFFF'); guard.position.set(4.6, 1.1, 0); g.add(guard);
  const roof = box(2, .18, 2, C.blue); roof.position.set(4.6, 2.3, 0); g.add(roof);
  const gwin = box(.9, .7, .05, C.glass); gwin.position.set(4.6, 1.3, .82); g.add(gwin);
  return g;
}
function fenceRun(len = 10) {
  const g = P();
  const n = Math.floor(len / 2);
  for (let i = 0; i <= n; i++) { const p = box(.08, 1, .08, C.gray); p.position.set(-len / 2 + i * 2, .5, 0); g.add(p); }
  for (const y of [.45, .9]) { const bar = box(len, .05, .05, C.gray); bar.position.y = y; g.add(bar); }
  return g;
}

// ---------- 客户展台 ----------
function clientStand(name, sub = '') {
  const g = P();
  const base = cyl(.9, 1.05, .5, '#FFFFFF', 20); base.position.y = .25; g.add(base);
  const top = cyl(.8, .8, .08, '#E8EAED', 20); top.position.y = .54; g.add(top);
  const plate = textPlane(name, { fs: 60, w: 512, h: 128, pw: 1.55, border: '#E5E7EB' });
  plate.position.y = 1.35; g.add(plate);
  if (sub) { const sp = textPlane(sub, { fs: 34, w: 512, h: 96, bg: '#F0FDF4', fg: '#16A34A', pw: 1.3 }); sp.position.y = .95; g.add(sp); }
  const halo = holoRing(1.15, C.cyan); g.add(halo);
  g.userData.tick = (t) => { halo.userData.tick(t); plate.position.y = 1.35 + Math.sin(t * 1.6) * .05; };
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

window.KIT = { C, M, box, cyl, sph, P, place, textPlane, canvasTexture, screenMesh, groundPlane, roadStrip, lightStrip, tree, factory, person, desk, printer, clockFast, agv, forklift, truck, car, inspectorBot, drone, robotArm, conveyor, cnc, press, cmm, shelf, whiteboard, cabinet, plant, coffee, serverRack, dashBoard, aiScreenCvs, holoRing, spotCone, towerF06, gate, fenceRun, clientStand };

})();
