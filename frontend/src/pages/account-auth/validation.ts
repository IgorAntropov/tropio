import { hasInvalidText } from '@fsd/shared/ui/form';

const emailLocalPart = /^[a-z0-9!#$%&'*+/=?^`{|}~_.-]+$/;
const invalidDots = /(^\.|\.$|\.\.)/;
const emailDomainLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isEmailAddress(value: string) {
  const address = value.trim().toLowerCase();
  const [local = '', domain = '', ...extra] = address.split('@');
  const labels = domain.split('.');
  return address.length <= 254 && !extra.length && local.length <= 64
    && emailLocalPart.test(local) && !invalidDots.test(local)
    && labels.length >= 2 && labels.every(label => emailDomainLabel.test(label));
}

export function passwordIssue(value: string, minimumLength: 1 | 12) {
  if (!value) {
    return 'identity.passwordError';
  }
  if (hasInvalidText(value)) {
    return 'identity.passwordFormatError';
  }

  const length = [...value].length;
  if (length > 128) {
    return 'identity.passwordMaxError';
  }
  if (length < minimumLength) {
    return 'identity.passwordHint';
  }
  return undefined;
}
