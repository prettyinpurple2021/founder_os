import http from 'k6/http';
import { check, sleep } from 'k6';

// Sustained Peak Load Scenario: Constant high traffic
// - 50 VUs sustained for 30 minutes
// - Validates system stability under continuous peak load
//
// Usage: k6 run load-tests/scenarios/sustained.js --env TEST_SESSION_COOKIE=<value>

const config = JSON.parse(open('../config.json'));

export const options = {
  scenarios: {
    sustained: config.scenarios.sustained,
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
