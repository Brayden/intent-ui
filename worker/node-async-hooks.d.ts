/**
 * Types for the one Node API the Worker uses, available with the `nodejs_compat` flag
 * (we don't depend on @types/node). See https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/
 */
declare module "node:async_hooks" {
  export class AsyncLocalStorage<T> {
    getStore(): T | undefined;
    run<R>(store: T, callback: () => R): R;
  }
}
