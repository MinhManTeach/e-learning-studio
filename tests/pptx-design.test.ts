// The slide's design as PowerPoint shows it: master and layout pictures and
// frames, backgrounds, theme colours and fonts, inherited placeholders, and
// cropped or turned pictures.
import { expect, it } from "vitest";
import { parsePptx } from "../src/import/pptx/parse";
import { analyzeDeck } from "../src/import/pptx/analyze";
import { buildPptx, pngBytes } from "./support/pptxFixture";

const ns =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const relsOf = (items: [string, string, string][]) =>
  `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items
    .map(
      ([id, type, target]) =>
        `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`,
    )
    .join("")}</Relationships>`;
const tree = (shapes: string) =>
  `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld>`;
const xfrm = (x: number, y: number, w: number, h: number, extra = "") =>
  `<a:xfrm${extra}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;

const theme = `<?xml version="1.0" encoding="UTF-8"?><a:theme ${ns} name="T"><a:themeElements><a:clrScheme name="C"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F3864"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1></a:clrScheme><a:fontScheme name="F"><a:majorFont><a:latin typeface="Cambria"/></a:majorFont><a:minorFont><a:latin typeface="Nunito"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`;

// Master: a picture over the whole slide and a white rounded frame with a
// dotted outline in a darker shade of light 2 (as in "Trước cổng trời").
const master = `<?xml version="1.0" encoding="UTF-8"?><p:sldMaster ${ns}>${tree(
  `<p:pic><p:nvPicPr><p:cNvPr id="3" name="Nền"/><p:cNvPicPr/><p:nvPr userDrawn="1"/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(0, 0, 12192000, 6858000)}<a:prstGeom prst="rect"/></p:spPr></p:pic>` +
    `<p:sp><p:nvSpPr><p:cNvPr id="4" name="Khung"/><p:cNvSpPr/><p:nvPr userDrawn="1"/></p:nvSpPr><p:spPr>${xfrm(381000, 304800, 11430000, 6248400)}<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="19050"><a:solidFill><a:schemeClr val="bg2"><a:lumMod val="25000"/></a:schemeClr></a:solidFill><a:prstDash val="sysDot"/></a:ln></p:spPr></p:sp>` +
    `<p:sp><p:nvSpPr><p:cNvPr id="5" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(838200, 365125, 10515600, 1325563)}</p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:p><a:r><a:t>Mẫu tiêu đề</a:t></a:r></a:p></p:txBody></p:sp>`,
)}<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;

const layout = (hideMaster = false, bg = "") =>
  `<?xml version="1.0" encoding="UTF-8"?><p:sldLayout ${ns}${hideMaster ? ' showMasterSp="0"' : ""}>${tree(
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(609600, 457200, 10972800, 914400)}</p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:t>Tiêu đề</a:t></a:r></a:p></p:txBody></p:sp>`,
  ).replace("<p:cSld>", `<p:cSld>${bg}`)}</p:sldLayout>`;

function deckWith(shapes: string[], { hideMaster = false, bg = "" } = {}) {
  return parsePptx(
    buildPptx(
      [
        {
          shapes,
          rels: {
            rIdL: {
              type: "slideLayout",
              target: "../slideLayouts/slideLayout1.xml",
            },
            rIdP: { type: "image", target: "../media/photo.png" },
          },
        },
      ],
      { "frame.png": pngBytes, "photo.png": pngBytes },
      {
        "ppt/slideLayouts/slideLayout1.xml": layout(hideMaster, bg),
        "ppt/slideLayouts/_rels/slideLayout1.xml.rels": relsOf([
          ["rIdM", "slideMaster", "../slideMasters/slideMaster1.xml"],
        ]),
        "ppt/slideMasters/slideMaster1.xml": master,
        "ppt/slideMasters/_rels/slideMaster1.xml.rels": relsOf([
          ["rIdT", "theme", "../theme/theme1.xml"],
          ["rIdImg", "image", "../media/frame.png"],
        ]),
        "ppt/theme/theme1.xml": theme,
      },
    ),
  );
}

const title = `<p:sp><p:nvSpPr><p:cNvPr id="9" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="vi-VN"/><a:t>Trước cổng trời</a:t></a:r></a:p></p:txBody></p:sp>`;

it("shows the master's picture and frame behind the slide, in theme colours", () => {
  const slide = deckWith([title]).slides[0];
  expect(slide.decor.map((e) => e.image ?? e.name)).toEqual([
    "ppt/media/frame.png",
    "Khung",
  ]);
  const frame = slide.decor[1].style!;
  expect(frame.fill).toBe("#ffffff");
  expect(frame.radius).toBeCloseTo(0.16667, 4);
  // bg2 (light 2, #e7e6e6) at 25% luminance, dotted.
  expect(frame.line).toEqual({ color: "#3b3838", width: 19050, dash: true });
});

it("lets a layout hide its master's pictures", () => {
  expect(deckWith([title], { hideMaster: true }).slides[0].decor).toEqual([]);
});

it("gives a placeholder its layout's place and its master's title look", () => {
  const e = deckWith([title]).slides[0].elements[0];
  expect(e.rect).toEqual({ x: 609600, y: 457200, w: 10972800, h: 914400 });
  expect(e.style).toMatchObject({
    size: 44,
    color: "#1f3864",
    font: "Cambria",
    valign: "middle",
  });
});

it("reads a background colour from the layout", () => {
  const bg = `<p:bg><p:bgPr><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:bgPr></p:bg>`;
  const deck = deckWith([title], { bg });
  expect(deck.slides[0].background).toEqual({ color: "#4472c4" });
  const page = analyzeDeck(deck).pages[0];
  expect(page.kind === "PAGE" && page.original?.background).toBe("#4472c4");
});

it("keeps a picture's crop and turn, and draws the design first, locked", () => {
  const photo = `<p:pic><p:nvPicPr><p:cNvPr id="7" name="Ảnh"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdP"/><a:srcRect l="10000" t="20000" r="5000"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(6096000, 1714500, 3048000, 3429000, ' rot="900000" flipH="1"')}<a:prstGeom prst="rect"/></p:spPr></p:pic>`;
  const deck = deckWith([title, photo]);
  expect(deck.slides[0].elements[1]).toMatchObject({
    crop: { l: 0.1, t: 0.2, r: 0.05, b: 0 },
    rotate: 15,
    flipH: true,
  });
  const page = analyzeDeck(deck).pages[0];
  const items = page.kind === "PAGE" ? page.original!.items : [];
  expect(items.map((i) => [i.kind, !!i.locked])).toEqual([
    ["IMAGE", true],
    ["TEXT", true],
    ["TEXT", false],
    ["IMAGE", false],
  ]);
  expect(items[3]).toMatchObject({
    x: 50,
    y: 25,
    w: 25,
    h: 50,
    rotate: 15,
    flipH: true,
    crop: { l: 0.1, t: 0.2, r: 0.05, b: 0 },
  });
  // The frame: rounded corners and a dotted outline, in percent of the width.
  expect(items[1]).toMatchObject({ fill: "#ffffff", line: { dash: true } });
  expect(items[1].radius).toBeGreaterThan(0);
  // The title: Cambria, centred top to bottom, PowerPoint's inner margins.
  expect(items[2]).toMatchObject({
    font: "Cambria",
    valign: "middle",
    pad: [0.38, 0.75, 0.38, 0.75],
  });
});

it("draws a custom shape as an SVG path", () => {
  const blob = `<p:sp><p:nvSpPr><p:cNvPr id="8" name="Mây"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, 1219200, 685800)}<a:custGeom><a:pathLst><a:path w="100" h="50"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="100" y="0"/></a:lnTo><a:cubicBezTo><a:pt x="100" y="25"/><a:pt x="50" y="50"/><a:pt x="0" y="50"/></a:cubicBezTo><a:close/></a:path></a:pathLst></a:custGeom><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="60000"/><a:lumOff val="40000"/></a:schemeClr></a:solidFill></p:spPr></p:sp>`;
  const style = deckWith([blob]).slides[0].elements[0].style!;
  expect(style.path).toBe("M0 0L1000 0C1000 500 500 1000 0 1000Z");
  // PowerPoint's "Accent 1, lighter 40%".
  expect(style.fill).toBe("#8faadc");
});

it("draws a table cell by cell, with each cell's fill and text", () => {
  const table = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="20" name="Bảng"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="1219200" y="685800"/><a:ext cx="6096000" cy="1371600"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblGrid><a:gridCol w="2032000"/><a:gridCol w="4064000"/></a:tblGrid><a:tr h="685800"><a:tc gridSpan="2"><a:txBody><a:bodyPr/><a:p><a:pPr algn="just"/><a:r><a:t>Giải nghĩa từ</a:t></a:r></a:p></a:txBody><a:tcPr anchor="ctr"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:tcPr></a:tc><a:tc hMerge="1"><a:txBody><a:bodyPr/><a:p/></a:txBody><a:tcPr/></a:tc></a:tr><a:tr h="685800"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>nguyên sơ</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>như lúc ban đầu</a:t></a:r></a:p></a:txBody><a:tcPr><a:solidFill><a:srgbClr val="D6EDE4"/></a:solidFill></a:tcPr></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  const deck = deckWith([table]);
  const cells = deck.slides[0].elements[0].cells!;
  expect(
    cells.map((c) => [c.text.join(""), c.rect, c.style?.fill ?? null]),
  ).toEqual([
    [
      "Giải nghĩa từ",
      { x: 1219200, y: 685800, w: 6096000, h: 685800 },
      "#4472c4",
    ],
    ["nguyên sơ", { x: 1219200, y: 1371600, w: 2032000, h: 685800 }, null],
    [
      "như lúc ban đầu",
      { x: 3251200, y: 1371600, w: 4064000, h: 685800 },
      "#d6ede4",
    ],
  ]);
  expect(cells[0].style).toMatchObject({ valign: "middle", align: "justify" });
  // The page draws the cells, not one box with all the table's words.
  const page = analyzeDeck(deck).pages[0];
  const own =
    page.kind === "PAGE" ? page.original!.items.filter((i) => !i.locked) : [];
  expect(own.map((i) => i.text.join(""))).toEqual([
    "Giải nghĩa từ",
    "nguyên sơ",
    "như lúc ban đầu",
  ]);
});
