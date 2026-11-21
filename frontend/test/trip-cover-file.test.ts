import {
  expect,
  it,
  vi,
} from 'vitest';
import { effectScope } from 'vue';
import { useImageFile } from '../src/shared/image-file';
import { imageFileType } from '../src/shared/image-file/file-type';

const stillPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
const animatedPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAABAAAAAQAAAAAAAAAAABkD6AAAsjxHswAAAAxJREFUeJxj+M/AAAADAQEAyf6S7wAAABpmY1RMAAAAAQAAAAEAAAABAAAAAAAAAAAAGQPoAAApT61nAAAAEGZkQVQAAAACeJxjYGD4DwABAwEAaL/t9AAAAABJRU5ErkJggg==';
const stillWebp = 'UklGRhwAAABXRUJQVlA4TA8AAAAvAAAAAAcQ/Y/+ByKi/wEA';
const animatedWebp = 'UklGRoQAAABXRUJQVlA4WAoAAAACAAAAAAAAAAAAQU5JTQYAAAAAAAAAAABBTk1GKAAAAAAAAAAAAAAAAAAAABkAAAJWUDhMDwAAAC8AAAAABxD9j/4HIqL/AQBBTk1GKAAAAAAAAAAAAAAAAAAAABkAAABWUDhMDwAAAC8AAAAABxDR//4HIqL/AQA=';

it.each([
  ['PNG', stillPng, 'image/png'],
  ['APNG', animatedPng, 'animated'],
  ['WebP', stillWebp, 'image/webp'],
  ['animated WebP', animatedWebp, 'animated'],
])('identifies %s before preview', (_, base64, expected) => {
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  expect(imageFileType(bytes.buffer)).toBe(expected);
});

it('recognizes the JPEG signature and rejects unrecognized or empty headers', () => {
  expect(imageFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer)).toBe('image/jpeg');
  expect(imageFileType(new Uint8Array([0x47, 0x49, 0x46, 0x38]).buffer)).toBeUndefined();
  expect(imageFileType(new ArrayBuffer(0))).toBeUndefined();
});

it('discards a pending file when a newer selection is rejected', async () => {
  const scope = effectScope();
  const selection = scope.run(useImageFile)!;
  const stale = new File(['image'], 'first.png', { type: 'image/png' });
  const delayed = Promise.withResolvers<ArrayBuffer>();
  vi.spyOn(stale, 'arrayBuffer').mockReturnValue(delayed.promise);
  try {
    const first = selection.read(stale);
    expect(selection.loading.value).toBe(true);
    await selection.read(new File(['unknown'], 'second.png', { type: 'image/png' }));
    delayed.resolve(new Uint8Array(Buffer.from(stillPng, 'base64')).buffer);
    expect(await first).toBeUndefined();
    expect(selection.error.value).toBe('imageFile.format');
    expect(selection.loading.value).toBe(false);
    selection.reset();
    expect(selection.error.value).toBe('');
  }
  finally {
    scope.stop();
  }
});
