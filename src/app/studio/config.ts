import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { presentationTool } from 'sanity/presentation'
import { muxInput } from 'sanity-plugin-mux-input'

import { schemaTypes } from '../../schemas'

export default defineConfig({
  name: 'wormgirl-studio',
  title: 'Worm Girl Educational App - Studio',
  
  projectId: '8dob17cg',
  dataset: 'production',
  
  // Studio URL (customize as needed)
  basePath: '/studio',
  
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
                  .canHandleIntent((intent, params) => {
                    return intent === 'create' && params.type === 'module'
                  })
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
    presentationTool({
      locate: (params, context) => {
        // Generate preview URLs for different document types
        if (params.type === 'module') {
          return {
            locations: [
              {
                title: 'Module Preview',
                href: `/?module=${params.id}&preview=true`,
                icon: () => '🎓',
              },
            ],
          }
        }
        
        if (params.type === 'aboutPage' || params.type === 'libraryPage') {
          return {
            locations: [
              {
                title: 'Page Preview',
                href: `/?page=${params.id}&preview=true`,
                icon: () => '📄',
              },
            ],
          }
        }
        
        return null
      },
      previewUrl: {
        origin: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
        previewMode: {
          enable: '/api/preview',
        },
      },
    }),
    visionTool(),
    muxInput({
      mp4_support: 'standard',
      max_resolution_tier: '2160p',
    }),
  ],
  
  schema: {
    types: schemaTypes,
  },
  
  // Document actions
  document: {
    actions: (prev, context) => {
      // Customize document actions here if needed
      return prev
    },
  },
  
  // Tools configuration
  tools: (prev, context) => {
    // Only show certain tools based on user role if needed
    return prev
  },
}) 