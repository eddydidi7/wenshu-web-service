import {test} from 'node:test';import assert from 'node:assert/strict';import {render,richText,safeUrl} from './server.mjs';
test('untrusted content is escaped and dangerous URLs discarded',()=>{const h=render({post:{id:'x',title:'<script>alert(1)</script>',body:'<img onerror=x>',access_level:'link_only',tags:['<x>'],image_urls:['javascript:evil']},related:[]},'a'.repeat(64),'https://example.test','javascript:evil');assert(!h.includes('<script>'));assert(!h.includes('javascript:'));assert(h.includes('noindex,nofollow'));assert(h.includes('og:title'));assert(h.includes('&lt;script&gt;'));});
test('Quill content uses an allowlist',()=>{assert.equal(safeUrl('file:///secret'),'');const s=richText([{insert:'safe',attributes:{bold:true,link:'javascript:evil'}},{insert:{image:'https://example.test/a.png'}}],'');assert(s.includes('<strong>safe</strong>'));assert(!s.includes('javascript:'));});

import http from 'node:http';
import {publicKey} from './upload-server.mjs';
import {fileHash,endpointFor,locationFor,tusUpload,CHUNK} from './upload-core.js';
import {createHash} from 'node:crypto';
import {handler} from './server.mjs';
const slug='a'.repeat(64);
async function serve(t,env,fetcher){
 const server=http.createServer(handler(env,fetcher));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 return `http://127.0.0.1:${server.address().port}`;
}
test('homepage, health and preview are available without querying private content',async t=>{
 const base=await serve(t,{},()=>{throw Error('unexpected upstream');});
 assert.equal((await fetch(base+'/')).status,200);
 assert.deepEqual(await (await fetch(base+'/healthz')).json(),{status:'ok'});
 const image=await fetch(base+'/preview.png');assert.equal(image.headers.get('content-type'),'image/png');
 assert.deepEqual([...new Uint8Array(await image.arrayBuffer()).slice(0,4)],[137,80,78,71]);
 assert.equal((await fetch(base+'/healthz',{method:'HEAD'})).status,200);
 assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
 assert.equal((await fetch(base+'/p/bad')).status,404);
});
test('article calls only shared-page, using slug and automatic Render URL',async t=>{
 let calls=0;
 const base=await serve(t,{SUPABASE_URL:'https://project.supabase.co',RENDER_EXTERNAL_URL:'https://wenshu-test.onrender.com'},async(url,options)=>{
  calls++;assert.equal(url,'https://project.supabase.co/functions/v1/shared-page');
  assert.deepEqual(JSON.parse(options.body),{slug});assert.equal(options.method,'POST');
  assert(!('apikey' in options.headers));
  return Response.json({post:{id:'post',title:'共修文章',body:'正文',access_level:'link_only'},related:[]});
 });
 const r=await fetch(base+'/p/'+slug+'?source=chat');assert.equal(r.status,200);
 const html=await r.text();assert(html.includes('共修文章'));assert(html.includes('noindex,nofollow'));
 assert(html.includes(`https://wenshu-test.onrender.com/p/${slug}`));assert(html.includes('https://wenshu-test.onrender.com/preview.png'));
 assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(calls,1);
 const head=await fetch(base+'/p/'+slug,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
});
test('missing configuration fails clearly without making a request',async t=>{
 const base=await serve(t,{},()=>{throw Error('unexpected');});
 assert.equal((await fetch(base+'/p/'+slug)).status,503);
});
test('revoked or private upstream 404 is never rendered as an article',async t=>{
 const base=await serve(t,{SUPABASE_URL:'https://project.supabase.co'},async()=>Response.json({error:'post_unavailable'},{status:404}));
 const r=await fetch(base+'/p/'+slug);assert.equal(r.status,404);assert(!(await r.text()).includes('<article>'));
});
test('upstream outages are distinguished from nonexistent articles',async t=>{
 const base=await serve(t,{SUPABASE_URL:'https://project.supabase.co'},async()=>{throw Error('private diagnostic');});
 const r=await fetch(base+'/p/'+slug);assert.equal(r.status,502);assert(!(await r.text()).includes('private diagnostic'));
});

test('test alias renders real public content and canonical metadata',async t=>{
 const base=await serve(t,{SUPABASE_URL:'https://project.supabase.co',TEST_ARTICLE_SLUG:slug,RENDER_EXTERNAL_URL:'https://wenshu.onrender.com',DOWNLOAD_URL:'https://downloads.example/app.apk'},async()=>Response.json({post:{id:'real-post',title:'测试公开文章',body:'真实正文',author_name:'学友',created_at:'2026-09-19T00:00:00Z',access_level:'public',image_urls:['https://images.example/a.jpg']}}));
 const r=await fetch(base+'/p/test-article');const h=await r.text();assert.equal(r.status,200);
 for(const value of ['测试公开文章','真实正文','学友','2026/09/19 08:00','https://images.example/a.jpg','og:image','og:description','og:locale','article:published_time','打开文殊计数器','下载 App','https://downloads.example/app.apk',`https://wenshu.onrender.com/p/${slug}`])assert(h.includes(value),value);
});
test('predictable test alias refuses link-only and private content',async t=>{
 for(const access_level of ['link_only','private']){
  const base=await serve(t,{SUPABASE_URL:'https://project.supabase.co',TEST_ARTICLE_SLUG:slug},async()=>Response.json({post:{access_level,body:'hidden'}}));
  const r=await fetch(base+'/p/test-article');assert.equal(r.status,404);assert(!(await r.text()).includes('hidden'));
 }
});
test('missing download address shows disabled button, not a fabricated link',()=>{
 const h=render({post:{id:'p',title:'测试',body:'正文'}},slug,'https://example.test','');assert(h.includes('disabled'));assert(h.includes('下载 App（暂未开放）'));
});

 test('untitled article preview uses original text; image-only has no heading',()=>{
 const html=render({post:{id:'x',title:'',body:' 原文第一段\n 第二段',image_urls:[]}},'a'.repeat(64),'https://example.test','');
 assert(html.includes('<h1>原文第一段 第二段</h1>'));assert(html.includes('property="og:title" content="原文第一段 第二段"'));
 const picture=render({post:{id:'x',title:'',body:'',image_urls:['https://example.test/a.png']}},'a'.repeat(64),'https://example.test','');assert(!picture.includes('<h1>'));assert(!picture.includes('图片分享'));
 const literal=render({post:{id:'x',title:'文字分享',body:'原文'}},'a'.repeat(64),'https://example.test','');assert(literal.includes('<h1>文字分享</h1>'));
 });

test('public file page shows APK metadata without signing a download',async t=>{
 const base=await serve(t,{SUPABASE_URL:'https://project.supabase.co'},async url=>{assert(!url.includes('download=1'));return Response.json({file:{file_name:'计数器.apk',file_size:314572800,author_name:'学友',created_at:'2026-09-20T00:00:00Z',checksum:'a'.repeat(64)}});});
 const r=await fetch(`${base}/f/${slug}`);const h=await r.text();assert.equal(r.status,200);for(const text of ['300.0 MB','Android安装包','下载 APK','method="post"','SHA-256','og:title'])assert(h.includes(text));
 const probe=await fetch(`${base}/f/${slug}/download`);assert.equal(probe.status,405);
});
test('download POST redirects only to the configured private bucket signed URL',async t=>{
 const signed='https://project.supabase.co/storage/v1/object/sign/public-resources/file.apk?token=test';
 const base=await serve(t,{SUPABASE_URL:'https://project.supabase.co'},async url=>{assert(url.includes('download=1'));return Response.json({url:signed});});
 const r=await fetch(`${base}/f/${slug}/download`,{method:'POST',redirect:'manual'});assert.equal(r.status,303);assert.equal(r.headers.get('location'),signed);
});
test('withdrawn files and unsafe redirects never produce downloads',async t=>{
 const base=await serve(t,{SUPABASE_URL:'https://project.supabase.co'},async url=>url.includes('download=1')?Response.json({url:'https://evil.example/file.apk'}):new Response('',{status:404}));
 assert.equal((await fetch(`${base}/f/${slug}`)).status,404);
 assert.equal((await fetch(`${base}/f/${slug}/download`,{method:'POST',redirect:'manual'})).status,502);
});

test('upload rejects privileged keys, authenticates proxies, limits metadata and rejects foreign origins',async t=>{
 assert.equal(publicKey('sb_secret_bad'),'');assert.equal(publicKey('x.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.x'),'');
 let calls=0;const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_test',PUBLIC_BASE_URL:'https://site.test'};
 const base=await serve(t,env,async(url,options)=>{calls++;assert.equal(url,'https://project.supabase.co/functions/v1/public-resources');assert.equal(options.headers.Authorization,'Bearer user.jwt');assert.equal(options.headers.apikey,'sb_publishable_test');return Response.json({api_version:1,files:[]});});
 const request=(body,extra={})=>fetch(base+'/api/upload/resource',{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
 assert.equal((await request({action:'list'})).status,401);
 assert.equal((await request({action:'delete'})).status,400);
 assert.equal((await request({action:'list'},{Origin:'https://evil.test'})).status,403);
 assert.equal((await request({action:'list',extra:'x'.repeat(20000)})).status,413);
 assert.equal((await request({action:'list'},{Authorization:'Bearer user.jwt'})).status,200);assert.equal(calls,1);
 const page=await fetch(base+'/upload');assert.equal(page.status,200);assert((await page.text()).includes('文殊账号邮箱'));assert(page.headers.get('Content-Security-Policy').includes("script-src 'self'"));
 for(const file of ['upload.js','upload-core.js','noble-sha2.js','noble-_md.js','noble-_u64.js','noble-utils.js','noble-crypto.js'])assert.equal((await fetch(base+'/'+file)).status,200);
 const cfg=await(await fetch(base+'/api/upload/config')).json();assert.deepEqual(cfg,{ready:true,storageOrigin:'https://project.supabase.co'});assert(!JSON.stringify(cfg).includes('publishable'));
});
test('incremental hash matches native SHA256 across chunk boundaries',async()=>{
 const bytes=Buffer.alloc(CHUNK+100,37),file=new Blob([bytes]);assert.equal(await fileHash(file),createHash('sha256').update(bytes).digest('hex'));
});
test('signed TUS endpoint and location reject credential exfiltration',()=>{
 const plan={url:'https://project.supabase.co/storage/v1/upload/resumable',bucket:'public-resources',chunk_size:CHUNK,token:'token'};
 const endpoint=endpointFor(plan,'https://project.supabase.co');assert(endpoint.pathname.endsWith('/sign'));
 assert.throws(()=>endpointFor({...plan,url:'https://evil.test/storage/v1/upload/resumable'},'https://project.supabase.co'));
 assert.throws(()=>locationFor('https://evil.test/path',endpoint));assert.throws(()=>locationFor(endpoint+'/id?token=bad',endpoint));
});
test('TUS resumes by HEAD and never resends acknowledged bytes',async()=>{
 const plan={url:'https://project.supabase.co/storage/v1/upload/resumable',bucket:'public-resources',chunk_size:CHUNK,token:'signed',object_name:'resources/u/file.apk',content_type:'application/vnd.android.package-archive'};
 const task={location:'https://project.supabase.co/storage/v1/upload/resumable/sign/id'},calls=[];let sent=0;
 await tusUpload(new Blob([Buffer.alloc(CHUNK+20)]),plan,'https://project.supabase.co',task,()=>{},p=>sent=p,async(url,options)=>{calls.push(options.method);assert.equal(options.headers['x-signature'],'signed');if(options.method==='HEAD')return new Response(null,{status:200,headers:{'Upload-Offset':String(CHUNK)}});assert.equal(options.headers['Upload-Offset'],String(CHUNK));assert.equal(options.body.size,20);return new Response(null,{status:204,headers:{'Upload-Offset':String(CHUNK+20)}});});
 assert.deepEqual(calls,['HEAD','PATCH']);assert.equal(sent,1);
});
test('TUS creation keeps APK MIME, filename metadata and saved location',async()=>{
 const plan={url:'https://project.supabase.co/storage/v1/upload/resumable',bucket:'public-resources',chunk_size:CHUNK,token:'signed',object_name:'resources/u/文殊.apk',content_type:'application/vnd.android.package-archive'};let saved=false;const task={};
 await tusUpload(new Blob(['abc']),plan,'https://project.supabase.co',task,()=>{saved=true;},()=>{},async(url,options)=>{
 if(options.method==='POST'){const meta=Object.fromEntries(options.headers['Upload-Metadata'].split(',').map(v=>{const[k,b]=v.split(' ');return[k,Buffer.from(b,'base64').toString('utf8')];}));assert.equal(meta.objectName,plan.object_name);assert.equal(meta.contentType,plan.content_type);return new Response(null,{status:201,headers:{Location:url+'/id'}});}
 return new Response(null,{status:204,headers:{'Upload-Offset':'3'}});
 });assert(saved);assert(task.location.endsWith('/sign/id'));
});

test('direct Storage host is allowed only for the configured project, including CSP',async t=>{
 const plan={url:'https://project.storage.supabase.co/storage/v1/upload/resumable',bucket:'public-resources',chunk_size:CHUNK,token:'signed'};
 assert.equal(endpointFor(plan,'https://project.supabase.co').origin,'https://project.storage.supabase.co');
 assert.throws(()=>endpointFor({...plan,url:'https://other.storage.supabase.co/storage/v1/upload/resumable'},'https://project.supabase.co'));
 const base=await serve(t,{SUPABASE_URL:'https://project.supabase.co'},()=>{throw Error('unexpected');});
 const page=await fetch(base+'/upload');assert(page.headers.get('Content-Security-Policy').includes('https://project.storage.supabase.co'));
});
