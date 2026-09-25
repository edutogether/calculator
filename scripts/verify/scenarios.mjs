/* 기준선·대조에 쓰는 시나리오. 전환 전과 전환 후에 **똑같이** 돌린다.
 *
 * 선택자는 앱 코드가 아니라 화면(DOM)에 기대므로, 전환 뒤에도 DOM이 같으면 그대로 돈다.
 * DOM이 달라져 선택자가 빗나가면 그 자체가 "차이"로 기록된다(오류 파일).
 */

// ── 뷰포트. 미디어쿼리 경계(1120·900·760·560·360px) 양쪽을 따로 둔다.
export const VP = {
  phone: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  pc: { width: 1440, height: 900 },
  phone3x: { width: 375, height: 812, dpr: 3 },
  w1121: { width: 1121, height: 800 }, w1119: { width: 1119, height: 800 },
  w901: { width: 901, height: 800 }, w899: { width: 899, height: 800 },
  w761: { width: 761, height: 800 }, w759: { width: 759, height: 800 },
  w561: { width: 561, height: 800 }, w559: { width: 559, height: 800 },
  w361: { width: 361, height: 740 }, w360: { width: 360, height: 740 },
};
const both = vps => vps.flatMap(v => [[v, 'light'], [v, 'dark']]);
export const MAIN = both(['phone', 'tablet', 'pc']);
const PCL = [['pc', 'light']];
const PC_PHONE = [['pc', 'light'], ['phone', 'light']];
const EDGE = ['w1121', 'w1119', 'w901', 'w899', 'w761', 'w759', 'w561', 'w559', 'w361', 'w360'].map(v => [v, 'light']);

// ── 이미 밖에 나가 있는 `#q=` 링크를 흉내 낸 것. 인코딩은 앱과 같은 규칙(JSON → UTF-8 → base64url).
const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const defaults = [[0, 4, 1], [0, 4, 1], [0, 4, 0], [0, 4, 1], [0, 1, 1], [0, 2, 1], [0, 4, 1], [0, 4, 1], [0, 8, 1],
  [0, 2, 1], [0, 2, 1], [0, 1, 1], [0, 1, 1], [0, 1, 1], [0, 1, 1], [0, 7, 1], [0, 1, 1], [0, 2, 1], [0, 1, 1],
  [0, 2, 1], [0, 6, 1], [0, 1, 1], [0, 1, 1], [0, 1, 1], [0, 4, 1], [0, 1, 1], [0, 1, 1], [0, 2, 1], [0, 1, 1],
  [0, 1, 1], [0, 8, 1], [0, 1, 1], [0, 4, 1], [0, 4, 1], [0, 4, 1], [0, 4, 1], [0, 1, 1]];
const edit = (base, ch) => base.map((v, i) => (ch[i] ? ch[i] : v));
export const Q = {
  A: enc({ v: 1, a: edit(defaults, { 0: [2, 6, 1], 2: [1, 4, 1], 5: [0, 3, 1], 15: [1, 10, 1], 20: [0, 0, 1], 27: [2, 2, 0] }),
           m: [10, 1, 40000, 500, 0, 35000] }),
  B: enc({ v: 1, a: edit(defaults, { 8: [1, 8, 0], 30: [2, 12, 1] }), m: [15, 2, 40000, 1000, 1, 0] }),
  C: enc({ v: 1, a: [['x', -5, 1], [99, '3', 1], [1.7, 2.5, 0]], m: ['a', -1, 99999, 7, 1, -3] }),
  D: '@@@notbase64@@@',
  E: enc({ v: 1 }),
  F: enc({ v: 1, a: edit(defaults, { 0: [2, 50, 1], 1: [2, 40, 1] }), m: [15, 2, 40000, 1000, 0, 20000] }),
};

// ── 작은 동작들
const tab = (p, i) => p.locator('#tabs .tab').nth(i).click();
const MEET = 5;
const row = (p, i) => p.locator(`#body .row[data-i="${i}"]`);
async function fillBlur(p, sel, v) { const l = p.locator(sel); await l.click(); await l.fill(v); await l.press('Tab'); }
async function typeQty(p, i, v) { const l = row(p, i).locator('[data-act="q"]'); await l.fill(v); }

export const SCENARIOS = [
  { name: 'default', combos: [...MAIN, ...EDGE, ['phone3x', 'light']], run: async () => {} },
  ...[1, 2, 3, 4, 5].map(i => ({ name: 'tab-' + i, combos: MAIN, run: p => tab(p, i) })),
  { name: 'all-once', combos: MAIN, run: p => p.click('#pAll') },
  { name: 'all-twice', combos: PC_PHONE, run: async p => { await p.click('#pAll'); await p.click('#pAll'); } },
  { name: 'qty-edit', combos: MAIN, run: async p => {
      const r = row(p, 0);
      await r.locator('[data-act="p"]').click(); await r.locator('[data-act="p"]').click();
      await r.locator('[data-act="m"]').click(); await typeQty(p, 1, '12');
      await row(p, 3).locator('[data-act="q"]').fill('');
    } },
  { name: 'qty-junk', combos: PCL, run: async p => { await typeQty(p, 0, '-3a7'); await typeQty(p, 1, '1.9'); } },
  { name: 'over-budget', combos: MAIN, run: async p => { await typeQty(p, 0, '99'); await tab(p, MEET); } },
  { name: 'item-off', combos: PC_PHONE, run: async p => {
      await row(p, 1).locator('[data-act="on"]').click();
      await tab(p, 3); await p.locator('#body [data-grp="③ Face Painting"]').click();
    } },
  ...Object.keys(Q).map(k => ({ name: 'q-' + k, hash: '#q=' + Q[k], combos: k === 'A' ? MAIN : PC_PHONE,
    run: async p => { if (k === 'A' || k === 'B') await tab(p, MEET); } })),
  { name: 'opt-modal', combos: MAIN, run: p => p.locator('#body .row[data-i="0"] [data-act="open"]').click(), shot: 'both' },
  { name: 'opt-pick', combos: PC_PHONE, run: async p => {
      await p.locator('#body .row[data-i="0"] [data-act="open"]').click();
      await p.locator('#optBody .opt[data-k="2"]').click(); await p.click('#optSave');
    } },
  { name: 'opt-cancel', combos: PCL, run: async p => {
      await p.locator('#body .row[data-i="0"] [data-act="open"]').click();
      await p.locator('#optBody .opt[data-k="1"]').click(); await p.click('#optCancel');
    } },
  { name: 'cap-over', combos: MAIN, run: async p => { await tab(p, MEET); await fillBlur(p, '#mCap', '50000'); }, shot: 'both' },
  { name: 'per-500', combos: PC_PHONE, run: async p => {
      await tab(p, MEET); await p.locator('#mPer').fill('12300'); await p.locator('#mPer').press('Tab');
    } },
  { name: 'per-enter', combos: PCL, run: async p => {
      await tab(p, MEET); await p.locator('#mPer').fill('23000'); await p.locator('#mPer').press('Enter');
    } },
  { name: 'meet-inputs', combos: PC_PHONE, run: async p => {
      await tab(p, MEET); await p.locator('#mN').fill('25'); await p.locator('#mC').fill('4'); await p.locator('#mC').press('Tab');
    } },
  // 반올림이 갈리는 칸 수 — 600,000원 ÷ 16 ÷ 1,000 = 37.5 (내림 37,000 / 반올림 38,000)
  { name: 'meet-16', combos: PCL, run: async p => {
      await tab(p, MEET); await p.locator('#mN').fill('16'); await p.locator('#mC').fill('1'); await p.click('#mAuto');
    } },
  { name: 'meet-zero', combos: PCL, run: async p => { await tab(p, MEET); await p.locator('#mN').fill('0'); } },
  { name: 'autofit-changed', combos: MAIN, run: async p => {
      await tab(p, MEET); await p.locator('#mN').fill('3'); await p.click('#mAuto');
    }, shot: 'both' },
  { name: 'autofit-same', combos: PCL, run: async p => { await tab(p, MEET); await p.click('#mAuto'); } },
  { name: 'autofit-fail', combos: PCL, run: async p => {
      await typeQty(p, 0, '99'); await tab(p, MEET); await p.click('#dlgX'); await p.click('#mAuto');
    } },
  { name: 'man-from-auto', hash: '#q=' + Q.B, combos: PC_PHONE, run: async p => {
      await tab(p, MEET); await p.click('#mMan'); await p.keyboard.type('17500'); await p.keyboard.press('Enter');
    } },
  { name: 'unit-500', combos: PCL, run: async p => { await tab(p, MEET); await p.click('#u500'); } },
  { name: 'unit-500-auto', combos: PCL, run: async p => {
      await typeQty(p, 0, '5'); await tab(p, MEET); await p.click('#u500'); await p.click('#u1000'); await p.click('#mAuto');
    } },
  { name: 'mclr', combos: PCL, run: async p => {
      await tab(p, MEET); await p.locator('#mPer').fill('30000'); await p.locator('#mPer').press('Tab');
      await p.hover('.segin'); await p.click('#mClr');
    } },
  { name: 'meet-ratio-share', waitAfter: 3000, combos: PC_PHONE, run: async p => {
      await tab(p, MEET); await p.locator('#mPer').fill('40000'); await p.locator('#mPer').press('Tab');
      await p.click('#pShare');
    } },
  { name: 'share', combos: PCL, run: async (p, v) => {
      await p.click('#pShare'); v.textAfterClick = await p.textContent('#pShare');
      await p.waitForTimeout(3000); v.textLater = await p.textContent('#pShare');
    } },
  { name: 'share-after-edit', waitAfter: 3000, combos: PCL, run: async p => {
      await typeQty(p, 0, '7'); await row(p, 2).locator('[data-act="on"]').click();
      await tab(p, MEET); await p.click('#dlgX'); await p.locator('#mN').fill('12'); await p.click('#pShare');
    } },
  { name: 'share-fallback', waitAfter: 3000, stub: 'fallback', combos: PC_PHONE, run: p => p.click('#pShare') },
  { name: 'move-share', combos: PC_PHONE, run: async p => {
      await tab(p, 1);
      const fx = p.locator('#body .sec.on .row.fix').first();
      for (let i = 0; i < 6 && !(await p.locator('#mask.on').count()); i++) await fx.locator('[data-act="fp"]').click();
    } },
  { name: 'move-share-down', combos: PCL, run: async p => {
      await tab(p, 2); const fx = p.locator('#body .sec.on .row.fix').nth(1);
      await fx.locator('[data-act="fm"]').click(); await fx.locator('[data-act="fm"]').click();
    } },
  { name: 'dlg-go', combos: PCL, run: async p => {
      await tab(p, 1); const fx = p.locator('#body .sec.on .row.fix').first();
      for (let i = 0; i < 6 && !(await p.locator('#mask.on').count()); i++) await fx.locator('[data-act="fp"]').click();
      await p.click('#dlgGo');
    }, shot: 'both' },
  { name: 'jump', combos: PC_PHONE, run: async p => {
      await tab(p, 2); await p.locator('#body .sec.on .row.fix [data-act="jump"]').nth(2).click();
    }, shot: 'both' },
  { name: 'escape', combos: PCL, run: async p => {
      await p.locator('#body .row[data-i="0"] [data-act="open"]').click(); await p.keyboard.press('Escape');
      await tab(p, MEET); await fillBlur(p, '#mCap', '50000'); await p.keyboard.press('Escape');
    } },
  { name: 'mask-click', combos: PCL, run: async p => {
      await tab(p, MEET); await fillBlur(p, '#mCap', '45000'); await p.mouse.click(5, 5);
      await p.locator('#body .row[data-i="0"] [data-act="open"]').count();
    } },
  { name: 'opt-x', combos: PCL, run: async p => {
      await p.locator('#body .row[data-i="3"] [data-act="open"]').click(); await p.click('#optX');
    } },
  { name: 'brk-click', combos: PCL, run: p => p.locator('#brk [data-go]').nth(3).click() },
  { name: 'hover', combos: PCL, shot: 'viewport', run: async p => {
      await p.hover('#pShare');
    } },
  { name: 'hover-tab', combos: PCL, shot: 'viewport', run: async p => { await p.hover('#tabs .tab >> nth=2'); } },
  { name: 'hover-alt', combos: PCL, shot: 'viewport', run: async p => { await p.hover('#body .row[data-i="1"] .alt'); } },
  { name: 'keyboard', combos: PCL, shot: 'viewport', run: async (p, v) => {
      v.focusOrder = [];
      for (let i = 0; i < 14; i++) {
        await p.keyboard.press('Tab');
        v.focusOrder.push(await p.evaluate(() => { const a = document.activeElement;
          return a ? a.tagName + '#' + (a.id || '') + '.' + a.className + '|' + (a.getAttribute('aria-label') || a.textContent.trim().slice(0, 30)) : null; }));
      }
    } },
  { name: 'xlsx-export', waitAfter: 3000, combos: PCL, xlsx: 'export', run: async p => {
      await typeQty(p, 0, '6'); await row(p, 1).locator('[data-act="on"]').click();
      await tab(p, 1); await row(p, 16).locator('[data-act="on"]').click();
    } },
  { name: 'xlsx-export-default', waitAfter: 3000, combos: PCL, xlsx: 'export', run: async () => {} },
  { name: 'xlsx-roundtrip', waitAfter: 3000, combos: PCL, xlsx: 'import:xlsx-export', run: async () => {} },
  { name: 'xlsx-bad', waitAfter: 3000, combos: PCL, xlsx: 'import:bad', run: async () => {} },
  { name: 'xlsx-norows', waitAfter: 3000, combos: PCL, xlsx: 'import:norows', run: async () => {} },
  { name: 'print', combos: [['pc', 'light'], ['pc', 'dark']], print: true, run: async p => { await p.click('#prt'); } },
  { name: 'print-q-A', hash: '#q=' + Q.A, combos: PCL, print: true, run: async p => { await p.click('#prt'); } },
  { name: 'print-over', combos: PCL, print: true, run: async p => { await typeQty(p, 0, '99'); await p.click('#prt'); } },
  { name: 'file-default', file: true, combos: PC_PHONE, run: async () => {} },
  { name: 'file-share', waitAfter: 3000, file: true, combos: PCL, run: p => p.click('#pShare') },
  { name: 'nojs', nojs: true, combos: [...both(['phone', 'pc']), ['w360', 'light']], run: async () => {} },
  { name: 'nojs-focus', nojs: true, combos: [['phone', 'light']], run: async p => { await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); } },
  { name: 'reduced-default', reduced: true, combos: PCL, run: async () => {} },
  { name: 'reduced-jump', reduced: true, combos: PCL, run: async p => {
      await tab(p, 2); await p.locator('#body .sec.on .row.fix [data-act="jump"]').nth(2).click();
    } },
];
