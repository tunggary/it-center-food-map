import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, SyncProvider } from './lib/state';
import { Loading, SyncNotice } from './components/ui';
import Explore, { RankingsPanel } from './routes/Explore';
import { ToastHost } from './components/Toast';
import { RegistrationProvider, RegistrationGuard } from './components/Registration';
import './styles.css';
const Target = lazy(() => import('./routes/Target'));
const RegisterEntry = lazy(() => import('./routes/RegisterEntry'));
const Register = lazy(() => import('./routes/Register'));
const Me = lazy(() => import('./routes/Me'));
const Booth = lazy(() => import('./routes/Booth'));
const Admin = lazy(() => import('./routes/Admin'));
const Login = lazy(() => import('./routes/Admin').then(m => ({ default: m.LoginPage })));
function Layout() { return <SyncProvider><RegistrationProvider><ToastHost/><a className="skip-link" href="#content">본문으로 이동</a><SyncNotice/><main id="content"><Suspense fallback={<Loading/>}><Outlet/></Suspense></main></RegistrationProvider></SyncProvider>; }
const router = createBrowserRouter([{ element: <Layout/>, errorElement: <section className="page"><h1>화면을 불러오지 못했어요.</h1><p>새로고침하거나 지도로 돌아가 주세요.</p><a href="/">지도로 돌아가기</a></section>, children: [
  { element: <Explore/>, children: [{ path: '/', element: null }, { path: '/rankings', element: <RankingsPanel/> }, { path: '/targets/:id', element: <Target/> }] }, { path: '/register', element: <RegistrationGuard><RegisterEntry/></RegistrationGuard> }, { path: '/register/places', element: <RegistrationGuard><Register/></RegistrationGuard> },
  { path: '/courses/new', element: <RegistrationGuard><Register courseOnly/></RegistrationGuard> }, { path: '/me/favorites', element: <Me/> }, { path: '/me/profile', element: <Me profile/> },
  { path: '/booth', element: <Booth/> }, { path: '/admin/login', element: <Login/> }, { path: '/admin/*', element: <Admin/> },
  { path: '*', element: <section className="page"><h1>찾을 수 없는 페이지예요.</h1><a href="/">지도로 돌아가기</a></section> },
] }]);
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><RouterProvider router={router}/></QueryClientProvider>);
