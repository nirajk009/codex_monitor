function normalizeWindow(window) {
  if (!window || typeof window !== 'object') return null;
  if (window.used_percent === null || window.used_percent === undefined) return null;

  const used = Number(window.used_percent);
  if (!Number.isFinite(used)) return null;

  const resetAt = Number(window.reset_at);
  const duration = Number(window.limit_window_seconds);

  return {
    remaining: Math.max(0, Math.min(100, 100 - used)),
    resetAt: Number.isFinite(resetAt) && resetAt > 0 ? resetAt : null,
    duration: Number.isFinite(duration) && duration > 0 ? duration : null
  };
}

function readLimits(rateLimit) {
  const primary = normalizeWindow(rateLimit?.primary_window);
  const secondary = normalizeWindow(rateLimit?.secondary_window);
  let fiveHour = null;
  let weekly = null;

  for (const window of [primary, secondary]) {
    if (!window) continue;
    if (window.duration && window.duration >= 86400) weekly = window;
    else if (!fiveHour) fiveHour = window;
  }

  if (!fiveHour && !weekly && primary) fiveHour = primary;
  if (!weekly && secondary && secondary !== fiveHour) weekly = secondary;

  return { fiveHour, weekly };
}

module.exports = { readLimits };
