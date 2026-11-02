// k6 run -e BASE_URL=... -e SESSION=<ta_session cookie of a TEST student> -e LESSON=<lessonId> -e VUS=100 load/k6/student-session.js
// Scenario: signed-in students on their dashboard, opening lessons and sending progress heartbeats.
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3000";
export const options = {
  scenarios: { learners: { executor: "ramping-vus", stages: [{ duration: "30s", target: Number(__ENV.VUS || 100) }, { duration: __ENV.DURATION || "2m", target: Number(__ENV.VUS || 100) }, { duration: "15s", target: 0 }] } },
  thresholds: { http_req_failed: ["rate<0.01"], "http_req_duration{kind:page}": ["p(95)<1200"], "http_req_duration{kind:api}": ["p(95)<400"] },
};
const params = { headers: { Cookie: `ta_session=${__ENV.SESSION}`, Origin: BASE, "Content-Type": "application/json" } };

export default function () {
  check(http.get(`${BASE}/dashboard`, { ...params, tags: { kind: "page" } }), { dashboard: (r) => r.status === 200 });
  check(http.get(`${BASE}/api/videos/playback/${__ENV.LESSON}`, { ...params, tags: { kind: "api" } }), { playback: (r) => r.status === 200 });
  for (let i = 0; i < 3; i++) {
    http.post(`${BASE}/api/progress`, JSON.stringify({ lessonId: __ENV.LESSON, positionSeconds: 10 * i, watchedDelta: 10 }), { ...params, tags: { kind: "api" } });
    sleep(10);
  }
}
