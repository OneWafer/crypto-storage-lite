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
- 🛡️ SSR-import-safe: in-memory fallback; request-specific data needs a separate driver per request
- 🧹 `clear()` clears tagged keys or your exclusive namespace

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

| Method                      | Returns     | Notes                                       |
| --------------------------- | ----------- | ------------------------------------------- |
| `get<T>(key, validate?)`    | `T \| null` | `null` when missing or foreign              |
| `set(key, value, options?)` | `void`      | `{ encrypt? }` overrides the default        |
| `has(key)`                  | `boolean`   | checks the format tag; never decrypts       |
| `remove(key)`               | `void`      | tagged key, or any key in your namespace    |
| `clear()`                   | `void`      | tagged keys, or every key in your namespace |
| `clearAll()`                | `void`      | the entire storage area, even with a prefix |
| `keys()`                    | `string[]`  | tagged keys, or all names in your namespace |
| `isPersistent`              | `boolean`   | `false` on the in-memory fallback           |

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
- `onError` controls `StorageError` failures in `get()` and `has()`, including
  rejected validation. `'ignore'` calls `console.warn` and returns `null` / `false`;
  a handler receives the error and returns the same miss; `'throw'` (the default)
  throws. Errors thrown by a validator that are not `StorageError` are not swallowed.
- `encryptByDefault` affects writes only. Override it per call with `{ encrypt: false }`.
  Reads still accept both plain and encrypted records; this is not a strict encryption mode.
- `key` replaces the built-in key and must be a 32-byte `Uint8Array`. A custom key
  requires appropriate key management — see [Security notes](#security-notes).
  Changing or resetting it affects every driver immediately: old ciphertext needs
  its original key. Migrate or remove old encrypted data before changing the key.
- Configuration is global and successive calls merge options. `getConfig()` returns
  a frozen snapshot with a separate key buffer; changing that buffer does not update
  the library. Never change global configuration per SSR request.
- Missing or initially blocked storage uses an in-memory fallback independently of
  `onError`; quota failures retain the real area. See [Fallback and SSR](#fallback-and-ssr).
- Configuration and driver options are validated at runtime. Invalid identity/prefix
  types, encryption flags or keys throw `TypeError`; invalid configuration leaves
  the previous configuration unchanged.
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

| Option    | Default     | Meaning                                                         |
| --------- | ----------- | --------------------------------------------------------------- |
| `id`      | `'default'` | Authenticated identity, not a listing/deletion namespace        |
| `prefix`  | `''`        | Exclusive key namespace; selection is by name rather than value |
| `encrypt` | `undefined` | Default encryption for writes, overriding the global default    |

Use distinct, non-overlapping prefixes for independent applications. A prefix
owns every matching key: `keys()` lists unrecognised records, and `clear()` /
`remove()` delete them, while `get()` / `has()` still require a recognised format
tag. Without a prefix, listing and deletion select by the format tag, regardless
of `id`; different identities do not isolate those operations. `clearAll()` always
clears the entire underlying area, even on a namespaced driver.

### Fallback and SSR

`resolveArea` is called lazily and may return `null` or throw. On first use the
driver probes the area with a temporary key without overwriting existing data,
and attempts to remove the probe even when verification fails. Unusable storage
falls back to memory. A quota error does not hide existing data behind a fallback:
reads keep using the real area and writes report `QUOTA_EXCEEDED`.

After a successful probe, a blocked direct read in `get()` / `has()` downgrades
to memory and reports `READ_FAILED` (subject to `onError`). This also applies to
the ownership read before an unprefixed `remove()`, but deletion failures are
never ignored. Key scans instead skip individual unreadable entries without
changing the driver's storage mode. Blocked writes or underlying delete operations throw
`STORAGE_UNAVAILABLE` without themselves downgrading. If the accessor later returns
`null` or throws, the driver switches to memory independently of the operation.

Once a driver falls back, it does not automatically reconnect or migrate data.
Use `isPersistent` to observe its current storage mode. A new driver can probe
again, but it does not inherit another driver's in-memory values.

**SSR-import-safe does not mean request-isolated.** The exported `local` and
`session` instances are module-level singletons: their memory may be shared by
all requests in one server process. Create a driver inside each request handler:

```ts
import { createStorage } from 'crypto-storage-lite'

export function createRequestStorage() {
	return createStorage(() => null)
}
```

Call this factory once per request, not at module scope, and pass that instance
to the request's code. Its data is temporary and is not browser storage or a
server-side session. Global configuration is still shared: configure it once at
startup, never with a request-specific key or error handler.

### Errors

`StorageError` carries a stable `code` for storage and data failures.
Invalid configuration or options throw `TypeError`. Exceptions from error handlers
and non-storage exceptions from validators propagate. `get()` / `has()` may turn storage failures into misses
through `onError`, and key scans skip unreadable entries. Writes and deletes do
not use that policy: an ownership read failure in `remove()` throws `READ_FAILED`
instead of silently returning success.

Handle a write failure by its code:

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
- `undefined`, functions and symbols encountered during JSON serialization,
  including nested values, are rejected (`SERIALIZE_FAILED`). Sparse array entries
  and `toJSON()` results of these types are also rejected instead of disappearing.
- Circular references, `BigInt` and throwing JSON conversions also fail with
  `SERIALIZE_FAILED`. Serialization finishes before writing, so a rejected value
  does not overwrite an existing record.
- `NaN` / `Infinity` become `null`; `Date` becomes an ISO string; `Map`, `Set`
  and class instances follow normal JSON conversion rules. Symbol-keyed and
  non-enumerable properties are skipped. Convert values yourself if fidelity matters.
- `set(key, null)` stores `null`, which reads back as `null` — indistinguishable
  from a missing key. Use `has(key)` when the difference matters.

## Security notes

Be clear about the threat model before relying on this.
- **The built-in key is public.** It ships in every bundle and only obfuscates
  casual inspection. Anyone with the bundle can decrypt or forge encrypted data.
  It is not a trust boundary and does not protect against XSS or other JavaScript
  executing in your page. A custom key requires secure generation and suitable
  key management; it still cannot protect data from code executing in that page.
  An all-zero `new Uint8Array(32)` is an API-shape example, not a secure key.
- Each encrypted write uses a fresh 12-byte IV. AES-GCM authenticates the
  ciphertext and the context formed from `id`, a NUL separator and the fully
  qualified key. Changing that authenticated context or the sealed data fails
  authentication. Avoid NUL characters in identities and key names so context
  components cannot be confused. The built-in local and session drivers use
  different identities; custom drivers use `'default'` unless you provide one.
- **Origin and tenant isolation are not automatic.** The context does not include
  the site origin or tenant. Data copied to the same authenticated context with
  the same key remains decryptable, even in another area or application. Choose
  distinct application/tenant identities and non-overlapping prefixes as needed;
  these client-side conventions are not server-side authorization.
- **Default encryption is not strict authenticated reading.** Reads accept plain
  `cs1p:` records even when encryption is enabled for writes. Someone who can
  modify storage can replace a whole encrypted record with valid plain JSON.
  Validation may check its shape, but cannot establish its authenticity.
- **Old ciphertext can be replayed under the same key and context.** Fresh IVs
  make repeated writes produce different ciphertexts but do not detect replay.
  Do not use storage values as proof of permissions or freshness; enforce those
  checks on a trusted server.
- Encryption runs through [@noble/ciphers](https://github.com/paulmillr/noble-ciphers)
  (MIT), which is audited and bundled into the build. Only `crypto.getRandomValues`
  is taken from the platform, for IV generation — so unlike `crypto.subtle`,
  encryption also works outside secure contexts.
- Values are still JSON — encryption hides content, it does not hide key names or
  value sizes.

## Stored format

Every value is written with a tag for decoding and, without a prefix, for
ownership checks. Namespaced listing and deletion instead own all matching keys:

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
