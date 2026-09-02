import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const miniRoot = path.join(repoRoot, 'apps', 'wechat-mini-program');
const requiredRootFiles = ['app.js', 'app.json', 'app.wxss', 'project.config.json', 'sitemap.json', 'README.md'];
const failures = [];

function fail(message) { failures.push(message); }
function exists(relative) { return fs.existsSync(path.join(miniRoot, relative)); }
function read(relative) { return fs.readFileSync(path.join(miniRoot, relative), 'utf8'); }

requiredRootFiles.forEach((relative) => { if (!exists(relative)) fail(`缺少文件 ${relative}`); });

let appConfig = null;
if (exists('app.json')) {
  try { appConfig = JSON.parse(read('app.json')); } catch (error) { fail(`app.json JSON 无效：${error.message}`); }
}
['project.config.json', 'sitemap.json'].forEach((relative) => {
  if (!exists(relative)) return;
  try { JSON.parse(read(relative)); } catch (error) { fail(`${relative} JSON 无效：${error.message}`); }
});

const pages = Array.isArray(appConfig?.pages) ? appConfig.pages : [];
if (!pages.length) fail('app.json 没有配置 pages');
pages.forEach((page) => {
  ['js', 'json', 'wxml', 'wxss'].forEach((extension) => {
    const relative = `${page}.${extension}`;
    if (!exists(relative)) fail(`页面 ${page} 缺少 ${extension} 文件`);
  });

  // Catch a common native-page failure early: WXML can parse while a missing
  // event handler only appears at runtime in the developer tools console.
  if (exists(`${page}.wxml`) && exists(`${page}.js`)) {
    const wxml = read(`${page}.wxml`);
    const javascript = read(`${page}.js`);
    const handlers = [...wxml.matchAll(/(?:bind|catch)(?:tap|change|input|confirm|longpress|blur|focus|submit|load|error|cancel|touchstart|touchend)="([A-Za-z_$][A-Za-z0-9_$]*)"/g)]
      .map((match) => match[1]);
    [...new Set(handlers)].forEach((handler) => {
      const escaped = handler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(`\\b${escaped}\\s*\\(`).test(javascript)) fail(`页面 ${page} 未定义 WXML 事件方法 ${handler}`);
    });
  }
});

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

walk(miniRoot).filter((file) => file.endsWith('.js')).forEach((file) => {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message).trim().split(/\r?\n/)[0];
    fail(`JavaScript 语法无效 ${path.relative(repoRoot, file)}${detail ? `：${detail}` : ''}`);
  }
});

walk(miniRoot).filter((file) => /\.(js|json|wxml|wxss)$/.test(file)).forEach((file) => {
  const content = fs.readFileSync(file, 'utf8');
  if (/^<<<<<<< |^=======\s*$|^>>>>>>> /m.test(content)) fail(`发现未解决冲突标记 ${path.relative(repoRoot, file)}`);
});

const assistantWxml = exists('pages/assistant/assistant.wxml') ? read('pages/assistant/assistant.wxml') : '';
if (assistantWxml.includes('id="message-{{item.messageId}}"')) fail('助手消息不能直接把原始 messageId 作为 WXML id');
if (assistantWxml.includes('data-index="{{index}}"') && assistantWxml.includes('wx:for="{{messages}}"')) fail('助手消息操作应使用显式 messageIndex，避免嵌套循环索引覆盖');

if (failures.length) {
  console.error(`微信小程序静态校验失败（${failures.length} 项）`);
  failures.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log(`微信小程序静态校验通过：${pages.length} 个页面，${walk(miniRoot).filter((file) => file.endsWith('.js')).length} 个 JS 文件`);
}
