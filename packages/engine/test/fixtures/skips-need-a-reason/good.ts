import { test } from '@playwright/test';

// TODO(PROJ-1234) un-skip once the refund webhook is stubbed
test.skip('refund flow', { tag: ['@regression'] }, async () => {});

test.skip(!!process.env.CI, 'needs a seeded merchant account');
