import { useState } from "react";
import type { Slide } from "../model/schema";
import { ChoicePicture } from "./ChoicePicture";
import { SpeakButton } from "../player/SpeakButton";
import {
  canReadAloud,
  rememberSpeech,
  rememberText,
} from "../player/readAloud";

type CardsSlide = Extract<Slide, { type: "cards" }>;
type Item = CardsSlide["data"]["items"][number];

function CardBody({ item }: { item: Item }) {
  return (
    <>
      <ChoicePicture assetId={item.imageAssetId} />
      {item.title && <strong className="card-title">{item.title}</strong>}
      {item.text && <span className="card-text">{item.text}</span>}
    </>
  );
}

function FlipCard({ item, index }: { item: Item; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      className={"flip-card tone-" + (index % 6)}
      aria-pressed={open}
      aria-label={
        open ? `${item.title}: ${item.text}` : `${item.title} (bấm để lật)`
      }
      onClick={() => setOpen(!open)}
    >
      <span className="flip-inner">
        <span className="flip-front">
          <ChoicePicture assetId={item.imageAssetId} />
          <strong>{item.title}</strong>
          <small aria-hidden="true">Bấm để lật</small>
        </span>
        <span className="flip-back">{item.text || item.title}</span>
      </span>
    </button>
  );
}

/** Knowledge laid out as numbered steps, two columns, a timeline, a mind map or flip cards. */
export function CardsRenderer({ slide }: { slide: Slide }) {
  if (slide.type !== "cards") return null;
  const { style, items, intro, center, groups, keyTakeaway } = slide.data;
  const remember = rememberText(keyTakeaway);
  return (
    <div className={"cards cards-" + style}>
      {intro && <p className="cards-intro">{intro}</p>}
      {style === "STEPS" && (
        <ol className="cards-steps">
          {items.map((item, i) => (
            <li key={item.id} className={"tone-" + (i % 6)}>
              <span className="step-number" aria-hidden="true">
                {i + 1}
              </span>
              <CardBody item={item} />
            </li>
          ))}
        </ol>
      )}
      {style === "COMPARE" && (
        <div className="cards-compare">
          {[0, 1].map((g) => (
            <section key={g} className={"compare-column column-" + g}>
              <h3>
                <span aria-hidden="true">{g === 0 ? "✓" : "✗"}</span>{" "}
                {groups[g] ?? ""}
              </h3>
              <ul>
                {items
                  .filter((item) => item.group === g)
                  .map((item) => (
                    <li key={item.id}>
                      <CardBody item={item} />
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {style === "TIMELINE" && (
        <ol className="cards-timeline">
          {items.map((item, i) => (
            <li key={item.id} className={"tone-" + (i % 6)}>
              <span className="timeline-dot" aria-hidden="true" />
              <CardBody item={item} />
            </li>
          ))}
        </ol>
      )}
      {style === "MINDMAP" && (
        <div className="cards-mindmap" data-count={Math.min(items.length, 8)}>
          <div className="mindmap-center">{center || slide.title}</div>
          <ul>
            {items.map((item, i) => (
              <li key={item.id} className={"tone-" + (i % 6)}>
                <CardBody item={item} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {style === "FLIP" && (
        <div className="cards-flip">
          {items.map((item, i) => (
            <FlipCard key={item.id} item={item} index={i} />
          ))}
        </div>
      )}
      {keyTakeaway && (
        <p className="key-takeaway">
          <strong>Em cần nhớ:</strong> {remember}
          {canReadAloud(slide) && (
            <SpeakButton
              id={"remember:" + slide.id}
              label="điều em cần nhớ"
              lang={slide.narration.lang}
              text={rememberSpeech(keyTakeaway)}
            />
          )}
        </p>
      )}
    </div>
  );
}
