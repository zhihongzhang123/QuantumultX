/*
 * Quantumult X Script: X(Twitter) 自动翻译中文 v2
 * 关键修复:
 *   1. 删除 CSP headers（否则 inline script 被浏览器拒绝）
 *   2. 延迟初始化等待 React 渲染完成
 *   3. 针对 X 的 DOM 结构优化选择器
 * 翻译API: MyMemory (免费, 无需key)
 */

const $ = new Env("XTranslate");

// 只处理 HTML 响应
const ct = ($response.headers['Content-Type'] || $response.headers['content-type'] || '');
if (!ct.includes('text/html')) { $done({}); }

let body = $response.body || '';
if (body.length < 100) { $done({}); }

// ====== 关键修复 1: 删除 CSP headers ======
// X 的 CSP 严格限制 inline script，必须删除才能让注入脚本执行
delete $response.headers['Content-Security-Policy'];
delete $response.headers['content-security-policy'];
delete $response.headers['Content-Security-Policy-Report-Only'];
delete $response.headers['content-security-policy-report-only'];

// ====== 注入翻译脚本 ======
const injectScript = `<script>
(function(){
if(window._xtr)return;window._xtr=1;
var C={api:'https://api.mymemory.translated.net/get',from:'en',to:'zh-CN',cache:{},busy:false};

function ok(t){
if(!t||typeof t!=='string')return false;
t=t.trim();
if(t.length<3||t.length>4500)return false;
if(/[\u4e00-\u9fff]/.test(t))return false;
if(!/[a-zA-Z\u00C0-\u024F]/.test(t))return false;
if(/^[\d\s\.\,\:\;\(\)\[\]\{\}\-\_\=\+\*\&\^\%\$\#\@\!\~\`\<\>\/\?\\\|]+$/.test(t))return false;
return true;
}

function skip(el){
if(!el||!el.tagName)return true;
var tag=el.tagName.toLowerCase();
if(['script','style','noscript','svg','path','circle','rect','line','polyline','polygon','ellipse','use','g','defs','clipPath','image','canvas','video','audio','iframe','object','embed'].indexOf(tag)!==-1)return true;
if(el.getAttribute&&el.getAttribute('aria-hidden')==='true')return true;
if(el.getAttribute&&el.getAttribute('role')==='img')return true;
var c=(el.className||'').toString();
if(typeof c==='string'&&c.indexOf('xtr')>=0)return true;
if(el.closest&&el.closest('[data-xtr],script,style,noscript,svg'))return true;
return false;
}

function go(el){
if(!el)return;
if(el.nodeType===3){
var t=el.textContent;
if(!ok(t))return;
if(C.cache[t]){el.textContent=C.cache[t];return;}
if(C.busy)return;
C.busy=true;
var x=new XMLHttpRequest();
x.open('GET',C.api+'?q='+encodeURIComponent(t)+'&langpair='+C.from+'|'+C.to,true);
x.timeout=4000;
x.onload=function(){
try{
var d=JSON.parse(x.responseText);
var r=d&&d.responseData&&d.responseData.translatedText;
if(r&&r!==t&&!/NOT_FOUND|ERROR|MYMEMORY/.test(d.responseStatus)){
C.cache[t]=r;el.textContent=r;
if(el.parentElement)el.parentElement.setAttribute('data-xtr','1');
}
}catch(e){}
C.busy=false;
};
x.onerror=x.ontimeout=function(){C.busy=false;};
x.send();
}else if(el.nodeType===1){
if(skip(el))return;
var ch=el.childNodes;
for(var i=0;i<ch.length;i++){
if(ch[i].nodeType===3){
var tt=ch[i].textContent;
if(ok(tt)&&!C.cache[tt]&&!C.busy){go(ch[i]);return;}
}else if(ch[i].nodeType===1){
go(ch[i]);
}
}
}
}

function scan(){
var els=document.querySelectorAll('span,p,div[role="article"] span,a[href] span,h1,h2,h3,h4,h5,h6');
for(var i=0;i<Math.min(els.length,30);i++){
if(!els[i].getAttribute('data-xtr'))go(els[i]);
}
}

function btn(){
if(document.getElementById('xtr-btn'))return;
var b=document.createElement('div');
b.id='xtr-btn';
b.style.cssText='position:fixed;top:12px;right:12px;z-index:99999;padding:5px 12px;background:#1d9bf0;color:#fff;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;font-family:-apple-system,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.4);';
b.textContent='🌐 翻译中';
document.body.appendChild(b);
setTimeout(function(){b.style.opacity='0.6';},3000);
}

function init(){
if(!document.body){setTimeout(init,200);return;}
btn();
// 首次扫描
setTimeout(scan,1500);
setTimeout(scan,3500);
// MutationObserver 监听动态内容
var obs=new MutationObserver(function(ms){
var n=0;
for(var i=0;i<ms.length&&n<15;i++){
var m=ms[i];
if(m.type==='childList'){
for(var j=0;j<m.addedNodes.length&&n<15;j++){
go(m.addedNodes[j]);n++;
}
}
}
});
obs.observe(document.body,{childList:true,subtree:true});
// 定期扫描
setInterval(scan,8000);
}

if(document.readyState==='loading'){
document.addEventListener('DOMContentLoaded',init);
}else{init();}
})();
</script>`;

// 注入到 </head> 前
if(body.indexOf('</head>')!==-1){
body=body.replace('</head>',injectScript+'</head>');
}else if(body.indexOf('<head')!==-1){
body=body.replace(/<head[^>]*>/,'$&\n'+injectScript);
}else{
body=injectScript+body;
}

$done({body:body});

function Env(n){return{name:n,log:function(){console.log.apply(console,arguments);}};}
