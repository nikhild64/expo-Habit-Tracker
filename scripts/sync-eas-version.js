/**
 * Reads the versionCode from android/app/build.gradle and syncs it
 * to EAS by calling the Expo GraphQL API directly (no interactive prompt).
 *
 * Run AFTER `gradlew assembleRelease / bundleRelease`.
 */
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

const GRADLE_PATH   = path.resolve(__dirname, '../android/app/build.gradle');
const APP_JSON_PATH = path.resolve(__dirname, '../app.json');
const EAS_API       = 'api.expo.dev';

// --- Read versionCode from build.gradle ---
const gradle       = fs.readFileSync(GRADLE_PATH, 'utf8');
const versionMatch = gradle.match(/\bversionCode\s+(\d+)/);
if (!versionMatch) {
  console.error('Could not find versionCode in build.gradle');
  process.exit(1);
}
const versionCode = versionMatch[1];

// --- Read project metadata from app.json ---
const appJson           = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf8'));
const projectId         = appJson.expo.extra.eas.projectId;
const applicationId     = appJson.expo.android.package;
const storeVersion      = appJson.expo.version ?? '1.0.0';

// --- Get auth token from EXPO_TOKEN env or ~/.expo/state.json ---
function getSessionSecret() {
  if (process.env.EXPO_TOKEN) return { token: process.env.EXPO_TOKEN };

  const statePath = path.join(os.homedir(), '.expo', 'state.json');
  if (!fs.existsSync(statePath)) {
    console.error('No EXPO_TOKEN env var and no ~/.expo/state.json found. Run `eas login` first.');
    process.exit(1);
  }
  const state  = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const secret = state?.auth?.sessionSecret;
  if (!secret) {
    console.error('Could not find session secret in ~/.expo/state.json. Run `eas login` first.');
    process.exit(1);
  }
  return { sessionSecret: secret };
}

const auth = getSessionSecret();

// --- GraphQL mutation (same one EAS CLI uses internally) ---
const mutation = `
  mutation CreateAppVersionMutation($appVersionInput: AppVersionInput!) {
    appVersion {
      createAppVersion(appVersionInput: $appVersionInput) {
        id
      }
    }
  }
`;

const variables = {
  appVersionInput: {
    appId:                 projectId,
    platform:              'ANDROID',
    applicationIdentifier: applicationId,
    storeVersion,
    buildVersion:          String(versionCode),
  },
};

const body    = JSON.stringify({ query: mutation, variables });
const headers = {
  'Content-Type':       'application/json',
  'Content-Length':     Buffer.byteLength(body),
  'expo-client-info':   JSON.stringify({ appVersion: '0.0.0', sdkVersion: '0.0.0' }),
};

if (auth.sessionSecret) headers['expo-session']   = auth.sessionSecret;
if (auth.token)         headers['authorization']  = `Bearer ${auth.token}`;

console.log(`\nSyncing EAS remote versionCode → ${versionCode} (appId: ${projectId})`);

const req = https.request(
  { hostname: EAS_API, path: '/graphql', method: 'POST', headers },
  (res) => {
    let data = '';
    res.on('data',  (chunk) => (data += chunk));
    res.on('end',   () => {
      try {
        const json = JSON.parse(data);
        if (json.errors) {
          console.error('EAS API error:', JSON.stringify(json.errors, null, 2));
          process.exit(1);
        }
        console.log(`✓ EAS remote versionCode set to ${versionCode}`);
      } catch {
        console.error('Failed to parse EAS API response:', data);
        process.exit(1);
      }
    });
  },
);

req.on('error', (err) => {
  console.error('Request failed:', err.message);
  process.exit(1);
});

req.write(body);
req.end();
