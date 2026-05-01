/*
 * Quantumult X Script: X(Twitter) 自动翻译中文
 * 方案: 拦截 HTML shell → 注入 MutationObserver 翻译脚本 → 浏览器端实时翻译动态加载内容
 * 翻译API: MyMemory (免费, 无需key, 5000词/天)
 */

const $ = new Env("XTranslate");

// 只处理 HTML 响应 (X 的初始页面)
const contentType = $response.headers?.['Content-Type'] || '';
if (!contentType.includes('text/html')) {
  $done({});
  return;
}

let body = $response.body || '';
if (!body || body.length < 100) {
  $done({});
  return;
}

// 注入翻译脚本 - 这个脚本会在浏览器中执行
const injectScript = `
<script type="text/javascript">
(function() {
  if (window.__xtr_done) return;
  window.__xtr_done = true;

  var CFG = {
    api: 'https://api.mymemory.translated.net/get',
    from: 'en',
    to: 'zh-CN',
    cache: {},
    translating: false
  };

  // 判断文本是否值得翻译
  function worthTranslating(text) {
    if (!text || typeof text !== 'string') return false;
    text = text.trim();
    if (text.length < 4 || text.length > 4800) return false;
    if (/[\u4e00-\u9fff]/.test(text)) return false; // 已有中文
    if (!/[a-zA-Z]/.test(text)) return false; // 无英文字母
    return true;
  }

  // 翻译单个文本
  function doTranslate(text, callback) {
    if (!worthTranslating(text)) { callback(text); return; }
    if (CFG.cache[text]) { callback(CFG.cache[text]); return; }

    var xhr = new XMLHttpRequest();
    var url = CFG.api + '?q=' + encodeURIComponent(text) + '&langpair=' + CFG.from + '|' + CFG.to;
    xhr.open('GET', url, true);
    xhr.timeout = 5000;
    xhr.onload = function() {
      try {
        var data = JSON.parse(xhr.responseText);
        var result = data.responseData && data.responseData.translatedText;
        if (result && result !== text && !/NOT_FOUND|ERROR/.test(data.responseStatus)) {
          CFG.cache[text] = result;
          callback(result);
        } else {
          callback(text);
        }
      } catch(e) { callback(text); }
    };
    xhr.onerror = function() { callback(text); };
    xhr.ontimeout = function() { callback(text); };
    xhr.send();
  }

  // 跳过不需要翻译的元素
  function shouldSkip(el) {
    if (!el || !el.tagName) return true;
    var tag = el.tagName.toLowerCase();
    if (['script','style','noscript','svg','path','circle','rect','line','polyline','polygon','ellipse','use','g','defs','clipPath','image','canvas','video','audio'].includes(tag)) return true;
    if (el.closest && el.closest('[data-xtr], script, style, noscript, svg')) return true;
    if (el.getAttribute('aria-hidden') === 'true') return true;
    // 跳过纯图标/符号
    var cls = (el.className || '').toString();
    if (cls.indexOf('xtr') >= 0) return true;
    return false;
  }

  // 翻译节点
  function translateNode(node) {
    if (!node) return;
    if (CFG.translating) return;

    if (node.nodeType === 3) { // 文本节点
      var text = node.textContent;
      if (worthTranslating(text)) {
        CFG.translating = true;
        var originalText = text;
        var parent = node.parentElement;
        doTranslate(text, function(result) {
          if (result !== originalText && node.parentNode) {
            node.textContent = result;
            if (parent) parent.setAttribute('data-xtr', '1');
          }
          CFG.translating = false;
        });
      }
    } else if (node.nodeType === 1) { // 元素节点
      if (shouldSkip(node)) return;
      // 检查直接子文本节点
      for (var i = 0; i < node.childNodes.length; i++) {
        var child = node.childNodes[i];
        if (child.nodeType === 3) {
          translateNode(child);
        }
      }
    }
  }

  // 创建翻译按钮
  function createButton() {
    var btn = document.createElement('div');
    btn.id = 'xtr-btn';
    btn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;padding:6px 14px;background:#1d9bf0;color:#fff;border-radius:9999px;font-size:13px;font-weight:600;cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);user-select:none;';
    btn.textContent = '🌐 翻译中...';
    document.body.appendChild(btn);
  }

  // 初始化 MutationObserver
  function init() {
    if (!document.body) { setTimeout(init, 100); return; }

    createButton();

    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) {
            translateNode(m.addedNodes[j]);
          }
        } else if (m.type === 'characterData') {
          translateNode(m.target);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // 延迟扫描已有内容
    setTimeout(function() {
      var elements = document.querySelectorAll('span, p, a, h1, h2, h3, h4, h5, h6, li, div[role="article"]');
      for (var i = 0; i < elements.length; i++) {
        translateNode(elements[i]);
      }
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
</script>`;

// 注入到 </head> 之前
if (body.includes('</head>')) {
  body = body.replace('</head>', injectScript + '\n</head>');
} else if (body.includes('<head')) {
  body = body.replace(/<head[^>]*>/, '$&\n' + injectScript);
} else {
  body = injectScript + '\n' + body;
}

console.log('[XTranslate] Script injected into HTML');
$done({ body: body });

function Env(name) {
  return { name: name, log: function() { console.log.apply(console, arguments); } };
}
