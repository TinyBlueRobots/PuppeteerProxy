import puppeteer from 'puppeteer'
import express from 'express'
import compression from 'compression'

type HttpRequest = {
  data: object
  headers: Record<string, string>
  method: string
  proxy?: {
    url: string
    username?: string
    password?: string
  }
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
    const args = ['--no-sandbox', '--disable-setuid-sandbox']
    if (httpRequest.proxy?.url) {
      args.push(`--proxy-server=${httpRequest.proxy.url}`)
    }

    let browser
    try {
      browser = await puppeteer.launch({
        headless: true,
        args
      })
      const page = await browser.newPage()
      if (httpRequest.proxy?.username && httpRequest.proxy?.password) {
        await page.authenticate({
          username: httpRequest.proxy.username,
          password: httpRequest.proxy.password
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
            Object.setPrototypeOf(plugins, PluginArray.prototype)
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
      })
      page.setDefaultTimeout(httpRequest.timeout || 10000)
      page.setRequestInterception(true)

      page.on('request', async (request) => {
        // Only modify the main navigation request, let subrequests pass through normally
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
          await request.continue({
            method: httpRequest.method,
            headers: httpRequest.headers,
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

  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...')
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...')
    process.exit(0)
  })

  app.listen(process.env.PORT || 8000, () => console.log('Server is running'))
}
run()
