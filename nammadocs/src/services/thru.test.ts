import { afterEach, describe, expect, it, vi } from "vitest";
import { runSkill } from "./thru";

afterEach(() => vi.unstubAllGlobals());
describe("THRU client", () => {
  it("accepts a direct envelope", async () => {
    const envelope = { skill: "test", version: 1, status: "success", data: { ok: true }, healing: [], needs_human: null, timing_ms: 12 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => envelope }));
    const result = await runSkill("test", {}, () => undefined); expect(result).toEqual(envelope);
  });
  it("polls a queued run to completion", async () => {
    const envelope = { skill: "test", version: 1, status: "success", data: { ok: true }, healing: [], needs_human: null, timing_ms: 12 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ status: 202, ok: true, json: async () => ({ id: "run-1", state: "queued" }) }).mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ id: "run-1", state: "completed", result: envelope }) }));
    const result = await runSkill("test", {}, () => undefined); expect(result.status).toBe("success");
  });
  it("never silently falls back after a live failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(runSkill("test", {}, () => undefined)).rejects.toThrow("offline");
  });
});
