'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const runtime=fs.readFileSync('game/custom-mods-runtime.js','utf8');
const game=fs.readFileSync('game/game.js','utf8');
const html=fs.readFileSync('game/index.html','utf8');
new vm.Script(runtime,{filename:'custom-mods-runtime.js'});
for(const id of ['user-mods-list','open-script-mod-creator','import-user-mod','studio-install-shade','studio-install-yes','studio-install-no']) assert.ok(html.includes('id="'+id+'"'),'Missing external Studio handoff UI: '+id);
assert.ok(!html.includes('id="script-mod-studio"')&&!html.includes('id="script-mod-code"'),'The embedded code editor must be removed from the game.');
assert.ok(html.includes('Вы нажали кнопку «Создать мод»')&&html.includes('нет приложения для создания модов SkyRealmStudio'),'The install prompt must explain why Studio is needed.');
assert.ok(html.includes('Открыть SkyRealmStudio'),'The game button must launch the external application.');
assert.ok(game.includes("nativeApi.check_mod_studio()")&&game.includes("window.pywebview.api.install_mod_studio()"),'The game must check and install Studio through the native PyWebView API.');
assert.ok(runtime.includes("new CustomEvent('skyrealm:open-mod-studio')"),'Existing local mod editing must hand off to the external Studio.');
assert.ok(html.includes('src="custom-mods-runtime.js"')&&html.includes('href="custom-mods.css"'));
for(const fragment of ['sandbox','allow-scripts','worker-src blob:','onTick(context, state)','on_tick(context, state)','MAX_CODE=14000','MAX_ACTIVE=3','skyrealm-user-mod-host','event.source!==frame.contentWindow']) assert.ok(runtime.includes(fragment),'Missing runtime feature or isolation check: '+fragment);
assert.ok(runtime.includes("PYODIDE_VERSION='0.29.5'"),'Python runtime version must be pinned.');
assert.ok(game.includes('window.SkyRealmCustomModHost')&&game.includes('if(!canRunCustomScriptMods()'),'Game must validate custom script actions.');
assert.ok(!runtime.includes('skyrealm_token')&&!runtime.includes('skyrealm_refresh_token'),'Custom scripts must never access authentication tokens.');

function fakeElement(){return {className:'',textContent:'',hidden:false,append(){},replaceChildren(){},addEventListener(){},setAttribute(){},classList:{toggle(){}}};}
const root=fakeElement();
const runtimeContext={
  window:{setInterval(){}},
  document:{readyState:'complete',getElementById(id){return id==='user-mods-list'?root:null;},createElement(){return fakeElement();}},
  localStorage:{getItem(){return null;},setItem(){}},
  URLSearchParams:class{get(){return null;}},
  location:{search:''},
  setTimeout(){return 1;},clearTimeout(){}
};
vm.runInNewContext(runtime,runtimeContext,{filename:'custom-mods-runtime.js'});
const build=runtimeContext.window.SkyRealmCustomMods.buildSandboxDocument;
assert.equal(typeof build,'function','Sandbox document builder must be exposed for automated verification.');

function validateGeneratedWorker(language,source){
  const documentText=build({id:'test_mod_123456',language,source});
  const match=documentText.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(match,'Sandbox iframe script must exist.');
  new vm.Script(match[1],{filename:'sandbox-'+language+'.js'});
  const blobs=[];
  const frameContext={
    document:{head:{appendChild(){}},createElement(){return {httpEquiv:'',content:''};}},
    parent:{postMessage(){}},addEventListener(){},
    Blob:class{constructor(parts){this.parts=parts;}},
    URL:{createObjectURL(blob){blobs.push(blob);return 'blob:test';},revokeObjectURL(){}},
    Worker:class{constructor(url){this.url=url;}},
    String,JSON,Math,Array,Object,Error,Promise
  };
  vm.runInNewContext(match[1],frameContext,{filename:'sandbox-frame-'+language+'.js'});
  assert.equal(blobs.length,1,'Sandbox must create one worker.');
  const workerSource=blobs[0].parts.join('');
  new vm.Script(workerSource,{filename:'generated-worker-'+language+'.js'});
  if(language==='python')assert.ok(workerSource.includes('loadPyodide')&&workerSource.includes('on_tick'));
  else assert.ok(workerSource.includes('new Function')&&workerSource.includes('onTick'));
}
validateGeneratedWorker('javascript','function onTick(context,state){return {state:state,actions:[]};}');
validateGeneratedWorker('python','def on_tick(context, state):\n    return {"state": state, "actions": []}\n');
console.log('JavaScript/Python custom mod studio and generated worker syntax tests passed.');



