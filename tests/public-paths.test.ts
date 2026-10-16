import test from 'node:test';
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { isPublicPath } from '../src/auth/public-paths';
import { middleware } from '../src/middleware';

test('Middleware — rutas públicas acotadas', async (t) => {
  await t.test('recursos estáticos y de Next permitidos sin sesión', () => {
    for (const p of [
      '/icons/tanque.png',
      '/favicon.ico',
      '/_next/static/chunks/main.js',
      '/_next/image?url=x',
      '/fonts/inter.woff2',
      '/login',
      '/api/health',
    ]) {
      assert.strictEqual(isPublicPath(p), true, p);
    }
  });

  await t.test('rutas ERP normales protegidas', () => {
    for (const p of ['/', '/ventas', '/reportes', '/clientes', '/administracion', '/api/documents/x']) {
      assert.strictEqual(isPublicPath(p), false, p);
    }
  });

  await t.test('pathname con "." que no es asset estático sigue protegido', () => {
    for (const p of ['/responsive.preview', '/ventas.backup', '/clientes.json', '/reportes/2026.10', '/api/health.check']) {
      assert.strictEqual(isPublicPath(p), false, p);
    }
  });

  await t.test('middleware real sin sesión: redirige a /login rutas con "." no estáticas y deja pasar assets', async () => {
    const base = 'http://localhost:3000';

    const dotted = await middleware(new NextRequest(`${base}/responsive.preview`));
    assert.strictEqual(dotted.status, 307);
    assert.strictEqual(new URL(dotted.headers.get('location')!).pathname, '/login');

    const erp = await middleware(new NextRequest(`${base}/ventas`));
    assert.strictEqual(erp.status, 307);
    assert.strictEqual(new URL(erp.headers.get('location')!).pathname, '/login');

    const api = await middleware(new NextRequest(`${base}/api/documents.json`));
    assert.strictEqual(api.status, 401);

    const asset = await middleware(new NextRequest(`${base}/icons/tanque.png`));
    assert.strictEqual(asset.status, 200);
    assert.strictEqual(asset.headers.get('location'), null);
  });
});
