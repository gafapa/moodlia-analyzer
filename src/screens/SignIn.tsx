// Connection screen: saved sites, and a new site by signing in as in the Moodle app (username
// and password, or the site's own page) or with a web service token.
import { useState, type FormEvent } from 'react';
import { analyzer, type ProfileSummary, type Result } from '../bridge';
import { useI18n } from '../i18n';
import { Icon, LanguageSelect, initials } from '../ui';

type Saved = Result<{ id: string; tokensStored: boolean }>;

export function SignIn({ profiles, busy, message, onConnect, onSaved, onRemove }: {
  profiles: ProfileSummary[];
  busy: boolean;
  message: string;
  onConnect: (profileId: string) => void;
  onSaved: (saved: Saved) => void;
  onRemove: (profileId: string) => void;
}) {
  const { t, error: errorText } = useI18n();
  const [url, setUrl] = useState('');
  const [editing, setEditing] = useState<ProfileSummary | null>(null);
  const [site, setSite] = useState<{ method: 'password' | 'browser'; siteName: string } | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('');
  const disabled = busy || working;

  const siteName = () => site?.siteName || editing?.name || (() => {
    try { return new URL(url).hostname; } catch { return url; }
  })();

  const check = async () => {
    if (!url.trim()) return null;
    setWorking(true);
    setStatus('');
    const result = await analyzer().profiles.signInMethod(url);
    setWorking(false);
    if (!result.ok) {
      setStatus(errorText(result.error));
      setSite(null);
      return null;
    }
    setSite(result.value);
    return result.value;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const known = site ?? await check();
    if (!known) return;
    if (known.method === 'password' && (!username || !password)) {
      setStatus(t('signin.passwordNeeded'));
      return;
    }
    setWorking(true);
    setStatus(known.method === 'browser' ? t('signin.onSitePage') : t('signin.signingIn'));
    const saved = await analyzer().profiles.signIn({
      id: editing?.id,
      name: siteName(),
      url,
      ...(known.method === 'password' ? { username, password } : {})
    });
    setPassword('');
    setWorking(false);
    setStatus(saved.ok ? '' : errorText(saved.error));
    if (saved.ok) {
      setEditing(null);
      setUrl('');
      setSite(null);
    }
    onSaved(saved);
  };

  const connectWithToken = async () => {
    if (!url.trim() || !token.trim()) {
      setStatus(t('signin.tokenNeeded'));
      return;
    }
    setWorking(true);
    const saved = await analyzer().profiles.save({ id: editing?.id, name: siteName(), url, token });
    setToken('');
    setWorking(false);
    setStatus(saved.ok ? '' : errorText(saved.error));
    onSaved(saved);
  };

  const signInAgain = (profile: ProfileSummary) => {
    setEditing(profile);
    setUrl(profile.url);
    setSite(null);
    setStatus(t('signin.againHint', { name: profile.name }));
  };

  return (
    <div className="signin">
      <section className="signin-hero">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark" style={{ background: '#FFFFFF', color: 'var(--brand-dark)', width: 40, height: 40 }}><Icon name="cap" /></span>
          <span className="brand-name" style={{ fontSize: 18 }}>MoodlIA Analyzer</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h1>{t('signin.heroTitle')}</h1>
          <p>{t('signin.heroText')}</p>
          <ul className="signin-points">
            <li><Icon name="lock" size={22} />{t('signin.pointReadOnly')}</li>
            <li><Icon name="monitor" size={22} />{t('signin.pointLocal')}</li>
            <li><Icon name="shield" size={22} />{t('signin.pointPassword')}</li>
          </ul>
        </div>
        <span className="signin-foot">{t('signin.heroFoot')}</span>
      </section>

      <main className="signin-main">
        <div className="top-right"><LanguageSelect /></div>
        <div className="signin-column">
          {message && <p className="alert" role="alert" style={{ margin: 0 }}>{message}</p>}

          {profiles.length > 0 && (
            <section aria-labelledby="saved-sites" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 id="saved-sites" style={{ fontFamily: 'var(--text)', fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>{t('signin.yourSites')}</h2>
              {profiles.map((profile) => (
                <div key={profile.id} className="site-row">
                  <button type="button" className="site-open" disabled={disabled || (!profile.hasToken && !profile.hasCoreToken)} onClick={() => onConnect(profile.id)}>
                    <span className="site-initials">{initials(profile.name)}</span>
                    <span className="site-text">
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{profile.name}</span>
                      <span className="site-url">{profile.url.replace(/^https?:\/\//, '')}</span>
                    </span>
                  </button>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <button type="button" className="btn-link" disabled={disabled} onClick={() => signInAgain(profile)}>{t('signin.signInAgain')}</button>
                    <button type="button" className="btn-link" style={{ color: 'var(--muted)', fontWeight: 500 }} disabled={disabled} onClick={() => onRemove(profile.id)}>{t('signin.remove')}</button>
                  </span>
                </div>
              ))}
            </section>
          )}

          <form className="form-card" onSubmit={submit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h2>{editing ? t('signin.againTitle', { name: editing.name }) : t('signin.addTitle')}</h2>
              <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>{t('signin.addText')}</p>
            </div>
            <label className="field">
              {t('signin.address')}
              <input type="url" required placeholder="https://moodle.example.edu" value={url} onChange={(event) => { setUrl(event.target.value); setSite(null); }} onBlur={() => { if (url && !site) void check(); }} />
            </label>
            {site && (
              <p className="notice" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <Icon name="check" size={18} />
                {site.siteName ? `${site.siteName} · ` : ''}{site.method === 'password' ? t('signin.methodPassword') : t('signin.methodBrowser')}
              </p>
            )}
            {site?.method === 'password' && (
              <>
                <label className="field">
                  {t('signin.username')}
                  <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
                </label>
                <label className="field">
                  {t('signin.password')}
                  <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
                </label>
              </>
            )}
            <button type="submit" className="btn btn-primary" disabled={disabled}>
              {working ? t('signin.working') : site?.method === 'browser' ? t('signin.openSitePage') : site ? t('signin.signInAndConnect') : t('signin.continue')}
            </button>
            {status && <p className="muted" role="status" style={{ margin: 0 }}>{status}</p>}
            <p className="fine">{t('signin.fine')}</p>
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 500, color: 'var(--ink-2)', minHeight: 32 }}>{t('signin.haveToken')}</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                <label className="field">
                  {t('signin.token')}
                  <input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} />
                </label>
                <p className="fine">{t('signin.tokenHelp')}</p>
                <button type="button" className="btn" disabled={disabled} onClick={connectWithToken}>{t('signin.connectWithToken')}</button>
              </div>
            </details>
          </form>
        </div>
      </main>
    </div>
  );
}
