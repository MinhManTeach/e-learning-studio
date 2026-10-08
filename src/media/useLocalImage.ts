import { useEffect, useState } from "react";
import type { AssetReference } from "../model/schema";
import { localMediaStore } from "./storage";
export function useLocalImage(
  asset: AssetReference | undefined,
  projectId: string,
) {
  const [resolved, setResolved] = useState<{
    key: string;
    url: string;
    error: string;
  } | null>(null);
  const key = `${projectId}:${asset?.id}:${asset?.url}`;
  useEffect(() => {
    if (!asset || asset.status !== "LOCAL") return;
    let cancelled = false;
    let objectUrl = "";
    void localMediaStore
      .get(asset.id, projectId)
      .then((record) => {
        if (cancelled) return;
        if (!record) {
          setResolved({
            key,
            url: "",
            error:
              "Thiếu ảnh trên thiết bị. JSON không chứa binary ảnh; hãy tải ảnh lên lại.",
          });
          return;
        }
        objectUrl = URL.createObjectURL(record.blob);
        setResolved({ key, url: objectUrl, error: "" });
      })
      .catch(() => {
        if (!cancelled)
          setResolved({
            key,
            url: "",
            error: "Không đọc được kho ảnh. Hãy thử mở lại bài.",
          });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset?.id, asset?.url, asset?.status, projectId, key]);
  if (asset?.status !== "LOCAL")
    return { url: asset?.url ?? "", error: "", loading: false };
  return resolved?.key === key
    ? { ...resolved, loading: false }
    : { url: "", error: "", loading: true };
}
