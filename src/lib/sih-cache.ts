/** Small in-memory cache shared by SIH dashboards during a session. */
const values = new Map<string, unknown>();
const requests = new Map<string, Promise<unknown>>();

export function readCached<T>(key: string, loader: () => Promise<T>, force = false): Promise<T> {
  if (!force) {
    const value = values.get(key);
    if (value !== undefined) return Promise.resolve(value as T);
    const request = requests.get(key);
    if (request) return request as Promise<T>;
  } else {
    values.delete(key);
  }

  const request = loader().then((value) => {
    values.set(key, value);
    requests.delete(key);
    return value;
  }).catch((error) => {
    requests.delete(key);
    throw error;
  });
  requests.set(key, request);
  return request;
}

export function clearCached(keyPrefix?: string): void {
  if (!keyPrefix) {
    values.clear();
    requests.clear();
    return;
  }
  for (const key of values.keys()) if (key.startsWith(keyPrefix)) values.delete(key);
  for (const key of requests.keys()) if (key.startsWith(keyPrefix)) requests.delete(key);
}
