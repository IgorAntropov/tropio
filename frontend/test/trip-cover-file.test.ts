import {
  expect,
  it,
} from 'vitest';
import { coverFileType } from '../src/features/trip-draft-dialog/cover-file';

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
  expect(coverFileType(bytes.buffer)).toBe(expected);
});

it('recognizes the JPEG signature and rejects unrecognized or empty headers', () => {
  expect(coverFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer)).toBe('image/jpeg');
  expect(coverFileType(new Uint8Array([0x47, 0x49, 0x46, 0x38]).buffer)).toBeUndefined();
  expect(coverFileType(new ArrayBuffer(0))).toBeUndefined();
});
