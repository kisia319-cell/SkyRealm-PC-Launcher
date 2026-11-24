/* First-run opt-in for the Apocalypse 3D cinematic. WebGL is not a browser permission prompt; this is an in-game choice. */
(()=>{'use strict';
const KEY='skyrealm_apocalypse_3d_consent_v1';
function show(){
if(document.getElementById('apocalypse-3d-consent'))return;
let choice='';try{choice=localStorage.getItem(KEY)||'';}catch(_){}
if(choice)return;
const root=document.createElement('div');root.id='apocalypse-3d-consent';
root.style.cssText='position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:rgba(1,5,8,.88);backdrop-filter:blur(10px);font-family:Segoe UI,Arial,sans-serif;color:#f4f0e5';
root.innerHTML='<section style="width:min(520px,100%);padding:28px;border:1px solid #9b8c61;border-radius:18px;background:linear-gradient(145deg,#202d27,#0b1412);box-shadow:0 25px 90px #000c;text-align:center"><div style="font-size:10px;letter-spacing:3px;color:#d8bd7b;font-weight:900">SKYREALM · APOCALYPSE</div><h2 style="margin:12px 0;font-size:24px">Включить 3D-сцену?</h2><p style="color:#c7d0c5;line-height:1.65;font-size:13px">Перед началом можно включить кинематографическую 3D-сцену с движением камеры, вертолётом, заражёнными и подземной базой. Она использует WebGL и может сильнее нагружать устройство. Выбор сохранится на этом устройстве.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px"><button data-choice="allow" style="padding:13px 10px;border:1px solid #b9a16a;border-radius:10px;background:#8b6b36;color:white;font-weight:900;cursor:pointer">Включить 3D</button><button data-choice="2d" style="padding:13px 10px;border:1px solid #65766a;border-radius:10px;background:#24352d;color:#e2e9df;font-weight:800;cursor:pointer">Продолжить в 2D</button></div><small style="display:block;margin-top:14px;color:#849187">Это настройка игры, а не системное разрешение браузера.</small></section>';
document.body.appendChild(root);
root.querySelectorAll('button[data-choice]').forEach(btn=>btn.addEventListener('click',()=>{try{localStorage.setItem(KEY,btn.dataset.choice);}catch(_){}root.remove();}));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show,{once:true});else show();
window.Apocalypse3DConsent={enabled(){try{return localStorage.getItem(KEY)==='allow';}catch(_){return false;}},reset(){try{localStorage.removeItem(KEY);}catch(_){}}};
})();