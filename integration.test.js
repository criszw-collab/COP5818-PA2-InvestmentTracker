// Isolated HTTP + DOM integration checks. No production/user database is touched.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {JSDOM,VirtualConsole,CookieJar}=require('jsdom');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'tracker-pa2-test-'));
for(const name of ['server.js','security.js','schema.sql','validation.js'])fs.copyFileSync(path.join(__dirname,name),path.join(work,name));
fs.cpSync(path.join(__dirname,'public'),path.join(work,'public'),{recursive:true});
const port=Number(process.env.TEST_PORT)||3197,base=`http://localhost:${port}`;
const password=crypto.randomBytes(20).toString('hex');
let child;
const windows=[];
const observations=[];
let assertions=0;
function check(value,message){assert.ok(value,message);assertions++;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let n=0;n<150;n++){if(fn())return;await delay(40);}throw Error('DOM wait timed out');}
async function start(){
 child=spawn(process.execPath,[path.join(work,'server.js')],{cwd:work,env:{...process.env,NODE_PATH:path.join(__dirname,'node_modules'),SESSION_SECRET:crypto.randomBytes(48).toString('hex'),APP_ORIGIN:base,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',d=>errors+=d);
 for(let n=0;n<100;n++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}if(child.exitCode!==null)throw Error('Server exited: '+errors);await delay(50);}
 throw Error('Startup timed out: '+errors);
}
async function stop(){if(child && child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}}
function client(){
 const jar=new CookieJar();
 async function http(url,options={}){
  const target=new URL(url,base).href,headers=new Headers(options.headers);
  const cookie=jar.getCookieStringSync(target);if(cookie)headers.set('Cookie',cookie);
  if(options.method && options.method!=='GET')headers.set('Origin',base);
  const response=await fetch(target,{...options,headers});
  for(const value of response.headers.getSetCookie())jar.setCookieSync(value,target);
  return response;
 }
 return {jar,http};
}
async function api(c,url,method='GET',body,expected=200,tokenMode='valid'){
 const headers={};
 if(method!=='GET'){
  headers['Content-Type']='application/json';
  if(tokenMode!=='missing')headers['X-CSRF-Token']=tokenMode==='wrong'?'wrong':(await(await c.http('/api/csrf')).json()).csrfToken;
 }
 const response=await c.http(url,{method,headers,body:method==='GET'?undefined:typeof body==='string'?body:JSON.stringify(body)});
 const data=await response.json();assert.equal(response.status,expected,`${method} ${url}: ${JSON.stringify(data)}`);assertions++;return data;
}
async function dom(c){
 const instance=await JSDOM.fromURL(base,{cookieJar:c.jar,resources:'usable',runScripts:'dangerously',virtualConsole:new VirtualConsole(),beforeParse(window){window.fetch=c.http;window.Headers=Headers;}});
 windows.push(instance.window);
 await new Promise(r=>instance.window.addEventListener('load',r));
 await until(()=>instance.window.document.querySelector('#message')!==null);
 // initialize() fetch must finish before interacting with the form.
 await delay(150);
 return instance.window;
}
const field=(w,id,value)=>w.document.getElementById(id).value=String(value);
const text=(w,id)=>w.document.getElementById(id).textContent;
const click=(w,id)=>w.document.getElementById(id).click();
async function loginUI(w,email){field(w,'email',email);field(w,'password',password);click(w,'login-button');await until(()=>!w.document.getElementById('tracker-panel').hidden);}
async function addUI(w,name,quantity,price,category){
 field(w,'investment-name',name);field(w,'quantity',quantity);field(w,'unit-price',price);field(w,'category',category);
 click(w,'save-button');await until(()=>!w.document.getElementById('save-button').disabled);check(text(w,'message')==='Purchase saved.',text(w,'message'));
}
function record(checkNumber,result){observations.push({check:checkNumber,status:'Pass',result});}
(async()=>{
 try{
  await start();const a=client(),b=client();
  const userA=await api(a,'/api/register','POST',{email:'  UserA@example.test ',password},201);
  await api(b,'/api/register','POST',{email:'userb@example.test',password},201);
  await api(a,'/api/me','GET',undefined,401);
  await api(a,'/api/register','POST',{email:'usera@example.test',password},409);
  await api(a,'/api/register','POST',{email:'bad@example.test',password:'short'},400);
  for(const email of ['bad','a@@b.test','x y@example.test'])await api(a,'/api/register','POST',{email,password},400);
  const bad=await api(a,'/api/login','POST',{email:'usera@example.test',password:'wrong-password'},401);check(bad.error==='Invalid email or password');
  record('1','Two fictional users registered; duplicate normalized email 409; invalid email/password 400; registration did not log in; incorrect login generic 401.');
  const valid={name:'Example Index Fund',quantity:5,unitPriceCents:2000,categoryId:1};
  await api(a,'/api/purchases','GET',undefined,401);await api(a,'/api/categories','GET',undefined,401);
  await api(a,'/api/purchases','POST',valid,401);await api(a,'/api/purchases','POST',valid,403,'missing');await api(a,'/api/purchases','POST',valid,403,'wrong');
  let wa=await dom(a);await loginUI(wa,'usera@example.test');
  await api(a,'/api/purchases','POST',valid,403,'missing');await api(a,'/api/purchases','POST',valid,403,'wrong');
  check((await api(a,'/api/purchases')).length===0);
  const originResponse=await fetch(base+'/api/register',{method:'POST',headers:{'Origin':'http://wrong.example','Content-Type':'application/json'},body:JSON.stringify({email:'x@example.test',password})});check(originResponse.status===403);
  record('2','Unauthenticated reads and valid-token mutation 401; missing/wrong CSRF 403 before and after login; incorrect Origin 403; no mutation.');
  await addUI(wa,'Example Index Fund',5,'20.00',1);await addUI(wa,'Example Company',3,'15.50',2);
  check(text(wa,'total-invested')==='$146.50');check(text(wa,'purchase-count')==='2');
  record('3','DOM form submission through real HTTP created two purchases and displayed $146.50.');
  wa.close();wa=await dom(a);await until(()=>!wa.document.getElementById('tracker-panel').hidden);check(text(wa,'total-invested')==='$146.50');
  await stop();await start();wa.close();wa=await dom(a);await api(a,'/api/me','GET',undefined,401);await loginUI(wa,'usera@example.test');check(text(wa,'total-invested')==='$146.50');
  record('4','Reload restored live session; server process restart lost session, then login restored both SQLite purchases and $146.50. Screenshot still needs local capture.');
  wa.document.querySelectorAll('#purchase-list li')[1].querySelectorAll('button')[0].click();field(wa,'quantity',4);click(wa,'save-button');await until(()=>text(wa,'total-invested')==='$162.00');
  wa.document.querySelector('#purchase-list li button:last-child').click();await until(()=>text(wa,'total-invested')==='$62.00');check(text(wa,'purchase-count')==='1');
  record('5','DOM edit changed quantity to 4 and total to $162.00; delete left one purchase and $62.00.');
  const remaining=(await api(a,'/api/purchases'))[0];const wb=await dom(b);await loginUI(wb,'userb@example.test');check(text(wb,'purchase-count')==='0');
  await api(b,`/api/purchases/${remaining.id}`,'PUT',valid,404);await api(b,`/api/purchases/${remaining.id}`,'DELETE',undefined,404);
  const injected=await api(b,'/api/purchases','POST',{...valid,name:'B private record',ownerId:userA.id,id:remaining.id,costCents:0},201);
  check(injected.id!==remaining.id && injected.costCents===10000);
  await api(b,`/api/purchases/${injected.id}`,'DELETE');assert.deepEqual(await api(a,'/api/purchases'),[remaining]);
  record('6','B saw zero A records; direct PUT/DELETE of A returned 404; injected ownerId/id/costCents ignored and A record unchanged. Screenshot still needs local capture.');
  const invalid=[{name:''},{quantity:1.5},{quantity:0},{quantity:10001},{quantity:'5'},{quantity:true},{quantity:null},{unitPriceCents:0},{unitPriceCents:1.5},{unitPriceCents:100000001},{unitPriceCents:'100'},{categoryId:99},{categoryId:'1'},{categoryId:true}];
  for(const item of invalid){await api(a,'/api/purchases','POST',{...valid,...item},400);await api(a,`/api/purchases/${remaining.id}`,'PUT',{...valid,...item},400);}
  for(const body of [null,[],true,42])await api(a,'/api/purchases','POST',body,400);
  for(const id of ['0','-1','abc','1.5','9007199254740992']){await api(a,'/api/purchases/'+id,'PUT',valid,400);await api(a,'/api/purchases/'+id,'DELETE',undefined,400);}
  await api(a,'/api/purchases/99999','DELETE',undefined,404);assert.deepEqual(await api(a,'/api/purchases'),[remaining]);
  record('7','Invalid POST/PUT types and bounds, non-object bodies, and invalid IDs returned 400; missing record 404; no stored changes.');
  await addUI(wa,'<b>Example</b>',1,'1.00',3);await addUI(wa,'<b>Example</b>',1,'1.00',3);check(wa.document.querySelectorAll('#purchase-list b').length===0);check((await api(a,'/api/purchases')).length===3);check(wa.document.getElementById('purchase-list').textContent.includes('<b>Example</b>'));
  record('8','DOM rendering preserved literal <b>Example</b> with no b element. Repeated names produced separate records.');
  const before=await api(a,'/api/purchases');wa.document.querySelector('#purchase-list li button').click();field(wa,'quantity',9);click(wa,'cancel-edit');assert.deepEqual(await api(a,'/api/purchases'),before);
  field(wa,'investment-name','Invalid price example');field(wa,'quantity',1);field(wa,'unit-price','1.001');click(wa,'save-button');check(text(wa,'message').includes('two decimal'));assert.deepEqual(await api(a,'/api/purchases'),before);
  field(wa,'investment-name','Offline example');field(wa,'unit-price','10.00');await stop();click(wa,'save-button');await until(()=>text(wa,'message').includes('Cannot connect'));check(wa.document.getElementById('investment-name').value==='Offline example');check(!wa.document.getElementById('save-button').disabled);
  record('9','Stopped-server DOM save showed connection error, retained inputs and restored button. Cancel and invalid precision made no mutation. Inspect history before retrying an uncertain save.');
  await start();await api(a,'/api/login','POST',{email:'usera@example.test',password});await api(a,'/api/purchases','POST','{"name":',400);await api(a,'/api/unknown','GET',undefined,404);
  const db=new(require('better-sqlite3'))(path.join(work,'tracker.db'));check(db.prepare('SELECT password_hash FROM users').all().every(r=>r.password_hash.startsWith('$argon2id$')));db.close();
  wa.close();wa=await dom(a);await until(()=>!wa.document.getElementById('tracker-panel').hidden);click(wa,'logout-button');await until(()=>wa.document.getElementById('tracker-panel').hidden);check(wa.document.querySelectorAll('#purchase-list li').length===0);check(text(wa,'total-invested')==='$0.00');
  record('10','Malformed JSON returned JSON 400; unknown API route returned JSON 404; Argon2id hashes verified; logout cleared private DOM and totals. ZIP exclusions verified separately.');
  const result={runtime:process.version,assertions,method:'Real HTTP/SQLite with jsdom DOM execution; no real-browser screenshots or visual layout verification.',observations};
  fs.mkdirSync(path.join(__dirname,'evidence'),{recursive:true});fs.writeFileSync(path.join(__dirname,'evidence','integration-results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
 }finally{for(const w of windows)w.close();await stop();fs.rmSync(work,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
