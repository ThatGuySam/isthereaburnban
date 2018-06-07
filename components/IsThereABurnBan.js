import Link from 'next/link'
import { connect } from 'react-redux'
import NoSSR from 'react-no-ssr'
import classNames from 'classnames'
import is from '../helpers/is'
import Location from '../components/Location'

export default connect(state => state)(({ banStatus }) => {
  return (
    <div
      className='main-container d-flex align-items-center text-light'
      style={{ backgroundColor: banStatus.backgroundColor, minHeight: '100vh' }}>
        <div className={'container'}>
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
            { is.propertyDefined(banStatus, 'button') &&
              <div className='button-row row justify-content-center align-content-center py-4'>
                <div className='col-sm-4 text-center'>
                  <div className='pb-4'>
                    <a
                      href={ banStatus.button.url }
                      className='btn bg-white'
                      style={{ color: banStatus.backgroundColor }}
                    >
                      { banStatus.button.label }
                    </a>
                  </div>
                </div>
              </div>
            }
        </div>
    </div>
  )
})