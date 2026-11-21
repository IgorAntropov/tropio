import { browserSession } from '@fsd/shared/api';
import {
  workspaceConfirmedKey,
  workspaceMemberKey,
} from '@fsd/shared/session';
import type { WorkspaceMember } from '@fsd/shared/session';

export function useAccountSessionRecovery() {
  const confirmed = useState<boolean | null>(workspaceConfirmedKey, () => null);
  const member = useState<WorkspaceMember | null>(workspaceMemberKey, () => null);
  const router = useRouter();
  return () => {
    if (!confirmed.value) {
      return;
    }
    browserSession?.replace(undefined);
    confirmed.value = false;
    member.value = null;
    const { path, query, hash } = router.currentRoute.value;
    void router.replace({
      path,
      query,
      hash,
      force: true,
    });
  };
}
