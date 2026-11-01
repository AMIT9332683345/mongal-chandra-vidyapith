import { createHash, randomBytes } from "node:crypto";
import { GridFSBucket } from "mongodb";
import { env } from "@/server/config/env";
import { getDb } from "@/server/db/mongo/client";
import { findDoc, findDocById, insertDoc } from "@/server/db/mongo/repository";
import type { DocumentsDoc } from "@/server/db/mongo/schema.generated";

/**
 * File storage.
 *
 * Two rules hold here. The name on disk is a random 32-byte hex string that
 * has nothing to do with the document id or the original filename, so knowing
 * an id does not let a caller guess a path or a URL. And the declared content
 * type is never trusted: the first bytes decide what a file is.
 *
 * The bytes live in GridFS in the same MongoDB database as the records, not on
 * the machine's filesystem. A serverless host (Vercel) gives a function a
 * read-only image plus a /tmp that disappears with the instance, so a disk
 * upload would be recorded in the database and then vanish. GridFS makes an
 * upload and the row that describes it succeed or fail together, on both Vercel
 * and Render, with no second service to configure.
 */

export const ACCEPTED_KINDS = {
  "application/pdf": "pdf",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
} as const;

type AcceptedMime = keyof typeof ACCEPTED_KINDS;

const SIGNATURES: { mime: AcceptedMime; bytes: number[]; offset?: number }[] = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // A WebP is a RIFF container: the tag is at the very start, and the four
  // bytes at offset 8 say which flavour of RIFF file it actually is.
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
];

const WEBP_MARKER = [0x57, 0x45, 0x42, 0x50];

/** The image payloads a WebP container may carry; anything else is a different RIFF file. */
const WEBP_CHUNKS = [
  [0x56, 0x50, 0x38, 0x20], // VP8  (lossy)
  [0x56, 0x50, 0x38, 0x4c], // VP8L (lossless)
  [0x56, 0x50, 0x38, 0x58], // VP8X (extended)
];

export class FileRejectedError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "FileRejectedError";
  }
}

/** What a file actually is, from its leading bytes. */
export function detectMimeType(buffer: Buffer): AcceptedMime | null {
  for (const signature of SIGNATURES) {
    const offset = signature.offset ?? 0;
    const matches = signature.bytes.every((byte, index) => buffer[offset + index] === byte);
    if (!matches) continue;
    // A RIFF header is shared with WAV, AVI and animated formats, so the four
    // bytes after it decide whether this is really a WebP image.
    if (signature.mime === "image/webp") {
      const isWebp = WEBP_MARKER.every((byte, index) => buffer[8 + index] === byte);
      if (!isWebp) continue;
      const chunk = buffer.subarray(12, 16);
      const isImageChunk = WEBP_CHUNKS.some((candidate) => candidate.every((byte, index) => chunk[index] === byte));
      if (!isImageChunk) continue;
    }
    return signature.mime;
  }
  return null;
}

const GRIDFS_BUCKET = "uploads";

function uploadBucket(): GridFSBucket {
  return new GridFSBucket(getDb(), { bucketName: GRIDFS_BUCKET });
}

/**
 * Storage keys are generated here and nowhere else, so they are always safe to
 * use as a bucket filename. The pattern check also protects `readDocumentBytes`
 * from being handed an arbitrary stored string.
 */
function assertSafeKey(storageKey: string): void {
  if (!/^[a-f0-9]{64}$/.test(storageKey)) {
    throw new FileRejectedError("Unrecognised file reference.");
  }
}

async function writeGridFile(storageKey: string, buffer: Buffer): Promise<void> {
  const stream = uploadBucket().openUploadStream(storageKey, {
    metadata: { uploadedAt: new Date() },
  });
  await new Promise<void>((resolve, reject) => {
    stream.once("error", reject);
    stream.once("finish", () => resolve());
    stream.end(buffer);
  });
}

async function readGridFile(storageKey: string): Promise<Buffer> {
  const stream = uploadBucket().openDownloadStreamByName(storageKey);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.once("error", reject);
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.once("end", () => resolve());
  });
  return Buffer.concat(chunks);
}

export type StoreInput = {
  buffer: Buffer;
  originalFilename: string;
  declaredMimeType: string;
  kind: string;
  title?: string | null;
  altText?: string | null;
  category?: string | null;
  visibility: "public" | "restricted" | "private";
  uploadedBy?: string | null;
};

export type StoredDocument = DocumentsDoc;

/**
 * The picture's own pixel size, read from the bytes rather than believed from
 * the filename. The homepage slideshow and the gallery grid both need to know
 * whether a photograph is large enough to be shown wide without being stretched,
 * and the only honest source for that is the file itself.
 *
 * A decode failure leaves the dimensions null rather than rejecting the upload:
 * the magic bytes already said what this file is, and a viewer that cannot be
 * read is a display problem, not a storage one.
 */
async function probeDimensions(buffer: Buffer, mimeType: AcceptedMime): Promise<{ widthPx: number | null; heightPx: number | null }> {
  if (mimeType === "application/pdf") return { widthPx: null, heightPx: null };
  try {
    // A default export under CommonJS, and the function itself when there is no
    // interop wrapper around it. Both shapes occur between `next dev`, `next
    // build` and `vitest`, and none of them is a reason to lose the dimensions.
    type ImageReader = (input: Buffer) => { metadata(): Promise<{ width?: number; height?: number }> };
    const loaded = await import("sharp");
    const readImage = ("default" in loaded ? loaded.default : loaded) as unknown as ImageReader;
    const meta = await readImage(buffer).metadata();
    return { widthPx: meta.width ?? null, heightPx: meta.height ?? null };
  } catch (error) {
    console.warn("[files] could not read image dimensions", error);
    return { widthPx: null, heightPx: null };
  }
}

/**
 * Validates, hashes and writes one upload, then records it. The bytes land in
 * GridFS before the row exists; a failure after that leaves an unreferenced
 * file rather than a row pointing at nothing, which is the safer direction.
 */
export async function storeFile(input: StoreInput): Promise<StoredDocument> {
  if (input.buffer.length === 0) throw new FileRejectedError("The uploaded file is empty.");
  if (input.buffer.length > env.MAX_UPLOAD_BYTES) {
    throw new FileRejectedError(
      `That file is larger than the ${Math.round(env.MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`,
    );
  }

  const detected = detectMimeType(input.buffer);
  if (!detected) {
    throw new FileRejectedError("Only PDF, JPEG, PNG or WebP files are accepted.");
  }
  if (input.declaredMimeType && input.declaredMimeType !== detected) {
    throw new FileRejectedError("The file type does not match its contents.");
  }

  const storageKey = randomBytes(32).toString("hex");
  const sha256 = createHash("sha256").update(input.buffer).digest("hex");
  const { widthPx, heightPx } = await probeDimensions(input.buffer, detected);

  await writeGridFile(storageKey, input.buffer);

  const row = await insertDoc("documents", {
    storageKey,
    originalFilename: input.originalFilename.slice(0, 240) || "upload",
    mimeType: detected,
    kind: input.kind,
    sizeBytes: input.buffer.length,
    widthPx,
    heightPx,
    sha256,
    title: input.title ?? null,
    altText: input.altText ?? null,
    category: input.category ?? null,
    visibility: input.visibility,
    uploadedBy: input.uploadedBy ?? null,
    status: "published",
  });

  return row;
}

export async function getDocumentById(id: string): Promise<DocumentsDoc | null> {
  return findDocById("documents", id);
}

/** The two fields reading the bytes needs; every stored document has both. */
type StoredShape = Pick<DocumentsDoc, "storageKey" | "sizeBytes">;

/** Bytes of a stored file. Only ever called with a row read back from the database. */
export async function readDocumentBytes(document: StoredShape): Promise<Buffer> {
  assertSafeKey(document.storageKey);
  const file = await getDb()
    .collection(`${GRIDFS_BUCKET}.files`)
    .findOne({ filename: document.storageKey }, { projection: { length: 1 } });
  if (!file) throw new FileRejectedError("The stored file is missing.");
  if (file.length !== document.sizeBytes) {
    throw new FileRejectedError("The stored file no longer matches its recorded size.");
  }
  const bytes = await readGridFile(document.storageKey);
  if (bytes.length !== document.sizeBytes) {
    throw new FileRejectedError("The stored file no longer matches its recorded size.");
  }
  return bytes;
}

/** Used by the one-off import of files written to disk before the GridFS move. */
export async function storeFileBytes(storageKey: string, bytes: Buffer): Promise<void> {
  assertSafeKey(storageKey);
  await writeGridFile(storageKey, bytes);
}

/**
 * A filename for the `Content-Disposition` header, stripped of anything that
 * could break the header out or carry a path. Only the last element of what the
 * uploader's browser sent is kept, and only in characters a header can hold.
 */
export function safeDownloadName(originalFilename: string): string {
  const base = originalFilename.split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .replace(/[^A-Za-z0-9. _()-]/g, "_")
    .replace(/^[. ]+/, "")
    .slice(0, 200)
    .trim();
  return cleaned || "download";
}
