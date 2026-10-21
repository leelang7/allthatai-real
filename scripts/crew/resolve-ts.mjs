// node --import ./scripts/crew/resolve-ts.mjs — Astro(Vite)처럼 확장자 없는 './crew-core' 를 .ts 로 찾는다.
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); } catch (e) {
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.[cm]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx);
    throw e;
  }
}`), import.meta.url);
