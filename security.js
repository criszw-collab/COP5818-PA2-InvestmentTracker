// Supplied local-development approach. Keep middleware in the order shown in server.js.
const session = require('express-session');
const crypto = require('node:crypto');
function configureSecurity(app) {
  const secret = process.env.SESSION_SECRET || '';
  if (secret.length < 32 || secret.startsWith('REPLACE_')) {
    throw new Error('Configure a new SESSION_SECRET of at least 32 characters in .env');
  }
  const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
  app.use(session({name:'sid',secret,resave:false,saveUninitialized:false,
    cookie:{httpOnly:true,sameSite:'lax',secure:false,path:'/',maxAge:60*60*1000}}));
  app.get('/api/csrf',(req,res)=> {
    if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    res.json({csrfToken:req.session.csrfToken});
  });
  app.use('/api',(req,res,next)=> {
    if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next();
    if (req.get('Origin') && req.get('Origin') !== origin) return res.status(403).json({error:'Origin rejected'});
    if (!req.session.csrfToken || req.get('X-CSRF-Token') !== req.session.csrfToken) {
      return res.status(403).json({error:'CSRF token rejected'});
    }
    next();
  });
}
function requireAuth(req,res,next) {
  if (!req.session.userId) return res.status(401).json({error:'Login required'});
  next();
}
module.exports={configureSecurity,requireAuth};
