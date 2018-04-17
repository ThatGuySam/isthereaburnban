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
      place: null,
      inEffect: null,
      backgroundColor: '#9a9a9a',
      word: 'Checking',
      message: ''
    }
  }
  
  componentDidMount = async () => {
    const res = await fetch('/check')
    const json = await res.json()
    const inEffect = json.county.inEffect
    
    console.log(json.county)
    
    this.setState({
      hasFetched: true,
      place: json.place,
      inEffect: inEffect,
      backgroundColor: (inEffect) ? '#f34f49' : '#35c28c',
      word: (inEffect) ? 'Yes' : 'Nope',
      message: (inEffect) ? `There is a ban in effect for ${json.place}` : `There is no burn ban active for ${json.place}`,
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
