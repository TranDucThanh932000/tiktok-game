// Shared by the server (trip timing) and the game screen (drawing), so both agree on where everything is.
export const W = 1080;
export const H = 1920;

export const KITCHEN = { x: 250, y: 610 };
export const ENTRANCE = { x: 540, y: 1600 };
export const AISLE_X = 540;
export const STAGE_FRONT = { x: 540, y: 640 };

const COLS = [270, 810];
const ROWS = [790, 970, 1150, 1330];

// Four seats per table: two behind it and one at each end, all facing the camera so every face stays visible.
export const TABLES = ROWS.flatMap((y, r) =>
  COLS.map((x, c) => ({
    id: r * 2 + c + 1,
    x,
    y,
    seats: [
      { side: 'back', x: x - 70, y: y - 30, item: { x: x - 72, y: y - 20 } },
      { side: 'back', x: x + 70, y: y - 30, item: { x: x + 72, y: y - 20 } },
      { side: 'left', x: x - 195, y: y + 4, item: { x: x - 112, y: y + 20 } },
      { side: 'right', x: x + 195, y: y + 4, item: { x: x + 112, y: y + 20 } },
    ],
  })),
);

export const SEAT_COUNT = TABLES.length * 4;
export const table = (id) => TABLES.find((t) => t.id === id);
export const seatOf = (tableId, index) => table(tableId)?.seats[index];

// Where Tí stands to serve a table: in front of it.
export const servePoint = (t) => ({ x: t.x, y: t.y + 92 });

export function runnerPath(tableId, detourTableId) {
  const t = table(tableId);
  const points = [KITCHEN, { x: AISLE_X, y: 650 }];
  const detour = detourTableId && table(detourTableId);
  if (detour) points.push({ x: AISLE_X, y: detour.y + 92 }, servePoint(detour), { x: AISLE_X, y: detour.y + 92 });
  points.push({ x: AISLE_X, y: t.y + 92 }, servePoint(t));
  return points;
}

export function walkInPath(tableId, index) {
  const t = table(tableId);
  const s = t.seats[index];
  if (s.side === 'back') return [ENTRANCE, { x: AISLE_X, y: t.y + 92 }, { x: AISLE_X, y: s.y }, { x: s.x, y: s.y }];
  return [ENTRANCE, { x: AISLE_X, y: t.y + 92 }, { x: s.x, y: t.y + 92 }, { x: s.x, y: s.y }];
}

// Khách gõ "về": đi từ ghế ra đầu hẻm (WALK_OUT_SPEED px/giây), bước sang xe đậu cách lối vào HOME_BIKE_GAP rồi lên xe.
// Máy chủ dùng cùng mốc này để Cô Ba, Chú Tư nói đúng lúc công an giữ xe.
export const WALK_OUT_SPEED = 330;
export const HOME_BIKE_GAP = 150;
export const HOME_TO_BIKE_MS = 600;
export const homeRideDelay = (tableId, index) => (pathLength(walkInPath(tableId, index)) / WALK_OUT_SPEED) * 1000 + HOME_TO_BIKE_MS;

// Đi từ ghế cũ ra lối giữa, sang hàng bàn mới, rồi vào ghế mới.
export function moveSeatPath(fromTable, fromIndex, toTable, toIndex) {
  const out = walkInPath(fromTable, fromIndex).reverse().slice(0, -1);
  const into = walkInPath(toTable, toIndex).slice(1);
  return [...out, ...into];
}

export function pathLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return length;
}

export function pointAt(points, distance) {
  let left = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const step = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= step) {
      const t = step ? left / step : 1;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dir: Math.sign(b.x - a.x) };
    }
    left -= step;
  }
  const last = points.at(-1);
  return { x: last.x, y: last.y, dir: 0 };
}
