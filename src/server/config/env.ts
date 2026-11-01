import { z } from "zod";

/**
 * Environment parsing.
 *
 * In production every secret must be supplied by the platform; the process
 * refuses to boot otherwise. Outside production, development-only fallbacks
 * keep `npm run dev` and the test suite working without a prepared .env file.
 * The fallbacks are fixed, non-secret values and are logged loudly at startup.
 */

const nonProduction = process.env.NODE_ENV !== "production";

/** Never reuse outside local development: a published constant is not a secret. */
const DEV_ONLY_SECRET = "dev-only-insecure-secret-do-not-use-in-production-32b";

const envSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /**
   * Which half of the platform this deployment is. The public site and the
   * portal may run as two deployments of the same build against one database;
   * the portal deployment sets `portal` so its copy of the public pages — which
   * is reachable at the portal's own hostname — is not indexed as a duplicate
   * of the real site.
   */
  SITE_ROLE: z.enum(["site", "portal"]).default("site"),

  MONGODB_URI: z.string().min(1),
  MONGODB_DATABASE: z.string().min(1).default("mongal_chandra_vidyapith"),

  CSRF_SECRET: z.string().min(32, "CSRF_SECRET must be at least 32 characters"),
  /**
   * The salt the abuse counters hash client addresses with. It is a separate
   * secret from the one above because it has a separate life: every instance
   * must derive the same digest or a limit counted by one cold start is
   * invisible to the next. Rotating it orphans the history, which is the correct
   * reading of "start the counters fresh".
   */
  IP_HASH_SECRET: z.string().min(32, "IP_HASH_SECRET must be at least 32 characters"),
  /** Session lifetime, configurable per school policy. Capped at 30 days. */
  SESSION_TTL_HOURS: z.coerce.number().int().positive().max(24 * 30).default(12),

  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().max(20).default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().max(1440).default(15),

  /** Hard ceiling for a single upload, in bytes. */
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),

  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(1).optional(),

  PAYMENT_PROVIDER: z.enum(["razorpay", "stripe"]).optional(),
  PAYMENT_PUBLIC_KEY: z.string().min(1).optional(),
  PAYMENT_SECRET_KEY: z.string().min(1).optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().min(1).optional(),
});

const withDevFallbacks = (raw: Record<string, string | undefined>) => ({
  ...raw,
  MONGODB_URI: raw.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
  CSRF_SECRET: nonProduction ? DEV_ONLY_SECRET : raw.CSRF_SECRET,
  IP_HASH_SECRET: nonProduction ? DEV_ONLY_SECRET : raw.IP_HASH_SECRET,
});

const parsed = envSchema.safeParse(withDevFallbacks(process.env));

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example`);
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
  /** True when a real SMTP account is configured; otherwise mail is reported as unsent. */
  mailConfigured: Boolean(parsed.data.SMTP_HOST && parsed.data.MAIL_FROM),
  /** True only when a payment provider is fully configured. */
  paymentsConfigured: Boolean(
    parsed.data.PAYMENT_PROVIDER &&
      parsed.data.PAYMENT_SECRET_KEY &&
      parsed.data.PAYMENT_WEBHOOK_SECRET,
  ),
  usingDevSecrets: parsed.data.IP_HASH_SECRET === DEV_ONLY_SECRET,
};

export type AppEnv = typeof env;

if (env.usingDevSecrets && !env.isTest) {
  console.warn(
    "[config] Using development fallback secrets. Set CSRF_SECRET and IP_HASH_SECRET before deploying.",
  );
}
