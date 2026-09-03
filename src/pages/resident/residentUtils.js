export function toNullableNumber(value) {
  if (
    value == null ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatDateTime(value) {
  if (!value) {
    return "Unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMeasurement(value, suffix, digits = 1) {
  const number = toNullableNumber(value);
  return number == null ? "Unavailable" : `${number.toFixed(digits)} ${suffix}`;
}

export function getWaterStatus(levelValue, station) {
  const level = toNullableNumber(levelValue);
  const warning = toNullableNumber(station?.warning_level);
  const critical = toNullableNumber(station?.critical_level);

  if (level == null) {
    return {
      key: "unknown",
      label: "STATUS UNAVAILABLE",
      shortLabel: "Unavailable",
      className: "gray",
      badge: "badge-gray",
      message: "A valid current water-level measurement is not available.",
      icon: "?",
    };
  }

  if (warning == null || critical == null || warning >= critical) {
    return {
      key: "unknown",
      label: "STATUS UNAVAILABLE",
      shortLabel: "Unavailable",
      className: "gray",
      badge: "badge-gray",
      message: "Station warning levels are not available for comparison.",
      icon: "?",
    };
  }

  if (level >= critical) {
    return {
      key: "critical",
      label: "CRITICAL",
      shortLabel: "Critical",
      className: "red",
      badge: "badge-red",
      message: "Dangerous water levels detected. Follow official instructions.",
      icon: "!",
    };
  }

  if (level >= warning) {
    return {
      key: "warning",
      label: "WARNING",
      shortLabel: "Warning",
      className: "orange",
      badge: "badge-orange",
      message: "Water is elevated. Stay alert for official updates.",
      icon: "!",
    };
  }

  return {
    key: "normal",
    label: "NORMAL",
    shortLabel: "Normal",
    className: "green",
    badge: "badge-green",
    message: "The latest water level is below the station warning threshold.",
    icon: "\u2713",
  };
}

export function getCombinedRiskView(risk) {
  const score = risk?.assessed === true ? toNullableNumber(risk.score) : null;

  if (score == null) {
    return {
      assessed: false,
      label: "Not assessed",
      scoreText: "--",
      className: "resident-risk-neutral",
      message:
        risk?.primary_reason || "Insufficient current monitoring data.",
    };
  }

  const classNames = {
    low: "resident-risk-low",
    moderate: "resident-risk-moderate",
    elevated: "resident-risk-moderate",
    high: "resident-risk-high",
    critical: "resident-risk-critical",
  };

  return {
    assessed: true,
    label: risk.label || "Assessed",
    scoreText: `${Math.round(score)}/100`,
    className: classNames[risk.level] || "resident-risk-low",
    message: risk.primary_reason || "Current monitoring inputs were assessed.",
  };
}

export function getAlertCardClass(type) {
  if (type === "critical") {
    return "red";
  }

  if (type === "warning") {
    return "orange-card";
  }

  return "blue-card";
}

export function getSeverityBadge(type) {
  if (type === "critical" || type === "mandatory") {
    return "badge-red";
  }

  if (type === "warning") {
    return "badge-orange";
  }

  return "badge-blue";
}

export function getAgeMinutes(value, now = new Date()) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
}

export function decodeReminderIcon(value) {
  if (!value) {
    return "!";
  }

  return String(value)
    .replace(/&#(\d+);/g, (_match, code) =>
      String.fromCodePoint(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    );
}

export function newestTimestamp(...values) {
  const validDates = values
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (validDates.length === 0) {
    return null;
  }

  return new Date(Math.max(...validDates.map((date) => date.getTime()))).toISOString();
}

export function formatRelativeTime(value, now = new Date()) {
  const minutes = getAgeMinutes(value, now);
  if (minutes == null) {
    return "Unavailable";
  }

  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) {
    return "Yesterday";
  }
  if (days < 7) {
    return `${days}d ago`;
  }

  return formatDateTime(value);
}

export function isRecent(value, maxHours = 24, now = new Date()) {
  const minutes = getAgeMinutes(value, now);
  if (minutes == null) {
    return false;
  }
  return minutes <= maxHours * 60;
}

