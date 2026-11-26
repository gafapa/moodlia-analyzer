# MoodlIA Analyzer

Desktop app for Moodle course and student analysis. It connects to any Moodle site with a web service token and uses the MoodlIA plugin when the site has it.

Project page: <https://gafapa.github.io/moodlia-analyzer/>

[Status](#status) · [Getting started](#getting-started) · [Architecture](#architecture) · [Development](#development) · [Distribution](#distribution) · [Security and privacy](#security-and-privacy) · [Roadmap](#roadmap) · [License](#license)

## Status

Version 0.1.0 replaces the earlier analyzers `moodlia-analyzer-web` and `moodlia-analyzer-desktop`, which are discontinued and archived on GitHub. It is not released yet; the installers are built by the release workflow.

What works:

- Saved Moodle sites with tokens encrypted by the operating system keychain.
- Connection with or without the MoodlIA plugin, with the providers detected on connect.
- **Sign-in screen**: saved sites, and a new site by signing in as in the Moodle app or with a token.
- **My courses**: the site's courses with search and a current, finished or all filter; each analysed course shows its students, average grade, submissions waiting for a grade and risk, and two or more analysed courses are compared side by side.
- **Course panel**, in tabs so each view shows a few things, each with a sentence on what it shows:
  - *Summary*: four indicators, a "needs your attention" list that opens the tab concerned, and the risk level with the students to look at first.
  - *Students*: a sortable, searchable table with filters (medium or high risk, with drafts, no access in 7 days), engagement against grade, and the grade distribution.
  - *Profiles*: students grouped by behaviour with explicit rules (steady, last minute, efficient, struggling, disengaged, irregular), each with who is in it and a suggested action; and a flow diagram of how students moved between risk levels since the analysis of an earlier day, with who moved up and down.
  - *Submissions*: who submitted each assignment (graded, waiting for a grade, draft, not submitted), drafts not submitted, and assignments under half submitted; and when students submit relative to the due date: per assignment (late, last 24 hours, 1–3 days, 3–7 days, over a week before), the share submitted at the last minute or late, the typical margin, and each student's habit compared with classmates on the same assignments.
  - *Grading*: submissions waiting for a grade and the oldest, time from submission to grade, share of grades with written feedback, the assignments with the lowest class average, and box plots of each grade item, the items where students differ most first.
  - *Quizzes* (when the course has quizzes): per quiz, the facility and discrimination of each question as in Moodle's quiz statistics report, from each student's first finished attempt, with questions to review flagged (negative or weak discrimination, very easy, very hard), Cronbach's alpha, a facility-against-discrimination chart and a table with the start of each question's text.
  - *Forums* (when the course has discussion forums): who replies to whom as a network, discussions a student opened that nobody answered, median time to the first reply, the share of replies with a teacher, and students who never posted or got no replies.
  - *Completion* (when activities track completion): a student-by-activity matrix in course order with the class rate per activity and activities fewer than one in five completed.
  - *Pace*: student activity per week, submissions by weekday and time of day, students by days since their last access with the share active in the last N days, and weeks when many students have three or more deadlines across all their courses.
  - *Settings*: checks of course settings that limit what can be measured (no due dates, completion on but unused, no discussion forum, written feedback) and the visible content by type.
- **Student detail**, in four tabs: why the risk level and what can be done, and the student's profile and submission habit; the assignments with their status and grade, when the student submits against the class, and the lowest grades; the grade over time against the class; and the workload: deadlines per week across all the student's courses and the upcoming ones.
- Interface in Galician, Spanish and English, chosen from the selector at the top right; it starts in the system language. The analysis returns its texts as keys with values, so they are translated too.
- No application menu on Windows and Linux; macOS keeps the standard app, edit and window menus.
- Read-only access to any read operation of the canonical contracts.

The interface follows the design on the MoodlIA Analyzer redesign canvas: one teal accent, Plus Jakarta Sans headings and Inter text (both bundled with the app, since the Content Security Policy allows no remote fonts), and the reference data-visualization palette for charts. It has a light theme only for now.

## Getting started

Requirements: Node.js 22 or later and npm 10 or later.

```bash
npm install
npm approve-scripts electron   # npm blocks install scripts by default; Electron needs its own to download its binary
npm run dev                    # interface with hot reload inside Electron
```

`npm start` builds the interface and opens the app without the dev server.

### Connecting to Moodle

Add a site with its name and its HTTPS address. HTTP is accepted only for `localhost` and `127.0.0.1`. Then either:

- **Sign in to Moodle** (recommended). The app gets a token for the Moodle mobile app service (`moodle_mobile_app`) the way the Moodle app does, following the site's mobile settings ("How the Moodle app logs in", `typeoflogin` in the site's public configuration):
  - **Inside the app** (the Moodle default): the app asks for your Moodle username and password and sends them to the site's `login/token.php`, which returns the token. They go only to the Moodle site over HTTPS and are not saved.
  - **In a browser or embedded browser**: the app opens the site's own sign-in page in a separate window, so any sign-in method works, including single sign-on, and `admin/tool/mobile/launch.php` returns the token. The app never sees the password, the window keeps no cookies, and the token is checked against the site before it is saved. Moodle refuses this page on sites set to log in inside the app.

  The site must allow the Moodle app ("Web services for mobile devices", on by default on recent sites); the app checks this first. Saved sites have **Sign in again** to replace an expired token.
- **Enter tokens by hand**, for a token an administrator created for a specific service.

#### Why two tokens

A Moodle token belongs to one web service and can only call the functions of that service. The app uses two providers:

- the MoodlIA plugin's functions (`local_moodlia_*`), available with a token for the MoodlIA service;
- standard Moodle functions (`core_*`, `mod_*`, `gradereport_*`), which the course analysis needs, available with the Moodle app token or any service that includes them.

One token is enough when its service has everything the app uses: the Moodle app token alone gives the full analysis without the plugin, and a MoodlIA service that also includes the standard functions serves both. On a site with the plugin whose service has only the plugin's functions, enter the MoodlIA token by hand and also sign in to Moodle: the app uses each token for its provider. On connect, the app reports which providers answered.

## Architecture

| Part | Location | Role |
| --- | --- | --- |
| Main process | `electron/main.mjs` | Window, security settings, and the IPC handlers the interface calls. |
| Moodle session | `electron/moodle/session.mjs` | Read-only session over the adaptive adapter of the [`moodlia`](https://www.npmjs.com/package/moodlia) package, which builds on [`moodle-core-cli`](https://www.npmjs.com/package/moodle-core-cli). |
| Course collector | `electron/analysis/collector.mjs` | Reads one course through core web services and returns the data the analysis expects. |
| Analysis | `src/analysis/` | Student metrics, grade prediction, risk and recommendations (`courseAnalyzer.ts`, `metrics.ts`); per-activity summaries; chart data; `insights.ts`: the grading queue and time to grade, feedback, drafts, who submitted each assignment, submissions by weekday and hour, content by type, course setting checks, and a student's grade over time against the class; and `advanced.ts`: submission timing, the completion matrix, days since the last access, grade spread, quiz question statistics, the forum reply network, student profiles, risk changes between analyses and deadlines across courses. TypeScript, no Moodle access. |
| Charts | `src/charts/`, `src/ui.tsx` | SVG charts (grade distribution, engagement against grade, lines over time, columns, box plots, quiz questions, reply network, risk flow) with hover tooltips, and HTML bars, stacked bars and grids; risk levels carry a shape and a label as well as a colour. |
| Risk history | `electron/history.mjs` | Each course's daily risk levels on this computer, to compare analyses. |
| Translations | `src/i18n/` | Galician, Spanish and English catalogs; `en.ts` defines the keys and the typechecker requires every catalog to have all of them. |
| Moodle app token | `electron/moodle/mobile-token.mjs`, `electron/sign-in-window.mjs` | Reads the site's mobile settings, then gets the token with username and password through `login/token.php` or with the site's own sign-in page through `admin/tool/mobile/launch.php`. |
| Profiles | `electron/profiles.mjs` | Saved sites; tokens encrypted with Electron `safeStorage`. |
| Bridge | `electron/preload.cjs` | The only functions the page can call: `profiles.list/save/signInMethod/signIn/remove`, `session.connect/disconnect/courses/read` and `analysis.collect/history/onProgress`. |
| Interface | `src/App.tsx`, `src/screens/` | React and TypeScript, built with Vite: the sign-in, course list, course panel and student screens, and the state they share (the connected site, its courses and the analyses collected in the session). |

Moodle requests are made by Node in the main process, so browser CORS rules do not apply and no browser extension is needed.

On connect, the session asks both providers: `get_moodlia_status` for the plugin and `core_webservice_get_site_info` for core web services. Every read names its provider, because the two contracts use some of the same operation names with different parameters and responses (for example, `get_assignment_submissions` takes assignment ids in core and a course and module in MoodlIA). Operations that change Moodle data are refused, whatever the provider.

### Course analysis

The collector reads, through core web services:

| Data | Operation |
| --- | --- |
| Structure | `get_course_contents`, `get_course_assignments`, `get_course_quizzes`, `get_course_forums`, `get_course_pages`, `get_course_resources` |
| Assignments | `get_assignment_submissions` and `get_assignment_grades`, one call each for all the course's assignments |
| Forums | `get_forum_discussions` (paged) and `get_forum_discussion_posts` |
| Users | `get_enrolled_users`, and `get_course_user_profiles` when roles are missing; teachers and managers are left out |
| Grades | `get_grade_items` once for the whole course |
| Per student | `get_activity_completion_statuses` and `get_user_quiz_attempts_legacy` for each quiz |
| Quiz questions | `get_quiz_attempt_review` (all pages) for each student's first finished attempt of each quiz; only the mark per question and the first 90 characters of its text are kept |
| Workload | `get_user_courses` for each student, then `get_course_assignments` (due dates) and `get_course_quizzes` (closing dates) once for all those courses; only courses the token can read are covered, and the app says how many |

Activities students cannot see yet are left out of every count: hidden modules, and assignments that do not accept submissions yet. Announcement forums are left out of forum participation, since only teachers post there. Last access is the last access to the course (Moodle's `lastcourseaccess`), not to the whole site.

Each analysis day, the risk level of each student is saved on this computer (`risk-history.json` in the app's data folder: a hash of the site address, the course id, user ids and levels, at most 30 days per course), so the next analysis on another day can show who moved between levels.

A source the token cannot read is listed in the result's `unavailable` field with its reason and counted as empty, so a partial token still gives an analysis. Standard web services do not expose the course log, so log-based metrics are marked unavailable. A collector that uses the MoodlIA plugin's reports is planned.

Differences from the discontinued `moodlia-analyzer-web`, which this app corrects:

- Quiz attempts are read for each student. The earlier app requested them with user 0, which returns only the connected user's own attempts.
- Quiz attempt grades are scaled from the attempt's `sumgrades` to the quiz grade. The earlier app read a `grade` field that Moodle does not return for attempts, so quiz averages were always empty.
- Course profiles are requested with the `userlist` structure Moodle expects.
- Forum posts from the current Moodle forum API (`author.id`, `parentid`, `timecreated`) are normalized to the fields the metrics read.
- Grades come from one course-wide call instead of one call per student.
- Hidden activities no longer count as missing work, and last access is to the course instead of the site.

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server and Electron pointed at it. |
| `npm run typecheck` | TypeScript for the interface and JSDoc checks for the main process. |
| `npm test` | Main-process tests with `node --test`, including end-to-end tests that run the real `moodlia` and `moodle-core-cli` clients against a fake Moodle REST endpoint on `127.0.0.1` (connection with and without the plugin, and a full course collection that checks the Moodle function names and parameters sent). Then the analysis tests with Vitest. |
| `npm run smoke` | Builds the interface and starts the app with `MOODLIA_ANALYZER_SMOKE=1`. The app checks that the page renders, the bridge is present, Node is not reachable from the page and a bridge call returns, then runs the Moodle sign-in window against a fake site on `127.0.0.1` (sign-in form, redirects and the signed token) and exits. A temporary profile directory is used. |
| `npm run check` | Typecheck, tests and smoke check. |
| `npm run package:dir` | Builds the interface and an unpacked app for this computer in `release/`. |
| `npm run smoke:packaged` | Runs the smoke check on the unpacked app in `release/`. |
| `npm run package` | Builds the installers for this operating system in `release/`. |

### Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

- On Windows, Ubuntu and macOS: typecheck, tests, the smoke check with the development Electron, an unpacked package for the runner's architecture, and the smoke check on that packaged app. Ubuntu runs the Electron checks under Xvfb and enables the unprivileged user namespaces the Chromium sandbox needs.
- On Ubuntu: `npm audit` of the shipped dependencies at moderate level and of all dependencies at high level, and `scripts/check-site.mjs` on the project page.

The build-only dependencies of `electron-builder` carry a moderate `minimatch` advisory with no compatible fix; it does not reach the packaged app, which is why the full audit runs at high level.

### Project page

`site/` is the GitHub Pages site: a static page with no build step and no external scripts or stylesheets. `site/downloads.js` lists the installers of the latest published release through the GitHub API and keeps the static text when there is none. `.github/workflows/pages.yml` checks the page with `scripts/check-site.mjs` and deploys it when `site/` changes on `main`.

## Distribution

`electron-builder` builds, from the `build` section of `package.json`:

| System | Files |
| --- | --- |
| Windows x64 | `MoodlIA-Analyzer-<version>-win-x64-setup.exe` (per-user installer that lets you choose the folder) and a `.zip` |
| macOS | `.dmg` and `.zip` for Apple silicon (`arm64`) and Intel (`x64`) |
| Linux x64 | `.AppImage` and `.tar.gz` |

The installers are not code-signed yet: Windows SmartScreen warns about an unknown publisher, and the macOS app is signed ad hoc but not notarized, so it must be opened once with right click, Open. The app uses the default Electron icon until the interface is designed.

### Releasing

1. Set the version in `package.json` and give it a section in `CHANGELOG.md`.
2. Merge to `main` and wait for CI to pass.
3. Push a tag `v<version>`.

`.github/workflows/release.yml` checks that the tag matches `package.json`, runs the full check, builds the installers on Windows, macOS and Linux, runs the smoke check on each packaged app, and creates a **draft** GitHub release with the installers, `SHA256SUMS-<version>.txt` and the changelog section as notes. Review the draft and publish it by hand; the project page lists it once it is published. A manual run of the workflow builds the installers as workflow artifacts without a release.

## Security and privacy

- The page runs with context isolation, the sandbox and no Node integration. It can reach Moodle only through the bridge functions, and only for read operations.
- Only the app's own page may call the main process. Navigation away from the app is blocked, other windows are refused, and external `https://` links open in the default browser. Permission requests (camera, notifications and the like) are refused.
- A Content Security Policy limits the page to its own scripts.
- Tokens are encrypted with the operating system keychain (DPAPI on Windows, Keychain on macOS, the Secret Service on Linux) and never reach the page. If the system cannot encrypt, tokens are kept in memory until the app closes and are not written to disk.
- A password typed to sign in is sent only to the site's `login/token.php` over HTTPS (HTTP only on this computer), with redirects refused, and is cleared from the form afterwards; it is never saved.
- The Moodle sign-in window runs the site's page with no bridge to the app, in an in-memory session that is cleared afterwards. It accepts only HTTPS pages (or HTTP on this computer), refuses new windows and permission requests, and accepts a token only when Moodle signed it with this site's address and a random value created for that sign-in. The private token Moodle may add for automatic web sign-in is discarded.
- Course and student data stay on the computer. The app has no backend and sends nothing to MoodlIA. The only analysis data written to disk is the risk history: user ids and risk levels per course and day, keyed by a hash of the site address.

## Roadmap

1. Check the collector against a real Moodle site with and without the plugin.
2. A collector path that uses the MoodlIA plugin's reports (course progress, quiz results, grades in bulk) when the token offers them.
3. Port the quiz review and the AI report of the discontinued `moodlia-analyzer-web`.
4. A dark theme.
5. Code signing for Windows and notarization for macOS, and an app icon.

## License

MIT. See [LICENSE](LICENSE).
