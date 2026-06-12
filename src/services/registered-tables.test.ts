import { describe, expect, it } from "vitest";
import { touchLru } from "./registered-tables";

describe("touchLru", () => {
  it("appends a new id as most-recent with nothing to evict under cap", () => {
    expect(touchLru([], "qr_1", 3)).toEqual({ next: ["qr_1"], evict: [] });
  });

  it("evicts the oldest id when the cap is exceeded", () => {
    expect(touchLru(["qr_1", "qr_2", "qr_3"], "qr_4", 3)).toEqual({
      next: ["qr_2", "qr_3", "qr_4"],
      evict: ["qr_1"],
    });
  });

  it("re-touching an existing id moves it to most-recent and evicts nothing", () => {
    expect(touchLru(["qr_1", "qr_2", "qr_3"], "qr_1", 3)).toEqual({
      next: ["qr_2", "qr_3", "qr_1"],
      evict: [],
    });
  });

  it("never evicts the id being touched, even when the cap is smaller than the backlog", () => {
    const result = touchLru(["qr_1", "qr_2"], "qr_3", 1);
    expect(result.next).toEqual(["qr_3"]);
    expect(result.evict).toEqual(["qr_1", "qr_2"]);
  });
});
