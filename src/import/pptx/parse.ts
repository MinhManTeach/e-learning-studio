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
  rect?: Rect;
  /** Picture shown by this element (zip path, e.g. "ppt/media/image3.png"). */
  image?: string;
  /** Video or sound played by this element. */
  media?: { path: string; kind: "VIDEO" | "AUDIO" };
  /** 1-based slide number this element jumps to when clicked. */
  jump?: number;
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
}
export interface PptxDeck {
  width: number;
  height: number;
  slides: PptxSlide[];
  /** Every media part referenced by a slide, with its size in bytes. */
  media: Record<string, { kind: PptxMediaKind; size: number }>;
}

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
function path(list: XmlNode[], ...names: string[]): XmlNode | undefined {
  let current: XmlNode | undefined;
  let level = list;
  for (const name of names) {
    current = find(level, name);
    if (!current) return undefined;
    level = kids(current, name);
  }
  return current;
}
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

const mediaKind = (type: string): PptxMediaKind | undefined =>
  type === "image"
    ? "IMAGE"
    : type === "video" || type === "media"
      ? "VIDEO"
      : type === "audio"
        ? "AUDIO"
        : undefined;
const audioExt = /\.(mp3|wav|m4a|wma|aac|ogg)$/i;

function readSlide(
  files: Record<string, Uint8Array>,
  part: string,
  number: number,
  slideNumbers: Map<string, number>,
  media: PptxDeck["media"],
  mediaSizes: Map<string, number>,
): PptxSlide {
  const xml = parser.parse(strFromU8(files[part])) as XmlNode[];
  const rels = readRels(files, part);
  const sld = find(xml, "sld")!;
  const tree = path(kids(sld, "sld"), "cSld", "spTree");
  const elements: PptxElement[] = [];
  const useMedia = (relId: string | undefined, forced?: PptxMediaKind) => {
    const rel = relId ? rels.get(relId) : undefined;
    if (!rel || rel.external) return undefined;
    let kind = forced ?? mediaKind(rel.type);
    if (kind === "VIDEO" && audioExt.test(rel.target)) kind = "AUDIO";
    const size = mediaSizes.get(rel.target);
    if (!kind || size === undefined) return undefined;
    media[rel.target] = { kind, size };
    return { path: rel.target, kind };
  };
  const jumpOf = (nv: XmlNode | undefined, nvName: string) => {
    const click = find(
      kids(find(kids(nv, nvName), "cNvPr"), "cNvPr"),
      "hlinkClick",
    );
    if (!click || !attr(click, "action")?.includes("hlinksldjump"))
      return undefined;
    const rel = rels.get(attr(click, "id") ?? "");
    return rel ? slideNumbers.get(rel.target) : undefined;
  };
  const base = (nv: XmlNode | undefined, nvName: string) => {
    const c = find(kids(nv, nvName), "cNvPr");
    return {
      id: attr(c, "id") ?? "",
      name: attr(c, "name") ?? "",
      descr: attr(c, "descr") ?? "",
    };
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
        const nv = find(inner, "nvSpPr");
        const ph = find(kids(find(kids(nv, "nvSpPr"), "nvPr"), "nvPr"), "ph");
        const rect = rectOf(find(inner, "spPr"));
        const fillPicture = descendants(
          kids(find(inner, "spPr"), "spPr"),
          "blip",
        )[0];
        elements.push({
          ...base(nv, "nvSpPr"),
          text: paragraphs(kids(find(inner, "txBody"), "txBody")),
          placeholder: ph ? (attr(ph, "type") ?? "body") : undefined,
          rect: rect && t.apply(rect),
          image: useMedia(attr(fillPicture, "embed"), "IMAGE")?.path,
          jump: jumpOf(nv, "nvSpPr"),
        });
      } else if (tag === "pic") {
        const nv = find(inner, "nvPicPr");
        const nvPr = kids(find(kids(nv, "nvPicPr"), "nvPr"), "nvPr");
        const video = find(nvPr, "videoFile");
        const audio = find(nvPr, "audioFile");
        const embedded = descendants(nvPr, "media")[0];
        const mediaRel =
          attr(embedded, "embed") ?? attr(video ?? audio, "link");
        const blip = descendants(
          kids(find(inner, "blipFill"), "blipFill"),
          "blip",
        )[0];
        const rect = rectOf(find(inner, "spPr"));
        elements.push({
          ...base(nv, "nvPicPr"),
          text: [],
          rect: rect && t.apply(rect),
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
        elements.push({
          ...base(nv, "nvGraphicFramePr"),
          text: paragraphs(inner),
          rect: rect && t.apply(rect),
        });
      }
    }
  }
  walk(tree ? kids(tree, "spTree") : [], identity);

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
  };
}

export class PptxError extends Error {}

/** Parses slide structure. Media bytes are left in the ZIP; see readPptxParts. */
export function parsePptx(bytes: Uint8Array): PptxDeck {
  let files: Record<string, Uint8Array>;
  const mediaSizes = new Map<string, number>();
  try {
    // XML and relationship parts only; media stays compressed until needed.
    files = unzipSync(bytes, {
      filter: (f) => {
        if (f.name.startsWith("ppt/media/"))
          mediaSizes.set(f.name, f.originalSize);
        return /\.(xml|rels)$/i.test(f.name);
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
  const media: PptxDeck["media"] = {};
  const slides = order.map((part, i) =>
    readSlide(files, part, i + 1, slideNumbers, media, mediaSizes),
  );
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
