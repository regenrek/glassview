export type GlassviewEnv = {
  SCREENSHOTS: R2Bucket;
  GLASSVIEW_UPLOAD_TOKEN: string;
  STAGE?: string;
  GLASSVIEW_SHARE_MODE?: string;
  GLASSVIEW_DEFAULT_TTL?: string;
  GLASSVIEW_MAX_TTL?: string;
  GLASSVIEW_ENABLE_LATEST?: string;
  GLASSVIEW_ENCRYPT_UPLOADS?: string;
};

export type ScreenshotMetadata = {
  id: string;
  label?: string;
  sourceUrl?: string;
  appName?: string;
  viewport?: string;
  note?: string;
  imageKey: string;
  metaKey: string;
  contentType: string;
  size: number;
  createdAt: string;
  expiresAt?: string;
  viewUrl: string;
  rawUrl: string;
};

export type UploadResponse = Pick<
  ScreenshotMetadata,
  "id" | "viewUrl" | "rawUrl" | "createdAt"
>;
