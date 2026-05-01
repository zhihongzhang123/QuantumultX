/*
 * X (Twitter) 网页版自动翻译中文
 * 注入 Google 翻译，自动翻译推文为中文
 */

const contentType = $response.headers?.['Content-Type'] || '';

// 只处理 HTML 页面
if (!contentType.includes('text/html')) {
  $done({});
  exit;
}

let body = $response.body || '';
if (!body) {
  $done({});
  exit;
}

const translateScript = `
<script>
(function() {
  if (window.__x_translate) return;
  window.__x_translate = true;

  // 悬浮翻译按钮
  var btn = document.createElement('div');
  btn.innerHTML = '🌐 译';
  btn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;padding:10px 16px;' +
    'background:rgba(29,161,242,0.9);color:#fff;border-radius:24px;font-size:15px;' +
    'cursor:pointer;font-family:system-ui;backdrop-filter:blur(8px);' +
    'box-shadow:0 4px 16px rgba(0,0,0,0.3);transition:all 0.3s;user-select:none;';

  var translated = false;

  btn.onclick = function() {
    if (!translated) {
      btn.innerHTML = '⏳...';
      btn.style.background = 'rgba(100,100,100,0.9)';

      var s = document.createElement('script');
      s.src = '//translate.google.com/translate_a/element.js?cb=_gtInit';
      document.head.appendChild(s);

      window._gtInit = function() {
        var el = document.createElement('div');
        el.id = 'gt_el';
        el.style.display = 'none';
        document.body.appendChild(el);

        new google.translate.TranslateElement({
          pageLanguage: 'auto',
          includedLanguages: 'zh-CN',
          autoDisplay: false
        }, 'gt_el');

        setTimeout(function() {
          var sel = document.querySelector('.goog-te-combo');
          if (sel) {
            sel.value = 'zh-CN';
            sel.dispatchEvent(new Event('change'));
          }
        }, 1000);

        setTimeout(function() {
          btn.innerHTML = '🌐 已译';
          btn.style.background = 'rgba(26,175,66,0.9)';
          translated = true;
        }, 2500);
      };
    } else {
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + location.hostname;
      location.reload();
      translated = false;
    }
  };

  // 自动翻译
  setTimeout(function() { btn.click(); }, 600);

  // 添加到页面
  var observer = new MutationObserver(function() {
    if (document.body && !document.body.contains(btn)) {
      document.body.appendChild(btn);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
</script>`;

// 注入到 </head> 前
if (body.includes('</head>')) {
  body = body.replace('</head>', translateScript + '</head>');
} else {
  body = translateScript + '\n' + body;
}

$done({ body: body });
