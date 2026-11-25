# MoodlIA Analyzer

Desktop app for Moodle course and student analysis. It connects to any Moodle site with a web service token and uses the MoodlIA plugin when the site has it.

[Status](#status) · [Getting started](#getting-started) · [Architecture](#architecture) · [Development](#development) · [Security and privacy](#security-and-privacy) · [Roadmap](#roadmap) · [License](#license)

## Status

Version 0.1.0 is the foundation of the app that will replace `moodlia-analyzer-web` and `moodlia-analyzer-desktop`. It is not released or packaged yet.

What works:

- Saved Moodle sites with tokens encrypted by the operating system keychain.
- Connection with or without the MoodlIA plugin, with the providers detected on connect.
- The list of the user's courses.
- Course analysis: data collection through core Moodle web services, then the engagement, grade, risk and recommendation analysis carried over from `moodlia-analyzer-web`.
- Read-only access to any read operation of the canonical contracts.

The interface is provisional: it exists to exercise the connection and the analysis and will be redesigned.

## Getting started

Requirements: Node.js 22 or later and npm 10 or later.

```bash
npm install
npm approve-scripts electron   # npm blocks install scripts by default; Electron needs its own to download its binary
npm run dev                    # interface with hot reload inside Electron
```

`npm start` builds the interface and opens the app without the dev server.

### Connecting to Moodle

Add a site with its name, its HTTPS address and a web service token. HTTP is accepted only for `localhost` and `127.0.0.1`.

- With the MoodlIA plugin, use a token for the MoodlIA service. If that service does not include the standard Moodle functions, also enter a separate core web services token.
- Without the plugin, use a token for a service that includes the standard functions the analysis needs, such as `core_webservice_get_site_info` and `core_enrol_get_users_courses`.

On connect, the app reports which providers answered: the MoodlIA plugin (with its release) and core web services.

## Architecture

| Part | Location | Role |
| --- | --- | --- |
| Main process | `electron/main.mjs` | Window, security settings, and the IPC handlers the interface calls. |
| Moodle session | `electron/moodle/session.mjs` | Read-only session over the adaptive adapter of the [`moodlia`](https://www.npmjs.com/package/moodlia) package, which builds on [`moodle-core-cli`](https://www.npmjs.com/package/moodle-core-cli). |
| Course collector | `electron/analysis/collector.mjs` | Reads one course through core web services and returns the data the analysis expects. |
| Analysis | `src/analysis/` | Student metrics, grade prediction, risk and recommendations (TypeScript, no Moodle access). |
| Profiles | `electron/profiles.mjs` | Saved sites; tokens encrypted with Electron `safeStorage`. |
| Bridge | `electron/preload.cjs` | The only functions the page can call: `profiles.list/save/remove`, `session.connect/disconnect/courses/read` and `analysis.collect/onProgress`. |
| Interface | `src/` | React and TypeScript, built with Vite. |

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

A source the token cannot read is listed in the result's `unavailable` field with its reason and counted as empty, so a partial token still gives an analysis. Standard web services do not expose the course log, so log-based metrics are marked unavailable. A collector that uses the MoodlIA plugin's reports is planned.

Differences from `moodlia-analyzer-web`, which this app corrects:

- Quiz attempts are read for each student. The earlier app requested them with user 0, which returns only the connected user's own attempts.
- Quiz attempt grades are scaled from the attempt's `sumgrades` to the quiz grade. The earlier app read a `grade` field that Moodle does not return for attempts, so quiz averages were always empty.
- Course profiles are requested with the `userlist` structure Moodle expects.
- Forum posts from the current Moodle forum API (`author.id`, `parentid`, `timecreated`) are normalized to the fields the metrics read.
- Grades come from one course-wide call instead of one call per student.

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server and Electron pointed at it. |
| `npm run typecheck` | TypeScript for the interface and JSDoc checks for the main process. |
| `npm test` | Main-process tests with `node --test`, including end-to-end tests that run the real `moodlia` and `moodle-core-cli` clients against a fake Moodle REST endpoint on `127.0.0.1` (connection with and without the plugin, and a full course collection that checks the Moodle function names and parameters sent). Then the analysis tests with Vitest. |
| `npm run smoke` | Builds the interface and starts the app with `MOODLIA_ANALYZER_SMOKE=1`. The app checks that the page renders, the bridge is present, Node is not reachable from the page and a bridge call returns, then exits. A temporary profile directory is used. |
| `npm run check` | All of the above. |

## Security and privacy

- The page runs with context isolation, the sandbox and no Node integration. It can reach Moodle only through the bridge functions, and only for read operations.
- Only the app's own page may call the main process. Navigation away from the app is blocked, other windows are refused, and external `https://` links open in the default browser. Permission requests (camera, notifications and the like) are refused.
- A Content Security Policy limits the page to its own scripts.
- Tokens are encrypted with the operating system keychain (DPAPI on Windows, Keychain on macOS, the Secret Service on Linux) and never reach the page. If the system cannot encrypt, tokens are used for the session and are not written to disk.
- Course and student data stay on the computer. The app has no backend and sends nothing to MoodlIA.

## Roadmap

1. Check the collector against a real Moodle site with and without the plugin.
2. A collector path that uses the MoodlIA plugin's reports (course progress, quiz results, grades in bulk) when the token offers them.
3. Port the quiz review and the AI report from `moodlia-analyzer-web`.
4. Design the interface.
5. Installers for Windows, macOS and Linux.
6. Check what `moodlia-analyzer-desktop` offers that this app lacks, then retire both earlier analyzers.

## License

MIT. See [LICENSE](LICENSE).
