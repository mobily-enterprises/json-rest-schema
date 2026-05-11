# Fixing Plan

Release target: fix the confirmed release-blocking audit findings with small,
portable changes and regression tests. Do not use local-path hacks, silent
fallbacks, or machine-specific assumptions.

## 1. Prototype-Sensitive Paths

- [x] Root cause: dotted-path helpers and schema lookups use normal object
  containers plus prototype-aware property access, so keys such as `__proto__`,
  `constructor`, `prototype`, and inherited names can pollute objects or crash
  validation.
- [x] Smallest correct fix: add one shared safe path utility for normalizing,
  validating, reading, and writing dotted paths.
- [x] Reject path segments named `__proto__`, `prototype`, or `constructor`.
- [x] Use null-prototype containers or otherwise guarantee path writes cannot
  mutate prototypes.
- [x] Update `src/utils/error-helpers.js`, `src/utils/adapter-helpers.js`, and
  `src/adapters/react-hook-form.js` to use the shared path utility.
- [x] In `src/core/Schema.js`, replace schema/error map checks such as
  `this.structure[fieldName] === undefined` with `Object.hasOwn(...)`.
- [x] Why this will not drift: all adapters and error helpers will use one path
  implementation and schema membership will consistently mean own properties.
- [x] Alternatives rejected: escaping or silently rewriting dangerous path
  segments, because that hides invalid input and creates surprising output keys.
- [x] Regression tests: malicious dotted paths must throw and must not mutate
  `{}`; input fields named `toString`, `constructor`, and `__proto__` must
  return controlled `FIELD_NOT_ALLOWED` errors.

## 2. Integer `min` / `max` Runtime Drift

- [x] Root cause: runtime `min` and `max` validators only apply to
  `type: 'number'`, while transport export applies them to both `number` and
  `integer`.
- [x] Smallest correct fix: apply runtime `min` and `max` checks to both
  `number` and `integer`.
- [x] Prefer a tiny shared predicate for numeric definitions if it keeps runtime
  and export logic aligned without broad refactoring.
- [x] Why this will not drift: the runtime validator and JSON Schema exporter
  will agree on which field types support numeric bounds.
- [x] Alternatives rejected: removing integer bounds from JSON Schema, because
  runtime should honor declared schema contracts instead.
- [x] Regression tests: integer below `min` fails with `MIN_VALUE`; integer above
  `max` fails with `MAX_VALUE`; exported JSON Schema still includes
  `minimum` / `maximum`.

## 3. `dateTime` And `timestamp` Null Bugs

- [x] Root cause: temporal type handlers encode nullability decisions
  themselves. `dateTime` returns `null` for invalid non-empty values, and
  `timestamp` treats numeric zero as nullable because it checks falsiness.
- [x] Smallest correct fix: keep null and empty-string handling in
  `_castValue`; make temporal type handlers only parse valid values or throw
  type errors.
- [x] Change `dateTime` so invalid non-empty values throw `TYPE_CAST_FAILED`.
- [x] Change `timestamp` so finite `0` remains `0`; only explicit nullability
  paths produce `null`.
- [x] Why this will not drift: nullability behavior stays centralized in one
  validation layer instead of being reimplemented by each type handler.
- [x] Alternatives rejected: documenting current behavior, because accepting
  invalid dates is a contract bug.
- [x] Regression tests: invalid `dateTime` fails; `timestamp: 0` remains `0`;
  explicit nullable `null` still works.

## 4. Array `undefined` And Sparse Slots

- [ ] Root cause: `_validateArrayItems()` sends item values directly into the
  normalizer without the explicit-undefined handling used by top-level fields
  and typed object maps.
- [ ] Smallest correct fix: add the same explicit-undefined branch to array item
  validation before item normalization or schema-backed item validation.
- [ ] Treat sparse slots as invalid under `rejectExplicitUndefined` rather than
  materializing holes as empty strings or throwing raw `TypeError`s.
- [ ] Why this will not drift: top-level fields, object-map values, and array
  items will all honor the same operation flag.
- [ ] Alternatives rejected: compacting arrays or skipping holes, because either
  silently changes caller data.
- [ ] Regression tests: `[undefined]`, sparse arrays, and schema-backed
  undefined items return item-path `TYPE_CAST_FAILED` errors.

## 5. Registry Merge Handler Equivalence

- [ ] Root cause: factory merge conflict detection compares
  `Function.prototype.toString()`, which cannot see closed-over state.
- [ ] Smallest correct fix: treat handlers as equivalent only when they are the
  same function object.
- [ ] If cross-package handler equivalence is required later, introduce explicit
  stable handler metadata instead of inferring behavior from source text.
- [ ] Why this will not drift: equivalence becomes identity-based or declared,
  not guessed from formatting/source text.
- [ ] Alternatives rejected: hashing or comparing source text, because closures
  can still behave differently with identical source.
- [ ] Regression tests: duplicate custom type and validator closures with
  identical source text but different captured state must throw during merge.

## 6. Plain-Object Checks And Root Input Validation

- [ ] Root cause: current `isPlainObject()` only rejects `null` and arrays, and
  full operation validation does not assert plain-object root input.
- [ ] Smallest correct fix: define a real plain-object check that accepts only
  `Object.prototype` or null-prototype objects.
- [ ] Use that check in the built-in `object` type.
- [ ] Call `_assertPlainObjectInput()` from `validateWith()` so `create`,
  `replace`, `patch`, and custom operation aliases reject invalid root inputs.
- [ ] Why this will not drift: root inputs, object fields, nested contracts, and
  adapter assumptions all share the same object contract.
- [ ] Alternatives rejected: allowing class instances by default, because nested
  validation expects predictable own enumerable data.
- [ ] Regression tests: root arrays, `null`, `Date`, `RegExp`, and `Map` fail
  clearly; object fields reject `Date`, `RegExp`, and `Map`.

## 7. Stateful `pattern` And Whitespace `notEmpty`

- [ ] Root cause: `pattern` reuses caller-provided `RegExp` instances, so
  global/sticky regex `lastIndex` state changes validation results. `notEmpty`
  checks `valueBeforeCast`, so whitespace-only strings pass after trimming.
- [ ] Smallest correct fix: clone `RegExp` values before testing, or reset
  `lastIndex` before every test. Prefer cloning so user-owned regex objects are
  not mutated.
- [ ] Change `notEmpty` to evaluate the post-cast value for string fields.
- [ ] Why this will not drift: validators become deterministic per call and
  string emptiness is checked after normalization.
- [ ] Alternatives rejected: requiring users to avoid global regexes, because
  the library can make matching deterministic itself.
- [ ] Regression tests: repeated validations with `/a/g` all pass consistently;
  `"   "` with `notEmpty: true` fails.

## 8. Packaging And Repo Hygiene

- [ ] Root cause: package metadata and tracked files drifted from release
  hygiene rules: GPL is declared without a top-level `LICENSE`, repository URL
  is malformed, and `node_modules/flatted` is tracked despite `.gitignore`.
- [ ] Smallest correct fix: add a top-level GPL-3.0-only `LICENSE`, fix the
  repository URL to `git+https://github.com/mobily-enterprises/json-rest-schema.git`,
  and remove tracked `node_modules/**` files from git.
- [ ] Add release checks for `npm pack --dry-run`, `git ls-files node_modules`,
  and clean status after install.
- [ ] Why this will not drift: package contents and repository hygiene become
  mechanically verified.
- [ ] Alternatives rejected: keeping vendored `flatted` in `node_modules`,
  because the package manager already makes that dependency reproducible.
- [ ] Regression checks: tarball includes `LICENSE`; `git ls-files node_modules`
  is empty; `npm ci` does not dirty tracked files.

## Non-Blocking Follow-Ups

- [ ] Upgrade `flatted` to a non-vulnerable release and confirm
  `npm audit --omit=dev` passes.
- [ ] Remove the optional `knex` peer/dev dependency unless a supported runtime
  adapter uses it.
- [ ] Decide whether to ship TypeScript declarations for package consumers.

## Verification Checklist

- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npm run test:demos`
- [ ] `npm pack --dry-run`
- [ ] `npm ls --depth=0`
- [ ] `npm --prefix demos/react-rhf ls --depth=0`
- [ ] `npm --prefix demos/vue-vuetify ls --depth=0`
- [ ] In a temp worktree: `npm ci`
- [ ] In a temp worktree: install demo deps with `npm ci`
- [ ] In a temp worktree: `npm run docs:build`
