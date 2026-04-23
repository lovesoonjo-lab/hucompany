/**
 * Google Cloud Storage helper.
 *
 * The user provides four pieces of credential data on the API Settings page:
 *   - Project ID
 *   - Bucket Name
 *   - Service Account Email (client_email)
 *   - Private Key (the JSON `private_key` value, including \n line breaks)
 *
 * We never write a key file to disk; instead we instantiate a Storage client
 * with an inline credentials object — see google-cloud/storage docs.
 */
import { Storage } from "@google-cloud/storage";

export type GcsCredentials = {
  projectId: string;
  bucketName: string;
  serviceAccountEmail: string;
  /** PEM-encoded private key. \n must be real newlines or escaped \\n. */
  privateKey: string;
};

/**
 * Folder layout we maintain inside the bucket. Created lazily during verify.
 */
export const GCS_FOLDERS = [
  "reference/",
  "scripts/",
  "audio/",
  "subtitles/",
  "images/",
  "videos/",
  "final/",
] as const;

function normalizePrivateKey(raw: string): string {
  // The UI typically receives the private_key as a single line with literal \n.
  // GCS expects real newline characters in the PEM block.
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

export function buildStorageClient(creds: GcsCredentials): Storage {
  return new Storage({
    projectId: creds.projectId,
    credentials: {
      client_email: creds.serviceAccountEmail,
      private_key: normalizePrivateKey(creds.privateKey),
    },
  });
}

export type VerifyResult = {
  ok: boolean;
  bucketExists: boolean;
  createdFolders: string[];
  message: string;
};

/**
 * Verify the credentials by checking that the bucket exists and that the
 * service account can write a small marker object into each canonical folder.
 * Returns a structured result so the UI can render a clear status.
 */
export async function verifyGcsCredentials(creds: GcsCredentials): Promise<VerifyResult> {
  const storage = buildStorageClient(creds);
  const bucket = storage.bucket(creds.bucketName);

  const [exists] = await bucket.exists();
  if (!exists) {
    return {
      ok: false,
      bucketExists: false,
      createdFolders: [],
      message: `버킷을 찾을 수 없습니다: ${creds.bucketName}`,
    };
  }

  const created: string[] = [];
  for (const folder of GCS_FOLDERS) {
    const marker = bucket.file(`${folder}.keep`);
    const [markerExists] = await marker.exists();
    if (!markerExists) {
      await marker.save("", {
        contentType: "text/plain",
        resumable: false,
      });
      created.push(folder);
    }
  }

  return {
    ok: true,
    bucketExists: true,
    createdFolders: created,
    message:
      created.length > 0
        ? `연결 성공. 폴더 ${created.length}개를 새로 생성했습니다.`
        : "연결 성공. 모든 폴더가 이미 준비되어 있습니다.",
  };
}
