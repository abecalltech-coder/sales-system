export interface GeoResult {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  locationPermissionStatus: 'GRANTED' | 'DENIED' | 'FAILED' | 'UNSUPPORTED';
}

/** GPS取得を試みる。拒否/失敗しても呼び出し元の処理(到着登録等)は継続できるようにエラーを投げない。 */
export function getCurrentLocation(): Promise<GeoResult> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ locationPermissionStatus: 'UNSUPPORTED' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          locationPermissionStatus: 'GRANTED',
        });
      },
      (err) => {
        resolve({ locationPermissionStatus: err.code === err.PERMISSION_DENIED ? 'DENIED' : 'FAILED' });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}
