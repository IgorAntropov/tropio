function fourCC(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

export function coverFileType(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  const view = new DataView(buffer);
  if (bytes.length >= 8 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
    for (let offset = 8; offset + 12 <= bytes.length; offset += 12 + view.getUint32(offset)) {
      if (fourCC(bytes, offset + 4) === 'acTL') {
        return 'animated';
      }
    }
    return 'image/png';
  }
  if (fourCC(bytes, 0) === 'RIFF' && fourCC(bytes, 8) === 'WEBP') {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const chunk = fourCC(bytes, offset);
      const size = view.getUint32(offset + 4, true);
      if (chunk === 'ANIM' || chunk === 'ANMF' || (chunk === 'VP8X' && size > 0 && ((bytes[offset + 8] ?? 0) & 2) !== 0)) {
        return 'animated';
      }
      offset += 8 + size + size % 2;
    }
    return 'image/webp';
  }
}
