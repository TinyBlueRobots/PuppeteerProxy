#!/bin/bash
set -e

if [ -z "$DESTINATION" ]; then
    echo "Error: DESTINATION environment variable not set. Usage: DESTINATION=hostname ./install.sh" >&2
    exit 1
fi

echo "Building puppeteerproxy..."
bun build ./index.ts --compile --outfile puppeteerproxy

echo "Installing dependencies on remote server..."
ssh root@"$DESTINATION" '[ ! -d /root/.cache/puppeteer ] && sudo apt update && sudo apt install -y npm && npx playwright install-deps && npx puppeteer install chromium' || {
    echo "Warning: Failed to install some dependencies, continuing..." >&2
}

echo "Stopping existing service..."
ssh root@"$DESTINATION" 'systemctl stop puppeteerproxy.service' 2>/dev/null || {
    echo "Service not running or doesn't exist yet, continuing..."
}

echo "Copying service file..."
scp puppeteerproxy.service root@"$DESTINATION":/etc/systemd/system

echo "Copying binary..."
scp puppeteerproxy root@"$DESTINATION":/opt

echo "Starting service..."
ssh root@"$DESTINATION" 'systemctl daemon-reload && systemctl enable puppeteerproxy.service && systemctl start puppeteerproxy.service'