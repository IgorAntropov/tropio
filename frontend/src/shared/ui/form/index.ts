import { computed, shallowRef } from 'vue'

type Rule = () => string | undefined

export function hasInvalidText(value: string): boolean {
  return value.includes('\0') || /[\uD800-\uDFFF]/u.test(value)
}

export function useFormValidation<Field extends string>(rules: Record<Field, Rule>) {
  const fields = Object.keys(rules) as Field[]
  const touched = shallowRef(new Set<Field>())
  const issues = computed(() => Object.fromEntries(fields.map(field => [field, rules[field]()])) as Record<Field, string | undefined>)
  const valid = computed(() => fields.every(field => issues.value[field] === undefined))
  const errors = computed(() => Object.fromEntries(
    [...touched.value].map(field => [field, issues.value[field]]),
  ) as Partial<Record<Field, string>>)

  function touch(field: Field) {
    if (!touched.value.has(field)) touched.value = new Set([...touched.value, field])
  }

  function reset() {
    touched.value = new Set()
  }

  return { valid, errors, touch, reset }
}
