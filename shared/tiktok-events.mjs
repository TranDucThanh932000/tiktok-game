import { createHash } from 'node:crypto';

// Converts TikTok LIVE payloads (as emitted by tiktok-live-connector 2.x, WebcastChatMessage, WebcastLikeMessage,
// WebcastSocialMessage, WebcastGiftMessage) into the game's internal event schema:
//   { type, eventId, source, userId, username, nickname, avatar, timestamp, receivedAt, ...type fields }
// A payload without a user id never gets a made-up identity: userId stays null and the game treats it as a
// community-only event.

export function safeImageUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

const clean = (text, max) => Array.from(String(text ?? '').replace(/\s+/g, ' ').trim()).slice(0, max).join('');

export function userOf(user) {
  const id = user?.id != null ? String(user.id) : String(user?.userId ?? '');
  if (!id || id === '0') return { userId: null, username: '', nickname: '', avatar: '' };
  const username = clean(user.displayId ?? user.uniqueId, 32);
  const nickname = clean(user.nickname, 24) || username;
  // Browsers cannot draw HEIC, which TikTok sometimes lists first.
  const urls = [
    ...(user.avatarMedium?.urlList ?? []),
    ...(user.avatarThumb?.urlList ?? []),
    ...(user.avatarLarge?.urlList ?? []),
    ...(user.profilePicture?.urls ?? []),
  ];
  const avatar = safeImageUrl(urls.find((url) => !/\.heic\b/i.test(url)) ?? urls[0] ?? '');
  return { userId: id, username: username || nickname, nickname: nickname || username || 'Ẩn danh', avatar };
}

// TikTok's createTime is milliseconds (sometimes seconds); fall back to arrival time when it is missing or absurd.
export function eventTime(common, receivedAt) {
  let t = Number(common?.createTime) || 0;
  if (t > 0 && t < 1e12) t *= 1000;
  return t > 0 && Math.abs(t - receivedAt) < 24 * 3600_000 ? t : receivedAt;
}

// The connector's msgId is unique per message. Without one, hash the content so the same payload delivered twice
// still collides, instead of inventing a random id that would make every copy look new.
function idOf(type, raw, extra) {
  const msgId = raw?.common?.msgId != null ? String(raw.common.msgId) : '';
  if (msgId && msgId !== '0') return msgId;
  const basis = JSON.stringify([type, raw?.user?.id ?? '', raw?.common?.createTime ?? '', extra]);
  return `h${createHash('sha1').update(basis).digest('hex').slice(0, 20)}`;
}

export function createTikTokNormalizer({ source = 'live', likeGapToCommunity = true, now = Date.now } = {}) {
  // Combo gifts resend a running total per (user, gift, group); only the increase is new.
  const streaks = new Map();
  let likeTotal = 0;

  const base = (type, raw, extra) => {
    const receivedAt = now();
    return {
      type,
      eventId: `${source}:${idOf(type, raw, extra)}`,
      source,
      ...userOf(raw?.user),
      timestamp: eventTime(raw?.common, receivedAt),
      receivedAt,
    };
  };

  function pruneStreaks(at) {
    for (const [key, streak] of streaks) if (at - streak.at > 5 * 60_000) streaks.delete(key);
  }

  return {
    comment(raw) {
      const message = clean(raw?.content ?? raw?.comment, 500);
      if (!message) return [];
      return [{ ...base('comment', raw, message), message }];
    },

    // `count` is the increase carried by this message, `total` the room's running total. TikTok samples like
    // messages, so the total grows faster than the counts add up; the difference belongs to viewers we cannot name
    // and goes to the community pool. The first total only sets the baseline, so old likes are never replayed.
    like(raw) {
      const count = Math.max(0, Math.trunc(Number(raw?.count ?? raw?.likeCount) || 0));
      const total = Math.max(0, Math.trunc(Number(raw?.total ?? raw?.totalLikeCount) || 0));
      if (!Number.isSafeInteger(count) || !Number.isSafeInteger(total)) throw new RangeError('Invalid TikTok like count');
      const events = [];
      const event = base('like', raw, [count, total]);
      if (count > 0) events.push({ ...event, count });
      if (likeGapToCommunity && total > 0) {
        if (likeTotal > 0) {
          const gap = total - likeTotal - count;
          if (gap > 0 && gap < 1_000_000) {
            events.push({ ...event, eventId: `${event.eventId}:gap`, userId: null, username: '', nickname: '', avatar: '', count: gap });
          }
        }
        likeTotal = Math.max(likeTotal, total);
      }
      return events;
    },

    share(raw) {
      return [base('share', raw)];
    },

    gift(raw) {
      const extra = raw?.extendedGiftInfo ?? {};
      const gift = raw?.giftDetails ?? raw?.gift ?? extra;
      const giftId = String(raw?.giftId ?? gift.id ?? '');
      const repeat = Math.max(1, Math.trunc(Number(raw?.repeatCount) || 1));
      if (!Number.isSafeInteger(repeat)) throw new RangeError('Invalid TikTok gift count');
      const combo = Number(raw?.giftType ?? gift.type ?? gift.giftType ?? extra.type) === 1;
      const ended = Number(raw?.repeatEnd) === 1;
      let count = repeat;
      const event = base('gift', raw, [giftId, repeat, raw?.groupId, ended]);
      if (combo) {
        const key = `${event.userId}:${giftId}:${raw?.groupId ?? ''}`;
        pruneStreaks(event.receivedAt);
        const previous = streaks.get(key);
        const hasGroup = raw?.groupId != null && String(raw.groupId) !== '0' && String(raw.groupId) !== '';
        const restarted = !hasGroup && previous?.ended && !ended;
        const highWater = restarted ? 0 : previous?.repeat ?? 0;
        count = Math.max(0, repeat - highWater);
        // Keep the final high-water mark: duplicate/out-of-order end messages are not new gifts.
        streaks.delete(key);
        streaks.set(key, { repeat: Math.max(highWater, repeat), ended: ended || (!restarted && previous?.ended), at: event.receivedAt });
        if (streaks.size > 20_000) streaks.delete(streaks.keys().next().value);
      }
      if (count <= 0) return [];
      return [
        {
          ...event,
          giftId,
          giftName: clean(gift.name || gift.giftName || extra.name, 40),
          diamonds: Math.max(0, Number(gift.diamondCount || extra.diamond_count || extra.diamondCount) || 0),
          repeatCount: count,
          streaking: combo && !ended,
        },
      ];
    },

    // A new LIVE room starts a new like total and new gift groups.
    reset() {
      streaks.clear();
      likeTotal = 0;
    },
  };
}
