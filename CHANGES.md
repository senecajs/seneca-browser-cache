# Changes

## 0.1.0 2026-11-23

First release, and first entry of this change log. The package was never
published before. The repository came from voxgig
(`voxgig/seneca-browser-store`), where the package was named
`@voxgig/seneca-browser-store`.

* Published as `@seneca/browser-cache`. The plugin name
  (`browser-store`), its export (`browser-store/api`), its messages
  (`sys:browser-store,*`) and the file names (`browser-store.js`,
  `browser-store.d.ts`) are unchanged. `@seneca/browser-store` is a
  different package, from `senecajs/seneca-browser-store`.
* Seneca 4: the plugin runs inside the Seneca 4.0.0 that
  `@seneca/browser` 8 embeds. It has no dependency on `seneca` itself.
* Optional peer dependency `@seneca/browser` `^8.0.0`. npm does not
  install it for you, so an app that loads the bundle from a script tag
  or a vendored copy needs nothing more.
* Development: `seneca-browser` `8.0.0-rc2` is replaced by
  `@seneca/browser` `^8.0.0`, which fixes the error-path crash of
  8.0.0-rc3 and rc4 (`errline`) and the `process.emitWarning` crash on a
  deprecated call.
* Node.js 24 or later for development (`engines.node` `>=24`).
* Tests: new tests run the cache in front of a real remote (the
  `browser` client transport against a local `node:http` backend,
  including remote errors), check that a deprecated call inside the
  bundle is not fatal and that the cache causes no deprecation notice,
  and check which bundle is loaded.
* Not tested: no test runs in a real browser. The tests run the bundle in
  Node.js, with the global `fetch` of Node.js.
