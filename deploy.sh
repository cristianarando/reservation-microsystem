#!/bin/sh
set -e
echo "Updating repository..."
git pull --ff-only origin main

echo "Pulling prebuilt image from GitHub Container Registry..."
docker compose pull

echo "Restarting container with the new image (no on-VM build)..."
docker compose up -d --no-build

echo "Waiting for health check at 127.0.0.1:3000/api/health..."
ATTEMPTS=0
MAX_ATTEMPTS=25
until curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo "ERROR: Container did not pass /api/health within timeout."
    docker compose logs --tail=50
    exit 1
  fi
  sleep 2
done

echo "Service healthy! Pruning superseded images..."
docker image prune -f
docker compose ps
