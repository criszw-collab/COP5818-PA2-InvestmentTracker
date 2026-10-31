require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const argon2 = require('argon2');
const fs = require('node:fs');
const path = require('node:path');
const {configureSecurity,requireAuth} = require('./security');
const {validatePurchase} = require('./validation');
const app=express();
const db=new Database(path.join(__dirname,'tracker.db'));
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
app.use(express.json({limit:'16kb',strict:false}));
configureSecurity(app);
// Private JSON must never be reused from the browser cache after logout.
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
function credentials(body){
  if(!body || typeof body!=='object' || Array.isArray(body)) return null;
  const {email,password}=body;
  if(typeof email!=='string' || typeof password!=='string') return null;
  const normalized=email.trim().toLowerCase();
  if(normalized.length<3 || normalized.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || password.length<8 || password.length>128) return null;
  return {email:normalized,password};
}
const selectPurchase=`SELECT p.id,p.name,p.quantity,p.unit_price_cents AS unitPriceCents,
 p.category_id AS categoryId,c.name AS categoryName,p.quantity*p.unit_price_cents AS costCents
 FROM purchases p JOIN categories c ON c.id=p.category_id`;
const owned=db.prepare(selectPurchase+' WHERE p.id=? AND p.owner_id=?');
const categoryIds=()=>db.prepare('SELECT id FROM categories').all().map(row=>row.id);
function routeId(req,res){
  const raw=req.params.id;
  if(!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))){res.status(400).json({error:'ID must be a positive integer'});return null;}
  return Number(raw);
}
app.get('/api/health',(req,res)=>res.json({ok:true}));
app.post('/api/register',asyncRoute(async(req,res)=>{
  const value=credentials(req.body);
  if(!value) return res.status(400).json({error:'Use a valid email and a password of 8–128 characters'});
  if(db.prepare('SELECT id FROM users WHERE email=?').get(value.email)) return res.status(409).json({error:'Email is already registered'});
  const hash=await argon2.hash(value.password,{type:argon2.argon2id});
  try{
    const result=db.prepare('INSERT INTO users(email,password_hash) VALUES (?,?)').run(value.email,hash);
    return res.status(201).json({id:Number(result.lastInsertRowid),email:value.email});
  }catch(err){
    if(err.code==='SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({error:'Email is already registered'});
    throw err;
  }
}));
app.post('/api/login',asyncRoute(async(req,res)=>{
  const value=credentials(req.body);
  const user=value && db.prepare('SELECT id,email,password_hash FROM users WHERE email=?').get(value.email);
  if(!user || !await argon2.verify(user.password_hash,value.password)) return res.status(401).json({error:'Invalid email or password'});
  await new Promise((resolve,reject)=>req.session.regenerate(e=>e?reject(e):resolve()));
  req.session.userId=user.id;
  await new Promise((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));
  res.json({id:user.id,email:user.email});
}));
app.get('/api/me',requireAuth,(req,res)=>{
  const user=db.prepare('SELECT id,email FROM users WHERE id=?').get(req.session.userId);
  if(!user) return res.status(401).json({error:'Login required'});
  res.json(user);
});
app.post('/api/logout',requireAuth,(req,res,next)=>{
  req.session.destroy(err=>{
    if(err) return next(err);
    res.clearCookie('sid',{path:'/',httpOnly:true,sameSite:'lax',secure:false});res.json({ok:true});
  });
});
app.get('/api/categories',requireAuth,(req,res)=>res.json(db.prepare('SELECT id,name FROM categories ORDER BY id').all()));
app.get('/api/purchases',requireAuth,(req,res)=>res.json(db.prepare(selectPurchase+' WHERE p.owner_id=? ORDER BY p.id ASC').all(req.session.userId)));
app.post('/api/purchases',requireAuth,(req,res)=>{
  const result=validatePurchase(req.body,categoryIds());
  if(result.error) return res.status(400).json({error:result.error});
  const v=result.value;
  const inserted=db.prepare('INSERT INTO purchases(owner_id,name,quantity,unit_price_cents,category_id) VALUES (?,?,?,?,?)').run(req.session.userId,v.name,v.quantity,v.unitPriceCents,v.categoryId);
  res.status(201).json(owned.get(inserted.lastInsertRowid,req.session.userId));
});
app.put('/api/purchases/:id',requireAuth,(req,res)=>{
  const id=routeId(req,res);if(id===null) return;
  if(!owned.get(id,req.session.userId)) return res.status(404).json({error:'Purchase not found'});
  const result=validatePurchase(req.body,categoryIds());
  if(result.error) return res.status(400).json({error:result.error});
  const v=result.value;
  db.prepare('UPDATE purchases SET name=?,quantity=?,unit_price_cents=?,category_id=? WHERE id=? AND owner_id=?').run(v.name,v.quantity,v.unitPriceCents,v.categoryId,id,req.session.userId);
  res.json(owned.get(id,req.session.userId));
});
app.delete('/api/purchases/:id',requireAuth,(req,res)=>{
  const id=routeId(req,res);if(id===null) return;
  if(!owned.get(id,req.session.userId)) return res.status(404).json({error:'Purchase not found'});
  db.prepare('DELETE FROM purchases WHERE id=? AND owner_id=?').run(id,req.session.userId);
  res.json({ok:true});
});
app.use('/api',(req,res)=>res.status(404).json({error:'API route not found'}));
app.use(express.static(path.join(__dirname,'public')));
app.use((err,req,res,next)=>{
  if(err.type==='entity.parse.failed') return res.status(400).json({error:'Invalid JSON'});
  if(err.type==='entity.too.large') return res.status(413).json({error:'Request too large'});
  console.error('Request failed');res.status(500).json({error:'Internal server error'});
});
const port=Number(process.env.PORT)||3000;
app.listen(port,()=>console.log(`Open http://localhost:${port}`));
