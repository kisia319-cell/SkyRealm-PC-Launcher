'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const game = fs.readFileSync(path.join(__dirname, '../game/game.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../game/index.html'), 'utf8');

function body(name) {
  const start = game.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'Missing function ' + name);
  const open = game.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = open; i < game.length; i++) {
    const c = game[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === String.fromCharCode(92)) escaped = true;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c.charCodeAt(0) === 96) { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return game.slice(open + 1, i);
  }
  throw new Error('Unclosed function ' + name);
}

const menu = body('syncAdminMenu');
assert.match(menu, /el\\.hidden=false/);
assert.match(body('openAdminGate'), /refreshStaffRole\\(true\\)/);
assert.match(body('openModeratorPanel'), /refreshStaffRole\\(true\\)/);
assert.match(body('openAdminGate'), /role!=='admin'/);
assert.match(body('openModeratorPanel'), /role!=='admin'&&role!=='moderator'/);

const skip = body('skipGameDay');
for (const token of ['totalGameMinutesPlayed+=skippedMinutes', 'hungerElapsedMinutes+=skippedMinutes',
  'sheepSpawnTimer+=skippedMinutes', 'survivedNights+=target.nightsPassed', 'refreshMineDailyStock()']) {
  assert.ok(skip.includes(token), 'Skipped time must process: ' + token);
}
assert.match(game, /totalGameMinutesPlayed\\+=elapsedGameMinutes/);
assert.match(game, /totalGameMinutesPlayed,\\s*survivedNights/);
assert.match(game, /d\\.totalGameMinutesPlayed/);
assert.match(body('giveResource'), /admin-resource-custom/);
assert.match(body('giveResource'), /9999999/);
assert.match(body('giveResource'), /inventoryItems\\.push\\(item\\)/);
assert.match(html, /id="admin-resource-custom"/);
assert.match(html, /id="admin-item-suggestions"/);
assert.match(html, /id="admin-playtime-label"/);
console.log('SkyRealm staff panels, skipped-time accounting, playtime persistence and arbitrary item grants tests passed.');
