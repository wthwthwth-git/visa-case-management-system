import { describe, expect, it } from "vitest";
import { createZipArchive } from "./zip";

function readUint32(data: Uint8Array, offset: number) {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    (data[offset + 3] << 24)
  ) >>> 0;
}

describe("createZipArchive", () => {
  it("creates a zip archive with local and central directory records", () => {
    const archive = createZipArchive([
      {
        name: "passport.txt",
        content: new TextEncoder().encode("passport"),
      },
      {
        name: "passport.txt",
        content: new TextEncoder().encode("copy"),
      },
    ]);
    const text = new TextDecoder().decode(archive);

    expect(readUint32(archive, 0)).toBe(0x04034b50);
    expect(text).toContain("passport.txt");
    expect(text).toContain("passport-2.txt");
    expect(readUint32(archive, archive.length - 22)).toBe(0x06054b50);
  });
});
