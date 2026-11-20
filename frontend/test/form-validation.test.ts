import { ref } from 'vue';
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  hasInvalidText,
  useFormValidation,
} from '../src/shared/ui/form';

describe('form validation', () => {
  it('allows full Unicode characters and rejects text the API cannot accept', () => {
    expect(hasInvalidText('Тропа 🏔️')).toBe(false);
    expect(hasInvalidText('name\0')).toBe(true);
    expect(hasInvalidText('\uD800')).toBe(true);
  });

  it('gates the action from the first render and reports an invalid field after blur', () => {
    const email = ref('');
    const terms = ref(false);
    const form = useFormValidation({
      email: () => email.value.endsWith('@example.test') ? undefined : 'Проверь адрес',
      terms: () => terms.value ? undefined : 'Прими условия',
    });

    expect(form.valid.value).toBe(false);
    expect(form.errors.value.email).toBeUndefined();
    form.touch('email');
    expect(form.errors.value.email).toBe('Проверь адрес');
    expect(form.errors.value.terms).toBeUndefined();

    email.value = 'person@example.test';
    expect(form.errors.value.email).toBeUndefined();
    expect(form.valid.value).toBe(false);
    terms.value = true;
    expect(form.valid.value).toBe(true);

    email.value = '';
    expect(form.errors.value.email).toBe('Проверь адрес');
    form.reset();
    expect(form.valid.value).toBe(false);
    expect(form.errors.value.email).toBeUndefined();
  });

  it('reevaluates mode-specific fields without requiring absent inputs', () => {
    const registration = ref(false);
    const terms = ref(false);
    const form = useFormValidation({
      terms: () => registration.value && !terms.value ? 'Прими условия' : undefined,
    });

    expect(form.valid.value).toBe(true);
    registration.value = true;
    expect(form.valid.value).toBe(false);
    terms.value = true;
    expect(form.valid.value).toBe(true);
  });
});
