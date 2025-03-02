#!/bin/bash
bun build ./index.ts --compile --outfile puppeteerproxy
ssh root@"$DESTINATION" '[ ! -d /root/.cache/puppeteer ] && sudo apt update && sudo apt install -y npm && npx playwright install-deps && npx puppeteer install chromium'
ssh root@"$DESTINATION" 'systemctl stop puppeteerproxy.service'
scp puppeteerproxy.service root@"$DESTINATION":/etc/systemd/system
scp puppeteerproxy root@"$DESTINATION":/opt
ssh root@"$DESTINATION" 'systemctl daemon-reload && systemctl enable puppeteerproxy.service && systemctl start puppeteerproxy.service'
