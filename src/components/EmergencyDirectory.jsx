import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Building,
  CheckCircle2,
  Home,
  MapPin,
  Phone,
  PhoneCall,
  Search,
  Shield,
  ShieldAlert,
  Users,
  WifiOff,
  X,
} from "lucide-react";

import {
  EMERGENCY_HOTLINES,
  EVACUATION_CENTERS,
  SAFETY_GUIDELINES,
} from "../data/emergencyData";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import "./EmergencyDirectory.css";

/**
 * EmergencyDirectory Component
 * 
 * High-resilience, 100% offline-capable emergency directory providing
 * direct tap-to-call links for Davao / PH disaster agencies, designated
 * evacuation centers with capacity, and flood survival protocols.
 */
export default function EmergencyDirectory({ isOpen, onClose }) {
  const { isOnline } = useNetworkStatus();
  const [activeTab, setActiveTab] = useState("hotlines"); // "hotlines" | "evacuation" | "safety"
  const [safetyPhase, setSafetyPhase] = useState("during"); // "before" | "during" | "after"
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Handle ESC key to dismiss modal
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Extract unique categories for hotline filters
  const categories = useMemo(() => {
    const set = new Set(EMERGENCY_HOTLINES.map((h) => h.category));
    return ["all", ...Array.from(set)];
  }, []);

  // Filter hotlines
  const filteredHotlines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return EMERGENCY_HOTLINES.filter((h) => {
      const matchesCategory =
        selectedCategory === "all" || h.category === selectedCategory;
      const matchesSearch =
        !q ||
        h.name.toLowerCase().includes(q) ||
        h.agency.toLowerCase().includes(q) ||
        h.number.toLowerCase().includes(q) ||
        (h.mobile && h.mobile.toLowerCase().includes(q)) ||
        h.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  // Filter evacuation centers
  const filteredEvacuationCenters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return EVACUATION_CENTERS.filter((c) => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.barangay.toLowerCase().includes(q) ||
        c.district.toLowerCase().includes(q) ||
        c.landmark.toLowerCase().includes(q)
      );
    });
  }, [searchQuery]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="emergency-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="emergency-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="emergency-modal-panel">
        {/* Modal Header */}
        <div className="emergency-header">
          <div className="emergency-header-left">
            <div className="emergency-header-icon">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h2 id="emergency-modal-title" className="emergency-title">
                Offline Disaster Emergency Directory
              </h2>
              <div className="emergency-status-row">
                <span
                  className={`emergency-status-pill ${
                    isOnline ? "pill-online" : "pill-offline"
                  }`}
                >
                  {isOnline ? (
                    <>Online Mode</>
                  ) : (
                    <>
                      <WifiOff size={12} /> Offline Mode (Pre-cached)
                    </>
                  )}
                </span>
                <span className="emergency-caption">
                  Davao City DRRM • 24/7 Direct Hotlines
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="emergency-close-btn"
            onClick={onClose}
            aria-label="Close emergency directory"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <nav className="emergency-tabs" aria-label="Directory Navigation">
          <button
            type="button"
            className={`emergency-tab-btn ${
              activeTab === "hotlines" ? "tab-active" : ""
            }`}
            onClick={() => setActiveTab("hotlines")}
          >
            <Phone size={16} />
            <span>Emergency Hotlines</span>
            <span className="tab-badge">{EMERGENCY_HOTLINES.length}</span>
          </button>
          <button
            type="button"
            className={`emergency-tab-btn ${
              activeTab === "evacuation" ? "tab-active" : ""
            }`}
            onClick={() => setActiveTab("evacuation")}
          >
            <Home size={16} />
            <span>Evacuation Centers</span>
            <span className="tab-badge">{EVACUATION_CENTERS.length}</span>
          </button>
          <button
            type="button"
            className={`emergency-tab-btn ${
              activeTab === "safety" ? "tab-active" : ""
            }`}
            onClick={() => setActiveTab("safety")}
          >
            <BookOpen size={16} />
            <span>Flood Safety Protocols</span>
          </button>
        </nav>

        {/* Search & Filter Bar (for hotlines & evac centers) */}
        {activeTab !== "safety" && (
          <div className="emergency-toolbar">
            <div className="emergency-search-box">
              <Search size={16} className="emergency-search-icon" />
              <input
                type="text"
                placeholder={
                  activeTab === "hotlines"
                    ? "Search hotline, agency, number (e.g. 911, CDRRMO)..."
                    : "Search evacuation center, barangay, or landmark..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="emergency-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="emergency-search-clear"
                  onClick={() => setSearchQuery("")}
                >
                  ×
                </button>
              )}
            </div>

            {activeTab === "hotlines" && (
              <div className="emergency-category-chips">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`emergency-category-chip ${
                      selectedCategory === cat ? "chip-active" : ""
                    }`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat === "all" ? "All Categories" : cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modal Body / Tab Content */}
        <div className="emergency-content-area">
          {/* TAB 1: HOTLINES */}
          {activeTab === "hotlines" && (
            <div className="hotlines-grid">
              {filteredHotlines.length === 0 ? (
                <div className="emergency-empty-state">
                  <p>No emergency hotlines match your search query.</p>
                </div>
              ) : (
                filteredHotlines.map((hotline) => {
                  const rawTel = hotline.number.replace(/[^0-9+]/g, "");
                  const rawMobile = hotline.mobile
                    ? hotline.mobile.replace(/[^0-9+]/g, "")
                    : null;

                  return (
                    <article key={hotline.id} className="hotline-card">
                      <div className="hotline-card-header">
                        <div className="hotline-agency-info">
                          <span className="hotline-category-tag">
                            {hotline.category}
                          </span>
                          <h3 className="hotline-name">{hotline.name}</h3>
                          <span className="hotline-agency">
                            {hotline.agency}
                          </span>
                        </div>
                        <span
                          className={`hotline-priority-dot dot-${hotline.priority}`}
                          title={`Priority: ${hotline.priority}`}
                        />
                      </div>

                      <p className="hotline-description">
                        {hotline.description}
                      </p>

                      <div className="hotline-numbers-container">
                        <a
                          href={`tel:${rawTel}`}
                          className="hotline-call-btn"
                          title={`Call ${hotline.name} at ${hotline.number}`}
                        >
                          <PhoneCall size={16} />
                          <span className="hotline-number-text">
                            {hotline.number}
                          </span>
                          <span className="hotline-call-label">TAP TO CALL</span>
                        </a>

                        {hotline.secondaryNumber && (
                          <a
                            href={`tel:${hotline.secondaryNumber.replace(
                              /[^0-9+]/g,
                              ""
                            )}`}
                            className="hotline-secondary-btn"
                          >
                            <Phone size={14} />
                            <span>{hotline.secondaryNumber}</span>
                          </a>
                        )}

                        {hotline.mobile && (
                          <a
                            href={`tel:${rawMobile}`}
                            className="hotline-secondary-btn"
                          >
                            <Phone size={14} />
                            <span>{hotline.mobile}</span>
                          </a>
                        )}
                      </div>

                      <div className="hotline-card-footer">
                        <span className="hotline-avail-indicator">
                          ● {hotline.available}
                        </span>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: EVACUATION CENTERS */}
          {activeTab === "evacuation" && (
            <div className="evacuation-grid">
              {filteredEvacuationCenters.length === 0 ? (
                <div className="emergency-empty-state">
                  <p>No evacuation centers match your search query.</p>
                </div>
              ) : (
                filteredEvacuationCenters.map((shelter) => (
                  <article key={shelter.id} className="evacuation-card">
                    <div className="evacuation-card-header">
                      <div>
                        <span className="evacuation-district-tag">
                          {shelter.district} • {shelter.barangay}
                        </span>
                        <h3 className="evacuation-name">{shelter.name}</h3>
                      </div>
                      <span className="evacuation-status-badge">
                        {shelter.status}
                      </span>
                    </div>

                    <div className="evacuation-metrics-row">
                      <div className="evac-metric-box">
                        <Users size={16} />
                        <div>
                          <span className="metric-val">{shelter.capacity.toLocaleString()}</span>
                          <span className="metric-lbl">Max Capacity</span>
                        </div>
                      </div>
                      <div className="evac-metric-box">
                        <Building size={16} />
                        <div>
                          <span className="metric-val">{shelter.barangay}</span>
                          <span className="metric-lbl">Location</span>
                        </div>
                      </div>
                    </div>

                    <div className="evacuation-landmark">
                      <MapPin size={16} className="evac-pin-icon" />
                      <span>{shelter.landmark}</span>
                    </div>

                    <div className="evacuation-amenities">
                      <span className="amenities-title">Facilities & Support:</span>
                      <div className="amenities-chips">
                        {shelter.amenities.map((amenity, idx) => (
                          <span key={idx} className="amenity-chip">
                            ✓ {amenity}
                          </span>
                        ))}
                      </div>
                    </div>

                    {shelter.contactNumber && (
                      <div className="evacuation-contact-action">
                        <a
                          href={`tel:${shelter.contactNumber.replace(/[^0-9+]/g, "")}`}
                          className="evac-call-link"
                        >
                          <Phone size={14} />
                          <span>Barangay Evacuation Desk: {shelter.contactNumber}</span>
                        </a>
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          )}

          {/* TAB 3: SAFETY PROTOCOLS */}
          {activeTab === "safety" && (
            <div className="safety-protocols-container">
              <div className="safety-phase-selector">
                <button
                  type="button"
                  className={`safety-phase-btn ${
                    safetyPhase === "before" ? "phase-active" : ""
                  }`}
                  onClick={() => setSafetyPhase("before")}
                >
                  <Shield size={16} />
                  <span>Before Flood</span>
                </button>
                <button
                  type="button"
                  className={`safety-phase-btn ${
                    safetyPhase === "during" ? "phase-active phase-during" : ""
                  }`}
                  onClick={() => setSafetyPhase("during")}
                >
                  <AlertTriangle size={16} />
                  <span>During Flood (Critical)</span>
                </button>
                <button
                  type="button"
                  className={`safety-phase-btn ${
                    safetyPhase === "after" ? "phase-active" : ""
                  }`}
                  onClick={() => setSafetyPhase("after")}
                >
                  <CheckCircle2 size={16} />
                  <span>After Flood</span>
                </button>
              </div>

              <div className="safety-phase-content">
                <div className="phase-header-banner">
                  <h3>{SAFETY_GUIDELINES[safetyPhase].title}</h3>
                  <p>{SAFETY_GUIDELINES[safetyPhase].subtitle}</p>
                </div>

                <div className="safety-steps-list">
                  {SAFETY_GUIDELINES[safetyPhase].steps.map((step, index) => (
                    <div key={step.id} className="safety-step-card">
                      <div className="safety-step-number">{index + 1}</div>
                      <div className="safety-step-body">
                        <h4 className="safety-step-label">{step.label}</h4>
                        <p className="safety-step-detail">{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="emergency-footer">
          <p className="emergency-footer-note">
            ⚠️ <strong>Emergency Notice:</strong> If cell phone signal is down,
            tune to local radio stations (DXAB 1296 AM / DXRD 711 AM) or sound a
            whistle (3 short blasts) to signal search and rescue teams.
          </p>
        </div>
      </div>
    </div>
  );
}

