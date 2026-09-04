export const PRODUCTION_CAMERA_AGENT_URL = "http://127.0.0.1:5000";
export const DEVELOPMENT_CAMERA_AGENT_URL = "http://localhost:5000";


export function normalizeCameraAgentBaseUrl(value) {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
}


export function resolveCameraAgentBaseUrl({
  configuredUrl,
  production,
} = {}) {
  const viteEnvironment = import.meta.env ?? {};
  const override = normalizeCameraAgentBaseUrl(
    configuredUrl === undefined
      ? viteEnvironment.VITE_CAMERA_API_URL
      : configuredUrl
  );

  if (override) {
    return override;
  }

  const isProduction = production === undefined
    ? Boolean(viteEnvironment.PROD)
    : Boolean(production);

  return isProduction
    ? PRODUCTION_CAMERA_AGENT_URL
    : DEVELOPMENT_CAMERA_AGENT_URL;
}


export const cameraAgentBaseUrl = resolveCameraAgentBaseUrl();

export function isCameraAgentReachable() {
  if (!cameraAgentBaseUrl) {
    return false;
  }

  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    cameraAgentBaseUrl.startsWith("http://")
  ) {
    return false;
  }

  return true;
}


export function buildCameraAgentUrl(path = "") {
  const normalizedPath = String(path ?? "").trim();

  if (!normalizedPath) {
    return cameraAgentBaseUrl;
  }

  return `${cameraAgentBaseUrl}${
    normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`
  }`;
}
