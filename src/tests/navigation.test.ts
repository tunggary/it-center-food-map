import { expect, it } from 'vitest';
import { createMemoryRouter } from 'react-router-dom';
it('allows verified save navigation immediately while still blocking genuine unsaved cancellation', async () => {
  let verified = false;
  const dirty = true;
  const router = createMemoryRouter([{ path: '/register' }, { path: '/targets/:id' }, { path: '/' }], { initialEntries: ['/register'] });
  router.getBlocker('draft', () => dirty && !verified);
  await router.navigate('/');
  expect(router.state.blockers.get('draft')?.state).toBe('blocked');
  router.state.blockers.get('draft')?.reset?.();
  verified = true;
  await router.navigate('/targets/saved', { replace: true });
  expect(router.state.location.pathname).toBe('/targets/saved');
  expect(router.state.blockers.get('draft')?.state).toBe('unblocked');
  router.dispose();
});
