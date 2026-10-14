import assert from "node:assert/strict";
import test from "node:test";

import {
  EMERGENCY_HOTLINES,
  EVACUATION_CENTERS,
  SAFETY_GUIDELINES,
} from "../data/emergencyData.js";
import {
  OPEN_EMERGENCY_EVENT,
  openEmergencyDirectory,
} from "./emergencyEvents.js";

test("EMERGENCY_HOTLINES contains vital disaster response agencies", () => {
  assert.ok(Array.isArray(EMERGENCY_HOTLINES), "Hotlines should be an array");
  assert.ok(EMERGENCY_HOTLINES.length >= 6, "Should provide at least 6 primary hotlines");

  const numbers = EMERGENCY_HOTLINES.map((h) => h.number);
  assert.ok(numbers.includes("911"), "Must include National 911");
  assert.ok(
    EMERGENCY_HOTLINES.some((h) => h.name.includes("CDRRMO")),
    "Must include CDRRMO Operations Center"
  );
  assert.ok(
    EMERGENCY_HOTLINES.some((h) => h.name.includes("Red Cross")),
    "Must include Philippine Red Cross"
  );
  assert.ok(
    EMERGENCY_HOTLINES.some((h) => h.name.includes("Fire")),
    "Must include Bureau of Fire Protection"
  );

  for (const hotline of EMERGENCY_HOTLINES) {
    assert.ok(hotline.id, "Hotline must have an id");
    assert.ok(hotline.name, "Hotline must have a name");
    assert.ok(hotline.agency, "Hotline must have an agency");
    assert.ok(hotline.number, "Hotline must have a phone number");
    assert.ok(hotline.category, "Hotline must have a category");
    assert.ok(hotline.description, "Hotline must have a description");
  }
});

test("EVACUATION_CENTERS contains designated shelters with capacities and landmarks", () => {
  assert.ok(Array.isArray(EVACUATION_CENTERS), "Evacuation centers should be an array");
  assert.ok(EVACUATION_CENTERS.length >= 4, "Should provide at least 4 designated shelters");

  for (const shelter of EVACUATION_CENTERS) {
    assert.ok(shelter.id, "Shelter must have an id");
    assert.ok(shelter.name, "Shelter must have a name");
    assert.ok(shelter.barangay, "Shelter must specify a barangay");
    assert.ok(shelter.district, "Shelter must specify a district");
    assert.ok(typeof shelter.capacity === "number" && shelter.capacity > 0, "Capacity must be positive number");
    assert.ok(shelter.landmark, "Shelter must have landmark instructions");
    assert.ok(Array.isArray(shelter.amenities) && shelter.amenities.length > 0, "Shelter must list amenities");
    assert.ok(Array.isArray(shelter.coordinates) && shelter.coordinates.length === 2, "Coordinates must be [lat, lng]");
  }
});

test("SAFETY_GUIDELINES provides complete before, during, and after flood protocols", () => {
  assert.ok(SAFETY_GUIDELINES.before, "Must have before-flood guidelines");
  assert.ok(SAFETY_GUIDELINES.during, "Must have during-flood guidelines");
  assert.ok(SAFETY_GUIDELINES.after, "Must have after-flood guidelines");

  for (const phase of ["before", "during", "after"]) {
    const data = SAFETY_GUIDELINES[phase];
    assert.ok(data.title, `${phase} must have title`);
    assert.ok(data.subtitle, `${phase} must have subtitle`);
    assert.ok(Array.isArray(data.steps) && data.steps.length >= 3, `${phase} must have at least 3 steps`);

    for (const step of data.steps) {
      assert.ok(step.id, "Step must have an id");
      assert.ok(step.label, "Step must have a label");
      assert.ok(step.detail, "Step must have detailed safety instructions");
    }
  }
});

test("openEmergencyDirectory dispatches custom window event safely", () => {
  assert.equal(OPEN_EMERGENCY_EVENT, "aquaguard:open-emergency-directory");

  let dispatched = false;
  // Mock window in Node.js environment
  globalThis.window = {
    dispatchEvent(event) {
      if (event.type === OPEN_EMERGENCY_EVENT) {
        dispatched = true;
      }
    },
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type) {
      this.type = type;
    }
  };

  openEmergencyDirectory();
  assert.equal(dispatched, true, "openEmergencyDirectory should dispatch event on window");

  delete globalThis.window;
  delete globalThis.CustomEvent;
});

