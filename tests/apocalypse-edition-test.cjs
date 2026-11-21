const assert = require('node:assert/strict');
const fs = require('node:fs');
const game = fs.readFileSync('game/game.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/build-release.yml', 'utf8');

assert.match(game, /window\.SKYREALM_BUILD_EDITION/);
assert.match(game, /document\.documentElement\.dataset\.skyrealmEdition/);
assert.match(game, /buildEdition \|\| params\.get\('mode'\)/);
assert.match(game, /skyrealm_apocalypse_worlds_v1/);

assert.match(workflow, /\$apocalypseHtmlPath = Join-Path \$apocalypseStage "index\.html"/);
assert.match(workflow, /window\.SKYREALM_BUILD_EDITION="apocalypse"/);
assert.match(workflow, /mandatory edition bootstrap/);
assert.match(workflow, /SkyRealm_Apocalypse_Game\.zip/);

console.log('Apocalypse edition regression checks passed: the dedicated package embeds an authoritative build flag before game.js loads.');
