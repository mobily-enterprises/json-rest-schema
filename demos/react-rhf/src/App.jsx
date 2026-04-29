import { useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { jsonRestSchemaResolver } from 'json-rest-schema/react-hook-form'
import {
  createInitialWorkspaceValues,
  workspaceFormSchema
} from '../../shared/workspace-demo-schema.js'

function FieldError ({ message, testId }) {
  return (
    <p className="field-error" data-testid={testId}>
      {message ?? ''}
    </p>
  )
}

export default function App () {
  const [submittedPayload, setSubmittedPayload] = useState(null)
  const defaultValues = createInitialWorkspaceValues()

  const {
    control,
    formState,
    handleSubmit,
    register
  } = useForm({
    defaultValues,
    mode: 'onBlur',
    resolver: jsonRestSchemaResolver(workspaceFormSchema, { operation: 'create' })
  })

  const { fields, append } = useFieldArray({
    control,
    name: 'roles'
  })

  const onSubmit = rawValues => {
    const result = workspaceFormSchema.create(rawValues)

    if (Object.keys(result.errors).length === 0) {
      setSubmittedPayload(result.validatedObject)
    }
  }

  return (
    <main className="page-shell">
      <section className="demo-card">
        <header className="demo-header">
          <p className="eyebrow">json-rest-schema</p>
          <h1>React Hook Form Demo</h1>
          <p className="lead">
            This app uses the local resolver export directly from the current checkout.
          </p>
        </header>

        <form className="demo-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <label className="field-block">
            <span>Workspace slug</span>
            <input
              {...register('workspace.slug')}
              data-testid="react-workspace-slug"
              placeholder="team-alpha"
              type="text"
            />
          </label>
          <FieldError
            message={formState.errors.workspace?.slug?.message}
            testId="react-error-workspace-slug"
          />

          <label className="field-block">
            <span>Owner user ID</span>
            <input
              {...register('workspace.ownerUserId')}
              data-testid="react-owner-user-id"
              inputMode="numeric"
              placeholder="42"
              type="text"
            />
          </label>
          <FieldError
            message={formState.errors.workspace?.ownerUserId?.message}
            testId="react-error-owner-user-id"
          />

          {fields.map((field, index) => (
            <div className="field-group" key={field.id}>
              <label className="field-block">
                <span>Role {index + 1} label</span>
                <input
                  {...register(`roles.${index}.label`)}
                  data-testid={`react-role-label-${index}`}
                  placeholder="Admin"
                  type="text"
                />
              </label>
              <FieldError
                message={formState.errors.roles?.[index]?.label?.message}
                testId={`react-error-role-label-${index}`}
              />
            </div>
          ))}

          <button
            className="secondary-button"
            onClick={() => append({ label: '' })}
            type="button"
          >
            Add role
          </button>

          <label className="checkbox-row">
            <input
              {...register('settings.invitesEnabled')}
              data-testid="react-invites-enabled"
              type="checkbox"
            />
            <span>Invites enabled</span>
          </label>

          <button className="primary-button" data-testid="react-submit" type="submit">
            Submit
          </button>
        </form>

        <section className="result-panel">
          <h2>Canonical submit payload</h2>
          <pre data-testid="react-result">
            {JSON.stringify(submittedPayload, null, 2) ?? 'null'}
          </pre>
        </section>
      </section>
    </main>
  )
}
