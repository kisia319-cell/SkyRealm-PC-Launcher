(() => {
'use strict';
const client=window.SkyRealmCoopClient;if(!client)return;
const $=id=>document.getElementById(id),shade=$('coop-shade'),message=$('coop-message');
let room=null,inviteCode='',pollHandle=null,heartbeatHandle=null,busy=false,realtimeAttemptedRoom='';
function setMessage(text,isError=false){message.textContent=text;message.style.borderColor=isError?'#9d5368':'#30496d';message.style.color=isError?'#ffb4c0':'#bdd1f3';}
function isOwner(){return !!room&&room.owner_id===client.userId;}
function statusText(status){return ({lobby:'Ожидание игроков',running:'Игра идёт',paused:'Пауза владельца',closed:'Закрыта'})[status]||status||'Неизвестно';}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function render(){
  $('coop-no-room').classList.toggle('coop-hidden',!!room);$('coop-has-room').classList.toggle('coop-hidden',!room);if(!room)return;
  $('coop-room-status').textContent=statusText(room.status);$('coop-room-id').textContent='ID: '+room.id;
  $('coop-resume').hidden=!(isOwner()&&room.status==='paused');$('coop-pvp-row').classList.toggle('coop-hidden',!isOwner());$('coop-pvp').checked=!!room.pvp_enabled;
  const members=Array.isArray(room.members)?room.members:[];
  $('coop-members').innerHTML=members.map(member=>{
    const name=escapeHtml(member.username||('Игрок '+String(member.user_id||'').slice(0,8)));
    return '<div class="coop-player"><span>'+name+'<small> · '+(member.role==='owner'?'Владелец':'Игрок')+'</small></span><small>'+(member.status==='offline'?'Отключён':'В сети')+'</small></div>';
  }).join('')||'<div class="coop-player">Пока в комнате только ты</div>';
  $('coop-invite-row').hidden=!inviteCode;if(inviteCode)$('coop-invite-code').textContent=inviteCode;
}
async function refresh(silent=false){
  if(busy)return;
  try{
    room=await client.current();render();
    if(!room||room.status==='paused'||room.status==='closed'){
      await client.disconnectRealtime();
      realtimeAttemptedRoom='';
    }else if(realtimeAttemptedRoom!==room.id){
      realtimeAttemptedRoom=room.id;
      client.connectRealtime(room,{
        onPresence:state=>{
          const online=Object.values(state||{}).flat().length;
          setMessage('Канал комнаты подключён · сейчас онлайн: '+online);
        },
        onStatus:status=>{
          if(status==='SUBSCRIBED')setMessage('Защищённый канал комнаты подключён. Список онлайн обновляется автоматически.');
        }
      }).catch(error=>{
        realtimeAttemptedRoom='';
        setMessage('Живое присутствие недоступно; список комнаты обновляется через сервер каждые 5 секунд.',false);
        console.warn('[SkyRealm co-op presence]',error);
      });
    }
    if(!silent&&!room)setMessage('Создай комнату или введи код приглашения.');
    if(room&&room.status==='running')await client.recoverOwner(room.id).catch(()=>{});
  }catch(error){if(!silent)setMessage(error.message||String(error),true);}
}
async function action(fn,successMessage){
  if(busy)return;busy=true;setMessage('Выполняем запрос…');
  try{
    const result=await fn();if(result?.room)room=result.room;
    if(result?.inviteCode){inviteCode=result.inviteCode;room=result.room;}
    render();setMessage(successMessage);busy=false;await refresh(true);
  }catch(error){setMessage(error.message||String(error),true);}
  finally{busy=false;}
}
async function open(){
  shade.hidden=false;shade.setAttribute('aria-hidden','false');$('coop-code').value='';
  setMessage('Подключаемся к сервису комнат…');await refresh();
  clearInterval(pollHandle);clearInterval(heartbeatHandle);
  if(pollHandle)clearInterval(pollHandle);
  if(heartbeatHandle)clearInterval(heartbeatHandle);
  pollHandle=setInterval(()=>refresh(true),5000);
  heartbeatHandle=setInterval(async()=>{if(!room)return;await client.heartbeat(room.id).catch(()=>{});if(room.status==='running')await client.recoverOwner(room.id).catch(()=>{});await refresh(true);},12000);
}
function close(){shade.hidden=true;shade.setAttribute('aria-hidden','true');}
$('menu-coop').addEventListener('click',open);$('coop-close').addEventListener('click',close);
$('coop-create').addEventListener('click',()=>action(()=>client.create(),'Комната создана. Скопируй код и отправь друзьям.'));
$('coop-join').addEventListener('click',()=>{const code=$('coop-code').value.trim().toUpperCase().replace(/[-\s]/g,'');action(()=>client.join(code),'Ты присоединился к комнате.');});
$('coop-refresh').addEventListener('click',()=>refresh());
$('coop-leave').addEventListener('click',()=>action(async()=>{if(!room)return;await client.leave(room.id);await client.disconnectRealtime();realtimeAttemptedRoom='';inviteCode='';room=null;},'Ты покинул комнату. Если ты владелец, комната поставлена на паузу.'));
$('coop-resume').addEventListener('click',()=>action(()=>client.resume(room.id),'Комната возобновлена владельцем.'));
$('coop-pvp').addEventListener('change',event=>action(()=>client.setPvp(room.id,event.target.checked),'Настройка PvP сохранена.'));
$('coop-copy').addEventListener('click',async()=>{if(!inviteCode)return;try{await navigator.clipboard.writeText(inviteCode);setMessage('Код приглашения скопирован.');}catch(_){const code=$('coop-invite-code'),range=document.createRange();range.selectNodeContents(code);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);setMessage('Код выделен — нажми Ctrl+C.');}});
$('coop-code').addEventListener('input',event=>{event.target.value=event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9-]/g,'').slice(0,10);});
shade.addEventListener('click',event=>{if(event.target===shade)close();});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!shade.hidden)close();});
})();