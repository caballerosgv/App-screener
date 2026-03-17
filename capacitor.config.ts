import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.appscreener.app',
  appName: 'App Screener',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
