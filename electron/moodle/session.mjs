// @ts-check
// A read-only Moodle session that uses the MoodlIA plugin when the site offers it and
// standard Moodle web services otherwise. Runs in the Electron main process, so Moodle
// requests are made by Node and are not subject to browser CORS rules.
import { createRequire } from 'node:module';
import { createAdaptiveSiteAdapter } from 'moodlia/adaptive';

const require = createRequire(import.meta.url);

/** @typedef {{ name: string, url: string, token?: string, coreToken?: string }} ConnectionProfile */
/** @typedef {'moodlia' | 'core'} ProviderName */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export class SessionError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Validates the site address. HTTPS is required except for loopback development sites.
 * @param {string} value
 */
export function normalizeSiteUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    throw new SessionError('invalid_url', 'Enter the full Moodle address, for example https://moodle.example.edu.');
  }
  if (url.username || url.password) throw new SessionError('invalid_url', 'The Moodle address must not contain credentials.');
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new SessionError('insecure_url', 'Use an HTTPS Moodle address. HTTP is accepted only for this computer (localhost).');
  }
  url.hash = '';
  url.search = '';
  return { url: url.toString().replace(/\/+$/, ''), allowInsecure: url.protocol === 'http:' };
}

/** @param {unknown} error */
function publicError(error) {
  const code = String(/** @type {any} */ (error)?.code ?? 'request_failed');
  const message = String(/** @type {any} */ (error)?.message ?? 'The Moodle request failed.');
  return new SessionError(code, message.slice(0, 500));
}

export class MoodleSession {
  /**
   * @param {ConnectionProfile} profile
   * @param {{ createSiteAdapter?: typeof createAdaptiveSiteAdapter, moodliaContract?: Record<string, unknown> }} [dependencies]
   */
  constructor(profile, dependencies = {}) {
    const moodliaToken = String(profile.token ?? '').trim();
    const coreToken = String(profile.coreToken ?? '').trim() || moodliaToken;
    if (!moodliaToken && !coreToken) throw new SessionError('missing_token', 'Enter a Moodle web service token.');
    const { url, allowInsecure } = normalizeSiteUrl(profile.url);
    const createSiteAdapter = dependencies.createSiteAdapter ?? createAdaptiveSiteAdapter;
    this.adapter = createSiteAdapter({
      profile: {
        name: profile.name,
        url,
        backend: 'auto',
        allow_insecure: allowInsecure,
        credentials: {
          ...(moodliaToken ? { moodlia: { token: moodliaToken } } : {}),
          ...(coreToken ? { core: { token: coreToken } } : {})
        }
      },
      moodliaContract: dependencies.moodliaContract ?? require('moodlia/contract'),
      allowWrite: false
    });
    /** @type {Record<string, any> | null} */
    this.discovery = null;
  }

  /** Detects which providers answer and returns a summary safe to show in the interface. */
  async connect() {
    try {
      this.discovery = await this.adapter.discoverSite();
    } catch (error) {
      throw publicError(error);
    }
    return this.summary();
  }

  summary() {
    if (!this.discovery) throw new SessionError('not_connected', 'Connect to the Moodle site first.');
    const { providers } = this.discovery;
    const selected = providers[this.discovery.selected_read_provider].evidence;
    const moodlia = providers.moodlia;
    const core = providers.core;
    return {
      siteName: String(selected.site_name ?? ''),
      siteUrl: String(selected.site_url ?? ''),
      moodleRelease: String(selected.moodle_release ?? ''),
      userId: Number(selected.user_id ?? 0),
      moodlia: moodlia?.available
        ? { available: true, pluginRelease: String(moodlia.evidence.plugin_release ?? '') }
        : { available: false, reason: moodlia?.error?.message ?? 'No MoodlIA token was given.' },
      core: core?.available
        ? { available: true }
        : { available: false, reason: core?.error?.message ?? 'No core token was given.' }
    };
  }

  /**
   * Chooses the provider for one operation: MoodlIA when the plugin declares it, core otherwise.
   * @param {string} operation
   * @returns {{ name: ProviderName, adapter: any }}
   */
  providerFor(operation) {
    if (!this.discovery) throw new SessionError('not_connected', 'Connect to the Moodle site first.');
    const moodlia = this.adapter.availableAdapter(['moodlia']);
    if (moodlia?.hasDeclaredOperation(operation)) return { name: 'moodlia', adapter: moodlia };
    const core = this.adapter.availableAdapter(['core']);
    if (core && core.discovery.operations.includes(operation)) return { name: 'core', adapter: core };
    throw new SessionError('operation_unavailable', `This site does not offer the "${operation}" operation to this token.`);
  }

  /**
   * Runs a read operation from the canonical contracts.
   * @param {string} operation
   * @param {Record<string, unknown>} [parameters]
   */
  async read(operation, parameters = {}) {
    const { name, adapter } = this.providerFor(operation);
    const definition = adapter.client.contract.operations.find((entry) => entry.name === operation);
    // The core contract marks reads with "kind", the MoodlIA contract with "type".
    if ((definition?.kind ?? definition?.type) !== 'read') throw new SessionError('write_refused', `"${operation}" changes Moodle data; the analyzer only reads.`);
    try {
      return { provider: name, data: await adapter.client.callOperation(operation, parameters) };
    } catch (error) {
      throw publicError(error);
    }
  }

  /** Courses the connected user is enrolled in. */
  async listCourses() {
    const userid = this.summary().userId;
    const { data } = await this.read('get_user_courses', { user_id: userid });
    return (Array.isArray(data) ? data : []).map((course) => ({
      id: Number(course.id),
      shortName: String(course.shortname ?? ''),
      fullName: String(course.fullname ?? ''),
      visible: course.visible !== 0 && course.visible !== false
    }));
  }
}
