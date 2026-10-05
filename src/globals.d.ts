/* cdn.sheetjs.com 에서 <script>로 불러오는 SheetJS(xlsx 0.20.3, SRI 걸림)의 전역 XLSX — 쓰는 부분만 적는다.
 * 번들에 넣지 않는 이유: 넣으면 파일이 약 1MB 커지고, 버전 고정·무결성 검사를 CDN 쪽에 두는
 * 지금 구조(.claude/rules/app.md "SRI" 절)가 바뀐다. */
type XlsxSheet = { [cell: string]: unknown } & {
  '!cols'?: { wch: number }[];
  '!merges'?: { s: { r: number; c: number }; e: { r: number; c: number } }[];
};
interface XlsxBook { SheetNames: string[]; Sheets: Record<string, XlsxSheet> }
declare const XLSX: {
  read(data: ArrayBuffer, opts: { type: 'array' }): XlsxBook;
  write(wb: XlsxBook, opts: { bookType: 'xlsx'; type: 'array' }): ArrayBuffer;
  utils: {
    sheet_to_json(sheet: XlsxSheet, opts: { header: 1 }): unknown[][];
    aoa_to_sheet(aoa: unknown[][]): XlsxSheet;
    book_new(): XlsxBook;
    book_append_sheet(wb: XlsxBook, ws: XlsxSheet, name: string): void;
  };
};
