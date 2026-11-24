'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const game = fs.readFileSync(path.join(root, 'game/game.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'game/index.html'), 'utf8');
const settlement = fs.readFileSync(path.join(root, 'game/spawn-settlement.js'), 'utf8');
assert.match(html, /<script src="spawn-settlement\.js"><\/script>(?:<script src="apocalypse-3d-consent\.js"><\/script>)?(?:<script src="apocalypse-cinematic\.js"><\/script>)?<script src="game\.js"><\/script>/);
assert.match(game, /window\.SkyRealmSpawnSettlement\?\.draw\?\.\(ctx,camX,camY,time,TILE,true\)/);
assert.match(game, /window\.SkyRealmSpawnSettlement\?\.draw\?\.\(ctx,camX,camY,time,TILE,false\)/);
assert.match(game, /spawnZone=x>=11&&x<=31&&y>=17&&y<=35/);
for (const feature of ['ПУНКТ  ВЫЖИВШИХ','МЕДПУНКТ','МАСТЕРСКАЯ','КАРАНТИН','ГЕНЕРАТОР','ЭВАКУАЦИЯ','СТАРТОВОЕ ПОСЕЛЕНИЕ','ГОСТЕВОЙ ДОМ','ДОМ СТАРОСТЫ']) {
  assert.ok(settlement.includes(feature), 'Spawn settlement must include ' + feature);
}
assert.match(settlement, /function watchTower/);
assert.match(settlement, /function vehicle/);
assert.match(settlement, /function survivor/);
assert.match(settlement, /function fence/);
assert.match(settlement, /visual-only/);
console.log('Expanded spawn settlement regression checks passed.');
