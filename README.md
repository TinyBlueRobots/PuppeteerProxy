# PuppeteerProxy

A lightweight proxy service that uses Puppeteer to make HTTP requests through a headless Chrome browser.

### Prerequisites

- [Bun](https://bun.sh)

### Local Installation

```bash
# Clone the repository
git clone [your-repo-url]
cd PuppeteerProxy

# Install dependencies
./install.sh
# OR
bun install
```

## Usage

### Starting the Server

```bash
bun start
```

The server will start on port 8000 by default, or you can set a custom port using the `PORT` environment variable.

### API Endpoints

#### Health Check

```
GET /
```

Returns "Ready" if the server is up and running.

#### Make a Request

```
POST /
```

Headers:
- `x-api-key`: Your API key for authentication (set via API_KEY environment variable)

Request Body:
```json
{
  "url": "https://example.com",
  "method": "GET",
  "headers": {
    "User-Agent": "Custom User Agent"
  },
  "data": {},
  "timeout": 10000
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | The URL to request |
| `method` | string | No | HTTP method (default: GET) |
| `headers` | object | No | Custom headers to send |
| `data` | object | No | Request body for POST/PUT requests |
| `timeout` | number | No | Request timeout in ms (default: 10000) |
| `proxy` | string | No | Proxy URL (ignored if `HTTP_PROXY` env var is set) |

#### Proxy Configuration

There are two ways to configure a proxy:

**1. Environment Variable**

Set `HTTP_PROXY` to use a global proxy for all requests:

```bash
HTTP_PROXY="http://user:pass@proxy.example.com:8080" bun start
```

When `HTTP_PROXY` is set, the per-request `proxy` field is ignored.

**2. Per-Request Proxy**

When `HTTP_PROXY` is not set, you can specify a proxy per request. Supports embedded credentials:

```json
{
  "url": "https://example.com",
  "proxy": "http://user:pass@proxy.example.com:8080"
}
```

Response:
```json
{
  "status": 200,
  "headers": {
    "content-type": "text/html; charset=utf-8",
    ...
  },
  "text": "<html>..."
}
```

## Docker Deployment

```bash
# Build the Docker image
docker build -t puppeteerproxy .

# Run the container
docker run -p 8000:8000 -e API_KEY=your_api_key puppeteerproxy

# Run with proxy
docker run -p 8000:8000 \
  -e API_KEY=your_api_key \
  -e HTTP_PROXY="http://user:pass@proxy.example.com:8080" \
  puppeteerproxy
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 8000 |
| `API_KEY` | API key for authentication | - |
| `HTTP_PROXY` | Global proxy URL | - |
