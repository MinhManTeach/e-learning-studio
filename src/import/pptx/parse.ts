// Reads the structure of a PowerPoint (.pptx) file: slides in order, text, pictures,
// videos and sounds, internal "jump to slide" links and click-triggered animations.
// It only describes what is in the file; deciding what each slide means for the
// lesson happens in analyze.ts. Self-contained (fflate + fast-xml-parser only).
import { strFromU8, unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type PptxMediaKind = "IMAGE" | "VIDEO" | "AUDIO";
export interface PptxElement {
  /** Shape id inside the slide (cNvPr id). */
  id: string;
  name: string;
  descr: string;
  /** Paragraphs of visible text, trimmed, empty ones dropped. */
  text: string[];
  /** Placeholder type such as "title", "ctrTitle", "body" (undefined for free shapes). */
  placeholder?: string;
  /** Placeholder index, which ties it to its place on the layout. */
  placeholderIdx?: string;
  rect?: Rect;
  /** Picture shown by this element (zip path, e.g. "ppt/media/image3.png"). */
  image?: string;
  /** Video or sound played by this element. */
  media?: { path: string; kind: "VIDEO" | "AUDIO" };
  /** 1-based slide number this element jumps to when clicked. */
  jump?: number;
  /** How the text and its box look (theme colours resolved to RGB). */
  style?: PptxStyle;
  /** Clockwise rotation in degrees. */
  rotate?: number;
  flipH?: boolean;
  flipV?: boolean;
  /** A table's cells, drawn in its place. */
  cells?: PptxElement[];
  /** Part of the picture cut off on each side, as a fraction (0.1 = 10%). */
  crop?: { l: number; t: number; r: number; b: number };
}
export interface PptxStyle {
  /** Font size of the first run, in points. */
  size?: number;
  /** "#rrggbb" */
  color?: string;
  bold?: boolean;
  italic?: boolean;
  /** Font name of the first run, theme fonts resolved. */
  font?: string;
  /** Box fill, "#rrggbb". */
  fill?: string;
  align?: "left" | "center" | "right" | "justify";
  /** Where the text sits inside its box, top to bottom. */
  valign?: "top" | "middle" | "bottom";
  /** Space between the box edge and its text, in EMU. */
  inset?: { l: number; t: number; r: number; b: number };
  /** Line spacing, 1 = PowerPoint's single spacing. */
  lineSpacing?: number;
  /** The text stays on one line (PowerPoint "do not wrap"). */
  nowrap?: boolean;
  /** Box outline: colour, width in EMU, dotted or dashed. */
  line?: { color: string; width: number; dash?: boolean };
  /** Rounded corners as a fraction of the shorter side, or an ellipse. */
  radius?: number;
  ellipse?: boolean;
  /** A drawn shape (custom geometry) as an SVG path on a 1000 × 1000 box. */
  path?: string;
}
export interface PptxTrigger {
  /** The shape the student clicks. */
  trigger: string;
  /** Shapes animated or played by that click. */
  targets: string[];
}
export interface PptxSlide {
  number: number;
  hidden: boolean;
  elements: PptxElement[];
  notes: string[];
  triggers: PptxTrigger[];
  /** Shapes that appear with an entrance animation in the normal click order. */
  appear: string[];
  /** Sound played when the slide opens (slide transition sound). */
  sound?: string;
  /** Background of the slide (its own, else its layout's, else its master's). */
  background?: { color?: string; image?: string };
  /**
   * Pictures and shapes the slide shows from its master and layout (frames,
   * background pictures), back to front, drawn behind the slide's own shapes.
   */
  decor: PptxElement[];
}
export interface PptxDeck {
  width: number;
  height: number;
  slides: PptxSlide[];
  /** Every media part referenced by a slide, with its size in bytes. */
  media: Record<string, PptxMedia>;
}
export interface PptxMedia {
  kind: PptxMediaKind;
  size: number;
  /** Pixel size of a PNG, JPEG or GIF picture, when its header could be read. */
  width?: number;
  height?: number;
}

/** Pixel size from a PNG, GIF or JPEG header. */
export function imagePixels(b: Uint8Array) {
  const u16 = (i: number) => (b[i] << 8) | b[i + 1];
  const u32 = (i: number) => ((u16(i) << 16) >>> 0) + u16(i + 2);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e)
    return { width: u32(16), height: u32(20) };
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46)
    return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return undefined;
      const marker = b[i + 1];
      // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      )
        return { width: u16(i + 7), height: u16(i + 5) };
      i += 2 + u16(i + 2);
    }
  }
  return undefined;
}
const pictureExt = /\.(png|jpe?g|gif)$/i;
/** Pictures larger than this are not opened just to read their size. */
const maxHeaderScan = 8 * 1048576;

type XmlNode = { [key: string]: XmlNode[] | string | Record<string, string> };
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: false,
});
const kids = (node: XmlNode | undefined, name: string): XmlNode[] =>
  node && Array.isArray(node[name]) ? (node[name] as XmlNode[]) : [];
const find = (list: XmlNode[], name: string) => list.find((n) => name in n);
const attr = (node: XmlNode | undefined, name: string) =>
  node ? (node[":@"] as Record<string, string> | undefined)?.[name] : undefined;
const tagOf = (node: XmlNode) => Object.keys(node).find((k) => k !== ":@")!;
function descendants(list: XmlNode[], name: string): XmlNode[] {
  return list.flatMap((n) => [
    ...(name in n ? [n] : []),
    ...Object.entries(n)
      .filter(([k, v]) => k !== ":@" && Array.isArray(v))
      .flatMap(([, v]) => descendants(v as XmlNode[], name)),
  ]);
}
function textOf(list: XmlNode[]): string {
  return list
    .map((n) => {
      if ("#text" in n) return String(n["#text"]);
      if ("br" in n) return "\n";
      return Object.entries(n)
        .filter(([k, v]) => k !== ":@" && Array.isArray(v))
        .map(([, v]) => textOf(v as XmlNode[]))
        .join("");
    })
    .join("");
}
/** Paragraphs (a:p) of a text body, each joined from its runs (a:t). */
function paragraphs(list: XmlNode[]): string[] {
  return descendants(list, "p")
    .filter((p) => "p" in p && descendants(kids(p, "p"), "t").length)
    .map((p) =>
      descendants(kids(p, "p"), "t")
        .map((t) => textOf(kids(t, "t")))
        .join("")
        .replace(/[ \t ]+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

/** Colours ("accent1", "dk1"...) and fonts of a master's theme. */
interface Theme {
  colors: Record<string, string>;
  major?: string;
  minor?: string;
}
const hex = (v: string | undefined) =>
  v && /^[0-9a-f]{6}$/i.test(v) ? `#${v.toLowerCase()}` : undefined;
const presetColors: Record<string, string> = {
  white: "#ffffff",
  black: "#000000",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  orange: "#ffa500",
  gray: "#808080",
};
/** The usual colour map of a master: background 1 is light 1, text 1 is dark 1. */
const schemeAlias: Record<string, string> = {
  bg1: "lt1",
  tx1: "dk1",
  bg2: "lt2",
  tx2: "dk2",
};
const channels = (c: string) =>
  [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
const toHex = (rgb: number[]) =>
  "#" +
  rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
function hslOf([r, g, b]: number[]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? (g - b) / d + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [h / 6, s, l];
}
function rgbOf([h, s, l]: number[]) {
  if (!s) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
/** PowerPoint's colour changes: darker (shade, lumMod), lighter (tint, lumOff). */
function adjusted(color: string, mods: XmlNode[]) {
  const val = (name: string) => {
    const v = Number(attr(find(mods, name), "val"));
    return Number.isFinite(v) ? v / 100000 : undefined;
  };
  let rgb = channels(color);
  const shade = val("shade");
  const tint = val("tint");
  if (shade !== undefined) rgb = rgb.map((v) => v * shade);
  if (tint !== undefined) rgb = rgb.map((v) => v + (1 - v) * (1 - tint));
  const lumMod = val("lumMod");
  const lumOff = val("lumOff");
  if (lumMod !== undefined || lumOff !== undefined) {
    const [h, s, l] = hslOf(rgb);
    rgb = rgbOf([
      h,
      s,
      Math.min(1, Math.max(0, l * (lumMod ?? 1) + (lumOff ?? 0))),
    ]);
  }
  return toHex(rgb);
}
/** The colour given by the first colour element in a list, as "#rrggbb". */
function colorIn(list: XmlNode[], theme: Theme): string | undefined {
  for (const node of list) {
    const tag = tagOf(node);
    let base: string | undefined;
    if (tag === "srgbClr") base = hex(attr(node, "val"));
    else if (tag === "schemeClr") {
      const name = attr(node, "val") ?? "";
      base = theme.colors[schemeAlias[name] ?? name];
    } else if (tag === "sysClr") base = hex(attr(node, "lastClr"));
    else if (tag === "prstClr") base = presetColors[attr(node, "val") ?? ""];
    else continue;
    return base && adjusted(base, kids(node, tag));
  }
  return undefined;
}
/** A fill: its colour, null for "no fill", undefined when the list says nothing. */
function fillIn(list: XmlNode[], theme: Theme): string | null | undefined {
  if (find(list, "noFill")) return null;
  const solid = find(list, "solidFill");
  if (solid) return colorIn(kids(solid, "solidFill"), theme);
  const grad = find(list, "gradFill");
  if (grad) {
    const stop = descendants(kids(grad, "gradFill"), "gs")[0];
    return stop && colorIn(kids(stop, "gs"), theme);
  }
  return undefined;
}
/** Shapes drawn as a box (with rounded corners or as an ellipse); others are not drawn. */
const boxShapes = new Set([
  "rect",
  "roundRect",
  "ellipse",
  "flowChartProcess",
  "flowChartAlternateProcess",
  "round2SameRect",
  "snipRect",
]);
const fontOf = (typeface: string | undefined, theme: Theme) =>
  typeface === "+mj-lt"
    ? theme.major
    : typeface === "+mn-lt"
      ? theme.minor
      : typeface && !typeface.startsWith("+")
        ? typeface
        : undefined;
/** Custom geometry as one SVG path on a 1000 × 1000 box (undefined if it uses formulas). */
function customPath(cust: XmlNode): string | undefined {
  const out: string[] = [];
  const pathList = find(kids(cust, "custGeom"), "pathLst");
  for (const p of kids(pathList, "pathLst")) {
    if (!("path" in p) || attr(p, "fill") === "none") continue;
    const w = Number(attr(p, "w"));
    const h = Number(attr(p, "h"));
    if (!(w > 0) || !(h > 0)) return undefined;
    const sx = 1000 / w;
    const sy = 1000 / h;
    let x = 0;
    let y = 0;
    const pts = (n: XmlNode, tag: string) =>
      kids(n, tag)
        .filter((k) => "pt" in k)
        .map((k) => [Number(attr(k, "x")), Number(attr(k, "y"))]);
    const r = (v: number) => Math.round(v * 10) / 10;
    for (const step of kids(p, "path")) {
      const tag = tagOf(step);
      if (tag === "close") {
        out.push("Z");
        continue;
      }
      if (tag === "arcTo") {
        const wR = Number(attr(step, "wR"));
        const hR = Number(attr(step, "hR"));
        const st = (Number(attr(step, "stAng")) / 60000) * (Math.PI / 180);
        const sw = (Number(attr(step, "swAng")) / 60000) * (Math.PI / 180);
        if (![wR, hR, st, sw].every(Number.isFinite)) return undefined;
        const cx = x - wR * Math.cos(st);
        const cy = y - hR * Math.sin(st);
        x = cx + wR * Math.cos(st + sw);
        y = cy + hR * Math.sin(st + sw);
        out.push(
          `A${r(wR * sx)} ${r(hR * sy)} 0 ${Math.abs(sw) > Math.PI ? 1 : 0} ${sw > 0 ? 1 : 0} ${r(x * sx)} ${r(y * sy)}`,
        );
        continue;
      }
      const letter = {
        moveTo: "M",
        lnTo: "L",
        cubicBezTo: "C",
        quadBezTo: "Q",
      }[tag];
      if (!letter) continue;
      const list = pts(step, tag);
      if (!list.length || list.flat().some((v) => !Number.isFinite(v)))
        return undefined;
      [x, y] = list.at(-1)!;
      out.push(
        letter + list.map(([a, b]) => `${r(a * sx)} ${r(b * sy)}`).join(" "),
      );
    }
  }
  return out.length ? out.join("") : undefined;
}
/**
 * How a shape and its text look: fill, outline and corners of the box; size,
 * colour, font, weight and alignment of the first run; where the text sits.
 * `base` is what the shape inherits (its placeholder on the layout or master).
 */
function styleOf(
  inner: XmlNode[],
  theme: Theme,
  base: PptxStyle = {},
): PptxStyle | undefined {
  const style: PptxStyle = { ...base };
  const spPr = kids(find(inner, "spPr"), "spPr");
  const ref = kids(find(inner, "style"), "style");
  const fromRef = (name: string) => {
    const r = find(ref, name);
    return r && attr(r, "idx") !== "0"
      ? colorIn(kids(r, name), theme)
      : undefined;
  };
  const prst = attr(find(spPr, "prstGeom"), "prst");
  const cust = find(spPr, "custGeom");
  const drawn = cust || !prst || boxShapes.has(prst);
  const fill = fillIn(spPr, theme);
  const fillColor = fill === undefined ? fromRef("fillRef") : fill;
  if (fillColor && drawn) style.fill = fillColor;
  else if (fill === null || !drawn) delete style.fill;
  const ln = find(spPr, "ln");
  const lnList = kids(ln, "ln");
  const lineFill = ln ? fillIn(lnList, theme) : undefined;
  const lineColor = lineFill === undefined ? fromRef("lnRef") : lineFill;
  if (lineColor && drawn) {
    const dash = attr(find(lnList, "prstDash"), "val");
    style.line = {
      color: lineColor,
      width: Number(attr(ln, "w")) || 9525,
      ...(dash && dash !== "solid" ? { dash: true } : {}),
    };
  } else if (lineFill === null || !drawn) delete style.line;
  if (prst === "roundRect" || prst === "flowChartAlternateProcess") {
    const gd = descendants(kids(find(spPr, "prstGeom"), "prstGeom"), "gd")[0];
    const adj = Number(/val (\d+)/.exec(attr(gd, "fmla") ?? "")?.[1] ?? 16667);
    style.radius = Math.min(0.5, adj / 100000);
  } else if (prst === "ellipse") style.ellipse = true;
  if (cust) {
    const d = customPath(cust);
    if (d) style.path = d;
    else {
      delete style.fill;
      delete style.line;
    }
  }

  const body = kids(find(inner, "txBody"), "txBody");
  const bodyPr = find(body, "bodyPr");
  const anchor = attr(bodyPr, "anchor");
  if (anchor === "ctr") style.valign = "middle";
  else if (anchor === "b") style.valign = "bottom";
  else if (anchor === "t") style.valign = "top";
  const ins = (name: string, fallback: number) => {
    const v = Number(attr(bodyPr, name));
    return Number.isFinite(v) && attr(bodyPr, name) !== undefined
      ? v
      : fallback;
  };
  style.inset = {
    l: ins("lIns", base.inset?.l ?? 91440),
    t: ins("tIns", base.inset?.t ?? 45720),
    r: ins("rIns", base.inset?.r ?? 91440),
    b: ins("bIns", base.inset?.b ?? 45720),
  };
  if (attr(bodyPr, "wrap") === "none") style.nowrap = true;
  else if (attr(bodyPr, "wrap") === "square") delete style.nowrap;
  const scale =
    Number(attr(find(kids(bodyPr, "bodyPr"), "normAutofit"), "fontScale")) /
      100000 || 1;
  const run = descendants(body, "rPr")[0] ?? descendants(body, "endParaRPr")[0];
  const runList = run ? kids(run, tagOf(run)) : [];
  const sz = Number(attr(run, "sz"));
  if (sz > 0) style.size = sz / 100;
  if (style.size) style.size *= scale;
  const b = attr(run, "b");
  if (b === "1") style.bold = true;
  else if (b === "0") delete style.bold;
  const i = attr(run, "i");
  if (i === "1") style.italic = true;
  else if (i === "0") delete style.italic;
  const color =
    colorIn(kids(find(runList, "solidFill"), "solidFill"), theme) ??
    fromRef("fontRef");
  if (color) style.color = color;
  const font = fontOf(attr(find(runList, "latin"), "typeface"), theme);
  if (font) style.font = font;
  const pPr = descendants(body, "pPr")[0];
  const algn = attr(pPr, "algn");
  if (algn === "ctr") style.align = "center";
  else if (algn === "r") style.align = "right";
  else if (algn === "just" || algn === "dist") style.align = "justify";
  else if (algn === "l") delete style.align;
  const spacing = Number(
    attr(find(kids(find(kids(pPr, "pPr"), "lnSpc"), "lnSpc"), "spcPct"), "val"),
  );
  if (spacing > 0) style.lineSpacing = spacing / 100000;
  return Object.keys(style).length ? style : undefined;
}

interface Rel {
  type: string;
  target: string;
  external: boolean;
}
function resolvePart(from: string, target: string) {
  const parts = from.split("/").slice(0, -1);
  for (const piece of target.split("/")) {
    if (piece === "..") parts.pop();
    else if (piece && piece !== ".") parts.push(piece);
  }
  return parts.join("/");
}
function readRels(files: Record<string, Uint8Array>, part: string) {
  const dir = part.split("/").slice(0, -1).join("/");
  const name = part.split("/").at(-1);
  const relsPath = `${dir}/_rels/${name}.rels`;
  const rels = new Map<string, Rel>();
  if (!files[relsPath]) return rels;
  const xml = parser.parse(strFromU8(files[relsPath])) as XmlNode[];
  for (const r of descendants(xml, "Relationship")) {
    const id = attr(r, "Id");
    const target = attr(r, "Target") ?? "";
    const external = attr(r, "TargetMode") === "External";
    if (id)
      rels.set(id, {
        type: (attr(r, "Type") ?? "").split("/").at(-1) ?? "",
        target: external ? target : resolvePart(part, target),
        external,
      });
  }
  return rels;
}

interface Transform {
  apply(r: Rect): Rect;
}
const identity: Transform = { apply: (r) => r };
function rectOf(spPr: XmlNode | undefined, name = "spPr"): Rect | undefined {
  const xfrm = find(kids(spPr, name), "xfrm");
  const off = find(kids(xfrm, "xfrm"), "off");
  const ext = find(kids(xfrm, "xfrm"), "ext");
  if (!off || !ext) return undefined;
  return {
    x: Number(attr(off, "x") ?? 0),
    y: Number(attr(off, "y") ?? 0),
    w: Number(attr(ext, "cx") ?? 0),
    h: Number(attr(ext, "cy") ?? 0),
  };
}
/** Group shapes place children in their own coordinate space (chOff/chExt). */
function groupTransform(grp: XmlNode, outer: Transform): Transform {
  const xfrm = find(
    kids(find(kids(grp, "grpSp"), "grpSpPr"), "grpSpPr"),
    "xfrm",
  );
  const list = kids(xfrm, "xfrm");
  const num = (n: XmlNode | undefined, a: string) => Number(attr(n, a) ?? 0);
  const off = find(list, "off");
  const ext = find(list, "ext");
  const chOff = find(list, "chOff");
  const chExt = find(list, "chExt");
  if (!off || !ext || !chOff || !chExt) return outer;
  const sx = num(chExt, "cx") ? num(ext, "cx") / num(chExt, "cx") : 1;
  const sy = num(chExt, "cy") ? num(ext, "cy") / num(chExt, "cy") : 1;
  return {
    apply: (r) =>
      outer.apply({
        x: num(off, "x") + (r.x - num(chOff, "x")) * sx,
        y: num(off, "y") + (r.y - num(chOff, "y")) * sy,
        w: r.w * sx,
        h: r.h * sy,
      }),
  };
}

/** Rotation and flips of a shape (rotations of groups are not followed). */
function turnOf(spPr: XmlNode | undefined, name = "spPr") {
  const xfrm = find(kids(spPr, name), "xfrm");
  const rotate = Number(attr(xfrm, "rot")) / 60000;
  return {
    ...(rotate ? { rotate: Math.round(rotate * 100) / 100 } : {}),
    ...(attr(xfrm, "flipH") === "1" ? { flipH: true } : {}),
    ...(attr(xfrm, "flipV") === "1" ? { flipV: true } : {}),
  };
}
/** The part of a picture PowerPoint crops away (a:srcRect). */
function cropOf(blipFill: XmlNode | undefined) {
  const src = find(kids(blipFill, "blipFill"), "srcRect");
  if (!src) return undefined;
  const v = (k: string) => (Number(attr(src, k)) || 0) / 100000;
  const crop = { l: v("l"), t: v("t"), r: v("r"), b: v("b") };
  return Object.values(crop).some(Boolean) &&
    crop.l + crop.r < 1 &&
    crop.t + crop.b < 1
    ? crop
    : undefined;
}

/**
 * The cells of a table as boxes: where each sits (merged cells joined), its
 * fill, its text and how the text sits in it.
 */
function tableCells(
  tbl: XmlNode,
  frame: Rect,
  theme: Theme,
  id: string,
): PptxElement[] {
  const list = kids(tbl, "tbl");
  const cols = kids(find(list, "tblGrid"), "tblGrid")
    .filter((c) => "gridCol" in c)
    .map((c) => Number(attr(c, "w")) || 0);
  const rows = list.filter((r) => "tr" in r);
  const heights = rows.map((r) => Number(attr(r, "h")) || 0);
  // PowerPoint grows rows to fit their text; spread the frame's height the same way.
  const total = heights.reduce((a, b) => a + b, 0);
  const sy = total > 0 ? frame.h / total : 1;
  const sx = (() => {
    const w = cols.reduce((a, b) => a + b, 0);
    return w > 0 ? frame.w / w : 1;
  })();
  const cells: PptxElement[] = [];
  let y = frame.y;
  rows.forEach((row, r) => {
    let x = frame.x;
    let c = 0;
    for (const cell of kids(row, "tr").filter((k) => "tc" in k)) {
      const span = Number(attr(cell, "gridSpan")) || 1;
      const rowSpan = Number(attr(cell, "rowSpan")) || 1;
      const w = cols.slice(c, c + span).reduce((a, b) => a + b, 0) * sx;
      const h = heights.slice(r, r + rowSpan).reduce((a, b) => a + b, 0) * sy;
      const merged =
        attr(cell, "hMerge") === "1" || attr(cell, "vMerge") === "1";
      if (!merged) {
        const inner = kids(cell, "tc");
        const tcPr = find(inner, "tcPr");
        const prList = kids(tcPr, "tcPr");
        const style =
          styleOf([find(inner, "txBody") ?? { txBody: [] }], theme) ?? {};
        const fill = fillIn(prList, theme);
        if (fill) style.fill = fill;
        const anchor = attr(tcPr, "anchor");
        style.valign =
          anchor === "ctr" ? "middle" : anchor === "b" ? "bottom" : "top";
        const m = (k: string, d: number) => {
          const v = Number(attr(tcPr, k));
          return attr(tcPr, k) !== undefined && Number.isFinite(v) ? v : d;
        };
        style.inset = {
          l: m("marL", 91440),
          t: m("marT", 45720),
          r: m("marR", 91440),
          b: m("marB", 45720),
        };
        cells.push({
          id: `${id}-${r}-${c}`,
          name: "",
          descr: "",
          text: paragraphs(kids(find(inner, "txBody"), "txBody")),
          rect: { x, y, w, h },
          style,
        });
      }
      x += cols.slice(c, c + span).reduce((a, b) => a + b, 0) * sx;
      c += span;
    }
    y += heights[r] * sy;
  });
  return cells;
}

/** What parsePptx shares while it reads slides, layouts and masters. */
interface Reader {
  files: Record<string, Uint8Array>;
  slideNumbers: Map<string, number>;
  media: PptxDeck["media"];
  mediaSizes: Map<string, number>;
  pixels: Map<string, { width: number; height: number }>;
  /** Layouts and masters, each read once. */
  parts: Map<string, Part>;
}
interface Inherited {
  rect?: Rect;
  style?: PptxStyle;
}
/** A slide layout or slide master. */
interface Part {
  theme: Theme;
  /** Placeholders by "type:<type>" and "idx:<n>". */
  placeholders: Map<string, Inherited>;
  /** Pictures and shapes shown on every slide that uses this part. */
  decor: PptxElement[];
  background?: PptxSlide["background"];
  /** False when the part hides its master's pictures and shapes. */
  showMasterSp: boolean;
  /** A layout's master. */
  master?: Part;
  /** A master's default text look: titles, placeholders, other text boxes. */
  text?: Record<"title" | "body" | "other", PptxStyle>;
}

const mediaKind = (type: string): PptxMediaKind | undefined =>
  type === "image"
    ? "IMAGE"
    : type === "video" || type === "media"
      ? "VIDEO"
      : type === "audio"
        ? "AUDIO"
        : undefined;
const audioExt = /\.(mp3|wav|m4a|wma|aac|ogg)$/i;

function mediaUser(reader: Reader, rels: Map<string, Rel>) {
  return (relId: string | undefined, forced?: PptxMediaKind) => {
    const rel = relId ? rels.get(relId) : undefined;
    if (!rel || rel.external) return undefined;
    let kind = forced ?? mediaKind(rel.type);
    if (kind === "VIDEO" && audioExt.test(rel.target)) kind = "AUDIO";
    const size = reader.mediaSizes.get(rel.target);
    if (!kind || size === undefined) return undefined;
    reader.media[rel.target] = {
      kind,
      size,
      ...reader.pixels.get(rel.target),
    };
    return { path: rel.target, kind };
  };
}

const placeholderType = (type: string) =>
  type === "ctrTitle" ? "title" : type === "subTitle" ? "body" : type;
/** The placeholder a shape inherits from: by index, else by type. */
function lookUp(part: Part, type: string, idx: string | undefined) {
  return (
    (idx !== undefined ? part.placeholders.get(`idx:${idx}`) : undefined) ??
    part.placeholders.get(`type:${type}`) ??
    part.placeholders.get(`type:${placeholderType(type)}`)
  );
}

/**
 * The shapes of a slide, layout or master, back to front. `inherit` gives the
 * position and look a placeholder takes from the layout or master.
 */
function readShapes(
  reader: Reader,
  rels: Map<string, Rel>,
  theme: Theme,
  tree: XmlNode | undefined,
  inherit: (type: string, idx: string | undefined) => Inherited,
): PptxElement[] {
  const elements: PptxElement[] = [];
  const useMedia = mediaUser(reader, rels);
  const jumpOf = (nv: XmlNode | undefined, nvName: string) => {
    const click = find(
      kids(find(kids(nv, nvName), "cNvPr"), "cNvPr"),
      "hlinkClick",
    );
    if (!click || !attr(click, "action")?.includes("hlinksldjump"))
      return undefined;
    const rel = rels.get(attr(click, "id") ?? "");
    return rel ? reader.slideNumbers.get(rel.target) : undefined;
  };
  const base = (nv: XmlNode | undefined, nvName: string) => {
    const c = find(kids(nv, nvName), "cNvPr");
    return {
      id: attr(c, "id") ?? "",
      name: attr(c, "name") ?? "",
      descr: attr(c, "descr") ?? "",
    };
  };
  const placeholderOf = (nv: XmlNode | undefined, nvName: string) => {
    const ph = find(kids(find(kids(nv, nvName), "nvPr"), "nvPr"), "ph");
    return ph
      ? { type: attr(ph, "type") ?? "body", idx: attr(ph, "idx") }
      : undefined;
  };
  function walk(list: XmlNode[], t: Transform) {
    for (const node of list) {
      const tag = tagOf(node);
      const inner = kids(node, tag);
      if (tag === "AlternateContent") {
        const choice = find(inner, "Choice");
        walk(
          kids(
            choice ?? find(inner, "Fallback"),
            choice ? "Choice" : "Fallback",
          ),
          t,
        );
      } else if (tag === "grpSp") {
        walk(inner, groupTransform(node, t));
      } else if (tag === "sp" || tag === "cxnSp") {
        const nvName = tag === "sp" ? "nvSpPr" : "nvCxnSpPr";
        const nv = find(inner, nvName);
        const ph = placeholderOf(nv, nvName);
        const from = ph ? inherit(ph.type, ph.idx) : inherit("", undefined);
        const own = rectOf(find(inner, "spPr"));
        const rect = own ? t.apply(own) : from.rect;
        const fillPicture = descendants(
          kids(find(inner, "spPr"), "spPr"),
          "blip",
        )[0];
        const style = styleOf(inner, theme, from.style);
        elements.push({
          ...base(nv, nvName),
          ...(style ? { style } : {}),
          ...turnOf(find(inner, "spPr")),
          text: paragraphs(kids(find(inner, "txBody"), "txBody")),
          placeholder: ph?.type,
          ...(ph?.idx !== undefined ? { placeholderIdx: ph.idx } : {}),
          rect,
          image: useMedia(attr(fillPicture, "embed"), "IMAGE")?.path,
          jump: jumpOf(nv, nvName),
        });
      } else if (tag === "pic") {
        const nv = find(inner, "nvPicPr");
        const nvPr = kids(find(kids(nv, "nvPicPr"), "nvPr"), "nvPr");
        const video = find(nvPr, "videoFile");
        const audio = find(nvPr, "audioFile");
        const embedded = descendants(nvPr, "media")[0];
        const mediaRel =
          attr(embedded, "embed") ?? attr(video ?? audio, "link");
        const blipFill = find(inner, "blipFill");
        const blip = descendants(kids(blipFill, "blipFill"), "blip")[0];
        const ph = placeholderOf(nv, "nvPicPr");
        const own = rectOf(find(inner, "spPr"));
        const rect = own
          ? t.apply(own)
          : ph
            ? inherit(ph.type, ph.idx).rect
            : undefined;
        const crop = cropOf(blipFill);
        elements.push({
          ...base(nv, "nvPicPr"),
          ...turnOf(find(inner, "spPr")),
          ...(crop ? { crop } : {}),
          text: [],
          rect,
          image: useMedia(attr(blip, "embed"), "IMAGE")?.path,
          media:
            video || audio || embedded
              ? (useMedia(
                  mediaRel,
                  audio ? "AUDIO" : "VIDEO",
                ) as PptxElement["media"])
              : undefined,
          jump: jumpOf(nv, "nvPicPr"),
        });
      } else if (tag === "graphicFrame") {
        const nv = find(inner, "nvGraphicFramePr");
        const rect = rectOf(find(inner, "xfrm") ? node : undefined, tag);
        const placed = rect && t.apply(rect);
        const tbl = descendants(inner, "tbl")[0];
        const id = base(nv, "nvGraphicFramePr");
        elements.push({
          ...id,
          text: paragraphs(inner),
          rect: placed,
          ...(tbl && placed
            ? { cells: tableCells(tbl, placed, theme, id.id) }
            : {}),
        });
      }
    }
  }
  walk(tree ? kids(tree, "spTree") : [], identity);
  return elements;
}

/** A slide's, layout's or master's own background: a colour or a picture. */
function backgroundOf(
  reader: Reader,
  rels: Map<string, Rel>,
  theme: Theme,
  cSld: XmlNode | undefined,
): PptxSlide["background"] {
  const bg = find(kids(cSld, "cSld"), "bg");
  if (!bg) return undefined;
  const inner = kids(bg, "bg");
  const pr = find(inner, "bgPr");
  if (pr) {
    const list = kids(pr, "bgPr");
    const blip = descendants(
      kids(find(list, "blipFill"), "blipFill"),
      "blip",
    )[0];
    const image = blip
      ? mediaUser(reader, rels)(attr(blip, "embed"), "IMAGE")?.path
      : undefined;
    const color = fillIn(list, theme) ?? undefined;
    return image || color
      ? { ...(color ? { color } : {}), ...(image ? { image } : {}) }
      : undefined;
  }
  const ref = find(inner, "bgRef");
  const color = ref && colorIn(kids(ref, "bgRef"), theme);
  return color ? { color } : undefined;
}

function readTheme(files: Record<string, Uint8Array>, path: string): Theme {
  const theme: Theme = { colors: {} };
  if (!files[path]) return theme;
  const xml = parser.parse(strFromU8(files[path])) as XmlNode[];
  const scheme = descendants(xml, "clrScheme")[0];
  for (const c of kids(scheme, "clrScheme")) {
    const name = tagOf(c);
    if (name === "#text") continue;
    const color = colorIn(kids(c, name), theme);
    if (color) theme.colors[name] = color;
  }
  const fonts = descendants(xml, "fontScheme")[0];
  const face = (name: string) =>
    attr(
      find(kids(find(kids(fonts, "fontScheme"), name), name), "latin"),
      "typeface",
    ) || undefined;
  theme.major = face("majorFont");
  theme.minor = face("minorFont");
  return theme;
}

/** A master's default look of the first level of a text style. */
function textDefault(
  styles: XmlNode[],
  name: string,
  theme: Theme,
  font?: string,
): PptxStyle {
  const lvl1 = find(kids(find(styles, name), name), "lvl1pPr");
  const def = find(kids(lvl1, "lvl1pPr"), "defRPr");
  const list = kids(def, "defRPr");
  const style: PptxStyle = {};
  const sz = Number(attr(def, "sz"));
  if (sz > 0) style.size = sz / 100;
  if (attr(def, "b") === "1") style.bold = true;
  const color = colorIn(kids(find(list, "solidFill"), "solidFill"), theme);
  if (color) style.color = color;
  const face = fontOf(attr(find(list, "latin"), "typeface"), theme) ?? font;
  if (face) style.font = face;
  const algn = attr(lvl1, "algn");
  if (algn === "ctr") style.align = "center";
  else if (algn === "r") style.align = "right";
  return style;
}

/** Reads a slide layout and its master (each once). */
function readPart(reader: Reader, path: string): Part | undefined {
  const known = reader.parts.get(path);
  if (known) return known;
  if (!reader.files[path]) return undefined;
  const xml = parser.parse(strFromU8(reader.files[path])) as XmlNode[];
  const rels = readRels(reader.files, path);
  const isMaster = !!find(xml, "sldMaster");
  const top = find(xml, isMaster ? "sldMaster" : "sldLayout");
  const root = kids(top, isMaster ? "sldMaster" : "sldLayout");
  const relOf = (type: string) =>
    [...rels.values()].find((r) => r.type === type)?.target;
  const master = isMaster
    ? undefined
    : readPart(reader, relOf("slideMaster") ?? "");
  const theme = isMaster
    ? readTheme(reader.files, relOf("theme") ?? "")
    : (master?.theme ?? { colors: {} });
  const part: Part = {
    theme,
    placeholders: new Map(),
    decor: [],
    showMasterSp: attr(top, "showMasterSp") !== "0",
    master,
  };
  if (isMaster) {
    const styles = kids(find(root, "txStyles"), "txStyles");
    part.text = {
      title: textDefault(styles, "titleStyle", theme, theme.major),
      body: textDefault(styles, "bodyStyle", theme, theme.minor),
      other: textDefault(styles, "otherStyle", theme, theme.minor),
    };
  }
  const textOf = (type: string): PptxStyle => {
    const text = (master ?? part).text;
    if (!text) return {};
    return placeholderType(type) === "title" ? text.title : text.body;
  };
  const cSld = find(root, "cSld");
  const tree = find(kids(cSld, "cSld"), "spTree");
  const shapes = readShapes(reader, rels, theme, tree, (type) => {
    if (!type) return { style: (master ?? part).text?.other };
    const fromMaster = master && lookUp(master, type, undefined);
    return {
      rect: fromMaster?.rect,
      style: { ...textOf(type), ...fromMaster?.style },
    };
  });
  // Placeholders are only drawn when a slide fills them; everything else on
  // a layout or master shows on its slides as decoration.
  const tag = isMaster ? "m" : "l";
  for (const e of shapes) {
    if (e.placeholder) {
      const entry = { rect: e.rect, style: e.style };
      if (!part.placeholders.has(`type:${e.placeholder}`))
        part.placeholders.set(`type:${e.placeholder}`, entry);
      if (e.placeholderIdx !== undefined)
        part.placeholders.set(`idx:${e.placeholderIdx}`, entry);
    } else if (e.image || e.style?.fill || e.style?.line || e.text.length)
      part.decor.push({ ...e, id: `${tag}${e.id}`, jump: undefined });
  }
  part.background = backgroundOf(reader, rels, theme, cSld);
  reader.parts.set(path, part);
  return part;
}

function readSlide(reader: Reader, part: string, number: number): PptxSlide {
  const { files } = reader;
  const xml = parser.parse(strFromU8(files[part])) as XmlNode[];
  const rels = readRels(files, part);
  const sld = find(xml, "sld")!;
  const cSld = find(kids(sld, "sld"), "cSld");
  const tree = find(kids(cSld, "cSld"), "spTree");
  const layoutPath = [...rels.values()].find(
    (r) => r.type === "slideLayout",
  )?.target;
  const layout = layoutPath ? readPart(reader, layoutPath) : undefined;
  const master = layout?.master;
  const theme = layout?.theme ?? { colors: {} };
  const useMedia = mediaUser(reader, rels);
  const elements = readShapes(reader, rels, theme, tree, (type, idx) => {
    if (!type) return { style: master?.text?.other };
    const from =
      (layout && lookUp(layout, type, idx)) ??
      (master && lookUp(master, type, undefined));
    const text = master?.text;
    const fallback = text
      ? placeholderType(type) === "title"
        ? text.title
        : text.body
      : undefined;
    return { rect: from?.rect, style: from?.style ?? fallback };
  });
  const showMaster = attr(sld, "showMasterSp") !== "0";
  const decor = showMaster
    ? [
        ...(layout?.showMasterSp !== false ? (master?.decor ?? []) : []),
        ...(layout?.decor ?? []),
      ]
    : [];
  const background =
    backgroundOf(reader, rels, theme, cSld) ??
    layout?.background ??
    master?.background;

  // Click-triggered animations: each <p:cTn> started by onClick on a shape, and
  // the shapes its child timeline acts on (shown, hidden or played).
  const triggers: PptxTrigger[] = [];
  const timing = find(kids(sld, "sld"), "timing");
  for (const ctn of descendants(timing ? [timing] : [], "cTn")) {
    const list = kids(ctn, "cTn");
    const conds = descendants(
      kids(find(list, "stCondLst"), "stCondLst"),
      "cond",
    );
    const onClick = conds.find((c) => attr(c, "evt") === "onClick");
    const trigger =
      onClick && attr(descendants(kids(onClick, "cond"), "spTgt")[0], "spid");
    if (!trigger) continue;
    const targets = [
      ...new Set(
        descendants(kids(find(list, "childTnLst"), "childTnLst"), "spTgt")
          .map((s) => attr(s, "spid") ?? "")
          .filter((id) => id && id !== trigger),
      ),
    ];
    const known = triggers.find((x) => x.trigger === trigger);
    if (known) known.targets = [...new Set([...known.targets, ...targets])];
    else triggers.push({ trigger, targets });
  }

  // Entrance effects ("Xuất hiện", "Bay vào"...) of the normal click order;
  // effects inside an interactive (trigger) sequence were handled above.
  const appear = new Set<string>();
  (function entrances(list: XmlNode[], interactive: boolean) {
    for (const node of list) {
      const tag = tagOf(node);
      if (tag === "#text") continue;
      const inner = kids(node, tag);
      if (tag === "cTn") {
        const seq = attr(node, "nodeType") === "interactiveSeq";
        if (attr(node, "presetClass") === "entr" && !interactive && !seq)
          for (const t of descendants(inner, "spTgt")) {
            const id = attr(t, "spid");
            if (id) appear.add(id);
          }
        entrances(inner, interactive || seq);
      } else entrances(inner, interactive);
    }
  })(timing ? [timing] : [], false);
  const transitionSound = descendants(kids(sld, "sld"), "snd")[0];
  const sound = useMedia(attr(transitionSound, "embed"), "AUDIO")?.path;

  let notes: string[] = [];
  const notesRel = [...rels.values()].find((r) => r.type === "notesSlide");
  if (notesRel && files[notesRel.target]) {
    const nx = parser.parse(strFromU8(files[notesRel.target])) as XmlNode[];
    notes = descendants(nx, "sp")
      .filter((sp) =>
        descendants(kids(sp, "sp"), "ph").some(
          (ph) => attr(ph, "type") === "body",
        ),
      )
      .flatMap((sp) => paragraphs(kids(sp, "sp")));
  }
  return {
    number,
    hidden: attr(sld, "show") === "0",
    elements,
    notes,
    triggers,
    appear: [...appear],
    ...(sound ? { sound } : {}),
    ...(background ? { background } : {}),
    decor,
  };
}

export class PptxError extends Error {}

/** Parses slide structure. Media bytes are left in the ZIP; see readPptxParts. */
export function parsePptx(bytes: Uint8Array): PptxDeck {
  let files: Record<string, Uint8Array>;
  const mediaSizes = new Map<string, number>();
  try {
    // XML and relationship parts, plus pictures for their pixel size; videos
    // and sounds stay compressed until needed.
    files = unzipSync(bytes, {
      filter: (f) => {
        if (f.name.startsWith("ppt/media/"))
          mediaSizes.set(f.name, f.originalSize);
        return (
          /\.(xml|rels)$/i.test(f.name) ||
          (f.name.startsWith("ppt/media/") &&
            pictureExt.test(f.name) &&
            f.originalSize <= maxHeaderScan)
        );
      },
    });
  } catch {
    throw new PptxError("Tệp không phải PowerPoint (.pptx) hợp lệ.");
  }
  const presentation = "ppt/presentation.xml";
  if (!files[presentation])
    throw new PptxError("Tệp không phải PowerPoint (.pptx) hợp lệ.");
  const pres = parser.parse(strFromU8(files[presentation])) as XmlNode[];
  const root = kids(find(pres, "presentation"), "presentation");
  const size = find(root, "sldSz");
  const rels = readRels(files, presentation);
  const order = descendants(kids(find(root, "sldIdLst"), "sldIdLst"), "sldId")
    .map((s) => rels.get(attr(s, "id") ?? ""))
    .filter((r): r is Rel => !!r && !!files[r.target])
    .map((r) => r.target);
  const slideNumbers = new Map(order.map((p, i) => [p, i + 1]));
  const pixels = new Map<string, { width: number; height: number }>();
  for (const [name, data] of Object.entries(files))
    if (name.startsWith("ppt/media/")) {
      const size = imagePixels(data);
      if (size?.width && size.height) pixels.set(name, size);
      delete files[name];
    }
  const media: PptxDeck["media"] = {};
  const reader: Reader = {
    files,
    slideNumbers,
    media,
    mediaSizes,
    pixels,
    parts: new Map(),
  };
  const slides = order.map((part, i) => readSlide(reader, part, i + 1));
  return {
    width: Number(attr(size, "cx") ?? 12192000),
    height: Number(attr(size, "cy") ?? 6858000),
    slides,
    media,
  };
}

/** Extracts the bytes of the given parts (pictures, videos) from the PowerPoint. */
export function readPptxParts(bytes: Uint8Array, paths: string[]) {
  const wanted = new Set(paths);
  return unzipSync(bytes, { filter: (f) => wanted.has(f.name) });
}
