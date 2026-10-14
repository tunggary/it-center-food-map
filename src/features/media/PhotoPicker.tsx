import { useEffect, useRef, useState } from 'react';
import type { DraftPhoto } from './draft';
import { uploadRawPhoto } from './upload';
import { showToast, useErrorToast } from '../../components/Toast';
import { edge, errorMessage, photoUrl } from '../../lib/api';
export function PhotoPicker({ photos, onChange, token, disabled = false }: { photos: DraftPhoto[]; onChange: (photos: DraftPhoto[]) => void; token: string; disabled?: boolean }) {
  const current = useRef(photos); current.current = photos;
  const urls = useRef(new Set<string>());
  const active = useRef(true);
  const [notice, setNotice] = useState('');
  useEffect(() => { active.current = true; return () => { active.current = false; for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear(); }; }, []);
  useErrorToast(notice);
  const update = (id: string, change: Partial<DraftPhoto>) => { if (!active.current) return; const next = current.current.map(p => p.id === id ? { ...p, ...change } : p); current.current = next; onChange(next); };
  const process = async (photo: DraftPhoto) => {
    try {
      let blob = photo.blob;
      if (!blob) { update(photo.id, { status: 'preparing', error: undefined }); const { preprocessPhoto: convert } = await import('./preprocess'); blob = await convert(photo.file!); if (!active.current) return; const previous = current.current.find(p => p.id === photo.id)?.preview; if (previous && urls.current.delete(previous)) URL.revokeObjectURL(previous); const preview = URL.createObjectURL(blob); urls.current.add(preview); update(photo.id, { blob, preview }); }
      let assetId = photo.assetId, uploadUrl = photo.uploadUrl;
      if (!assetId || !uploadUrl) { update(photo.id, { status: 'uploading', error: undefined }); const uploaded = await edge<{ assetId: string; signedUrl: string }>('/uploads', { method: 'POST', token, body: { requestKey: photo.prepareKey, mediaType: 'image/jpeg', byteSize: blob.size } }); assetId = uploaded.assetId; uploadUrl = uploaded.signedUrl; update(photo.id, { assetId, uploadUrl }); }
      if (photo.status !== 'processing') {
        await uploadRawPhoto(uploadUrl, blob);
      }
      update(photo.id, { status: 'processing' });
      const result = await edge<{ state: string }>('/media-finalize', { method: 'POST', token, body: { requestKey: photo.finalizeKey, assetId } });
      update(photo.id, result.state === 'ready' ? { status: 'ready', error: undefined } : { status: 'processing', error: '사진을 확인하고 있어요. 잠시 후 준비 상태를 확인해 주세요.' });
    } catch (e) { update(photo.id, { status: 'failed', error: errorMessage(e) }); if (active.current && current.current.some(p => p.id === photo.id)) showToast(errorMessage(e)); }
  };
  return <fieldset disabled={disabled} className="photo-picker"><legend>사진 <span className="muted">선택 · 최대 3장</span></legend><p className="muted">JPEG·PNG·WebP, 원본 10MiB·40MP까지. 작은 JPEG로 저장하며 원본은 보관하지 않아요.</p><input type="file" aria-label="최애 사진 선택" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { const files = Array.from(e.target.files ?? []); if (files.length + photos.length > 3) { setNotice('사진은 세 장까지 선택해 주세요.'); e.target.value = ''; return; } const added: DraftPhoto[] = files.map(file => { const preview = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? URL.createObjectURL(file) : undefined; if (preview) urls.current.add(preview); return { id: crypto.randomUUID(), file, preview, prepareKey: crypto.randomUUID(), finalizeKey: crypto.randomUUID(), status: 'selected' }; }); const next = [...photos, ...added]; current.current = next; onChange(next); setNotice(''); for (const photo of added) void process(photo); e.target.value = ''; }}/>{notice ? <p role="alert">{notice}</p> : null}<div className="photo-drafts">{photos.map(photo => <article key={photo.id}><div className="photo-preview" aria-busy={!['ready', 'failed'].includes(photo.status)}>{photo.preview || photo.assetId && photo.status === 'ready' ? <img src={photo.preview ?? photoUrl(photo.assetId!)} alt={photo.file?.name ?? '등록한 사진'}/> : <span className="photo-placeholder">{photo.file?.name ?? '사진 준비 중'}</span>}{!['ready', 'failed'].includes(photo.status) ? <div className="photo-loading"><span className="loading-spinner" aria-hidden="true"/><span>{{ selected: '준비 중', preparing: '사진 줄이는 중', uploading: '업로드 중', processing: '처리 중' }[photo.status as 'selected' | 'preparing' | 'uploading' | 'processing']}</span><span className="loading-bar" role="progressbar" aria-label="사진 준비 중"/></div> : null}</div><p role="status">{{ selected: '선택됨', preparing: '사진 줄이는 중', uploading: '업로드 중', processing: '처리 중', ready: '준비 완료', failed: '준비 실패' }[photo.status]}</p>{photo.error ? <p role="alert">{photo.error}</p> : null}{['failed', 'processing'].includes(photo.status) ? <button type="button" onClick={() => void process(photo)}>{photo.status === 'processing' ? '준비 상태 확인' : '사진 다시 시도'}</button> : null}<button type="button" onClick={() => { if (photo.preview) { URL.revokeObjectURL(photo.preview); urls.current.delete(photo.preview); } const next = current.current.filter(p => p.id !== photo.id); current.current = next; onChange(next); }}>사진 제거</button></article>)}</div></fieldset>;
}
