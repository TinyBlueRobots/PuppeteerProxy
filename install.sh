#!/bin/bash

set -e

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    log "ERROR: $1" >&2
    exit 1
}

# Check if this is an update (service already exists) or fresh install
is_update() {
    ssh root@"$DESTINATION" 'systemctl list-unit-files | grep -q puppeteerproxy.service' 2>/dev/null
}

if [ -z "$DESTINATION" ]; then
    error "DESTINATION environment variable not set. Usage: DESTINATION=hostname ./install.sh"
fi

if is_update; then
    log "Detected existing installation - performing update to $DESTINATION..."
else
    log "Starting fresh installation to $DESTINATION..."
fi

log "Building PuppeteerProxy binary..."
bun build ./index.ts --compile --outfile puppeteerproxy || error "Failed to build binary"

if ! is_update; then
    log "Installing Puppeteer dependencies on $DESTINATION..."
    ssh root@"$DESTINATION" '[ ! -d /root/.cache/puppeteer ] && sudo apt update && sudo apt install -y npm && npx playwright install-deps && npx puppeteer install chromium' || error "Failed to install Puppeteer dependencies"
fi

log "Stopping service on $DESTINATION..."
ssh root@"$DESTINATION" 'systemctl stop puppeteerproxy.service' 2>/dev/null || log "Service not running"

if ! is_update; then
    log "Copying service file to $DESTINATION..."
    scp puppeteerproxy.service root@"$DESTINATION":/etc/systemd/system/puppeteerproxy.service || error "Failed to copy service file"
fi

log "Copying binary to $DESTINATION..."
scp puppeteerproxy root@"$DESTINATION":/opt || error "Failed to copy binary"

if ! is_update; then
    log "Enabling and starting service..."
    ssh root@"$DESTINATION" 'systemctl daemon-reload && systemctl enable puppeteerproxy.service && systemctl start puppeteerproxy.service' || error "Failed to start service"
else
    log "Starting service..."
    ssh root@"$DESTINATION" 'systemctl start puppeteerproxy.service' || error "Failed to start service"
fi

log "Checking service status..."
ssh root@"$DESTINATION" 'systemctl status puppeteerproxy.service --no-pager' || error "Service failed to start properly"

if is_update; then
    log "Update completed successfully!"
else
    log "Installation completed successfully!"
fi
