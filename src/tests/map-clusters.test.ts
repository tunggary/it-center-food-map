import { expect, it } from 'vitest';
import { clusterPins, type ScreenPin } from '../lib/map-clusters';
const pin = (id: string, x: number, y = 100, width = 80): ScreenPin => ({ id, x, y, width, height: 34 });
const measure = () => ({ width: 120, height: 36 });
it('keeps separated labels and keeps a lightly overlapping chain separate deterministically', () => {
  expect(clusterPins([pin('a', 0), pin('b', 200)], measure)).toHaveLength(2);
  const pins = [pin('a', 0), pin('b', 70), pin('c', 140)];
  expect(clusterPins(pins, measure)).toEqual(clusterPins([...pins].reverse(), measure));
  expect(clusterPins(pins, measure)).toHaveLength(3);
});
it('splits again on zoom while identical coordinates stay grouped', () => {
  expect(clusterPins([pin('a', 0), pin('b', 10)], measure)).toHaveLength(1);
  expect(clusterPins([pin('a', 0), pin('b', 400)], measure)).toHaveLength(2);
  expect(clusterPins([pin('a', 400), pin('b', 400)], measure)[0].ids).toEqual(['a', 'b']);
});
it('uses measured width and vertical bounds for 50% coverage', () => {
  expect(clusterPins([pin('a', 0, 100, 220), pin('b', 50)], measure)).toHaveLength(1);
  expect(clusterPins([pin('a', 0), pin('b', 0, 200)], measure)).toHaveLength(2);
  expect(clusterPins([pin('a', 0), pin('b', 88)], measure)).toHaveLength(2);
});
it('keeps single pins separate when no original pair reaches the threshold', () => {
  const result = clusterPins([pin('a', 0, 100, 10), pin('b', 15, 100, 10), pin('c', 100, 100, 10)], () => ({ width: 200, height: 36 }));
  expect(result).toHaveLength(3);
});
it('preserves every ID exactly once across 1,000 pins', () => {
  const pins = Array.from({ length: 1000 }, (_, i) => pin(String(i), (i % 40) * 35, Math.floor(i / 40) * 35));
  const ids = clusterPins(pins, measure).flatMap(g => g.ids);
  expect(ids).toHaveLength(1000);
  expect(new Set(ids).size).toBe(1000);
  expect(clusterPins([], measure)).toEqual([]);
});
