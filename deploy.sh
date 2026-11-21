#!/bin/sh
set -e
echo "⬇️ Actualizando repositorio..."
git pull origin main
echo "📦 Descargando imagen precompilada desde GitHub Container Registry..."
docker compose pull
echo "🚀 Reiniciando contenedor con la nueva imagen (sin compilar en la VM)..."
docker compose up -d --no-build
echo "🧹 Limpiando imágenes antiguas..."
docker image prune -f
docker compose ps
