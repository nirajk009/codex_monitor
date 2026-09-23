const test = require('node:test');
const assert = require('node:assert/strict');
const { readLimits } = require('./usage');

test('reads the five-hour and weekly windows', () => {
  const limits = readLimits({
    primary_window: { used_percent: 69, limit_window_seconds: 18000, reset_at: 1800000000 },
    secondary_window: { used_percent: 67, limit_window_seconds: 604800, reset_at: 1800001000 }
  });
  assert.equal(limits.fiveHour.remaining, 31);
  assert.equal(limits.weekly.remaining, 33);
  assert.equal(limits.fiveHour.resetAt, 1800000000);
});

test('labels a weekly-only primary window correctly', () => {
  const limits = readLimits({
    primary_window: { used_percent: 25, limit_window_seconds: 604800, reset_at: 1800000000 },
    secondary_window: null
  });
  assert.equal(limits.fiveHour, null);
  assert.equal(limits.weekly.remaining, 75);
});
