/*
In production the stylesheet is compiled to .next/static/style.css and served from /_next/static/style.css

You have to include it into the page using either next/head or a custom _document.js, as is being done in this file.
*/
import React from 'react'
import Document, { Head, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
  render () {
    return (
      <html lang='en'>
        <Head>
          <meta charSet='utf-8' />
          <meta name='viewport' content='width=device-width, height=device-height, initial-scale=1, shrink-to-fit=no' />
          
          <title>
            { process.env.APP_NAME }
          </title>
          
          <meta name='description' content={process.env.APP_DESCRIPTION} />
          
          <meta property='fb:app_id' content={process.env.FACEBOOK_APP_ID} />
          <meta property='og:url' content='https://isthereaburnban.com' />
          <meta property='og:type' content='website' />
          <meta property='og:title' content={process.env.APP_NAME} />
          <meta property='og:image' content='http://isthereaburnban.com/static/images/og-image.png' />
          <meta property='og:description' content={process.env.APP_DESCRIPTION} />
          <meta property='og:site_name' content={process.env.APP_NAME} />
          <meta property='og:locale' content='en_US' />
          
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
