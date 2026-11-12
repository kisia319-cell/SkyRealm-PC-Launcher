'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('game/competitive/prime-online.js','utf8');
const userId='11111111-1111-4111-8111-111111111111';
const payload=Buffer.from(JSON.stringify({sub:userId})).toString('base64url');
const jwt='header.'+payload+'.signature',calls=[];
const replies={
 '/api/prime/queue':{status:'waiting'},
 '/api/prime/stats':{stats:{user_id:userId,rating:1000,matches:0,wins:0,losses:0}},
 '/api/prime/leaderboard':{players:[]},
 '/api/prime/finish':{ok:true,status:'completed'},
 '/api/prime/leave':{ok:true,status:'abandoned'}
};
const context={
 window:{pywebview:{api:{get_auth_session:async()=>({token:jwt})}}},
 localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},
 URLSearchParams,Date,JSON,Math,performance:{now:()=>10},
 atob:value=>Buffer.from(value,'base64').toString('binary'),
 setInterval:()=>1,clearInterval:()=>{},
 fetch:async(url,init)=>{const parsed=new URL(url),route=parsed.searchParams.get('route');calls.push({route,method:init.method,authorization:init.headers.Authorization,body:init.body?JSON.parse(init.body):null});return{ok:true,status:200,json:async()=>replies[route]||{ok:true}};}
};
vm.runInNewContext(source,context);
(async()=>{
 assert.equal(await context.window.PrimeOnline.init(),true,'Prime must receive the authenticated SkyRealm token through the native bridge');
 assert.equal(context.window.PrimeOnline.hasSession(),true);
 assert.equal(context.window.PrimeOnline.userId(),userId);
 assert.equal((await context.window.PrimeOnline.queue(1000)).status,'waiting');
 assert.equal((await context.window.PrimeOnline.stats()).stats.rating,1000);
 assert.equal((await context.window.PrimeOnline.leaderboard()).players.length,0);
 await context.window.PrimeOnline.cancelQueue();
 await context.window.PrimeOnline.finish('22222222-2222-4222-8222-222222222222',userId,'completed');
 await context.window.PrimeOnline.leave('22222222-2222-4222-8222-222222222222');
 assert.ok(calls.length>=6);
 assert.ok(calls.every(x=>x.authorization==='Bearer '+jwt),'Every online request must use the verified account bearer');
 assert.ok(calls.some(x=>x.route==='/api/prime/queue'&&x.method==='POST'));
 assert.ok(calls.some(x=>x.route==='/api/prime/leave'&&x.method==='POST'));
 console.log('prime-online-test: all assertions passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
