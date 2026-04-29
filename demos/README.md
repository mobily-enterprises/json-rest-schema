# Demo Apps

These demo apps are intentionally small. They are not starter kits or framework wrappers.

They exist to prove that the adapters work in real browser runtimes against the current checkout.

## Install

From the repo root:

```bash
npm run demo:install
```

## Run the React demo

```bash
npm run demo:react
```

## Run the Vue + Vuetify demo

```bash
npm run demo:vue
```

## Run the browser smoke tests

Install Playwright's Chromium browser once if needed:

```bash
npx playwright install chromium
```

Then run:

```bash
npm run test:demos
```

## How the demos reference the library

The demos do not depend on a published npm copy of `json-rest-schema`.

Instead, each Vite config aliases the package imports back to the local source files in this repo. That keeps the demos honest:

- they always exercise the current checkout
- they do not rely on machine-local linking
- Playwright verifies the same code that the unit tests and docs describe
