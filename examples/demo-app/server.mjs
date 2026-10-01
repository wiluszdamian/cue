import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  dashboardPage,
  forgotPage,
  itemsPage,
  loginPage,
  messagePage,
  paths,
  securityPage,
  signupPage,
  t,
} from './pages.mjs';
import { MUTATIONS } from './mutations.mjs';

/**
 * A small web application with no dependencies, built to be surveyed, tested and
 * deliberately broken. State lives in memory and starts clean on every launch.
 *
 * `DEMO_MUTATIONS=a,b` switches on controlled defects, so a test can be shown to
 * fail for the intended reason instead of merely passing:
 *
 *   auth-silent-fail         login reports success but never starts a session
 *   wrong-password-accepted  any password logs a known user in
 *   signup-validation-off    the sign-up form accepts any email
 *   button-renamed           "Change password" becomes "Update password"
 *   route-moved              /admin/settings/security moves to /admin/security
 */

const requested = (process.env['DEMO_MUTATIONS'] ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const unknown = requested.filter((name) => !MUTATIONS.includes(name));
if (unknown.length > 0) {
  process.stderr.write(`Unknown DEMO_MUTATIONS: ${unknown.join(', ')}\n`);
  process.exit(2);
}
const mutations = new Set(requested);

if (mutations.has('route-moved')) paths.security = '/admin/security';

const users = new Map([
  ['user@demo.test', { password: 'user-pass', name: 'Sam', role: 'user' }],
  ['admin@demo.test', { password: 'admin-pass', name: 'Ada', role: 'admin' }],
]);
const sessions = new Map();
const items = [];
let nextItemId = 1;

function sessionOf(request) {
  const cookie = /(?:^|;\s*)demo_session=([\w-]+)/.exec(request.headers.cookie ?? '');
  const email = cookie ? sessions.get(cookie[1]) : undefined;
  const user = email === undefined ? undefined : users.get(email);
  return user === undefined ? undefined : { email, ...user };
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

const html = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  response.end(body);
};
const json = (response, status, body, headers = {}) => {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
};
const redirect = (response, location) => {
  response.writeHead(302, { location });
  response.end();
};

async function handleApi(request, response, pathname, session) {
  const method = request.method ?? 'GET';

  if (pathname === '/api/login' && method === 'POST') {
    const { email, password } = await readJson(request);
    const user = users.get(String(email));
    const accepted =
      user !== undefined &&
      (user.password === password || mutations.has('wrong-password-accepted'));
    if (!accepted) return json(response, 401, { error: t('auth.login.error') });

    const headers = {};
    if (!mutations.has('auth-silent-fail')) {
      const token = randomUUID();
      sessions.set(token, String(email));
      headers['set-cookie'] = `demo_session=${token}; Path=/; HttpOnly; SameSite=Lax`;
    }
    return json(response, 200, { name: user.name, role: user.role }, headers);
  }

  if (pathname === '/api/me' && method === 'GET') {
    if (session === undefined) return json(response, 401, { error: 'Not signed in' });
    return json(response, 200, { email: session.email, name: session.name, role: session.role });
  }

  if (pathname === '/api/password' && method === 'POST') {
    if (session?.role !== 'admin') return json(response, 403, { error: t('common.forbidden') });
    const { current, next } = await readJson(request);
    if (current !== session.password || typeof next !== 'string' || next === '') {
      return json(response, 400, { error: t('admin.security.wrong') });
    }
    // Deliberately not stored: tests stay independent of each other's runs.
    return json(response, 200, { changed: true });
  }

  if (pathname === '/api/items' && method === 'GET') return json(response, 200, items);

  if (pathname === '/api/items' && method === 'POST') {
    const { title } = await readJson(request);
    if (typeof title !== 'string' || title.trim() === '') {
      return json(response, 400, { error: 'title is required' });
    }
    const item = { id: nextItemId++, title: title.trim() };
    items.push(item);
    return json(response, 201, item);
  }

  const deletion = /^\/api\/items\/(\d+)$/.exec(pathname);
  if (deletion && method === 'DELETE') {
    const index = items.findIndex((item) => item.id === Number(deletion[1]));
    if (index === -1) return json(response, 404, { error: 'No such item' });
    items.splice(index, 1);
    response.writeHead(204);
    return response.end();
  }

  return json(response, 404, { error: 'Not found' });
}

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  const session = sessionOf(request);

  if (pathname.startsWith('/api/')) return handleApi(request, response, pathname, session);

  switch (pathname) {
    case '/':
      return redirect(response, '/login');
    case '/login':
      return html(response, 200, loginPage());
    case '/forgot':
      return html(response, 200, forgotPage());
    case '/signup':
      return html(response, 200, signupPage({ validate: !mutations.has('signup-validation-off') }));
    case '/dashboard':
      if (session === undefined) return redirect(response, '/login');
      return html(
        response,
        200,
        dashboardPage({ name: session.name, admin: session.role === 'admin' }),
      );
    case '/items':
      return html(response, 200, itemsPage({ admin: session?.role === 'admin' }));
    case paths.security:
      if (session === undefined) return redirect(response, '/login');
      if (session.role !== 'admin') return html(response, 403, messagePage('common.forbidden'));
      return html(
        response,
        200,
        securityPage({
          submitLabel: mutations.has('button-renamed')
            ? 'Update password'
            : t('admin.security.submit'),
        }),
      );
    default:
      return html(response, 404, messagePage('common.notFound'));
  }
});

const port = Number(process.env['PORT'] ?? 4310);
server.listen(port, '127.0.0.1', () => {
  const active = mutations.size > 0 ? ` (mutations: ${[...mutations].join(', ')})` : '';
  process.stdout.write(`demo-app listening on http://127.0.0.1:${String(port)}${active}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
