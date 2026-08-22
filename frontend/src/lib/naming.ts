/**
 * Shared derivation of a draft skill identity from the goal + URL the user
 * typed. The teaching card and live proposal both use this, so the
 * draft transitions into a card with the same name it was created under.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "my", "our", "your", "for", "of", "in", "on", "to",
  "from", "and", "with", "please", "me", "it", "its",
]);

const ACRONYMS = new Set(["pnr", "epf", "epfo", "gst", "cnr", "uan", "usn", "api", "otp", "id"]);

export interface DraftIdentity {
  id: string;
  name: string;
  domain: string;
}

export function deriveDraft(goal: string, url: string): DraftIdentity {
  const words = goal
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));

  const kept = (words.length > 0 ? words : ["new", "skill"]).slice(0, 4);

  const id = kept.join("-");
  const name = kept
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

  let domain = "unknown site";
  try {
    domain = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    /* keep fallback */
  }

  return { id, name, domain };
}
