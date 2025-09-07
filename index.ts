import puppeteer, { Browser, Page } from 'puppeteer'
import express from 'express'
import compression from 'compression'
import path from 'path'

type HttpRequest = {
  data: object
  headers: Record<string, string>
  method: string
  timeout: number
  url: string
}
type HttpResponse = {
  headers: Record<string, string>
  status: number
  text: string
}

const browser = puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  userDataDir: path.join(__dirname, 'chrome-profile')
})

const getPage = async (): Promise<Page> => {
  const browserInstance = await browser
  const page = await browserInstance.newPage()

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    })
  })

  return page
}

const cleanupBrowser = async () => {
  const browserInstance = await browser
  await browserInstance.close()
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
      const page = await getPage()
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
        await page.close()
        res.status(500).send('No response')
        return
      }

      const httpResponse: HttpResponse = {
        status: response.status(),
        headers: response.headers(),
        text: await response.text()
      }

      await page.close()
      res.send(httpResponse)
    } catch (e) {
      if (e instanceof Error) {
        res.status(500).send(e.message)
      } else {
        res.status(500).send('An error occurred')
      }
    }
  })

  process.on('SIGINT', async () => {
    console.log('Received SIGINT, cleaning up...')
    await cleanupBrowser()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, cleaning up...')
    await cleanupBrowser()
    process.exit(0)
  })

  app.listen(process.env.PORT || 8000, () => console.log('Server is running'))
}
run()
