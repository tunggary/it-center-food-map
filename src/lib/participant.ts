import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Participant } from '../../shared/contracts';
import { ApiError, edge } from './api';
import { storedToken, subscribeIdentity } from './identity';

export const personalQuery = (key: readonly unknown[]) => ['me', 'mine', 'mine-target', 'places'].includes(String(key[0]));
export function useParticipant() {
  const token = useSyncExternalStore(subscribeIdentity, storedToken, () => null);
  const me = useQuery({ queryKey: ['me', token], enabled: !!token,
    queryFn: ({ signal }) => edge<Participant | null>('/me', { token: token!, signal }),
    retry: false, refetchOnMount: 'always', refetchOnWindowFocus: true });
  const expired = me.error instanceof ApiError && ['IDENTITY_REQUIRED', 'IDENTITY_EXPIRED'].includes(me.error.code);
  return { token, me, participant: token && me.isSuccess ? me.data : null, expired };
}
