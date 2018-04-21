import Link from 'next/link'
import { connect } from 'react-redux'
import NoSSR from 'react-no-ssr'
import Location from '../components/Location'
import classNames from 'classnames'

export default connect(state => state)(({ banStatus }) => {
  return (
    <div
      className='main-container d-flex align-items-center text-light'
      style={{ backgroundColor: banStatus.backgroundColor, minHeight: '100vh' }}>
        <div className={'container'}>
            <div className='row justify-content-center align-content-center'>
                <div className='col-sm-4 text-center'>
                    <div className='display-4 font-weight-bold'>
                      { banStatus.word }
                    </div>
                    <div>
                      <span className={classNames({'shimmer': (banStatus.key === 'checking') })}>
                        { banStatus.message }
                      </span>
                    </div>
                    <Location />
                </div>
            </div>
        </div>
    </div>
  )
})