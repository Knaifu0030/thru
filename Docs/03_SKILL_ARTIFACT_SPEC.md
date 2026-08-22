# 03 — THE SKILL ARTIFACT SPEC (`.skill.json`)

> This file format is the platform bet. Surfaces come and go; the artifact is forever. Design it like a file format, not a config: versioned, self-describing, portable, and safe to share. The coding agent implements this EXACTLY; changes require editing this doc first.

## Design Requirements
1. **Self-describing** — a skill file alone is enough to render its card, generate its form, type its API, and register its MCP tool. No sidecar files.
2. **Portable** — contains no credentials, no personal data, no machine-specific paths. Export/import must be a file copy.
3. **Alive** — carries its own version history, run stats, and healing log.
4. **Safe** — sensitivity flags are part of the format, inherited through healing, removable only by a human author action.

## The Format (v1)

```json
{
  "forge_spec": 1,
  "skill": {
    "id": "check-pnr",
    "name": "Check PNR Status",
    "description": "Gets current booking status for an Indian Railways PNR: train, journey date, and per-passenger status.",
    "site": { "domain": "verified-on-demo-day.example", "display": "Indian Railways PNR Enquiry" },
    "version": 4,
    "forged_at": "2026-08-22T10:14:03+05:30",
    "author": { "name": "you", "id": "local" },
    "tags": ["travel", "railways", "status-check"],
    "sensitive": false
  },

  "contract": {
    "inputs": {
      "type": "object",
      "properties": {
        "pnr": { "type": "string", "pattern": "^[0-9]{10}$", "description": "10-digit PNR number" }
      },
      "required": ["pnr"]
    },
    "outputs": {
      "type": "object",
      "properties": {
        "train":   { "type": "object", "properties": { "number": {"type":"string"}, "name": {"type":"string"} } },
        "journey_date": { "type": "string", "format": "date" },
        "passengers": { "type": "array", "items": { "type": "object",
          "properties": { "seq": {"type":"integer"}, "current_status": {"type":"string"} } } }
      }
    },
    "render_hint": "table:passengers"
  },

  "workflow": {
    "engine": "webcmd",
    "steps": [
      {
        "id": "s1",
        "action": "navigate",
        "target_description": "PNR enquiry page",
        "url": "{site}",
        "expect": { "contains": ["PNR"], "not_contains": ["maintenance", "login"] },
        "timeout_ms": 15000,
        "sensitive": false
      },
      {
        "id": "s2",
        "action": "fill",
        "target_description": "PNR input box — 10-digit numeric field",
        "selector_primary": "#inputPnrNo",
        "selector_fallbacks": ["input[placeholder*='PNR']", "input[maxlength='10']"],
        "value_from": "inputs.pnr",
        "expect": { "field_value_equals": "inputs.pnr" },
        "timeout_ms": 8000,
        "sensitive": false
      },
      {
        "id": "s3",
        "action": "click",
        "target_description": "submit button labeled like 'Get Status'",
        "selector_primary": "#modal1 button.btn-primary",
        "selector_fallbacks": ["button[type=submit]"],
        "expect": { "contains": ["Journey Details"], "not_contains": ["Invalid PNR", "captcha"] },
        "timeout_ms": 20000,
        "sensitive": false
      },
      {
        "id": "s4",
        "action": "extract",
        "target_description": "journey + passenger status table",
        "extraction": {
          "strategy": "header_map",
          "map_to": "outputs"
        },
        "expect": { "min_items": { "path": "outputs.passengers", "count": 1 } },
        "timeout_ms": 10000,
        "sensitive": false
      }
    ]
  },

  "vitals": {
    "runs": 17, "successes": 16, "healed_runs": 2, "avg_ms": 6100,
    "last_run": "2026-08-22T13:40:11+05:30",
    "last_heal": { "at": "2026-08-22T12:02:44+05:30", "step": "s3", "rung": "relocate",
                   "note": "'Get Status' → 'Check Status' (0.92 match)" }
  },

  "history": [
    { "version": 3, "changed_step": "s3", "reason": "heal:relocate", "at": "…", "previous_step": { "...": "full old step object" } }
  ]
}
```

## Field Rules (agent: enforce)

- `skill.id`: kebab-case, unique in registry, becomes the REST path (`/skills/{id}`) and the MCP tool name (`thru_{id}` with `-`→`_`). Collision on import → suffix `-2`, never overwrite.
- `contract.inputs/outputs`: JSON Schema (draft-07 subset: type/properties/required/pattern/format/items/description). The form generator, REST validator, and MCP tool schema all read THIS — one schema, three surfaces (parity principle).
- `render_hint`: how the Use tab displays results — `table:<path>` | `keyvalue` | `raw`. Optional; default `keyvalue`.
- `expect`: every step ≥1 positive AND ≥1 negative check. Vocabulary: `contains` (page text), `not_contains`, `url_contains`, `element_present`, `field_value_equals`, `min_items`.
- `sensitive`: step-level. Any of {login, otp, captcha, payment, submit-with-side-effects} MUST be flagged during teaching. Healing can ADD flags, never remove (see `05`). Skill-level `sensitive` = OR of steps; renders 🔒 on the card; Gateway returns `needs_human` for these unless run locally with a human present.
- `vitals`: updated after every run, atomically with a `.bak`. `healed_runs` counts runs that succeeded via any ladder rung ≥2.
- `history`: append-only, cap last 10 versions, each entry embeds the FULL previous step object (diff-able, revertible).
- Export strips nothing (artifact is already credential-free by construction); import validates against `forge_spec` and re-registers surfaces hot. The serialized names `forge_spec` and `forged_at` are retained as v1 compatibility fields; they are not customer-facing THRU branding.

## Gateway Response Envelope (REST + MCP share it)

```json
{
  "skill": "check-pnr", "version": 4,
  "status": "success | healed_success | invalid_input | portal_error | needs_human",
  "data": { "…per outputs schema…" },
  "healing": [ { "step": "s3", "rung": "relocate", "note": "…" } ],
  "needs_human": { "reason": "captcha", "how": "Run locally: thru run check-pnr — a human must complete the captcha." },
  "timing_ms": 6100
}
```

Status semantics: `healed_success` is a SUCCESS that also advertises the immune system (never hide it); `needs_human` is not an error — it's the permission layer speaking; `portal_error` always includes the `healing` trail showing every rung attempted.
