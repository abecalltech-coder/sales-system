import { distanceInMeters } from './geo.util';

describe('distanceInMeters', () => {
  it('同一地点では0を返す', () => {
    expect(distanceInMeters(35.681236, 139.767125, 35.681236, 139.767125)).toBeCloseTo(0, 1);
  });

  it('東京駅から新宿駅までの距離が概ね妥当な範囲(6-7km)に収まる', () => {
    // 東京駅
    const tokyo = { lat: 35.681236, lon: 139.767125 };
    // 新宿駅
    const shinjuku = { lat: 35.690921, lon: 139.700258 };

    const distance = distanceInMeters(tokyo.lat, tokyo.lon, shinjuku.lat, shinjuku.lon);

    expect(distance).toBeGreaterThan(6000);
    expect(distance).toBeLessThan(7000);
  });

  it('緯度1度分の距離は約111kmになる', () => {
    const distance = distanceInMeters(35, 139, 36, 139);
    expect(distance).toBeGreaterThan(110_000);
    expect(distance).toBeLessThan(112_000);
  });
});
