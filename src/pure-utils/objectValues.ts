// @flow
import { Routes, RoutesMap } from '../flow-types'

export default (routes: RoutesMap): Routes =>
  Object.keys(routes).map((key) => routes[key]);
