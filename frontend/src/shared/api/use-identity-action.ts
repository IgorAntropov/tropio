import {
  onScopeDispose,
  readonly,
  ref,
  shallowRef,
} from 'vue';
import {
  identityErrorMessage,
  IdentityResponseError,
} from './identity';

export function useIdentityAction() {
  const pending = ref(false);
  const message = ref('');
  const problem = shallowRef<IdentityResponseError>();
  let active: AbortController | undefined;

  function reset() {
    message.value = '';
    problem.value = undefined;
  }

  async function run<T>(request: (signal: AbortSignal) => Promise<T>, success: (result: T) => void) {
    if (active) {
      return false;
    }
    const controller = new AbortController();
    active = controller;
    pending.value = true;
    reset();

    try {
      const result = await request(controller.signal);
      if (controller.signal.aborted) {
        return false;
      }
      success(result);
      return true;
    }
    catch (error) {
      if (controller.signal.aborted) {
        return false;
      }
      message.value = identityErrorMessage(error);
      problem.value = error instanceof IdentityResponseError ? error : undefined;
      return false;
    }
    finally {
      if (active === controller) {
        pending.value = false;
        active = undefined;
      }
    }
  }

  onScopeDispose(() => active?.abort());
  return {
    pending: readonly(pending),
    message: readonly(message),
    problem: readonly(problem),
    reset,
    run,
  };
}
