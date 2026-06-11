import { describe, expect, it } from "vitest";
import { bboxPrunePredicate } from "./bbox";

describe("bboxPrunePredicate", () => {
  it("builds a row-group prunable predicate over flat bbox columns", () => {
    expect(bboxPrunePredicate({ minx: -3.8, miny: 40.3, maxx: -3.6, maxy: 40.5 })).toBe(
      "xmax >= -3.8 AND xmin <= -3.6 AND ymax >= 40.3 AND ymin <= 40.5",
    );
  });
  it("returns TRUE when bounds are absent", () => {
    expect(bboxPrunePredicate(null)).toBe("TRUE");
  });
});
