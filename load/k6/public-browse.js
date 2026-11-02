// k6 run -e BASE_URL=https://<preview>.vercel.app -e VUS=50 -e DURATION=2m load/k6/public-browse.js
// Scenario: anonymous visitors browsing the catalogue (cached pages + DB-backed search).
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3000";
export const options = {
  scenarios: { browse: { executor: "constant-vus", vus: Number(__ENV.VUS || 50), duration: __ENV.DURATION || "1m" } },
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<800"] },
};
const PAGES = ["/", "/courses", "/courses?category=iot", "/courses?q=ESP32", "/courses/iot-with-esp32", "/live", "/categories"];

export default function () {
  const r = http.get(BASE + PAGES[Math.floor(Math.random() * PAGES.length)]);
  check(r, { "status 200": (x) => x.status === 200 });
  sleep(1 + Math.random() * 2);
}
