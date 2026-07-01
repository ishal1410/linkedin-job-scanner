# Contributing

Thanks for taking a look. This is a small project, so contributing is easy.

## The layout

- `scan.mjs` runs the scan (fetch, filter, write).
- `lib.mjs` holds the pure helpers (matching, CSV, HTML decoding).
- `config.json` is the user's settings.
- `test.mjs` covers the helpers in `lib.mjs`.

## Before you open a pull request

Run the tests and make sure the scanner still parses:

```bash
npm test
node --check scan.mjs
```

CI runs the same checks on Node 18, 20, and 22, so a green local run usually means a green PR.

## A few guidelines

- Keep it dependency-free. The whole point is that it runs with just Node.
- If you change how a helper in `lib.mjs` behaves, add or update a test for it.
- Never add anything that logs into LinkedIn or uses a session cookie. Public endpoints only. That rule is the reason this tool is safe to use.
- Match the existing style. Small, readable, commented where it isn't obvious.

## Reporting a bug or asking for a feature

Open an issue. There are templates to walk you through it. The more detail (your `config.json`, what you ran, what happened), the faster it gets sorted.
