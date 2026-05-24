#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/piecework-erp}"

cd "$APP_DIR"
cp -n .env.example .env || true
docker compose up -d --build
docker compose ps
