import { test } from '@playwright/test';

// TODO(PROJ-1234) un-skip once the refund webhook is stubbed
test.skip('refund flow', { tag: ['@regression'] }, async () => {});

test.skip(!!process.env.CI, 'needs a seeded merchant account');

const reason = process.env.SKIP_REASON;
test.skip(!!process.env.CI, `${reason}`);
test.skip(!!process.env.CI, SKIP_REASON);
test.skip(!!process.env.CI, reason ?? 'needs a seeded merchant account');
test.skip(!!process.env.CI, 'needs ' + 'a seeded merchant account');
