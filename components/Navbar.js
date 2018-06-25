import React, { Component } from 'react'
// import Link from 'next/link'
import is from '../helpers/is'

class Navbar extends Component {
  
  static defaultProps = {
    className: 'fixed-top',
    right: [],
    center: [],
    left: []
  }

  // constructor (props) {
  //   super(props)
  // }
  
  renderNavItem = (navItem, i) => {
    // navItem.className
    // navItem.url
    // navItem.label
    const navItemContent = (is.function(navItem.content)) ? navItem.content() : navItem.content
    return (
      <li className={`nav-item ${navItem.className || ''}`} key={`nav-item-${i}`}>
        <a className="nav-link" href={navItem.href} target={navItem.target || '_self'}>
          { navItemContent }
        </a>
      </li>
    )
  }
  
  render = () => {
    const { className, left, center, right } = this.props
    
    return (
      <nav className={`navbar navbar-dark ${className}`}>
        <div className="container justify-content-center">
          { is.not.empty(left) && (
          <ul className="nav navbar-nav flex-fill flex-nowrap flex-row">
            { left.map((navItem) => this.renderNavItem(navItem)) }
          </ul>
)}
          { is.not.empty(center) && (
          <ul className="nav navbar-nav flex-fill justify-content-center flex-row">
            { center.map(this.renderNavItem) }
          </ul>
)}
          { is.not.empty(right) && (
          <ul className="nav navbar-nav flex-fill justify-content-end  flex-row">
            { right.map((navItem) => this.renderNavItem(navItem)) }
          </ul>
)}
        </div>
      </nav>
    )
  }
}

export default Navbar