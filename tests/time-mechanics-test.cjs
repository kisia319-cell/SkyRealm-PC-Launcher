'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname,'../game/game.js'),'utf8');
assert.match(source,/const GAME_TIME_SPEED=2;/,'The in-game clock must run at double speed.');
assert.match(source,/gameMinuteTotal\+=dt\*GAME_TIME_SPEED;/,'The clock tick must apply the configured time multiplier.');

const helper = source.match(/function calculateSkipDayTarget\(totalMinutes,lastDawnMarker\)\s*\{[\s\S]*?\n  \}/);
assert.ok(helper,'The day-skip target calculation must be extracted and testable.');
const context = { GAME_MINUTES_PER_DAY: 1440, DAWN_MINUTE: 360, NIGHT_MINUTE: 1200, Math };
vm.runInNewContext(helper[0]+'\nglobalThis.runSkipTarget=calculateSkipDayTarget;',context);

const day = 12;
const cases = [
  {label:'morning',minute:8*60,lastDawn:day,expected:{minuteTotal:day*1440+1200,dawnMarker:day,nightsPassed:0}},
  {label:'late afternoon',minute:19*60+59,lastDawn:day,expected:{minuteTotal:day*1440+1200,dawnMarker:day,nightsPassed:0}},
  {label:'exactly at night start',minute:20*60,lastDawn:day,expected:{minuteTotal:(day+1)*1440+1200,dawnMarker:day+1,nightsPassed:1}},
  {label:'late night',minute:23*60,lastDawn:day,expected:{minuteTotal:(day+1)*1440+1200,dawnMarker:day+1,nightsPassed:1}},
  {label:'after midnight before dawn',minute:2*60,lastDawn:day-1,expected:{minuteTotal:day*1440+1200,dawnMarker:day,nightsPassed:1}},
  {label:'before dawn',minute:4*60,lastDawn:day-1,expected:{minuteTotal:day*1440+1200,dawnMarker:day,nightsPassed:1}}
];
for (const test of cases) {
  const actual = JSON.parse(JSON.stringify(context.runSkipTarget(day*1440+test.minute,test.lastDawn)));
  assert.deepEqual(actual,test.expected, 'Incorrect skip target for '+test.label);
}
console.log('SkyRealm double-speed clock and 20:00 day-skip tests passed.');
