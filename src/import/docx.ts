import { unzipSync, strFromU8 } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { LessonDocumentBlock } from "./model";
import type { DocxImagePlacement, DocxMediaAsset } from "./mediaModel";
import { detectImageMime, maxImageBytes } from "../media/storage";

type XmlNode = { [key: string]: XmlNode[] | string | Record<string, string> };
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: false,
});
const children = (node: XmlNode, name: string): XmlNode[] =>
  Array.isArray(node[name]) ? (node[name] as XmlNode[]) : [];
const nodes = (list: XmlNode[], name: string) => list.filter((n) => name in n);
const first = (list: XmlNode[], name: string) => nodes(list, name)[0];
const attr = (node: XmlNode | undefined, name: string) =>
  node ? (node[":@"] as Record<string, string> | undefined)?.[name] : undefined;
function descendants(list: XmlNode[], name: string): XmlNode[] {
  return list.flatMap((n) => [
    ...(name in n ? [n] : []),
    ...Object.entries(n)
      .filter(([k, v]) => k !== ":@" && Array.isArray(v))
      .flatMap(([, v]) => descendants(v as XmlNode[], name)),
  ]);
}
// Word may carry a DrawingML image and a VML fallback for the same placement.
// Traverse the selected representation in document order; deleted content is not visible.
function imageReferences(list: XmlNode[]): string[] {
  return list.flatMap((node) => {
    if ("del" in node) return [];
    if ("AlternateContent" in node) {
      const alternatives = children(node, "AlternateContent");
      const choice = first(alternatives, "Choice");
      const fallback = first(alternatives, "Fallback");
      return choice && descendants(children(choice, "Choice"), "blip").length
        ? imageReferences(children(choice, "Choice"))
        : imageReferences(children(fallback ?? {}, "Fallback"));
    }
    if ("blip" in node) {
      const id = attr(node, "embed") ?? attr(node, "link");
      return id ? [id] : [];
    }
    if ("imagedata" in node) {
      const id = attr(node, "id");
      return id ? [id] : [];
    }
    return Object.entries(node)
      .filter(([k, v]) => k !== ":@" && Array.isArray(v))
      .flatMap(([, v]) => imageReferences(v as XmlNode[]));
  });
}
function xmlText(list: XmlNode[]): string {
  return list
    .map((n) => {
      if ("#text" in n) return String(n["#text"]);
      if ("tab" in n) return "\t";
      if ("br" in n || "cr" in n) return "\n";
      if ("del" in n || "instrText" in n || "txbxContent" in n) return "";
      return Object.entries(n)
        .filter(([k, v]) => k !== ":@" && Array.isArray(v))
        .map(([, v]) => xmlText(v as XmlNode[]))
        .join("");
    })
    .join("");
}
function readXml(value: string): XmlNode[] {
  if (
    /<!DOCTYPE|<!ENTITY/i.test(value) ||
    XMLValidator.validate(value) !== true
  )
    throw new Error(
      "DOCX chứa XML không hợp lệ hoặc khai báo không được hỗ trợ.",
    );
  return parser.parse(value) as XmlNode[];
}
function roman(value: number) {
  const pairs: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let result = "";
  for (const [n, s] of pairs)
    while (value >= n) {
      result += s;
      value -= n;
    }
  return result;
}
export function extractDocx(bytes: Uint8Array): {
  blocks: LessonDocumentBlock[];
  rawText: string;
  warnings: string[];
  imagePlacements: DocxImagePlacement[];
  mediaAssets: DocxMediaAsset[];
} {
  const wanted = new Set([
    "word/document.xml",
    "word/styles.xml",
    "word/numbering.xml",
    "word/_rels/document.xml.rels",
    "[Content_Types].xml",
  ]);
  let total = 0;
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(bytes, {
      filter: (entry) => {
        if (!wanted.has(entry.name) && !/^word\/media\/[^/]+$/.test(entry.name))
          return false;
        total += entry.originalSize;
        if (total > 20 * 1024 * 1024) throw new Error("expanded limit");
        return true;
      },
    });
  } catch {
    throw new Error(
      "Không đọc được DOCX hoặc nội dung giải nén quá lớn. Hãy lưu lại tệp Word không mã hóa.",
    );
  }
  if (!zip["word/document.xml"])
    throw new Error("Tệp không phải DOCX hợp lệ: thiếu word/document.xml.");
  const doc = readXml(strFromU8(zip["word/document.xml"]));
  const styles = zip["word/styles.xml"]
    ? readXml(strFromU8(zip["word/styles.xml"]))
    : [];
  const numbering = zip["word/numbering.xml"]
    ? readXml(strFromU8(zip["word/numbering.xml"]))
    : [];
  const warnings: string[] = [];
  const blocks: LessonDocumentBlock[] = [];
  const imagePlacements: DocxImagePlacement[] = [];
  const mediaAssets: DocxMediaAsset[] = [];
  const relationships = zip["word/_rels/document.xml.rels"]
    ? descendants(
        readXml(strFromU8(zip["word/_rels/document.xml.rels"])),
        "Relationship",
      )
    : [];
  const types = zip["[Content_Types].xml"]
    ? readXml(strFromU8(zip["[Content_Types].xml"]))
    : [];
  function collectImages(
    paragraphs: XmlNode[],
    blockId: string,
    sourceOrder: number,
    row?: number,
    column?: number,
    onlyIndex?: number,
  ) {
    paragraphs.forEach((p, paragraphIndex) => {
      if (onlyIndex !== undefined && paragraphIndex !== onlyIndex) return;
      const body = children(p, "p");
      const references = imageReferences(body);
      for (const relationshipId of references) {
        if (imagePlacements.length >= 128)
          throw new Error("DOCX có quá nhiều vị trí ảnh (tối đa 128).");
        const relation = relationships.find(
          (n) => attr(n, "Id") === relationshipId,
        );
        const target = attr(relation, "Target") ?? "";
        const path = "word/" + target.replace(/^\.\//, "");
        const safe =
          attr(relation, "TargetMode") !== "External" &&
          /\/image$/.test(attr(relation, "Type") ?? "") &&
          /^word\/media\/[^/\\]+$/.test(path) &&
          !target.includes("..");
        const binary = safe ? zip[path] : undefined;
        const contentType =
          attr(
            descendants(types, "Override").find(
              (n) => attr(n, "PartName") === "/" + path,
            ),
            "ContentType",
          ) ??
          attr(
            descendants(types, "Default").find(
              (n) =>
                attr(n, "Extension")?.toLowerCase() ===
                path.split(".").at(-1)?.toLowerCase(),
            ),
            "ContentType",
          ) ??
          "";
        let status: DocxImagePlacement["status"] = !safe
          ? "UNSUPPORTED"
          : !binary
            ? "MISSING"
            : "VALID";
        if (binary) {
          if (!["image/png", "image/jpeg", "image/webp"].includes(contentType))
            status = "UNSUPPORTED";
          else if (
            !binary.length ||
            binary.length > maxImageBytes ||
            detectImageMime(binary) !== contentType
          )
            throw new Error("Ảnh DOCX có MIME hoặc định dạng không hợp lệ.");
          if (status === "VALID" && !mediaAssets.some((a) => a.id === path))
            mediaAssets.push({ id: path, path, contentType, bytes: binary });
        }
        const nearby = paragraphs
          .slice(Math.max(0, paragraphIndex - 2), paragraphIndex + 3)
          .map((n) => xmlText(children(n, "p")).trim())
          .filter(Boolean);
        const props = descendants(body, "docPr")[0];
        imagePlacements.push({
          id: "image-placement-" + (imagePlacements.length + 1),
          relationshipId,
          mediaId: status === "VALID" ? path : undefined,
          status,
          blockId,
          sourceOrder,
          row,
          column,
          paragraphIndex,
          imageOrder: imagePlacements.length,
          nearbyText: nearby.join("\n"),
          altText: attr(props, "descr") ?? attr(props, "title") ?? "",
          caption: nearby.find((t) => /^(Hình|Figure)\s*\d/i.test(t)) ?? "",
        });
        if (status !== "VALID")
          warnings.push(
            "Ảnh " +
              relationshipId +
              ": " +
              status +
              "; cần giáo viên kiểm tra.",
          );
      }
    });
  }
  const styleMap = new Map(
    descendants(styles, "style").map((s) => [attr(s, "styleId"), s]),
  );
  const numMap = new Map(
    descendants(numbering, "num").map((n) => [attr(n, "numId"), n]),
  );
  const abstractMap = new Map(
    descendants(numbering, "abstractNum").map((n) => [
      attr(n, "abstractNumId"),
      n,
    ]),
  );
  const counters = new Map<string, number[]>();
  function styleProps(
    styleId: string | undefined,
    seen = new Set<string>(),
  ): XmlNode[] {
    if (!styleId || seen.has(styleId)) return [];
    seen.add(styleId);
    const style = styleMap.get(styleId);
    if (!style) return [];
    const body = children(style, "style");
    return [
      ...children(first(body, "pPr") ?? {}, "pPr"),
      ...styleProps(attr(first(body, "basedOn"), "val"), seen),
    ];
  }
  function paragraph(p: XmlNode) {
    const body = children(p, "p");
    const pp = children(first(body, "pPr") ?? {}, "pPr");
    const style = attr(first(pp, "pStyle"), "val");
    const props = [...pp, ...styleProps(style)];
    const outline = attr(first(props, "outlineLvl"), "val");
    const styleLevel = style?.match(/(?:heading|tieu.?de)([1-9])/i)?.[1];
    const level =
      outline !== undefined && Number(outline) < 9
        ? Number(outline) + 1
        : styleLevel
          ? Number(styleLevel)
          : undefined;
    let text = xmlText(body).trim();
    const numPr = children(first(props, "numPr") ?? {}, "numPr");
    const numId = attr(first(numPr, "numId"), "val");
    let marker: string | undefined;
    if (numId && numId !== "0") {
      const ilvl = Number(attr(first(numPr, "ilvl"), "val") ?? 0);
      const num = numMap.get(numId);
      const abId = attr(
        first(children(num ?? {}, "num"), "abstractNumId"),
        "val",
      );
      const abstract = abstractMap.get(abId);
      const levels = nodes(children(abstract ?? {}, "abstractNum"), "lvl");
      const lvl = levels.find((n) => Number(attr(n, "ilvl")) === ilvl);
      const levelBody = children(lvl ?? {}, "lvl");
      const format = attr(first(levelBody, "numFmt"), "val") ?? "decimal";
      const start = Number(attr(first(levelBody, "start"), "val") ?? 1);
      const values = counters.get(numId) ?? [];
      values[ilvl] = (values[ilvl] ?? start - 1) + 1;
      values.length = ilvl + 1;
      counters.set(numId, values);
      const template = attr(first(levelBody, "lvlText"), "val") ?? "%1.";
      marker =
        format === "bullet"
          ? "•"
          : template.replace(/%(\d)/g, (_, digit) => {
              const index = Number(digit) - 1,
                value = values[index] ?? 1;
              const f =
                attr(
                  first(
                    children(
                      levels.find((n) => Number(attr(n, "ilvl")) === index) ??
                        {},
                      "lvl",
                    ),
                    "numFmt",
                  ),
                  "val",
                ) ?? format;
              return /Roman/.test(f)
                ? f === "lowerRoman"
                  ? roman(value).toLowerCase()
                  : roman(value)
                : /Letter/.test(f)
                  ? String.fromCharCode(
                      (f === "lowerLetter" ? 97 : 65) + ((value - 1) % 26),
                    )
                  : String(value);
            });
      text = `${marker} ${text}`;
      if (nodes(children(num ?? {}, "num"), "lvlOverride").length)
        warnings.push(
          "Danh sách có đặt lại số thứ tự riêng; cần đối chiếu số hiển thị trong Word.",
        );
    }
    return { text, level, marker, isList: !!numId && numId !== "0" };
  }
  function add(block: Omit<LessonDocumentBlock, "id" | "sourceOrder">) {
    blocks.push({
      ...block,
      id: `block-${blocks.length + 1}`,
      sourceOrder: blocks.length,
    });
  }
  function table(tbl: XmlNode) {
    const rows: NonNullable<LessonDocumentBlock["table"]>["rows"] = [];
    const active = new Map<
      number,
      {
        text: string;
        colspan?: number;
        rowspan?: number;
        column?: number;
        paragraphs?: string[];
      }
    >();
    for (const tr of nodes(children(tbl, "tbl"), "tr")) {
      const cells: (typeof rows)[number]["cells"] = [];
      const trBody = children(tr, "tr");
      let column = Number(
        attr(
          first(children(first(trBody, "trPr") ?? {}, "trPr"), "gridBefore"),
          "val",
        ) ?? 0,
      );
      const continued = new Set<number>();
      for (const tc of nodes(trBody, "tc")) {
        const tcBody = children(tc, "tc");
        const props = children(first(tcBody, "tcPr") ?? {}, "tcPr");
        const colspan = Number(attr(first(props, "gridSpan"), "val") ?? 1);
        const merge = first(props, "vMerge");
        collectImages(
          nodes(tcBody, "p"),
          `block-${blocks.length + 1}`,
          blocks.length,
          rows.length,
          column,
        );
        const paragraphs = nodes(tcBody, "p")
          .map((p) => paragraph(p).text)
          .filter(Boolean);
        if (nodes(tcBody, "tbl").length) {
          warnings.push(
            "Bảng lồng trong ô được giữ ở phần văn bản ô; cần kiểm tra cấu trúc con.",
          );
          paragraphs.push(
            ...nodes(tcBody, "tbl").map((t) => xmlText(children(t, "tbl"))),
          );
        }
        const cell = {
          text: paragraphs.join("\n"),
          paragraphs,
          column,
          colspan,
          rowspan: 1,
          complex: nodes(tcBody, "tbl").length > 0,
        };
        if (merge && attr(merge, "val") !== "restart") {
          const origin = active.get(column);
          if (origin && origin.colspan === colspan) {
            origin.rowspan = (origin.rowspan ?? 1) + 1;
            if (cell.text) {
              origin.text += "\n" + cell.text;
              origin.paragraphs?.push(...paragraphs);
            }
            continued.add(column);
          } else {
            cells.push(cell);
            warnings.push(
              "Ô gộp dọc thiếu ô bắt đầu; giữ nguyên văn bản để giáo viên kiểm tra.",
            );
          }
        } else {
          cells.push(cell);
          active.delete(column);
          if (merge) {
            active.set(column, cell);
            continued.add(column);
          }
        }
        column += colspan;
      }
      for (const key of active.keys())
        if (!continued.has(key)) active.delete(key);
      rows.push({ cells });
    }
    add({ type: "TABLE", table: { rows } });
  }
  function walk(body: XmlNode[]) {
    const siblings = nodes(body, "p");
    for (const node of body) {
      if ("p" in node) {
        const p = paragraph(node);
        const hasImage =
          descendants(children(node, "p"), "blip").length ||
          descendants(children(node, "p"), "imagedata").length;
        if (!p.text && !hasImage) continue;
        collectImages(
          siblings,
          `block-${blocks.length + 1}`,
          blocks.length,
          undefined,
          undefined,
          siblings.indexOf(node),
        );
        add({
          type: p.level ? "HEADING" : p.isList ? "LIST" : "PARAGRAPH",
          text: p.text,
          level: p.level,
          numbering: p.marker,
          ...(p.isList ? { items: [p.text] } : {}),
        });
      } else if ("tbl" in node) table(node);
      else if ("sdt" in node)
        walk(
          children(
            first(children(node, "sdt"), "sdtContent") ?? {},
            "sdtContent",
          ),
        );
    }
  }
  walk(children(descendants(doc, "body")[0] ?? {}, "body"));
  if (descendants(doc, "drawing").length || descendants(doc, "pict").length)
    warnings.push(
      "Tệp có hình/vùng vẽ; chữ trong ảnh không được nhận dạng (chưa hỗ trợ OCR).",
    );
  if (descendants(doc, "del").length)
    warnings.push(
      "Tệp có theo dõi thay đổi: bỏ nội dung đã xóa, giữ nội dung được chèn.",
    );
  const rawText = blocks
    .map((b) =>
      b.table
        ? b.table.rows
            .map((r) => r.cells.map((c) => c.text).join("\t"))
            .join("\n")
        : (b.text ?? b.items?.join("\n") ?? ""),
    )
    .join("\n");
  return {
    blocks,
    rawText,
    warnings: [...new Set(warnings)],
    imagePlacements,
    mediaAssets,
  };
}
