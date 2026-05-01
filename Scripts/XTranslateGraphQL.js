/*
 * Quantumult X Script: X(Twitter) GraphQL API 翻译
 * 方案: 拦截 GraphQL JSON 响应 → 递归查找 tweet 文本 → 翻译为中文
 * 参考: fmz200 XWebAds 去广告脚本相同原理
 * 翻译API: MyMemory (免费, 无需key)
 */

var $ = new Env("XGraphQLTranslate");
var url = $request.url;

// 只处理 GraphQL API 响应
if (!url.includes('/i/api/graphql')) {
  $done({});
}

try {
  var body = JSON.parse($response.body);
  
  // 递归查找并翻译文本
  translateObject(body, function() {
    $done({ body: JSON.stringify(body) });
  });
} catch(e) {
  console.log('[XGraphQL] Parse error: ' + e.message);
  $done({});
}

// 递归遍历 JSON 对象，找到 tweet 文本字段
function translateObject(obj, callback) {
  if (!obj) { callback(); return; }
  
  var keys = Object.keys(obj);
  var pending = 0;
  
  keys.forEach(function(key) {
    var val = obj[key];
    
    if (typeof val === 'string' && val.length > 10 && val.length < 450) {
      // 检查是否可能是 tweet 文本
      if (isTweetText(val, key)) {
        pending++;
        translateText(val, function(translated) {
          obj[key] = translated;
          pending--;
          if (pending === 0) callback();
        });
      }
    } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      // 跳过大型嵌套对象以提高性能
      if (!isLargeObject(val)) {
        pending++;
        translateObject(val, function() {
          pending--;
          if (pending === 0) callback();
        });
      }
    }
  });
  
  if (pending === 0) callback();
}

// 判断是否是 tweet 文本字段
function isTweetText(text, key) {
  // 包含连续英文字母且不包含中日韩字符
  var hasEnglish = /[a-zA-Z]{3,}/.test(text);
  var hasCJK = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text);
  // 常见 tweet 文本字段名
  var textKeys = ['text', 'full_text', 'content', 'description', 'bio', 'name'];
  
  return hasEnglish && !hasCJK && 
         (textKeys.includes(key) || key.includes('text') || key.includes('content'));
}

// 判断对象是否过大（跳过深度嵌套对象）
function isLargeObject(obj) {
  var keys = Object.keys(obj);
  return keys.length > 50;
}

// 翻译文本
function translateText(text, callback) {
  // 使用 MyMemory 免费翻译 API
  var apiUrl = 'https://api.mymemory.translated.net/get?q=' + 
    encodeURIComponent(text.substring(0, 450)) + '&langpair=en|zh-CN';
  
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', apiUrl, false); // 同步请求
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
            callback(data.responseData.translatedText);
          } else {
            callback(text);
          }
        } catch(e) {
          callback(text);
        }
      } else {
        callback(text);
      }
    };
    xhr.send();
  } catch(e) {
    callback(text);
  }
}

// Env
function Env(name) { this.name = name; }
