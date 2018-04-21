/*
In production the stylesheet is compiled to .next/static/style.css and served from /_next/static/style.css

You have to include it into the page using either next/head or a custom _document.js, as is being done in this file.
*/

import Document, { Head, Main, NextScript } from 'next/document'
import FacebookProvider from 'react-facebook';


export default class MyDocument extends Document {
  render () {
    return (
      <html>
        <Head>
          <meta name='viewport' content='width=device-width, height=device-height, initial-scale=1' />
          <link rel='stylesheet' href='https://stackpath.bootstrapcdn.com/bootstrap/4.1.0/css/bootstrap.min.css' integrity='sha384-9gVQ4dYFwwWSjIDZnLEWnxCjeSWFphJiwGPXr1jddIhOegiu1FwO5qRGvFXOdJZ4' crossOrigin='anonymous' />
          <link rel='stylesheet' href='/static/style.css' />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
