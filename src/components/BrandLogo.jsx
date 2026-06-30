import { useState } from "react";

function AquaGuardMark({ className = "" }) {
  return (
    <svg
      className={className}
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="16"
        cy="16"
        r="14"
        stroke="currentColor"
        strokeWidth="2"
      />

      <path
        d="M8 20c2-4 4-8 8-10 4 2 6 6 8 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <circle cx="16" cy="20" r="3" fill="currentColor" />
    </svg>
  );
}

export default function BrandLogo({
  className = "",
  markClassName = "",
  showText = true,
  subtitle,
}) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div className={className}>
      {!logoFailed ? (
        <img
          className={`${markClassName} brand-logo-image`}
          src="/logo-transparent.png"
          alt=""
          aria-hidden="true"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <AquaGuardMark
          className={`${markClassName} brand-logo-fallback-mark`}
        />
      )}

      {showText && logoFailed && (
        <div>
          <span className="brand-logo-title">AquaGuard</span>
          {subtitle && (
            <span className="brand-logo-subtitle">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  );
}
