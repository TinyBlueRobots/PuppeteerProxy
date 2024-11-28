FROM oven/bun AS build
WORKDIR /app
COPY . .
RUN bun install
RUN bun build ./index.ts --compile --outfile puppeteerproxy

FROM dockerclovertech/puppeteer
WORKDIR /app
COPY --from=build /app/puppeteerproxy puppeteerproxy
RUN npx puppeteer browsers install chrome
CMD ["./puppeteerproxy"]