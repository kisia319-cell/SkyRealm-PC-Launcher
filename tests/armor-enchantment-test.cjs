'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('game/game.js','utf8');
function extract(name){
  const start=source.indexOf('function '+name+'(');assert.ok(start>=0,'Missing '+name);
  const open=source.indexOf('{',start);let depth=0,quote='',escaped=false;
  for(let i=open;i<source.length;i++){
    const ch=source[i];
    if(quote){if(escaped){escaped=false;continue;}if(ch==='\\'){escaped=true;continue;}if(ch===quote)quote='';continue;}
    if(ch==="'"||ch==='"'){quote=ch;continue;}
    if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error('Unclosed '+name);
}
const helper=extract('armorRuneBonuses');
const context={equipment:{armor:'Броня стража'},armorEnchantments:{'Броня стража':'Рубин'}};
vm.runInNewContext(helper+';globalThis.resolve=armorRuneBonuses;',context);
assert.deepEqual(JSON.parse(JSON.stringify(context.resolve())),{rune:'Рубин',damage:1.08,defense:0});
context.armorEnchantments['Броня стража']='Сапфир';
assert.deepEqual(JSON.parse(JSON.stringify(context.resolve())),{rune:'Сапфир',damage:1,defense:.08});
context.armorEnchantments['Броня стража']='Обсидиан';
assert.deepEqual(JSON.parse(JSON.stringify(context.resolve())),{rune:'Обсидиан',damage:1.05,defense:.05});
context.equipment.armor='Мантия мага';
assert.deepEqual(JSON.parse(JSON.stringify(context.resolve())),{rune:'',damage:1,defense:0},'Rune bonus must be tied to the matching armor item');
assert.ok(source.includes('let weaponUpgrades={}, armorUpgrade=0, anvilCrafted=false, weaponEnchantments={}, armorEnchantments={};'));
assert.ok(source.includes('armorEnchantments,waterHelmetLevel'),'Armor runes must be included in serialized world saves');
assert.ok(source.includes('d.armorEnchantments&&typeof d.armorEnchantments===\'object\''),'Armor runes must load from world saves');
assert.ok(source.includes("['Кожаная броня','Броня стража','Мантия мага','Нагрудник Бога'].includes(k)"),'Load must validate armor keys to protect old/corrupted saves');
assert.ok(source.includes('armorRuneBonuses().defense'),'Sapphire and Obsidian runes must affect real incoming damage');
assert.ok(source.includes('armorRuneBonuses().damage'),'Ruby and Obsidian runes must affect real weapon damage');
assert.ok(source.includes("id=\"enchant-equipped-armor\""),'Equipment screen must expose armor enchanting');
assert.ok(source.includes("addEventListener('click',enchantArmor)"),'Equipment screen button must trigger the real armor enchanting action');
assert.ok(source.includes("changeItem('Кристалл',-2)"),'Armor enchanting must consume two crystals');
assert.ok(source.includes("changeItem(rune,-1)"),'Armor enchanting must consume the selected rune');
assert.ok(source.includes("if(armorEnchantments[name])"),'An armor piece must not accept duplicate rune enchantments');
assert.ok(source.includes("if(!anvilCrafted&&itemCount('Наковальня')<=0)"),'An anvil is required to enchant armor');
assert.ok(source.includes('weaponEnchantments[name]?1.15'),'Existing weapon rune enchantment must remain intact');
console.log('Armor rune effects, crafting costs, UI wiring, save/load safety and existing weapon enchantments passed.');
