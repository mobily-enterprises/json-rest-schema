<script setup>
import { computed, reactive, ref } from 'vue'
import { useSchemaField, useSchemaForm } from 'json-rest-schema/vue'
import {
  createVuetifyRule,
  getVuetifyErrorMessages
} from 'json-rest-schema/vuetify'
import {
  createInitialWorkspaceValues,
  workspaceFormSchema
} from '../../shared/workspace-demo-schema.js'

const values = reactive(createInitialWorkspaceValues())
const submittedPayload = ref(null)
const errorState = ref({})
const lastResult = ref(null)

const form = useSchemaForm(workspaceFormSchema, {
  errors: errorState,
  lastResult,
  values,
  operation: 'create'
})

const slugField = useSchemaField(form, 'workspace.slug')
const ownerField = useSchemaField(form, 'workspace.ownerUserId')
const roleField = useSchemaField(form, 'roles.0.label')

const slugRule = createVuetifyRule(form, 'workspace.slug')
const ownerRule = createVuetifyRule(form, 'workspace.ownerUserId')
const roleRule = createVuetifyRule(form, 'roles.0.label')

const flatErrors = computed(() => lastResult.value?.errors ?? {})
const slugMessage = computed(() => getVuetifyErrorMessages(flatErrors.value, 'workspace.slug')[0] ?? '')
const ownerMessage = computed(() => getVuetifyErrorMessages(flatErrors.value, 'workspace.ownerUserId')[0] ?? '')
const roleMessage = computed(() => getVuetifyErrorMessages(flatErrors.value, 'roles.0.label')[0] ?? '')

function handleSubmit () {
  const result = form.validate()
  submittedPayload.value = Object.keys(result.errors).length === 0
    ? result.validatedObject
    : null
}
</script>

<template>
  <v-app>
    <v-main class="app-shell">
      <v-container class="py-10">
        <v-card class="mx-auto demo-card" max-width="760">
          <v-card-item>
            <p class="eyebrow">json-rest-schema</p>
            <h1 class="text-h4 mb-2">Vue + Vuetify Demo</h1>
            <p class="text-medium-emphasis">
              This app uses the local Vue and Vuetify adapter exports from the current checkout.
            </p>
          </v-card-item>

          <v-card-text>
            <v-form validate-on="blur">
              <v-text-field
                v-model="values.workspace.slug"
                data-testid="vue-workspace-slug"
                label="Workspace slug"
                placeholder="team-alpha"
                :rules="[slugRule]"
                @blur="slugField.validate()"
              />
              <p class="helper-error" data-testid="vue-error-workspace-slug">{{ slugMessage }}</p>

              <v-text-field
                v-model="values.workspace.ownerUserId"
                data-testid="vue-owner-user-id"
                label="Owner user ID"
                placeholder="42"
                :rules="[ownerRule]"
                @blur="ownerField.validate()"
              />
              <p class="helper-error" data-testid="vue-error-owner-user-id">{{ ownerMessage }}</p>

              <v-text-field
                v-model="values.roles[0].label"
                data-testid="vue-role-label-0"
                label="First role label"
                placeholder="Admin"
                :rules="[roleRule]"
                @blur="roleField.validate()"
              />
              <p class="helper-error" data-testid="vue-error-role-label-0">{{ roleMessage }}</p>

              <div class="checkbox-panel" data-testid="vue-invites-panel">
                <v-checkbox
                  v-model="values.settings.invitesEnabled"
                  color="primary"
                  data-testid="vue-invites-enabled"
                  density="comfortable"
                  hide-details
                  label="Invites enabled"
                />
              </div>

              <v-btn
                @click="handleSubmit"
                class="mt-2"
                color="primary"
                data-testid="vue-submit"
                type="button"
              >
                Submit
              </v-btn>
            </v-form>

            <section class="result-panel mt-8">
              <h2 class="text-h6 mb-3">Normalized submit payload</h2>
              <pre data-testid="vue-result">{{ JSON.stringify(submittedPayload, null, 2) }}</pre>
            </section>
          </v-card-text>
        </v-card>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(255, 191, 122, 0.18), transparent 32%),
    linear-gradient(180deg, #f4f7fb 0%, #eef3f8 100%);
}

.demo-card {
  border: 1px solid rgba(23, 52, 89, 0.1);
  border-radius: 22px;
  box-shadow: 0 30px 70px rgba(23, 52, 89, 0.08);
}

.eyebrow {
  margin: 0 0 6px;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #1d5d8c;
}

.helper-error {
  min-height: 20px;
  margin: -10px 0 10px;
  color: #b3261e;
  font-size: 0.92rem;
}

.checkbox-panel {
  margin: 6px 0 18px;
  padding: 10px 14px;
  border: 1px solid rgba(29, 93, 140, 0.14);
  border-radius: 16px;
  background: rgba(29, 93, 140, 0.05);
}

.checkbox-panel :deep(.v-selection-control) {
  min-height: 40px;
}

.checkbox-panel :deep(.v-label) {
  color: #173459;
  opacity: 1;
  font-weight: 600;
}

.result-panel pre {
  overflow-x: auto;
  padding: 16px;
  border-radius: 14px;
  background: #122033;
  color: #f4f8ff;
}
</style>
