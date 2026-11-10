import { expect, it } from "vitest";
import { compare, type Entry } from "./browser";

const item = (name: string, directory = false): Entry => ({
  id: name,
  name,
  directory,
  link: false,
  hidden: false,
  size: 0,
  modified: null,
});
it("keeps directories first and sorts numeric names naturally in both directions", () => {
  const entries = [item("10"), item("folder", true), item("2")];
  expect(
    [...entries]
      .sort((a, b) => compare(a, b, "name", false))
      .map((e) => e.name),
  ).toEqual(["folder", "2", "10"]);
  expect(
    [...entries].sort((a, b) => compare(a, b, "name", true)).map((e) => e.name),
  ).toEqual(["folder", "10", "2"]);
});
