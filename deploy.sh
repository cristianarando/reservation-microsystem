#!/bin/sh
set -e
echo "⬇️ Updating repository..."
git pull origin main
echo "📦 Pulling prebuilt image from GitHub Container Registry..."
docker compose pull
echo "🚀 Restarting container with the new image (no on-VM build)..."
docker compose up -d --no-build
echo "🧹 Pruning old images..."
docker image prune -f
docker compose ps
