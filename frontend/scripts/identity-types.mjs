import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import openapiTS, { astToString } from 'openapi-typescript'
import ts from 'typescript'

const identitySchemas = new Set([
  'IdentityProfile',
  'PublicIdentityProfile',
  'SystemAvatar',
  'SystemAvatarList',
  'RegisterIdentityRequest',
  'LoginIdentityRequest',
  'IdentityEmailRequest',
  'IdentityTokenRequest',
  'ResetIdentityPasswordRequest',
  'UpdateIdentityProfileRequest',
  'SelectIdentityAvatarRequest',
  'Problem',
  'Uuid',
])

const contract = new URL('../../docs/contracts/openapi.yaml', import.meta.url)
const destination = new URL('../src/shared/api/openapi.ts', import.meta.url)
const ast = await openapiTS(contract)
const components = ast.find(node => ts.isInterfaceDeclaration(node) && node.name.text === 'components')
const allSchemas = components?.members.find(node =>
  ts.isPropertySignature(node) && ts.isIdentifier(node.name) && node.name.text === 'schemas')

if (!components || !allSchemas?.type || !ts.isTypeLiteralNode(allSchemas.type)) {
  throw new Error('OpenAPI must declare component schemas')
}

const selected = allSchemas.type.members.filter(node =>
  ts.isPropertySignature(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
  && identitySchemas.has(node.name.text))

if (selected.length !== identitySchemas.size) {
  throw new Error('An Identity schema is absent from OpenAPI')
}

const schemas = ts.factory.updatePropertySignature(
  allSchemas,
  allSchemas.modifiers,
  allSchemas.name,
  allSchemas.questionToken,
  ts.factory.updateTypeLiteralNode(allSchemas.type, selected),
)
const identity = ts.factory.updateInterfaceDeclaration(
  components,
  components.modifiers,
  components.name,
  components.typeParameters,
  components.heritageClauses,
  [schemas],
)
const expected = astToString(identity, { formatOptions: { removeComments: true } })

if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8') !== expected) {
    throw new Error('OpenAPI identity types are stale. Run pnpm --filter @tropio/frontend api:types.')
  }
} else {
  writeFileSync(destination, expected)
}
