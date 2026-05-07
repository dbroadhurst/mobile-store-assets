import type { Platform, PlatformConfig } from './types.js';

export const PLATFORMS: Record<Platform, PlatformConfig> = {
  'android-phone': {
    width: 1440, height: 2880,
    aspectRatio: '9:16',
    outputDir: 'google-play/phone',
  },
  'android-tablet': {
    width: 1600, height: 2560,
    aspectRatio: '3:4',
    outputDir: 'google-play/tablet',
  },
  'ios-phone': {
    width: 1320, height: 2868,
    aspectRatio: '9:16',
    outputDir: 'app-store/iphone-6.9',
  },
  'ios-tablet': {
    width: 2048, height: 2732,
    aspectRatio: '3:4',
    outputDir: 'app-store/ipad-pro-12.9',
  },
};

export const FEATURE_GRAPHIC = { width: 1024, height: 500 };
