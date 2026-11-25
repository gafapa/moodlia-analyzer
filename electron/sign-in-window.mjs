// @ts-check
// Window where the user signs in on the Moodle site's own page to get a mobile app token.
// It uses a fresh in-memory session, so the Moodle sign-in cookies are not kept, and it has
// no bridge to the app. See electron/moodle/mobile-token.mjs for the protocol.
import { BrowserWindow, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { SessionError, normalizeSiteUrl } from './moodle/session.mjs';
import { buildLaunchUrl, createPassport, isLaunchRedirect, parseLaunchRedirect, readMobileConfig } from './moodle/mobile-token.mjs';

/**
 * @param {BrowserWindow | null} parent
 * @param {string} siteAddress
 * @returns {Promise<string>} the token
 */
export async function signInForMobileToken(parent, siteAddress) {
  const { url: siteUrl, allowInsecure } = normalizeSiteUrl(siteAddress);
  const { wwwroot, launchUrl } = await readMobileConfig(siteUrl);
  const passport = createPassport();
  const partition = `sign-in-${randomUUID()}`;
  const signInSession = session.fromPartition(partition, { cache: false });
  signInSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

  const window = new BrowserWindow({
    parent: parent ?? undefined,
    modal: Boolean(parent),
    width: 960,
    height: 760,
    title: 'Sign in to Moodle',
    autoHideMenuBar: true,
    webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    /** @param {() => void} action */
    const finish = (action) => {
      if (settled) return;
      settled = true;
      action();
      if (!window.isDestroyed()) window.close();
      void signInSession.clearStorageData().catch(() => {});
    };
    /** @param {Electron.Event} event @param {string} url */
    const guard = (event, url) => {
      if (isLaunchRedirect(url)) {
        event.preventDefault();
        finish(() => {
          try {
            resolve(parseLaunchRedirect(url, wwwroot, passport));
          } catch (error) {
            reject(error);
          }
        });
        return;
      }
      // Sign-in may pass through an identity provider; anything but HTTPS is refused, except
      // HTTP on this computer for a local test site.
      const insecureLocal = allowInsecure && url.startsWith(`${siteUrl}/`);
      if (!url.startsWith('https://') && !insecureLocal) event.preventDefault();
    };
    window.webContents.on('will-navigate', guard);
    window.webContents.on('will-redirect', guard);
    window.webContents.on('will-frame-navigate', (event) => guard(event, event.url));
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.on('closed', () => finish(() => reject(new SessionError('sign_in_cancelled', 'The Moodle sign-in window was closed before a token was received.'))));
    window.loadURL(buildLaunchUrl(launchUrl, passport)).catch((error) => {
      // A redirect to moodlemobile:// aborts the load; that case is already settled.
      if (!settled) finish(() => reject(new SessionError('sign_in_failed', `The Moodle sign-in page could not be opened: ${String(error?.message ?? error).slice(0, 200)}`)));
    });
  });
}
