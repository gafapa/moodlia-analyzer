// Provisional interface to exercise the connection layer. The final interface is still
// to be designed; keep product logic out of these components.
import { useEffect, useState, type FormEvent } from 'react';
import { analyzer, type CourseSummary, type ProfileSummary, type SiteSummary } from './bridge';
import { CourseView } from './CourseView';
import { LanguageSelect, useI18n } from './i18n';

export function App() {
  return (
    <>
      <div className="topbar"><LanguageSelect /></div>
      <Workspace />
    </>
  );
}

function Workspace() {
  const { t, error: errorText } = useI18n();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const emptyForm = { id: '', name: '', url: '', token: '', coreToken: '', username: '', password: '' };
  const [form, setForm] = useState(emptyForm);
  // How the site gives Moodle app tokens, asked when the user first signs in.
  const [method, setMethod] = useState<'password' | 'browser' | null>(null);
  const [site, setSite] = useState<SiteSummary | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<CourseSummary | null>(null);

  const refreshProfiles = async () => {
    const result = await analyzer().profiles.list();
    if (result.ok) setProfiles(result.value);
  };

  useEffect(() => { void refreshProfiles(); }, []);

  const connect = async (request: Parameters<ReturnType<typeof analyzer>['session']['connect']>[0]) => {
    setBusy(true);
    setMessage('');
    const result = await analyzer().session.connect(request);
    if (!result.ok) {
      setMessage(errorText(result.error));
      setBusy(false);
      return;
    }
    setSite(result.value);
    const list = await analyzer().session.courses();
    if (list.ok) setCourses(list.value);
    else setMessage(errorText(list.error));
    setBusy(false);
  };

  const afterSave = async (saved: Awaited<ReturnType<ReturnType<typeof analyzer>['profiles']['save']>>) => {
    if (!saved.ok) {
      setMessage(errorText(saved.error));
      setBusy(false);
      return;
    }
    setForm(emptyForm);
    setMethod(null);
    await refreshProfiles();
    await connect({ profileId: saved.value.id });
    if (!saved.value.tokensStored) setMessage(t('sites.notEncrypted'));
  };

  const saveAndConnect = async (event: FormEvent) => {
    event.preventDefault();
    // Enter in the sign-in fields signs in; the manual tokens are saved as they are.
    if (!form.token && !form.coreToken) {
      await signIn();
      return;
    }
    setBusy(true);
    await afterSave(await analyzer().profiles.save({ id: form.id || undefined, name: form.name, url: form.url, token: form.token, coreToken: form.coreToken }));
  };

  const signIn = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      setMessage(t('sites.nameAndAddressFirst'));
      return;
    }
    setBusy(true);
    let current = method;
    if (!current) {
      const asked = await analyzer().profiles.signInMethod(form.url);
      if (!asked.ok) {
        setMessage(errorText(asked.error));
        setBusy(false);
        return;
      }
      current = asked.value;
      setMethod(current);
    }
    if (current === 'password' && (!form.username || !form.password)) {
      setMessage(t('sites.passwordNeeded'));
      setBusy(false);
      return;
    }
    setMessage(current === 'browser' ? t('sites.signInOnPage') : t('sites.signingIn'));
    const result = await analyzer().profiles.signIn({
      id: form.id || undefined,
      name: form.name,
      url: form.url,
      token: form.token || undefined,
      ...(current === 'password' ? { username: form.username, password: form.password } : {})
    });
    setForm((previous) => ({ ...previous, password: '' }));
    await afterSave(result);
  };

  /** Fills the form with a saved site so the user can sign in again. */
  const signInAgain = (profile: ProfileSummary) => {
    setForm({ ...emptyForm, id: profile.id, name: profile.name, url: profile.url });
    setMethod(null);
    setMessage(t('sites.signInAgainBelow', { name: profile.name }));
  };

  const disconnect = async () => {
    await analyzer().session.disconnect();
    setSite(null);
    setCourses([]);
  };

  if (site && selected) return <CourseView course={selected} onBack={() => setSelected(null)} />;

  if (site) {
    return (
      <main className="shell">
        <header>
          <h1>{site.siteName}</h1>
          <p>
            {t('site.summary', {
              release: site.moodleRelease,
              plugin: site.moodlia.available ? t('site.pluginUsed', { release: site.moodlia.pluginRelease ?? '' }) : t('site.pluginNotUsed'),
              core: site.core.available ? t('site.coreAvailable') : t('site.coreUnavailable')
            })}
          </p>
          <p className="toolbar"><button type="button" onClick={disconnect}>{t('site.disconnect')}</button></p>
        </header>
        {message && <p role="alert">{message}</p>}
        <h2>{t('site.courses', { count: courses.length })}</h2>
        <ul>
          {courses.map((course) => (
            <li key={course.id}><button type="button" onClick={() => setSelected(course)}>{course.fullName}</button> <small>{course.shortName}</small></li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <main className="shell">
      <h1>{t('app.name')}</h1>
      {message && <p role="alert">{message}</p>}
      {profiles.length > 0 && (
        <section>
          <h2>{t('sites.saved')}</h2>
          <ul>
            {profiles.map((profile) => (
              <li key={profile.id}>
                <button type="button" disabled={busy || !profile.hasToken && !profile.hasCoreToken} onClick={() => connect({ profileId: profile.id })}>
                  {profile.name}
                </button>{' '}
                <small>{profile.url}</small>{' '}
                <button type="button" disabled={busy} onClick={() => signInAgain(profile)}>{t('sites.signInAgain')}</button>{' '}
                <button type="button" onClick={async () => { await analyzer().profiles.remove(profile.id); await refreshProfiles(); }}>{t('sites.remove')}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form onSubmit={saveAndConnect}>
        <h2>{form.id ? t('sites.signInAgainTo', { name: form.name }) : t('sites.add')}</h2>
        <label>{t('sites.name')} <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>{t('sites.address')} <input required type="url" placeholder="https://moodle.example.edu" value={form.url} onChange={(e) => { setForm({ ...form, url: e.target.value }); setMethod(null); }} /></label>
        {method === 'password' && (
          <>
            <label>{t('sites.username')} <input autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
            <label>{t('sites.password')} <input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          </>
        )}
        <p>
          <button type="button" disabled={busy} onClick={signIn}>{t('sites.signIn')}</button>{' '}
          <small>
            {method === 'password' ? t('sites.signInPasswordHelp') : t('sites.signInHelp')}
          </small>
        </p>
        <details>
          <summary>{t('sites.manualTokens')}</summary>
          <label>{t('sites.token')} <input type="password" autoComplete="off" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} /></label>
          <label>{t('sites.coreToken')} <input type="password" autoComplete="off" value={form.coreToken} onChange={(e) => setForm({ ...form, coreToken: e.target.value })} /></label>
          <small>{t('sites.manualHelp')}</small>
          <button type="submit" disabled={busy}>{busy ? t('sites.connecting') : t('sites.saveAndConnect')}</button>
        </details>
      </form>
    </main>
  );
}
