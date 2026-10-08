import { zipSync, strToU8 } from "fflate";
export const samplePng = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);
const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const pic = (n: number) =>
  `<w:p><w:r><w:drawing><wp:inline><wp:docPr id="${n}" name="Drawing ${n}" descr="Minh họa mẫu ${n}"/><a:graphic><a:blip r:embed="rId${n}"/></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
const cell = (body: string, span = 1) =>
  `<w:tc><w:tcPr><w:gridSpan w:val="${span}"/></w:tcPr>${body}</w:tc>`;
const row = (...cells: string[]) => `<w:tr>${cells.join("")}</w:tr>`;
export function mediaDocx(
  options: {
    duplicate?: boolean;
    external?: boolean;
    mime?: string;
    broken?: boolean;
  } = {},
) {
  const files: Record<string, Uint8Array> = {};
  for (let n = 1; n <= 7; n++)
    files[`word/media/asset-${8 - n}.png`] = samplePng;
  files["word/media/unused.png"] = samplePng;
  const rels = Array.from(
    { length: 7 },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${options.external && i === 0 ? "https://example.com/image.png" : `media/asset-${7 - i}.png`}" ${options.external && i === 0 ? 'TargetMode="External"' : ""}/>`,
  ).join("");
  if (options.broken) delete files["word/media/asset-7.png"];
  const xml = `<w:document xmlns:w="w" xmlns:r="r" xmlns:wp="wp" xmlns:a="a"><w:body>${p("Bài 7: Bài kiểm thử (T1)")}${p("Lớp học sinh: 3")}${p("I. YÊU CẦU CẦN ĐẠT")}${p("- Nhận biết được mẫu.")}${p("III. CÁC HOẠT ĐỘNG DẠY HỌC")}<w:tbl>${row(cell(p("Hoạt động của giáo viên")), cell(p("Hoạt động của học sinh")), cell(p("Hỗ trợ HSKT")))}${row(cell(p("1. KHỞI ĐỘNG (5’)"), 3))}${row(cell(p("2. HÌNH THÀNH KIẾN THỨC (17’)"), 3))}${row(cell(p("1. Quan sát nhóm thứ nhất (9’)"), 3))}${row(cell(p("GV giới thiệu mẫu thứ nhất.") + pic(1) + p("Hình 1. Mẫu thứ nhất") + pic(2)), cell(p("HS gọi tên mẫu.")), cell(p("Quan sát trực quan.")))}${row(cell(p("2. Quan sát nhóm thứ hai (8’)"), 3))}${row(cell(p("GV giới thiệu mẫu thứ hai.") + pic(3) + pic(4) + pic(5) + pic(6) + (options.duplicate ? pic(1) : "")), cell(p("HS so sánh mẫu.")), cell(p("Gợi ý.")))}${row(cell(p("3. LUYỆN TẬP (5’)"), 3))}${row(cell(p("Ghép các bộ phận và chức năng.") + pic(7) + p("Hình 7. Bài ghép mẫu"), 3))}${row(cell(p("4. VẬN DỤNG (5’)"), 3))}${row(cell(p("5. CỦNG CỐ, DẶN DÒ (3’)"), 3))}</w:tbl></w:body></w:document>`;
  files["word/document.xml"] = strToU8(xml);
  files["word/_rels/document.xml.rels"] = strToU8(
    `<Relationships>${rels}</Relationships>`,
  );
  files["[Content_Types].xml"] = strToU8(
    `<Types><Default Extension="png" ContentType="${options.mime ?? "image/png"}"/></Types>`,
  );
  return zipSync(files);
}
