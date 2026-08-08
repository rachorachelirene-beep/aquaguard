import LiveMonitoring from "../admin/LiveMonitoring";

export default function ResponderLiveMonitoring() {
  return (
    <LiveMonitoring
      routePrefix="/responder"
      viewOnly
      title="Live Monitoring"
      description="View the live CCTV feed, AI detections, and combined flood risk."
    />
  );
}
