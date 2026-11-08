import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";

import {
  isDesktopNotificationSupported,
  getDesktopNotificationPermission,
  requestDesktopNotificationPermission,
  triggerDesktopNotification,
} from "./desktopNotification.js";

class MockNotification {
  static permission = "default";
  static instances = [];

  static async requestPermission() {
    MockNotification.permission = "granted";
    return MockNotification.permission;
  }

  constructor(title, options) {
    this.title = title;
    this.options = options;
    this.closed = false;
    MockNotification.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  MockNotification.permission = "default";
  MockNotification.instances = [];
  globalThis.window = {
    Notification: MockNotification,
    focus: () => {},
  };
  globalThis.Notification = MockNotification;
});

afterEach(() => {
  delete globalThis.Notification;
  delete globalThis.window;
});

test("isDesktopNotificationSupported reports true when window.Notification exists", () => {
  assert.equal(isDesktopNotificationSupported(), true);
});

test("getDesktopNotificationPermission returns current permission", () => {
  assert.equal(getDesktopNotificationPermission(), "default");
  MockNotification.permission = "granted";
  assert.equal(getDesktopNotificationPermission(), "granted");
});

test("requestDesktopNotificationPermission requests and returns permission", async () => {
  const perm = await requestDesktopNotificationPermission();
  assert.equal(perm, "granted");
  assert.equal(MockNotification.permission, "granted");
});

test("triggerDesktopNotification returns null when permission is not granted", () => {
  MockNotification.permission = "denied";
  const result = triggerDesktopNotification({ station_id: 1, title: "Test" }, "warning");
  assert.equal(result, null);
  assert.equal(MockNotification.instances.length, 0);
});

test("triggerDesktopNotification dispatches critical flood alert with requireInteraction", () => {
  MockNotification.permission = "granted";
  const alert = {
    station_id: 3,
    station_name: "Riverside Channel",
    message: "Water level 2.65m - critical flood breach!",
  };

  const notification = triggerDesktopNotification(alert, "critical");
  assert.ok(notification);
  assert.equal(MockNotification.instances.length, 1);
  assert.match(notification.title, /CRITICAL FLOOD/);
  assert.match(notification.title, /Riverside Channel/);
  assert.equal(notification.options.requireInteraction, true);
  assert.equal(notification.options.tag, "flood-alert-3");
});

test("triggerDesktopNotification dispatches warning alert", () => {
  MockNotification.permission = "granted";
  const alert = {
    station_id: 2,
    message: "Water level 2.10m - approaching danger level.",
  };

  const notification = triggerDesktopNotification(alert, "warning");
  assert.ok(notification);
  assert.match(notification.title, /FLOOD WARNING/);
  assert.match(notification.title, /Station 2/);
  assert.equal(notification.options.requireInteraction, false);
});
