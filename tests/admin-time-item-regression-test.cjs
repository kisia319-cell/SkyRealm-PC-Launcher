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
    const ch = game[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch.charCodeAt(0) === 92) escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch.charCodeAt(0) === 96) { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return game.slice(open + 1, i);
  }
  throw new Error('Unclosed function ' + name);
}
const menu = body('syncAdminMenu');
assert.ok(menu.includes("currentStaffRole==='admin'||gameSettings.adminMode===true"));
assert.ok(menu.includes("gameSettings.moderatorMode===true"));
assert.ok(body('openAdminGate').includes('refreshStaffRole(true)'));
assert.ok(body('openAdminGate').includes('gameSettings.adminMode===true&&!isCoopWorldActive()'));
assert.ok(body('openAdminPanel').includes('staffSection.hidden=!serverAdmin'));
assert.ok(body('openModeratorPanel').includes('gameSettings.moderatorMode===true&&!isCoopWorldActive()'));
assert.ok(body('openModeratorPanel').includes('refreshStaffRole(true)'));
assert.ok(body('openAdminGate').includes("role!=='admin'"));
assert.ok(body('openModeratorPanel').includes("role!=='admin'&&role!=='moderator'"));
const skip = body('skipGameDay');
for (const token of ['totalGameMinutesPlayed+=skippedMinutes','hungerElapsedMinutes+=skippedMinutes','sheepSpawnTimer+=skippedMinutes','survivedNights+=target.nightsPassed','refreshMineDailyStock()']) assert.ok(skip.includes(token), 'Missing skipped-time processing: '+token);
assert.ok(game.includes('totalGameMinutesPlayed+=elapsedGameMinutes'));
assert.ok(game.includes('totalGameMinutesPlayed,survivedNights'));
assert.ok(game.includes('d.totalGameMinutesPlayed'));
assert.ok(body('giveResource').includes('admin-resource-custom'));
assert.ok(body('giveResource').includes('9999999'));
assert.ok(body('giveResource').includes('inventoryItems.push(item)'));
assert.ok(html.includes('id="admin-resource-custom"'));
assert.ok(html.includes('id="admin-item-suggestions"'));
assert.ok(html.includes('id="admin-playtime-label"'));
console.log('SkyRealm staff panels, skipped-time accounting, playtime persistence and arbitrary item grants tests passed.');
