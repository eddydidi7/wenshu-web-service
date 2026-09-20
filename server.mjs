export function getPostDisplayTitle(p) {
 const title=String(p.title??'').trim(); if(title) return title;
 const body=String(p.body??'').trim().replace(/\s+/gu,' ');
 const chars=Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(body),x=>x.segment);
 return chars.length>28?chars.slice(0,28).join('')+'……':body;
}
import {readFile} from 'node:fs/promises';
import http from 'node:http';
import {uploadRoutes} from './upload-server.mjs';
import {pathToFileURL} from 'node:url';
export const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const safeUrl=u=>{try{const x=new URL(u);return x.protocol==='https:'?x.href:'';}catch{return '';}};
const imageUrl=u=>safeUrl(u)||(typeof u==='string'&&u.length<1800000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u)?u:'');
export function richText(ops,fallback){
 if(!Array.isArray(ops))return `<p>${escape(fallback).replace(/\n/g,'<br>')}</p>`;
 return ops.map(op=>{if(typeof op.insert==='string'){
  let text=escape(op.insert).replace(/\n/g,'<br>');const a=op.attributes??{};
  for(const [k,tag] of [['bold','strong'],['italic','em'],['underline','u'],['strike','s']])if(a[k])text=`<${tag}>${text}</${tag}>`;
  if(safeUrl(a.link))text=`<a rel="nofollow noopener" href="${escape(safeUrl(a.link))}">${text}</a>`;
  return text;
 }const image=imageUrl(op.insert?.image);return image?`<img loading="lazy" alt="文章图片" src="${escape(image)}">`:'';}).join('');
}
export const TEST_ARTICLE_SLUG='0733d253d24c4b5690f61ff9ccbaa85591cd25eae51b47ebacb94e61f99a59b6';
export function publishedTime(value){
 const date=new Date(value);return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date)+'（北京时间）';
}
export function render(data,slug,base,download){
 const p=data.post;const title=getPostDisplayTitle(p);const summary=String(p.body??'').slice(0,180);const cover=(p.image_urls??[]).map(safeUrl).find(Boolean)||(base?`${base}/preview.png`:'');
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · 文殊红书</title>
 <meta name="description" content="${escape(summary)}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(summary)}"><meta property="og:locale" content="zh_CN"><meta property="og:site_name" content="文殊红书"><meta property="og:type" content="article"><meta property="og:url" content="${escape(base)}/p/${slug}">${cover?`<meta property="og:image" content="${escape(cover)}"><meta property="og:image:alt" content="${escape(title)}">`:''}<link rel="canonical" href="${escape(base)}/p/${slug}"><meta property="article:published_time" content="${escape(p.created_at)}"><meta name="author" content="${escape(p.author_name)}">${p.access_level==='link_only'?'<meta name="robots" content="noindex,nofollow">':''}
 <style>body{background:#161513;color:#eee8df;font:18px/1.8 system-ui;margin:0}main{max-width:760px;margin:auto;padding:24px}h1{font-size:30px;line-height:1.4}img{max-width:100%;height:auto;border-radius:12px}a{color:#d9b879}header,footer{color:#aaa}article{overflow-wrap:anywhere;margin:24px 0}nav{display:flex;gap:16px;flex-wrap:wrap}nav a,nav button{font:inherit;background:transparent;color:#d9b879;padding:8px 14px;border:1px solid #706049;border-radius:8px;text-decoration:none}nav button:disabled{opacity:.55;cursor:not-allowed}.avatar{width:36px;height:36px;border-radius:50%;vertical-align:middle} .tags{color:#d9b879}</style></head><body><main><header>文殊红书</header>${title?`<h1>${escape(title)}</h1>`:''}<header>${safeUrl(p.author_avatar)?`<img class="avatar" alt="作者头像" src="${escape(safeUrl(p.author_avatar))}">`:''} ${escape(p.author_name)} · <time datetime="${escape(p.created_at)}">${escape(publishedTime(p.created_at))}</time></header><div class="tags">${(p.tags??[]).map(t=>'#'+escape(t)).join(' ')}</div><article>${richText(p.rich_body,p.body)}${(p.image_urls??[]).map(safeUrl).filter(Boolean).map(u=>`<p><img alt="文章图片" loading="lazy" src="${escape(u)}"></p>`).join('')}</article>
 ${(p.attachments??[]).filter(f=>f.kind!=='image'&&safeUrl(f.url)).map(f=>`<p><a href="${escape(safeUrl(f.url))}" rel="nofollow">${escape(f.name??'附件')}</a></p>`).join('')}
 <footer>点赞 ${Number(p.like_count)||0} · 评论 ${Number(p.reply_count)||0}</footer><nav><a href="huideng://forum/post/${encodeURIComponent(p.id)}?slug=${slug}">打开文殊计数器</a>${safeUrl(download)?`<a href="${escape(safeUrl(download))}">下载 App</a>`:'<button type="button" disabled title="安装包下载地址尚未提供">下载 App（暂未开放）</button>'}</nav><h2>相关内容</h2>${(data.related??[]).filter(x=>/^[a-f0-9]{64}$/.test(x.slug)).map(x=>`<p><a href="/p/${x.slug}">${escape(getPostDisplayTitle(x))}</a></p>`).join('')}</main></body></html>`;
}
export function renderResource(f,slug,base){
 const apk=/\.apk$/i.test(f.file_name);const title=String(f.file_name??'资料');
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)} · 文殊资料</title><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${apk?'Android安装包':'公共资料'}，无需安装文殊计数器即可下载"><meta property="og:site_name" content="文殊资料"><meta property="og:url" content="${escape(base)}/f/${slug}"><style>body{background:#161513;color:#eee8df;font:18px/1.8 system-ui;margin:0}main{max-width:700px;padding:24px;margin:auto;overflow-wrap:anywhere}button{font:inherit;padding:12px 24px;border:0;border-radius:12px;background:#d9b879}small{color:#aaa}</style></head><body><main><p>文殊资料 · ${apk?'Android安装包':'文件分享'}</p><h1>${escape(title)}</h1><p>${(Number(f.file_size)/1048576).toFixed(1)} MB · ${escape(f.author_name)}<br>${escape(publishedTime(f.created_at))}</p><form method="post" action="/f/${slug}/download"><button type="submit">${apk?'下载 APK':'下载文件'}</button></form>${apk?'<p>适用于 Android 手机。下载后打开安装包，由系统确认安装；iPhone 无法安装 APK。</p><p>安装前请确认文件来源可信。微信中无法下载时，请选择“在浏览器中打开”。</p>':''}<small>SHA-256：${escape(f.checksum)}</small></main></body></html>`;
}
export function handler(env=process.env,fetcher=fetch){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Security-Policy',"default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 const path=(req.url??'').split('?')[0];
 if(await uploadRoutes(req,res,env,fetcher))return;
 const reply=(status,text)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});res.end(text);};
 const resourceMatch=/^\/f\/([a-f0-9]{64})(\/download)?$/.exec(path);
 if(resourceMatch){
  const download=!!resourceMatch[2];
  if(download?req.method!=='POST':!['GET','HEAD'].includes(req.method)){res.setHeader('Allow',download?'POST':'GET, HEAD');reply(405,'Method not allowed');return;}
  const upstream=safeUrl(env.SUPABASE_URL).replace(/\/$/,'');
  if(!upstream){reply(503,'资料分享尚未配置');return;}
  try{
   const headers=env.SUPABASE_ANON_KEY?{apikey:env.SUPABASE_ANON_KEY}:{};
   const r=await fetcher(`${upstream}/functions/v1/resource-web?slug=${resourceMatch[1]}${download?'&download=1':''}`,{headers,signal:AbortSignal.timeout(15000)});
   if(!r.ok){reply(r.status===404?404:503,r.status===404?'文件不存在或已下架':'下载暂不可用，可能已暂停或达到今日额度，请稍后再试');return;}
   const data=await r.json();
   if(download){
    const signed=safeUrl(data.url),target=signed?new URL(signed):null;
    if(!target||target.origin!==new URL(upstream).origin||!target.pathname.startsWith('/storage/v1/object/sign/public-resources/')){reply(502,'下载地址暂不可用');return;}
    res.writeHead(303,{Location:signed});res.end();return;
   }
   if(!data.file){reply(502,'文件信息暂不可用');return;}
   const base=safeUrl(env.PUBLIC_BASE_URL||env.RENDER_EXTERNAL_URL).replace(/\/$/,'');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?'':renderResource(data.file,resourceMatch[1],base));return;
  }catch{reply(502,'资料服务暂不可用，请稍后重试');return;}
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');reply(405,'Method not allowed');return;}
 if(path==='/healthz'){res.writeHead(200,{'Content-Type':'application/json'});res.end(req.method==='HEAD'?'':JSON.stringify({status:'ok'}));return;}
 if(path==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?'':'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文殊红书</title><body><h1>文殊红书</h1><p>请通过文殊计数器分享的文章链接阅读内容。</p></body></html>');return;}
 if(path==='/preview.png'){try{const bytes=await readFile(new URL('./preview.png',import.meta.url));res.writeHead(200,{'Content-Type':'image/png'});res.end(req.method==='HEAD'?undefined:bytes);}catch{reply(404,'图片不存在');}return;}
 const isTest=path==='/p/test-article';
 const match=/^\/p\/([a-f0-9]{64})$/.exec(path);
 const slug=isTest?(env.TEST_ARTICLE_SLUG||TEST_ARTICLE_SLUG):match?.[1];
 if(!slug||!/^[a-f0-9]{64}$/.test(slug)){reply(404,'页面不存在');return;}
 const upstream=safeUrl(env.SUPABASE_URL).replace(/\/$/,'');
 if(!upstream){reply(503,'分享服务尚未配置，请稍后再试');return;}
 try{
  const headers={'Content-Type':'application/json'};
  // shared-page validates the slug itself. A public key is optional; never use service_role here.
  if(env.SUPABASE_ANON_KEY)headers.apikey=env.SUPABASE_ANON_KEY;
  const response=await fetcher(`${upstream}/functions/v1/shared-page`,{method:'POST',headers,body:JSON.stringify({slug}),signal:AbortSignal.timeout(15000)});
  if(response.status===404){reply(404,'内容不存在、已过期或当前不可公开查看');return;}
  if(!response.ok){reply(502,'分享服务暂时不可用，请稍后重试');return;}
  const data=await response.json();if(!data.post){reply(502,'分享服务暂时不可用，请稍后重试');return;}
  // A predictable test alias must never expose a link-only or private article.
  if(isTest&&data.post.access_level!=='public'){reply(404,'测试文章当前不可公开查看');return;}
  const base=safeUrl(env.PUBLIC_BASE_URL||env.RENDER_EXTERNAL_URL).replace(/\/$/,'');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end(req.method==='HEAD'?'':render(data,slug,base,env.DOWNLOAD_URL));
 }catch{reply(502,'分享服务暂时不可用，请稍后重试');}
};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const port=Number(process.env.PORT)||8080;
 const server=http.createServer(handler()).listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`Web service listening on port ${port}`));
 const shutdown=()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();};
 process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
