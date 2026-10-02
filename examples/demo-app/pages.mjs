import { readFileSync } from 'node:fs';

/**
 * The HTML, as plain template functions. Visible text comes from locales/en.json,
 * so the catalogue `extract` reads and the labels a survey sees are the same
 * words. Every interactive element carries a data-testid for the same reason: it
 * gives the source half of the correlation something real to find.
 */

const catalogue = JSON.parse(readFileSync(new URL('./locales/en.json', import.meta.url), 'utf8'));

/** `t('auth.login.submit')`, with `{name}` style placeholders. */
export function t(key, values = {}) {
  const text = key.split('.').reduce((node, part) => node?.[part], catalogue);
  if (typeof text !== 'string') throw new Error(`missing translation: ${key}`);
  return text.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

function layout({ title, body, nav = false, admin = false, script = '' }) {
  const links = nav
    ? `<nav aria-label="Main">
      <a href="/dashboard">${t('common.nav.dashboard')}</a>
      <a href="/items">${t('common.nav.items')}</a>
      ${admin ? `<a href="${paths.security}">${t('common.nav.security')}</a>` : ''}
    </nav>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
</head>
<body>
${links}
<main>
${body}
</main>
<script>
${script}
</script>
</body>
</html>
`;
}

/** The mutation `route-moved` changes this; server.mjs sets it and the nav reads it. */
export const paths = { security: '/admin/settings/security' };

const field = (id, label, type = 'text', autocomplete = 'off') =>
  `<div><label for="${id}">${label}</label>
  <input id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}" data-testid="${id}"></div>`;

const POST_JSON = `async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: await response.json().catch(() => ({})) };
}`;

export function loginPage({ submitLabel = t('auth.login.submit') } = {}) {
  return layout({
    title: t('auth.login.title'),
    body: `<h1>${t('auth.login.title')}</h1>
<form id="login" novalidate>
  ${field('login-email', t('auth.login.email'), 'email', 'username')}
  ${field('login-password', t('auth.login.password'), 'password', 'current-password')}
  <p role="alert" id="login-error" data-testid="login-error" hidden>${t('auth.login.error')}</p>
  <button type="submit" data-testid="login-submit">${submitLabel}</button>
</form>
<p><a href="/forgot" data-testid="login-forgot">${t('auth.login.forgot')}</a></p>`,
    script: `${POST_JSON}
const error = document.getElementById('login-error');
document.getElementById('login').addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;
  const result = await postJson('/api/login', {
    email: document.getElementById('login-email').value,
    password: document.getElementById('login-password').value,
  });
  if (result.ok) location.assign('/dashboard');
  else error.hidden = false;
});`,
  });
}

export function forgotPage() {
  return layout({ title: t('auth.forgot.title'), body: `<h1>${t('auth.forgot.title')}</h1>` });
}

export function signupPage({ validate }) {
  return layout({
    title: t('auth.signup.title'),
    body: `<h1>${t('auth.signup.title')}</h1>
<form id="signup" novalidate>
  ${field('signup-email', t('auth.signup.email'), 'email', 'email')}
  ${field('signup-password', t('auth.signup.password'), 'password', 'new-password')}
  <p role="alert" id="signup-error" data-testid="signup-error" hidden>${t('auth.signup.invalidEmail')}</p>
  <p role="status" id="signup-status" data-testid="signup-status" hidden>${t('auth.signup.created')}</p>
  <button type="submit" data-testid="signup-submit">${t('auth.signup.submit')}</button>
</form>`,
    script: `const validate = ${validate ? 'true' : 'false'};
const error = document.getElementById('signup-error');
const status = document.getElementById('signup-status');
document.getElementById('signup').addEventListener('submit', (event) => {
  event.preventDefault();
  const email = document.getElementById('signup-email').value;
  const valid = /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email);
  error.hidden = !validate || valid;
  status.hidden = validate && !valid;
});`,
  });
}

export function dashboardPage({ name, admin }) {
  return layout({
    title: t('dashboard.title'),
    nav: true,
    admin,
    body: `<p role="status" id="loading">${t('dashboard.loading')}</p>
<div id="content"></div>`,
    // The welcome heading arrives late on purpose: a test that sleeps instead of
    // waiting for it is the failure the slow-page prompt is built to provoke.
    script: `setTimeout(() => {
  document.getElementById('loading').remove();
  const heading = document.createElement('h1');
  heading.dataset.testid = 'dashboard-welcome';
  heading.textContent = ${JSON.stringify(t('dashboard.welcome', { name }))};
  document.getElementById('content').append(heading);
}, 1500);`,
  });
}

export function securityPage({ submitLabel }) {
  return layout({
    title: t('admin.security.title'),
    nav: true,
    admin: true,
    body: `<h1>${t('admin.security.title')}</h1>
<form id="security" novalidate>
  ${field('security-current', t('admin.security.current'), 'password', 'current-password')}
  ${field('security-new', t('admin.security.next'), 'password', 'new-password')}
  <p role="alert" id="security-error" data-testid="security-error" hidden>${t('admin.security.wrong')}</p>
  <p role="status" id="security-status" data-testid="security-status" hidden>${t('admin.security.changed')}</p>
  <button type="submit" data-testid="security-submit">${submitLabel}</button>
</form>`,
    script: `${POST_JSON}
const error = document.getElementById('security-error');
const status = document.getElementById('security-status');
document.getElementById('security').addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;
  status.hidden = true;
  const result = await postJson('/api/password', {
    current: document.getElementById('security-current').value,
    next: document.getElementById('security-new').value,
  });
  if (result.ok) status.hidden = false;
  else error.hidden = false;
});`,
  });
}

export function itemsPage({ admin }) {
  return layout({
    title: t('items.title'),
    nav: true,
    admin,
    body: `<h1>${t('items.title')}</h1>
<form id="add" novalidate>
  ${field('items-input', t('items.label'))}
  <button type="submit" data-testid="items-add">${t('items.add')}</button>
</form>
<p id="empty" data-testid="items-empty">${t('items.empty')}</p>
<ul id="list" data-testid="items-list"></ul>`,
    script: `${POST_JSON}
const list = document.getElementById('list');
const empty = document.getElementById('empty');
async function refresh() {
  const items = await (await fetch('/api/items')).json();
  list.replaceChildren(...items.map((item) => {
    const row = document.createElement('li');
    row.append(item.title + ' ');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.testid = 'items-delete';
    button.textContent = ${JSON.stringify(t('items.delete'))};
    button.setAttribute('aria-label', ${JSON.stringify(t('items.delete'))} + ' ' + item.title);
    button.addEventListener('click', async () => {
      await fetch('/api/items/' + item.id, { method: 'DELETE' });
      await refresh();
    });
    row.append(button);
    return row;
  }));
  empty.hidden = items.length > 0;
}
document.getElementById('add').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('items-input');
  if (input.value.trim() === '') return;
  await postJson('/api/items', { title: input.value.trim() });
  input.value = '';
  await refresh();
});
refresh();`,
  });
}

export function messagePage(titleKey) {
  return layout({ title: t(titleKey), body: `<h1>${t(titleKey)}</h1>` });
}
