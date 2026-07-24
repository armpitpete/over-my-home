import test from 'node:test';
import assert from 'node:assert/strict';

test('functional radar movement remains enabled when reduced motion is requested', async () => {
  const mediaQuery = {
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  };

  globalThis.window = {
    matchMedia() {
      return mediaQuery;
    },
  };

  try {
    await import(`../motion.js?functional-motion=${Date.now()}`);

    const functionalMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const unrelatedQuery = window.matchMedia('(min-width: 1px)');

    assert.equal(functionalMotionQuery.matches, false);
    assert.equal(unrelatedQuery.matches, true);
    assert.equal(typeof functionalMotionQuery.addEventListener, 'function');
  } finally {
    delete globalThis.window;
  }
});
