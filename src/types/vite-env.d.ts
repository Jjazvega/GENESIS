interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_BUILD_ID?: string;
  readonly VITE_GIT_SHA?: string;
  readonly VITE_DEPLOY_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  GEMAILLA_FIREBASE_CONFIG?: {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
  };
  GEMAILLA_USE_FIREBASE_EMULATORS?: 'auto' | 'true' | 'false' | boolean;
  GEMAILLA_RELEASE?: {
    APP_VERSION?: string;
    BUILD_ID?: string;
    GIT_SHA?: string;
    DEPLOY_ENV?: string;
  };
  __GEMAILLA_ERROR_TRACKING__?: boolean;
}

declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;
declare const __GIT_SHA__: string;
declare const __DEPLOY_ENV__: string;
