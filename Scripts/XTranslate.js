/*
 * Quantumult X Script: X(Twitter) 网页自动翻译中文
 * 方案: 通过 GraphQL API 响应拦截 + 注入翻译脚本双管齐下
 * 针对: X/Twitter 网页版 SPA 架构
 */

const $ = new Env("X自动翻译");

// 检查是否是 GraphQL API 响应（JSON）
const isJSON = $response.headers?.['Content-Type']?.includes('application/json') || false;

if (isJSON) {
  // === 模式1: 拦截 JSON API 响应 ===
  // 在 JSON 中注入翻译标记，通知前端脚本处理
  try {
    let body = JSON.parse($response.body);

    // 遍历 JSON 查找并标记文本节点
    function walkAndMark(obj) {
      if (!obj || typeof obj !== 'object') return;
      
      if (Array.isArray(obj)) {
        obj.forEach(walkAndMark);
        return;
      }

      // 在顶层添加翻译标记
      if (obj.data) {
        obj._translate_flag = 'en2cn';
        obj._translate_lang = 'en';
      }

      Object.values(obj).forEach(walkAndMark);
    }

    if (body.data) {
      walkAndMark(body);
      $done({ body: JSON.stringify(body) });
      return;
    }
  } catch (e) {
    console.log('[XTranslate] JSON parse error:', e);
  }
  $done({});
  return;
}

// === 模式2: 注入翻译脚本到 HTML shell ===
let body = $response.body || '';

if (!body.includes('<html') && !body.includes('<head') && !body.includes('<body')) {
  $done({});
  return;
}

const translateScript = `
<script>
(function() {
  'use strict';

  // 防止重复注入
  if (window.__xtranslate_injected) return;
  window.__xtranslate_injected = true;

  console.log('[XTranslate] 翻译脚本已注入');

  // ============ 翻译引擎 ============
  var TranslateEngine = {
    // 使用 MyMemory 免费翻译 API（无需 Key）
    cache: {},
    queue: [],
    processing: false,

    translate: function(text, callback) {
      if (!text || text.length < 3 || text.length > 5000) {
        callback(text);
        return;
      }

      // 检测是否已含中文
      if (/[\u4e00-\u9fff]/.test(text)) {
        callback(text);
        return;
      }

      var cacheKey = text;
      if (this.cache[cacheKey]) {
        callback(this.cache[cacheKey]);
        return;
      }

      // 加入队列
      this.queue.push({ text: text, callback: callback });
      this.processQueue();
    },

    processQueue: function() {
      if (this.processing || this.queue.length === 0) return;
      this.processing = true;

      var item = this.queue.shift();
      var encoded = encodeURIComponent(item.text);
      var url = 'https://api.mymemory.translated.net/get?q=' + encoded + '&langpair=en|zh-CN';

      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onload = function() {
        try {
          var data = JSON.parse(xhr.responseText);
          var translated = data.responseData && data.responseData.translatedText;
          if (translated && translated !== item.text) {
            TranslateEngine.cache[item.text] = translated;
            item.callback(translated);
          } else {
            item.callback(item.text);
          }
        } catch(e) {
          item.callback(item.text);
        }
        TranslateEngine.processing = false;
        setTimeout(function() { TranslateEngine.processQueue(); }, 200);
      };
      xhr.onerror = function() {
        item.callback(item.text);
        TranslateEngine.processing = false;
        setTimeout(function() { TranslateEngine.processQueue(); }, 200);
      };
      xhr.send();
    }
  };

  // ============ DOM 翻译器 ============
  var Translator = {
    translating: false,
    translatedNodes: new WeakSet(),

    // 需要跳过的元素
    shouldSkip: function(el) {
      if (!el || !el.tagName) return true;
      var tag = el.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'svg', 'path', 'meta', 'link', 'head'].includes(tag)) return true;
      if (el.closest('script, style, noscript, svg, head')) return true;
      if (el.getAttribute('aria-hidden') === 'true') return true;
      return false;
    },

    // 翻译单个文本节点
    translateTextNode: function(node) {
      if (this.translatedNodes.has(node)) return;

      var text = node.textContent.trim();
      if (!text || text.length < 3) return;

      // 跳过纯数字/符号
      if (!/[a-zA-Z]/.test(text)) return;
      // 跳过已含中文
      if (/[\u4e00-\u9fff]/.test(text)) return;
      // 跳过 @用户名 和 #标签 和 URL
      if (/^[@#]/.test(text)) return;
      if (/^https?:\/\//.test(text)) return;

      var parent = node.parentElement;
      if (!parent || this.shouldSkip(parent)) return;

      TranslateEngine.translate(text, function(translated) {
        if (translated && translated !== text && !node.parentElement.closest('.skiptranslate')) {
          node.textContent = translated;
          parent.setAttribute('data-translated', 'true');
          Translator.translatedNodes.add(node);
        }
      });
    },

    // 处理 DOM 变化
    handleMutations: function(mutations) {
      if (this.translating) return;

      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];

        // 新增的文本节点
        if (mutation.addedNodes) {
          for (var j = 0; j < mutation.addedNodes.length; j++) {
            var node = mutation.addedNodes[j];

            if (node.nodeType === Node.TEXT_NODE) {
              this.translateTextNode(node);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              // 遍历子节点的文本
              var walker = document.createTreeWalker(
                node,
                NodeFilter.SHOW_TEXT,
                null
              );

              var textNode;
              while ((textNode = walker.nextNode())) {
                this.translateTextNode(textNode);
              }
            }
          }
        }

        // 文本内容变化
        if (mutation.type === 'characterData' && mutation.target) {
          this.translateTextNode(mutation.target);
        }
      }
    },

    // 初始化
    init: function() {
      var self = this;

      // 监听 DOM 变化
      var observer = new MutationObserver(function(mutations) {
        self.handleMutations(mutations);
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });

      // 翻译已有内容
      setTimeout(function() {
        var walker = document.createTreeWalker(
          document.body || document.documentElement,
          NodeFilter.SHOW_TEXT,
          null
        );

        var textNode;
        var batch = [];
        while ((textNode = walker.nextNode())) {
          batch.push(textNode);
          if (batch.length >= 20) {
            batch.forEach(function(n) { self.translateTextNode(n); });
            batch = [];
          }
        }
        batch.forEach(function(n) { self.translateTextNode(n); });
      }, 1000);

      // 创建翻译按钮
      this.createButton();
    },

    // 创建悬浮按钮
    createButton: function() {
      var btn = document.createElement('div');
      btn.id = 'x-translate-btn';
      btn.innerHTML = '🌐 翻译';
      btn.style.cssText = 'position:fixed;top:70px;right:10px;z-index:1000000;padding:8px 16px;' +
        'background:rgba(29,155,240,0.9);color:#fff;border-radius:20px;font-size:13px;' +
        'cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
        'box-shadow:0 2px 12px rgba(0,0,0,0.4);transition:all 0.3s;user-select:none;' +
        'border:1px solid rgba(255,255,255,0.1);';

      var isActive = true;

      btn.onclick = function() {
        if (isActive) {
          btn.innerHTML = '🌐 已翻译';
          btn.style.background = 'rgba(52,168,83,0.9)';
          isActive = false;
          location.reload();
        } else {
          btn.innerHTML = '🌐 翻译';
          btn.style.background = 'rgba(29,155,240,0.9)';
          isActive = true;
          location.reload();
        }
      };

      document.body.appendChild(btn);
    }
  };

  // 等待页面加载完成后启动
  if (document.readyState === 'complete') {
    Translator.init();
  } else {
    window.addEventListener('load', function() {
      Translator.init();
    });
  }

  // 也尝试在 DOMContentLoaded 时启动（SPA 通常不需要等 load）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(function() { Translator.init(); }, 500);
    });
  } else {
    setTimeout(function() { Translator.init(); }, 500);
  }
})();
</script>`;

// 注入到 HTML
if (body.includes('</head>')) {
  body = body.replace('</head>', translateScript + '</head>');
} else if (body.includes('<body')) {
  body = body.replace(/<body[^>]*>/, '$&' + translateScript);
} else {
  body = translateScript + body;
}

console.log('[XTranslate] Script injected');
$done({ body: body });

// ============ Env Utility ============
function Env(name) {
  return {
    name: name,
    log: function() { console.log.apply(console, arguments); }
  };
}
