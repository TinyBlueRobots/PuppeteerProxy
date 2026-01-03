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
  "timeout": 10000,
  "proxy": {
    "url": "http://proxy.example.com:8080",
    "username": "user",
    "password": "pass"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | The URL to request |
| `method` | string | No | HTTP method (default: GET) |
| `headers` | object | No | Custom headers to send |
| `data` | object | No | Request body for POST/PUT requests |
| `timeout` | number | No | Request timeout in ms (default: 10000) |
| `proxy` | object | No | Proxy configuration (see below) |

#### Proxy Configuration

The `proxy` field is optional and allows routing requests through a proxy server:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `proxy.url` | string | Yes | Proxy server URL (e.g., `http://proxy:8080`) |
| `proxy.username` | string | No | Username for authenticated proxies |
| `proxy.password` | string | No | Password for authenticated proxies |

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
```

## Environment Variables

- `PORT`: Server port (default: 8000)
- `API_KEY`: API key for authentication
