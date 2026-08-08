import {
  useEffect,
  useMemo,
  useState,
} from "react";


const FALLBACK_DELAY_MS = 2500;
const POLLING_INTERVAL_MS = 7000;


function buildDetectionUrl(
  cameraApiBaseUrl,
  endpoint,
  stationId
) {
  const cleanBase = String(
    cameraApiBaseUrl ?? ""
  ).replace(/\/+$/, "");
  const params = new URLSearchParams();

  if (stationId) {
    params.set(
      "station_id",
      String(stationId)
    );
  }

  const query = params.toString();

  return `${cleanBase}${endpoint}${
    query ? `?${query}` : ""
  }`;
}


export default function useRealtimeDetection({
  cameraApiBaseUrl,
  stationId,
}) {
  const connectionKey = `${cameraApiBaseUrl}|${stationId}`;
  const [detectionState, setDetectionState] =
    useState({
      key: "",
      value: null,
    });
  const [transportState, setTransportState] =
    useState({
      key: "",
      value: "reconnecting",
    });

  useEffect(() => {
    if (!cameraApiBaseUrl || !stationId) {
      return undefined;
    }

    let active = true;
    let eventSource = null;
    let setupTimeout = null;
    let fallbackTimeout = null;
    let pollingInterval = null;
    let pollController = null;
    let pollInFlight = false;

    const streamUrl = buildDetectionUrl(
      cameraApiBaseUrl,
      "/detection_stream",
      stationId
    );
    const pollingUrl = buildDetectionUrl(
      cameraApiBaseUrl,
      "/latest_detection",
      null
    );

    function updateTransport(value) {
      if (active) {
        setTransportState({
          key: connectionKey,
          value,
        });
      }
    }

    function acceptDetection(value) {
      if (active) {
        setDetectionState({
          key: connectionKey,
          value,
        });
      }
    }

    function clearFallbackTimeout() {
      if (fallbackTimeout != null) {
        window.clearTimeout(
          fallbackTimeout
        );
        fallbackTimeout = null;
      }
    }

    function stopPolling() {
      if (pollingInterval != null) {
        window.clearInterval(
          pollingInterval
        );
        pollingInterval = null;
      }

      if (pollController) {
        pollController.abort();
        pollController = null;
      }
    }

    async function pollLatestDetection() {
      if (!active || pollInFlight) {
        return;
      }

      pollInFlight = true;
      const controller =
        new AbortController();
      pollController = controller;

      try {
        const response = await fetch(
          pollingUrl,
          {
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            "Detection polling returned an error response."
          );
        }

        const payload =
          await response.json();

        acceptDetection(payload);
      } catch (error) {
        if (
          error.name !== "AbortError" &&
          active
        ) {
          console.warn(
            "Detection polling unavailable:",
            error
          );
        }
      } finally {
        if (pollController === controller) {
          pollController = null;
        }

        pollInFlight = false;
      }
    }

    function startPolling() {
      if (!active || pollingInterval != null) {
        return;
      }

      updateTransport("polling");
      pollLatestDetection();
      pollingInterval = window.setInterval(
        pollLatestDetection,
        POLLING_INTERVAL_MS
      );
    }

    function schedulePollingFallback() {
      if (
        fallbackTimeout != null ||
        pollingInterval != null
      ) {
        return;
      }

      fallbackTimeout = window.setTimeout(
        () => {
          fallbackTimeout = null;
          startPolling();
        },
        FALLBACK_DELAY_MS
      );
    }

    function handleDetectionEvent(event) {
      try {
        const payload = JSON.parse(
          event.data
        );

        clearFallbackTimeout();
        stopPolling();
        acceptDetection(payload);
        updateTransport("live");
      } catch (error) {
        console.warn(
          "Invalid detection stream event:",
          error
        );
        schedulePollingFallback();
      }
    }

    function connect() {
      if (!active) {
        return;
      }

      updateTransport("reconnecting");

      if (typeof window.EventSource !== "function") {
        startPolling();
        return;
      }

      eventSource = new window.EventSource(
        streamUrl
      );
      eventSource.addEventListener(
        "detection",
        handleDetectionEvent
      );
      eventSource.onerror = () => {
        if (!active) {
          return;
        }

        if (pollingInterval == null) {
          updateTransport("reconnecting");
        }

        schedulePollingFallback();
      };
    }

    setupTimeout = window.setTimeout(
      connect,
      0
    );

    return () => {
      active = false;
      window.clearTimeout(setupTimeout);
      clearFallbackTimeout();
      stopPolling();

      if (eventSource) {
        eventSource.removeEventListener(
          "detection",
          handleDetectionEvent
        );
        eventSource.close();
      }
    };
  }, [
    cameraApiBaseUrl,
    connectionKey,
    stationId,
  ]);

  return useMemo(
    () => ({
      detection:
        detectionState.key ===
        connectionKey
          ? detectionState.value
          : null,
      transport:
        transportState.key ===
        connectionKey
          ? transportState.value
          : "reconnecting",
    }),
    [
      connectionKey,
      detectionState,
      transportState,
    ]
  );
}
