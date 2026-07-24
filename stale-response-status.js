import { aircraftStatusMessage } from './freshness.js';

const originalFetch = window.fetch.bind(window);

window.fetch = async function fetchWithStaleStatus(input, init) {
  const response = await originalFetch(input, init);
  const requestUrl = new URL(
    typeof input === 'string' || input instanceof URL ? input : input.url,
    window.location.origin,
  );

  if (requestUrl.pathname !== '/api/aircraft' || !response.ok) return response;

  const originalJson = response.json.bind(response);
  return new Proxy(response, {
    get(target, property) {
      if (property === 'json') {
        return async () => {
          const data = await originalJson();
          if (data.source?.stale) {
            window.setTimeout(() => {
              const status = document.querySelector('#status');
              if (!status) return;
              status.textContent = aircraftStatusMessage(data);
              status.classList.remove('error');
            }, 0);
          }
          return data;
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};
