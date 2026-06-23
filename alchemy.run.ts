import alchemy from "alchemy";
import { R2Bucket, Worker } from "alchemy/cloudflare";

const stage = process.env.STAGE || "dev";
const alchemyPassword = process.env.ALCHEMY_PASSWORD;
const uploadToken = process.env.GLASSVIEW_UPLOAD_TOKEN;
const bucketName = process.env.GLASSVIEW_BUCKET_NAME || `glassview-${stage}-screenshots`;
const useExistingR2 = process.env.GLASSVIEW_USE_EXISTING_R2 === "true";
const enableWorkersDev = process.env.GLASSVIEW_ENABLE_WORKERS_DEV !== "false";

if (!alchemyPassword) {
  throw new Error("Missing ALCHEMY_PASSWORD. Set it in .env.local");
}

if (!uploadToken) {
  throw new Error("Missing GLASSVIEW_UPLOAD_TOKEN. Set it in .env.local");
}

const app = await alchemy("glassview", {
  stage,
  password: alchemyPassword,
});

export const screenshots = useExistingR2
  ? ({
      type: "r2_bucket",
      name: bucketName,
    } as const)
  : await R2Bucket("screenshots", {
      name: bucketName,
      adopt: true,
      empty: app.stage !== "prod",
      lifecycle: [
        {
          id: "delete-screenshots-after-14-days",
          conditions: { prefix: "screenshots/" },
          deleteObjectsTransition: {
            condition: { type: "Age", maxAge: 14 * 24 * 60 * 60 },
          },
        },
        {
          id: "delete-metadata-after-14-days",
          conditions: { prefix: "meta/" },
          deleteObjectsTransition: {
            condition: { type: "Age", maxAge: 14 * 24 * 60 * 60 },
          },
        },
      ],
    });

export const worker = await Worker("worker", {
  name: `glassview-${app.stage}`,
  entrypoint: "src/worker.ts",
  bindings: {
    SCREENSHOTS: screenshots as any,
    GLASSVIEW_UPLOAD_TOKEN: alchemy.secret(uploadToken),
    STAGE: stage,
    GLASSVIEW_SHARE_MODE: process.env.GLASSVIEW_SHARE_MODE || "private",
    GLASSVIEW_DEFAULT_TTL: process.env.GLASSVIEW_DEFAULT_TTL || "7d",
    GLASSVIEW_MAX_TTL: process.env.GLASSVIEW_MAX_TTL || "30d",
    GLASSVIEW_ENABLE_LATEST: process.env.GLASSVIEW_ENABLE_LATEST || "false",
    GLASSVIEW_ENCRYPT_UPLOADS: process.env.GLASSVIEW_ENCRYPT_UPLOADS || "true",
  },
  url: enableWorkersDev,
  adopt: true,
});

console.log({ url: worker.url });

await app.finalize();
