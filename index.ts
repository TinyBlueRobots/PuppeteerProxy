import puppeteer, { Browser } from 'puppeteer'
import express from 'express'
import compression from 'compression'

// Parse proxy URL: http://user:pass@host:port
function parseProxyUrl(proxyEnv?: string) {
  if (!proxyEnv) return { url: undefined, user: undefined, pass: undefined }

  const parsed = new URL(proxyEnv)
  const user = parsed.username || undefined
  const pass = parsed.password || undefined

  // Rebuild URL without credentials
  parsed.username = ''
  parsed.password = ''
  const url = parsed.toString().replace(/\/$/, '') // Remove trailing slash

  return { url, user, pass }
}

const { url: PROXY_URL, user: PROXY_USER, pass: PROXY_PASS } = parseProxyUrl(
  process.env.HTTP_PROXY
)
const POOL_SIZE = parseInt(process.env.POOL_SIZE || '3', 10)
const browserPool: Browser[] = []

const launchArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-webrtc',
  ...(PROXY_URL ? [`--proxy-server=${PROXY_URL}`] : [])
]

async function createBrowser(): Promise<Browser> {
  return puppeteer.launch({ headless: true, args: launchArgs })
}

async function replenishPool(): Promise<void> {
  while (browserPool.length < POOL_SIZE) {
    browserPool.push(await createBrowser())
  }
}

async function getBrowser(): Promise<Browser> {
  const browser = browserPool.pop()
  replenishPool() // Don't await - replenish in background
  return browser || createBrowser()
}

async function launchWithProxy(proxyUrl?: string): Promise<Browser> {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-webrtc',
    ...(proxyUrl ? [`--proxy-server=${proxyUrl}`] : [])
  ]
  return puppeteer.launch({ headless: true, args })
}

type HttpRequest = {
  data: object
  headers: Record<string, string>
  method: string
  proxy?: string
  timeout: number
  url: string
}
type HttpResponse = {
  headers: Record<string, string>
  status: number
  text: string
}

const run = async () => {
  const app = express()
  app.use(express.json())
  app.use(compression())

  app.get('/', (_, res) => {
    res.send('Ready')
  })

  app.post('/', async (req, res) => {
    if (req.headers['x-api-key'] !== process.env.API_KEY) {
      res.status(403).send('Unauthorized')
      return
    }
    const httpRequest: HttpRequest = req.body
    httpRequest.method = httpRequest.method || 'GET'
    if (!httpRequest.url) {
      res.status(400).send('URL is required')
      return
    }

    let browser
    let proxyUser: string | undefined
    let proxyPass: string | undefined

    try {
      // Use pool if HTTP_PROXY set, otherwise per-request proxy
      if (PROXY_URL) {
        browser = await getBrowser()
        proxyUser = PROXY_USER
        proxyPass = PROXY_PASS
      } else if (httpRequest.proxy) {
        const { url, user, pass } = parseProxyUrl(httpRequest.proxy)
        browser = await launchWithProxy(url)
        proxyUser = user
        proxyPass = pass
      } else {
        browser = await launchWithProxy()
      }

      const page = await browser.newPage()

      // Authenticate proxy if credentials provided
      if (proxyUser && proxyPass) {
        await page.authenticate({
          username: proxyUser,
          password: proxyPass
        })
      }

      // Set user-agent via CDP (use from headers or default)
      const defaultUserAgent =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      const userAgent =
        httpRequest.headers?.['User-Agent'] ||
        httpRequest.headers?.['user-agent'] ||
        defaultUserAgent
      const client = await page.createCDPSession()
      await client.send('Network.setUserAgentOverride', {
        userAgent,
        userAgentMetadata: {
          brands: [
            { brand: 'Not_A Brand', version: '8' },
            { brand: 'Chromium', version: '120' },
            { brand: 'Google Chrome', version: '120' }
          ],
          fullVersion: '120.0.0.0',
          platform: 'Windows',
          platformVersion: '10.0.0',
          architecture: 'x86',
          model: '',
          mobile: false
        }
      })
      await page.setViewport({ width: 1920, height: 1080 })

      await page.evaluateOnNewDocument(() => {
        // Webdriver - should be undefined, not false
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined })

        // Chrome runtime (headless lacks this)
        Object.defineProperty(window, 'chrome', {
          value: {
            runtime: {},
            loadTimes: () => ({}),
            csi: () => ({}),
            app: {}
          }
        })

        // Permissions API fix
        const originalQuery = window.navigator.permissions.query.bind(
          window.navigator.permissions
        )
        Object.defineProperty(window.navigator.permissions, 'query', {
          value: (parameters: PermissionDescriptor) =>
            parameters.name === 'notifications'
              ? Promise.resolve({
                  state: Notification.permission
                } as PermissionStatus)
              : originalQuery(parameters)
        })

        // Plugins with realistic structure
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            const plugins = [
              {
                name: 'Chrome PDF Plugin',
                filename: 'internal-pdf-viewer',
                description: 'Portable Document Format'
              },
              {
                name: 'Chrome PDF Viewer',
                filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
                description: ''
              },
              {
                name: 'Native Client',
                filename: 'internal-nacl-plugin',
                description: ''
              }
            ]
            return plugins
          }
        })

        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        })

        // WebGL vendor/renderer spoofing
        const getParameterProto =
          WebGLRenderingContext.prototype.getParameter
        WebGLRenderingContext.prototype.getParameter = function (
          parameter: number
        ) {
          // UNMASKED_VENDOR_WEBGL
          if (parameter === 37445) return 'Intel Inc.'
          // UNMASKED_RENDERER_WEBGL
          if (parameter === 37446) return 'Intel Iris OpenGL Engine'
          return getParameterProto.call(this, parameter)
        }

        // Also patch WebGL2
        const getParameter2Proto =
          WebGL2RenderingContext.prototype.getParameter
        WebGL2RenderingContext.prototype.getParameter = function (
          parameter: number
        ) {
          if (parameter === 37445) return 'Intel Inc.'
          if (parameter === 37446) return 'Intel Iris OpenGL Engine'
          return getParameter2Proto.call(this, parameter)
        }

        // User-Agent Client Hints
        Object.defineProperty(navigator, 'userAgentData', {
          get: () => ({
            brands: [
              { brand: 'Not_A Brand', version: '8' },
              { brand: 'Chromium', version: '120' },
              { brand: 'Google Chrome', version: '120' }
            ],
            mobile: false,
            platform: 'Windows',
            getHighEntropyValues: () =>
              Promise.resolve({
                architecture: 'x86',
                model: '',
                platform: 'Windows',
                platformVersion: '10.0.0',
                uaFullVersion: '120.0.0.0'
              })
          })
        })

        // Screen/window dimensions
        Object.defineProperty(window, 'outerWidth', { get: () => 1920 })
        Object.defineProperty(window, 'outerHeight', { get: () => 1080 })
        Object.defineProperty(window, 'innerWidth', { get: () => 1920 })
        Object.defineProperty(window, 'innerHeight', { get: () => 969 })

        // Hardware properties
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })

        // Connection API
        Object.defineProperty(navigator, 'connection', {
          get: () => ({
            effectiveType: '4g',
            rtt: 50,
            downlink: 10,
            saveData: false
          })
        })
      })
      page.setDefaultTimeout(httpRequest.timeout || 10000)
      await page.setRequestInterception(true)

      page.on('request', async (request) => {
        // Only modify the main navigation request, let subrequests pass through normally
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
          await request.continue({
            method: httpRequest.method,
            headers: httpRequest.headers || {},
            postData: httpRequest.data
              ? JSON.stringify(httpRequest.data)
              : undefined
          })
        } else {
          await request.continue()
        }
      })

      const response = await page.goto(httpRequest.url)
      if (!response) {
        res.status(500).send('No response')
        return
      }

      const httpResponse: HttpResponse = {
        status: response.status(),
        headers: response.headers(),
        text: await response.text()
      }

      res.send(httpResponse)
    } catch (e) {
      if (e instanceof Error) {
        res.status(500).send(e.message)
      } else {
        res.status(500).send('An error occurred')
      }
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  async function cleanup() {
    console.log('Closing browser pool...')
    await Promise.all(browserPool.map((b) => b.close()))
    process.exit(0)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  // Pre-warm browser pool if using env var proxy
  if (PROXY_URL) {
    await replenishPool()
    console.log(`Browser pool ready (size: ${POOL_SIZE})`)
    console.log(`Using proxy: ${PROXY_URL}`)
  } else {
    console.log('No HTTP_PROXY set - using per-request proxy (no pool)')
  }

  app.listen(process.env.PORT || 8000, () => console.log('Server is running'))
}
run()
