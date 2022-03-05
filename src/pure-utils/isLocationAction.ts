// @flow
import { AnyAction } from 'redux'

// import type { Action, ReceivedAction } from '../flow-types'

export default (action: AnyAction): boolean =>
  !!(action.meta && action.meta.location && action.meta.location.current);
