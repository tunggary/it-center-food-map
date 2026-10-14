import { useEffect, useState } from 'react';
export function useMobileScreen() {
  const [mobile, setMobile] = useState(() => typeof matchMedia === 'function' && matchMedia('(max-width:760px)').matches);
  useEffect(() => { if (typeof matchMedia !== 'function') return; const query = matchMedia('(max-width:760px)'); const change = () => setMobile(query.matches); change(); query.addEventListener('change', change); return () => query.removeEventListener('change', change); }, []);
  return mobile;
}
