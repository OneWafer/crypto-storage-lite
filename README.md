<!--
 * @Author: OneWafer
 * @Date: 2025-01-09 10:53:45
 * @LastEditors: OneWafer
 * @Description: Do not edit
-->
# crypto-storage-lite

<div>
  <h3 align="center">
    A tiny browser storage wrapper with AES-GCM encryption for localStorage and sessionStorage — fully synchronous, zero setup.
  </h3>
</div>

<p align="center">
  <a href="https://www.npmjs.com/package/crypto-storage-lite">
    <img src="https://img.shields.io/npm/dm/crypto-storage-lite.svg" alt="npm downloads" height="18">
  </a>
  <a href="https://www.npmjs.com/package/crypto-storage-lite">
    <img src="https://img.shields.io/npm/v/crypto-storage-lite.svg" alt="npm version" height="18">
  </a>
  <a href="https://github.com/OneWafer/crypto-storage-lite">
    <img src="https://img.shields.io/npm/l/crypto-storage-lite.svg" alt="MIT license" height="18">
  </a>
</p>

## Features

- ⚡ Fully synchronous — no `async`/`await`, calls behave like `localStorage` itself
- 🔒 AES-256-GCM via [@noble/ciphers](https://github.com/paulmillr/noble-ciphers) — authenticated encryption, random IV per write
- 🔑 Zero configuration — the encryption key is built in, no `configureStorage()` needed to get started
- 💾 `localStorage` and `sessionStorage` drivers, plus `createStorage()` for your own storage area
- 📦 No runtime dependencies for your app (`@noble/ciphers` is bundled into the build)
- 🌐 Works on plain http — no secure context required
- 🛡️ SSR-safe: falls back to an in-memory store where no storage area exists or writes are blocked
- 🧹 `clear()` only touches this library's keys

## Install

```
npm install crypto-storage-lite
```

## Usage

```ts
import { local, session } from 'crypto-storage-lite'

local.set('name', 'John Doe')
local.get('name') // 'John Doe'

// Encryption is per-write unless you turn it on globally
local.set('token', { refresh: 'abc' }, { encrypt: true })
local.get('token') // { refresh: 'abc' }

session.set('tab', 'only this tab')

local.has('name') // true
local.keys() // string[]
local.remove('name')

local.clear() // deletes only keys written by this library
local.clearAll() // deletes everything in localStorage
```

Turning encryption on for the whole app, and failing soft on corrupted data:

```ts
import { configureStorage } from 'crypto-storage-lite'

configureStorage({
	encryptByDefault: true,
	onError: error => reportToSentry(error) // or 'throw' | 'ignore'
})
```

### API

Every driver implements the same `StorageDriver` interface:

| Method                      | Returns     | Notes                                 |
| --------------------------- | ----------- | ------------------------------------- |
| `get<T>(key, validate?)`    | `T \| null` | `null` when missing or foreign        |
| `set(key, value, options?)` | `void`      | `{ encrypt? }` overrides the default  |
| `has(key)`                  | `boolean`   | reads the format tag; never decrypts  |
| `remove(key)`               | `void`      | only removes a key this library wrote |
| `clear()`                   | `void`      | only this library's keys              |
| `clearAll()`                | `void`      | the entire storage area               |
| `keys()`                    | `string[]`  | this library's keys only              |
| `isPersistent`              | `boolean`   | `false` on the in-memory fallback     |

`validate` is an optional type guard. A value that fails it is treated like
corrupted data and goes through `onError`:

```ts
const user = local.get('user', (v): v is { name: string } => typeof v === 'object' && v !== null && 'name' in v)
```

### Options

```ts
configureStorage({
	onError: 'throw' | 'ignore' | (error: StorageError) => void, // default 'throw'
	encryptByDefault: false, // default false
	key: new Uint8Array(32) // default: the built-in key
})
```

- `configureStorage()` is optional — encryption works out of the box.
- `onError` controls how read failures are surfaced. `'ignore'` logs a warning and
  resolves to `null`; a function receives every read-path `StorageError` (use it
  for telemetry) and also resolves to `null`; `'throw'` (the default) keeps
  failures visible.
- `encryptByDefault` encrypts every write. Override it per call with `{ encrypt: false }`.
- `key` replaces the built-in AES-256 key. Use it when you need a real trust
  boundary — see [Security notes](#security-notes).
- Independent of `onError`, a _blocked_ storage area (Safari private mode, a
  sandboxed iframe) silently switches the driver to its in-memory fallback, so
  the app keeps working for the life of the page. Writes that fail on a usable
  area still throw (`QUOTA_EXCEEDED` etc.).
- Invalid values throw `TypeError` immediately.
- `resetConfig()` restores the defaults (useful in tests).

### Custom drivers

```ts
import { createStorage, resolveWebStorage } from 'crypto-storage-lite'

// Namespaced keys inside localStorage: keys()/clear()/remove() then select by
// prefix instead of reading every value, and other apps' keys are untouched.
const appStorage = createStorage(resolveWebStorage('localStorage'), {
	id: 'my-app', // mixed into the authenticated data
	prefix: 'my-app:', // prepended to every key in the storage area
	encrypt: true // encrypt by default for this driver
})
```

`createStorage(resolveArea, options?)`

| Option    | Default     | Meaning                                                                                        |
| --------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `id`      | `'default'` | Authenticated storage identity: a payload written by one driver cannot be decrypted by another |
| `prefix`  | `''`        | Key namespace; when set, selection is by name rather than value scan                           |
| `encrypt` | `undefined` | Encrypt by default for this driver (overrides `encryptByDefault`)                              |

`resolveArea` is called lazily and may return `null` (SSR) or throw. The driver
probes `local`/`session` storage once on first use to confirm writes actually
work, and falls back to memory when they don't.

### Errors

All failures throw `StorageError` with a stable `code`:

```ts
import { isStorageError, StorageError } from 'crypto-storage-lite'

try {
	local.set('big', hugeValue)
} catch (error) {
	if (isStorageError(error) && error.code === 'QUOTA_EXCEEDED') {
		// fall back to something else
	}
}
```

Prefer `isStorageError()` over `instanceof` — it also recognises errors from a
second copy of the library (duplicate dependency, iframe).

Codes: `CRYPTO_UNAVAILABLE`, `DECRYPT_FAILED`, `SERIALIZE_FAILED`, `PARSE_FAILED`,
`QUOTA_EXCEEDED`, `STORAGE_UNAVAILABLE`, `READ_FAILED`, `WRITE_FAILED`.

### Values and fidelity

Values are stored as JSON, so the usual JSON rules apply:
- `undefined`, functions and symbols are rejected on write (`SERIALIZE_FAILED`)
  instead of silently disappearing.
- `NaN` / `Infinity` become `null`; `Date` becomes an ISO string; `Map`, `Set`
  and class instances become plain objects. Convert them yourself if the type
  matters.
- `set(key, null)` stores `null`, which reads back as `null` — indistinguishable
  from a missing key. Use `has(key)` when the difference matters.

## Security notes

Be clear about the threat model before relying on this.
- **The built-in key is public.** It ships in your bundle, so it is visible to
  anyone who can read your source or your `node_modules`. This is deliberate:
  it defends against someone reading `localStorage` in devtools, a casual user
  editing a value, a key copied between sites or tenants, and XSS payloads that
  dump the whole storage area. It does **not** defend against an attacker who can
  already execute JavaScript in your page, or anyone who has your bundle — they
  can call `get()` (the key lives in memory) or read the key out of the source.
  Treat this as obfuscation with integrity checks, not as a trust boundary. Pass
  your own key via `configureStorage({ key })` if you need one.
- Each write uses a fresh 12-byte IV, and the storage identity plus the key name
  are authenticated as additional data, so a ciphertext cannot be moved to a
  different key, a different storage area, or another driver, and its content
  cannot be modified. Tampered or foreign data ⇒ `DECRYPT_FAILED`.
- Encryption runs through [@noble/ciphers](https://github.com/paulmillr/noble-ciphers)
  (MIT), which is audited and bundled into the build. Only `crypto.getRandomValues`
  is taken from the platform, for IV generation — so unlike `crypto.subtle`,
  encryption also works outside secure contexts.
- Values are still JSON — encryption hides content, it does not hide key names or
  value sizes.

## Stored format

Every value is written with a tag, so `clear()` and `keys()` can tell this
library's data apart from everyone else's:

| Tag     | Meaning                     |
| ------- | --------------------------- |
| `cs1p:` | plain JSON                  |
| `cs1e:` | `<iv>.<ciphertext>`, base64 |

The `cs1` is a format version: if the stored shape ever changes incompatibly,
bumping it makes older values be ignored rather than misread.

## Development

```
pnpm install
pnpm test        # vitest, no browser needed
pnpm typecheck
pnpm lint
pnpm build
```

Tests cover the crypto layer (round-trip, tamper detection, context binding),
the driver (values, ownership, encryption default, quotas, blocked storage,
runtime downgrade) and the public API.

## License

MIT © OneWafer

Bundled third-party code: [@noble/ciphers](https://github.com/paulmillr/noble-ciphers) (MIT, © Paul Miller / Thomas Pornin) — see [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
