/*
 * Quantumult X Script: 网页英文自动翻译中文
 * 功能: 拦截英文网页，注入 Google 翻译组件自动翻译为简体中文
 * 使用: 在圈X中导入 rewrite/AutoTranslateEN2CN.snippet
 */

const EXCLUDED_DOMAINS = [
  'google.com', 'translate.google',
  'baidu.com', 'sogou.com', 'so.com',
  'youdao.com', 'deepl.com',
  'wikipedia.org',
  'github.com', 'api.github.com',
];

function shouldTranslate(url, body) {
  // 排除已翻译/中文站点
  for (const d of EXCLUDED_DOMAINS) {
    if (url.toLowerCase().includes(d)) return false;
  }

  // 已是中文页面（包含大量中文字符）
  const chineseRatio = (body.match(/[\u4e00-\u9fff]/g) || []).length / Math.max(body.length, 1);
  if (chineseRatio > 0.1) return false;

  return true;
}

function injectTranslate(body) {
  const script = `
<script>
(function() {
  // 防止重复注入
  if (window.__auto_translate_injected) return;
  window.__auto_translate_injected = true;

  // 创建翻译按钮（右上角悬浮）
  var btn = document.createElement('div');
  btn.innerHTML = '🌐 翻译';
  btn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:999999;padding:8px 16px;' +
    'background:rgba(0,0,0,0.7);color:#fff;border-radius:20px;font-size:14px;' +
    'cursor:pointer;font-family:system-ui;backdrop-filter:blur(10px);' +
    'box-shadow:0 2px 12px rgba(0,0,0,0.3);transition:all 0.3s;';
  btn.onmouseenter = function() { btn.style.transform = 'scale(1.05)'; };
  btn.onmouseleave = function() { btn.style.transform = 'scale(1)'; };

  // 翻译状态
  var translated = false;

  btn.onclick = function() {
    if (!translated) {
      // 首次点击：加载 Google 翻译并自动翻译
      btn.innerHTML = '⏳ 翻译中...';
      btn.style.background = 'rgba(66,133,244,0.8)';

      var s = document.createElement('script');
      s.src = '//translate.google.com/translate_a/element.js?cb=_gtInit';
      document.head.appendChild(s);

      window._gtInit = function() {
        // 创建隐藏的翻译元素
        var el = document.createElement('div');
        el.id = 'gt_element';
        el.style.display = 'none';
        document.body.appendChild(el);

        new google.translate.TranslateElement({
          pageLanguage: 'auto',
          includedLanguages: 'zh-CN',
          autoDisplay: false
        }, 'gt_element');

        // 触发翻译
        setTimeout(function() {
          var sel = document.querySelector('.goog-te-combo');
          if (sel) {
            sel.value = 'zh-CN';
            sel.dispatchEvent(new Event('change'));
          }
        }, 1500);

        setTimeout(function() {
          btn.innerHTML = '🌐 已翻译';
          btn.style.background = 'rgba(52,168,83,0.8)';
          translated = true;
        }, 3000);
      };
    } else {
      // 再次点击：切换回原文
      btn.innerHTML = '🌐 原文';
      btn.style.background = 'rgba(0,0,0,0.7)';
      var frame = document.querySelector('.skiptranslate iframe');
      if (frame) {
        document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + location.hostname;
        location.reload();
      }
      translated = false;
    }
  };

  document.body.appendChild(btn);

  // 自动触发翻译（设为 true 则页面加载后自动翻译）
  var AUTO_TRANSLATE = true;
  if (AUTO_TRANSLATE) {
    setTimeout(function() { btn.click(); }, 800);
  }
})();
</script>`;

  // 注入到 </head> 之前
  if (body.includes('</head>')) {
    return body.replace('</head>', script + '</head>');
  }
  // 备选：注入到 <body> 之后
  if (body.includes('<body')) {
    return body.replace(/<body[^>]*>/, '$&' + script);
  }
  // 最后手段：追加到末尾
  return body + script;
}

// ============ 主逻辑 ============
const contentType = $response.headers?.['Content-Type'] ||
                    $response.headers?.['content-type'] || '';

if (!contentType.includes('text/html')) {
  $done({});
  return;
}

let body = $response.body || '';

if (!body || body.length < 500) {
  $done({});
  return;
}

if (shouldTranslate($request.url, body)) {
  body = injectTranslate(body);
  console.log('[AutoTranslate] Injected for: ' + $request.url);
}

$done({ body: body });
