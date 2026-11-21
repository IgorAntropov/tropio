import {
  onScopeDispose,
  ref,
} from 'vue';
import { imageFileType } from './file-type';

export type ImageUpload = { content_type: 'image/jpeg' | 'image/png' | 'image/webp'; data_base64: string };
export const imageFileAccept = 'image/jpeg,image/png,image/webp';

export function imagePreview(image: ImageUpload) {
  return `data:${image.content_type};base64,${image.data_base64}`;
}

export function useImageFile() {
  const loading = ref(false);
  const error = ref('');
  let attempt = 0;
  let reader: FileReader | undefined;

  function reset() {
    attempt++;
    reader?.abort();
    reader = undefined;
    loading.value = false;
    error.value = '';
  }

  async function read(file: File): Promise<ImageUpload | undefined> {
    reset();
    const selected = attempt;
    if (file.size > 2 * 1024 * 1024) {
      error.value = 'imageFile.size';
      return;
    }
    loading.value = true;
    try {
      const type = imageFileType(await file.arrayBuffer());
      if (selected !== attempt) {
        return;
      }
      if (type === 'animated') {
        error.value = 'imageFile.animated';
        return;
      }
      if (!type || (file.type && file.type !== type)) {
        error.value = 'imageFile.format';
        return;
      }
      const url = await new Promise<string>((resolve, reject) => {
        const current = new FileReader();
        reader = current;
        current.onload = () => resolve(String(current.result));
        current.onerror = current.onabort = () => reject(new Error('Image read failed'));
        current.readAsDataURL(file);
      });
      if (selected !== attempt) {
        return;
      }
      const upload: ImageUpload = { content_type: type, data_base64: url.slice(url.indexOf(',') + 1) };
      const image = new Image();
      image.src = imagePreview(upload);
      await image.decode();
      if (selected === attempt) {
        if (image.naturalHeight * image.naturalWidth > 40_000_000) {
          error.value = 'imageFile.dimensions';
          return;
        }
        return upload;
      }
    }
    catch {
      if (selected === attempt) {
        error.value = 'imageFile.error';
      }
    }
    finally {
      if (selected === attempt) {
        reader = undefined;
        loading.value = false;
      }
    }
  }

  onScopeDispose(reset);
  return {
    read,
    reset,
    loading,
    error,
  };
}
