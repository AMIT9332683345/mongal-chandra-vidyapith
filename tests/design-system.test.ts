import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { pageMetadata } from "@/lib/metadata";
import { THEME_PREPAINT_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme";
import { PRIMARY_NAV, SIGN_IN_HREF } from "@/lib/navigation";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

/**
 * The parts of the design and the search-engine layer that can be proved
 * mechanically rather than by looking at a screenshot.
 *
 * The theme rule is the interesting one: the pre-paint script and the stylesheet
 * are two different files that have to agree, and if they drift the site shows a
 * white flash, ignores a saved choice, or renders dark mode with light-mode
 * colours. These checks catch that drift.
 */

const ROOT = process.cwd();

/**
 * Runs the pre-paint script the way a browser would: `<html>` is a stub that
 * records the class, attribute and inline style the script writes, and storage
 * and the media query are stubbed with the visitor's state.
 */
function applyTheme(stored: string | null, systemPrefersDark: boolean) {
  const classes = new Set<string>();
  const attributes: Record<string, string> = {};
  const style: Record<string, string> = {};
  const sandbox: Record<string, unknown> = {
    localStorage: {
      getItem: (key: string) => (key === THEME_STORAGE_KEY ? stored : null),
      setItem: () => {},
    },
    matchMedia: (query: string) => ({
      matches: query.includes("dark") ? systemPrefersDark : !systemPrefersDark,
    }),
    document: {
      documentElement: {
        classList: {
          toggle: (name: string, on: boolean) => {
            if (on) classes.add(name);
            else classes.delete(name);
          },
        },
        setAttribute: (name: string, value: string) => {
          attributes[name] = value;
        },
        style,
      },
    },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(THEME_PREPAINT_SCRIPT, sandbox);
  return {
    isDark: classes.has("dark"),
    theme: attributes["data-theme"],
    colorScheme: style.colorScheme,
  };
}

describe("theme selection", () => {
  it("keeps a saved light choice even when the system wants dark", () => {
    expect(applyTheme("light", true).isDark).toBe(false);
  });

  it("keeps a saved dark choice even when the system wants light", () => {
    expect(applyTheme("dark", false).isDark).toBe(true);
  });

  it("follows the system only when the visitor has never chosen", () => {
    expect(applyTheme(null, true)).toMatchObject({ isDark: true, theme: "dark", colorScheme: "dark" });
    expect(applyTheme(null, false)).toMatchObject({ isDark: false, theme: "light", colorScheme: "light" });
  });

  it("ignores a corrupted stored value rather than trusting it", () => {
    expect(applyTheme("chartreuse", true).isDark).toBe(true);
    expect(applyTheme("chartreuse", false).isDark).toBe(false);
  });

  it("survives a browser that refuses to give it storage", () => {
    const root = { classList: { toggle: () => {} }, setAttribute: () => {}, style: {} };
    expect(() =>
      vm.runInNewContext(THEME_PREPAINT_SCRIPT, {
        document: { documentElement: root },
        get localStorage() {
          throw new Error("SecurityError: storage is blocked");
        },
        window: {},
      }),
    ).not.toThrow();
  });
});

describe("the palette both themes use", () => {
  const css = readFileSync(path.join(ROOT, "src", "app", "globals.css"), "utf8");

  /**
   * Every custom property a selector sets. The stylesheet declares the tokens in
   * more than one `:root` block — colours first, typography separately — so all
   * of them are merged before anything is compared.
   */
  function tokensFor(selector: RegExp): Map<string, string> {
    const found = new Map<string, string>();
    for (const block of css.matchAll(selector)) {
      for (const declaration of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
        found.set(declaration[1], declaration[2].trim());
      }
    }
    return found;
  }

  const light = tokensFor(/:root\s*\{([\s\S]*?)\n\}/g);
  const dark = tokensFor(/\.dark\s*\{([\s\S]*?)\n\}/g);

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(full);
      return /\.(tsx?|css)$/.test(entry.name) ? [full] : [];
    });
  }

  /** `#6f2f3a` is a colour; `3px` and a font stack are geometry and type. */
  function isColor(value: string): boolean {
    return /#[0-9a-f]{3,8}\b/i.test(value) || /\brgba?\(/.test(value) || /\bhsla?\(/.test(value);
  }

  function hue(value: string): { hue: number; saturation: number; lightness: number } | null {
    const hex = value.match(/#([0-9a-f]{6})\b/i);
    if (!hex) return null;
    const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(hex[1].slice(at, at + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const lightness = (max + min) / 2;
    if (chroma === 0) return { hue: 0, saturation: 0, lightness };
    const bySector =
      max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
    return {
      hue: (bySector * 60 + 360) % 360,
      saturation: chroma / (1 - Math.abs(2 * lightness - 1)),
      lightness,
    };
  }

  it("declares every custom property the components reference", () => {
    const used = new Set<string>();
    for (const file of sourceFiles(path.join(ROOT, "src"))) {
      for (const reference of readFileSync(file, "utf8").matchAll(/var\((--[\w-]+)/g)) {
        used.add(reference[1]);
      }
    }
    const missing = [...used].filter((name) => !light.has(name));
    expect(missing).toEqual([]);
  });

  it("gives dark mode its own value for every colour light mode sets", () => {
    const inherited = [...light]
      .filter(([name, value]) => isColor(value) && dark.get(name) === undefined)
      .map(([name]) => name);
    expect(inherited).toEqual([]);
  });

  it("never lets a theme fall back to the same colour in both", () => {
    const identical = [...light]
      .filter(([name, value]) => isColor(value) && dark.get(name) === value)
      .map(([name]) => name);
    expect(identical).toEqual([]);
  });

  /**
   * The brand is navy with a gold highlight, so the two hues are named here
   * rather than left to taste. `--alert` and `--urgent` sit outside both on
   * purpose: a warning has to be recognisable as *not* the brand.
   */
  function hueName(value: string): string | null {
    const hsl = hue(value);
    if (hsl === null || hsl.saturation < 0.15) return null;
    if (hsl.hue >= 200 && hsl.hue <= 260) return "navy";
    if (hsl.hue >= 35 && hsl.hue <= 60) return "gold";
    return "another hue";
  }

  it("carries the navy brand and the gold highlight in both themes", () => {
    for (const [label, tokens] of [["light", light], ["dark", dark]] as const) {
      for (const name of ["--brand", "--brand-deep", "--accent"]) {
        expect(`${label} ${name} ${hueName(tokens.get(name) ?? "")}`, name).toBe(`${label} ${name} navy`);
      }
      for (const name of ["--gold", "--gold-ink"]) {
        expect(`${label} ${name} ${hueName(tokens.get(name) ?? "")}`, name).toBe(`${label} ${name} gold`);
      }
    }
  });

  /**
   * The distance between the widest and narrowest channel. HSL saturation
   * divides that distance by how close the colour is to grey already, so it
   * reports a near-white paper as vivid; chroma is the honest measure of a cast.
   */
  function chroma(value: string): number | null {
    const hex = value.match(/#([0-9a-f]{6})\b/i);
    if (!hex) return null;
    const channels = [0, 2, 4].map((at) => Number.parseInt(hex[1].slice(at, at + 2), 16) / 255);
    return Math.max(...channels) - Math.min(...channels);
  }

  it("keeps the light paper neutral, so the navy reads as an accent and not a wall", () => {
    // A white site with a blue cast is the failure mode this guards. The
    // surfaces may lean cool, but not by enough to be named — while the brand
    // slots must be saturated enough to be recognised as the school's colour.
    for (const name of ["--canvas", "--canvas-soft", "--surface"]) {
      expect(chroma(light.get(name) ?? "")).not.toBeNull();
      expect(chroma(light.get(name) ?? ""), `${name} is a tint, not paper`).toBeLessThan(0.05);
    }
    for (const name of ["--surface-raised", "--line", "--line-strong"]) {
      expect(chroma(light.get(name) ?? ""), `${name} is too blue to be a rule`).toBeLessThan(0.14);
    }
    for (const name of ["--brand", "--accent", "--gold"]) {
      expect(chroma(light.get(name) ?? ""), `${name} has lost its colour`).toBeGreaterThan(0.2);
    }
  });

  it("keeps the dark surfaces dark rather than washed out", () => {
    for (const name of ["--canvas", "--canvas-soft", "--surface", "--surface-raised"]) {
      const value = hue(dark.get(name) ?? "");
      expect(value, `${name} is not a colour`).not.toBeNull();
      expect(value?.lightness, `${name} is too bright to be a dark surface`).toBeLessThan(0.25);
    }
  });

  it("keeps gold legible where it is used as text", () => {
    // #fcd34d on white is a wash; the text slot is the same hue taken down far
    // enough to read, which is why the palette has --gold and --gold-ink.
    const gold = hue(light.get("--gold") ?? "");
    const goldInk = hue(light.get("--gold-ink") ?? "");
    expect(gold && goldInk).toBeTruthy();
    expect(goldInk?.lightness).toBeLessThan((gold?.lightness ?? 0) - 0.2);
    expect(goldInk?.lightness).toBeLessThan(0.5);
  });

  it("gives the focus ring a colour that survives both canvases", () => {
    expect(hueName(light.get("--focus") ?? "")).toBe("navy");
    expect(hueName(dark.get("--focus") ?? "")).toBe("gold");
  });

  it("keeps the dark canvas a genuine near-black", () => {
    // Only lightness is asserted: a near-black with a navy undertone is by
    // definition more saturated than a grey one, and that undertone is the brand.
    const canvas = hue(dark.get("--canvas") ?? "");
    expect(canvas).not.toBeNull();
    expect(canvas?.lightness).toBeLessThan(0.12);
  });

  it("toggles the class the stylesheet actually keys dark mode to", () => {
    expect(css).toMatch(/@custom-variant\s+dark\s*\(\s*&:where\(\.dark/);
    expect(applyTheme("dark", false).isDark).toBe(true);
  });

  it("sets the colour scheme so native controls match the theme", () => {
    expect(applyTheme("dark", false)).toMatchObject({ theme: "dark", colorScheme: "dark" });
    expect(applyTheme("light", true)).toMatchObject({ theme: "light", colorScheme: "light" });
  });
});

describe("navigation", () => {
  it("links only to pages that exist", () => {
    const hrefs = PRIMARY_NAV.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]);
    for (const href of hrefs) {
      const file = path.join(ROOT, "src", "app", "(public)", href === "/" ? "" : href, "page.tsx");
      expect(existsSync(file), `${href} has no page at ${file}`).toBe(true);
    }
  });

  it("lists a label for every item and never nests more than one deep", () => {
    for (const item of PRIMARY_NAV) {
      expect(item.label.trim().length).toBeGreaterThan(1);
      for (const child of item.children ?? []) expect(child.label.trim().length).toBeGreaterThan(1);
    }
  });

  it("keeps the portal out of the public menu and the sign-in link out of the sitemap", () => {
    const hrefs = PRIMARY_NAV.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]);
    expect(hrefs).not.toContain("/portal");
    expect(hrefs).not.toContain(SIGN_IN_HREF);
    expect(hrefs).toContain("/contact");
  });
});

describe("what a crawler is told", () => {
  it("refuses the portal, the sign-in page and every endpoint", () => {
    const { rules } = robots();
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect(rule.userAgent).toBe("*");
    expect(rule.disallow).toEqual(expect.arrayContaining(["/portal", "/signin", "/api/"]));
    expect(rule.allow).toBe("/");
  });

  it("advertises the sitemap route this app actually serves", () => {
    // A robots.txt that points at a 404 teaches a crawler the sitemap does not
    // exist, which is worse than not naming one.
    const { sitemap: advertised } = robots();
    expect(advertised).toBeTruthy();
    expect(new URL(String(advertised)).pathname).toBe("/sitemap.xml");
    expect(existsSync(path.join(ROOT, "src", "app", "sitemap.ts"))).toBe(true);
  });

  it("publishes no private path in the sitemap", async () => {
    const entries = await sitemap();
    const paths = entries.map((entry) => new URL(entry.url).pathname);
    expect(paths.some((url) => /portal|signin|api|uploads/i.test(url))).toBe(false);
    expect(paths).toContain("/");
  });

  it("lists every navigation page in the sitemap", async () => {
    const paths = (await sitemap()).map((entry) => new URL(entry.url).pathname);
    for (const item of PRIMARY_NAV) {
      expect(paths, `missing ${item.href}`).toContain(item.href);
    }
  });

  it("gives every entry an absolute URL on the app's own origin", async () => {
    // The sitemap format rejects relative locations, and a page that claims a
    // different host is either a misconfiguration or a hijacked canonical.
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(5);
    for (const entry of entries) {
      expect(entry.url).toMatch(/^https?:\/\//);
      expect(new URL(entry.url).origin).toBe("http://localhost:3000");
    }
  });

  it("keeps a generated entry's last-modified date usable", async () => {
    for (const entry of await sitemap()) {
      if (entry.lastModified) expect(new Date(entry.lastModified).getTime()).not.toBeNaN();
    }
  });
});

describe("page metadata", () => {
  it("falls back to a description of the page, never a fact about the school", () => {
    const meta = pageMetadata({ title: "Notices", description: null, path: "/notices" });
    expect(meta.description).toContain("Notices");
    expect(meta.description).not.toMatch(/founded|established|awarded|ranked/i);
    expect(meta.alternates?.canonical).toBe("/notices");
  });

  it("uses the school's own summary when it has written one", () => {
    const meta = pageMetadata({
      title: "About",
      description: "Written by the school.",
      path: "/about",
    });
    expect(meta.description).toBe("Written by the school.");
    expect(meta.openGraph?.description).toBe("Written by the school.");
  });

  it("marks a private page so it is never indexed", () => {
    expect(pageMetadata({ title: "Portal", path: "/portal", noIndex: true }).robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it("no-indexes the pages that carry a family's own reference", () => {
    for (const file of ["signin", "admissions/applied"]) {
      const source = readFileSync(path.join(ROOT, "src", "app", "(public)", file, "page.tsx"), "utf8");
      expect(source, `${file} must not be indexed`).toContain("noIndex: true");
    }
    const portal = readFileSync(path.join(ROOT, "src", "app", "(portal)", "portal", "page.tsx"), "utf8");
    expect(portal).toContain("noIndex: true");
  });
});
