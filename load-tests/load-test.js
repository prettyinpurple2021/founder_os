import http from 'k6/http';
import { check, sleep } from 'k6';

// Main k6 load test script for Solo Founder Launch OS
// Tests health check endpoint and authenticated dashboard route
//
// Usage: k6 run load-tests/load-test.js --env TEST_SESSION_COOKIE=<value>
// Or via npm: npm run test:load -- --env TEST_SESSION_COOKIE=<value>

const config = JSON.parse(open('./config.json'));

export const options = {
  scenarios: {
    default: config.scenarios.rampUp,
  },
  thresholds: config.thresholds,
};

export default function () {
  const baseUrl = config.baseUrl;

  // Health check — lightweight endpoint to verify service availability
  const healthRes = http.get(`${baseUrl}/health`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
    'health response time < 500ms': (r) => r.timings.duration < 500,
  });

  // Authenticated route simulation — dashboard endpoint
  const sessionCookie = __ENV.TEST_SESSION_COOKIE;
  const dashParams = {
    headers: {
      Cookie: `session=${sessionCookie}`,
    },
  };

  const dashRes = http.get(`${baseUrl}/api/dashboard`, dashParams);
  check(dashRes, {
    'dashboard status is 200': (r) => r.status === 200,
    'dashboard response time < 2000ms': (r) => r.timings.duration < 2000,
  });

  // Pause between iterations to simulate realistic user think time
  sleep(1);
}
