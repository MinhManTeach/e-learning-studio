import { useMemo, useState, type DragEvent } from "react";
import type { Slide } from "../model/schema";
import { ChoicePicture } from "./ChoicePicture";
import { celebrate } from "../player/celebrate";
import { SpeakButton } from "../player/SpeakButton";
import { canReadAloud } from "../player/readAloud";
import {
  allRight,
  checkMatch,
  checkOrder,
  checkSort,
  shuffled,
  type ActivityItem,
} from "../player/activity";

type ActivitySlide = Extract<Slide, { type: "activity" }>;

const dragProps = (id: string) => ({
  draggable: true,
  onDragStart: (e: DragEvent) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  },
});
const dropProps = (drop: (id: string) => void) => ({
  onDragOver: (e: DragEvent) => e.preventDefault(),
  onDrop: (e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) drop(id);
  },
});
/** Cheers the child on when everything is right, encourages a retry otherwise. */
function judge<T extends boolean[] | Record<string, boolean>>(marks: T): T {
  celebrate(allRight(marks) ? "right" : "retry");
  return marks;
}
function ItemFace({ item, text }: { item?: ActivityItem; text?: string }) {
  return (
    <>
      {item && <ChoicePicture assetId={item.imageAssetId} />}
      <span>{text ?? item?.text}</span>
    </>
  );
}
function Result({
  right,
  slide,
  retry,
}: {
  right: boolean;
  slide: ActivitySlide;
  retry: () => void;
}) {
  return (
    <div
      className={"feedback activity-result " + (right ? "right" : "retry")}
      role="status"
    >
      <strong>{right ? "✓ " : "! "}</strong>
      {right ? slide.data.feedbackCorrect : slide.data.feedbackRetry}
      {!right && (
        <button className="primary" onClick={retry}>
          Làm lại
        </button>
      )}
    </div>
  );
}

function OrderActivity({ slide }: { slide: ActivitySlide }) {
  const items = slide.data.items;
  const pool0 = useMemo(() => shuffled(items, slide.id), [items, slide.id]);
  const [slots, setSlots] = useState<(string | null)[]>(() =>
    items.map(() => null),
  );
  const [marks, setMarks] = useState<boolean[] | null>(null);
  const placed = new Set(slots.filter(Boolean));
  const byId = new Map(items.map((i) => [i.id, i]));
  const place = (id: string, at?: number) => {
    setMarks(null);
    setSlots((s) => {
      const next = s.map((x) => (x === id ? null : x));
      const target = at ?? next.indexOf(null);
      if (target >= 0) next[target] = id;
      return next;
    });
  };
  const remove = (at: number) => {
    setMarks(null);
    setSlots((s) => s.map((x, i) => (i === at ? null : x)));
  };
  return (
    <>
      <ol className="order-slots">
        {slots.map((id, i) => {
          const item = id ? byId.get(id) : undefined;
          const mark = marks ? (marks[i] ? "right" : "wrong") : "";
          return (
            <li
              key={i}
              className={"drop-zone " + mark}
              {...dropProps((d) => place(d, i))}
            >
              <span className="slot-number" aria-hidden="true">
                {i + 1}
              </span>
              {item ? (
                <button
                  className="activity-card placed"
                  aria-label={`Vị trí ${i + 1}: ${item.text}. Bấm để bỏ ra`}
                  disabled={!!marks?.[i]}
                  onClick={() => remove(i)}
                  {...dragProps(item.id)}
                >
                  <ItemFace item={item} />
                </button>
              ) : (
                <span className="slot-empty">Vị trí {i + 1}</span>
              )}
            </li>
          );
        })}
      </ol>
      <div
        className="activity-pool"
        aria-label="Các thẻ chưa xếp"
        {...dropProps((d) => {
          const at = slots.indexOf(d);
          if (at >= 0) remove(at);
        })}
      >
        {pool0
          .filter((item) => !placed.has(item.id))
          .map((item) => (
            <button
              key={item.id}
              className="activity-card"
              onClick={() => place(item.id)}
              {...dragProps(item.id)}
            >
              <ItemFace item={item} />
            </button>
          ))}
      </div>
      {!marks && (
        <button
          className="primary"
          disabled={placed.size < items.length}
          onClick={() =>
            setMarks(
              judge(
                checkOrder(
                  slots.map((x) => x ?? ""),
                  items,
                ),
              ),
            )
          }
        >
          Kiểm tra
        </button>
      )}
      {marks && (
        <Result
          right={allRight(marks)}
          slide={slide}
          retry={() => {
            setSlots((s) => s.map((x, i) => (marks[i] ? x : null)));
            setMarks(null);
          }}
        />
      )}
    </>
  );
}

function SortActivity({ slide }: { slide: ActivitySlide }) {
  const items = slide.data.items;
  const pool0 = useMemo(() => shuffled(items, slide.id), [items, slide.id]);
  const [placed, setPlaced] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, boolean> | null>(null);
  const put = (id: string, group: number | null) => {
    setMarks(null);
    setSelected(null);
    setPlaced((p) => {
      const next = { ...p };
      if (group === null) delete next[id];
      else next[id] = group;
      return next;
    });
  };
  const card = (item: ActivityItem) => {
    const mark = marks ? (marks[item.id] ? "right" : "wrong") : "";
    const where = placed[item.id];
    return (
      <button
        key={item.id}
        className={"activity-card " + mark}
        aria-pressed={selected === item.id}
        disabled={!!marks?.[item.id]}
        onClick={() =>
          where === undefined
            ? setSelected(selected === item.id ? null : item.id)
            : put(item.id, null)
        }
        {...dragProps(item.id)}
      >
        <ItemFace item={item} />
      </button>
    );
  };
  return (
    <>
      <div
        className="activity-pool"
        aria-label="Các thẻ chưa xếp"
        {...dropProps((d) => put(d, null))}
      >
        {pool0.filter((i) => placed[i.id] === undefined).map(card)}
      </div>
      <div className="sort-groups">
        {[0, 1].map((g) => (
          <section
            key={g}
            className={"drop-zone sort-group group-" + g}
            {...dropProps((d) => put(d, g))}
          >
            <h3>{slide.data.groups[g] ?? `Nhóm ${g + 1}`}</h3>
            <div className="sort-cards">
              {pool0.filter((i) => placed[i.id] === g).map(card)}
            </div>
            <button
              className="sort-drop"
              disabled={!selected}
              onClick={() => selected && put(selected, g)}
            >
              Đặt vào “{slide.data.groups[g] ?? `Nhóm ${g + 1}`}”
            </button>
          </section>
        ))}
      </div>
      {!marks && (
        <button
          className="primary"
          disabled={Object.keys(placed).length < items.length}
          onClick={() => setMarks(judge(checkSort(placed, items)))}
        >
          Kiểm tra
        </button>
      )}
      {marks && (
        <Result
          right={allRight(marks)}
          slide={slide}
          retry={() => {
            setPlaced((p) =>
              Object.fromEntries(Object.entries(p).filter(([id]) => marks[id])),
            );
            setMarks(null);
          }}
        />
      )}
    </>
  );
}

function MatchActivity({ slide }: { slide: ActivitySlide }) {
  const items = slide.data.items;
  const right = useMemo(
    () => shuffled(items, slide.id + "m"),
    [items, slide.id],
  );
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, boolean> | null>(null);
  const link = (left: string, target: string) => {
    setMarks(null);
    setSelected(null);
    setPairs((p) => {
      const next = Object.fromEntries(
        Object.entries(p).filter(([l, r]) => l !== left && r !== target),
      );
      next[left] = target;
      return next;
    });
  };
  const number = (left: string) => items.findIndex((i) => i.id === left) + 1;
  return (
    <>
      <div className="match-columns">
        <ul className="match-left">
          {items.map((item, i) => {
            const mark = marks ? (marks[item.id] ? "right" : "wrong") : "";
            return (
              <li key={item.id}>
                <button
                  className={"activity-card " + mark}
                  aria-pressed={selected === item.id}
                  disabled={!!marks?.[item.id]}
                  onClick={() => {
                    if (pairs[item.id]) {
                      setMarks(null);
                      setPairs((p) => {
                        const next = { ...p };
                        delete next[item.id];
                        return next;
                      });
                    } else setSelected(selected === item.id ? null : item.id);
                  }}
                  {...dragProps(item.id)}
                >
                  <span className="pair-badge" aria-hidden="true">
                    {i + 1}
                  </span>
                  <ItemFace item={item} />
                </button>
              </li>
            );
          })}
        </ul>
        <ul className="match-right">
          {right.map((target) => {
            const left = Object.keys(pairs).find((l) => pairs[l] === target.id);
            return (
              <li
                key={target.id}
                className="drop-zone"
                {...dropProps((d) => link(d, target.id))}
              >
                <button
                  className={
                    "activity-card match-target" + (left ? " paired" : "")
                  }
                  disabled={!!left && !!marks?.[left]}
                  aria-label={
                    left
                      ? `${target.match} (đã nối với ${number(left)})`
                      : target.match
                  }
                  onClick={() => selected && link(selected, target.id)}
                >
                  {left && (
                    <span className="pair-badge" aria-hidden="true">
                      {number(left)}
                    </span>
                  )}
                  <ItemFace text={target.match} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {!marks && (
        <button
          className="primary"
          disabled={Object.keys(pairs).length < items.length}
          onClick={() => setMarks(judge(checkMatch(pairs, items)))}
        >
          Kiểm tra
        </button>
      )}
      {marks && (
        <Result
          right={allRight(marks)}
          slide={slide}
          retry={() => {
            setPairs((p) =>
              Object.fromEntries(Object.entries(p).filter(([l]) => marks[l])),
            );
            setMarks(null);
          }}
        />
      )}
    </>
  );
}

const hints = {
  ORDER:
    "Bấm (hoặc kéo) từng thẻ để đặt vào vị trí 1, 2, 3… Bấm thẻ đã đặt để bỏ ra.",
  SORT: "Bấm một thẻ rồi bấm “Đặt vào…” (hoặc kéo thẻ vào nhóm).",
  MATCH: "Bấm một ô bên trái rồi bấm ô phù hợp bên phải (hoặc kéo sang).",
};
/** Sắp xếp thứ tự, phân loại hai nhóm, nối cặp: checked on the page, not scored. */
export function ActivityRenderer({ slide }: { slide: Slide }) {
  if (slide.type !== "activity") return null;
  const kind = slide.data.kind;
  // Editing the cards starts the activity again.
  const key =
    slide.id + slide.data.items.map((i) => i.id + i.group + i.match).join("|");
  return (
    <div className={"activity activity-" + kind}>
      {slide.data.instruction && (
        <div className="speak-line">
          <h3>{slide.data.instruction}</h3>
          {canReadAloud(slide) && (
            <SpeakButton
              id={"activity:" + slide.id}
              label="yêu cầu"
              lang={slide.narration.lang}
              text={slide.data.instruction}
            />
          )}
        </div>
      )}
      <p className="hint">{hints[kind]}</p>
      {!slide.data.items.length ? (
        <p className="hint">Hoạt động chưa có thẻ nào.</p>
      ) : kind === "ORDER" ? (
        <OrderActivity key={key} slide={slide} />
      ) : kind === "SORT" ? (
        <SortActivity key={key} slide={slide} />
      ) : (
        <MatchActivity key={key} slide={slide} />
      )}
    </div>
  );
}
