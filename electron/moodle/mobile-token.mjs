// @ts-check
// Gets a token for the Moodle mobile app service (moodle_mobile_app) the way the Moodle app
// does: the user signs in on the site's own page, with any authentication method the site
// uses, and Moodle's admin/tool/mobile/launch.php redirects to moodlemobile://token=... with
// the token. The app never sees the password. These functions hold the parts that do not
// need Electron; the sign-in window is in electron/sign-in-window.mjs.
import { createHash, randomBytes } from 'node:crypto';
import { SessionError } from './session.mjs';

export const MOBILE_SERVICE = 'moodle_mobile_app';
export const URL_SCHEME = 'moodlemobile';

/** A random value Moodle signs with its address, so a token from another site is refused. */
export function createPassport() {
  return randomBytes(16).toString('hex');
}

/**
 * Asks the site's public mobile configuration. Older sites without it answer with an error,
 * in which case the sign-in is still tried with the address the user entered.
 * @param {string} siteUrl normalized site address without a trailing slash
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ wwwroot: string, launchUrl: string }>}
 */
export async function readMobileConfig(siteUrl, fetchImpl = fetch) {
  const fallback = { wwwroot: siteUrl, launchUrl: `${siteUrl}/admin/tool/mobile/launch.php` };
  let body;
  try {
    const response = await fetchImpl(`${siteUrl}/lib/ajax/service-nologin.php?info=tool_mobile_get_public_config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ index: 0, methodname: 'tool_mobile_get_public_config', args: {} }]),
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) return fallback;
    body = await response.json();
  } catch {
    return fallback;
  }
  const answer = Array.isArray(body) ? body[0] : null;
  if (!answer || answer.error || !answer.data) return fallback;
  const config = answer.data;
  if (config.enablemobilewebservice === 0 || config.enablemobilewebservice === false) {
    throw new SessionError('mobile_service_disabled', 'This site has the Moodle app service turned off, so a token cannot be created by signing in. Ask the site administrator to enable "Web services for mobile devices", or enter a token by hand.');
  }
  const wwwroot = typeof config.wwwroot === 'string' && config.wwwroot ? config.wwwroot.replace(/\/+$/, '') : siteUrl;
  const launchUrl = typeof config.launchurl === 'string' && config.launchurl.startsWith(`${wwwroot}/`) ? config.launchurl : `${wwwroot}/admin/tool/mobile/launch.php`;
  return { wwwroot, launchUrl };
}

/**
 * The page that signs the user in and returns the token.
 * @param {string} launchUrl @param {string} passport
 */
export function buildLaunchUrl(launchUrl, passport) {
  const url = new URL(launchUrl);
  url.searchParams.set('service', MOBILE_SERVICE);
  url.searchParams.set('passport', passport);
  url.searchParams.set('urlscheme', URL_SCHEME);
  return url.toString();
}

/** @param {string} url */
export function isLaunchRedirect(url) {
  return url.toLowerCase().startsWith(`${URL_SCHEME}://`);
}

/**
 * Reads the token from Moodle's redirect, after checking that the site signed it with the
 * passport of this sign-in. The private token Moodle may add (for automatic web sign-in)
 * is discarded.
 * @param {string} redirectUrl moodlemobile://token=<base64>
 * @param {string} wwwroot the site's own address, as Moodle reports it
 * @param {string} passport
 */
export function parseLaunchRedirect(redirectUrl, wwwroot, passport) {
  const match = /^moodlemobile:\/\/token=([A-Za-z0-9+/=_-]+)/i.exec(redirectUrl.trim());
  if (!match) throw new SessionError('invalid_token_response', 'Moodle did not return a token.');
  const decoded = Buffer.from(match[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const [signature, token] = decoded.split(':::');
  const candidates = [wwwroot, `${wwwroot}/`].map((root) => createHash('md5').update(root + passport).digest('hex'));
  if (!signature || !candidates.includes(signature.toLowerCase())) {
    throw new SessionError('invalid_token_response', 'The token did not come from this Moodle site, so it was refused.');
  }
  if (!token || !/^[A-Za-z0-9]{16,128}$/.test(token)) throw new SessionError('invalid_token_response', 'Moodle returned a token in an unexpected format.');
  return token;
}
