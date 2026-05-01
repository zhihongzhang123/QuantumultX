/*
 * Quantumult X Script: X(Twitter) 自动翻译中文 v3
 * 修复:
 *   1. 用重新赋值 headers 代替 delete（QX JSCore 中 delete 对原生对象无效）
 *   2. 扩大 URL 匹配到所有 x.com 路径
 *   3. 增加调试日志
 * 翻译API: MyMemory (免费, 无需key)
 */

const $ = new Env("XTranslate");

// ====== 只处理 HTML ======
const ct = ($response.headers['Content-Type'] || $response.headers['content-type'] || '').toLowerCase();
if (!ct.includes('text/html')) { $done({}); }

// ====== 关键修复: 用重新赋值清除 CSP ======
// QX 的 JSCore 引擎中 delete 对原生 headers 对象无效
// 必须用赋值为空字符串的方式清除
var h = $response.headers || {};
h['Content-Security-Policy'] = '';
h['content-security-policy'] = '';
h['Content-Security-Policy-Report-Only'] = '';
h['content-security-policy-report-only'] = '';
h['X-WebKit-CSP'] = '';
h['x-webkit-csp'] = '';
$response.headers = h;

// ====== 注入翻译脚本 ======
var injectScript = `
<script>
(function(){
  console.log('[XTrans] Script injected, URL: ' + window.location.href);

  function isEnglish(t){
    if(!t || t.length < 4) return false;
    // 包含连续英文字母且不包含中日韩文字
    return /[a-zA-Z]{3,}/.test(t.trim()) && !/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(t);
  }

  async function translate(text){
    if(!text || text.length < 4) return text;
    try{
      var r = await fetch('https://api.mymemory.translated.net/get?q='+encodeURIComponent(text.substring(0,450))+'&langpair=en|zh-CN');
      var d = await r.json();
      if(d.responseStatus===200 && d.responseData && d.responseData.translatedText){
        var t = d.responseData.translatedText;
        return (t !== text) ? t : text;
      }
    }catch(e){ console.log('[XTrans] API err: '+e.message); }
    return text;
  }

  function scan(){
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function(n){
        var t = n.textContent.trim();
        return (t.length > 10 && isEnglish(t) && !n.parentElement.closest('[data-xtrans]'))
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var nodes = [];
    while(walker.nextNode()) nodes.push(walker.currentNode);

    // 分批翻译，避免触发速率限制
    var batch = nodes.slice(0, 10);
    batch.forEach(function(node){
      var original = node.textContent.trim();
      translate(original).then(function(translated){
        if(translated !== original){
          var span = document.createElement('span');
          span.setAttribute('data-xtrans', original.substring(0,30));
          span.style.cssText = 'cursor:help;border-bottom:1px dashed rgba(255,255,255,.2)';
          span.title = 'EN: ' + original;
          span.textContent = translated;
          node.parentNode.replaceChild(span, node);
        }
      });
    });
    if(nodes.length > 0) console.log('[XTrans] Processed '+batch.length+'/'+nodes.length+' nodes');
  }

  // 首次扫描延迟执行，等 React 渲染完成
  setTimeout(function(){
    console.log('[XTrans] First scan starting...');
    scan();
  }, 3000);

  // 定期扫描新内容（3分钟停止）
  var si = setInterval(scan, 10000);
  setTimeout(function(){ clearInterval(si); }, 180000);

  console.log('[XTrans] Translation ready');
})();
</script>`;

var body = $response.body || '';
if(body.length < 100){ $done({}); }

if(body.includes('</head>')){
  body = body.replace('</head>', injectScript + '</head>');
} else if(body.includes('<head')){
  body = body.replace(/<head[^>]*>/,'$&\n' + injectScript);
} else {
  body = injectScript + '\n' + body;
}

$done({body: body});

// ====== Env ======
function Env(n){this.name=n}
