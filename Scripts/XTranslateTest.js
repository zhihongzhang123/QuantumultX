
// X Translate Test - 最简验证
console.log('[XTest] Script executed, URL:', $request.url);
var ct = $response.headers?.['Content-Type'] || '';
console.log('[XTest] Content-Type:', ct);

if (ct.includes('application/json')) {
    console.log('[XTest] Got JSON response, length:', ($response.body||'').length);
    var data = JSON.parse($response.body);
    // 简单测试：在 response 里加个标记
    data._test_translate = 'script_working';
    $done({ body: JSON.stringify(data) });
} else {
    console.log('[XTest] Not JSON, skipping');
    $done({});
}
