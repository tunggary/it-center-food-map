import { useEffect, useState } from 'react';
import type { Favorite, TargetDetail } from '../../../shared/contracts';
import { ApiError, edge, rpc } from '../../lib/api';
import { adminToken } from '../../lib/auth';
import { ConfirmDialog, ErrorNotice } from '../../components/ui';
export type DeletionIntent = {
  path: string; targetId: string; name: string; nickname?: string;
  body: { requestKey: string; expectedVersion: number; expectedCount?: number };
};
export function DeletionDialog({ intent, open, onClose, onReplace, onResolved }: { intent: DeletionIntent; open: boolean; onClose: (keepIntent: boolean) => void; onReplace: (intent: DeletionIntent) => void; onResolved: () => void }) {
  const [status, setStatus] = useState<'confirm' | 'uncertain' | 'conflict'>('confirm');
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>();
  useEffect(() => { setStatus('confirm'); setError(undefined); }, [intent.body.requestKey]);
  const execute = async () => {
    if (busy) return;
    setBusy(true); setError(undefined);
    try {
      await edge(intent.path, { method: 'DELETE', admin: await adminToken(), body: intent.body });
      onResolved();
    } catch (e) {
      setError(e);
      setStatus(e instanceof ApiError && e.code === 'VERSION_CONFLICT' ? 'conflict' : e instanceof ApiError && !['NETWORK_ERROR', 'INTERNAL_ERROR', 'DEPENDENCY_UNAVAILABLE'].includes(e.code) ? 'confirm' : 'uncertain');
    } finally { setBusy(false); }
  };
  const refreshPreview = async () => {
    setBusy(true); setError(undefined);
    try {
      if (!intent.nickname) {
        const preview = await edge<{ name: string; version: number; count: number }>(`/admin/targets/${intent.targetId}/deletion-preview`, { admin: await adminToken() });
        onReplace({ ...intent, name: preview.name, body: { requestKey: crypto.randomUUID(), expectedVersion: preview.version, expectedCount: preview.count } });
      } else {
        let cursor: string | null = null, revision: string | null = null, favorite: Favorite | undefined;
        do {
          const detail: TargetDetail = await rpc('read_target', { p_target_id: intent.targetId, p_team_id: null, p_category_id: null, p_cursor: cursor, p_expected_revision: cursor ? revision : null });
          revision = detail.revision; favorite = detail.favorites.find(f => intent.path.endsWith(`/${f.id}`)); cursor = detail.nextCursor;
        } while (!favorite && cursor);
        if (!favorite) throw new Error('이 등록은 이미 삭제됐어요.');
        onReplace({ ...intent, nickname: favorite.nickname, body: { requestKey: crypto.randomUUID(), expectedVersion: favorite.version } });
      }
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return <ConfirmDialog open={open} title={status === 'uncertain' ? '삭제 결과를 다시 확인할까요?' : intent.nickname ? '이 등록만 삭제할까요?' : '장소·코스 전체를 삭제할까요?'} onClose={() => onClose(status === 'uncertain')} onConfirm={() => void (status === 'conflict' ? refreshPreview() : execute())} action={status === 'uncertain' ? '같은 요청으로 결과 확인' : status === 'conflict' ? '최신 영향 다시 확인' : '삭제'} busy={busy}><p>{intent.nickname ? `${intent.nickname}의 등록 한 건만 삭제해요.` : `${intent.name}에 연결된 ${intent.body.expectedCount ?? 0}건의 등록과 공개 내용을 모두 삭제해요.`}</p>{status === 'uncertain' ? <p>응답을 받지 못해 결과가 아직 확정되지 않았어요. 처음 확인한 범위와 같은 요청으로 결과를 확인해요.</p> : status === 'conflict' ? <p>삭제 영향이 달라졌어요. 최신 범위를 확인한 뒤 다시 삭제 여부를 결정해 주세요.</p> : <p>삭제 후 복구 기능은 없어요. 취소하면 삭제 요청을 보내지 않아요.</p>}{error ? <ErrorNotice error={error}/> : null}</ConfirmDialog>;
}
