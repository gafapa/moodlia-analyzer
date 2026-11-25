# Changelog

## 0.1.0 - unreleased

- Electron desktop app foundation. Moodle requests run in the main process, so browser CORS rules do not apply.
- Read-only Moodle session over the adaptive adapter of `moodlia` 0.5.3: it detects the MoodlIA plugin with `get_moodlia_status` and core web services with `core_webservice_get_site_info`, prefers the plugin for the operations it declares, and refuses operations that change Moodle data.
- Saved sites with tokens encrypted by the operating system keychain; one token is used for both providers unless a separate core token is given.
- Course list for the connected user.
- Provisional interface to exercise the connection layer.
- Unit tests, end-to-end tests against a fake Moodle REST endpoint with and without the plugin, and a startup smoke check.
