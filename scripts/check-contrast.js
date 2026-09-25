#!/usr/bin/env node
/* 캡션 글자(.cap — 협의회비 설명 #mNote, 옵션 다이얼로그 부제 #optN)가 카드 배경 위에서
 * WCAG AA(일반 텍스트 4.5:1)를 지키는지 배포 전에 검사한다.
 *
 * 2026-09-09에 대표님이 "협의회비 자동 계산 설명이 어디 있냐"고 물으셨던 자리다 —
 * `.cap`이 --dim(밝은 테마 2.75:1)을 쓰고 있어 흰 카드 위에서 거의 안 보였다.
 * 2026-09-10에 --mut으로 올려 정정했다. 다음에 누가 다시 --dim으로 낮추거나 팔레트
 * 색을 바꾸면 여기서 잡는다.
 *
 * 실행: node scripts/check-contrast.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function hexToRgb(hex) {
  const n = hex.replace('#', '');
  const v = n.length === 3 ? n.split('').map(c => c + c).join('') : n;
  return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16));
}
function relLuminance([r, g, b]) {
  const f = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const [R, G, B] = [r, g, b].map(f);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function contrast(hexA, hexB) {
  const [lA, lB] = [relLuminance(hexToRgb(hexA)), relLuminance(hexToRgb(hexB))].sort((a, b) => b - a);
  return (lA + 0.05) / (lB + 0.05);
}

function grabToken(block, name) {
  const m = block.match(new RegExp('--' + name + ':(#[0-9a-fA-F]{3,6})'));
  if (!m) throw new Error('토큰 --' + name + ' 을 찾지 못했습니다: ' + block.slice(0, 60));
  return m[1];
}

const capMatch = html.match(/\.cap\{color:var\((--[a-z0-9]+)\)/);
if (!capMatch) {
  console.error('index.html 에서 .cap 의 색 규칙을 찾지 못했습니다 — 캡션 스타일이 바뀌었습니다.');
  process.exit(1);
}
const capToken = capMatch[1].slice(2); // "--mut" → "mut"

// :root 블록이 head 안에도 하나(color-scheme 만 있음) 더 있어, --card 를 실제로
// 담은 팔레트 블록만 골라 뗀다. :root[data-theme="dark"] 블록도 같은 방식으로 뗀다.
const rootBlocks = [...html.matchAll(/:root\{([^}]*)\}/g)].map(m => m[1]);
const lightBlockBody = rootBlocks.find(b => /--card:/.test(b));
const darkMatch = html.match(/:root\[data-theme="dark"\]\{([^}]*)\}/);
if (!lightBlockBody || !darkMatch) {
  console.error(':root 팔레트 블록(라이트/다크)을 찾지 못했습니다 — 팔레트 구조가 바뀌었습니다.');
  process.exit(1);
}

const themes = [
  ['라이트', lightBlockBody],
  ['다크', darkMatch[1]],
];

const problems = [];
console.log('캡션(.cap, 토큰 --' + capToken + ') 대비 검사 — 카드 배경(--card) 기준, WCAG AA 4.5:1');
let checked = 0;
for (const [name, block] of themes) {
  const card = grabToken(block, 'card');
  const capColor = grabToken(block, capToken);
  const ratio = contrast(capColor, card);
  console.log(`  ${name.padEnd(4)} --card ${card} vs --${capToken} ${capColor} → ${ratio.toFixed(2)}:1`);
  checked++;
  if (ratio < 4.5) problems.push(`${name} 테마에서 대비가 ${ratio.toFixed(2)}:1 로 4.5:1 에 못 미칩니다.`);
}
if (checked === 0) { console.error('테마를 하나도 확인하지 못했습니다 — 빈 검사입니다.'); process.exit(1); }

if (problems.length) {
  console.error('\n대비 검사 실패\n');
  problems.forEach(p => console.error('  - ' + p));
  process.exit(1);
}
console.log('\n대비 검사 통과 — .cap 이 두 테마 모두에서 WCAG AA 를 지킵니다.');
