import type { ActivityKind, CardStyle, Slide } from "../model/schema";
import { Field } from "./Fields";
import { SelectField } from "./Controls";

type CardsSlide = Extract<Slide, { type: "cards" }>;
type ActivitySlide = Extract<Slide, { type: "activity" }>;

export const cardStyleLabels: Record<CardStyle, string> = {
  STEPS: "Các bước có số thứ tự",
  COMPARE: "Hai cột so sánh",
  TIMELINE: "Dòng thời gian",
  MINDMAP: "Sơ đồ tư duy",
  FLIP: "Thẻ lật “Em cần nhớ”",
};
export const activityKindLabels: Record<ActivityKind, string> = {
  ORDER: "Sắp xếp theo thứ tự",
  SORT: "Phân loại vào hai nhóm",
  MATCH: "Nối cặp",
};

function GroupNames({
  groups,
  onChange,
}: {
  groups: string[];
  onChange: (groups: string[]) => void;
}) {
  return (
    <div className="field-row">
      {[0, 1].map((g) => (
        <Field
          key={g}
          label={`Tên nhóm ${g + 1}`}
          value={groups[g] ?? ""}
          onChange={(v) => {
            const next = [groups[0] ?? "", groups[1] ?? ""];
            next[g] = v;
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}

export function CardsEditor({
  slide: s,
  edit,
}: {
  slide: CardsSlide;
  edit: (slide: Slide) => void;
}) {
  const data = s.data;
  const set = (patch: Partial<CardsSlide["data"]>) =>
    edit({ ...s, data: { ...data, ...patch } });
  type Item = CardsSlide["data"]["items"][number];
  const update = (id: string, patch: Partial<Item>) =>
    set({
      items: data.items.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    });
  return (
    <>
      <SelectField
        label="Kiểu trình bày"
        value={data.style}
        options={cardStyleLabels}
        onChange={(style) => set({ style })}
      />
      <Field
        label="Lời dẫn"
        value={data.intro}
        multiline
        onChange={(intro) => set({ intro })}
      />
      {data.style === "MINDMAP" && (
        <Field
          label="Ý ở giữa sơ đồ"
          value={data.center}
          onChange={(center) => set({ center })}
        />
      )}
      {data.style === "COMPARE" && (
        <GroupNames
          groups={data.groups}
          onChange={(groups) => set({ groups })}
        />
      )}
      {data.items.map((item, i) => (
        <details key={item.id} open>
          <summary>
            Thẻ {i + 1}
            {item.title ? `: ${item.title}` : ""}
          </summary>
          <Field
            label={data.style === "FLIP" ? "Mặt trước" : "Tiêu đề"}
            value={item.title}
            onChange={(title) => update(item.id, { title })}
          />
          <Field
            label={data.style === "FLIP" ? "Mặt sau" : "Nội dung"}
            value={item.text}
            multiline
            onChange={(text) => update(item.id, { text })}
          />
          {data.style === "COMPARE" && (
            <SelectField
              label="Thuộc cột"
              value={String(item.group) as "0" | "1"}
              options={{
                "0": data.groups[0] || "Cột 1",
                "1": data.groups[1] || "Cột 2",
              }}
              onChange={(g) => update(item.id, { group: Number(g) })}
            />
          )}
          <div className="item-actions">
            <button
              disabled={i === 0}
              onClick={() => {
                const items = [...data.items];
                [items[i - 1], items[i]] = [items[i], items[i - 1]];
                set({ items });
              }}
            >
              Lên
            </button>
            <button
              onClick={() => {
                if (confirm("Xóa thẻ này?"))
                  set({ items: data.items.filter((x) => x.id !== item.id) });
              }}
            >
              Xóa thẻ
            </button>
          </div>
        </details>
      ))}
      <button
        disabled={data.items.length >= 12}
        onClick={() =>
          set({
            items: [
              ...data.items,
              { id: crypto.randomUUID(), title: "", text: "", group: 0 },
            ],
          })
        }
      >
        Thêm thẻ
      </button>
      <Field
        label="Em cần nhớ"
        value={data.keyTakeaway}
        multiline
        onChange={(keyTakeaway) => set({ keyTakeaway })}
      />
    </>
  );
}

export function ActivityEditor({
  slide: s,
  edit,
}: {
  slide: ActivitySlide;
  edit: (slide: Slide) => void;
}) {
  const data = s.data;
  const set = (patch: Partial<ActivitySlide["data"]>) =>
    edit({ ...s, data: { ...data, ...patch } });
  type Item = ActivitySlide["data"]["items"][number];
  const update = (id: string, patch: Partial<Item>) =>
    set({
      items: data.items.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    });
  return (
    <>
      <SelectField
        label="Kiểu hoạt động"
        value={data.kind}
        options={activityKindLabels}
        onChange={(kind) => set({ kind })}
      />
      <Field
        label="Yêu cầu cho học sinh"
        value={data.instruction}
        multiline
        onChange={(instruction) => set({ instruction })}
      />
      {data.kind === "SORT" && (
        <GroupNames
          groups={data.groups}
          onChange={(groups) => set({ groups })}
        />
      )}
      {data.kind === "ORDER" && (
        <p className="hint">
          Nhập các thẻ theo ĐÚNG thứ tự; học sinh sẽ thấy chúng bị xáo trộn.
        </p>
      )}
      {data.items.map((item, i) => (
        <details key={item.id} open>
          <summary>
            {data.kind === "ORDER" ? `Bước ${i + 1}` : `Thẻ ${i + 1}`}
            {item.text ? `: ${item.text}` : ""}
          </summary>
          <Field
            label={data.kind === "MATCH" ? "Vế trái" : "Nội dung thẻ"}
            value={item.text}
            onChange={(text) => update(item.id, { text })}
          />
          {data.kind === "MATCH" && (
            <Field
              label="Vế phải (đáp án nối)"
              value={item.match}
              onChange={(match) => update(item.id, { match })}
            />
          )}
          {data.kind === "SORT" && (
            <SelectField
              label="Nhóm đúng"
              value={String(item.group) as "0" | "1"}
              options={{
                "0": data.groups[0] || "Nhóm 1",
                "1": data.groups[1] || "Nhóm 2",
              }}
              onChange={(g) => update(item.id, { group: Number(g) })}
            />
          )}
          <div className="item-actions">
            <button
              disabled={i === 0}
              onClick={() => {
                const items = [...data.items];
                [items[i - 1], items[i]] = [items[i], items[i - 1]];
                set({ items });
              }}
            >
              Lên
            </button>
            <button
              onClick={() => {
                if (confirm("Xóa thẻ này?"))
                  set({ items: data.items.filter((x) => x.id !== item.id) });
              }}
            >
              Xóa thẻ
            </button>
          </div>
        </details>
      ))}
      <button
        disabled={data.items.length >= 10}
        onClick={() =>
          set({
            items: [
              ...data.items,
              { id: crypto.randomUUID(), text: "", match: "", group: 0 },
            ],
          })
        }
      >
        Thêm thẻ
      </button>
      <Field
        label="Lời khen khi làm đúng"
        value={data.feedbackCorrect}
        onChange={(feedbackCorrect) => set({ feedbackCorrect })}
      />
      <Field
        label="Lời nhắc khi chưa đúng"
        value={data.feedbackRetry}
        onChange={(feedbackRetry) => set({ feedbackRetry })}
      />
    </>
  );
}
