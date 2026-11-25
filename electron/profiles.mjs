// @ts-check
// Saved connection profiles. Tokens are encrypted with the operating system keychain
// (Electron safeStorage) and never leave the main process; the interface only sees
// whether a token is stored.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * @typedef {{ id: string, name: string, url: string, token?: string, coreToken?: string }} StoredProfileInput
 * @typedef {{ isEncryptionAvailable(): boolean, encryptString(value: string): Buffer, decryptString(value: Buffer): string }} SecretBox
 */

export class ProfileStore {
  /** @param {string} directory @param {SecretBox} secrets */
  constructor(directory, secrets) {
    this.file = path.join(directory, 'profiles.json');
    this.secrets = secrets;
  }

  async #readAll() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'));
      return Array.isArray(parsed.profiles) ? parsed.profiles : [];
    } catch (error) {
      if (/** @type {any} */ (error).code === 'ENOENT') return [];
      throw error;
    }
  }

  /** @param {any[]} profiles */
  async #writeAll(profiles) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify({ version: 1, profiles }, null, 2), { mode: 0o600 });
    await fs.rename(temporary, this.file);
  }

  /** @param {string | undefined} value */
  #seal(value) {
    if (!value) return null;
    if (!this.secrets.isEncryptionAvailable()) return null;
    return this.secrets.encryptString(value).toString('base64');
  }

  /** @param {string | null | undefined} value */
  #open(value) {
    if (!value) return '';
    return this.secrets.decryptString(Buffer.from(value, 'base64'));
  }

  /** Profiles without secrets, for the interface. */
  async list() {
    return (await this.#readAll()).map((profile) => ({
      id: profile.id,
      name: profile.name,
      url: profile.url,
      hasToken: Boolean(profile.token),
      hasCoreToken: Boolean(profile.coreToken)
    }));
  }

  /**
   * Saves a profile. Empty token fields keep the stored token.
   * @param {Partial<StoredProfileInput>} input
   */
  async save(input) {
    const name = String(input.name ?? '').trim();
    const url = String(input.url ?? '').trim();
    if (!name || !url) throw new TypeError('A profile needs a name and a Moodle address.');
    const profiles = await this.#readAll();
    const existing = profiles.find((profile) => profile.id === input.id);
    const record = {
      id: existing?.id ?? randomUUID(),
      name,
      url,
      token: input.token ? this.#seal(input.token) : existing?.token ?? null,
      coreToken: input.coreToken ? this.#seal(input.coreToken) : existing?.coreToken ?? null
    };
    await this.#writeAll([...profiles.filter((profile) => profile.id !== record.id), record]);
    return {
      id: record.id,
      tokensStored: this.secrets.isEncryptionAvailable()
    };
  }

  /** @param {string} id */
  async remove(id) {
    const profiles = await this.#readAll();
    await this.#writeAll(profiles.filter((profile) => profile.id !== id));
  }

  /**
   * The full profile with decrypted tokens, for the main process only.
   * @param {string} id
   */
  async load(id) {
    const profile = (await this.#readAll()).find((entry) => entry.id === id);
    if (!profile) throw new TypeError('The profile no longer exists.');
    return { id: profile.id, name: profile.name, url: profile.url, token: this.#open(profile.token), coreToken: this.#open(profile.coreToken) };
  }
}
