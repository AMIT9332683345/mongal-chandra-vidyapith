import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { findDocById, updateOneDoc } from "@/server/db/mongo/repository";
import { env } from "@/server/config/env";
import {
  FileRejectedError,
  detectMimeType,
  getDocumentById,
  safeDownloadName,
  storeFile,
  type StoredDocument,
} from "@/server/storage/files";
import { serveStoredFile } from "@/server/http/file-response";

/**
 * What may be downloaded, and what a guessed identifier gets you.
 *
 * Files reach a browser through exactly one function. These suites prove that
 * the function is the whole rule: that a file's declared type is ignored in
 * favour of its bytes, that anything not public answers the same way a
 * non-existent file does, and that the name on disk cannot be inferred from
 * anything a visitor is given.
 */

const PDF = Buffer.from("%PDF-1.4\n%fixture\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF", "utf8");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "utf8"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("WEBPVP8 ", "utf8"),
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const RUN = randomUUID().slice(0, 8);

describe("what a file really is", () => {
  it("reads the type from the leading bytes", () => {
    expect(detectMimeType(PDF)).toBe("application/pdf");
    expect(detectMimeType(PNG)).toBe("image/png");
    expect(detectMimeType(JPEG)).toBe("image/jpeg");
    expect(detectMimeType(WEBP)).toBe("image/webp");
  });

  it("accepts nothing that is not one of those four", () => {
    expect(detectMimeType(Buffer.from("#!/bin/sh\nrm -rf /\n", "utf8"))).toBeNull();
    expect(detectMimeType(Buffer.from("<html><script>alert(1)</script></html>", "utf8"))).toBeNull();
    // A RIFF container that is not WebP — a WAV or AVI — is not an image.
    expect(detectMimeType(Buffer.concat([Buffer.from("RIFF", "utf8"), Buffer.from([0, 0, 0, 0]), Buffer.from("WAVEfmt ", "utf8")]))).toBeNull();
  });

  it("recognises the photograph the school actually supplied", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const bytes = await readFile(join(process.cwd(), "public", "images", "campus.webp"));
    expect(detectMimeType(bytes)).toBe("image/webp");
  });

  it("refuses an upload whose extension does not match its contents", async () => {
    await expect(
      storeFile({
        buffer: PNG,
        originalFilename: "birth-certificate.pdf",
        declaredMimeType: "application/pdf",
        kind: "admission_proof",
        visibility: "restricted",
      }),
    ).rejects.toBeInstanceOf(FileRejectedError);
  });

  it("refuses an empty file and one over the limit", async () => {
    await expect(
      storeFile({ buffer: Buffer.alloc(0), originalFilename: "blank.pdf", declaredMimeType: "", kind: "file", visibility: "public" }),
    ).rejects.toBeInstanceOf(FileRejectedError);

    await expect(
      storeFile({
        buffer: Buffer.concat([PDF, Buffer.alloc(env.MAX_UPLOAD_BYTES, 0x20)]),
        originalFilename: "huge.pdf",
        declaredMimeType: "application/pdf",
        kind: "file",
        visibility: "public",
      }),
    ).rejects.toBeInstanceOf(FileRejectedError);
  });
});

describe("naming on disk", () => {
  it("gives two files of the same name two unrelated storage keys", async () => {
    const first = await storeFile({
      buffer: PDF,
      originalFilename: "report.pdf",
      declaredMimeType: "application/pdf",
      kind: "circular",
      visibility: "public",
    });
    const second = await storeFile({
      buffer: Buffer.concat([PDF, Buffer.from("% different bytes\n%%EOF", "utf8")]),
      originalFilename: "report.pdf",
      declaredMimeType: "application/pdf",
      kind: "circular",
      visibility: "public",
    });

    expect(first.storageKey).not.toBe(second.storageKey);
    expect(first.storageKey).toMatch(/^[0-9a-f]{64}$/);
    expect(first.sha256).not.toBe(second.sha256);
  });

  it("strips a filename down to something safe for a download header", () => {
    expect(safeDownloadName("../../etc/passwd")).not.toContain("/");
    expect(safeDownloadName('term";filename="evil.pdf')).not.toContain('"');
    expect(safeDownloadName("   ")).toBeTruthy();
  });
});

describe("serving a file", () => {
  let publicDoc: StoredDocument;
  let restrictedDoc: StoredDocument;
  let privateDoc: StoredDocument;
  let deletedDoc: StoredDocument;
  let draftDoc: StoredDocument;

  beforeAll(async () => {
    publicDoc = await storeFile({
      buffer: PDF,
      originalFilename: `fixture public ${RUN}.pdf`,
      declaredMimeType: "application/pdf",
      kind: "circular",
      title: "Fixture public circular",
      visibility: "public",
    });
    restrictedDoc = await storeFile({
      buffer: PDF,
      originalFilename: `fixture proof ${RUN}.pdf`,
      declaredMimeType: "application/pdf",
      kind: "admission_proof",
      visibility: "restricted",
    });
    privateDoc = await storeFile({
      buffer: PDF,
      originalFilename: `fixture internal ${RUN}.pdf`,
      declaredMimeType: "application/pdf",
      kind: "file",
      visibility: "private",
    });
    deletedDoc = await storeFile({
      buffer: PDF,
      originalFilename: `fixture withdrawn ${RUN}.pdf`,
      declaredMimeType: "application/pdf",
      kind: "circular",
      visibility: "public",
    });
    await updateOneDoc("documents", { id: deletedDoc.id }, { deletedAt: new Date() });

    draftDoc = await storeFile({
      buffer: PDF,
      originalFilename: `fixture draft ${RUN}.pdf`,
      declaredMimeType: "application/pdf",
      kind: "circular",
      visibility: "public",
    });
    await updateOneDoc("documents", { id: draftDoc.id }, { status: "draft" });
  });

  it("streams a public document with the headers a browser needs", async () => {
    const response = await serveStoredFile(publicDoc.id, "attachment");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await response.text()).startsWith("%PDF")).toBe(true);

    const served = await findDocById("documents", publicDoc.id);
    expect(served!.downloadCount).toBeGreaterThan(0);
  });

  it("answers the same way to a restricted file, a private one, a deleted one and one that never existed", async () => {
    const statuses = [];
    for (const id of [restrictedDoc.id, privateDoc.id, deletedDoc.id, draftDoc.id, randomUUID()]) {
      const response = await serveStoredFile(id, "attachment");
      statuses.push({ id, status: response.status, body: await response.text() });
    }
    for (const attempt of statuses) {
      expect(attempt.status).toBe(404);
      expect(attempt.body).toBe("Not found");
    }
  });

  it("refuses an identifier that is not a document id, without querying", async () => {
    for (const probe of ["", "../uploads/abc", "0", `${publicDoc.storageKey}`, "%27%27"]) {
      const response = await serveStoredFile(probe, "inline");
      expect(response.status).toBe(404);
    }
  });

  it("never hands out the storage key, through the record or the response", async () => {
    const record = await getDocumentById(publicDoc.id);
    expect(record?.storageKey).toBe(publicDoc.storageKey);

    const response = await serveStoredFile(publicDoc.id, "inline");
    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).not.toContain(publicDoc.storageKey);
    expect(disposition).toContain("filename=");
  });

  it("reports a file whose bytes no longer match the recorded size", async () => {
    const tampered = await storeFile({
      buffer: PDF,
      originalFilename: `fixture tampered ${RUN}.pdf`,
      declaredMimeType: "application/pdf",
      kind: "circular",
      visibility: "public",
    });
    await updateOneDoc("documents", { id: tampered.id }, { sizeBytes: 4_000_000 });

    const response = await serveStoredFile(tampered.id, "inline");
    expect(response.status).toBe(503);
  });
});
