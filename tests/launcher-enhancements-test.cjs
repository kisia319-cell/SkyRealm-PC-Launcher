'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const launcher=fs.readFileSync('launcher.py','utf8');
const app=fs.readFileSync('app.js','utf8');
const auth=app;
const enhancements=fs.readFileSync('launcher-enhancements.js','utf8');
const ui=fs.readFileSync('launcher-enhancements.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('style.css','utf8');
assert.match(launcher,/def get_update_status/);
assert.match(launcher,/def install_game_update/);
assert.match(launcher,/def repair_game_files/);
assert.match(launcher,/def rollback_game_update/);
assert.match(launcher,/def get_system_metrics/);
assert.match(launcher,/def _skyrealm_preferred_local_game_version\(installed_version: str, bundled_version: str\)/,'Launcher must compare the installed build with its bundled game version');
assert.ok(launcher.includes('preferred_local_version = _skyrealm_preferred_local_game_version(installed_version, bundled_version)') && launcher.includes('latest_tuple < preferred_local_tuple'), 'A stale stable manifest must never downgrade or block a newer bundled game hotfix');
assert.ok(launcher.includes('return preferred_local_version'), 'When the stable manifest is older, launch_game must use the preferred local build so bundled game files are installed');

const launchGameSource=launcher.match(/def launch_game\([\s\S]*?(?=\n\nclass GameApi:)/);
assert.ok(launchGameSource,'Game launch method must be present');
const appDataDeclaration=launchGameSource[0].indexOf('app_data = Path(');
const runnerPathUse=launchGameSource[0].indexOf('runner_dir = app_data / "SkyRealm" / "bin"');
assert.ok(appDataDeclaration>=0&&runnerPathUse>appDataDeclaration,'launch_game must define its LocalAppData base before installing the standalone game runner');
assert.ok(launcher.includes('AllowSetForegroundWindow(game_process.pid)'), 'Launcher must grant the separately spawned game process permission to activate its window');
assert.ok(launcher.includes('def _skyrealm_activate_current_window()') && launcher.includes('user32.SetForegroundWindow(hwnd)') && launcher.includes('user32.BringWindowToTop(hwnd)'), 'Game runner must activate its own visible native window on Windows');
assert.ok(launcher.includes('game_window.events.shown += _activate_game_window') && launcher.includes('game_window.events.loaded += _activate_game_window') && launcher.includes('focus=True'), 'Game window activation must run after native show and WebView load');


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

assert.ok(app.includes("vsync: $('#vsync-toggle') ? $('#vsync-toggle').checked : savedGamePreferences().vsync"),'Launcher must persist the VSync preference');
assert.ok(app.includes("p.vsync = p.vsync !== false"),'VSync must default to enabled for existing settings');
assert.ok(html.includes('id="vsync-toggle"'),'Settings must expose a VSync toggle');
assert.ok(css.includes('body.reduce-motion')&&css.includes('body.high-contrast')&&css.includes('body.performance-saver'),'Accessibility and resource-saving toggles must have working styles');

// Deep audit follow-ups: selected install path, exact file integrity and safe backup history.

assert.match(launcher,/def list_world_backups\(self\)/,'Launcher must list local world backup archives');
assert.match(launcher,/def _skyrealm_inspect_world_backup\(self, archive_path\)/,'Every world backup must be verified before restore');
assert.match(launcher,/def restore_worlds\(self, backup_name=None\)/,'World restore must accept a selected backup');
assert.match(launcher,/skyrealm_safe_world_backup_name\(backup_name\)/,'Selected backup names must be validated against path traversal');
assert.match(launcher,/bundle\.testzip\(\)/,'World backup restore must reject ZIP CRC corruption');
assert.match(launcher,/PurePosixPath/,'World backup paths must be normalized before extraction');
assert.match(launcher,/512 \* 1024 \* 1024/,'World backup extraction must enforce an uncompressed size limit');
assert.match(launcher,/install_dir = skyrealm_game_dir\(\)/,'Diagnostics and update status must use the configured installation folder');
assert.match(launcher,/integrity_mismatches/,'Diagnostics must compare installed files against the bundled release');
assert.match(launcher,/integrity_checked/,'Diagnostics must report how many bundled files were checked');
assert.match(launcher,/bundled_game_version/,'Update status must account for a newer game bundled with the launcher');
assert.match(launcher,/missing_game_files/,'Update status must offer repair when required installed files are missing');
assert.match(launcher,/def get_local_versions\(self\)/,'The launcher must expose its local version even while offline');
assert.match(enhancements,/async function refreshLocalVersions\(\)/,'The home screen must populate version labels without depending on the remote manifest');
assert.ok(enhancements.includes('refreshLocalVersions();refreshServices();refreshNotifications();checkUpdates();'),'Local versions must load before the remote update request');
assert.ok(app.includes("'#backup-worlds':'Create backup'")&&app.includes("'#restore-worlds':'Restore selected'"),'Backup manager controls must be localized');
assert.ok(enhancements.includes("calendarMonth.toLocaleDateString(enhancementLanguage==='en'?'en-US':'ru-RU'"),'The dynamic calendar must respect the selected language');

assert.ok(html.includes('id="world-backup-select"')&&html.includes('id="refresh-world-backups"'),'Settings must expose backup selection and list refresh controls');
assert.ok(app.includes('list_world_backups')&&app.includes('restore_worlds(selectedBackup)'),'Backup UI must list archives and pass the selected archive to restore');
assert.ok(app.includes("new CustomEvent('skyrealm:language-changed'"),'Launcher language changes must notify dynamically-created pages');
assert.match(app,/pageSystem:'CONTROL CENTER'/,'Page navigation names must include dynamic pages in English');
assert.match(enhancements,/function applyDynamicTranslations\(root=document\)/,'Dynamic pages must be localized when created and after language changes');
assert.ok(enhancements.includes('integrity_mismatches')&&enhancements.includes('runner_exists'),'System diagnostics must display file mismatches and runner status');
assert.ok(html.includes('id="home-launcher-version"')&&html.includes('id="home-game-version"'),'Home status must contain dynamic version fields');
assert.ok(html.includes('id="install-version-label"')&&enhancements.includes("$('#install-version-label').textContent='v'"),'Install overlay must show the current game version, not a stale constant');
assert.ok(html.includes('id="launcher-version-label"')&&app.includes('launcher-version-label'),'Sidebar version label must be populated from launcher metadata');
assert.ok(!html.includes('nav-badge">2')&&!html.includes('nav-badge">8'),'Navigation must not display stale hard-coded notification counts');
assert.ok(html.includes('id="mods-catalog-count"'),'Mod catalog badge must be calculated from the real catalog');

