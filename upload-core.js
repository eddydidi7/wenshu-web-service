import {sha256} from './noble-sha2.js';
export const CHUNK=6*1024*1024;
export async function fileHash(file,progress=()=>{}) {
 const hash=sha256.create();for(let i=0;i<file.size;i+=CHUNK){hash.update(new Uint8Array(await file.slice(i,i+CHUNK).arrayBuffer()));progress(Math.min(file.size,i+CHUNK)/file.size);}
 return Array.from(hash.digest(),b=>b.toString(16).padStart(2,'0')).join('');
}
export function endpointFor(plan,origin){
 const u=new URL(plan.url);
 if(u.pathname==='/storage/v1/upload/resumable')u.pathname+='/sign';
 if(u.origin!==origin||u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/storage/v1/upload/resumable/sign'||plan.bucket!=='public-resources'||plan.chunk_size!==CHUNK||!plan.token)throw Error('INVALID_TRANSFER');
 return u;
}
export function locationFor(raw,endpoint){const u=new URL(raw,endpoint);if(u.origin!==endpoint.origin||u.username||u.password||u.search||u.hash||!u.pathname.startsWith(endpoint.pathname+'/'))throw Error('INVALID_TRANSFER');return u.href;}
export function errorMessage(code,status=0){
 const messages={LOGIN_REQUIRED:'登录已过期，请重新登录后重试。',invalid_credentials:'邮箱或密码不正确。',WEB_UPLOAD_NOT_CONFIGURED:'网页上传尚未完成服务器配置。',RESOURCE_ACCOUNT_BANNED:'账号已被限制。',RESOURCE_UPLOAD_PAUSED:'该账号暂时不能上传。',RESOURCE_TYPE_BLOCKED:'当前账号不允许上传 APK。',UPLOAD_DISABLED:'管理员已暂停上传。',RESOURCE_DISABLED:'公共网盘暂时关闭。',RESOURCE_USER_QUOTA:'个人存储空间不足。',RESOURCE_QUOTA_EXCEEDED:'网盘剩余空间不足。',RESOURCE_DAILY_LIMIT:'已达到当天上传额度。',RESOURCE_MONTHLY_LIMIT:'已达到本月上传额度。',FILE_TOO_LARGE:'文件超过服务器允许的大小。',VERIFY_FAILED:'文件完整性校验失败，请重试。',UPLOAD_BUSY:'服务器正在处理该文件，请稍后重试。',UPSTREAM_UNAVAILABLE:'服务器暂时不可用，请稍后重试。'};
 return messages[code]??({401:'登录已过期，请重新登录。',403:'没有上传权限。',413:'文件超过服务器允许的大小。',415:'服务器不支持此文件类型。',429:'操作过于频繁，请稍后重试。'}[status])??(status>=500?'服务器暂时不可用，请稍后重试。':`暂时无法完成（${code||'网络连接失败'}${status?' · HTTP '+status:''}），原文件和上传进度保留。`);
}
export async function tusUpload(file,plan,origin,task,save,progress,send=fetch){
 if(plan.stored)return;
 const endpoint=endpointFor(plan,origin),headers={'Tus-Resumable':'1.0.0','x-signature':plan.token};
 async function request(method,url,extra={},body){return send(url,{method,headers:{...headers,...extra},body,redirect:'error',signal:AbortSignal.timeout(120000)});}
 async function check(r){if(!r.ok){const text=await r.text();console.warn('Storage upload failed',r.status,text.replace(/eyJ[A-Za-z0-9_.-]+/g,'[token]').slice(0,1000));const e=Error(errorMessage(/maximum|size|large/i.test(text)?'FILE_TOO_LARGE':'STORAGE_ERROR',r.status));e.status=r.status;throw e;}}
 function offset(r){const raw=r.headers.get('Upload-Offset');const n=raw===null?NaN:Number(raw);if(!Number.isSafeInteger(n)||n<0||n>file.size)throw Error('INVALID_OFFSET');return n;}
 let url=task.location?locationFor(task.location,endpoint):null,position=0;
 if(url){const r=await request('HEAD',url);if([404,410].includes(r.status)){url=null;task.location=null;save();}else{await check(r);position=offset(r);}}
 if(!url){const b64=s=>btoa(Array.from(new TextEncoder().encode(s),b=>String.fromCharCode(b)).join(''));
  const metadata=Object.entries({bucketName:plan.bucket,objectName:plan.object_name,contentType:plan.content_type,cacheControl:'0'}).map(([k,v])=>`${k} ${b64(v)}`).join(',');
  const r=await request('POST',endpoint.href,{'Upload-Length':String(file.size),'Upload-Metadata':metadata});if(r.status===409)return;await check(r);
  if(r.status!==201||!r.headers.get('Location'))throw Error('INVALID_TRANSFER');url=locationFor(r.headers.get('Location'),endpoint);task.location=url;save();
 }
 let retries=0;
 while(position<file.size){try{const end=Math.min(position+CHUNK,file.size),r=await request('PATCH',url,{'Upload-Offset':String(position),'Content-Type':'application/offset+octet-stream'},file.slice(position,end));await check(r);if(r.status!==204||offset(r)!==end)throw Error('INVALID_OFFSET');position=end;retries=0;progress(position/file.size);
  }catch(e){if([401,403,413,415].includes(e.status)||++retries>3)throw e;await new Promise(r=>setTimeout(r,1000*retries));const r=await request('HEAD',url);await check(r);position=offset(r);}
 }
}
