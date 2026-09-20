import {readFile} from 'node:fs/promises';
const assets=new Set(['upload.html','upload.js','upload-core.js','noble-sha2.js','noble-_md.js','noble-_u64.js','noble-utils.js','noble-crypto.js','noble-_assert.js']);
export function publicKey(key='') {
 if(key.startsWith('sb_publishable_'))return key;
 try {if(JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='anon')return key;}catch{}
 return '';
}
export async function uploadRoutes(req,res,env,fetcher) {
 const path=(req.url??'').split('?')[0];
 if(path!=='/upload'&&!assets.has(path.slice(1))&&!path.startsWith('/api/upload/'))return false;
 const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
 let origin='';try{const u=new URL(env.SUPABASE_URL);if(u.protocol==='https:')origin=u.origin;}catch{}
 res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self'; connect-src 'self' ${origin}; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
 if(path==='/api/upload/config'&&req.method==='GET') {json(200,{ready:!!origin&&!!publicKey(env.SUPABASE_ANON_KEY),storageOrigin:origin});return true;}
 if(!path.startsWith('/api/')) {
  if(!['GET','HEAD'].includes(req.method)){json(405,{error:'METHOD_NOT_ALLOWED'});return true;}
  try {const file=path==='/upload'?'upload.html':path.slice(1);const bytes=await readFile(new URL(file,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8'});res.end(req.method==='HEAD'?undefined:bytes);}catch{json(404,{error:'NOT_FOUND'});}return true;
 }
 if(req.method!=='POST'){json(405,{error:'METHOD_NOT_ALLOWED'});return true;}
 const expected=new Set([env.PUBLIC_BASE_URL,env.RENDER_EXTERNAL_URL].filter(Boolean).map(x=>{try{return new URL(x).origin;}catch{return '';}}));
 if(req.headers.origin&&!expected.has(req.headers.origin)){json(403,{error:'ORIGIN_NOT_ALLOWED'});return true;}
 const key=publicKey(env.SUPABASE_ANON_KEY);
 if(!key||!origin){json(503,{error:'WEB_UPLOAD_NOT_CONFIGURED'});return true;}
 if(!String(req.headers['content-type']).startsWith('application/json')){json(415,{error:'JSON_REQUIRED'});return true;}
 try {
  let length=0;const chunks=[];
  for await(const chunk of req){length+=chunk.length;if(length>16384){json(413,{error:'METADATA_TOO_LARGE'});return true;}chunks.push(chunk);}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));let target,payload,headers={apikey:key,'Content-Type':'application/json'};
  if(path==='/api/upload/login') {
   if(typeof body.email!=='string'||typeof body.password!=='string'){json(400,{error:'INVALID_LOGIN'});return true;}
   target='/auth/v1/token?grant_type=password';payload={email:body.email.trim(),password:body.password};
  }else if(path==='/api/upload/refresh') {target='/auth/v1/token?grant_type=refresh_token';payload={refresh_token:body.refresh_token};}
  else if(path==='/api/upload/resource') {
   if(!['list','begin','complete','share'].includes(body.action)){json(400,{error:'ACTION_NOT_ALLOWED'});return true;}
   if(!/^Bearer [A-Za-z0-9._-]+$/.test(req.headers.authorization??'')){json(401,{error:'LOGIN_REQUIRED'});return true;}
   headers.Authorization=req.headers.authorization;target='/functions/v1/public-resources';payload={...body,api_version:1};
  }else {json(404,{error:'NOT_FOUND'});return true;}
  const upstream=await fetcher(origin+target,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(120000),redirect:'error'});
  const data=await upstream.json();
  // Never log passwords, sessions or signed upload tokens.
  if(!upstream.ok)console.warn('Web upload upstream error',path,upstream.status,String(data.error_code??data.error??data.code??'').slice(0,160));
  json(upstream.status,data);
 }catch(e){json(e instanceof SyntaxError?400:502,{error:e instanceof SyntaxError?'INVALID_REQUEST':'UPSTREAM_UNAVAILABLE'});}
 return true;
}
