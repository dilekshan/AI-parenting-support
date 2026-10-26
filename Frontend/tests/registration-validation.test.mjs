import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePersonalDetails as validate, validateAccountSecurity} from '../src/services/registrationValidation.js';
const base = {name:' Parent ',email:' name@example.com ',phone:''};
for (const [field,value] of [['name',''],['name','   '],['email','nameexample.com'],['email','name@'],['email','a..b@example.com'],['email','a b@example.com'],['email','a@-bad.com'],['phone','letters'],['phone','07123'],['phone','0812345678'],['phone','+947123456789']]) {
 test(`blocks Step 1: ${field}=${value}`,()=>{ const result=validate({...base,[field]:value}); assert.equal(result.valid,false);assert.ok(result.errors[field]); });
}
for(const phone of ['', '0712345678','+94712345678','94712345678']) {
 test(`allows Step 2 and normalizes ${phone}`,()=>{const result=validate({...base,phone}); assert.equal(result.valid,true);assert.equal(result.normalized.phone,phone?'+94712345678':null);assert.equal(result.normalized.email,'name@example.com');});
}
test('accepts providers and clears corrected errors',()=>{for(const email of ['parent@yahoo.com','parent@outlook.com','name+tag@company.lk'])assert.equal(validate({...base,email}).valid,true);assert.deepEqual(validate(base).errors,{});});

// Exercise the actual component's submit handler without installing a browser runner.
import {readFileSync} from 'node:fs';
test('actual Next handler stays on Step 1 for invalid data and advances for valid data', async()=>{
 const source=readFileSync(new URL('../src/pages/auth/Register.jsx',import.meta.url),'utf8');
 const body=source.split('  async function submit(event) {')[1].split('  function field(')[0].trim().replace(/}$/, '');
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 for(const input of [{...base,email:'bad'}, {...base,phone:'letters'},...['0731234567','0791234567','+94731234567','+94791234567','94731234567','94791234567'].map(phone=>({...base,phone})),base]){
  let nextStep=0; let errors={};
  const handler=new AsyncFunction('event','loading','created','values','step','validatePersonalDetails','setErrors','setStep','setValues','const submitting = { current: false };' + body);
  await handler({preventDefault(){},currentTarget:{elements:{namedItem(){return {focus(){}};}}}},false,false,input,0,validate,v=>{errors=v;},v=>{nextStep=v;},()=>{});
  assert.equal(nextStep,validate(input).valid?1:0);
  assert.deepEqual(errors,validate(input).errors);
 }
});

for (const prefix of ['070','071','072','074','075','076','077','078','073','079']) {
 const local=prefix+'1234567';
 for (const phone of [local,'+94'+local.slice(1),'94'+local.slice(1)]) {
  test(`mobile prefix and length: ${phone}`,()=>{
   const result=validate({...base,phone});
   const allowed=!['073','079'].includes(prefix);
   assert.equal(result.valid,allowed);
   if(allowed) assert.equal(result.normalized.phone,'+94'+local.slice(1));
   else assert.equal(result.errors.phone,'Please enter a valid Sri Lankan mobile number.');
   for(const bad of [phone.slice(0,-1),phone+'0']) assert.equal(validate({...base,phone:bad}).valid,false);
  });
 }
}

test('password rules and actual Step 2 Next handler', async()=>{
 const source=readFileSync(new URL('../src/pages/auth/Register.jsx',import.meta.url),'utf8');
 const body=source.split('  async function submit(event) {')[1].split('  function field(')[0].trim().replace(/}$/, '');
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 for(const password of ['', 'Ab1!xyz','abcdef1!','ABCDEF1!','Abcdefg!','Abcdef12','Abcdef1 ','Abcdef1!','Strong#Pass9']) {
  for(const confirm of [password, password+'different']) {
   const values={...base,password,confirm,terms:true};
   const errors=validateAccountSecurity(values);
   const valid=['Abcdef1!','Strong#Pass9'].includes(password) && confirm===password;
   assert.equal(Object.keys(errors).length===0,valid);
   let nextStep=1;
   const handler=new AsyncFunction('event','loading','created','values','step','validatePersonalDetails','validateAccountSecurity','setErrors','setStep','setValues','const submitting = { current: false };' + body);
   await handler({preventDefault(){},currentTarget:{elements:{namedItem(){return {focus(){}};}}}},false,false,values,1,validate,validateAccountSecurity,()=>{},v=>{nextStep=v;},()=>{});
   assert.equal(nextStep,valid?2:1);
  }
 }
});
