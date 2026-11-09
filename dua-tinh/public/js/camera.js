// Camera: bay tới tỉnh vừa được tiếp sức, giữ một lúc (combo, MC đang đọc tên) rồi lùi về toàn cảnh.
// File này chỉ quyết định khi nào focus tỉnh nào; bay camera và làm sáng tỉnh là việc của bản đồ (map.focus/unfocus).
export function createCamera({ map, options = {}, now = () => performance.now() }) {
  const opt = { enabled: true, holdMs: 6000, minDwellMs: 2500, ...options };
  let current = null;
  let since = 0;
  let holdUntil = 0;
  let lockUntil = 0;
  let queued = null; // { id, holdMs, lockMs }
  let timer = 0;

  function show({ id, holdMs, lockMs }) {
    const t = now();
    current = id;
    since = t;
    holdUntil = t + holdMs;
    lockUntil = t + lockMs;
    map.focus(id);
  }

  function release() {
    current = null;
    map.unfocus();
  }

  const canSwitch = (t) => t >= since + opt.minDwellMs && t >= lockUntil;

  function tick() {
    clearTimeout(timer);
    timer = 0;
    const t = now();
    if (queued && canSwitch(t)) {
      const next = queued;
      queued = null;
      show(next);
    } else if (current && !queued && t >= holdUntil && t >= lockUntil) {
      release();
    }
    if (!current) return;
    const wake = queued ? Math.max(since + opt.minDwellMs, lockUntil) : Math.max(holdUntil, lockUntil);
    timer = setTimeout(tick, Math.max(50, wake - t));
  }

  return {
    // holdMs: giữ tỉnh ít nhất ngần này. lockMs: không chuyển sang tỉnh khác trước lúc đó (MC đang đọc tên người tặng).
    // soft: chỉ focus khi camera đang rảnh (dùng cho comment, để đông người comment không làm camera nhảy liên tục).
    focus(id, { holdMs = opt.holdMs, lockMs = 0, soft = false } = {}) {
      if (!opt.enabled || !id) return;
      const t = now();
      if (id === current) {
        holdUntil = Math.max(holdUntil, t + holdMs);
        lockUntil = Math.max(lockUntil, t + lockMs);
      } else if (!current) {
        show({ id, holdMs, lockMs });
      } else if (soft) {
        return;
      } else if (canSwitch(t)) {
        queued = null;
        show({ id, holdMs, lockMs });
      } else {
        // Đang giữ tỉnh khác: chờ tới lượt. Nhiều tỉnh chờ thì giữ tỉnh mới nhất, nhưng tỉnh MC đang đọc không bị chen.
        const keepLock = queued?.id === id ? queued.lockMs : 0;
        if (!queued || !queued.lockMs || lockMs || queued.id === id) queued = { id, holdMs, lockMs: Math.max(lockMs, keepLock) };
      }
      tick();
    },
    // MC đọc xong: thôi khóa, giữ thêm afterMs rồi được lùi về hoặc chuyển tỉnh.
    unlock(id, afterMs = 1500) {
      if (queued?.id === id) queued.lockMs = 0;
      if (id !== current) return;
      lockUntil = 0;
      holdUntil = Math.max(holdUntil, now() + afterMs);
      tick();
    },
    reset() {
      queued = null;
      clearTimeout(timer);
      timer = 0;
      if (current) release();
    },
  };
}
