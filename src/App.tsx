// Provisional interface to exercise the connection layer. The final interface is still
// to be designed; keep product logic out of these components.
import { useEffect, useState, type FormEvent } from 'react';
import { analyzer, type CourseSummary, type ProfileSummary, type SiteSummary } from './bridge';
import { CourseView } from './CourseView';

export function App() {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [form, setForm] = useState({ name: '', url: '', token: '', coreToken: '' });
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
      setMessage(result.error.message);
      setBusy(false);
      return;
    }
    setSite(result.value);
    const list = await analyzer().session.courses();
    if (list.ok) setCourses(list.value);
    else setMessage(list.error.message);
    setBusy(false);
  };

  const afterSave = async (saved: Awaited<ReturnType<ReturnType<typeof analyzer>['profiles']['save']>>) => {
    if (!saved.ok) {
      setMessage(saved.error.message);
      setBusy(false);
      return;
    }
    setForm({ name: '', url: '', token: '', coreToken: '' });
    await refreshProfiles();
    await connect({ profileId: saved.value.id });
    if (!saved.value.tokensStored) setMessage('This system cannot encrypt tokens, so they are kept only until the app closes.');
  };

  const saveAndConnect = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.token && !form.coreToken) {
      setMessage('Sign in to Moodle to get a token, or enter one.');
      return;
    }
    setBusy(true);
    await afterSave(await analyzer().profiles.save(form));
  };

  const signIn = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      setMessage('Enter the site name and address first.');
      return;
    }
    setBusy(true);
    setMessage('Sign in on the Moodle page that opened.');
    await afterSave(await analyzer().profiles.signIn({ name: form.name, url: form.url, token: form.token || undefined }));
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
            Moodle {site.moodleRelease} · MoodlIA plugin:{' '}
            {site.moodlia.available ? `yes (${site.moodlia.pluginRelease})` : 'not used'} · Core web services:{' '}
            {site.core.available ? 'yes' : 'not available'}
          </p>
          <button type="button" onClick={disconnect}>Disconnect</button>
        </header>
        {message && <p role="alert">{message}</p>}
        <h2>Courses ({courses.length})</h2>
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
      <h1>MoodlIA Analyzer</h1>
      {message && <p role="alert">{message}</p>}
      {profiles.length > 0 && (
        <section>
          <h2>Saved sites</h2>
          <ul>
            {profiles.map((profile) => (
              <li key={profile.id}>
                <button type="button" disabled={busy || !profile.hasToken && !profile.hasCoreToken} onClick={() => connect({ profileId: profile.id })}>
                  {profile.name}
                </button>{' '}
                <small>{profile.url}</small>{' '}
                <button type="button" disabled={busy} onClick={async () => { setBusy(true); setMessage('Sign in on the Moodle page that opened.'); await afterSave(await analyzer().profiles.signIn({ id: profile.id, name: profile.name, url: profile.url })); }}>Sign in again</button>{' '}
                <button type="button" onClick={async () => { await analyzer().profiles.remove(profile.id); await refreshProfiles(); }}>Remove</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form onSubmit={saveAndConnect}>
        <h2>Add a site</h2>
        <label>Name <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Moodle address <input required type="url" placeholder="https://moodle.example.edu" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></label>
        <p>
          <button type="button" disabled={busy} onClick={signIn}>Sign in to Moodle</button>{' '}
          <small>Opens the site's own sign-in page and creates a Moodle app token. The app never sees your password.</small>
        </p>
        <details>
          <summary>Enter tokens by hand</summary>
          <label>MoodlIA or web service token <input type="password" autoComplete="off" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} /></label>
          <label>Separate core web services token (optional) <input type="password" autoComplete="off" value={form.coreToken} onChange={(e) => setForm({ ...form, coreToken: e.target.value })} /></label>
          <small>With the MoodlIA plugin, enter its token here and then sign in to Moodle too: the app uses the plugin token for MoodlIA and the Moodle app token for standard functions.</small>
          <button type="submit" disabled={busy}>{busy ? 'Connecting…' : 'Save and connect'}</button>
        </details>
      </form>
    </main>
  );
}
