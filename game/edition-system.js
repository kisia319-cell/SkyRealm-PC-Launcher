(() => {
'use strict';
const API='https://jaaguprbfrzrcwuusher.supabase.co/functions/v1/skyrealm-edition';
const PUBLISHABLE_KEY='sb_publishable_MKaNYqw3r0BLa1GTDVvjfw_yU3Wd6QL';
const DEVICE_KEY='skyrealm_device_id_v1';
const $=id=>document.getElementById(id),shade=$('edition-shade');
if(!shade)return;
let continuation=null,busy=false,premiumActive=false,currentEdition='unselected',sessionToken='';
const views=['edition-choice-view','edition-activation-view','edition-free-view','edition-success-view'];
function deviceId(){
 let id=localStorage.getItem(DEVICE_KEY);
 if(!/^[0-9a-f-]{36}$/i.test(id||'')){id=crypto.randomUUID();localStorage.setItem(DEVICE_KEY,id);}
 return id;
}
function show(view,title,description,mark='✦'){
 for(const id of views)$(id).hidden=id!==view;
 $('edition-title').textContent=title;
 $('edition-description').textContent=description;
 $('edition-mark').textContent=mark;
 shade.hidden=false;shade.setAttribute('aria-hidden','false');
}
function closeAndContinue(){
 shade.hidden=true;shade.setAttribute('aria-hidden','true');
 const next=continuation;continuation=null;
 if(typeof next==='function')next();
 const gameCanvas=$('world');
 if(gameCanvas)window.setTimeout(()=>gameCanvas.focus(),0);
}
function setStatus(message,error=false){
 const n=$('edition-status');n.textContent=message||'';n.classList.toggle('error',!!error);
}
function ensureRememberControl(){
 if($('edition-remember-row'))return;
 const options=$('edition-choice-view')?.querySelector('.edition-options');
 if(!options)return;
 const row=document.createElement('label');
 row.id='edition-remember-row';row.className='edition-remember-row';
 row.innerHTML='<input id="edition-remember-choice" type="checkbox"><span class="edition-remember-check" aria-hidden="true"></span><span class="edition-remember-copy"><b>Сохранять при каждом запуске выбор?</b><small id="edition-remember-hint">Настройка будет сохранена в твоём аккаунте.</small></span>';
 options.insertAdjacentElement('afterend',row);
 const style=document.createElement('style');
 style.textContent='#edition-remember-row{display:flex;align-items:center;gap:11px;margin:13px 0 4px;padding:12px 14px;border:1px solid #3a557d;border-radius:12px;background:rgba(8,22,40,.78);text-align:left;cursor:pointer}#edition-remember-row input{position:absolute;opacity:0;pointer-events:none}#edition-remember-row .edition-remember-check{width:19px;height:19px;flex:0 0 19px;border:1px solid #718bb7;border-radius:5px;background:#09182a;display:grid;place-items:center}#edition-remember-row input:checked+.edition-remember-check{background:#6389ed;border-color:#9dbbff}#edition-remember-row input:checked+.edition-remember-check:after{content:"✓";font-size:13px;font-weight:900;color:white}#edition-remember-row input:disabled+.edition-remember-check{opacity:.45}#edition-remember-row:has(input:disabled){cursor:not-allowed;opacity:.8}.edition-remember-copy{display:grid;gap:4px}.edition-remember-copy b{font-size:11px;color:#e6efff}.edition-remember-copy small{font-size:9px;line-height:1.4;color:#93aaca}';
 document.head.appendChild(style);
}
function rememberChecked(){return $('edition-remember-choice')?.checked===true;}
function setRememberAvailability(available){
 const input=$('edition-remember-choice'),hint=$('edition-remember-hint');
 if(input)input.disabled=!available;
 if(hint)hint.textContent=available?'Настройка будет сохранена в твоём аккаунте.':'Войди в аккаунт в лаунчере, чтобы сохранять выбор между компьютерами.';
}
async function getSessionToken(){
 try{
  const api=window.pywebview?.api;
  if(!api?.get_auth_session)return '';
  const session=await api.get_auth_session();
  return typeof session?.token==='string'?session.token:'';
 }catch(_){return '';}
}
async function apiRequest(body,authenticated=false,allowNegative=false){
 const headers={'Content-Type':'application/json','apikey':PUBLISHABLE_KEY};
 if(authenticated&&sessionToken)headers.Authorization='Bearer '+sessionToken;
 const response=await fetch(API,{method:'POST',headers,cache:'no-store',body:JSON.stringify(body)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||(!allowNegative&&data.ok!==true)){
  const error=new Error(data.code||'REQUEST_FAILED');error.code=data.code||'';error.status=response.status;throw error;
 }
 return data;
}
async function loadPreference(){
 if(!sessionToken)return null;
 try{
  const data=await apiRequest({action:'preference_get'},true);
  return data.preference?.remember===true?data.preference:null;
 }catch(_){return null;}
}
async function persistChoice(edition){
 const remember=rememberChecked();
 if(!sessionToken){
  if(remember)throw new Error('Войди в аккаунт в лаунчере, чтобы сохранить выбор.');
  return true;
 }
 await apiRequest({action:'preference_set',edition,remember},true);
 return true;
}
function openActivation(){
 $('edition-code-input').value='';setStatus('');
 show('edition-activation-view','Активация Premium','Введи действительный код, чтобы открыть расширенное издание.','🔑');
 $('edition-code-input').focus();
 window.setTimeout(()=>{const input=$('edition-code-input');if(!shade.hidden&&!$('edition-activation-view').hidden)input.focus();},80);
}
async function verifyPremium(){
 const data=await apiRequest({action:'verify',device_id:deviceId()},false,true);
 premiumActive=data.ok===true&&data.edition==='premium';
 return premiumActive;
}
async function request(next){
 continuation=next;
 ensureRememberControl();
 sessionToken=await getSessionToken();
 setRememberAvailability(!!sessionToken);
 const saved=await loadPreference();
 if(saved){
  $('edition-remember-choice').checked=true;
  currentEdition=saved.edition;
  if(saved.edition==='free'){premiumActive=false;closeAndContinue();return;}
  try{
   if(await verifyPremium()){currentEdition='premium';closeAndContinue();return;}
   show('edition-activation-view','Требуется активация Premium','В твоём аккаунте выбрано Premium. Активируй его на этом устройстве, чтобы продолжить.','✧');
   setStatus('Лицензия Premium проверяется отдельно для каждого устройства.',true);
   return;
  }catch(_){
   show('edition-activation-view','Проверка Premium','Не удалось связаться с сервером лицензий. Проверь интернет и повтори попытку.','✧');
   setStatus('Выбор Premium сохранён в аккаунте, но для проверки лицензии нужно соединение.',true);
   return;
  }
 }
 $('edition-remember-choice').checked=false;
 currentEdition='unselected';premiumActive=false;
 show('edition-choice-view','Выберите версию игры','Выбери издание SkyRealm перед началом путешествия.','✦');
}
async function activate(){
 if(busy)return;
 const code=$('edition-code-input').value.trim();
 if(!code){setStatus('Введи код активации.',true);return;}
 busy=true;$('edition-activate').disabled=true;setStatus('Проверяем код на сервере…');
 try{
  const data=await apiRequest({action:'redeem',code,device_id:deviceId()});
  if(data.edition!=='premium')throw new Error('INVALID_EDITION');
  premiumActive=true;currentEdition='premium';
  let savedMessage='';
  try{await persistChoice('premium');}
  catch(_){savedMessage=' Не удалось сохранить выбор в аккаунте — проверь вход и повтори настройку позже.';}
  $('edition-success-text').textContent=(data.uses_remaining===1?'Premium активирован! Осталась ещё 1 тестовая активация кода.':'Premium активирован! Тестовые активации этого кода закончились.')+savedMessage;
  show('edition-success-view','Добро пожаловать в Premium','Лицензия активирована на этом устройстве.','✧');
 }catch(error){
  const message=error.code==='INVALID_OR_EXHAUSTED'?'Код неверный или обе тестовые активации уже использованы.':error.code==='SERVICE_UNAVAILABLE'?'Сервер активации временно недоступен. Попробуй позже.':'Не удалось подтвердить код. Проверь его и попробуй снова.';
  setStatus(message,true);
 }finally{busy=false;$('edition-activate').disabled=false;}
}
function requirePremium(feature){
 if(premiumActive)return true;
 continuation=null;$('edition-code-input').value='';setStatus('');
 show('edition-activation-view','Возможность Premium',String(feature||'Эта возможность')+' доступна в Premium. Введи код активации, чтобы открыть её.','✧');
 return false;
}
$('edition-choose-free').addEventListener('click',()=>{
 premiumActive=false;currentEdition='free';
 show('edition-free-view','Бесплатная версия · Free','Вот что входит в каждое издание SkyRealm.','🌿');
});
async function choosePremium(){
 currentEdition='premium';
 try{
  if(await verifyPremium()){
   let note='';
   try{await persistChoice('premium');}catch(_){note=' Не удалось сохранить выбор в аккаунте — проверь вход и повтори настройку позже.';}
   $('edition-success-text').textContent='Premium уже активирован на этом устройстве.'+note;
   show('edition-success-view','Добро пожаловать в Premium','Лицензия проверена сервером.','✧');
   return;
  }
 }catch(_){
  show('edition-activation-view','Проверка Premium','Не удалось проверить текущую активацию. Проверь интернет и повтори попытку.','✧');
  setStatus('Существующая лицензия не сброшена. Для проверки нужно соединение.',true);
  return;
 }
 openActivation();
}
$('edition-choose-premium').addEventListener('click',choosePremium);
$('edition-back').addEventListener('click',()=>show('edition-choice-view','Выберите версию игры','Выбери издание SkyRealm перед началом путешествия.','✦'));
$('edition-activate').addEventListener('click',activate);
$('edition-code-input').addEventListener('keydown',e=>{if(e.key==='Enter')activate();});
$('edition-free-continue').addEventListener('click',async()=>{
 try{await persistChoice('free');currentEdition='free';closeAndContinue();}
 catch(error){show('edition-free-view','Бесплатная версия · Free','Выбор пока не сохранён. Проверь вход в аккаунт и попробуй ещё раз.','🌿');setStatus(error.message,true);}
});
$('edition-free-premium').addEventListener('click',openActivation);
$('edition-success-continue').addEventListener('click',closeAndContinue);
window.SkyRealmEdition={request,isPremium:()=>premiumActive,edition:()=>currentEdition,requirePremium};
document.addEventListener('click',event=>{
 const target=event.target.closest('#menu-coop,#menu-mods,#cloud-save-open');
 if(!target||window.SkyRealmEdition.isPremium())return;
 event.preventDefault();event.stopImmediatePropagation();
 const label=target.id==='menu-coop'?'Кооператив':target.id==='menu-mods'?'Каталог модов':'Облачные сохранения';
 window.SkyRealmEdition.requirePremium(label);
},true);
})();