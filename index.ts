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
    try {
      const args = ['--no-sandbox', '--disable-setuid-sandbox']
      if (httpRequest.proxy?.url) {
        args.push(`--proxy-server=${httpRequest.proxy.url}`)
      }
      const browser = await puppeteer.launch({
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
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false })
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        })
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        })
      })
      page.setDefaultTimeout(httpRequest.timeout || 10000)
      page.setRequestInterception(true)

      page.on('request', async (request) => {
        const data = {
          method: httpRequest.method,
          headers: httpRequest.headers,
          postData: httpRequest.data
            ? JSON.stringify(httpRequest.data)
            : undefined
        }
        await request.continue(data)
      })

      const response = await page.goto(httpRequest.url)
      if (!response) {
        await browser.close()
        res.status(500).send('No response')
        return
      }

      const httpResponse: HttpResponse = {
        status: response.status(),
        headers: response.headers(),
        text: await response.text()
      }

      await browser.close()
      res.send(httpResponse)
    } catch (e) {
      if (e instanceof Error) {
        res.status(500).send(e.message)
      } else {
        res.status(500).send('An error occurred')
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
