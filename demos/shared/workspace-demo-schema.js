import { createSchema } from 'json-rest-schema'

const roleSchema = createSchema({
  label: { type: 'string', required: true, minLength: 2 }
})

const workspaceSummarySchema = createSchema({
  slug: { type: 'string', required: true, minLength: 3 },
  ownerUserId: { type: 'integer', required: true }
})

const workspaceSettingsSchema = createSchema({
  invitesEnabled: { type: 'boolean', required: true }
})

export const workspaceFormSchema = createSchema({
  workspace: {
    type: 'object',
    required: true,
    schema: workspaceSummarySchema
  },
  settings: {
    type: 'object',
    required: true,
    schema: workspaceSettingsSchema
  },
  roles: {
    type: 'array',
    required: true,
    items: roleSchema
  }
})

export function createInitialWorkspaceValues () {
  return {
    workspace: {
      slug: '',
      ownerUserId: ''
    },
    settings: {
      invitesEnabled: false
    },
    roles: [
      { label: '' }
    ]
  }
}
