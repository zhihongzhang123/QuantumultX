/*
 * Quantumult X Script: X(Twitter) 网页自动翻译中文
 * 原理: 拦截 X 的 HTML shell → 注入 MutationObserver 翻译脚本 → 实时翻译动态加载的推文
 * 翻译API: MyMemory (免费, 无需key, 5000词/天)
 */

const $ = new Env("XTranslate");

// 只处理 HTML 响应
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

// 注入翻译脚本
const translateScript = `
<script type="text/javascript">
(function() {
  if (window.__xt_injected) return;
  window.__xt_injected = true;

  // ====== 配置 ======
  var CONFIG = {
    autoTranslate: true,       // 是否自动翻译
    targetLang: 'zh-CN',      // 目标语言
    sourceLang: 'en',          // 源语言
    api: 'https://api.mymemory.translated.net/get', // 免费翻译API
    cacheSize: 500,            // 缓存大小
    batchSize: 5,              // 批处理大小
    debounceMs: 800,           // 防抖延迟(ms)
  };

  // ====== 翻译引擎 ======
  var Translator = {
    cache: new Map(),
    queue: [],
    processing: false,
    timer: null,

    // 快速语言检测
    isEnglish: function(text) {
      if (!text || text.length < 3) return false;
      if (/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(text)) return false;
      var ascii = text.replace(/[^a-zA-Z]/g, '').length;
      return ascii / text.length > 0.6;
    },

    // 跳过这些元素
    shouldSkip: function(el) {
      if (!el || !el.tagName) return true;
      var tag = el.tagName.toLowerCase();
      if (['script','style','noscript','svg','path','circle','rect','line','polygon','ellipse','use','g','defs','clippath','image'].includes(tag)) return true;
      if (el.getAttribute('data-translated')) return true;
      if (el.closest && el.closest('[data-translated="true"], script, style, noscript, svg, .xt-translated')) return true;
      var cls = el.className || '';
      if (typeof cls === 'string' && cls.includes('xt-')) return true;
      return false;
    },

    // 翻译单个文本
    translate: function(text) {
      return new Promise(function(resolve) {
        if (!text || text.trim().length < 2) { resolve(text); return; }
        text = text.trim();
        if (!Translator.isEnglish(text)) { resolve(text); return; }
        if (Translator.cache.has(text)) { resolve(Translator.cache.get(text)); return; }

        var xhr = new XMLHttpRequest();
        var url = CONFIG.api + '?q=' + encodeURIComponent(text.substring(0, 4500)) + '&langpair=' + CONFIG.sourceLang + '|' + CONFIG.targetLang;
        xhr.open('GET', url, true);
        xhr.timeout = 5000;
        xhr.onload = function() {
          try {
            var res = JSON.parse(xhr.responseText);
            var translated = res.responseData && res.responseData.translatedText;
            if (translated && translated !== text && !/NOT_FOUND|ERROR/.test(res.responseStatus)) {
              Translator.cache.set(text, translated);
              if (Translator.cache.size > CONFIG.cacheSize) {
                var first = Translator.cache.keys().next().value;
                Translator.cache.delete(first);
              }
              resolve(translated);
            } else {
              resolve(text);
            }
          } catch(e) { resolve(text); }
        };
        xhr.onerror = function() { resolve(text); };
        xhr.ontimeout = function() { resolve(text); };
        xhr.send();
      });
    },

    // 批量处理队列
    flush: async function() {
      if (this.queue.length === 0) return;
      var batch = this.queue.splice(0, CONFIG.batchSize);
      for (var i = 0; i < batch.length; i++) {
        var item = batch[i];
        try {
          var translated = await this.translate(item.text);
          if (translated && translated !== item.text && item.node && item.node.parentNode) {
            item.node.textContent = translated;
            if (item.node.parentElement) {
              item.node.parentElement.setAttribute('data-translated', 'true');
            }
          }
        } catch(e) {}
        // 请求间隔，避免被限流
        if (i < batch.length - 1) {
          await new Promise(function(r) { setTimeout(r, 300); });
        }
      }
      if (this.queue.length > 0) {
        this.processQueue();
      } else {
        this.processing = false;
      }
    },

    processQueue: function() {
      if (!this.processing) {
        this.processing = true;
        this.flush();
      }
    },

    queueText: function(node, text) {
      this.queue.push({ node: node, text: text });
      if (!this.processing) {
        this.processing = true;
        this.flush();
      }
    },

    // 翻译一个节点及其子节点中的所有文本
    translateNode: function(node) {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        var text = node.textContent;
        if (text && this.isEnglish(text)) {
          this.queueText(node, text);
        }
        return;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        if (this.shouldSkip(node)) return;

        // 直接子文本节点
        for (var i = 0; i < node.childNodes.length; i++) {
          var child = node.childNodes[i];
          if (child.nodeType === Node.TEXT_NODE && child.textContent.trim().length > 0) {
            this.translateNode(child);
          }
        }
      }
    },

    // ====== UI 按钮 ======
    createUI: function() {
      var btn = document.createElement('div');
      btn.id = 'xt-btn';
      btn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;padding:6px 14px;background:#1d9bf0;color:#fff;border-radius:9999px;font-size:13px;font-weight:600;cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);user-select:none;display:flex;align-items:center;gap:4px;';
      btn.innerHTML = CONFIG.autoTranslate ? '🌐 翻译中...' : '🌐 翻译';

      var self = this;
      var active = CONFIG.autoTranslate;

      btn.onclick = function() {
        active = !active;
        btn.innerHTML = active ? '🌐 翻译中...' : '🌐 翻译';
        btn.style.background = active ? '#1d9bf0' : 'rgba(80,80,80,0.8)';
        if (active) {
          self.scanPage();
        }
      };

      document.body.appendChild(btn);
    },

    // ====== 扫描整页 ======
    scanPage: function() {
      var self = this;
      // 分批扫描，避免阻塞主线程
      var elements = document.querySelectorAll('span, p, div, a, h1, h2, h3, h4, h5, h6, label, li, td, th');
      var idx = 0;
      var chunk = 50;

      function processChunk() {
        var end = Math.min(idx + chunk, elements.length);
        for (var i = idx; i < end; i++) {
          var el = elements[i];
          if (self.shouldSkip(el)) continue;
          // 只处理直接包含文本的元素
          if (el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE) {
            self.translateNode(el.childNodes[0]);
          }
        }
        idx = end;
        if (idx < elements.length) {
          requestAnimationFrame(processChunk);
        }
      }
      requestAnimationFrame(processChunk);
    },

    // ====== 初始化 ======
    init: function() {
      var self = this;

      // 等待 body 出现
      function waitForBody() {
        if (document.body) {
          self.createUI();
          if (CONFIG.autoTranslate) {
            setTimeout(function() { self.scanPage(); }, 1500);
          }
          self.setupObserver();
        } else {
          setTimeout(waitForBody, 100);
        }
      }
      waitForBody();
    },

    // ====== MutationObserver - 实时监听新内容 ======
    setupObserver: function() {
      var self = this;
      var observer = new MutationObserver(function(mutations) {
        for (var m = 0; m < mutations.length; m++) {
          var mutation = mutations[m];
          if (mutation.type === 'childList') {
            for (var i = 0; i < mutation.addedNodes.length; i++) {
              var node = mutation.addedNodes[i];
              if (node.nodeType === Node.TEXT_NODE) {
                self.translateNode(node);
              } else if (node.nodeType === Node.ELEMENT_NODE) {
                // 快速扫描新增节点的直接文本
                for (var j = 0; j < node.childNodes.length; j++) {
                  if (node.childNodes[j].nodeType === Node.TEXT_NODE) {
                    self.translateNode(node.childNodes[j]);
                  }
                }
              }
            }
          }
        }
      });

      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    },
  };

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { Translator.init(); });
  } else {
    Translator.init();
  }
})();
</script>`;

// 注入脚本到 </head> 之前
if (body.includes('</head>')) {
  body = body.replace('</head>', translateScript + '\n</head>');
} else if (body.includes('<head')) {
  body = body.replace(/<head[^>]*>/, '$&\n' + translateScript);
} else {
  body = translateScript + '\n' + body;
}

$done({ body: body });

// ============ QuantumultX Env ============
function Env(n) { return { name: n, log: function() { console.log.apply(console, arguments); } }; }
