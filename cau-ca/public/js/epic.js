// Hiệu ứng riêng khi giật cá hiếm và cá mập. Lúc cá đang giằng co chưa được lộ kết quả, nên phần hồi hộp
// giống nhau dù cá có dính hay không; tới lúc lộ kết quả mới chuyển sang ăn mừng hoặc tiếc nuối.
// 3D: xoáy nước, cột sáng, quầng sáng quanh cá. DOM (#epic): viền màn hình, dải đen, tia sáng, chớp sáng, chữ lớn.
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);

const STYLE = {
  shark: { spiral: '#bfe9ff', glow: '#ff5d7a', won: '🦈 QUÁ ĐỈNH! 🦈' },
  rare: { spiral: '#ffd43b', glow: '#ffe066', won: '🌟 CÁ HIẾM! 🌟' },
};

function spiralTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  g.lineCap = 'round';
  for (let arm = 0; arm < 5; arm++) {
    for (let i = 0; i < 90; i++) {
      const u = i / 90;
      const a = (arm / 5) * Math.PI * 2 + u * Math.PI * 2.6;
      const r = 10 + u * 112;
      g.strokeStyle = `rgba(255, 255, 255, ${0.65 * Math.sin(u * Math.PI)})`;
      g.lineWidth = 2 + u * 9;
      g.beginPath();
      g.arc(0, 0, r, a, a + 0.09);
      g.stroke();
    }
  }
  return new THREE.CanvasTexture(c);
}

function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.65, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const glowy = (extra) => ({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, ...extra });

export function createEpic({ scene, fx, sfx, toScreen }) {
  const root = $('epic');
  const raysEl = $('epic-rays');

  const spiral = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial(glowy({ map: spiralTexture() })));
  spiral.position.y = 0.06;
  spiral.renderOrder = 3;
  spiral.visible = false;
  scene.add(spiral);

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 22, 28, 1, true), new THREE.MeshBasicMaterial(glowy({ map: beamTexture(), side: THREE.DoubleSide })));
  beam.renderOrder = 4;
  beam.visible = false;
  scene.add(beam);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial(glowy({ map: glowTexture(), depthTest: false })));
  glow.renderOrder = 5;
  glow.visible = false;
  scene.add(glow);

  let kind = null;
  let phase = 'off'; // off, struggle, won, lost
  let age = 0;
  let struggleFor = 1;
  let strength = 0;
  let nextSpark = 0;
  let bursts = [];
  const center = new THREE.Vector3();
  const fishPos = new THREE.Vector3();
  const p = new THREE.Vector3();

  // Đặt chữ lớn; tạo lại phần tử để hoạt cảnh đập xuống chạy từ đầu.
  function setTitle(text, cls = '') {
    const old = $('epic-title');
    const el = old.cloneNode(false);
    el.textContent = text;
    el.className = cls;
    old.replaceWith(el);
  }

  function flash() {
    const el = $('epic-flash');
    const again = el.cloneNode(false);
    again.className = 'go';
    el.replaceWith(again);
  }

  return {
    // Độ rung hiện tại, camera cộng thêm vào vị trí.
    shake() {
      if (phase === 'struggle') return 0.02 + 0.07 * Math.min(1, age / struggleFor);
      if (phase === 'won') return 0.75 * Math.exp(-age * 3.4);
      if (phase === 'lost') return 0.28 * Math.exp(-age * 5);
      return 0;
    },
    start({ kind: k, at, text, left }) {
      kind = k;
      phase = 'struggle';
      age = 0;
      struggleFor = Math.max(0.4, left);
      bursts = [];
      nextSpark = 0;
      center.copy(at);
      const style = STYLE[k];
      spiral.material.color.set(style.spiral);
      glow.material.color.set(style.glow);
      beam.material.color.set(style.glow);
      spiral.position.x = at.x;
      spiral.position.z = at.z;
      beam.position.set(at.x, 11, at.z);
      spiral.visible = glow.visible = true;
      beam.visible = k === 'rare';
      root.className = `on ${k}`;
      setTitle(text, 'slam');
      sfx.tension(k, struggleFor);
    },
    reveal(ok, tier) {
      if (phase !== 'struggle') return;
      phase = ok ? 'won' : 'lost';
      age = 0;
      root.className = `on ${kind} ${phase}`;
      if (!ok) {
        setTitle('VUỘT MẤT RỒI!', 'slam');
        return;
      }
      flash();
      setTitle(tier === 'boss' ? '🏆 PHẦN THƯỞNG! 🏆' : STYLE[kind].won, 'slam');
      sfx.boom(kind);
      const water = center.clone().setY(0);
      if (kind === 'shark') {
        // cột nước và sóng xung kích, thêm một đợt nữa cho dư chấn
        fx.geyser(water, 110);
        for (let i = 1; i <= 3; i++) fx.ripple(water.x, water.z, 2.5 + i * 2.2, 1.1 + i * 0.25, 0.8);
        bursts = [{ at: 0.32, run: () => fx.geyser(water, 60) }];
      } else {
        // vàng bắn tung và pháo hoa nổ liên tiếp phía trên cá
        fx.coins(water, 70);
        const sky = (dx, dy, dz) => water.clone().add(new THREE.Vector3(dx, dy, dz));
        bursts = [
          { at: 0.05, run: () => fx.burst(sky(-1.2, 4.2, 0.5), '#ffd43b') },
          { at: 0.35, run: () => fx.burst(sky(1.6, 5, -0.6), '#ff8fb1') },
          { at: 0.65, run: () => fx.burst(sky(0, 5.8, 0.8), '#8ce99a') },
          { at: 0.95, run: () => fx.burst(sky(-1.8, 5.4, -0.4), '#74c0fc') },
        ];
      }
    },
    end() {
      if (phase === 'off') return;
      phase = 'off';
      root.className = '';
    },
    update(t, dt, fish) {
      const active = phase !== 'off';
      strength += ((phase === 'lost' ? 0.25 : active ? 1 : 0) - strength) * (1 - Math.exp(-dt * 7));
      if (!active && strength < 0.01) {
        spiral.visible = glow.visible = beam.visible = false;
        strength = 0;
        return;
      }
      age += dt;
      if (fish) fishPos.copy(fish.position);

      // Xoáy nước rộng dần theo độ căng thẳng, thắng thì tan ra thành vòng lớn.
      const grow = phase === 'struggle' ? 1 + 1.2 * Math.min(1, age / struggleFor) : 2.2 + (phase === 'won' ? age * 1.4 : 0);
      spiral.scale.setScalar(grow * (kind === 'shark' ? 1.2 : 1));
      spiral.rotation.y -= dt * (phase === 'struggle' ? 3 + 5 * Math.min(1, age / struggleFor) : 2);
      spiral.material.opacity = strength * (phase === 'won' ? Math.max(0, 0.42 - age * 0.45) : 0.42);

      // Quầng sáng đi theo cá, đập theo nhịp; không làm lộ kết quả vì lúc giằng co cá nào cũng sáng như nhau.
      glow.position.copy(fishPos);
      const big = fish ? fish.userData.length * 1.5 : 3;
      const pulse = 0.82 + Math.sin(t * 9) * 0.18;
      glow.scale.setScalar(big * pulse);
      // nhẹ tay: quầng này cộng sáng lên cả khung hình, ban ngày mà đậm là bạc màu hết
      glow.material.opacity = strength * (phase === 'lost' ? 0.08 : phase === 'won' ? 0.42 : 0.26) * pulse;

      // Cột sáng cá hiếm: mảnh lúc giằng co, bùng lên khi thắng rồi nhạt dần, xổng cá thì tắt.
      if (beam.visible) {
        const wide = phase === 'won' ? 0.45 + Math.min(1, age * 3) * 0.5 : 0.22 + 0.2 * Math.min(1, age / struggleFor);
        beam.scale.set(wide, 1, wide);
        beam.rotation.y += dt * 0.8;
        const fade = phase === 'won' ? Math.max(0.08, 0.38 - age * 0.2) : phase === 'lost' ? Math.max(0, 0.16 - age) : 0.16;
        beam.material.opacity = strength * fade;
      }

      // Tia sáng trên màn hình đặt ngay tại con cá.
      const s = toScreen(fishPos);
      raysEl.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;

      for (let i = bursts.length - 1; i >= 0; i--) {
        if (age < bursts[i].at) continue;
        bursts[i].run();
        bursts.splice(i, 1);
      }

      if (!active) return;
      if (t >= nextSpark) {
        nextSpark = t + 0.07;
        if (phase === 'struggle') {
          // tia lấp lánh hoặc bọt nước bốc lên quanh xoáy
          const a = Math.random() * Math.PI * 2;
          p.set(center.x + Math.cos(a) * grow, 0.1, center.z + Math.sin(a) * grow);
          fx.sparkle(p, 2, kind === 'rare' ? '#ffe066' : '#d0f0ff');
        } else if (phase === 'won' && age < 1.1) {
          // vệt lấp lánh theo cá bay lên
          fx.sparkle(fishPos, 3, kind === 'rare' ? '#ffe066' : '#ffffff');
        }
      }
    },
  };
}
