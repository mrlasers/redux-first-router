// @flow
import type { Store } from "redux";
import type { RoutesMap, SelectLocationState, Bag } from "../flow-types";

export default (
  routesMap: RoutesMap,
  selectLocationState: SelectLocationState,
  bag: Bag
) => <T = any>({ dispatch, getState }: Store): Promise<T | void> => {
  // not sure if this typing is actuall right
  const { type } = selectLocationState(getState());
  const route = routesMap[type];

  if (route && typeof route.thunk === "function") {
    return Promise.resolve(route.thunk(dispatch, getState, bag));
  }

  return Promise.resolve();
};
