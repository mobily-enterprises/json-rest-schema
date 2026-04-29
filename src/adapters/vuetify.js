/**
 * @file Vuetify bridge helpers for json-rest-schema.
 */

import { getError } from '../utils/error-helpers.js'
import { cloneValue, normalizeFieldPath, setNestedValue } from '../utils/adapter-helpers.js'

function assertForm (form) {
  if (!form || typeof form.validateField !== 'function' || typeof form.getErrorMessages !== 'function') {
    throw new Error('Vuetify helpers expect a form object returned by useSchemaForm().')
  }
}

function assertPath (path) {
  if (typeof path !== 'string' || normalizeFieldPath(path) === '') {
    throw new Error('Vuetify helpers expect a non-empty field path.')
  }
}

function getFlatErrors (errorsOrForm) {
  if (errorsOrForm && typeof errorsOrForm.getErrorMessages === 'function') {
    return null
  }

  return errorsOrForm ?? {}
}

export function getVuetifyErrorMessages (errorsOrForm, path) {
  const normalizedPath = normalizeFieldPath(path)
  if (errorsOrForm && typeof errorsOrForm.getErrorMessages === 'function') {
    return errorsOrForm.getErrorMessages(normalizedPath)
  }
  const flatErrors = getFlatErrors(errorsOrForm)
  const error = getError(flatErrors, normalizedPath)
  return error ? [error.message] : []
}

export function createVuetifyRule (form, path, options = {}) {
  assertForm(form)
  assertPath(path)

  const normalizedPath = normalizeFieldPath(path)

  return value => {
    const nextValues = cloneValue(form.values ?? {})
    setNestedValue(nextValues, normalizedPath, value)

    const result = form.validateField(normalizedPath, {
      ...options,
      values: nextValues
    })
    const [message] = getVuetifyErrorMessages(result.errors, normalizedPath)

    return message ?? true
  }
}

export function fieldProps (form, path, options = {}) {
  assertForm(form)
  assertPath(path)

  const props = {
    rules: [createVuetifyRule(form, path, options.ruleOptions)]
  }

  if (options.includeErrorMessages === true) {
    Object.defineProperty(props, 'errorMessages', {
      enumerable: true,
      get: () => getVuetifyErrorMessages(form, path)
    })

    Object.defineProperty(props, 'error', {
      enumerable: true,
      get: () => form.hasError(path)
    })
  }

  return props
}
