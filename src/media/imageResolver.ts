import { createContext, useContext } from "react";
import type { AssetReference } from "../model/schema";
import { useLocalImage } from "./useLocalImage";

export interface ImageResolution {
  url: string;
  error: string;
  loading: boolean;
}
/** A React hook that turns a lesson asset into a displayable URL. */
export type ImageResolver = (
  asset: AssetReference | undefined,
  projectId: string,
) => ImageResolution;

// The editor and preview read teacher images from IndexedDB. An exported package
// has no IndexedDB copy, so its player swaps in a resolver for the bundled files.
export const ImageResolverContext = createContext<ImageResolver>(useLocalImage);
export const useImageResolver = () => useContext(ImageResolverContext);

export const missingPackagedImage =
  "Thiếu ảnh trong gói bài giảng. Hãy xuất lại gói từ ứng dụng.";

/**
 * Resolver for an exported package. `files` maps asset IDs to paths inside the
 * package; paths are resolved against the page so they work from file:// and
 * from an LMS alike. External (HTTPS) images keep their original URL.
 */
export function packagedImageResolver(
  files: Record<string, string>,
  base: string,
): ImageResolver {
  return (asset) => {
    if (!asset) return { url: "", error: "", loading: false };
    const path = Object.hasOwn(files, asset.id) ? files[asset.id] : undefined;
    if (path)
      return { url: new URL(path, base).href, error: "", loading: false };
    if (asset.status === "LOCAL")
      return { url: "", error: missingPackagedImage, loading: false };
    return { url: asset.url, error: "", loading: false };
  };
}
