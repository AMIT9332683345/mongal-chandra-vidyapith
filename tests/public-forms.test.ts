import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { beforeAll, describe, expect, it } from "vitest";
import { countDocs, findDoc, findDocById, findDocs, insertDoc } from "@/server/db/mongo/repository";
import { env } from "@/server/config/env";
import { POST as submitEnquiryRoute } from "@/app/api/enquiries/route";
import { POST as submitApplicationRoute } from "@/app/api/applications/route";
import { POST as lookupStatusRoute } from "@/app/api/applications/status/route";
import {
  applicationSchema,
  lookupApplicationStatus,
  statusLookupHash,
  submitApplication,
} from "@/server/admissions/service";
import { submitEnquiry } from "@/server/contact/service";
import { FORM_TOKEN_COOKIE, hashIp, issueFormToken, verifyFormToken } from "@/server/auth/session";
import { assertRateLimit, RateLimitedError } from "@/server/http/rate-limit";
import { ApplicationRejectedError } from "@/server/http/errors";
import { testDatabaseName } from "./global-setup";

/**
 * The two public forms, end to end.
 *
 * These call the route handlers themselves with a real `Request`, so what is
 * being proved is the whole path — cookie token, honeypot, rate limit, field
 * validation, the document that lands in MongoDB and the audit entry beside it —
 * not a component's opinion about it.
 */

const PDF = Buffer.from("%PDF-1.4\n%fixture\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF", "utf8");

const RUN = randomUUID().slice(0, 8);

/**
 * A different address per request, so one test cannot exhaust another's limit.
 * Address digests are stable for the whole run — that is what makes the limits
 * durable — so these are counted off a unique base rather than drawn at random
 * from a pool small enough to collide.
 */
let nextIp = 0;
function freshIp(): string {
  nextIp += 1;
  return `203.0.113.${nextIp}.${RUN}`;
}

function enquiryFields(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("csrfToken", issueFormToken());
  form.set("kind", "general");
  form.set("name", "Fixture Enquirer");
  form.set("email", `fixture.${RUN}@invalid.example`.slice(0, 60));
  form.set("message", "This is a fixture message long enough to pass validation.");
  form.set("subject", "Fixture subject");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

function request(form: FormData, { ip = freshIp(), accept = "application/json", referer }: { ip?: string; accept?: string; referer?: string } = {}) {
  const token = form.get("csrfToken")?.toString() ?? "";
  const headers = new Headers({
    accept,
    "user-agent": "fixture-test-agent",
    "x-forwarded-for": ip,
  });
  if (token) headers.set("cookie", `${FORM_TOKEN_COOKIE}=${token}`);
  if (referer) headers.set("referer", referer);
  return new Request("http://localhost:3000/api/enquiries", { method: "POST", headers, body: form });
}

function applicationFields(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("csrfToken", issueFormToken());
  form.set("firstName", "Fixture");
  form.set("lastName", "Pupil");
  form.set("dateOfBirth", "2018-04-02");
  form.set("applyingClassId", CLASS_ID);
  form.set("guardianFirstName", "Fixture");
  form.set("guardianLastName", "Guardian");
  form.set("guardianEmail", `fixture.guardian.${RUN}@invalid.example`.slice(0, 60));
  form.set("guardianPhone", "+00000000000");
  form.set("declarationAccepted", "on");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

function applicationRequest(form: FormData, ip = freshIp()) {
  const token = form.get("csrfToken")?.toString() ?? "";
  return new Request("http://localhost:3000/api/applications", {
    method: "POST",
    headers: new Headers({
      accept: "application/json",
      "user-agent": "fixture-test-agent",
      "x-forwarded-for": ip,
      cookie: `${FORM_TOKEN_COOKIE}=${token}`,
    }),
    body: form,
  });
}

let CLASS_ID = "";
let CLOSED_CLASS_ID = "";

beforeAll(async () => {
  const openClass = await insertDoc("classes", {
    name: `Fixture open class ${RUN}`,
    shortName: "Open",
    orderNo: 1,
    active: true,
    admissionOpen: true,
  });
  const closedClass = await insertDoc("classes", {
    name: `Fixture withdrawn class ${RUN}`,
    shortName: "Shut",
    orderNo: 2,
    active: false,
  });
  CLASS_ID = openClass.id;
  CLOSED_CLASS_ID = closedClass.id;
});

describe("the anonymous form token", () => {
  it("verifies its own signature and refuses a tampered one", () => {
    const token = issueFormToken();
    expect(verifyFormToken(token)).toBe(true);
    expect(verifyFormToken(`${token.slice(0, -1)}0`)).toBe(false);
    expect(verifyFormToken("nonsense")).toBe(false);
    expect(verifyFormToken(null)).toBe(false);
  });

  it("refuses a token whose expiry has passed", () => {
    // Minted with a negative lifetime: the expiry is part of the signed payload,
    // so it cannot be extended by editing the cookie.
    const expired = issueFormToken(-1);
    expect(verifyFormToken(expired)).toBe(false);
  });
});

describe("contact form", () => {
  it("stores a valid enquiry and audits it without the message text", async () => {
    const response = await submitEnquiryRoute(request(enquiryFields()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);

    const row = await findDocById("contact_enquiries", body.enquiryId);
    if (!row) throw new Error("The enquiry was not stored.");
    expect(row.name).toBe("Fixture Enquirer");
    expect(row.status).toBe("open");

    const audit = await findDoc(
      "audit_logs",
      { action: "contact.enquiry_received", resourceId: row.id },
      { sort: { createdAt: -1 } },
    );
    expect(audit).toBeDefined();
    expect(JSON.stringify(audit?.metadata)).not.toContain("fixture message");
  });

  it("says plainly when no mail account can send the acknowledgement", async () => {
    const result = await submitEnquiry(
      {
        kind: "general",
        name: "Fixture Enquirer",
        email: `fixture.mail.${RUN}@invalid.example`,
        message: "A fixture message that is comfortably long enough.",
      },
      { ipHash: hashIp(freshIp()) ?? "unknown", userAgent: "fixture" },
    );
    // The flag follows the real transport configuration rather than a promise.
    const { env } = await import("@/server/config/env");
    expect(result.acknowledgementEmailQueued).toBe(env.mailConfigured);
  });

  it("rejects a submission with no security cookie", async () => {
    const form = enquiryFields();
    const response = await submitEnquiryRoute(
      new Request("http://localhost:3000/api/enquiries", {
        method: "POST",
        headers: new Headers({ accept: "application/json", "x-forwarded-for": freshIp() }),
        body: form,
      }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("csrf_failed");
  });

  it("rejects a cookie token that the hidden field does not match", async () => {
    const form = enquiryFields();
    form.set("csrfToken", "forged-value");
    const response = await submitEnquiryRoute(request(form));
    expect(response.status).toBe(403);
  });

  it("discards a submission that filled the hidden honeypot", async () => {
    const before = await countDocs("contact_enquiries", {});
    const form = enquiryFields({ website: "http://spam.example" });
    const response = await submitEnquiryRoute(request(form));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("spam_detected");
    expect(await countDocs("contact_enquiries", {})).toBe(before);
  });

  it("stops the sixth enquiry from one address inside an hour", async () => {
    const ip = freshIp();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await submitEnquiryRoute(request(enquiryFields(), { ip }));
      expect(response.status).toBe(200);
    }
    const blocked = await submitEnquiryRoute(request(enquiryFields(), { ip }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
  });

  it("reports which field failed without echoing what was typed", async () => {
    const response = await submitEnquiryRoute(request(enquiryFields({ message: "hi<img onerror=x>" })));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.fields?.message).toBeDefined();
    expect(JSON.stringify(body)).not.toContain("onerror");
  });

  it("accepts an enquiry that leaves the optional telephone blank", async () => {
    const form = enquiryFields();
    form.delete("phone");
    const response = await submitEnquiryRoute(request(form));
    expect(response.status).toBe(200);
  });

  it("sends a browser without JavaScript back to the page it came from", async () => {
    const response = await submitEnquiryRoute(
      request(enquiryFields({ message: "too short" }), {
        accept: "text/html,application/xhtml+xml",
        referer: "http://localhost:3000/contact",
        ip: freshIp(),
      }),
    );
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/contact");
    expect(location.searchParams.get("form_error")).toBe("validation_failed");
    expect(location.search).not.toContain("too short");
  });
});

describe("admission application", () => {
  it("accepts a complete form, stores it, and gives back only a reference", async () => {
    const form = applicationFields();
    form.append("documents", new File([PDF], "birth-certificate.pdf", { type: "application/pdf" }));
    form.append("documentTypes", "birth_certificate");

    const response = await submitApplicationRoute(applicationRequest(form));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.referenceNumber).toMatch(/^MCV-\d{4}-[2-9A-HJ-NP-Za-hj-np-z]{6}$/);
    expect(body.documentCount).toBe(1);
    // Nothing private is in the answer.
    expect(JSON.stringify(body)).not.toContain("storageKey");
    expect(JSON.stringify(body)).not.toContain("fixture.guardian");

    const row = await findDoc("admission_applications", {
      referenceNumber: body.referenceNumber,
    });
    if (!row) throw new Error("The application was not stored.");
    expect(row.status).toBe("submitted");
    expect(row.statusLookupHash).toBe(statusLookupHash(body.referenceNumber, "2018-04-02"));
  });

  it("stores an uploaded proof as a restricted file, never a public one", async () => {
    const form = applicationFields({ dateOfBirth: "2017-11-30", lastName: "PupilTwo" });
    form.append("documents", new File([PDF], "report-card.pdf", { type: "application/pdf" }));
    form.append("documentTypes", "report_card");

    const response = await submitApplicationRoute(applicationRequest(form));
    const body = await response.json();
    const row = await findDoc("admission_applications", {
      referenceNumber: body.referenceNumber,
    });
    if (!row) throw new Error("The application was not stored.");
    const links = await findDocs("application_documents", { applicationId: row.id });
    const files = await findDocs(
      "documents",
      { id: { $in: links.map((link) => link.documentId) } },
      { projection: { visibility: 1, category: 1 } },
    );
    expect(files).toHaveLength(1);
    expect(files[0].visibility).toBe("restricted");
    expect(files[0].category).toBe("report_card");
  });

  it("refuses a class the school has closed", async () => {
    await expect(
      submitApplication(
        applicationSchema.parse({
          firstName: "Fixture",
          lastName: "Closed",
          dateOfBirth: "2018-01-01",
          applyingClassId: CLOSED_CLASS_ID,
          guardianFirstName: "Fixture",
          guardianLastName: "Guardian",
          guardianEmail: `fixture.closed.${RUN}@invalid.example`,
          guardianPhone: "+00000000000",
          declarationAccepted: "on",
        }),
        { ipHash: hashIp(freshIp()) ?? "unknown", userAgent: "fixture", formData: new FormData() },
      ),
    ).rejects.toThrow(ApplicationRejectedError);
  });

  it("will not submit without the declaration", () => {
    const parsed = applicationSchema.safeParse({
      firstName: "Fixture",
      lastName: "Pupil",
      dateOfBirth: "2018-01-01",
      applyingClassId: "not-a-uuid",
      guardianFirstName: "Fixture",
      guardianLastName: "Guardian",
      guardianEmail: "not-an-email",
      guardianPhone: "abcdefgh",
    });
    if (parsed.success) throw new Error("expected the schema to refuse this fixture");
    const paths = parsed.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("declarationAccepted");
    expect(paths).toContain("guardianEmail");
    expect(paths).toContain("applyingClassId");
    expect(paths).toContain("guardianPhone");
  });

  it("counts a submission the validation refused against the address", async () => {
    const ip = freshIp();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await submitApplicationRoute(applicationRequest(applicationFields({ firstName: "" }), ip));
      expect(response.status).toBe(422);
    }
    const blocked = await submitApplicationRoute(applicationRequest(applicationFields(), ip));
    expect(blocked.status).toBe(429);
  });

  it("flags a second application for the same child instead of silently accepting a duplicate", async () => {
    const shared = {
      dateOfBirth: "2016-06-15",
      firstName: "Duplicate",
      lastName: `Fixture${RUN}`,
      guardianEmail: `duplicate.${RUN}@invalid.example`,
      guardianPhone: "+00001234567",
    };
    await submitApplicationRoute(applicationRequest(applicationFields(shared)));
    const second = await submitApplicationRoute(applicationRequest(applicationFields(shared)));
    const body = await second.json();
    const row = await findDoc("admission_applications", {
      referenceNumber: body.referenceNumber,
    });
    if (!row) throw new Error("The application was not stored.");
    const flags = await findDocs("application_duplicate_flags", {
      applicationId: row.id,
    });
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.map((flag) => flag.matchedOn)).toContain("same_dob_and_name");
  });

  it("says what a flag actually matched on, so a birthday twin is not called a name match", async () => {
    // The same birthday, a different child, a different guardian: the office
    // needs to see `same_dob` and not be told the names matched.
    const third = await submitApplicationRoute(
      applicationRequest(
        applicationFields({
          dateOfBirth: "2016-06-15",
          firstName: `Other${RUN}`,
          lastName: `Child${RUN}`,
          guardianEmail: `other.${RUN}@invalid.example`,
          guardianPhone: "+00009999999",
        }),
      ),
    );
    const body = await third.json();
    const row = await findDoc("admission_applications", {
      referenceNumber: body.referenceNumber,
    });
    if (!row) throw new Error("The application was not stored.");
    const flags = await findDocs("application_duplicate_flags", {
      applicationId: row.id,
    }, { projection: { matchedOn: 1 } });

    expect(flags.length).toBeGreaterThan(0);
    expect(new Set(flags.map((flag) => flag.matchedOn))).toEqual(new Set(["same_dob"]));
  });
});

describe("application status lookup", () => {
  const reference = `MCV-2026-${RUN.toUpperCase().padEnd(6, "Q").slice(0, 6)}`;
  const dob = "2015-09-01";

  beforeAll(async () => {
    await insertDoc("admission_applications", {
      referenceNumber: reference,
      firstName: "Fixture",
      lastName: "Lookup",
      dateOfBirth: dob,
      applyingClassId: CLASS_ID,
      guardianFirstName: "Fixture",
      guardianLastName: "Guardian",
      guardianEmail: `fixture.lookup.${RUN}@invalid.example`,
      guardianPhone: "+00000000000",
      statusLookupHash: statusLookupHash(reference, dob),
      status: "under_review",
      submittedAt: new Date(),
    });
  });

  it("answers only when both the reference and the date of birth match", async () => {
    expect(await lookupApplicationStatus(reference, dob)).not.toBeNull();
    expect(await lookupApplicationStatus(reference, "2015-09-02")).toBeNull();
    expect(await lookupApplicationStatus(`${reference}X`, dob)).toBeNull();
  });

  it("describes progress without exposing a document, a file name or a note", async () => {
    const status = await lookupApplicationStatus(reference, dob);
    expect(status).not.toBeNull();
    const serialised = JSON.stringify(status);
    expect(serialised).not.toContain("storageKey");
    expect(serialised).not.toContain("birth-certificate");
    expect(serialised).not.toContain("fixture.lookup");
  });

  it("refuses a status check that guesses a date of birth", async () => {
    const token = issueFormToken();
    const form = new FormData();
    form.set("csrfToken", token);
    form.set("referenceNumber", reference);
    form.set("dateOfBirth", "1900-01-01");

    const response = await lookupStatusRoute(
      new Request("http://localhost:3000/api/applications/status", {
        method: "POST",
        headers: new Headers({
          accept: "application/json",
          "x-forwarded-for": freshIp(),
          cookie: `${FORM_TOKEN_COOKIE}=${token}`,
        }),
        body: form,
      }),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });

  it("makes every lookup count, including the ones that find nothing", async () => {
    const ip = freshIp();
    const ipHash = hashIp(ip)!;
    const before = await countDocs("audit_logs", {
      action: "admission.status_lookup",
      ipHash,
    });

    for (const dob of ["1900-01-01", "1900-01-02", "1900-01-03"]) {
      const token = issueFormToken();
      const form = new FormData();
      form.set("csrfToken", token);
      form.set("referenceNumber", reference);
      form.set("dateOfBirth", dob);
      await lookupStatusRoute(
        new Request("http://localhost:3000/api/applications/status", {
          method: "POST",
          headers: new Headers({ accept: "application/json", "x-forwarded-for": ip, cookie: `${FORM_TOKEN_COOKIE}=${token}` }),
          body: form,
        }),
      );
    }

    const after = await countDocs("audit_logs", {
      action: "admission.status_lookup",
      ipHash,
    });
    expect(after - before).toBe(3);
  });
});

describe("submissions survive a restart", () => {
  it("reads back rows through a connection the process has never used", async () => {
    const form = applicationFields({ dateOfBirth: "2014-02-02", lastName: "Durable" });
    const response = await submitApplicationRoute(applicationRequest(form));
    const reference = (await response.json()).referenceNumber as string;

    // A separate client is another process's worth of connections. Nothing is
    // shared with the application's pool except the database on disk, which is
    // what a restart looks like to the code.
    const fresh = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 20_000 });
    await fresh.connect();
    const row = await fresh
      .db(testDatabaseName())
      .collection("admission_applications")
      .findOne({ referenceNumber: reference });
    await fresh.close();

    expect(row).not.toBeNull();
    expect(row!.status).toBe("submitted");
  });
});

describe("the rate limiter", () => {
  it("counts only the window it is given", async () => {
    const ipHash = hashIp(freshIp())!;
    await assertRateLimit({ action: "fixture.long_window", ipHash, limit: 1, windowMinutes: 60 });
    await expect(
      (async () => {
        await insertDoc("audit_logs", {
          action: "fixture.long_window",
          ipHash,
          resourceType: "public_form",
        });
        await assertRateLimit({ action: "fixture.long_window", ipHash, limit: 1, windowMinutes: 60 });
      })(),
    ).rejects.toBeInstanceOf(RateLimitedError);

    // The same address, a different action: unrelated forms do not share a budget.
    await expect(
      assertRateLimit({ action: "fixture.other_action", ipHash, limit: 1, windowMinutes: 60 }),
    ).resolves.toBeUndefined();
  });
});
