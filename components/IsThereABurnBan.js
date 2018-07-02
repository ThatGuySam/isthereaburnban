import React from 'react'
import { connect } from 'react-redux'
import classNames from 'classnames'
import is from '../helpers/is'
import Location from './Location'
import Footer from './Footer'

export default connect(state => state)(({ banStatus }) => {
  const hasButton = (is.propertyDefined(banStatus, 'button') && !!banStatus.button)
  return (
    <div
      className='main-container d-flex align-items-center text-light'
      style={{ backgroundColor: banStatus.backgroundColor, minHeight: '100vh' }}
    >
      <div className="container">
        <div className='row justify-content-center align-content-center'>
          <div className='col-sm-4 text-center'>
            <div className='display-4 font-weight-bold pb-3'>
              { banStatus.word }
            </div>
            <div className='pb-3'>
              <span className={classNames({'shimmer': (banStatus.key === 'checking') })}>
                { banStatus.message }
              </span>
            </div>
            <Location />
          </div>
        </div>
        { (hasButton) && (
          <div className='button-row row justify-content-center align-content-center py-4'>
            <div className='col-md-4 text-center'>
              <div className='pb-4'>
                <a
                  href={banStatus.button.url}
                  className='btn btn-light'
                  style={{ color: banStatus.backgroundColor }}
                >
                  { banStatus.button.label }
                </a>
              </div>
            </div>
          </div>
)}
        <Footer />
      </div>
    </div>
  )
})