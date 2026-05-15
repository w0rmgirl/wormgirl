import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { muxInput } from 'sanity-plugin-mux-input'

import { schemaTypes } from './src/schemas'

export default defineConfig({
  name: 'default',
  title: 'Worm Girl Educational App',

  projectId: '8dob17cg',
  dataset: 'production',
  token: process.env.SANITY_API_WRITE_TOKEN,

  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('Content Management')
          .items([
            // Educational Modules
            S.listItem()
              .title('📚 Educational Modules')
              .child(
                S.documentTypeList('module')
                  .title('Educational Modules')
                  .defaultOrdering([{ field: 'order', direction: 'asc' }])
              ),
            
            S.divider(),
            
            // Content Pages
            S.listItem()
              .title('About Page')
              .child(S.documentTypeList('aboutPage').title('About Page')),
            S.listItem()
              .title('Library Page')
              .child(S.documentTypeList('libraryPage').title('Library Page')),

            S.divider(),

            // Other document types
            ...S.documentTypeListItems().filter(
              (item) => !['module', 'aboutPage', 'libraryPage', 'mux.videoAsset'].includes(item.getId()!)
            ),
          ]),
    }),
    visionTool(),
    muxInput({
      mp4_support: 'standard',
      max_resolution_tier: '2160p',
      ...(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET && {
        enableSignedUrls: false,
        mp4_support: 'standard',
        max_resolution_tier: '2160p',
      })
    }),
  ],

  schema: {
    types: schemaTypes,
  },
}) 