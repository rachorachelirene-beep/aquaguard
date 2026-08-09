import {
  useEffect,
  useMemo,
  useState,
} from "react";


const FALLBACK_DELAY_MS = 2500;
const POLLING_BACKOFF_MS = [7000, 15000, 30000, 60000];


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
  enabled = true,
}) {
  const connectionKey = `${cameraApiBaseUrl}|${stationId}|${
    enabled ? "enabled" : "disabled"
  }`;
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
    if (!enabled || !cameraApiBaseUrl || !stationId) {
      return undefined;
    }

    let active = true;
    let eventSource = null;
    let setupTimeout = null;
    let fallbackTimeout = null;
    let pollingTimeout = null;
    let pollController = null;
    let pollInFlight = false;
    let pollingEnabled = false;
    let pollingFailureCount = 0;
    let pollFailureLogged = false;
    let invalidEventLogged = false;

    const streamUrl = buildDetectionUrl(
      cameraApiBaseUrl,
      "/detection_stream",
      stationId
    );
    const pollingUrl = buildDetectionUrl(
      cameraApiBaseUrl,
      "/latest_detection",
      stationId
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
      if (
        !active ||
        (value?.station_id != null &&
          String(value.station_id) !== String(stationId))
      ) {
        return false;
      }

      setDetectionState({
        key: connectionKey,
        value,
      });
      return true;
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
      pollingEnabled = false;

      if (pollingTimeout != null) {
        window.clearTimeout(pollingTimeout);
        pollingTimeout = null;
      }

      if (pollController) {
        pollController.abort();
        pollController = null;
      }
    }

    function scheduleNextPoll(delayMs) {
      if (
        !active ||
        !pollingEnabled ||
        pollingTimeout != null
      ) {
        return;
      }

      pollingTimeout = window.setTimeout(() => {
        pollingTimeout = null;
        pollLatestDetection();
      }, delayMs);
    }

    async function pollLatestDetection() {
      if (!active || pollInFlight) {
        return;
      }

      pollInFlight = true;
      const controller =
        new AbortController();
      pollController = controller;
      const timeout = window.setTimeout(
        () => controller.abort(),
        5000
      );

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

        pollFailureLogged = false;
        pollingFailureCount = 0;
        acceptDetection(payload);
        updateTransport("polling");
      } catch (error) {
        if (active && pollingEnabled) {
          if (
            error.name !== "AbortError" &&
            !pollFailureLogged
          ) {
            console.warn(
              "Detection polling unavailable:",
              error
            );
            pollFailureLogged = true;
          }

          pollingFailureCount = Math.min(
            pollingFailureCount + 1,
            POLLING_BACKOFF_MS.length - 1
          );
          updateTransport("unavailable");
        }
      } finally {
        window.clearTimeout(timeout);

        if (pollController === controller) {
          pollController = null;
        }

        pollInFlight = false;

        if (active && pollingEnabled) {
          scheduleNextPoll(
            POLLING_BACKOFF_MS[pollingFailureCount]
          );
        }
      }
    }

    function startPolling() {
      if (!active || pollingEnabled) {
        return;
      }

      pollingEnabled = true;
      pollingFailureCount = 0;
      updateTransport("reconnecting");
      pollLatestDetection();
    }

    function schedulePollingFallback() {
      if (
        fallbackTimeout != null ||
        pollingEnabled
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
        invalidEventLogged = false;
        acceptDetection(payload);
        updateTransport("live");
      } catch (error) {
        if (!invalidEventLogged) {
          console.warn(
            "Invalid detection stream event:",
            error
          );
          invalidEventLogged = true;
        }
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

        if (!pollingEnabled) {
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
    enabled,
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
          : enabled
            ? "reconnecting"
            : "unavailable",
    }),
    [
      connectionKey,
      detectionState,
      enabled,
      transportState,
    ]
  );
}
