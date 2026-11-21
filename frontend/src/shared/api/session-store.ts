import { shallowRef } from 'vue';
import type { components } from './openapi';

type Profile = components['schemas']['IdentityProfile'];

export function createSessionStore() {
  const profile = shallowRef<Profile | null>();
  let revision = 0;
  let invalidated = false;
  let flight: { controller: AbortController; result: Promise<Profile> } | undefined;

  function replace(value: Profile | null | undefined) {
    revision++;
    flight?.controller.abort();
    flight = undefined;
    invalidated = false;
    profile.value = value;
  }

  function invalidateProfile() {
    if (profile.value) {
      invalidated = true;
      flight?.controller.abort();
      flight = undefined;
    }
  }

  async function read(load: (signal: AbortSignal) => Promise<Profile>, signal: AbortSignal, guestError: () => Error) {
    signal.throwIfAborted();
    if (profile.value === null) {
      throw guestError();
    }
    if (profile.value && !invalidated) {
      return profile.value;
    }
    if (!flight) {
      const controller = new AbortController();
      const result = load(controller.signal).then((value) => {
        controller.signal.throwIfAborted();
        invalidated = false;
        profile.value = value;
        return value;
      }).finally(() => {
        if (flight?.controller === controller) {
          flight = undefined;
        }
      });
      flight = { controller, result };
    }
    const waiting = flight.result;
    let abort!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
    });
    signal.addEventListener('abort', abort, { once: true });
    try {
      return await Promise.race([waiting, cancelled]);
    }
    finally {
      signal.removeEventListener('abort', abort);
    }
  }

  return {
    profile,
    replace,
    invalidateProfile,
    read,
    revision: () => revision,
  };
}

export const browserSession = 'window' in globalThis ? createSessionStore() : undefined;

export const sessionEvents = new EventTarget();

export function reportSessionFailure(status: number, code: string, revision: number | undefined) {
  if (browserSession && browserSession.revision() === revision && status === 401 && code === 'SESSION_REQUIRED' && browserSession.profile.value !== null) {
    const hadProfile = !!browserSession.profile.value;
    browserSession.replace(null);
    if (hadProfile) {
      sessionEvents.dispatchEvent(new Event('expired'));
    }
  }
}
