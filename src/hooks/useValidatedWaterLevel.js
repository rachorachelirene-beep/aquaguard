import useRealtimeDetection from './useRealtimeDetection';
import { cameraAgentBaseUrl } from '../lib/cameraAgent';
import { currentLiveLevel } from '../lib/gaugeCalibration';

export default function useValidatedWaterLevel(stationId) {
  const { detection, transport } = useRealtimeDetection({ cameraApiBaseUrl: cameraAgentBaseUrl, stationId });
  return currentLiveLevel(detection, stationId, transport);
}
