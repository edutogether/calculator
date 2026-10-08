/* 가져오기(엑셀) 파일이 브라우저 탭을 붙잡지 못하게 하는 한도 — 읽기 전에 본다.
 *
 * 「엑셀로 저장」이 만드는 파일은 압축된 채로 수십 KB, 열 8칸·줄 수십 개다. 한도는 그 위로 넉넉히 잡았다.
 * 파일 크기(압축된 크기)만으로는 부족하다: 작은 파일이 풀리면서 아주 커질 수 있고(압축 폭탄),
 * 시트가 "표 범위"만 아주 크게 선언해도 줄·칸을 하나씩 훑느라 멈춘다. 그래서
 *   · zip 항목 수와 풀었을 때의 크기(선언값 + 실제로 풀어 센 값)를 먼저 보고,
 *   · 읽을 때 줄 수를 막고(XLSX.read 의 sheetRows), 읽은 뒤 표 범위의 칸 수를 본다. */
export const IMPORT_MAX_ENTRIES = 200;
export const IMPORT_MAX_UNPACKED = 20 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_COLS = 100;

export type ZipVerdict = 'ok' | 'entries' | 'unpacked' | 'broken';

/* 풀면 몇 바이트인지 센다 — 한도를 넘는 순간 멈춘다. 선언된 크기를 믿지 않으려는 것이다. */
async function inflatedSize(data: Uint8Array, limit: number): Promise<number> {
  const source = new ReadableStream({ start(c) { c.enqueue(data); c.close(); } });
  const reader = source.pipeThrough<Uint8Array>(new DecompressionStream('deflate-raw')).getReader();
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return n;
    n += value.length;
    if (n > limit) { await reader.cancel(); return n; }
  }
}

/* zip(.xlsx)의 항목 수·풀린 크기를 본다. zip 이 아니면 'ok' — 그건 XLSX.read 가 판단한다. */
export async function checkZip(buf: ArrayBuffer): Promise<ZipVerdict> {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  }
  if (e < 0) return 'ok';
  try {
    const count = dv.getUint16(e + 10, true), cdOff = dv.getUint32(e + 16, true);
    if (count === 0xFFFF || cdOff === 0xFFFFFFFF) return 'unpacked';   // zip64 — 이 한도 안에서는 쓸 일이 없다
    if (count > IMPORT_MAX_ENTRIES) return 'entries';
    const canInflate = typeof DecompressionStream === 'function' && typeof ReadableStream === 'function';
    let p = cdOff, declared = 0, actual = 0;
    for (let k = 0; k < count; k++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) return 'broken';
      const method = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), usz = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      if (csz === 0xFFFFFFFF || usz === 0xFFFFFFFF) return 'unpacked';
      declared += usz;
      if (usz > IMPORT_MAX_UNPACKED || declared > IMPORT_MAX_UNPACKED) return 'unpacked';
      if (canInflate && method === 8) {
        if (lho + 30 > u8.length || dv.getUint32(lho, true) !== 0x04034b50) return 'broken';
        const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
        if (start + csz > u8.length) return 'broken';
        actual += await inflatedSize(u8.subarray(start, start + csz), IMPORT_MAX_UNPACKED - actual);
        if (actual > IMPORT_MAX_UNPACKED) return 'unpacked';
      }
      p += 46 + nlen + xlen + clen;
    }
    return 'ok';
  } catch (_) { return 'broken'; }
}

const colNum = (s: string): number => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

/* 시트의 표 범위("A1:H50")가 한도를 넘는지. 넘으면 줄·칸 수를, 아니면 null. 범위가 없거나 읽을 수 없으면 null. */
export function sheetTooBig(ref: unknown): { rows: number; cols: number } | null {
  const m = typeof ref === 'string' ? /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(ref) : null;
  if (!m) return null;
  const rows = Number(m[4] ?? m[2]) - Number(m[2]) + 1;
  const cols = m[3] ? colNum(m[3]) - colNum(m[1]) + 1 : 1;
  return rows > IMPORT_MAX_ROWS || cols > IMPORT_MAX_COLS ? { rows, cols } : null;
}
