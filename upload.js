import {fileHash,tusUpload,errorMessage} from './upload-core.js';
const $=id=>document.getElementById(id);let session=null,config=null,busy=false;
const status=s=>{$('status').textContent=s;};
function lock(value){busy=value;for(const id of ['upload','file','logout','reload','description'])$(id).disabled=value;}
async function post(path,body,token){const r=await fetch('/api/upload/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(130000)});let data;try{data=await r.json();}catch{throw Error(errorMessage('UPSTREAM_UNAVAILABLE',r.status));}if(!r.ok||data.error){const code=data.error_code??data.error??'REQUEST_FAILED';throw Error(errorMessage(code,r.status));}return data;}
function sessionValue(value){return {...value,expires_at:value.expires_at??(Date.now()/1000+(value.expires_in??3600))};}
async function resource(action,body={}) {if(!session)throw Error(errorMessage('LOGIN_REQUIRED'));if(Date.now()/1000>session.expires_at-120)session=sessionValue(await post('refresh',{refresh_token:session.refresh_token}));return post('resource',{api_version:1,action,...body},session.access_token);}
function result(url){const u=new URL(url);if(u.origin!==location.origin||!/^\/f\/[a-f0-9]{64}$/.test(u.pathname))throw Error('分享地址配置不正确，请联系管理员。');$('result').hidden=false;$('share').href=u.href;$('share').textContent=u.href;}
async function share(id){const data=await resource('share',{id});result(data.url);}
async function list(){const data=await resource('list',{scope:'mine',sort:'time'});$('files').replaceChildren();for(const file of data.files??[]){if(file.status!=='published')continue;const li=document.createElement('li'),button=document.createElement('button');button.textContent=file.file_name+' · 复制分享链接';button.onclick=async()=>{try{await share(file.id);status('链接已生成，可复制发给朋友。');}catch(e){status(e.message);}};li.append(button);$('files').append(li);}if(!$('files').children.length)$('files').textContent='还没有已发布文件。';}
$('login').onsubmit=async event=>{event.preventDefault();$('loginButton').disabled=true;try{session=sessionValue(await post('login',{email:$('email').value.trim(),password:$('password').value}));$('password').value='';$('account').textContent='已登录：'+session.user.email;$('login').hidden=true;$('panel').hidden=false;status('请选择 APK，上传完成后即可获得下载链接。');await list();}catch(e){status(e.message);}finally{$('loginButton').disabled=false;}};
$('logout').onclick=()=>{session=null;$('panel').hidden=true;$('login').hidden=false;$('result').hidden=true;$('files').replaceChildren();status('已退出网页登录。');};
$('reload').onclick=()=>list().catch(e=>status(e.message));
$('upload').onclick=async()=>{
 const file=$('file').files[0];if(!file||!file.name.toLowerCase().endsWith('.apk')){status('请选择 .apk 格式的 Android 安装包。');return;}if(!file.size){status('文件为空，请重新选择。');return;}
 lock(true);$('result').hidden=true;
 try {
  status('正在计算文件校验值…');const checksum=await fileHash(file,p=>{$('progress').value=p*5;});
  const key='wenshu_web_upload_'+session.user.id+'_'+checksum;let task;
  try{task=JSON.parse(localStorage.getItem(key));}catch{}
  if(!task||task.size!==file.size||task.name!==file.name)task={id:crypto.randomUUID(),name:file.name,size:file.size,checksum,description:$('description').value};
  const save=()=>{localStorage.setItem(key,JSON.stringify(task));};save();
  status('正在检查上传权限与容量…');const plan=await resource('begin',{upload_protocol:'tus',upload_id:task.id,file_name:task.name,mime_type:'application/vnd.android.package-archive',file_size:file.size,checksum,category:'其他',description:task.description});
  let completed=plan.file;
  if(!plan.already_uploaded){
   if(!plan.resumable)throw Error('服务器尚未启用大文件上传，请更新公共网盘服务。');
   status('正在上传，请保持网页打开…');await tusUpload(file,plan.resumable,config.storageOrigin,task,save,p=>{$('progress').value=5+85*p;status(`正在上传：${Math.floor(p*100)}%`);});
   for(let i=0;i<128;i++){status('上传完成，正在由服务器校验完整性…');const r=await resource('complete',{upload_id:task.id,upload_protocol:'tus'});if(!r.verifying){completed=r.file;break;}$('progress').value=90+10*r.verified_bytes/file.size;}
  }
  if(!completed||completed.status!=='published')throw Error('文件尚未完成校验，请点击重试继续。');
  await share(completed.id);$('progress').value=100;status('上传成功！复制下面的链接发给朋友即可。');task.published=true;task.location=null;save();await list();
 }catch(e){status(e instanceof TypeError?'网络连接失败，请点击重试。已选文件仍然保留。':e.message);$('upload').textContent='重试上传 / 继续校验';}finally{lock(false);}
};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('share').href);status('链接已复制，可以粘贴发给朋友。');}catch{status('请长按或选中上面的链接，复制后发送。');}};
window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
try{config=await(await fetch('/api/upload/config')).json();$('loginButton').disabled=!config.ready;status(config.ready?'请先登录文殊账号。':'网页上传尚未完成服务器配置，请联系管理员。');}catch{status('暂时无法连接服务器，请刷新重试。');}
