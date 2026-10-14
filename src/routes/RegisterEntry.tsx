import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { MapPanel, MapScene, MapToolbar } from '../components/MapScene';
import RegisterPage from './Register';

export default function RegisterEntry() {
  const [params] = useSearchParams(), location = useLocation(), navigate = useNavigate();
  const state = location.state as { favorite?: unknown } | null;
  if (params.get('target') || params.get('favorite') || state?.favorite) return <RegisterPage/>;
  const returnQuery = params.get('return') ?? '';
  const suffix = returnQuery ? `?return=${encodeURIComponent(returnQuery)}` : '';
  return <MapScene className="register-scene"><MapToolbar hideMobileMenu/>
    <MapPanel title="최애 등록하기" eyebrow="SHARE YOUR FAVORITE" onClose={() => navigate(returnQuery ? `/?${returnQuery}` : '/')}>
      <p>어떤 최애를 등록할까요?</p>
      <div className="registration-choices">
        <Link className="button primary" to={`/register/places${suffix}`}>장소 등록</Link>
        <Link className="button" to={`/courses/new${suffix}`}>경로 등록</Link>
      </div>
    </MapPanel>
  </MapScene>;
}
