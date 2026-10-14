import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/api';
import { Icon } from './Icon';
type Notice = { message: string; kind: 'error' | 'success' };
export function showToast(message: string, kind: Notice['kind'] = 'error') { window.dispatchEvent(new CustomEvent('foodmap:toast', { detail: { message, kind } })); }
export function ToastHost() {
  const [notice, setNotice] = useState<Notice>(), timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const receive = (event: Event) => { const value = (event as CustomEvent<Notice>).detail; clearTimeout(timer.current); setNotice(value); timer.current = setTimeout(() => setNotice(undefined), value.kind === 'error' ? 10000 : 5000); };
    window.addEventListener('foodmap:toast', receive);
    return () => { clearTimeout(timer.current); window.removeEventListener('foodmap:toast', receive); };
  }, []);
  return notice ? <div className={`toast-notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}><span>{notice.message}</span><button type="button" aria-label="알림 닫기" onClick={() => { clearTimeout(timer.current); setNotice(undefined); }}><Icon name="close"/></button></div> : null;
}
export function useErrorToast(error: unknown) { useEffect(() => { if (error) showToast(typeof error === 'string' ? error : errorMessage(error)); }, [error]); }
