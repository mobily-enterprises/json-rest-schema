/**
 * @file Shared dotted-path helpers for schema errors and UI adapters.
 */

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])

export function isObjectLike (value) {
  return value !== null && typeof value === 'object'
}

export function isNumericSegment (segment) {
  return /^[0-9]+$/.test(segment)
}

export function setOwnProperty (target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  })
}

function assertSafePathSegment (segment, helperName) {
  if (UNSAFE_PATH_SEGMENTS.has(segment)) {
    throw new Error(`${helperName}() received unsafe path segment "${segment}".`)
  }
}

export function normalizeFieldPath (path) {
  if (typeof path !== 'string') return path

  return path
    .replace(/\[(.+?)\]/g, '.$1')
    .replace(/^\.+/, '')
    .replace(/\.+/g, '.')
    .replace(/\.$/, '')
}

export function buildPathSegments (path, helperName, { normalize = false, allowEmpty = false } = {}) {
  const normalizedPath = normalize ? normalizeFieldPath(path) : path

  if (typeof normalizedPath !== 'string' || normalizedPath.trim() === '') {
    if (allowEmpty && normalizedPath === '') return []
    throw new Error(`${helperName}() expects a non-empty dotted path string.`)
  }

  const segments = normalizedPath.split('.')
  if (segments.some(segment => segment === '')) {
    throw new Error(`${helperName}() received an invalid path "${normalizedPath}".`)
  }

  for (const segment of segments) {
    assertSafePathSegment(segment, helperName)
  }

  return segments
}

export function joinPath (basePath, pathSegment) {
  return basePath === '' ? String(pathSegment) : `${basePath}.${String(pathSegment)}`
}

export function uniqueNormalizedPaths (paths = []) {
  return [...new Set(
    paths
      .map(path => normalizeFieldPath(path))
      .filter(path => typeof path === 'string' && path !== '')
      .map(path => buildPathSegments(path, 'normalizeFieldPath').join('.'))
  )]
}

export function pathToSegments (path) {
  return buildPathSegments(path, 'pathToSegments', { normalize: true, allowEmpty: true })
    .map(segment => (isNumericSegment(segment) ? Number(segment) : segment))
}

function createContainer (nextSegment) {
  return isNumericSegment(nextSegment) ? [] : {}
}

export function getNestedValue (target, path) {
  const segments = buildPathSegments(path, 'getNestedValue', { normalize: true, allowEmpty: true })

  if (segments.length === 0) return target

  let currentNode = target

  for (const segment of segments) {
    if (currentNode === null || currentNode === undefined) return undefined
    if (!isObjectLike(currentNode)) return undefined
    if (!Object.hasOwn(currentNode, segment)) return undefined
    currentNode = currentNode[segment]
  }

  return currentNode
}

export function setNestedValue (target, path, value) {
  const segments = buildPathSegments(path, 'setNestedValue', { normalize: true })
  let currentNode = target

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    const isLast = index === segments.length - 1

    if (isLast) {
      setOwnProperty(currentNode, segment, value)
      return
    }

    if (!Object.hasOwn(currentNode, segment) || currentNode[segment] === null || !isObjectLike(currentNode[segment])) {
      setOwnProperty(currentNode, segment, createContainer(segments[index + 1]))
    }

    currentNode = currentNode[segment]
  }
}
