// Phòng tân hôn (động phòng): một góc dựng riêng, đặt xa sảnh cưới; camera cắt sang đây khi cặp đôi vào phòng.
// Tường hồng hoa đào, biển "PHÒNG TÂN HÔN", băng rôn "ĐỘNG PHÒNG HOA CHÚC", đèn lồng, hai bên cửa là tường hoa hồng.
// Cửa song gỗ dán giấy: đèn trong phòng sáng thì bóng cô dâu chú rể in lên giấy (vẽ bằng canvas 2D, diễn một vòng:
// ngồi trò chuyện, xích lại gần, hôn, ôm, tắt đèn). Có người trong phòng thì treo biển "XIN ĐỪNG LÀM PHIỀN".
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Bouquets, canvasTexture } from './world.js';

// Góc phòng tân hôn nằm ngoài sảnh (sảnh rộng tới x = ±14,6), cửa nhìn về phía +z.
export const CH = new THREE.Vector3(60, 0, 0);
const DOOR = { w: 1.8, h: 2.3, panel: 0.5 };
const PAPER = { w: DOOR.w, h: DOOR.h - DOOR.panel - 0.08, y: DOOR.panel + 0.04 };
const PX = 300; // điểm ảnh canvas trên một mét giấy dán cửa
const FONT = '"Be Vietnam Pro", "Segoe UI", sans-serif';
const HY = '"Microsoft YaHei", "SimHei", serif';

const MAT = {
  frame: new THREE.MeshStandardMaterial({ color: '#5b2614', roughness: 0.42, metalness: 0.05 }),
  lattice: new THREE.MeshStandardMaterial({ color: '#4a1d0e', roughness: 0.5 }),
  gold: new THREE.MeshStandardMaterial({ color: '#e8c36a', metalness: 1, roughness: 0.25, envMapIntensity: 1.5 }),
  floor: new THREE.MeshStandardMaterial({ color: '#f2d6db', roughness: 0.2, metalness: 0.02, envMapIntensity: 1.2 }),
  rug: new THREE.MeshStandardMaterial({ color: '#c2184f', roughness: 0.95 }),
  lantern: new THREE.MeshStandardMaterial({ color: '#e0142f', emissive: '#ff3030', emissiveIntensity: 0.7, roughness: 0.5 }),
  string: new THREE.MeshStandardMaterial({ color: '#3a1a0c', roughness: 0.8 }),
};

// ---------------------------------------------------------------- Hình vẽ canvas

function blossom(g, x, y, r, color, rot = Math.random() * 6) {
  g.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const a = rot + (i / 5) * Math.PI * 2;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.52, r * 0.4, a, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#fff1a6';
  g.beginPath();
  g.arc(x, y, r * 0.2, 0, Math.PI * 2);
  g.fill();
}

// Tường hồng có cành hoa đào mọc từ bốn góc vào (giữa tường là cửa và biển nên để trống).
const WALL_TEX = canvasTexture(1024, 600, (g, w, h) => {
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#f39ab6');
  bg.addColorStop(0.55, '#f8c3d2');
  bg.addColorStop(1, '#f1a9bf');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.08})`;
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, 8 + Math.random() * 38, 0, Math.PI * 2);
    g.fill();
  }
  const tips = [];
  g.strokeStyle = 'rgba(105,45,45,0.6)';
  g.lineCap = 'round';
  const branch = (x, y, a, len, width, depth) => {
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo((x + x2) / 2 + Math.sin(a) * len * 0.18, (y + y2) / 2 - Math.cos(a) * len * 0.18, x2, y2);
    g.stroke();
    tips.push([x2, y2, depth]);
    if (depth > 0) {
      branch(x2, y2, a - 0.55 + Math.random() * 0.3, len * 0.7, width * 0.62, depth - 1);
      branch(x2, y2, a + 0.3 + Math.random() * 0.3, len * 0.62, width * 0.58, depth - 1);
    }
  };
  branch(-10, 110, 0.22, 150, 10, 3);
  branch(w + 10, 80, Math.PI - 0.22, 150, 10, 3);
  branch(-10, 480, -0.35, 130, 9, 3);
  branch(w + 10, 500, Math.PI + 0.35, 130, 9, 3);
  const colors = ['#ffffff', '#ffe3ec', '#ffc2d4', '#ff9ebb'];
  for (const [x, y, depth] of tips) {
    for (let k = 0; k < (depth ? 2 : 5); k++) blossom(g, x + (Math.random() - 0.5) * 50, y + (Math.random() - 0.5) * 40, 9 + Math.random() * 9, colors[Math.floor(Math.random() * colors.length)]);
  }
});

function signTexture(w, h, draw) {
  const t = canvasTexture(w, h, draw);
  t.anisotropy = 8;
  return t;
}

function fitText(g, text, maxW, size, weight = 800, font = FONT) {
  do {
    g.font = `${weight} ${size}px ${font}`;
    size -= 4;
  } while (g.measureText(text).width > maxW && size > 20);
}

const ROOM_SIGN = signTexture(1024, 256, (g, w, h) => {
  g.fillStyle = '#f6e7cf';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#7a1022';
  g.lineWidth = 16;
  g.strokeRect(8, 8, w - 16, h - 16);
  g.strokeStyle = '#d9a43c';
  g.lineWidth = 5;
  g.strokeRect(30, 30, w - 60, h - 60);
  g.fillStyle = '#8a1230';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, 'PHÒNG TÂN HÔN', w - 120, 132);
  g.fillText('PHÒNG TÂN HÔN', w / 2, h / 2 + 6);
});

const DND_SIGN = signTexture(1024, 256, (g, w, h) => {
  g.fillStyle = '#d3142e';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#f6d36b';
  g.lineWidth = 14;
  g.strokeRect(12, 12, w - 24, h - 24);
  g.fillStyle = '#fff4c2';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, 'XIN ĐỪNG LÀM PHIỀN', w - 90, 104, 900);
  g.fillText('XIN ĐỪNG LÀM PHIỀN', w / 2, h / 2 + 5);
});

const BANNER = signTexture(2048, 256, (g, w, h) => {
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#b10f2a');
  bg.addColorStop(0.5, '#d6183a');
  bg.addColorStop(1, '#a00d26');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#f2c14e';
  g.lineWidth = 8;
  g.strokeRect(14, 14, w - 28, h - 28);
  g.fillStyle = '#ffd86b';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold 170px ${HY}`;
  g.fillText('囍', 150, h / 2 + 8);
  g.fillText('囍', w - 150, h / 2 + 8);
  fitText(g, 'ĐỘNG PHÒNG HOA CHÚC', w - 520, 150, 900);
  g.fillText('ĐỘNG PHÒNG HOA CHÚC', w / 2, h / 2 + 6);
});

// Ánh đèn hồng trong phòng, thấy khi cửa mở.
const INSIDE_TEX = canvasTexture(256, 320, (g, w, h) => {
  const r = g.createRadialGradient(w / 2, h * 0.55, 10, w / 2, h * 0.55, h * 0.7);
  r.addColorStop(0, '#fff3f7');
  r.addColorStop(0.35, '#ffc2d6');
  r.addColorStop(1, '#f2668f');
  g.fillStyle = r;
  g.fillRect(0, 0, w, h);
});

function emojiTexture(text) {
  return canvasTexture(128, 128, (g) => {
    g.font = '96px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 64, 70);
  });
}
const DIZZY = [emojiTexture('⭐'), emojiTexture('🐦'), emojiTexture('💫')];

// ---------------------------------------------------------------- Bóng người in lên giấy

// Mỗi dòng: thời điểm (giây), hông chú rể / cô dâu (px), nghiêng người, cúi đầu, tay (vai, khuỷu) mỗi người, đèn.
const KEYS = [
  [0, 150, 390, 0, 0, 0, 0, 0.3, 0.9, 0.3, 0.9, 1],
  [2.6, 150, 390, 0, 0, 0, 0, 0.3, 0.9, 0.3, 0.9, 1],
  [3.8, 192, 362, 0.05, 0, 0.05, 0.32, 0.3, 0.9, 0.3, 0.9, 1],
  [4.8, 192, 362, 0.08, 0.02, 0.05, 0.3, 1.35, 0.45, 0.3, 0.9, 1],
  [5.8, 192, 362, 0.15, 0.15, 0.14, 0.12, 1.5, 0.4, 0.55, 0.9, 1],
  [7.4, 192, 362, 0.15, 0.15, 0.14, 0.12, 1.5, 0.4, 0.55, 0.9, 1],
  [8.4, 208, 346, 0.1, 0.1, 0.05, 0.05, 1.75, -0.1, 1.75, -0.1, 1],
  [9.6, 208, 346, 0.1, 0.1, 0.05, 0.05, 1.75, -0.1, 1.75, -0.1, 1],
  [10.0, 208, 346, 0.1, 0.1, 0.05, 0.05, 1.75, -0.1, 1.75, -0.1, 0.06],
  [12.0, 208, 346, 0.1, 0.1, 0.05, 0.05, 1.75, -0.1, 1.75, -0.1, 0.06],
  [12.5, 150, 390, 0, 0, 0, 0, 0.3, 0.9, 0.3, 0.9, 0.06],
  [13.0, 150, 390, 0, 0, 0, 0, 0.3, 0.9, 0.3, 0.9, 1],
  [14.0, 150, 390, 0, 0, 0, 0, 0.3, 0.9, 0.3, 0.9, 1],
];
const LOOP = KEYS.at(-1)[0];
const BEATS = [[3.8, 'shy'], [5.8, 'kiss'], [10.0, 'dark']];
const smooth = (x) => x * x * (3 - 2 * x);

function poseAt(t) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= t) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const k = smooth(Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))));
  const v = a.map((x, j) => x + (b[j] - x) * k);
  const p = { gx: v[1], bx: v[2], gl: v[3], bl: v[4], gh: v[5], bh: v[6], ga: [v[7], v[8]], ba: [v[9], v[10]], light: v[11] };
  // Lúc đầu thay nhau nói chuyện (gật gù), lúc ôm thì đung đưa.
  if (t < 1.3) p.gh += Math.sin(t * 9) * 0.06;
  else if (t < 2.6) p.bh += Math.sin(t * 9) * 0.06;
  if (t > 8.4 && t < 10) {
    const s = Math.sin((t - 8.4) * 3.2) * 0.05;
    p.gl += s;
    p.bl -= s;
  }
  return p;
}

// Một người ngồi nghiêng, mặt quay về +x (cô dâu được lật lại). Gốc tọa độ ở hông.
function figure(g, x, y, dir, lean, tilt, [a1, a2], bride) {
  g.save();
  g.translate(x, y);
  g.scale(dir, 1);
  // Đùi và cẳng chân (ngồi mép giường).
  g.lineCap = 'round';
  g.lineWidth = 54;
  g.beginPath();
  g.moveTo(0, -12);
  g.lineTo(100, -8);
  g.lineTo(108, 120);
  g.stroke();
  g.rotate(lean);
  if (bride) {
    g.beginPath();
    g.moveTo(-28, -190);
    g.quadraticCurveTo(-58, -90, -62, 4);
    g.lineTo(58, 4);
    g.quadraticCurveTo(52, -90, 28, -190);
    g.closePath();
    g.fill();
  } else {
    g.beginPath();
    g.ellipse(0, -98, 46, 104, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillRect(-13, -222, 26, 40);
  // Đầu, quay quanh cổ.
  g.save();
  g.translate(2, -212);
  g.rotate(tilt);
  g.beginPath();
  g.arc(6, -50, 48, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(50, -58);
  g.lineTo(66, -40);
  g.lineTo(50, -34);
  g.fill();
  if (bride) {
    // Búi tóc, tóc dài buông sau lưng và cành hoa cài tóc.
    g.beginPath();
    g.arc(-42, -82, 26, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(-40, -70);
    g.quadraticCurveTo(-74, -10, -50, 60);
    g.lineTo(-24, 50);
    g.quadraticCurveTo(-40, -10, -18, -60);
    g.fill();
    g.beginPath();
    g.arc(-22, -104, 9, 0, Math.PI * 2);
    g.arc(-6, -108, 7, 0, Math.PI * 2);
    g.fill();
  } else {
    g.beginPath();
    g.ellipse(-2, -88, 50, 22, -0.15, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(30, -100);
    g.quadraticCurveTo(62, -96, 54, -74);
    g.lineTo(30, -80);
    g.fill();
  }
  g.restore();
  // Tay: vai -> khuỷu -> bàn tay.
  const sx = 6;
  const sy = -184;
  const ex = sx + Math.sin(a1) * 95;
  const ey = sy + Math.cos(a1) * 95;
  const hx = ex + Math.sin(a1 + a2) * 88;
  const hy = ey + Math.cos(a1 + a2) * 88;
  g.lineWidth = 30;
  g.beginPath();
  g.moveTo(sx, sy);
  g.lineTo(ex, ey);
  g.lineTo(hx, hy);
  g.stroke();
  g.restore();
}

// ---------------------------------------------------------------- Phòng tân hôn

export class Chamber {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.copy(CH);
    scene.add(this.group);
    this.doorK = 0;
    this.doorTarget = 0;
    this.occupied = false;
    this.light = 0.4;
    this.showT = 0;
    this.drawAt = 0;
    this.active = false;
    this.dizzies = [];
    this.onBeat = () => {};
    this.build();
    this.drawPaper();
  }

  at(x, y, z) {
    return new THREE.Vector3(CH.x + x, CH.y + y, CH.z + z);
  }

  build() {
    const G = this.group;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 20), MAT.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 8);
    floor.receiveShadow = true;
    G.add(floor);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), MAT.rug);
    rug.rotation.x = -Math.PI / 2;
    rug.scale.set(1.3, 0.75, 1);
    rug.position.set(0, 0.004, 1.5);
    G.add(rug);

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 7), new THREE.MeshStandardMaterial({ map: WALL_TEX, roughness: 0.85 }));
    wall.position.set(0, 3.5, 0);
    G.add(wall);
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.w, DOOR.h), new THREE.MeshBasicMaterial({ map: INSIDE_TEX, toneMapped: false }));
    inside.position.set(0, DOOR.h / 2, 0.01);
    G.add(inside);

    // Khung cửa gỗ, bậc cửa, mái gỗ nhỏ có viền vàng.
    const frame = [];
    const box = (list, w, h, d, x, y, z) => list.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
    for (const s of [-1, 1]) box(frame, 0.16, DOOR.h + 0.18, 0.18, s * (DOOR.w / 2 + 0.08), (DOOR.h + 0.18) / 2, 0.07);
    box(frame, DOOR.w + 0.5, 0.18, 0.2, 0, DOOR.h + 0.09, 0.08);
    box(frame, DOOR.w + 0.7, 0.08, 0.3, 0, DOOR.h + 0.22, 0.1);
    box(frame, DOOR.w + 0.3, 0.05, 0.3, 0, 0.025, 0.12);
    G.add(new THREE.Mesh(mergeGeometries(frame), MAT.frame));
    const trim = [];
    box(trim, DOOR.w + 0.72, 0.025, 0.31, 0, DOOR.h + 0.27, 0.1);
    for (const s of [-1, 1]) box(trim, 0.02, DOOR.h + 0.1, 0.02, s * (DOOR.w / 2 + 0.165), (DOOR.h + 0.1) / 2, 0.165);
    G.add(new THREE.Mesh(mergeGeometries(trim), MAT.gold));

    // Hai cánh cửa song gỗ dán giấy, chung một tấm giấy vẽ bóng người (mỗi cánh lấy một nửa).
    this.paperCanvas = document.createElement('canvas');
    this.paperCanvas.width = Math.round(PAPER.w * PX);
    this.paperCanvas.height = Math.round(PAPER.h * PX);
    this.paperTex = new THREE.CanvasTexture(this.paperCanvas);
    this.paperTex.colorSpace = THREE.SRGBColorSpace;
    const paperMat = new THREE.MeshBasicMaterial({ map: this.paperTex, toneMapped: false });
    this.leaves = [1, -1].map((sign) => {
      const leaf = this.buildLeaf(sign, paperMat);
      leaf.position.set(-sign * DOOR.w / 2, 0, 0.05);
      G.add(leaf);
      return leaf;
    });

    // Biển "PHÒNG TÂN HÔN" trên cửa, băng rôn đỏ trên cao.
    const roomSign = new THREE.Group();
    roomSign.position.set(0, DOOR.h + 0.54, 0.12);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.5, 0.06), MAT.frame);
    back.position.z = -0.04;
    roomSign.add(back);
    roomSign.add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: ROOM_SIGN, color: '#e8e8e8', toneMapped: false })));
    G.add(roomSign);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.45), new THREE.MeshStandardMaterial({ map: BANNER, roughness: 0.7, side: THREE.DoubleSide }));
    banner.position.set(0, DOOR.h + 1.3, 0.06);
    G.add(banner);
    for (const s of [-1, 1]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 10), MAT.gold);
      rod.position.set(s * 1.82, DOOR.h + 1.3, 0.07);
      G.add(rod);
    }

    // Biển "XIN ĐỪNG LÀM PHIỀN" treo vào đinh trên cửa, đung đưa nhẹ.
    this.dnd = new THREE.Group();
    this.dnd.position.set(0, DOOR.h + 0.12, 0.2);
    const dndBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.325), new THREE.MeshBasicMaterial({ map: DND_SIGN, toneMapped: false }));
    dndBoard.position.y = -0.3;
    this.dnd.add(dndBoard);
    for (const s of [-1, 1]) {
      const dx = 0.5;
      const dy = 0.3 - 0.325 / 2;
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, Math.hypot(dx, dy), 5), MAT.string);
      str.position.set((s * dx) / 2, -dy / 2, -0.005);
      str.rotation.z = s * Math.atan2(dx, dy);
      this.dnd.add(str);
    }
    this.dnd.add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), MAT.gold));
    this.dnd.scale.setScalar(0.001);
    this.dndK = 0;
    G.add(this.dnd);

    // Đèn lồng đỏ hai bên biển.
    this.lanterns = [-1.45, 1.45].map((x) => {
      const l = new THREE.Group();
      l.position.set(x, DOOR.h + 0.95, 0.4);
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), MAT.lantern);
      body.scale.set(0.2, 0.24, 0.2);
      body.position.y = -0.38;
      l.add(body);
      for (const y of [-0.15, -0.61]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 14), MAT.gold);
        cap.position.y = y;
        l.add(cap);
      }
      const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.035, 0.22, 8), MAT.lantern);
      tassel.position.y = -0.74;
      l.add(tassel);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.15, 5), MAT.string);
      cord.position.y = -0.06;
      l.add(cord);
      G.add(l);
      return l;
    });

    // Tường hoa hồng hai bên cửa.
    const roses = new Bouquets();
    for (const s of [-1, 1]) {
      for (const x of [1.3, 1.72, 2.14, 2.56]) {
        for (let y = 0.25; y < 2.8; y += 0.4) {
          if (x > 2.3 && y > 2.2) continue;
          roses.ball(new THREE.Vector3(s * (x + (Math.random() - 0.5) * 0.12), y + (Math.random() - 0.5) * 0.1, 0.22 + Math.random() * 0.12), 0.27, 15);
        }
      }
    }
    roses.build(G);

    // Hai giá đỡ biển tên cô dâu, chú rể trước tường hoa.
    this.boards = {};
    for (const [role, s] of [['groom', -1], ['bride', 1]]) {
      const easel = new THREE.Group();
      easel.position.set(s * 1.85, 0, 1.25);
      easel.rotation.y = -s * 0.25;
      for (const [lx, lz, rx] of [[-0.28, 0, 0.08], [0.28, 0, 0.08], [0, -0.32, -0.25]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 1.6, 6), MAT.frame);
        leg.position.set(lx, 0.78, lz);
        leg.rotation.x = rx;
        leg.rotation.z = -lx * 0.25;
        easel.add(leg);
      }
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 384;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.54), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
      board.position.set(0, 1.3, 0.09);
      board.rotation.x = -0.08;
      easel.add(board);
      const backing = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.6, 0.03), MAT.gold);
      backing.position.set(0, 1.3, 0.07);
      backing.rotation.x = -0.08;
      easel.add(backing);
      G.add(easel);
      this.boards[role] = { canvas, tex };
    }
    this.setNames('', '');

    // Đèn sân khấu rọi vào cửa; đèn ấm hắt ra từ giấy cửa (cửa mở thì thành ánh hồng).
    const spot = new THREE.SpotLight('#ffe9dc', 80, 26, 0.5, 0.7, 1.3);
    spot.position.set(0.5, 6.5, 8);
    spot.target.position.set(0, 1.3, 0);
    G.add(spot, spot.target);
    this.glow = new THREE.PointLight('#ffb35c', 0, 6, 1.6);
    this.glow.position.set(0, 1.3, 0.7);
    G.add(this.glow);
  }

  buildLeaf(sign, paperMat) {
    const leaf = new THREE.Group();
    const lw = DOOR.w / 2;
    const cx = (sign * lw) / 2;
    const pg = new THREE.PlaneGeometry(lw, PAPER.h);
    const uv = pg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (sign > 0 ? 0 : 0.5) + uv.getX(i) * 0.5);
    const paper = new THREE.Mesh(pg, paperMat);
    paper.position.set(cx, PAPER.y + PAPER.h / 2, -0.004);
    leaf.add(paper);
    const parts = [];
    const bar = (x, y, w, h, d = 0.05, z = 0) => parts.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
    const t = 0.06;
    bar(cx, DOOR.h - t / 2, lw, t, 0.07);
    bar(cx, DOOR.panel / 2, lw, DOOR.panel, 0.06);
    bar(cx, PAPER.y - 0.02, lw, 0.05, 0.07);
    bar((sign * t) / 2, DOOR.h / 2, t, DOOR.h, 0.07);
    bar(sign * (lw - t / 2), DOOR.h / 2, t, DOOR.h, 0.07);
    const inner = lw - 2 * t;
    for (let i = 1; i <= 3; i++) bar(sign * (t + (inner * i) / 4), PAPER.y + PAPER.h / 2, 0.022, PAPER.h, 0.035, 0.01);
    for (let j = 1; j <= 6; j++) bar(cx, PAPER.y + (PAPER.h * j) / 7, inner, 0.022, 0.035, 0.01);
    // Ô gỗ nổi trên phần đặc dưới chân cửa.
    bar(cx, DOOR.panel / 2, lw - 0.2, 0.025, 0.03, 0.035);
    bar(cx, DOOR.panel / 2 - 0.16, lw - 0.2, 0.025, 0.03, 0.035);
    bar(cx, DOOR.panel / 2 + 0.16, lw - 0.2, 0.025, 0.03, 0.035);
    leaf.add(new THREE.Mesh(mergeGeometries(parts), MAT.lattice));
    const studs = [];
    for (const y of [0.17, 0.33]) for (const k of [0.25, 0.5, 0.75]) studs.push(new THREE.SphereGeometry(0.018, 8, 6).translate(sign * lw * k, y, 0.04));
    const ring = new THREE.TorusGeometry(0.045, 0.008, 6, 18).translate(sign * (lw - 0.1), 1.15, 0.045);
    leaf.add(new THREE.Mesh(mergeGeometries([...studs, ring]), MAT.gold));
    leaf.userData.sign = sign;
    return leaf;
  }

  setNames(groom, bride) {
    const key = `${groom ?? ''}|${bride ?? ''}`;
    if (key === this.namesKey) return;
    this.namesKey = key;
    for (const [role, label, name] of [['groom', '🤵 CHÚ RỂ', groom], ['bride', '👰 CÔ DÂU', bride]]) {
      const { canvas, tex } = this.boards[role];
      const g = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      g.fillStyle = '#fff6ef';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#d9a43c';
      g.lineWidth = 10;
      g.strokeRect(14, 14, w - 28, h - 28);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#c8102e';
      g.font = `800 58px ${FONT}`;
      g.fillText(label, w / 2, 92);
      g.fillStyle = '#e8344e';
      g.font = `bold 90px ${HY}`;
      g.fillText('囍', w / 2, 300);
      g.fillStyle = '#3a0a18';
      const text = name || '…';
      fitText(g, text, w - 70, 66, 800);
      g.fillText(text, w / 2, 190);
      tex.needsUpdate = true;
    }
  }

  // Mở / đóng cửa. instant: đặt ngay, không có chuyển động.
  setDoor(open, instant = false) {
    this.doorTarget = open ? 1 : 0;
    if (instant) this.doorK = this.doorTarget;
  }

  // Có người trong phòng: đèn sáng, bóng người, biển "Xin đừng làm phiền". Vòng diễn bóng bắt đầu lại từ đầu.
  setOccupied(on, instant = false) {
    if (on && !this.occupied) {
      this.showT = 0;
      this.lastT = 0;
      this.nextBeat = 0;
    }
    this.occupied = on;
    if (instant) {
      this.dndK = on ? 1 : 0;
      this.light = on ? 1 : 0.4;
    }
    this.drawAt = 0;
  }

  // Sao và chim bay vòng quanh đầu người bị đá văng nằm choáng.
  dizzy(char) {
    const sprites = [0, 1, 0, 2, 1].map((i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: DIZZY[i], transparent: true, depthWrite: false }));
      s.scale.setScalar(0.2);
      this.scene.add(s);
      return s;
    });
    this.dizzies.push({ char, sprites, t: Math.random() * 6 });
  }

  clearDizzy(char) {
    this.dizzies = this.dizzies.filter((d) => {
      if (char && d.char !== char) return true;
      d.sprites.forEach((s) => {
        this.scene.remove(s);
        s.material.dispose();
      });
      return false;
    });
  }

  drawPaper(pose) {
    const g = this.paperCanvas.getContext('2d');
    const w = this.paperCanvas.width;
    const h = this.paperCanvas.height;
    const bg = g.createRadialGradient(w / 2, h * 0.6, 20, w / 2, h * 0.6, w * 0.8);
    bg.addColorStop(0, '#fff3c9');
    bg.addColorStop(0.45, '#ffc76a');
    bg.addColorStop(1, '#e8892c');
    g.filter = 'none';
    g.globalAlpha = 1;
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    if (pose) {
      g.filter = 'blur(3px)';
      g.fillStyle = g.strokeStyle = '#3a1608';
      g.globalAlpha = 0.9;
      g.fillRect(40, h - 28, w - 80, 40);
      figure(g, pose.gx, h - 34, 1, pose.gl, pose.gh, pose.ga, false);
      figure(g, pose.bx, h - 34, -1, pose.bl, pose.bh, pose.ba, true);
      g.filter = 'none';
    }
    // Chữ Hỷ đỏ dán trên giấy hai cánh.
    g.globalAlpha = 0.78;
    g.fillStyle = '#c8102e';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold 130px ${HY}`;
    g.fillText('囍', w * 0.25, h * 0.3);
    g.fillText('囍', w * 0.75, h * 0.3);
    g.globalAlpha = 1;
    const dark = 1 - this.light;
    if (dark > 0.01) {
      g.fillStyle = `rgba(36,12,6,${dark * 0.9})`;
      g.fillRect(0, 0, w, h);
    }
    this.paperTex.needsUpdate = true;
  }

  update(dt, time) {
    // Cửa mở / đóng.
    const dk = this.doorTarget - this.doorK;
    if (Math.abs(dk) > 0.001) this.doorK += Math.sign(dk) * Math.min(Math.abs(dk), dt * 2.6);
    const open = smooth(this.doorK);
    for (const leaf of this.leaves) leaf.rotation.y = leaf.userData.sign * open * 1.5;

    // Biển treo bật ra khi có người trong phòng và cửa đóng.
    const dndTarget = this.occupied && this.doorK < 0.05 ? 1 : 0;
    this.dndK += (dndTarget - this.dndK) * Math.min(1, dt * 6);
    this.dnd.scale.setScalar(Math.max(0.001, this.dndK * (1 + 0.12 * Math.sin(this.dndK * Math.PI))));
    this.dnd.rotation.z = Math.sin(time * 1.9) * 0.05;
    this.lanterns.forEach((l, i) => (l.rotation.z = Math.sin(time * 1.3 + i * 2) * 0.06));

    // Vòng diễn bóng người.
    let pose = null;
    let lightTarget = 0.4;
    if (this.occupied && this.doorK < 0.05) {
      this.showT += dt;
      const t = this.showT % LOOP;
      if (t < this.lastT) this.nextBeat = 0;
      this.lastT = t;
      while (this.nextBeat < BEATS.length && t >= BEATS[this.nextBeat][0]) this.onBeat(BEATS[this.nextBeat++][1]);
      pose = poseAt(t);
      lightTarget = pose.light;
    }
    this.light += (lightTarget - this.light) * Math.min(1, dt * 8);
    const flicker = 1 + Math.sin(time * 13) * 0.03 + Math.sin(time * 7.3) * 0.02;
    this.glow.color.set(this.doorK > 0.05 ? '#ff7fa8' : '#ffb35c');
    this.glow.intensity = this.doorK > 0.05 ? 9 * open : 5 * this.light * flicker;

    if (this.active && time >= this.drawAt) {
      this.drawAt = time + 1 / 30;
      this.drawPaper(pose);
    }

    const tmp = new THREE.Vector3();
    for (const d of this.dizzies) {
      d.t += dt;
      tmp.copy(d.char.headTop());
      d.sprites.forEach((s, i) => {
        const a = d.t * 3.2 + (i / d.sprites.length) * Math.PI * 2;
        s.position.set(tmp.x + Math.cos(a) * 0.3, tmp.y + 0.12 + Math.sin(a * 2) * 0.03, tmp.z + Math.sin(a) * 0.3);
      });
    }
  }
}
