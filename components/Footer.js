import React, { Component } from 'react'
import is from '../helpers/is'
import Navbar from './Navbar'
import SCCLogo from '../static/images/logo.svg'

const logoStyles = {
  width: '100%',
  maxWidth: '20px',
  height: 'auto'
}

class Footer extends Component {

  // constructor (props) {
  //   super(props)
  // }
  
  renderLogo = () => {
    return (
      <SCCLogo style={logoStyles} />
    )
  }
  
  render = () => {
    return (
      <Navbar
        className='fixed-bottom'
        center={[
          {
            content: this.renderLogo(),
            href: 'https://samcarlton.com',
            target: '_blank'
          }
        ]}
      />
    )
  }
}

export default Footer