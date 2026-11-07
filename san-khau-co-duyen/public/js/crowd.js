// Khán đài: mỗi tài khoản là đúng một nhân vật. Người được gọi đi lên bằng chính nhân vật đó, xong trở về chỗ cũ.
import { icon, looks } from './art.js';

const FRONT_ROWS = [
  { y: 556, xs: [80, 120, 170, 215, 262, 310, 355, 400] },
  { y: 626, xs: [60, 105, 150, 198, 246, 292, 340, 388] },
  { y: 696, xs: [82, 128, 176, 224, 272, 320, 366, 410] },
];
// Đông người thì xếp thêm hàng sau, nhân vật nhỏ hơn cho đỡ rối.
const BACK_ROWS = [
  { y: 590, xs: [68, 100, 132, 164, 196, 228, 260, 292, 324, 356, 388, 420] },
  { y: 660, xs: [68, 100, 132, 164, 196, 228, 260, 292, 324, 356, 388, 420] },
  { y: 728, xs: [68, 100, 132, 164, 196, 228, 260, 292, 324, 356, 388, 420] },
];
const seats = [
  ...FRONT_ROWS.flatMap((row) => row.xs.map((x) => ({ x, y: row.y, scale: 1 }))),
  ...BACK_ROWS.flatMap((row) => row.xs.map((x) => ({ x, y: row.y, scale: 0.72 }))),
];
const DOOR = { x: 20, y: 752 };
const STAIR = { male: { x: 190, y: 530 }, female: { x: 232, y: 530 } };
const CHAIR = { male: { x: 143, y: 350 }, female: { x: 277, y: 350 } };
const SPEED = 170; // đơn vị px/giây trên khung 450x800
const MAX_ON_SCREEN = 150; // Đo với 200 người vào liên tục; đủ đông mà không làm giật cửa sổ LIVE.
const MIN_SEAT_X = 58;
const MAX_SEAT_X = 416;
const MAX_SEAT_Y = 742;
const PILE_SHIFT = { x: 15, y: 11 };

export class Crowd {
  constructor(root) {
    this.root = root;
    this.people = new Map();
    this.taken = new Array(seats.length).fill(0); // Số người đang ngồi ở mỗi chỗ.
    this.onStage = { male: null, female: null };
    this.seq = 0;
    this.tags = 0;
    this.last = performance.now();
    requestAnimationFrame((t) => this.#frame(t));
  }

  has(id) {
    return this.people.has(id);
  }

  // Lấp hàng trước rồi tới hàng sau; kín hết thì xếp chồng thêm lớp nữa, khán đài càng đông càng vui.
  #pickSeat() {
    const fewest = Math.min(...this.taken);
    const least = this.taken.flatMap((count, index) => (count === fewest ? [index] : []));
    const front = least.filter((index) => seats[index].scale === 1);
    const pool = front.length ? front : least;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Quá mức trần thì người im lặng lâu nhất ra khỏi hình; họ vẫn được tính điểm, tương tác lại sẽ quay vào.
  #makeRoom() {
    if (this.people.size < MAX_ON_SCREEN) return;
    let oldest = null;
    for (const person of this.people.values()) {
      if (person.pinned) continue;
      if (!oldest || person.active < oldest.active) oldest = person;
    }
    if (oldest) this.#remove(oldest);
  }

  // Chỗ ngồi của một người: ai ngồi chồng lên người khác thì lệch đi một chút cho thấy cả hai.
  #home(person) {
    const spot = seats[person.seat];
    return {
      x: Math.min(MAX_SEAT_X, Math.max(MIN_SEAT_X, spot.x + person.shift.x)),
      y: Math.min(MAX_SEAT_Y, spot.y + person.shift.y),
      scale: spot.scale,
    };
  }

  remove(id) {
    const person = this.people.get(id);
    if (person) this.#remove(person);
    for (const side of ['male', 'female']) if (this.onStage[side] === id) this.onStage[side] = null;
  }

  #remove(person) {
    this.taken[person.seat]--;
    person.vacant?.remove();
    person.el.remove();
    this.people.delete(person.id);
  }

  add(viewer, { greet = true } = {}) {
    const existing = this.people.get(viewer.id);
    if (existing) {
      existing.active = ++this.seq;
      if (viewer.avatar && !existing.avatar) this.#setAvatar(existing, viewer.avatar);
      return existing;
    }
    this.#makeRoom();
    const seat = this.#pickSeat();
    const piled = this.taken[seat] > 0;
    const shift = piled ? { x: (Math.random() * 2 - 1) * PILE_SHIFT.x, y: (Math.random() * 2 - 1) * PILE_SHIFT.y } : { x: 0, y: 0 };
    const look = looks(viewer.id);
    const el = document.createElement('div');
    el.className = 'vw walk';
    el.innerHTML = `<div class="vh" style="background-color:${look.skin}"></div><div class="vb" style="background:${look.body}"></div>`;
    this.root.appendChild(el);
    const person = { id: viewer.id, name: viewer.name, demo: viewer.demo === true, el, x: DOOR.x, y: DOOR.y, scale: 1, seat, shift, path: [], look, avatar: '', active: ++this.seq, pinned: false };
    this.taken[seat]++;
    this.people.set(viewer.id, person);
    if (viewer.avatar) this.#setAvatar(person, viewer.avatar);
    person.path = [{ x: 70, y: DOOR.y - 20 }, this.#home(person)];
    this.#draw(person);
    if (greet) this.#nameTag(person);
    return person;
  }

  #setAvatar(person, url) {
    person.avatar = url;
    const head = person.el.querySelector('.vh');
    const image = new Image();
    image.onload = () => {
      head.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
    };
    image.src = url;
  }

  // Tên hiện khoảng hai giây. Vào dồn dập thì chỉ vài người có tên, cửa đã có thẻ "+N bạn mới".
  #nameTag(person) {
    if (this.tags >= 3) return;
    this.tags++;
    const tag = document.createElement('div');
    tag.className = 'tagname';
    tag.textContent = person.name;
    person.el.prepend(tag);
    setTimeout(() => {
      tag.remove();
      this.tags--;
    }, 2000);
  }

  // Một người bất kỳ trên khán đài, để hoa và tim chúc mừng bay ra từ chính khán đài.
  randomSpot() {
    const seated = [...this.people.values()].filter((person) => !person.seatedOnChair && !person.demo);
    if (!seated.length) return { x: 225, y: 620 };
    return this.spot(seated[Math.floor(Math.random() * seated.length)].id);
  }

  // Người mới vào, người đang bình luận được giữ lại khi khán đài đầy.
  touch(id) {
    const person = this.people.get(id);
    if (person) person.active = ++this.seq;
    return person;
  }

  // Vỗ tay / giơ bảng cổ vũ.
  cheer(id) {
    const person = this.touch(id);
    if (!person || person.el.querySelector('.sign')) return;
    const sign = document.createElement('div');
    sign.className = 'sign';
    sign.textContent = 'đẹp đôi';
    person.el.appendChild(sign);
    person.el.classList.remove('hop');
    void person.el.offsetWidth;
    person.el.classList.add('hop');
    setTimeout(() => sign.remove(), 1250);
  }

  clapAll() {
    for (const person of this.people.values()) {
      if (person.path.length) continue;
      if (Math.random() < 0.6) setTimeout(() => {
        person.el.classList.remove('hop');
        void person.el.offsetWidth;
        person.el.classList.add('hop');
      }, Math.random() * 600);
    }
  }

  // Huy hiệu Heo / Cỏ trên đầu người đang xếp hàng.
  setQueued(queues) {
    const male = new Set(queues.male.map((v) => v.id));
    const female = new Set(queues.female.map((v) => v.id));
    for (const person of this.people.values()) {
      const side = male.has(person.id) ? 'pig' : female.has(person.id) ? 'clover' : null;
      person.pinned = Boolean(side) || person.id === this.onStage.male || person.id === this.onStage.female;
      const badge = person.el.querySelector('.badge');
      if (side && badge?.dataset.side !== side) {
        badge?.remove();
        const next = document.createElement('div');
        next.className = 'badge';
        next.dataset.side = side;
        next.innerHTML = icon(side, 15);
        person.el.appendChild(next);
      } else if (!side) badge?.remove();
    }
  }

  // Giữ đúng người trên sân khấu; ai không còn được gọi thì đi về chỗ.
  setStage(pairView, descending) {
    for (const side of ['male', 'female']) {
      const id = pairView && !descending ? pairView[side].id : null;
      if (this.onStage[side] === id) continue;
      if (this.onStage[side]) this.#walkBack(this.onStage[side], side);
      this.onStage[side] = id;
      if (id) this.#walkUp(pairView[side], side);
    }
  }

  #walkUp(viewer, side) {
    const person = this.add(viewer, { greet: false });
    person.pinned = true;
    person.el.querySelector('.badge')?.remove();
    this.#markVacant(person, side);
    const stair = STAIR[side];
    const chair = CHAIR[side];
    person.path = [{ x: stair.x, y: stair.y + 12 }, { x: stair.x + (side === 'male' ? -10 : 10), y: 490 }, { x: chair.x, y: chair.y + 60, scale: 1 }, { x: chair.x, y: chair.y, seated: true }];
    person.el.classList.add('walk');
    person.el.style.opacity = '1';
    person.el.style.display = '';
  }

  #walkBack(id, side) {
    const person = this.people.get(id);
    if (!person) return;
    person.vacant?.remove();
    person.vacant = null;
    person.pinned = false;
    person.el.style.display = '';
    person.el.style.opacity = '1';
    const stair = STAIR[side];
    // Diễn viên không ngồi lại khán đài: diễn xong đi thẳng ra cửa, không tính là người xem.
    const end = person.demo ? { x: DOOR.x, y: DOOR.y, leave: true } : this.#home(person);
    person.path = [{ x: stair.x + (side === 'male' ? -10 : 10), y: 490 }, { x: stair.x, y: stair.y + 12 }, end];
    person.el.classList.add('walk');
  }

  #markVacant(person, side) {
    if (person.demo) return;
    const spot = this.#home(person);
    const mark = document.createElement('div');
    mark.className = 'vacant';
    mark.style.left = `${spot.x}px`;
    mark.style.top = `${spot.y + 14}px`;
    mark.style.borderColor = side === 'male' ? 'rgba(255,143,181,.6)' : 'rgba(94,211,154,.6)';
    this.root.appendChild(mark);
    person.vacant?.remove();
    person.vacant = mark;
  }

  isSeated(side) {
    const person = this.people.get(this.onStage[side]);
    return Boolean(person?.seatedOnChair);
  }

  // Tâm nhân vật, để hiệu ứng quà bay ra đúng từ người gửi.
  spot(id) {
    const person = this.people.get(id);
    if (!person) return { x: DOOR.x + 15, y: DOOR.y };
    return { x: person.x + 15, y: person.y + 10 };
  }

  #draw(person) {
    person.el.style.transform = `translate(${person.x}px, ${person.y}px) scale(${person.scale})`;
    person.el.style.zIndex = String(9 + Math.round(person.y / 40));
  }

  #frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    for (const person of this.people.values()) {
      if (!person.path.length) continue;
      const step = person.path[0];
      const dx = step.x - person.x;
      const dy = step.y - person.y;
      const distance = Math.hypot(dx, dy);
      const move = SPEED * dt;
      if (person.seatedOnChair && !step.seated) {
        person.seatedOnChair = false;
        window.dispatchEvent(new CustomEvent('stage-seat'));
      }
      if (distance <= move) {
        person.x = step.x;
        person.y = step.y;
        if (step.scale) person.scale = step.scale;
        person.path.shift();
        if (step.leave) {
          this.#remove(person);
          continue;
        }
        if (step.seated) {
          // Tới ghế: nhân vật "ngồi xuống", chân dung trên ghế thay chỗ.
          person.seatedOnChair = true;
          person.el.style.opacity = '0';
          window.dispatchEvent(new CustomEvent('stage-seat'));
        }
        if (!person.path.length) person.el.classList.remove('walk');
      } else {
        person.x += (dx / distance) * move;
        person.y += (dy / distance) * move;
      }
      this.#draw(person);
    }
    requestAnimationFrame((next) => this.#frame(next));
  }

  // Dựng lại sau khi trang được tải lại giữa chừng.
  restore(viewers, pairView) {
    for (const viewer of viewers) {
      const person = this.add(viewer, { greet: false });
      Object.assign(person, this.#home(person), { path: [] });
      person.el.classList.remove('walk');
      this.#draw(person);
    }
    for (const side of ['male', 'female']) {
      if (!pairView || pairView.closed) continue;
      const person = this.add(pairView[side], { greet: false });
      this.onStage[side] = person.id;
      person.pinned = true;
      person.seatedOnChair = true;
      person.el.style.opacity = '0';
      Object.assign(person, { x: CHAIR[side].x, y: CHAIR[side].y, scale: 1, path: [] });
      this.#markVacant(person, side);
      this.#draw(person);
    }
  }
}
