# @intent-ui/build-plugin

Adds `data-iui-id="<file>:<Component>:<n>"` to every JSX element in the host's source (not
`node_modules`), so Intent UI can target any element. Skips fragments, elements that already have
an id, and anything written inside `<Protected>` or an element with `data-iui-protected`.

```ts
import intentUI from "@intent-ui/build-plugin/vite";

export default defineConfig({
  // Order doesn't matter: it runs before the React plugin compiles JSX.
  plugins: [intentUI({ protectedComponents: ["Protected", "Billing"] }), react()],
});
```

Options: `include`, `exclude`, `protectedComponents`, `attribute`. `tagSource(code, file)` is
exported for other build tools and tests.

Ids only reach the DOM for elements that render their props: HTML elements always do; components
do if they pass unknown props through (Kumo components do).

For webpack and Turbopack use `@intent-ui/build-plugin/webpack` (a loader) or, in Next.js,
`withIntentUI` from `@intent-ui/build-plugin/next`, which sets up both.
