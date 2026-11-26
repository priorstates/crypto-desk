// Every label in five languages: English, 简体中文, 繁體中文, Español, Português.
import { A } from './words-a.js';
import { B } from './words-b.js';
import { C } from './words-c.js';
import { D } from './words-d.js';

const T = { ...A, ...B, ...C, ...D };
const tag = (navigator.language || 'en').toLowerCase();
const col = tag.startsWith('zh') ? (/tw|hk|mo|hant/.test(tag) ? 2 : 1)
  : tag.startsWith('es') ? 3 : tag.startsWith('pt') ? 4 : 0;

export function t(key, vars = {}) {
  const row = T[key];
  let s = row ? (row[col] || row[0]) : key;
  for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}

export function applyLabels() {
  document.documentElement.lang = ['en', 'zh-Hans', 'zh-Hant', 'es', 'pt'][col];
  document.title = t('title');
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
}
