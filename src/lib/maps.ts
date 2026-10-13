import { config } from './api';
// The Kakao SDK is an external script with no official browser TypeScript package.
export type KakaoObject = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const kakao = () => (window as unknown as { kakao: { maps: KakaoObject } }).kakao.maps;
let loader: Promise<void> | undefined;
export function loadMap(): Promise<void> {
  if (!config.kakaoKey) return Promise.reject(new Error('지도 연결을 준비하고 있어요. 목록은 계속 볼 수 있어요.'));
  if (!loader) loader = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script'); script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(config.kakaoKey)}&autoload=false`;
    script.onload = () => kakao().load(resolve); script.onerror = () => { loader = undefined; reject(new Error('지도를 불러오지 못했어요. 다시 시도해 주세요.')); }; document.head.append(script);
  });
  return loader;
}
