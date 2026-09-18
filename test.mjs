import {test} from 'node:test';import assert from 'node:assert/strict';import {render,richText,safeUrl} from './server.mjs';
test('untrusted content is escaped and dangerous URLs discarded',()=>{const h=render({post:{id:'x',title:'<script>alert(1)</script>',body:'<img onerror=x>',access_level:'link_only',tags:['<x>'],image_urls:['javascript:evil']},related:[]},'a'.repeat(64),'https://example.test','javascript:evil');assert(!h.includes('<script>'));assert(!h.includes('javascript:'));assert(h.includes('noindex,nofollow'));assert(h.includes('og:title'));assert(h.includes('&lt;script&gt;'));});
test('Quill content uses an allowlist',()=>{assert.equal(safeUrl('file:///secret'),'');const s=richText([{insert:'safe',attributes:{bold:true,link:'javascript:evil'}},{insert:{image:'https://example.test/a.png'}}],'');assert(s.includes('<strong>safe</strong>'));assert(!s.includes('javascript:'));});

import http from 'node:http';
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
