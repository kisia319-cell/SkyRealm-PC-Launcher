'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('game/index.html','utf8');
const css=fs.readFileSync('game/cinematic-loading.css','utf8');
assert.match(html,/intro\.classList\.add\('intro-exit','intro-out'\)/,'Entering the game must fade and hide the entire intro overlay');
assert.match(html,/intro\.setAttribute\('aria-hidden','true'\)/,'Dismissed intro must be hidden from assistive technology');
assert.match(html,/intro\.remove\(\);/,'Intro overlay must be removed after dismissal');
for(const selector of ['.sr-intro-tools','.sr-start-actions','.sr-intro-exit-hint','.sr-enter-button','.sr-loading']){
 assert.ok(css.includes('#skyrealm-intro.intro-exit '+selector),'Intro-only element must disappear on exit: '+selector);
}
assert.match(css,/#skyrealm-intro\.intro-exit\s*\{[^}]*pointer-events:none/s,'Dismissed overlay must not intercept game input');
console.log('Cinematic intro cleanup regression tests passed.');
