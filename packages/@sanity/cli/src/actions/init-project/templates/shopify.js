export const dependencies = {
  '@sanity/color-input': '^2.30.1',
  '@sanity/uuid': '^3.0.1',
  'lodash.get': '^4.4.2',
  pluralize: '^8.0.0',
  'sanity-plugin-hotspot-array': '^0.0.8',
  'sanity-plugin-media': '^1.4.10',
  slug: '^5.3.0',
}

export const generateSanityManifest = (base) => ({
  ...base,
  plugins: [...base.plugins, 'media', '@sanity/color-input'],
  parts: [
    {
      name: 'part:@sanity/base/schema',
      path: './schemas/schema',
    },
    {
      name: 'part:@sanity/desk-tool/structure',
      path: './deskStructure.js',
    },
    {
      implements: 'part:@sanity/form-builder/input/image/asset-sources',
      path: './parts/assetSources.js',
    },
    {
      implements: 'part:@sanity/form-builder/input/file/asset-sources',
      path: './parts/assetSources.js',
    },
    {
      name: 'part:@sanity/base/new-document-structure',
      path: './parts/newDocumentStructure.js',
    },
    {
      implements: 'part:@sanity/base/document-actions/resolver',
      path: './parts/resolveDocumentActions.js',
    },
  ],
})
