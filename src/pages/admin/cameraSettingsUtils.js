export function hasValidGaugePoints(value) {
  const points = String(value ?? "")
    .replaceAll("|", ";")
    .split(";")
    .map((point) => point.trim())
    .filter(Boolean);

  if (points.length !== 4) {
    return false;
  }

  return points.every((point) => {
    const values = point
      .split(",")
      .map((coordinate) =>
        Number(coordinate.trim())
      );

    return (
      values.length === 2 &&
      values.every(Number.isFinite)
    );
  });
}
