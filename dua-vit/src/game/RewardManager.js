// How viewer actions turn into metres. There is one currency only: metres go into the duck's dash, and GameEngine
// lets it out at a limited rate, so a big gift is a long burst of speed and nobody can buy an instant win.

// 5 likes = 1 metre (likesPerMeter); leftover likes carry over to the next batch.
export function metersFromLikes(player, count, rewards) {
  player.likeRemainder += count;
  const meters = Math.floor(player.likeRemainder / rewards.likesPerMeter);
  player.likeRemainder -= meters * rewards.likesPerMeter;
  return meters;
}

// Any comment pays, once per cooldown. Returns 0 inside the cooldown.
export function metersFromComment(player, now, rewards) {
  if (now - player.lastCommentAt < rewards.commentCooldownSeconds) return 0;
  player.lastCommentAt = now;
  return rewards.commentMeters;
}

// Only the first share of a round pays.
export function metersFromShare(player, rewards) {
  if (player.shared) return 0;
  player.shared = true;
  return rewards.shareMeters;
}
