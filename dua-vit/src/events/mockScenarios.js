import { MOCK_GIFTS, mockUser } from './MockAdapter.js';

const COMMENTS = ['chào cả nhà', '1', 'vịt ơi', 'cố lên', 'hihi', 'gooo', 'có ai không?'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// TEST MODE scenarios from the spec (section 16). Each returns a short description for the admin log.
export function createScenarios(mock, engine) {
  let botTimer = null;
  const users = (from, n) => Array.from({ length: n }, (_, i) => mockUser(from + i));
  const spread = (list, totalMs, fn) => list.forEach((item, i) => mock.later(Math.round((i * totalMs) / list.length), () => fn(item, i)));

  const scenarios = {
    crowd100: {
      label: '100 người tham gia cùng lúc',
      run() {
        spread(users(0, 100), 3000, (u) => mock.comment(u, pick(COMMENTS)));
        return '100 người comment trong 3 giây';
      },
    },
    likeSpam: {
      label: 'Một người Like liên tục',
      run() {
        const u = mockUser('likebot');
        spread(Array.from({ length: 40 }), 8000, () => mock.like(u, 15));
        return 'likebot gửi 600 like trong 8 giây (+120m, thả ra có giới hạn tốc độ)';
      },
    },
    commentSpam: {
      label: 'Một người Comment liên tục',
      run() {
        const u = mockUser('chatbot');
        spread(Array.from({ length: 30 }), 30_000, () => mock.comment(u, 'GO GO'));
        return 'chatbot comment mỗi giây trong 30 giây (chỉ tính 1 comment mỗi 3 giây)';
      },
    },
    shareBurst: {
      label: 'Nhiều người Share cùng lúc',
      run() {
        spread(users(0, 6), 2000, (u) => mock.share(u));
        return '6 người share trong 2 giây: mỗi người +20m và mọc cánh';
      },
    },
    giftBurst: {
      label: 'Nhiều người tặng Gift cùng lúc',
      run() {
        const kinds = Object.keys(MOCK_GIFTS);
        spread(users(0, 24), 1500, (u, i) => mock.gift(u, MOCK_GIFTS[kinds[i % kinds.length]], 1));
        return '24 quà trong 1,5 giây';
      },
    },
    giftCombo: {
      label: 'Gift combo (streak)',
      run() {
        mock.giftStreak(mockUser('combo_king'), MOCK_GIFTS.small, [1, 2, 5, 9, 14, 20], 400);
        return 'combo_king tặng combo x20 (6 tin nhắn cộng dồn + tin kết thúc) → chỉ tính 20 quà';
      },
    },
    twoTurbo: {
      label: 'Hai người cùng lao lên',
      run() {
        mock.gift(mockUser('minh123'), MOCK_GIFTS.large, 1);
        mock.gift(mockUser('lananh'), MOCK_GIFTS.large, 1);
        return 'minh123 và lananh cùng tặng quà lớn';
      },
    },
    communityPersonal: {
      label: 'Sóng Thần + quà đặc biệt',
      run() {
        mock.gift(mockUser(0), MOCK_GIFTS.special, 1);
        spread(Array.from({ length: 10 }), 2000, () => mock.anonymousLikes(320));
        return '3.200 like cộng đồng (Sóng Thần) + quà đặc biệt';
      },
    },
    duplicates: {
      label: 'Event bị gửi trùng',
      run() {
        mock.gift(mockUser('dup_test'), MOCK_GIFTS.medium, 1);
        mock.later(300, () => mock.replay(1));
        mock.later(600, () => mock.replay(1));
        return 'Một quà gửi 3 lần cùng msgId → chỉ tính 1 (xem "trùng" trong thống kê)';
      },
    },
    disconnect: {
      label: 'TikTok LIVE mất kết nối',
      run() {
        mock.disconnect(8);
        return 'Nguồn mock mất kết nối 8 giây, game vẫn chạy; khi nối lại gửi lại 5 tin cũ (bị lọc trùng)';
      },
    },
    midJoin: {
      label: 'Người chơi vào giữa vòng đua',
      run() {
        users(60, 3).forEach((u) => mock.comment(u, 'vịt ơi'));
        return engine.round.racing ? '3 người vào giữa vòng, xuất phát ở cuối đoàn' : 'Đã thêm 3 người (hãy chạy lại khi đang đua để thấy vào giữa vòng)';
      },
    },
    roundCycle: {
      label: 'Kết thúc vòng & bắt đầu vòng mới',
      run() {
        if (!engine.ducks.size) users(0, 10).forEach((u) => mock.comment(u, 'GO'));
        const steps = [500, 3500, 6500, 9500];
        steps.forEach((ms) => mock.later(ms, () => engine.skip()));
        return 'Tự chuyển: bắt đầu → nước rút → kết thúc → vòng mới';
      },
    },
    bots: {
      label: 'Bot tự chơi (bật/tắt)',
      run() {
        if (botTimer) {
          clearInterval(botTimer);
          botTimer = null;
          return 'Đã tắt bot';
        }
        const crew = users(0, 14);
        crew.forEach((u) => mock.comment(u, 'GO'));
        botTimer = setInterval(() => {
          const u = pick(crew);
          const roll = Math.random();
          if (roll < 0.55) mock.like(u, 5 + Math.floor(Math.random() * 20));
          else if (roll < 0.85) mock.comment(u, pick(COMMENTS));
          else if (roll < 0.93) mock.share(u);
          else mock.gift(u, MOCK_GIFTS[pick(['small', 'small', 'small', 'medium', 'large', 'special', 'skin', 'skin'])], 1);
        }, 350);
        return '14 bot like/comment/share/gift ngẫu nhiên';
      },
    },
  };

  return {
    list: () => Object.entries(scenarios).map(([id, s]) => ({ id, label: s.label })),
    run(id) {
      const scenario = scenarios[id];
      return scenario ? scenario.run() : null;
    },
    stop() {
      if (botTimer) clearInterval(botTimer);
      botTimer = null;
    },
  };
}
