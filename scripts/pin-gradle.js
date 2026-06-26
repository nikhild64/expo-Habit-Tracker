#!/usr/bin/env node
/**
 * Pins the Android Gradle wrapper to a known-good version after `expo prebuild`.
 *
 * Expo SDK 55's prebuild template regenerates the wrapper at Gradle 9.0.0, but
 * `expo-manifests` (and a few other expo-modules) fail to apply their
 * publishing config under Gradle 9 with:
 *
 *   > Failed to apply plugin 'expo-autolinking'.
 *      > A problem occurred configuring project ':expo-manifests'.
 *         > SoftwareComponent with name 'release' not found.
 *
 * Gradle 8.13 evaluates the build.gradle in an order that registers the
 * `components.release` component before expo-manifests references it, so the
 * downgrade is the safest workaround until Expo patches the issue upstream.
 *
 * Safe to re-run — no-op if the wrapper is already pinned.
 *
 * See plan habitly_v2.0_best-in-class for the SDK 55 compatibility notes.
 */
const fs   = require('fs');
const path = require('path');

const PINNED = '8.13';
const WRAPPER = path.join(
  __dirname, '..', 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties',
);

if (!fs.existsSync(WRAPPER)) {
  console.log(`[pin-gradle] android/ not yet generated; nothing to do.`);
  process.exit(0);
}

const raw = fs.readFileSync(WRAPPER, 'utf8');
const reUrl = /^distributionUrl=.*/m;
const desired = `distributionUrl=https\\://services.gradle.org/distributions/gradle-${PINNED}-bin.zip`;

const current = raw.match(reUrl)?.[0] ?? '';
if (current === desired) {
  console.log(`[pin-gradle] already pinned to Gradle ${PINNED}`);
  process.exit(0);
}

const next = raw.replace(reUrl, desired);
fs.writeFileSync(WRAPPER, next, 'utf8');
console.log(`[pin-gradle] pinned Gradle wrapper to ${PINNED} (was: ${current.split('gradle-')[1] ?? '?'})`);
