export const gaugePointLabels = [
  "Top-left",
  "Top-right",
  "Bottom-right",
  "Bottom-left",
];


export function parseGaugePoints(value) {
  const points = String(value ?? "")
    .replaceAll("|", ";")
    .split(";")
    .map((point) => point.trim())
    .filter(Boolean);

  if (points.length !== 4) {
    return null;
  }

  const parsed = points.map((point) => {
    const coordinates = point.split(",");

    if (
      coordinates.length !== 2 ||
      coordinates.some(
        (coordinate) => coordinate.trim() === ""
      )
    ) {
      return null;
    }

    const values = coordinates.map((coordinate) =>
      Number(coordinate.trim())
    );

    return values.every(Number.isFinite)
      ? values
      : null;
  });

  return parsed.every(Boolean) ? parsed : null;
}


export function isValidGaugeQuadrilateral(points) {
  if (!Array.isArray(points) || points.length !== 4) {
    return false;
  }

  if (
    points.some(
      (point) =>
        !Array.isArray(point) ||
        point.length !== 2 ||
        point.some(
          (coordinate) =>
            !Number.isFinite(coordinate) || coordinate < 0
        )
    )
  ) {
    return false;
  }

  const distinctPoints = new Set(
    points.map((point) => point.join(","))
  );

  if (distinctPoints.size !== 4) {
    return false;
  }

  const largestCoordinate = Math.max(...points.flat());
  const epsilon = largestCoordinate <= 1.5 ? 0.0001 : 4;
  const crossProducts = points.map((current, index) => {
    const following = points[(index + 1) % 4];
    const afterFollowing = points[(index + 2) % 4];

    return (
      (following[0] - current[0]) *
        (afterFollowing[1] - following[1]) -
      (following[1] - current[1]) *
        (afterFollowing[0] - following[0])
    );
  });

  return (
    crossProducts.every((value) => value > epsilon) ||
    crossProducts.every((value) => value < -epsilon)
  );
}


export function formatGaugePoints(points) {
  return points
    .map((point) =>
      point
        .map((coordinate) =>
          coordinate
            .toFixed(6)
            .replace(/0+$/, "")
            .replace(/\.$/, "")
        )
        .join(",")
    )
    .join(";");
}


export function hasValidGaugePoints(value) {
  const points = parseGaugePoints(value);

  return Boolean(
    points && isValidGaugeQuadrilateral(points)
  );
}
