/**
 * @file Shared helper utilities for UI adapter entry points.
 */

export function isPlainObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isRefLike (value) {
  return value !== null && typeof value === 'object' && Object.hasOwn(value, 'value')
}

export function cloneValue (value) {
  if (Array.isArray(value)) {
    return value.map(item => cloneValue(item))
  }

  if (isPlainObject(value)) {
    const clonedObject = {}

    for (const [key, nestedValue] of Object.entries(value)) {
      clonedObject[key] = cloneValue(nestedValue)
    }

    return clonedObject
  }

  return value
}

export function normalizeFieldPath (path) {
  if (typeof path !== 'string') return path

  return path
    .replace(/\[(.+?)\]/g, '.$1')
    .replace(/^\.+/, '')
    .replace(/\.+/g, '.')
    .replace(/\.$/, '')
}

export function uniqueNormalizedPaths (paths = []) {
  return [...new Set(
    paths
      .map(path => normalizeFieldPath(path))
      .filter(path => typeof path === 'string' && path !== '')
  )]
}

export function pathToSegments (path) {
  const normalizedPath = normalizeFieldPath(path)

  if (normalizedPath === '') return []

  return normalizedPath.split('.').map(segment => (/^[0-9]+$/.test(segment) ? Number(segment) : segment))
}

function createContainer (nextSegment) {
  return /^[0-9]+$/.test(nextSegment) ? [] : {}
}

export function getNestedValue (target, path) {
  const normalizedPath = normalizeFieldPath(path)

  if (normalizedPath === '') return target

  const segments = normalizedPath.split('.')
  let currentNode = target

  for (const segment of segments) {
    if (currentNode === null || currentNode === undefined) return undefined
    if (typeof currentNode !== 'object') return undefined
    if (!Object.hasOwn(currentNode, segment)) return undefined
    currentNode = currentNode[segment]
  }

  return currentNode
}

export function setNestedValue (target, path, value) {
  const normalizedPath = normalizeFieldPath(path)

  if (normalizedPath === '') {
    throw new Error('setNestedValue() expects a non-empty path.')
  }

  const segments = normalizedPath.split('.')
  let currentNode = target

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    const isLast = index === segments.length - 1

    if (isLast) {
      currentNode[segment] = value
      return
    }

    if (currentNode[segment] === undefined || currentNode[segment] === null || typeof currentNode[segment] !== 'object') {
      currentNode[segment] = createContainer(segments[index + 1])
    }

    currentNode = currentNode[segment]
  }
}

export function readSourceValue (source) {
  if (typeof source === 'function') {
    return source()
  }

  if (isRefLike(source)) {
    return source.value
  }

  return source
}

function syncArrayContainer (target, value) {
  target.length = 0

  if (!Array.isArray(value)) {
    throw new Error('State container array cannot be replaced with a non-array value.')
  }

  for (const item of value) {
    target.push(cloneValue(item))
  }
}

function syncObjectContainer (target, value) {
  if (!isPlainObject(value)) {
    throw new Error('State container object cannot be replaced with a non-object value.')
  }

  for (const key of Object.keys(target)) {
    delete target[key]
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    target[key] = cloneValue(nestedValue)
  }
}

export function replaceContainerValue (container, value) {
  if (isRefLike(container)) {
    container.value = cloneValue(value)
    return
  }

  if (Array.isArray(container)) {
    syncArrayContainer(container, value)
    return
  }

  if (isPlainObject(container)) {
    syncObjectContainer(container, value)
    return
  }

  throw new Error('State container must be a ref-like object, array, or plain object.')
}

export function createStateBox (initialValue) {
  return { value: cloneValue(initialValue) }
}
