import puppeteer from 'puppeteer'
import express from 'express'

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
const run = async () => {
  const app = express()

  app.use(express.json())

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
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox']
      })
      const page = await browser.newPage()
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
        res.status(500).send('No response')
        return
      }
      const httpResponse: HttpResponse = {
        status: response.status(),
        headers: response.headers(),
        text: await response.text()
      }
      await page.close()
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
  app.listen(process.env.PORT || 8000, () => console.log('Server is running'))
}
run()
