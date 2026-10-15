/**
 * `server-only` aborta al importarse fuera del runtime de Next.js (condición
 * `react-server`). Los módulos de PDF (templates, logo, renderer) lo importan
 * como guarda; para poder probarlos bajo `node --test` se registra aquí un
 * módulo vacío en su lugar dentro de la caché de require. Debe importarse
 * ANTES que cualquier módulo que dependa de `server-only`.
 */
import Module from 'node:module';

const req = Module.createRequire(__filename);
const resolved = req.resolve('server-only');
const stub = new Module(resolved);
stub.filename = resolved;
stub.loaded = true;
stub.exports = {};
req.cache[resolved] = stub;
