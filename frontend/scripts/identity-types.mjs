import {
  readFileSync,
  writeFileSync,
} from 'node:fs';
import process from 'node:process';
import openapiTS, { astToString } from 'openapi-typescript';
import ts from 'typescript';

const identitySchemas = [
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
];

const editorOperations = [
  'listMyTripDrafts',
  'createTripDraft',
  'updateTripDraft',
  'publishTrip',
  'getPublicationOperation',
  'unpublishTrip',
  'listPublicTrips',
  'getCatalogFilterOptions',
  'getCatalogParticipation',
  'requestTripParticipation',
  'getPublicTrip',
  'getTripDraft',
  'ensureTripDayRoute',
  'getRouteDraft',
  'replaceRouteDraft',
  'previewRouteTrack',
  'splitTrack',
  'restoreRouteDraft',
  'listPoiCategories',
  'listPois',
  'getPoi',
  'createPoi',
];

const contract = new URL('../../docs/contracts/openapi.yaml', import.meta.url);
const destination = new URL('../src/shared/api/openapi.ts', import.meta.url);
const ast = await openapiTS(contract);
const components = findInterface('components');
const operations = findInterface('operations');
const selected = new Map();
const editor = editorOperations.map(name => member(operations.members, name));

function findInterface(name) {
  const declaration = ast.find(node => ts.isInterfaceDeclaration(node) && node.name.text === name);
  if (!declaration) {
    throw new Error(`OpenAPI must declare ${name}`);
  }
  return declaration;
}

function member(nodes, name) {
  const found = nodes.find(node => ts.isPropertySignature(node)
    && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === name);
  if (!found) {
    throw new Error(`OpenAPI must declare ${name}`);
  }
  return found;
}

function include(groupName, name) {
  const group = member(components.members, groupName);
  if (!group.type || !ts.isTypeLiteralNode(group.type)) {
    throw new Error(`Invalid OpenAPI component ${groupName}`);
  }
  const entry = member(group.type.members, name);
  const entries = selected.get(group) ?? new Set();
  if (entries.has(entry)) {
    return;
  }
  entries.add(entry);
  selected.set(group, entries);
  visit(entry);
}

function visit(node) {
  if (ts.isIndexedAccessTypeNode(node) && ts.isIndexedAccessTypeNode(node.objectType)) {
    const group = node.objectType;
    const root = group.objectType;
    if (ts.isTypeReferenceNode(root) && ts.isIdentifier(root.typeName) && root.typeName.text === 'components'
      && ts.isLiteralTypeNode(group.indexType) && ts.isStringLiteral(group.indexType.literal)
      && ts.isLiteralTypeNode(node.indexType) && ts.isStringLiteral(node.indexType.literal)) {
      include(group.indexType.literal.text, node.indexType.literal.text);
    }
  }
  ts.forEachChild(node, visit);
}

for (const name of identitySchemas) {
  include('schemas', name);
}
editor.forEach(visit);

const selectedGroups = components.members.flatMap((group) => {
  const entries = selected.get(group);
  if (!entries) {
    return [];
  }
  return [ts.factory.updatePropertySignature(group, group.modifiers, group.name, group.questionToken,
    ts.factory.updateTypeLiteralNode(group.type, group.type.members.filter(entry => entries.has(entry))))];
});

const simplify = (source, members) => ts.factory.updateInterfaceDeclaration(
  source, source.modifiers, source.name, source.typeParameters, source.heritageClauses, members,
);
const expected = astToString([simplify(components, selectedGroups), simplify(operations, editor)], {
  formatOptions: { removeComments: true },
});

if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8') !== expected) {
    throw new Error('OpenAPI client types are stale. Run pnpm --filter @tropio/frontend api:types.');
  }
}
else {
  writeFileSync(destination, expected);
}
