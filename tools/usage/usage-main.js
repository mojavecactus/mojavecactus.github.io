// SM ToolBox — Usage hub web-app entry points. Pasted VERBATIM as Code.gs in the standalone syksmtoolbox Apps Script
// project "TBX Usage Hub", next to UsageCore.gs (= usage-core.js) and Usage.gs (= usage-hub.js).
// First run: open Usage.gs, run usageSetup() (authorize once), then Deploy → New deployment → Web app →
// Execute as: Me · Who has access: Anyone → copy the /exec URL into the app payload (TOOLBOX.usage.url).
function doGet(e) { return usageHandle((e && e.parameter) || {}); }
function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { body = (e && e.parameter) || {}; }
  return usageHandle(body);
}
