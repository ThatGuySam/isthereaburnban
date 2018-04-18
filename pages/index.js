import React, { Component } from 'react'
import Link from 'next/link'
import 'isomorphic-unfetch'
import '../style.css'
// checking - #9a9a9a
// success - #8bc34a

export default class Index extends Component {
  
  // static async getInitialProps (ctx) {
  //   return {}
  // }
  
  static defaultProps = {
    style: {}
  }

  constructor (props) {
    super(props)

    this.state = {
      hasFetched: false,
      backgroundColor: '#9a9a9a',
      word: 'Checking',
      message: ''
    }
  }
  
  componentDidMount = async () => {
    const res = await fetch('/check')
    const result = await res.json()
    const status = result.status
    
    this.setState({
      hasFetched: true,
      backgroundColor: status.backgroundColor,
      word: status.word,
      message: status.message,
    })
  }
  
  

  render = () => {
    return (
      <div
        className='main-container d-flex align-items-center text-light'
        style={{ backgroundColor: this.state.backgroundColor, minHeight: '100vh' }}>
          <div className='container'>
              <div className='row justify-content-center align-content-center'>
                  <div className='col-sm-4 text-center'>
                      <div className='display-4 font-weight-bold'>
                          { this.state.word }
                      </div>
                      <div className=''>
                          { this.state.message }
                      </div>
                  </div>
              </div>
          </div>
      </div>
    )
  }
}
