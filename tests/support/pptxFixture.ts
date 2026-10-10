// Builds small but structurally real .pptx files for import tests.
import { strToU8, zipSync, type Zippable } from "fflate";

const W = 12192000;
const H = 6858000;
export interface Box {
  x: number; // percent of slide width
  y: number;
  w: number;
  h: number;
}
const emu = (b: Box) =>
  `<a:xfrm><a:off x="${Math.round((b.x * W) / 100)}" y="${Math.round((b.y * H) / 100)}"/><a:ext cx="${Math.round((b.w * W) / 100)}" cy="${Math.round((b.h * H) / 100)}"/></a:xfrm>`;
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface SlideSpec {
  hidden?: boolean;
  /** Raw shape XML from the helpers below. */
  shapes: string[];
  /** rId -> target (e.g. "../media/image1.png" or "slide3.xml"). */
  rels?: Record<string, { type: string; target: string }>;
  /** onClick triggers: trigger shape id -> animated/played shape ids. */
  triggers?: Record<string, string[]>;
  notes?: string;
}
export const text = (
  id: number,
  lines: string[] | string,
  box: Box,
  opts: { name?: string; jump?: string; title?: boolean } = {},
) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${opts.name ?? `TextBox ${id}`}">${
    opts.jump
      ? `<a:hlinkClick r:id="${opts.jump}" action="ppaction://hlinksldjump"/>`
      : ""
  }</p:cNvPr><p:cNvSpPr/><p:nvPr>${opts.title ? '<p:ph type="title"/>' : ""}</p:nvPr></p:nvSpPr><p:spPr>${emu(box)}</p:spPr><p:txBody><a:bodyPr/>${(Array.isArray(
    lines,
  )
    ? lines
    : [lines]
  )
    .map((l) => `<a:p><a:r><a:t>${esc(l)}</a:t></a:r></a:p>`)
    .join("")}</p:txBody></p:sp>`;
export const picture = (
  id: number,
  image: string,
  box: Box,
  opts: {
    name?: string;
    media?: { rId: string; kind: "video" | "audio" };
  } = {},
) =>
  `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${opts.name ?? `Picture ${id}`}"/><p:cNvPicPr/><p:nvPr>${
    opts.media ? `<a:${opts.media.kind}File r:link="${opts.media.rId}"/>` : ""
  }</p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="${image}"/></p:blipFill><p:spPr>${emu(box)}</p:spPr></p:pic>`;
export const group = (box: Box, inner: string[]) =>
  `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="900" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${Math.round((box.x * W) / 100)}" y="${Math.round((box.y * H) / 100)}"/><a:ext cx="${Math.round((box.w * W) / 100)}" cy="${Math.round((box.h * H) / 100)}"/><a:chOff x="0" y="0"/><a:chExt cx="${W}" cy="${H}"/></a:xfrm></p:grpSpPr>${inner.join("")}</p:grpSp>`;

function timing(triggers: Record<string, string[]>) {
  const pars = Object.entries(triggers)
    .map(
      ([trigger, targets]) =>
        `<p:par><p:cTn id="1" fill="hold"><p:stCondLst><p:cond evt="onClick" delay="0"><p:tgtEl><p:spTgt spid="${trigger}"/></p:tgtEl></p:cond></p:stCondLst><p:childTnLst>${targets
          .map(
            (t) =>
              `<p:par><p:cTn id="2"><p:childTnLst><p:set><p:cBhvr><p:cTn id="3"/><p:tgtEl><p:spTgt spid="${t}"/></p:tgtEl></p:cBhvr></p:set></p:childTnLst></p:cTn></p:par>`,
          )
          .join("")}</p:childTnLst></p:cTn></p:par>`,
    )
    .join("");
  return `<p:timing><p:tnLst>${pars}</p:tnLst></p:timing>`;
}

const ns =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const rel = (id: string, type: string, target: string, external = false) =>
  `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"${external ? ' TargetMode="External"' : ""}/>`;
const rels = (items: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.join("")}</Relationships>`;

/** A 1×1 PNG and a tiny MP4/WAV header are enough: the parser only records parts. */
export const pngBytes = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
]);
/** A PNG header for a width × height picture, padded to `size` bytes (detail = size / pixels). */
export function pngOfSize(width: number, height: number, size: number) {
  const b = new Uint8Array(Math.max(size, 33));
  b.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}
export const mp4Bytes = new Uint8Array([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0,
]);
export const wavBytes = strToU8("RIFF\0\0\0\0WAVEfmt ");

export function buildPptx(
  slides: SlideSpec[],
  media: Record<string, Uint8Array>,
): Uint8Array {
  const files: Zippable = {};
  files["ppt/presentation.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><p:presentation ${ns}><p:sldIdLst>${slides
      .map((_, i) => `<p:sldId id="${256 + i}" r:id="rIdS${i + 1}"/>`)
      .join("")}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/></p:presentation>`,
  );
  files["ppt/_rels/presentation.xml.rels"] = strToU8(
    rels(
      slides.map((_, i) =>
        rel(`rIdS${i + 1}`, "slide", `slides/slide${i + 1}.xml`),
      ),
    ),
  );
  slides.forEach((s, i) => {
    const n = i + 1;
    files[`ppt/slides/slide${n}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><p:sld ${ns}${s.hidden ? ' show="0"' : ""}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${s.shapes.join("")}</p:spTree></p:cSld>${s.triggers ? timing(s.triggers) : ""}</p:sld>`,
    );
    const items = Object.entries(s.rels ?? {}).map(([id, r]) =>
      rel(id, r.type, r.target),
    );
    if (s.notes) {
      items.push(
        rel("rIdN", "notesSlide", `../notesSlides/notesSlide${n}.xml`),
      );
      files[`ppt/notesSlides/notesSlide${n}.xml`] = strToU8(
        `<?xml version="1.0" encoding="UTF-8"?><p:notes ${ns}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:p><a:r><a:t>${esc(s.notes)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
      );
    }
    files[`ppt/slides/_rels/slide${n}.xml.rels`] = strToU8(rels(items));
  });
  for (const [name, bytes] of Object.entries(media))
    files[`ppt/media/${name}`] = bytes;
  return zipSync(files);
}
