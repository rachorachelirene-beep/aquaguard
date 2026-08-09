import assert from "node:assert/strict";
import test from "node:test";

import {
  DEVELOPMENT_CAMERA_AGENT_URL,
  PRODUCTION_CAMERA_AGENT_URL,
  normalizeCameraAgentBaseUrl,
  resolveCameraAgentBaseUrl,
} from "./cameraAgent.js";


test("production uses the loopback Camera Agent by default", () => {
  assert.equal(
    resolveCameraAgentBaseUrl({ configuredUrl: "", production: true }),
    PRODUCTION_CAMERA_AGENT_URL
  );
});


test("development preserves the localhost default", () => {
  assert.equal(
    resolveCameraAgentBaseUrl({ configuredUrl: "", production: false }),
    DEVELOPMENT_CAMERA_AGENT_URL
  );
});


test("a configured Camera Agent URL is trimmed and has no trailing slash", () => {
  assert.equal(
    resolveCameraAgentBaseUrl({
      configuredUrl: "  http://192.0.2.10:5000///  ",
      production: true,
    }),
    "http://192.0.2.10:5000"
  );
  assert.equal(
    normalizeCameraAgentBaseUrl("http://localhost:5000/"),
    "http://localhost:5000"
  );
});
