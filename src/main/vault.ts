// ---------------------------------------------------------------------------
// Private (encrypted) workspaces.
//
// The cryptography mirrors the SecureWriter project so the same vaults can be
// read/written by either app:
//   • PBKDF2-HMAC-SHA256, 600_000 iterations, 32-byte key, where the salt is
//     the UTF-8 bytes of a 16-byte random hex string (not the hex-decoded
//     bytes — that detail matters for compatibility).
//   • The derived key is checked against a stored `hash`, then used to unwrap a
//     random 32-byte master key (AES-256-GCM, "combined" ciphertext||tag with a
//     separate 12-byte IV).
//   • Content is encrypted with the master key, one AES-256-GCM container per
//     file: { iv, tag, data } (all base64).
//
// On disk the workspace lives in a hidden folder so it stays out of the way in
// Finder and in the app's own file listings:
//
//   <parent>/.<name>.yestion/            ← the workspace root (hidden)
//       .yestion/workspace.json          ← marker (name, private: true)
//       .yestion/vault.json              ← KDF config + wrapped master key
//       .yestion/content.json            ← every file, encrypted
//
// While a vault is unlocked its files are materialised into a private working
// directory (0700, inside the app's userData) so the rest of the app — tree,
// editors, PDF/image viewers, watcher — can work with ordinary files. Changes
// are re-encrypted into the vault, and the working copy is wiped on lock.
// ---------------------------------------------------------------------------
import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto'
import { basename, dirname, join, relative, sep } from 'node:path'
import { logLine } from './log'

export const VAULT_DIR = '.yestion'
export const VAULT_CONFIG = 'vault.json'
export const VAULT_CONTENT = 'content.json'
const KDF_ITERATIONS = 600_000
const KEY_LENGTH = 32
const GCM_IV = 12

export interface VaultConfig {
  v: number
  name: string
  /** 16 random bytes as a hex string; the KDF salt is this string's UTF-8 bytes. */
  salt: string
  /** Hex of the derived key — used to verify the password. */
  hash: string
  /** Master key sealed with the derived key (SecureWriter "combined" layout). */
  encryptedKey: { iv: string; data: string }
  created: string
  updated: string
}

interface SealedValue {
  iv: string
  tag: string
  data: string
}

interface VaultContent {
  v: number
  updated: string
  files: Record<string, SealedValue>
}

export class VaultError extends Error {
  code: 'wrong-password' | 'no-vault' | 'corrupt' | 'exists'
  constructor(code: VaultError['code'], message: string) {
    super(message)
    this.code = code
  }
}

// ---- primitives -----------------------------------------------------------

export function deriveKey(password: string, saltHex: string): Buffer {
  return pbkdf2Sync(Buffer.from(password, 'utf8'), Buffer.from(saltHex, 'utf8'), KDF_ITERATIONS, KEY_LENGTH, 'sha256')
}

function sealCombined(plain: Buffer, key: Buffer): { iv: string; data: string } {
  const iv = randomBytes(GCM_IV)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return { iv: iv.toString('base64'), data: Buffer.concat([body, tag]).toString('base64') }
}

function openCombined(value: { iv: string; data: string }, key: Buffer): Buffer {
  const iv = Buffer.from(value.iv, 'base64')
  const combined = Buffer.from(value.data, 'base64')
  const body = combined.subarray(0, combined.length - 16)
  const tag = combined.subarray(combined.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()])
}

function seal(plain: Buffer, key: Buffer): SealedValue {
  const iv = randomBytes(GCM_IV)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: body.toString('base64')
  }
}

function open(value: SealedValue, key: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()])
}

// ---- config / creation ----------------------------------------------------

export function vaultRootFor(parentDir: string, name: string): string {
  const safe = name
    .trim()
    .replace(/[/:]/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 60) || 'Private'
  return join(parentDir, `.${safe}.yestion`)
}

export async function isVault(root: string): Promise<boolean> {
  try {
    await fs.access(join(root, VAULT_DIR, VAULT_CONFIG))
    return true
  } catch {
    return false
  }
}

export async function readVaultConfig(root: string): Promise<VaultConfig | null> {
  try {
    const raw = await fs.readFile(join(root, VAULT_DIR, VAULT_CONFIG), 'utf-8')
    return JSON.parse(raw) as VaultConfig
  } catch {
    return null
  }
}

/** Create a new encrypted workspace. Returns the hidden root path. */
export async function createVault(parentDir: string, name: string, password: string): Promise<string> {
  const root = vaultRootFor(parentDir, name)
  if (await isVault(root)) throw new VaultError('exists', 'A private workspace with that name already exists here.')
  await fs.mkdir(join(root, VAULT_DIR), { recursive: true })

  const salt = randomBytes(16).toString('hex')
  const derived = deriveKey(password, salt)
  const masterKey = randomBytes(KEY_LENGTH)
  const now = new Date().toISOString()
  const config: VaultConfig = {
    v: 2,
    name: name.trim(),
    salt,
    hash: derived.toString('hex'),
    encryptedKey: sealCombined(masterKey, derived),
    created: now,
    updated: now
  }
  await fs.writeFile(join(root, VAULT_DIR, VAULT_CONFIG), JSON.stringify(config, null, 2), 'utf-8')
  await fs.writeFile(
    join(root, VAULT_DIR, VAULT_CONTENT),
    JSON.stringify({ v: 2, updated: now, files: {} } satisfies VaultContent),
    'utf-8'
  )
  await fs.writeFile(
    join(root, VAULT_DIR, 'workspace.json'),
    JSON.stringify({ name: name.trim(), private: true, createdAt: now }, null, 2),
    'utf-8'
  )
  // Keep the decrypted working copy of an unlocked vault private too.
  await fs.chmod(join(root, VAULT_DIR), 0o700).catch(() => {})
  return root
}

/** Verify the password and return the unwrapped master key. */
export async function unlockVault(root: string, password: string): Promise<Buffer> {
  const config = await readVaultConfig(root)
  if (!config) throw new VaultError('no-vault', 'That folder is not a private workspace.')
  const derived = deriveKey(password, config.salt)
  if (derived.toString('hex') !== config.hash.toLowerCase()) {
    throw new VaultError('wrong-password', 'Incorrect password.')
  }
  try {
    return openCombined(config.encryptedKey, derived)
  } catch {
    throw new VaultError('corrupt', 'The vault key could not be unwrapped.')
  }
}

// ---- unlocked session -----------------------------------------------------

export interface VaultSession {
  /** Hidden folder that holds the encrypted files. */
  root: string
  name: string
  masterKey: Buffer
  /** Where decrypted files live while unlocked (0700, inside userData). */
  workDir: string
  snapshot: Map<string, string>
  sealed: Map<string, SealedValue>
  dirty: boolean
  /** Entries that could not be decrypted on unlock (see openVaultSession). */
  unreadable: string[]
}

let session: VaultSession | null = null
let flushTimer: NodeJS.Timeout | null = null
let flushing: Promise<void> | null = null

export function currentVault(): VaultSession | null {
  return session
}

export function vaultWorkDir(root: string): string {
  const id = createHash('sha256').update(root).digest('hex').slice(0, 16)
  return join(app.getPath('userData'), 'vaults', id)
}

export async function openVaultSession(root: string, password: string): Promise<VaultSession> {
  if (session && session.root !== root) await closeVaultSession()
  const masterKey = await unlockVault(root, password)
  const config = (await readVaultConfig(root))!
  const workDir = vaultWorkDir(root)

  // Fresh working copy every unlock so nothing stale survives.
  await fs.rm(workDir, { recursive: true, force: true })
  await fs.mkdir(workDir, { recursive: true, mode: 0o700 })
  await fs.chmod(workDir, 0o700).catch(() => {})

  const sealed = new Map<string, SealedValue>()
  let content: VaultContent | null = null
  try {
    content = JSON.parse(await fs.readFile(join(root, VAULT_DIR, VAULT_CONTENT), 'utf-8')) as VaultContent
  } catch {
    content = { v: 2, updated: '', files: {} }
  }
  const unreadable: string[] = []
  for (const [rel, value] of Object.entries(content.files ?? {})) {
    try {
      const bytes = open(value, masterKey)
      const target = join(workDir, rel)
      await fs.mkdir(dirname(target), { recursive: true })
      await fs.writeFile(target, bytes)
      sealed.set(rel, value)
    } catch {
      // Can't decrypt this one. Keep its ciphertext in the map anyway: every
      // flush rewrites the container from `sealed`, so dropping it here would
      // delete the file from the vault the first time anything else was saved.
      // It stays as-is, and the caller tells the user it was skipped.
      sealed.set(rel, value)
      unreadable.push(rel)
    }
  }
  if (unreadable.length > 0) {
    void logLine(
      `vault: ${unreadable.length} file(s) could not be decrypted and were left sealed: ${unreadable.join(', ')}`,
      'error'
    )
  }

  session = {
    root,
    name: config.name || basename(root).replace(/^\./, '').replace(/\.yestion$/, ''),
    masterKey,
    workDir,
    snapshot: new Map(),
    sealed,
    dirty: false,
    unreadable
  }
  await takeSnapshot(session)
  return session
}

async function listFiles(dir: string, base = dir, out: string[] = []): Promise<string[]> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === '.yestion' || e.name === '.pi') continue
    const abs = join(dir, e.name)
    if (e.isDirectory()) await listFiles(abs, base, out)
    else if (e.isFile()) out.push(relative(base, abs).split(sep).join('/'))
  }
  return out
}

/**
 * Identity of a working-copy file for change detection. ctime is part of it
 * because it cannot be back-dated: an edit that preserves the size and restores
 * the mtime (`rsync -t`, `git checkout`, most sync tools) would otherwise look
 * unchanged and never get re-encrypted.
 */
function stampOf(st: { size: number; mtimeMs: number; ctimeMs: number }): string {
  return `${st.size}:${st.mtimeMs}:${st.ctimeMs}`
}

async function takeSnapshot(s: VaultSession): Promise<void> {
  s.snapshot = new Map()
  for (const rel of await listFiles(s.workDir)) {
    try {
      const st = await fs.stat(join(s.workDir, rel))
      s.snapshot.set(rel, stampOf(st))
    } catch {
      /* vanished */
    }
  }
}

/**
 * Encrypt whatever changed in the working directory into the vault. Unchanged
 * files reuse their existing ciphertext, so a save only re-encrypts the files
 * that actually changed (the container is rewritten as a whole).
 */
export async function flushVault(): Promise<void> {
  const s = session
  if (!s) return
  if (flushing) return flushing
  flushing = (async () => {
    const current = await listFiles(s.workDir)
    const seen = new Set<string>()
    for (const rel of current) {
      seen.add(rel)
      const abs = join(s.workDir, rel)
      let st: Awaited<ReturnType<typeof fs.stat>>
      try {
        st = await fs.stat(abs)
      } catch {
        continue
      }
      const stamp = stampOf(st)
      if (s.snapshot.get(rel) === stamp && s.sealed.has(rel)) continue
      try {
        const bytes = await fs.readFile(abs)
        s.sealed.set(rel, seal(bytes, s.masterKey))
        s.snapshot.set(rel, stamp)
        s.dirty = true
      } catch {
        /* unreadable; try again next flush */
      }
    }
    for (const rel of [...s.sealed.keys()]) {
      // Entries we couldn't decrypt have no working-copy file by design; they
      // are not deletions, and sweeping them here would lose the data.
      if (s.unreadable.includes(rel)) continue
      if (!seen.has(rel)) {
        s.sealed.delete(rel)
        s.snapshot.delete(rel)
        s.dirty = true
      }
    }
    if (!s.dirty) return
    const content: VaultContent = {
      v: 2,
      updated: new Date().toISOString(),
      files: Object.fromEntries([...s.sealed.entries()].sort(([a], [b]) => a.localeCompare(b)))
    }
    const target = join(s.root, VAULT_DIR, VAULT_CONTENT)
    const tmp = target + '.tmp'
    await fs.writeFile(tmp, JSON.stringify(content), 'utf-8')
    await fs.rename(tmp, target)
    const config = await readVaultConfig(s.root)
    if (config) {
      config.updated = content.updated
      await fs.writeFile(join(s.root, VAULT_DIR, VAULT_CONFIG), JSON.stringify(config, null, 2), 'utf-8')
    }
    s.dirty = false
  })()
  try {
    await flushing
  } finally {
    flushing = null
  }
}

/** Coalesce bursts of edits into one encryption pass. */
export function scheduleVaultFlush(delay = 900): void {
  if (!session) return
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushVault()
  }, delay)
}

export async function closeVaultSession(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  const s = session
  if (!s) return
  try {
    await flushVault()
  } catch {
    /* best effort */
  }
  session = null
  await fs.rm(s.workDir, { recursive: true, force: true }).catch(() => {})
}

/** Re-key an existing vault under a new password (keeps the same master key). */
export async function changeVaultPassword(root: string, current: string, next: string): Promise<void> {
  const masterKey = await unlockVault(root, current)
  const config = await readVaultConfig(root)
  if (!config) throw new VaultError('no-vault', 'That folder is not a private workspace.')
  const salt = randomBytes(16).toString('hex')
  const derived = deriveKey(next, salt)
  config.salt = salt
  config.hash = derived.toString('hex')
  config.encryptedKey = sealCombined(masterKey, derived)
  config.updated = new Date().toISOString()
  await fs.writeFile(join(root, VAULT_DIR, VAULT_CONFIG), JSON.stringify(config, null, 2), 'utf-8')
}
