import http from 'k6/http';
import { check, sleep } from 'k6';

// Spike Scenario: Sudden traffic surge
// - Steady at 10 VUs for 5 minutes
// - Sudden jump to 100 VUs over 30 seconds
// - Sustain 100 VUs for 2 minutes
// - Drop back to 10 VUs over 30 seconds
// - Steady at 10 VUs for 5 minutes (recovery)
//
// Tests auto-scaling response time and system resilience under sudden load spikes
//
// Usage: k6 run load-tests/scenarios/spike.js --env TEST_SESSION_COOKIE=<value>

const config = JSON.parse(open('../config.json'));

export const options = {
  scenarios: {
    spike: config.scenarios.spike,
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
