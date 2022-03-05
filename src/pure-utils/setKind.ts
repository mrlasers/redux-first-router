// @flow
import type { Action } from "../flow-types";
import { AnyAction } from 'redux'

export default (action: AnyAction, kind: string) => {
  action.meta = action.meta || {};
  action.meta.location = action.meta.location || {};
  action.meta.location.kind = kind;

  return action;
};
