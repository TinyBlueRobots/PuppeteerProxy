# PuppeteerProxy

A headless Chrome web fetching service with built-in anti-detection measures. Send a URL, get the fully rendered page content back.

## Features

- **Headless Chrome browser** - Uses real browser rendering via Puppeteer
- **Anti-detection** - Spoofs WebDriver, plugins, WebGL, user-agent client hints, and more to avoid bot detection
- **Upstream proxy support** - Route browser traffic through an external proxy
- **Simple REST API** - POST a URL, get the rendered page content
- **Lightweight** - Built with Bun for fast startup and low memory footprint

## Quick Start

```bash
docker run -d -p 8000:8000 -e API_KEY=your-secret-key joncanning/puppeteerproxy
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_KEY` | Required API key for authentication | - |
| `HTTP_PROXY` | Upstream proxy URL (e.g., `http://user:pass@host:port`) | - |
| `PORT` | Server port | `8000` |

## API Usage

### Health Check
```bash
curl http://localhost:8000/
# Returns: Ready
```

### Fetch a Page
```bash
curl -X POST http://localhost:8000/ \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"url": "https://example.com"}'
```

### Request Options

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | Target URL (required) |
| `method` | string | HTTP method (default: GET) |
| `headers` | object | Custom headers |
| `data` | object | POST body data |
| `proxy` | string | Upstream proxy URL for this request |
| `timeout` | number | Request timeout in ms (default: 30000) |

### Response Format

```json
{
  "status": 200,
  "headers": { ... },
  "text": "<html>...</html>"
}
```

## Anti-Detection Features

- WebDriver property masking
- Chrome runtime emulation
- Realistic browser plugins
- WebGL vendor/renderer spoofing
- User-Agent Client Hints support
- Hardware fingerprint normalization

## Source Code

[GitHub Repository](https://github.com/joncanning/puppeteerproxy)
