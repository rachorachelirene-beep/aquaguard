export function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatShortTime(value) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getWaterStatus(level, station) {
  const numericLevel = toNumber(level);
  const warningLevel = toNumber(station?.warning_level, 2);
  const criticalLevel = toNumber(station?.critical_level, 2.5);

  if (numericLevel >= criticalLevel) {
    return {
      key: "critical",
      label: "Critical",
      className: "red",
      badge: "badge-red",
    };
  }

  if (numericLevel >= warningLevel) {
    return {
      key: "warning",
      label: "Warning",
      className: "orange",
      badge: "badge-orange",
    };
  }

  return {
    key: "normal",
    label: "Normal",
    className: "green",
    badge: "badge-green",
  };
}

export function getResponseStatus(status) {
  if (status === "ongoing") {
    return {
      label: "On-going",
      badge: "badge-orange",
    };
  }

  if (status === "rescued") {
    return {
      label: "Rescued",
      badge: "badge-blue",
    };
  }

  if (status === "cleared") {
    return {
      label: "Cleared",
      badge: "badge-green",
    };
  }

  return {
    label: status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown",
    badge: "badge-gray",
  };
}

export function getAlertBadge(type) {
  if (type === "critical") {
    return "badge-red";
  }

  if (type === "warning") {
    return "badge-orange";
  }

  return "badge-blue";
}

export function escapeCsv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob(["\ufeff", csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
