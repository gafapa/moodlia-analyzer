# Changelog

## 0.1.0 - unreleased

- Electron desktop app foundation. Moodle requests run in the main process, so browser CORS rules do not apply.
- Read-only Moodle session over the adaptive adapter of `moodlia` 0.5.3: it detects the MoodlIA plugin with `get_moodlia_status` and core web services with `core_webservice_get_site_info`, prefers the plugin for the operations it declares, and refuses operations that change Moodle data.
- Saved sites with tokens encrypted by the operating system keychain; one token is used for both providers unless a separate core token is given.
- Course list for the connected user.
- Course analysis: a collector in the main process reads one course through core web services with progress updates, and the student metrics, grade prediction, risk and recommendation analysis of `moodlia-analyzer-web` runs on the result. Sources the token cannot read are reported and counted as empty.
- Fixes over `moodlia-analyzer-web`: quiz attempts are read per student instead of only the connected user's; attempt grades are scaled from `sumgrades`, so quiz averages are no longer empty; course profiles use the `userlist` structure; current forum posts are normalized; grades come from one course-wide call.
- Every read names its provider (`moodlia` or `core`), because both contracts share operation names with different parameters.
- Provisional interface to exercise the connection layer.
- Unit tests, end-to-end tests against a fake Moodle REST endpoint (connection with and without the plugin, and a full course collection), Vitest analysis tests, and a startup smoke check.
