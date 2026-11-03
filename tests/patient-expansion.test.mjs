import test from 'node:test';
import assert from 'node:assert/strict';
import {lookForProfile} from '../shared/characters/profileLook.js';
import {EXPANSION_HEADS,EXPANSION_CLOTHING,EXPANSION_TEMPLATES} from '../shared/characters/patientExpansion.js';

function profile({sex='female',age=25,origin='old-stock-american',classId='comfortable',occupation='teacher',seed=7}={}){
 return {seed,identity:{sex,age,origin:{id:origin}},social:{classId,occupation,household:{}}};
}
test('expansion pairs every new donor with each compatible complete outfit',()=>{
 assert.equal(EXPANSION_HEADS.length,5);assert.equal(EXPANSION_CLOTHING.length,5);assert.equal(EXPANSION_TEMPLATES.length,13);
 assert.equal(new Set(EXPANSION_TEMPLATES.map(t=>t.id)).size,13);
 for(const head of EXPANSION_HEADS){const choices=EXPANSION_TEMPLATES.filter(t=>t.head===head.source);assert.deepEqual(choices.map(t=>t.body),EXPANSION_CLOTHING.filter(c=>c.sex===head.sex).map(c=>c.source));}
});
test('new age and ancestry donors are selected deterministically without mutating patient facts',()=>{
 for(const [input,head]of [[{},'female-young'],[{age:65},'female-older'],[{origin:'african-american'},'female-black'],[{sex:'male',age:20},'male-young'],[{sex:'male',age:38,origin:'chinese-american'},'male-chinese']]){
  const patient=profile(input),before=structuredClone(patient),look=lookForProfile(patient);
  assert.ok(look.model.startsWith(head+'-'));assert.deepEqual(lookForProfile(patient),look);assert.deepEqual(patient,before);
  assert.ok(EXPANSION_TEMPLATES.some(t=>t.id===look.model&&t.sex===patient.identity.sex&&t.outfit===look.look.outfit));
 }
});
test('one donor can wear working and formal clothes across social profiles',()=>{
 const outfits=new Set();
 for(let seed=1;seed<=30;seed++)for(const social of [{classId:'elite',occupation:'teacher'},{classId:'sponsored',occupation:'laundress'}]){
  const result=lookForProfile(profile({origin:'african-american',seed,...social}));
  assert.ok(result.model.startsWith('female-black-'));outfits.add(result.look.outfit);assert.ok(['umber','deep'].includes(result.look.skinTone));
 }
 assert.deepEqual([...outfits].sort(),['shirtwaist-skirt','walking-suit','working-dress']);
 for(const [occupation,classId,outfit]of [['laborer','sponsored','work-jacket'],['physician','elite','frock-coat']])assert.equal(lookForProfile(profile({sex:'male',origin:'chinese-american',age:40,occupation,classId})).look.outfit,outfit);
});
test('new lower faces retain their native proportions within a bounded variation',()=>{
 for(let seed=1;seed<=80;seed++){
  const {look}=lookForProfile(profile({seed}));assert.ok(Math.abs(look.features.lowerFaceSize)<=.15);
  for(const value of Object.values(look.features))assert.ok(Number.isFinite(value)&&Math.abs(value)<=.65);
 }
});
