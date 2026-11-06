import { expect, it } from "vitest";
import { formatBytes } from "./format";

it("uses byte units at directory-list boundaries", () => {
  expect(formatBytes(0)).toBe("0 B");
  expect(formatBytes(1023)).toBe("1023 B");
  expect(formatBytes(1024)).toBe("1.0 KiB");
  expect(formatBytes(1572864)).toBe("1.5 MiB");
});
