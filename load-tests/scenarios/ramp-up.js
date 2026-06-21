import http from 'k6/http';
import { check, sleep } from 'k6';

// Ramp-Up Scenario: Gradual traffic increase
// - 0 → 50 VUs over 5 minutes
// - Sustain at 50 VUs for 10 minutes
// - Wind down to 0 over 3 minutes
//
// Usage: k6 run load-tests/scenarios/ramp-up.js --env TEST_SESSION_COOKIE=<value>

const config = JSON.parse(open('../config.json'));

export const options = {
  scenarios: {
    rampUp: config.scenarios.rampUp,
  },
  thresholds: config.thresholds,
};

export default function () {
  const baseUrl = config.baseUrl;

  // Health check
  const healthRes = http.get(`${baseUrl}/health`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
    'health response time < 500ms': (r) => r.timings.duration < 500,
  });

  // Authenticated dashboard route
  const sessionCookie = __ENV.TEST_SESSION_COOKIE;
  const dashRes = http.get(`${baseUrl}/api/dashboard`, {
    headers: { Cookie: `session=${sessionCookie}` },
  });
  check(dashRes, {
    'dashboard status is 200': (r) => r.status === 200,
    'dashboard p95 < 2000ms': (r) => r.timings.duration < 2000,
  });

  sleep(1);
}
