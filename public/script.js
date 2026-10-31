const byId=id=>document.getElementById(id);
let csrfToken=null,editingId=null,purchases=[];
const form=byId('purchase-form'),message=byId('message'),saveButton=byId('save-button');
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
function feedback(text){message.textContent=text;}
async function request(path,options){
  let response;
  try { response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options}); }
  catch { throw new Error('Cannot connect to the server. Your inputs are retained. If a save may have reached the server, inspect history before retrying.'); }
  let data;
  try { data=await response.json(); } catch { throw new Error('The server returned an unreadable response. Inspect history before retrying a save.'); }
  if(!response.ok){const error=new Error(data.error || 'Request failed');error.status=response.status;throw error;}
  return data;
}
async function refreshCsrf(){csrfToken=(await request('/api/csrf')).csrfToken;}
async function api(path,options={}){
  const method=(options.method || 'GET').toUpperCase();
  const headers=new Headers(options.headers);
  if(['POST','PUT','PATCH','DELETE'].includes(method)){
    if(!csrfToken) await refreshCsrf();
    headers.set('X-CSRF-Token',csrfToken);
  }
  let body=options.body;
  if(body!==undefined && typeof body==='object'){body=JSON.stringify(body);headers.set('Content-Type','application/json');}
  return request(path,{...options,method,headers,body});
}
async function loadPurchases(){purchases=await api('/api/purchases');renderHistory();updateSummary();}
async function showTracker(user){
  const categories=await api('/api/categories');
  byId('category').replaceChildren();
  for(const category of categories){const option=document.createElement('option');option.value=category.id;option.textContent=category.name;byId('category').append(option);}
  await loadPurchases();
  byId('account-status').textContent=`Logged in as ${user.email}`;
  byId('auth-form').hidden=true;byId('logout-button').hidden=false;byId('tracker-panel').hidden=false;
}
function clearPrivateUI(){
  purchases=[];renderHistory();updateSummary();resetEdit();byId('category').replaceChildren();
  byId('tracker-panel').hidden=true;byId('auth-form').hidden=false;byId('logout-button').hidden=true;
  byId('account-status').textContent='Log in or register using fictional details.';
  byId('password').value='';csrfToken=null;
}
function resetEdit(){editingId=null;form.reset();saveButton.textContent='Add purchase';byId('entry-heading').textContent='Add a purchase';byId('cancel-edit').hidden=true;}
function renderHistory(){
  const list=byId('purchase-list');list.replaceChildren();
  for(const p of purchases){
    const li=document.createElement('li'),text=document.createElement('span');
    text.textContent=`${p.name} / Quantity: ${p.quantity} / Unit price: ${money(p.unitPriceCents)} / Cost: ${money(p.costCents)} / ${p.categoryName}`;
    const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';edit.addEventListener('click',()=>beginEdit(p));
    const del=document.createElement('button');del.type='button';del.textContent='Delete';del.addEventListener('click',()=>deletePurchase(p.id,del));
    li.append(text,edit,del);list.append(li);
  }
}
function updateSummary(){byId('total-invested').textContent=money(purchases.reduce((sum,p)=>sum+p.costCents,0));byId('purchase-count').textContent=purchases.length;}
function beginEdit(p){
  editingId=p.id;byId('investment-name').value=p.name;byId('quantity').value=p.quantity;byId('unit-price').value=(p.unitPriceCents/100).toFixed(2);byId('category').value=p.categoryId;
  saveButton.textContent='Save changes';byId('entry-heading').textContent='Edit purchase';byId('cancel-edit').hidden=false;byId('investment-name').focus();feedback('Editing purchase. Cancel makes no changes.');
}
async function deletePurchase(id,button){
  button.disabled=true;
  let committed=false;
  try {await api(`/api/purchases/${id}`,{method:'DELETE'});committed=true;await loadPurchases();if(editingId===id) resetEdit();feedback('Purchase deleted.');}
  catch(error){feedback(committed?'Deleted, but history could not refresh. Reload when connected.':error.message);}
  finally {button.disabled=false;}
}
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const name=byId('investment-name').value.trim(),quantity=Number(byId('quantity').value),rawPrice=byId('unit-price').value,dollars=Number(rawPrice),categoryId=Number(byId('category').value);
  if(!name || name.length>100) return feedback('Name must contain 1–100 characters.');
  if(!Number.isInteger(quantity) || quantity<1 || quantity>10000) return feedback('Quantity must be a whole number from 1 to 10,000.');
  // Check both decimal precision and cent step before converting to integer cents.
  if(!/^\d+(\.\d{1,2})?$/.test(rawPrice) || !Number.isFinite(dollars) || dollars<.01 || dollars>1000000 || Math.abs(dollars*100-Math.round(dollars*100))>1e-6) return feedback('Price must be $0.01–$1,000,000 with at most two decimal places.');
  if(!Number.isInteger(categoryId) || !Array.from(byId('category').options).some(o=>Number(o.value)===categoryId)) return feedback('Choose a category.');
  const body={name,quantity,unitPriceCents:Math.round(dollars*100),categoryId};
  saveButton.disabled=true;byId('cancel-edit').disabled=true;
  let committed=false;
  try {
    await api(editingId===null?'/api/purchases':`/api/purchases/${editingId}`,{method:editingId===null?'POST':'PUT',body});committed=true;
    await loadPurchases();resetEdit();feedback('Purchase saved.');
  }catch(error){feedback(committed?'Purchase saved, but history could not refresh. Inputs retained; inspect history before retrying.':error.message);}
  finally {saveButton.disabled=false;byId('cancel-edit').disabled=false;}
});
byId('cancel-edit').addEventListener('click',()=>{resetEdit();feedback('Edit cancelled.');});
async function authenticate(register){
  const login=byId('login-button'),signup=byId('register-button');login.disabled=true;signup.disabled=true;
  try{
    const user=await api(register?'/api/register':'/api/login',{method:'POST',body:{email:byId('email').value,password:byId('password').value}});
    byId('password').value='';
    if(register) feedback('Registration complete. Please log in.');
    else {csrfToken=null;await refreshCsrf();await showTracker(user);feedback('Logged in.');}
  }catch(error){feedback(error.message);}
  finally {login.disabled=false;signup.disabled=false;}
}
byId('auth-form').addEventListener('submit',event=>{event.preventDefault();authenticate(false);});
byId('register-button').addEventListener('click',()=>authenticate(true));
byId('logout-button').addEventListener('click',async()=>{
  const button=byId('logout-button');button.disabled=true;
  try {await api('/api/logout',{method:'POST'});clearPrivateUI();feedback('Logged out.');}
  catch(error){feedback(error.message);}finally{button.disabled=false;}
});
async function initialize(){
  try {await showTracker(await api('/api/me'));}
  catch(error){clearPrivateUI();if(error.status!==401) feedback(error.message);}
}
initialize();
