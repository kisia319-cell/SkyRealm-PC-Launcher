'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const game=fs.readFileSync('game/game.js','utf8');
const html=fs.readFileSync('game/index.html','utf8');
function extract(name){
 const start=game.indexOf('function '+name+'(');assert.ok(start>=0,'Missing '+name);
 const open=game.indexOf('{',start);let depth=0,quote='',escaped=false;
 for(let i=open;i<game.length;i++){const ch=game[i];if(quote){if(escaped){escaped=false;continue;}if(ch==='\\'){escaped=true;continue;}if(ch===quote)quote='';continue;}if(ch==="'"||ch==='"'||ch.charCodeAt(0)===96){quote=ch;continue;}if(ch==='{')depth++;if(ch==='}'&&--depth===0)return game.slice(start,i+1);}
 throw new Error('Unclosed '+name);
}
for(const prefix of ['admin','mod']){
 for(const action of ['best-set','best-sword','max-upgrade'])assert.ok(html.includes('id="'+prefix+'-'+action+'"'),'Missing '+prefix+' '+action+' button');
}
for(const prefix of ['admin','mod']){
 for(const action of ['best-set','best-sword','max-upgrade'])assert.ok(game.includes("document.getElementById('"+prefix+"-"+action+"').addEventListener"),'Missing '+prefix+' '+action+' handler');
}
for(const item of ['Шлем Бога','Нагрудник Бога','Поножи Бога','Сапоги Бога','Амулет Бога','Клинок бездны'])assert.ok(game.includes("name: '"+item+"'")||game.includes("'"+item+"'"),'Missing '+item);
assert.ok(game.includes("id:'leggings',title:'Поножи'"));
assert.ok(game.includes("leggings:['','Поножи Бога']"));
assert.ok(game.includes('d.equipment.leggings'));
assert.ok(game.includes("equipment={weapon:'Деревянный меч',armor:'',helmet:'',leggings:'',boots:'',amulet:''}"));
const set=extract('armorSetBonuses');
const context={equipment:{weapon:'Клинок бездны',armor:'Нагрудник Бога',helmet:'Шлем Бога',leggings:'Поножи Бога',boots:'Сапоги Бога',amulet:'Амулет Бога'}};
vm.runInNewContext(set+';globalThis.resolve=armorSetBonuses;',context);
const bonuses=JSON.parse(JSON.stringify(context.resolve()));
assert.deepEqual(bonuses,{name:'Бога',god:true,guardian:false,mage:false,damage:1.25,defense:.18});
const bestSet=extract('grantBestSet'),bestSword=extract('grantBestWeapon'),maxGear=extract('maxUpgradeGear');
assert.ok(bestSet.includes('changeItem(name,1)')&&bestSet.includes('equipment={...equipment,...gear}')&&bestSet.includes('saveGame()'));
assert.ok(bestSword.includes('weaponUpgrades[name]=5')&&bestSword.includes("weaponEnchantments[name]='Сила Бездны'")&&bestSword.includes('equipment.weapon=name'));
assert.ok(maxGear.includes('weaponUpgrades[weapon]=5')&&maxGear.includes('armorUpgrade=5')&&maxGear.includes('saveGame()'));
console.log('Admin/mod best-set, abyss sword, max-upgrade, real leggings slot, save migration and god-set bonus tests passed.');