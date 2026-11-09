/*
  Minimal .xlsx writer with no dependencies (Node's zlib only).
  Supports: several sheets, text/number cells, styles (font, fill, alignment, borders), column widths,
  row heights, merged cells, frozen panes, autofilter, tab colours, and hyperlinks (web links or links
  to a cell in another sheet of the same workbook).
*/
const zlib = require("zlib");

// ---------- zip (store + deflate) ----------
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zip(files) {               // files: [{name, data: Buffer|string}]
  const locals = [], centrals = []; let offset = 0;
  const dosTime = 0, dosDate = (2026 - 1980) << 9 | 1 << 5 | 1;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, "utf8");
    const comp = zlib.deflateRawSync(raw, { level: 6 });
    const crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += lh.length + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ---------- helpers ----------
const xml = s => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function colName(c) { let s = ""; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
const ref = (r, c) => colName(c) + (r + 1);
const argb = hex => "FF" + String(hex).replace("#", "").toUpperCase();
// Sheet names: max 31 chars, none of : \ / ? * [ ]
function safeSheetName(name) { return String(name).replace(/[:\\/?*\[\]]/g, "-").replace(/^'+|'+$/g, "").slice(0, 31).trim() || "Sheet"; }

// ---------- styles ----------
class Styles {
  constructor() { this.fonts = ['<font><sz val="11"/><name val="Calibri"/></font>']; this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>']; this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']; this.cache = new Map(); }
  idx(list, x) { let i = list.indexOf(x); if (i < 0) { list.push(x); i = list.length - 1; } return i; }
  get(st) {
    if (!st) return 0;
    const key = JSON.stringify(st); if (this.cache.has(key)) return this.cache.get(key);
    const f = st.font || {};
    const font = `<font>${f.bold ? "<b/>" : ""}${f.italic ? "<i/>" : ""}${f.underline ? '<u/>' : ""}<sz val="${f.size || 11}"/>${f.color ? `<color rgb="${argb(f.color)}"/>` : ""}<name val="Calibri"/></font>`;
    const fill = st.fill ? `<fill><patternFill patternType="solid"><fgColor rgb="${argb(st.fill)}"/><bgColor indexed="64"/></patternFill></fill>` : null;
    const b = st.border; const side = (n, s) => s ? `<${n} style="${s.style || "thin"}"><color rgb="${argb(s.color || "#C9D3CD")}"/></${n}>` : `<${n}/>`;
    const border = b ? `<border>${side("left", b.left)}${side("right", b.right)}${side("top", b.top)}${side("bottom", b.bottom)}<diagonal/></border>` : null;
    const a = st.align || {};
    const align = (a.h || a.v || a.wrap || a.indent) ? `<alignment${a.h ? ` horizontal="${a.h}"` : ""}${a.v ? ` vertical="${a.v}"` : ""}${a.wrap ? ' wrapText="1"' : ""}${a.indent ? ` indent="${a.indent}"` : ""}/>` : "";
    const fontId = this.idx(this.fonts, font), fillId = fill ? this.idx(this.fills, fill) : 0, borderId = border ? this.idx(this.borders, border) : 0;
    const xf = `<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1"${fill ? ' applyFill="1"' : ""}${border ? ' applyBorder="1"' : ""}${align ? ' applyAlignment="1">' + align + "</xf>" : "/>"}`;
    const id = this.idx(this.xfs, xf); this.cache.set(key, id); return id;
  }
  xml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts><fills count="${this.fills.length}">${this.fills.join("")}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join("")}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
}

// ---------- sheet ----------
class Sheet {
  constructor(wb, name) { this.wb = wb; this.name = name; this.rows = new Map(); this.widths = []; this.heights = new Map(); this.merges = []; this.links = []; this.frozen = null; this.filter = null; this.tab = null; }
  set(r, c, value, style) {
    if (!this.rows.has(r)) this.rows.set(r, new Map());
    this.rows.get(r).set(c, { v: value, s: this.wb.styles.get(style) });
    return this;
  }
  row(r, values, style, startCol = 0) { values.forEach((v, i) => this.set(r, startCol + i, v, Array.isArray(style) ? style[i] : style)); return this; }
  // Fill a range with a style even where there's no value (for banded blocks)
  fillRange(r1, c1, r2, c2, style) { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const ex = this.rows.get(r) && this.rows.get(r).get(c); this.set(r, c, ex ? ex.v : null, style); } return this; }
  width(c, w) { this.widths[c] = w; return this; }
  height(r, h) { this.heights.set(r, h); return this; }
  merge(r1, c1, r2, c2) { this.merges.push(`${ref(r1, c1)}:${ref(r2, c2)}`); return this; }
  // url: "https://…" for a web link, or {sheet:"Name", cell:"A1"} for a link inside this workbook
  link(r, c, text, url, style, tip) { this.set(r, c, text, style); this.links.push({ r, c, url, tip }); return this; }
  freeze(rows, cols = 0) { this.frozen = { rows, cols }; return this; }
  autoFilter(r1, c1, r2, c2) { this.filter = `${ref(r1, c1)}:${ref(r2, c2)}`; return this; }
  tabColor(hex) { this.tab = hex; return this; }
  xml(rels) {
    const maxR = Math.max(0, ...this.rows.keys()), maxC = Math.max(0, ...[...this.rows.values()].flatMap(m => [...m.keys()]));
    let s = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`;
    if (this.tab || this.filter) s += `<sheetPr${this.filter ? ' filterMode="0"' : ""}>${this.tab ? `<tabColor rgb="${argb(this.tab)}"/>` : ""}</sheetPr>`;
    s += `<dimension ref="A1:${ref(maxR, maxC)}"/>`;
    s += `<sheetViews><sheetView workbookViewId="0"${this.isFirst ? ' tabSelected="1"' : ""} zoomScale="100">`;
    if (this.frozen && (this.frozen.rows || this.frozen.cols)) {
      const { rows, cols } = this.frozen, pane = rows && cols ? "bottomRight" : rows ? "bottomLeft" : "topRight";
      s += `<pane${cols ? ` xSplit="${cols}"` : ""}${rows ? ` ySplit="${rows}"` : ""} topLeftCell="${ref(rows, cols)}" activePane="${pane}" state="frozen"/><selection pane="${pane}"/>`;
    }
    s += `</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>`;
    if (this.widths.length) s += "<cols>" + this.widths.map((w, i) => w ? `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>` : "").join("") + "</cols>";
    s += "<sheetData>";
    for (const r of [...this.rows.keys()].sort((a, b) => a - b)) {
      const h = this.heights.get(r);
      s += `<row r="${r + 1}"${h ? ` ht="${h}" customHeight="1"` : ""}>`;
      for (const c of [...this.rows.get(r).keys()].sort((a, b) => a - b)) {
        const { v, s: st } = this.rows.get(r).get(c), at = ref(r, c), sa = st ? ` s="${st}"` : "";
        if (v === null || v === undefined || v === "") s += `<c r="${at}"${sa}/>`;
        else if (typeof v === "number" && isFinite(v)) s += `<c r="${at}"${sa}><v>${v}</v></c>`;
        else s += `<c r="${at}"${sa} t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
      }
      s += "</row>";
    }
    s += "</sheetData>";
    if (this.filter) s += `<autoFilter ref="${this.filter}"/>`;
    if (this.merges.length) s += `<mergeCells count="${this.merges.length}">${this.merges.map(m => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`;
    if (this.links.length) {
      s += "<hyperlinks>" + this.links.map(l => {
        const tip = l.tip ? ` tooltip="${xml(l.tip)}"` : "";
        if (typeof l.url === "string") { const id = rels.add(l.url); return `<hyperlink ref="${ref(l.r, l.c)}" r:id="${id}"${tip}/>`; }
        return `<hyperlink ref="${ref(l.r, l.c)}" location="${xml(`'${l.url.sheet.replace(/'/g, "''")}'!${l.url.cell || "A1"}`)}" display="${xml(this.rows.get(l.r).get(l.c).v)}"${tip}/>`;
      }).join("") + "</hyperlinks>";
    }
    s += `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>`;
    return s;
  }
}

class Workbook {
  constructor() { this.sheets = []; this.styles = new Styles(); }
  addSheet(name) {
    let base = safeSheetName(name), n = base, i = 2;
    while (this.sheets.some(s => s.name.toLowerCase() === n.toLowerCase())) { const suf = ` (${i++})`; n = base.slice(0, 31 - suf.length).trim() + suf; }
    const s = new Sheet(this, n); this.sheets.push(s); return s;
  }
  toBuffer() {
    if (!this.sheets.length) this.addSheet("Sheet1");
    this.sheets.forEach((s, i) => s.isFirst = i === 0);
    const files = [];
    const sheetFiles = this.sheets.map((sh, i) => {
      const list = []; const rels = { add: url => { list.push(url); return "rId" + list.length; } };
      const body = sh.xml(rels);
      const relXml = list.length ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        list.map((u, k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(u)}" TargetMode="External"/>`).join("") + "</Relationships>" : null;
      return { body, relXml };
    });
    files.push({ name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${this.sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` });
    files.push({ name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
    const defined = this.sheets.map((s, i) => s.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(s.name.replace(/'/g, "''"))}'!${s.filter.split(":").map(x => x.replace(/([A-Z]+)(\d+)/, "$$$1$$$2")).join(":")}</definedName>` : "").join("");
    files.push({ name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${this.sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ""}</workbook>` });
    files.push({ name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${this.sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${this.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
    files.push({ name: "xl/styles.xml", data: this.styles.xml() });
    sheetFiles.forEach((f, i) => { files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: f.body }); if (f.relXml) files.push({ name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`, data: f.relXml }); });
    return zip(files);
  }
}

module.exports = { Workbook, safeSheetName, colName, ref };
