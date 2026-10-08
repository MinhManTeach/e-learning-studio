import { z } from "zod";
export const imagePlacementSchema = z.object({
  id: z.string(),
  relationshipId: z.string(),
  mediaId: z.string().optional(),
  status: z.enum(["VALID", "MISSING", "UNSUPPORTED"]),
  blockId: z.string(),
  sourceOrder: z.number(),
  row: z.number().optional(),
  column: z.number().optional(),
  paragraphIndex: z.number(),
  imageOrder: z.number(),
  nearbyText: z.string(),
  altText: z.string(),
  caption: z.string(),
});
export type DocxImagePlacement = z.infer<typeof imagePlacementSchema>;
export const mediaAssetSchema = z.object({
  id: z.string(),
  path: z.string(),
  contentType: z.string(),
  bytes: z.custom<Uint8Array>((v) => v instanceof Uint8Array),
});
export type DocxMediaAsset = z.infer<typeof mediaAssetSchema>;

export const associatedPlacementSchema = imagePlacementSchema.extend({
  activityId: z.string().optional(),
  activityTitle: z.string().optional(),
  subactivityTitle: z.string().optional(),
  needsReview: z.boolean(),
});
export const docxSourceSchema = z.object({
  documentId: z.string(),
  fileName: z.string(),
  checksum: z.string(),
  license: z.literal("USER_PROVIDED_UNVERIFIED"),
  attribution: z.string(),
  placements: z.array(associatedPlacementSchema),
});
export const sourceContextSchema = z.object({
  blockId: z.string(),
  row: z.number().optional(),
  column: z.number().optional(),
  activityId: z.string().optional(),
});
