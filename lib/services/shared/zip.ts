const crcTable = new Uint32Array(256);

for (let i = 0; i < 256; i += 1) {
  let value = i;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  crcTable[i] = value >>> 0;
}

export type ZipFileInput = {
  name: string;
  content: Uint8Array;
};

type CentralDirectoryEntry = {
  nameBytes: Uint8Array;
  crc32: number;
  size: number;
  localHeaderOffset: number;
};

function getCrc32(content: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of content) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function getSafeFileName(name: string, index: number) {
  const trimmed = name.trim().replace(/[\\/:\0]/g, "_");
  return trimmed.length > 0 ? trimmed : `file-${index + 1}`;
}

function dedupeFileNames(files: ZipFileInput[]) {
  const seen = new Map<string, number>();

  return files.map((file, index) => {
    const safeName = getSafeFileName(file.name, index);
    const count = seen.get(safeName) ?? 0;
    seen.set(safeName, count + 1);

    if (count === 0) {
      return safeName;
    }

    const dotIndex = safeName.lastIndexOf(".");
    if (dotIndex > 0) {
      return `${safeName.slice(0, dotIndex)}-${count + 1}${safeName.slice(dotIndex)}`;
    }

    return `${safeName}-${count + 1}`;
  });
}

export function createZipArchive(files: ZipFileInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const names = dedupeFileNames(files);
  const chunks: Uint8Array[] = [];
  const centralDirectory: CentralDirectoryEntry[] = [];
  let offset = 0;

  files.forEach((file, index) => {
    const nameBytes = encoder.encode(names[index]);
    const crc32 = getCrc32(file.content);
    const localHeader = new Uint8Array(30 + nameBytes.length);

    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, 0x0800);
    writeUint16(localHeader, 8, 0);
    writeUint16(localHeader, 10, 0);
    writeUint16(localHeader, 12, 0);
    writeUint32(localHeader, 14, crc32);
    writeUint32(localHeader, 18, file.content.length);
    writeUint32(localHeader, 22, file.content.length);
    writeUint16(localHeader, 26, nameBytes.length);
    writeUint16(localHeader, 28, 0);
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader, file.content);
    centralDirectory.push({
      nameBytes,
      crc32,
      size: file.content.length,
      localHeaderOffset: offset,
    });
    offset += localHeader.length + file.content.length;
  });

  const centralDirectoryStart = offset;

  for (const entry of centralDirectory) {
    const header = new Uint8Array(46 + entry.nameBytes.length);

    writeUint32(header, 0, 0x02014b50);
    writeUint16(header, 4, 20);
    writeUint16(header, 6, 20);
    writeUint16(header, 8, 0x0800);
    writeUint16(header, 10, 0);
    writeUint16(header, 12, 0);
    writeUint16(header, 14, 0);
    writeUint32(header, 16, entry.crc32);
    writeUint32(header, 20, entry.size);
    writeUint32(header, 24, entry.size);
    writeUint16(header, 28, entry.nameBytes.length);
    writeUint16(header, 30, 0);
    writeUint16(header, 32, 0);
    writeUint16(header, 34, 0);
    writeUint16(header, 36, 0);
    writeUint32(header, 38, 0);
    writeUint32(header, 42, entry.localHeaderOffset);
    header.set(entry.nameBytes, 46);

    chunks.push(header);
    offset += header.length;
  }

  const centralDirectorySize = offset - centralDirectoryStart;
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 4, 0);
  writeUint16(end, 6, 0);
  writeUint16(end, 8, centralDirectory.length);
  writeUint16(end, 10, centralDirectory.length);
  writeUint32(end, 12, centralDirectorySize);
  writeUint32(end, 16, centralDirectoryStart);
  writeUint16(end, 20, 0);
  chunks.push(end);
  offset += end.length;

  const archive = new Uint8Array(offset);
  let cursor = 0;

  for (const chunk of chunks) {
    archive.set(chunk, cursor);
    cursor += chunk.length;
  }

  return archive;
}
