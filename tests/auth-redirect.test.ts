import test, { mock } from 'node:test';
import assert from 'node:assert';

/**
 * Loop de redirección /login ↔ / con sesión válida de un usuario NO autorizado
 * (UUID distinto de STEFFEN_AUTHORIZED_USER_ID). Sin red ni base de datos:
 * Supabase Auth, cookies y navegación se simulan.
 */

const AUTHORIZED_ID = '00000000-0000-4000-8000-0000000000aa';
const OTHER_ID = '00000000-0000-4000-8000-0000000000bb';
const AUTH_COOKIE = 'sb-testref-auth-token';
process.env.STEFFEN_AUTHORIZED_USER_ID = AUTHORIZED_ID;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock-project.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';

// ---------------------------------------------------------------------------
// Supabase Auth simulado: la sesión vive en la cookie AUTH_COOKIE.
// ---------------------------------------------------------------------------
const sessions = new Map<string, string>(); // valor de cookie -> user id
let signOutCalls: string[] = [];
let signOutShouldFail = false;

type CookieAdapter = {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: { name: string; value: string; options?: Record<string, unknown> }[]) => void;
};

mock.module('@supabase/ssr', {
  namedExports: {
    createServerClient: (_url: string, _key: string, options: { cookies: CookieAdapter }) => {
      const current = () => options.cookies.getAll().find((c) => c.name === AUTH_COOKIE)?.value;
      return {
        auth: {
          getUser: async () => {
            const token = current();
            const id = token ? sessions.get(token) : undefined;
            return { data: { user: id ? { id, email: `${id}@test.local` } : null }, error: null };
          },
          signOut: async (opts?: { scope?: string }) => {
            signOutCalls.push(opts?.scope ?? 'global');
            if (signOutShouldFail) throw new Error('network down');
            const token = current();
            if (token) sessions.delete(token);
            options.cookies.setAll([{ name: AUTH_COOKIE, value: '', options: { path: '/', maxAge: 0 } }]);
            return { error: null };
          },
        },
      };
    },
    createBrowserClient: () => ({}),
  },
});

// Server Action logout: cookies() y redirect() de Next simulados.
const actionCookies = new Map<string, string>();
class RedirectSignal extends Error {
  constructor(public readonly location: string) {
    super(`NEXT_REDIRECT ${location}`);
  }
}
mock.module('next/headers', {
  namedExports: {
    cookies: async () => ({
      getAll: () => [...actionCookies].map(([name, value]) => ({ name, value })),
      set: (name: string, value: string, options?: { maxAge?: number }) => {
        if (options?.maxAge === 0 || value === '') actionCookies.delete(name);
        else actionCookies.set(name, value);
      },
      delete: (name: string) => actionCookies.delete(name),
    }),
  },
});
mock.module('next/navigation', {
  namedExports: {
    redirect: (location: string) => {
      throw new RedirectSignal(location);
    },
  },
});
// auth.actions importa el composition server-side: se aísla para no crear clientes reales.
mock.module('@/database/server', {
  namedExports: { serverSupabase: {}, getServerSupabaseClient: () => ({}) },
});

function login(userId: string): string {
  const token = `token-${userId}-${Math.random()}`;
  sessions.set(token, userId);
  return token;
}

test('Auth — sin loop de redirección para usuario autenticado no autorizado', async (t) => {
  const { decideAuthRouting } = await import('../src/auth/auth-routing');
  const { isPublicPath } = await import('../src/auth/public-paths');
  const { middleware } = await import('../src/middleware');
  const { NextRequest } = await import('next/server');

  /** Petición real al middleware con (o sin) cookie de sesión. */
  async function hit(path: string, token?: string) {
    const req = new NextRequest(new URL(path, 'https://erp.test'), {
      headers: token ? { cookie: `${AUTH_COOKIE}=${token}` } : {},
    });
    const res = await middleware(req);
    const location = res.headers.get('location');
    const setCookie = res.headers.getSetCookie().find((c) => c.startsWith(`${AUTH_COOKIE}=`));
    return {
      status: res.status,
      location: location ? new URL(location).pathname + new URL(location).search : null,
      clearsSession: Boolean(setCookie && /Max-Age=0/i.test(setCookie)),
    };
  }

  /**
   * Navegador simulado: sigue redirects del middleware y del layout del ERP
   * (que redirige a /login si el usuario no está autorizado). Aplica las cookies
   * expiradas. Devuelve la ruta final o falla si supera el máximo de saltos.
   */
  async function browse(start: string, token: string | undefined, layoutFallback = true) {
    let path = start;
    let cookie = token;
    const visited: string[] = [];
    for (let hop = 0; hop < 10; hop++) {
      visited.push(path);
      const res = await hit(path, cookie);
      if (res.clearsSession) cookie = undefined;
      if (res.status >= 300 && res.status < 400 && res.location) {
        path = res.location;
        continue;
      }
      // Middleware dejó pasar: el layout (erp) valida autorización server-side.
      const pathname = path.split('?')[0];
      if (layoutFallback && pathname !== '/login' && !isPublicPath(pathname)) {
        const id = cookie ? sessions.get(cookie) : undefined;
        if (!id) {
          path = '/login';
          continue;
        }
        if (id !== AUTHORIZED_ID) {
          path = '/login?error=unauthorized';
          continue;
        }
      }
      return { final: path, status: res.status, cookie, visited };
    }
    assert.fail(`ERR_TOO_MANY_REDIRECTS: ${visited.join(' → ')}`);
  }

  await t.test('1. sin sesión: /login se muestra y una ruta del ERP redirige a /login', async () => {
    assert.deepStrictEqual(await hit('/login'), { status: 200, location: null, clearsSession: false });
    assert.deepStrictEqual(await hit('/stock'), { status: 307, location: '/login', clearsSession: false });
    const nav = await browse('/', undefined);
    assert.strictEqual(nav.final, '/login');
  });

  await t.test('2. usuario autorizado: acceso al ERP y /login lo lleva a /', async () => {
    const token = login(AUTHORIZED_ID);
    assert.deepStrictEqual(await hit('/', token), { status: 200, location: null, clearsSession: false });
    assert.deepStrictEqual(await hit('/administracion', token), { status: 200, location: null, clearsSession: false });
    assert.deepStrictEqual(await hit('/login', token), { status: 307, location: '/', clearsSession: false });
    const nav = await browse('/login', token);
    assert.strictEqual(nav.final, '/');
    assert.ok(nav.cookie, 'la sesión autorizada se conserva');
  });

  await t.test('3. no autorizado: /login NO redirige a / (se rompe el ciclo) y cierra la sesión', async () => {
    signOutCalls = [];
    const token = login(OTHER_ID);
    const res = await hit('/login', token);
    assert.strictEqual(res.status, 200, '/login se muestra, sin redirect');
    assert.strictEqual(res.location, null);
    assert.ok(res.clearsSession, 'la cookie de la sesión no autorizada se expira');
    assert.deepStrictEqual(signOutCalls, ['local']);
  });

  await t.test('4. no autorizado: desde / o /login termina estable en /login?error=unauthorized sin sesión', async () => {
    const fromRoot = await browse('/', login(OTHER_ID));
    assert.strictEqual(fromRoot.final, '/login?error=unauthorized');
    assert.strictEqual(fromRoot.cookie, undefined, 'sesión cerrada');
    assert.ok(fromRoot.visited.length <= 3, `saltos: ${fromRoot.visited.join(' → ')}`);

    const fromLogin = await browse('/login', login(OTHER_ID));
    assert.strictEqual(fromLogin.final, '/login');
    assert.strictEqual(fromLogin.cookie, undefined);

    // Recargar /login?error=unauthorized: estable (200, sin redirect).
    assert.deepStrictEqual(await hit('/login?error=unauthorized'), { status: 200, location: null, clearsSession: false });

    // API con sesión no autorizada: 403, nunca redirect.
    const api = await hit('/api/reports', login(OTHER_ID));
    assert.strictEqual(api.status, 403);
    assert.ok(api.clearsSession);
  });

  await t.test('4b. aunque signOut remoto falle, la cookie se expira y no hay loop', async () => {
    signOutShouldFail = true;
    try {
      const token = login(OTHER_ID);
      const res = await hit('/', token);
      assert.strictEqual(res.status, 307);
      assert.strictEqual(res.location, '/login?error=unauthorized');
      assert.ok(res.clearsSession);
      // Peor caso: la cookie sobrevive igual → /login sigue estable (200), nunca vuelve a /.
      const stillLogged = await hit('/login', token);
      assert.strictEqual(stillLogged.status, 200);
      assert.strictEqual(stillLogged.location, null);
      const nav = await browse('/', token, true);
      assert.strictEqual(nav.final, '/login?error=unauthorized');
    } finally {
      signOutShouldFail = false;
    }
  });

  await t.test('4c. la decisión pura nunca forma un ciclo /login ↔ / para ningún estado', () => {
    for (const isAuthenticated of [false, true]) {
      for (const isAuthorized of [false, true]) {
        const atLogin = decideAuthRouting({ pathname: '/login', isAuthenticated, isAuthorized });
        const atRoot = decideAuthRouting({ pathname: '/', isAuthenticated, isAuthorized });
        const loginGoesRoot = atLogin.kind === 'redirect' && atLogin.pathname === '/';
        const rootGoesLogin = atRoot.kind === 'redirect' && atRoot.pathname === '/login';
        assert.ok(!(loginGoesRoot && rootGoesLogin), `ciclo con auth=${isAuthenticated} authz=${isAuthorized}`);
        if (loginGoesRoot) assert.ok(isAuthenticated && isAuthorized, 'solo un autorizado sale de /login');
        if (isAuthenticated && !isAuthorized) assert.notStrictEqual(atRoot.kind, 'next', 'nunca acceso operativo');
      }
    }
  });

  await t.test('5. logout del autorizado: cierra sesión, borra cookies SSR y redirige una vez a /login', async () => {
    const { logoutAction } = await import('../src/actions/auth.actions');

    for (const failRemote of [false, true]) {
      signOutShouldFail = failRemote;
      const token = login(AUTHORIZED_ID);
      actionCookies.clear();
      actionCookies.set(AUTH_COOKIE, token);
      actionCookies.set(`${AUTH_COOKIE}.1`, 'chunk');
      actionCookies.set('otra-cookie', 'x');

      await assert.rejects(logoutAction(), (err: unknown) => err instanceof RedirectSignal && err.location === '/login');
      assert.ok(!actionCookies.has(AUTH_COOKIE), `sin cookie de sesión (signOut remoto falla: ${failRemote})`);
      assert.ok(!actionCookies.has(`${AUTH_COOKIE}.1`));
      assert.ok(actionCookies.has('otra-cookie'), 'no borra cookies ajenas a Supabase Auth');

      // /login accesible inmediatamente después del logout (sin cookie de sesión)
      assert.deepStrictEqual(await hit('/login', actionCookies.get(AUTH_COOKIE)), {
        status: 200,
        location: null,
        clearsSession: false,
      });
    }
    signOutShouldFail = false;
  });

  await t.test('6. /login sigue siendo ruta pública', () => {
    assert.strictEqual(isPublicPath('/login'), true);
    assert.deepStrictEqual(decideAuthRouting({ pathname: '/login', isAuthenticated: false, isAuthorized: false }), {
      kind: 'next',
      clearSession: false,
    });
  });
});
