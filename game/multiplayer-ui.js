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
  $('coop-room-status').textContent=statusText(room.status);$('coop-room-id').textContent='ID: '+room.id+' · Сложность: '+({easy:'Легко',medium:'Средняя',hard:'Сложно',hell:'Жар',impossible:'Невозможно'}[room.world_difficulty]||'Средняя');
  $('coop-resume').hidden=!(isOwner()&&room.status==='paused');
  $('coop-start').hidden=!(isOwner()&&room.status==='lobby');
  $('coop-pvp-row').classList.toggle('coop-hidden',!isOwner());$('coop-pvp').checked=!!room.pvp_enabled;
  const members=Array.isArray(room.members)?room.members:[];
  $('coop-members').innerHTML=members.map(member=>{
    const name=escapeHtml(member.username||('Игрок '+String(member.user_id||'').slice(0,8)));
    return '<div class="coop-player"><span>'+name+'<small> · '+(member.role==='owner'?'Владелец':'Игрок')+'</small></span><small>'+(member.status==='offline'?'Отключён':'В сети')+'</small></div>';
  }).join('')||'<div class="coop-player">Пока в комнате только ты</div>';
  $('coop-invite-row').hidden=!inviteCode;if(inviteCode)$('coop-invite-code').textContent=inviteCode;
  $('coop-friend-tools').hidden=!(isOwner()&&['lobby','running'].includes(room.status));
  if(!isOwner()||!['lobby','running'].includes(room.status)){
    $('coop-friend-invite-list').hidden=true;
    $('coop-friend-invite-toggle').textContent='✉ Пригласить друзей в комнату';
  }
}
async function refresh(silent=false){
  if(busy)return;
  try{
    room=await client.current();render();
    await refreshIncomingInvites();
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
    if(room&&['lobby','running'].includes(room.status))await client.recoverOwner(room.id).catch(()=>{});
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
let inviteInboxBusy=false,friendListBusy=false;
function appendSocialPlayer(container,player,buttonLabel,onClick,subtext=''){
  const row=document.createElement('div');row.className='coop-player coop-social-player';
  const info=document.createElement('span');
  const name=document.createElement('b');name.textContent=player?.display_name||player?.username||'Игрок';
  const detail=document.createElement('small');detail.textContent='@'+(player?.username||'player')+(subtext?' · '+subtext:'');
  info.append(name,detail);row.append(info);
  if(buttonLabel){
    const button=document.createElement('button');button.type='button';button.className='action secondary';button.textContent=buttonLabel;
    button.addEventListener('click',onClick);row.append(button);
  }
  container.append(row);
}
async function refreshIncomingInvites(){
  if(inviteInboxBusy)return;
  const section=$('coop-incoming-invites'),list=$('coop-incoming-invites-list');
  if(!section||!list)return;
  inviteInboxBusy=true;
  try{
    const invites=await client.getRoomInvites();
    list.replaceChildren();
    $('coop-incoming-count').textContent=String(invites.length);
    section.hidden=invites.length===0;
    if(!invites.length)return;
    invites.forEach(invite=>{
      const row=document.createElement('div');row.className='coop-player coop-invite-item';
      const info=document.createElement('span');
      const name=document.createElement('b');name.textContent=invite.inviter?.display_name||invite.inviter?.username||'Игрок';
      const roomText=document.createElement('small');
      const difficulty=({easy:'Легко',medium:'Средняя',hard:'Сложно',hell:'Жар',impossible:'Невозможно'})[invite.room?.world_difficulty]||'Средняя';
      roomText.textContent='Приглашает в кооператив · '+difficulty+' · '+(invite.room?.status==='running'?'игра уже идёт':'лобби');
      info.append(name,roomText);row.append(info);
      const buttons=document.createElement('span');buttons.className='coop-invite-buttons';
      const accept=document.createElement('button');accept.type='button';accept.className='action';accept.textContent='Принять';
      accept.addEventListener('click',()=>action(async()=>{
        await client.respondRoomInvite(invite.id,'accept');
        const joined=await client.current();room=joined;inviteCode='';
        return {room:joined};
      },'Ты присоединился к комнате друга.'));
      const reject=document.createElement('button');reject.type='button';reject.className='action secondary';reject.textContent='Отклонить';
      reject.addEventListener('click',()=>action(async()=>{await client.respondRoomInvite(invite.id,'reject');return {};},'Приглашение отклонено.'));
      buttons.append(accept,reject);row.append(buttons);list.append(row);
    });
  }catch(error){
    section.hidden=true;
    console.warn('[SkyRealm room invitations]',error.message||error);
  }finally{inviteInboxBusy=false;}
}
async function showFriendInviteChoices(){
  const list=$('coop-friend-invite-list'),toggle=$('coop-friend-invite-toggle');
  if(!room||!isOwner()||!['lobby','running'].includes(room.status))return;
  if(!list.hidden){list.hidden=true;toggle.textContent='✉ Пригласить друзей в комнату';return;}
  list.hidden=false;toggle.textContent='Скрыть список друзей';list.textContent='Загружаем список друзей…';
  if(friendListBusy)return;
  friendListBusy=true;
  try{
    const friends=await client.getFriends();
    list.replaceChildren();
    if(!friends.length){const empty=document.createElement('div');empty.className='coop-player';empty.textContent='Сначала добавь игроков в друзья в лаунчере.';list.append(empty);return;}
    friends.forEach(rel=>{
      const player=rel.player;
      if(!player)return;
      const seen=player.last_seen_at?Date.parse(player.last_seen_at):0;
      const online=seen>0&&Date.now()-seen<120000;
      appendSocialPlayer(list,player,'Пригласить',async event=>{
        const button=event.currentTarget;button.disabled=true;button.textContent='Отправляем…';
        try{
          const result=await client.sendRoomInvite(room.id,player.id);
          button.textContent='Отправлено';setMessage(result.message||'Приглашение отправлено.');
        }catch(error){
          button.disabled=false;button.textContent='Пригласить';setMessage(error.message||'Не удалось отправить приглашение.',true);
        }
      },online?'В сети':'Не в сети');
    });
  }catch(error){
    list.replaceChildren();const empty=document.createElement('div');empty.className='coop-player';empty.textContent=error.message||'Не удалось загрузить друзей.';list.append(empty);
  }finally{friendListBusy=false;}
}
$('coop-friend-invite-toggle').addEventListener('click',showFriendInviteChoices);
function startMonitors(){
  if(!pollHandle)pollHandle=setInterval(()=>refresh(true),5000);
  if(!heartbeatHandle)heartbeatHandle=setInterval(async()=>{
    if(!room)return;
    await client.heartbeat(room.id).catch(()=>{});
    if(['lobby','running'].includes(room.status))await client.recoverOwner(room.id).catch(()=>{});
    await refresh(true);
  },12000);
}
async function open(){
  shade.hidden=false;shade.setAttribute('aria-hidden','false');$('coop-code').value='';
  setMessage('Подключаемся к сервису комнат…');
  await refresh();
  startMonitors();
}
function close(){shade.hidden=true;shade.setAttribute('aria-hidden','true');}
$('menu-coop').addEventListener('click',open);$('coop-close').addEventListener('click',close);
$('coop-create').addEventListener('click',()=>action(()=>client.create($('coop-difficulty').value),'Комната создана. Отправь код друзьям; когда они войдут, запускай сессию.'));
$('coop-join').addEventListener('click',()=>{const code=$('coop-code').value.trim().toUpperCase().replace(/[-\s]/g,'');action(()=>client.join(code),'Ты присоединился к комнате.');});
$('coop-refresh').addEventListener('click',()=>refresh());
$('coop-leave').addEventListener('click',()=>action(async()=>{if(!room)return;await client.leave(room.id);await client.disconnectRealtime();realtimeAttemptedRoom='';inviteCode='';room=null;},'Ты покинул комнату. Если ты владелец, комната поставлена на паузу.'));
$('coop-resume').addEventListener('click',()=>action(()=>client.resume(room.id),'Комната возобновлена владельцем.'));
$('coop-start').addEventListener('click',()=>action(async()=>{const started=await client.start(room.id);close();return started;},'Сетевая сессия запущена. Теперь выбери мир той же сложности.'));
$('coop-pvp').addEventListener('change',event=>action(()=>client.setPvp(room.id,event.target.checked),'Настройка PvP сохранена.'));
$('coop-copy').addEventListener('click',async()=>{if(!inviteCode)return;try{await navigator.clipboard.writeText(inviteCode);setMessage('Код приглашения скопирован.');}catch(_){const code=$('coop-invite-code'),range=document.createRange();range.selectNodeContents(code);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);setMessage('Код выделен — нажми Ctrl+C.');}});
$('coop-code').addEventListener('input',event=>{event.target.value=event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9-]/g,'').slice(0,10);});
shade.addEventListener('click',event=>{if(event.target===shade)close();});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!shade.hidden)close();});
startMonitors();
refresh(true);
window.addEventListener('pywebviewready',()=>refresh(true),{once:true});
})();