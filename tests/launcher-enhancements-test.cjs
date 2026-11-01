'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const launcher=fs.readFileSync('launcher.py','utf8');
const app=fs.readFileSync('app.js','utf8');
const enhancements=fs.readFileSync('launcher-enhancements.js','utf8');
const ui=fs.readFileSync('launcher-enhancements.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert.match(launcher,/def get_update_status/);
assert.match(launcher,/def install_game_update/);
assert.match(launcher,/def repair_game_files/);
assert.match(launcher,/def rollback_game_update/);
assert.match(launcher,/def get_system_metrics/);
assert.match(launcher,/previous build preserved/);
for(const id of ['system-auth-dot','system-coop-dot','system-social-dot','system-install-update','system-repair','system-rollback','system-open-cloud','system-cpu','system-ram']) assert.ok(ui.includes(id),'Missing management UI: '+id);
assert.ok(ui.includes('/api/social/notifications'));
assert.ok(ui.includes('__cloud_saves__'));
assert.ok(html.includes('launcher-enhancements.js')&&html.includes('launcher-enhancements.css'));

assert.match(app,/function setAuthEntryState\(authenticated\)/,'Auth entry state helper must exist');
assert.match(app,/\$\$\('\[data-auth-mode\], #top-create-account'\)/,'All register/login entry buttons must be toggled');
assert.match(app,/setAuthEntryState\(true\)/,'Verified profile must hide account entry buttons');
assert.match(app,/setAuthEntryState\(false\)/,'Logout or invalid session must restore account entry buttons');
assert.match(app,/requestApi\('\/api\/auth\/me'/,'Saved sessions must be verified with the server');
assert.match(app,/if \(!currentToken\(\) \|\| !apiConfigured\(\)\)/,'Missing session must leave account entry available');
console.log('Launcher enhancements: OK');

assert.match(app,/\$\$\('\[data-auth-mode\], #top-create-account'\)/,'Account buttons must be toggled through querySelectorAll, not querySelector');
assert.match(app,/fpsLimit/,'Launcher FPS preference must be normalized and persisted');
assert.match(app,/musicVolume/,'Launcher music volume must be wired');
assert.match(app,/sfxVolume/,'Launcher sound volume must be wired');
assert.match(app,/applyLauncherAudioSettings/,'Launcher music setting must control the background audio');
assert.match(app,/launcher-scale-select/,'Launcher text scale must be wired');
assert.match(app,/reduce-motion-toggle/,'Reduced motion setting must be wired');
assert.match(app,/high-contrast-toggle/,'High contrast setting must be wired');
assert.match(app,/performance-saver-toggle/,'Resource-saving setting must be wired');
assert.ok(html.includes('id="fps-limit-select"')&&html.includes('id="music-volume-range"')&&html.includes('id="sfx-volume-range"'),'FPS and audio controls must exist in the settings page');
assert.ok(launcher.includes('"fpsLimit": 0')&&launcher.includes('"musicVolume": 35')&&launcher.includes('"sfxVolume": 70'),'Native settings must preserve audio and FPS preferences');

assert.match(app,/DEFAULT_KEY_BINDINGS/,'Launcher must expose editable default key bindings');
assert.match(app,/renderKeyBindings/,'Launcher must render the key-binding editor');
assert.ok(html.includes('id="key-bindings-list"')&&html.includes('id="reset-key-bindings"'),'Keyboard remapping controls must exist');
assert.ok(launcher.includes('"keyBindings"')&&launcher.includes('"up": "KeyW"'),'Native launcher settings must persist keyboard bindings');

assert.match(launcher,/def skyrealm_data_root\(settings=None\)/,'Launcher must resolve the configured installation root');
assert.match(launcher,/def select_install_folder\(self\)/,'Windows launcher must expose a native folder picker');
assert.match(launcher,/def reset_install_folder\(self\)/,'Windows launcher must allow restoring the default folder');
assert.match(launcher,/install_dir = skyrealm_game_dir\(preferences\)/,'Game installation must use the selected folder');
assert.ok(html.includes('id="select-install-folder"')&&html.includes('id="reset-install-folder"')&&html.includes('id="install-folder-path"'),'Installation folder controls must exist in launcher settings');
assert.match(app,/select_install_folder/,'Launcher UI must call the native folder picker');
assert.match(app,/reset_install_folder/,'Launcher UI must call the default folder reset action');

assert.match(launcher,/root = skyrealm_data_root\(\)\s+install_dir = root \/ "game"/,'Startup update checks must respect the selected installation root');
const previewWorkflow=fs.readFileSync('.github/workflows/publish-coop-preview.yml','utf8');
assert.match(previewWorkflow,/\\d\+\\\\\.\\\\d\+\\\\\.\\\\d\+\(\?:\\\\\.\\\\d\+\)\?/, 'Co-op preview workflow must accept the current four-part game version');
assert.match(previewWorkflow,/name=\\\"skyrealm-game-version\\\" content=\\\"/, 'Co-op preview validation must use the real game version metadata');

assert.match(launcher,/def save_screenshot\(self, data_url\)/,'Game window must expose safe screenshot saving');
assert.match(launcher,/def get_screenshots\(self\)/,'Launcher must list saved screenshots');
assert.match(launcher,/def get_screenshot_data\(self, name\)/,'Launcher must open a selected screenshot');
assert.match(launcher,/def open_screenshot_folder\(self\)/,'Launcher must expose the screenshot folder');
assert.match(launcher,/skyrealm_screenshot_name_is_safe/,'Screenshot gallery must reject path traversal names');
assert.match(enhancements,/function ensureScreenshotsPage\(\)/,'Launcher must create a separate screenshot gallery page');
assert.match(enhancements,/function refreshScreenshots\(\)/,'Screenshot gallery must load saved screenshots');

assert.match(enhancements,/function ensureCalendarPage\(\)/,'Launcher must provide a game calendar');
assert.match(enhancements,/CALENDAR_STORAGE_KEY/,'Calendar events must persist locally');
assert.match(enhancements,/function ensureSupportPage\(\)/,'Launcher must provide a support center');
assert.match(enhancements,/function copySupportDiagnostics\(\)/,'Support center must generate a diagnostics report');
assert.ok(enhancements.includes('issues/new')&&enhancements.includes('releases/latest'),'Support center must link to real issue and release pages');

assert.match(auth,/async function restoreSession\(\)/,'Launcher must restore the signed-in session on startup');
assert.ok(auth.includes("requestApi('/api/auth/me'"),'Launcher must validate a saved login against the account service');
assert.ok(auth.includes("$$('[data-auth-mode], #top-create-account')"),'All create-account and sign-in entry buttons must be hidden for a verified session');
assert.ok(auth.includes("$('#auth-form').hidden = true") && auth.includes("$('.auth-tabs').hidden = true"),'Verified accounts must not see the login/register form or tabs');
