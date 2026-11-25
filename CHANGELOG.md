# Changelog

## 0.1.0 - unreleased

- Electron desktop app foundation. Moodle requests run in the main process, so browser CORS rules do not apply.
- Read-only Moodle session over the adaptive adapter of `moodlia` 0.5.3: it detects the MoodlIA plugin with `get_moodlia_status` and core web services with `core_webservice_get_site_info`, and refuses operations that change Moodle data.
- Saved sites with tokens encrypted by the operating system keychain; one token is used for both providers unless a separate core token is given.
- Course list for the connected user.
- Course analysis: a collector in the main process reads one course through core web services with progress updates, and the student metrics, grade prediction, risk and recommendation analysis of `moodlia-analyzer-web` runs on the result. Sources the token cannot read are reported and counted as empty.
- Fixes over `moodlia-analyzer-web`: quiz attempts are read per student instead of only the connected user's; attempt grades are scaled from `sumgrades`, so quiz averages are no longer empty; course profiles use the `userlist` structure; current forum posts are normalized; grades come from one course-wide call.
- Every read names its provider (`moodlia` or `core`), because both contracts share operation names with different parameters.
- A first interface to exercise the connection layer, since replaced by the redesign below.
- Unit tests, end-to-end tests against a fake Moodle REST endpoint (connection with and without the plugin, and a full course collection), Vitest analysis tests, and a startup smoke check.
- Installers built with `electron-builder`: Windows x64 (installer and zip), macOS Apple silicon and Intel (dmg and zip, signed ad hoc), Linux x64 (AppImage and tar.gz). Not code-signed yet.
- `npm run package:dir`, `npm run package` and `npm run smoke:packaged`; the smoke check can run on the packaged app.
- CI on Windows, Ubuntu and macOS, including a smoke check of the packaged app, plus dependency audits and a check of the project page.
- Release workflow: a version tag builds and checks the installers on the three systems and creates a draft GitHub release with SHA-256 checksums.
- Project page on GitHub Pages that lists the installers of the latest release.
- Sign in to Moodle to get a token for the Moodle mobile app service, saved as the profile's core web services token, following the site's mobile login setting: with username and password through `login/token.php` on sites that log in inside the app (the Moodle default), or on the site's own sign-in page through `admin/tool/mobile/launch.php` on sites that log in through a browser, where the password never reaches the app and the token's signature is checked against the site and a per-sign-in random value. The password is not saved. Saved sites can sign in again.
- When the system cannot encrypt, tokens are kept in memory until the app closes, so a site can still be used without writing them to disk.
- The smoke check also runs the sign-in window against a fake Moodle site.
- The course view shows all the analysis computes: summary cards, grade distribution, a sortable student table with last access, assignments, quizzes, forum posts and completion, a detail per student (risk factors, recommendations, indicators, grade items), per-assignment, quiz and forum summaries, and the data sources read. A course can be collected again.
- Charts in the course view: students by risk level, grade distribution with the pass mark, engagement against grade per student (select a point to open the student), submissions per assignment on time and late in due-date order, student activity per week, and each student's grade items. Hover tooltips, keyboard focus, light and dark colours, and a shape and label per risk level.
- Interface in Galician, Spanish and English, from a selector at the top right that starts in the system language. Analysis texts (risk factors and recommendations) are returned as keys and translated.
- The application menu is removed on Windows and Linux; macOS keeps the standard app, edit and window menus.
- Hidden activities and assignments that do not accept submissions yet are no longer counted as missing work; the course view says how many were left out. Announcement forums no longer count for forum participation.
- Last access is the last access to the course (`lastcourseaccess`) instead of the last access to the whole site.
- Redesigned interface: a sign-in screen; a course list with search, period filter and a side-by-side comparison of analysed courses; a course panel in tabs (Summary, Students, Submissions, Grading, Pace, Settings) with a short explanation each; and a student detail in tabs (summary, assignments and grades, evolution). Bundled Plus Jakarta Sans and Inter fonts.
- New analyses: submissions waiting for a grade and the oldest, time from submission to grade, share of grades with written feedback, drafts not submitted, who submitted each assignment, assignments under half submitted, submissions by weekday and time of day, visible content by type, course setting checks, and a student's grade over time and compared with the class. Assignments set to no grade never wait for a grade.
- The course list includes each course's dates, completion setting and last access; the site check before signing in returns the site name, which names the saved site.
