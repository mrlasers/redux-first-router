import { createAction } from './utils'
import { actionToUrl } from '../utils'
import { createPrevEmpty } from '../core/createReducer'
import { createStateRef, createActionRef } from '../middleware/transformAction/utils'


export default class History {
  constructor(routes, opts, config) {
    const { n, index, entries } = config

    this.saveHistory = opts.saveHistory || function() {}
    this.routes = routes
    this.options = opts

    const kind = 'load'
    const action = entries[index]
    const location = { kind, n, index, entries }
    const commit = function() {}

    this.firstAction = this._notify(action, location, { commit }, false)
  }

  listen(dispatch, getLocation) {
    this._listener = dispatch
    this.getLocation = getLocation
    return () => this.unlisten()
  }

  unlisten() {
    this._listener = null
  }

  get location() {
    return this.getLocation() // assigned by
  }

  get action() {
    return createActionRef(this.location)
  }

  get kind() {
    return this.location.kind
  }

  get n() {
    return this.location.direction === 'forward' ? 1 : -1
  }

  get type() {
    return this.location.type
  }

  get url() {
    return this.location.url
  }

  get prevUrl() {
    if (this.kind === 'load') return this.location.from.location.url // called by `BrowserHistory._replace` on redirects when `prev` state is empty
    return this.location.prev.url
  }

  get basename() {
    return this.location.basename
  }

  get entries() {
    return this.location.entries
  }

  get index() {
    return this.location.index
  }

  get length() {
    return this.location.length
  }

  createAction(path, state, basename = this.basename) {
    const { routes, options, location } = this
    return createAction(path, routes, options, state, basename, location)
  }

  // API:

  push(path, state = {}, notify = true) {
    const action = this.createAction(path, state)
    const back = this._isBack(action) // automatically determine if the user is just going back or next to a URL already visited
    const next = this._isNext(action)
    const kind = back ? 'back' : (next ? 'next' : 'push')

    if (/back|next/.test(kind)) {
      return this.jump(back ? -1 : 1, state, undefined, undefined, notify)
    }

    const index = back ? this.index - 1 : this.index + 1
    const entries = this._pushToFront(action, this.entries, index, kind)
    const commit = (action) => this._push(action)

    return this._notify(action, { kind, index, entries }, { commit }, notify)
  }

  replace(path, state = {}, notify = true) {
    const action = this.createAction(path, state)
    const back = this._isBack(action) // automatically determine if the user is just going back or next to a URL already visited
    const next = this._isNext(action)
    const kind = back ? 'back' : (next ? 'next' : 'replace')

    if (/back|next/.test(kind)) {
      return this.jump(back ? -1 : 1, state, undefined, undefined, notify)
    }

    const index = this.index
    const entries = this.entries.slice(0)
    const commit = (action) => this._replace(action)

    entries[index] = action

    return this._notify(action, { kind, entries, index }, { commit }, notify)
  }

  replacePop(path, state = {}, notify = true, pop) {
    const action = this.createAction(path, state)
    const { index } = pop
    const entries = pop.entries.slice(0)
    const kind = index < this.index ? 'back' : 'next'
    const commit = (action) => this._replace(action, pop.action, pop.n)

    entries[index] = action

    return this._notify(action, { kind, entries, index }, { commit }, notify)
  }

  jump(n, state, byIndex = false, manualKind, notify = true, revertPop) {
    n = this._resolveN(n, byIndex)
    manualKind = manualKind || (n < 0 ? 'back' : 'next')

    const kind = n === -1 ? 'back' : (n === 1 ? 'next' : 'jump')
    const isPop = !!revertPop
    const index = this.index + n
    const entries = this.entries.slice(0)
    const action = entries[index] = { ...this.entries[index] }
    const n2 = manualKind === 'back' ? -1 : 1
    const location = { kind, index, entries, n: n2 }
    const prev = kind === 'jump' && (this._createPrev(location) || createPrevEmpty())
    const commit = (action) => this._jump(action, n, isPop)
    const extras = { commit, manualKind, revertPop, prev }

    state = typeof state === 'function' ? state(action.state) : state

    action.state = { ...action.state, ...state }

    if (!this.entries[index]) {
      throw new Error(`[rudy] no entry at index: ${index}. Consider using \`history.canJump(n)\`.`)
    }

    return this._notify(action, location, extras, notify)
  }

  setState(state, n, byIndex = false, notify = true) {
    n = this._resolveN(n, byIndex)

    const kind = 'setState'
    const index = this.index
    const i = this.index + n
    const entries = this.entries.slice(0)
    const changedAction = entries[i] = { ...this.entries[i] }
    const action = n === 0 ? changedAction : { ...this.action } // insure if state set on current entry, location is not stale
    const commit = (action) => this._setState(action, n)

    state = typeof state === 'function' ? state(changedAction.state) : state
    changedAction.state = { ...changedAction.state, ...state }

    if (!this.entries[i]) {
      throw new Error(`[rudy] no entry at index: ${i}. Consider using \`history.canJump(n)\`.`)
    }

    return this._notify(action, { kind, index, entries }, { commit }, notify)
  }

  back(state, notify = true) {
    return this.jump(-1, state, false, 'back', notify)
  }

  next(state, notify = true) {
    return this.jump(1, state, false, 'next', notify)
  }

  reset(entries, index, manualKind, notify = true) {
    if (entries.length === 1) {
      const entry = this._findResetFirstAction(entries[0])
      entries.unshift(entry)
    }

    entries = entries.map(entry => {
      if (typeof entry === 'object' && entry.type) {
        const action = entry
        const { url, state } = actionToUrl(action, this.routes, this.options)
        return this.createAction(url, state, action.basename)
      }
      else if (Array.isArray(entry)) {
        const [url, state] = entry
        return this.createAction(url, state)
      }

      return this.createAction(entry)
    })


    index = index !== undefined ? index : entries.length - 1
    let n = manualKind === 'next' ? 1 : -1

    if (!manualKind) {
      if (entries.length > 1) {
        if (index === entries.length - 1) {
          manualKind = 'next'   // assume the user would be going forward in the new entries stack, i.e. if at head
          n = 1
        }
        else if (index === this.index) {
          manualKind = 'replace'
          n = this.n
        }
        else {
          manualKind = index < this.index ? 'back' : 'next'  // assume the user is going 'back' if lower than current index, and 'next' otherwise
          n = index < this.index ? -1 : 1
        }
      }
      else {
        manualKind = 'load'                                  // if one entry, set kind to 'load' so app can behave as if it's loaded for the first time
        n = 1
      }
    }

    if (!entries[index]) {
      throw new Error(`[rudy] no location entry at index: ${index}.`)
    }

    const kind = 'reset'
    const action = { ...entries[index] }
    const location = { kind, index, entries, n }
    const commit = (action) => this._reset(action)

    const prev = this._createPrev(location) || createPrevEmpty()
    const from = manualKind === 'replace' && { ...this.action }

    return this._notify(action, location, { commit, manualKind, prev, from }, notify)
  }

  _createPrev({ n, index: i, entries }) {
    const index = i - n
    const entry = entries[index]
    const { length } = entries

    if (!entry) return

    const { location, ...action } = entry
    action.location = { ...location, kind: 'push', index, length, entries, n }
    return createStateRef(action, true) // build the action for that entry, and create what the resulting state shape would have looked like
  }

  _findResetFirstAction(action) {
    const { routes, options } = this

    if (options.resetFirstEntry) {
      return typeof options.resetFirstEntry === 'function'
        ? options.resetFirstEntry(action)
        : options.resetFirstEntry
    }

    if (typeof action === 'object' && action.type) {
      if (routes[action.type].path !== '/') {
        const homeType = Object.keys(routes).find(type => routes[type].path === '/')
        return homeType ? { type: homeType } : { type: 'NOT_FOUND' }
      }

      return { type: 'NOT_FOUND' }
    }

    const path = Array.isArray(action) ? action[0] : action
    const notFoundPath = routes.NOT_FOUND.path

    if (path !== '/') {
      const homeRoute = Object.keys(routes).find(type => routes[type].path === '/')
      return homeRoute ? '/' : notFoundPath
    }

    return notFoundPath
  }

  canJump(n, byIndex) {
    n = this._resolveN(n, byIndex)
    return !!this.entries[this.index + n]
  }

  // UTILS:

  _notify(action, location, extras, notify = true) {
    const { index, entries, n: n1 } = location
    const n = n1 || (index > this.index ? 1 : (index === this.index ? this.n : -1))
    const { length } = entries

    action = {
      ...action,
      ...extras,
      commit: this._once(extras.commit),
      location: { ...action.location, ...location, length, n }
    }

    if (notify && this._listener) return this._listener(action)
    return action
  }

  _once(commit) {
    let committed = false

    return (action) => {
      if (committed) return Promise.resolve()
      committed = true

      return Promise.resolve(commit(action))
        .then(() => {
          const { index, entries } = this // will retreive these from redux state, which ALWAYS updates first
          this.saveHistory({ index, entries })
        })
    }
  }

  _isBack(action) {
    const e = this.entries[this.index - 1]
    return e && e.location.url === action.location.url
  }

  _isNext(action) {
    const e = this.entries[this.index + 1]
    return e && e.location.url === action.location.url
  }

  _pushToFront(action, prevEntries, index) {
    const entries = prevEntries.slice(0)
    const isBehindHead = entries.length > index

    if (isBehindHead) {
      const entriesToDelete = entries.length - index
      entries.splice(index, entriesToDelete, action)
    }
    else {
      entries.push(action)
    }

    return entries
  }

  _resolveN(n, byIndex) {
    if (typeof n === 'string') {
      const index = this.entries.findIndex(e => e.location.key === n)
      return index - this.index
    }

    if (byIndex) {
      return n - this.index
    }

    return n || 0
  }

  // BrowseHistory overrides these
  _push() {}
  _replace() {}
  _jump() {}
  _setState() {}
  _reset() {}
}