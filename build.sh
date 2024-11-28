#!/bin/bash
rm -rf build
bun install
bun build ./index.ts --target=node --outdir=build
mv build/index.js build/index.mjs
docker build -t puppeteerproxy .
docker tag puppeteerproxy:latest joncanning/puppeteerproxy
docker push joncanning/puppeteerproxy