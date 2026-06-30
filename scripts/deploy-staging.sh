#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${STAGING_FIREBASE_PROJECT:-gemailla-enterprise-staging}"
BUILD_ID="${BUILD_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
GIT_SHA="${GIT_SHA:-$(git rev-parse --short=12 HEAD)}"
APP_VERSION="${APP_VERSION:-$(node -p "require('./package.json').version")}"
STAGING_BASE_URL="${STAGING_BASE_URL:-https://${PROJECT_ID}.web.app}"

export VITE_DEPLOY_ENV="staging"
export VITE_BUILD_ID="$BUILD_ID"
export VITE_GIT_SHA="$GIT_SHA"
export VITE_APP_VERSION="$APP_VERSION"
export DEPLOY_ENV="staging"
export BUILD_ID GIT_SHA APP_VERSION STAGING_BASE_URL

echo "Deploying staging release"
echo "project=$PROJECT_ID buildId=$BUILD_ID gitSha=$GIT_SHA appVersion=$APP_VERSION url=$STAGING_BASE_URL"

npm run validate:env
npm run test:unit
npm run build
npx firebase-tools deploy --project "$PROJECT_ID" --only hosting,functions,firestore:rules,storage --non-interactive
npm run smoke:staging

echo "Staging deploy complete. Record evidence in docs/evidencia/release-${BUILD_ID}.md"
