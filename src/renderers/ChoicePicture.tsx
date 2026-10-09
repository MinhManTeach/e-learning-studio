import { useContext, useState } from "react";
import { isDisplayableUrl, useImageResolver } from "../media/imageResolver";
import { LessonProjectContext } from "./lessonContext";

/** The picture on an answer card; renders nothing when there is none to show. */
export function ChoicePicture({ assetId }: { assetId?: string }) {
  const project = useContext(LessonProjectContext);
  const resolve = useImageResolver();
  const [failed, setFailed] = useState(false);
  const asset = assetId
    ? project?.assets.find((a) => a.id === assetId && a.kind === "IMAGE")
    : undefined;
  const image = resolve(asset, project?.projectId ?? "");
  if (
    !asset ||
    failed ||
    !image.url ||
    !isDisplayableUrl(image.url, asset.status === "LOCAL")
  )
    return null;
  return (
    <img
      className="choice-picture"
      src={image.url}
      alt={asset.altText}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  );
}
