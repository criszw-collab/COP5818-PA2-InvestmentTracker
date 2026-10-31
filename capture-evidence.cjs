// Optional real-browser evidence capture. Uses a temporary database, never your own.
// First run: npx playwright install chromium
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const project=__dirname,work=fs.mkdtempSync(path.join(os.tmpdir(),'tracker-evidence-'));
for(const name of ['server.js','security.js','schema.sql','validation.js'])fs.copyFileSync(path.join(project,name),path.join(work,name));
fs.cpSync(path.join(project,'public'),path.join(work,'public'),{recursive:true});
const base='http://localhost:3198',password=crypto.randomBytes(20).toString('hex');
let child,browser;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function start(){
 child=spawn(process.execPath,[path.join(work,'server.js')],{cwd:work,env:{...process.env,NODE_PATH:path.join(project,'node_modules'),SESSION_SECRET:crypto.randomBytes(48).toString('hex'),PORT:'3198',APP_ORIGIN:base},stdio:'ignore'});
 for(let n=0;n<100;n++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await delay(50);}
 throw Error('Evidence server failed to start; check that port 3198 is free.');
}
async function stop(){if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}}
async function api(page,url,method,body){return page.evaluate(async({url,method,body})=>{
 const token=(await(await fetch('/api/csrf')).json()).csrfToken;
 const res=await fetch(url,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:res.status,data:await res.json()};
},{url,method,body});}
async function login(page,email){await page.locator('#email').fill(email);await page.locator('#password').fill(password);await page.locator('#login-button').click();await page.locator('#tracker-panel').waitFor({state:'visible'});}
async function add(page,name,quantity,price,category){
 await page.locator('#investment-name').fill(name);await page.locator('#quantity').fill(String(quantity));await page.locator('#unit-price').fill(price);await page.locator('#category').selectOption(String(category));
 const response=page.waitForResponse(r=>r.url().endsWith('/api/purchases')&&r.request().method()==='POST');await page.locator('#save-button').click();assert.equal((await response).status(),201);
 await page.waitForFunction(()=>!document.querySelector('#save-button').disabled);
}
async function screenshot(page,name){await page.screenshot({path:path.join(project,'evidence',name),fullPage:true});}
(async()=>{
 try{
  await start();browser=await chromium.launch({headless:true});
  const ca=await browser.newContext({viewport:{width:1280,height:1000}}),cb=await browser.newContext({viewport:{width:1280,height:1000}});
  const a=await ca.newPage(),b=await cb.newPage();await a.goto(base);await b.goto(base);
  assert.equal((await api(a,'/api/register','POST',{email:'usera@example.test',password})).status,201);
  assert.equal((await api(b,'/api/register','POST',{email:'userb@example.test',password})).status,201);
  await login(a,'usera@example.test');await add(a,'Example Index Fund',5,'20.00',1);await add(a,'Example Company',3,'15.50',2);
  assert.equal(await a.locator('#total-invested').innerText(),'$146.50');await screenshot(a,'persistence-before-restart.png');
  await stop();await start();await a.reload();await a.locator('#auth-form').waitFor({state:'visible'});await login(a,'usera@example.test');assert.equal(await a.locator('#total-invested').innerText(),'$146.50');await screenshot(a,'persistence-after-restart.png');
  await login(b,'userb@example.test');assert.equal(await b.locator('#purchase-count').innerText(),'0');
  const records=await a.evaluate(async()=>await(await fetch('/api/purchases')).json());
  const put=await api(b,'/api/purchases/'+records[0].id,'PUT',{name:'Unowned change',quantity:1,unitPriceCents:1,categoryId:1});
  const del=await api(b,'/api/purchases/'+records[0].id,'DELETE');assert.equal(put.status,404);assert.equal(del.status,404);
  assert.deepEqual(await a.evaluate(async()=>await(await fetch('/api/purchases')).json()),records);
  await screenshot(a,'ownership-user-a.png');await screenshot(b,'ownership-user-b.png');
  fs.writeFileSync(path.join(project,'evidence','browser-results.json'),JSON.stringify({status:'Pass',persistenceTotal:'$146.50',userACount:2,userBCount:0,unownedPut:put.status,unownedDelete:del.status,ownerRecordsUnchanged:true},null,2)+'\n');
  await a.setViewportSize({width:390,height:844});assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot(a,'mobile-layout.png');
  console.log('Pass: real-browser ownership, persistence, and mobile checks. Screenshots saved in evidence/. Review and update the pending test-report rows before submitting.');
 }finally{if(browser)await browser.close();await stop();fs.rmSync(work,{recursive:true,force:true});}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
