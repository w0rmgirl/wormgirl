import { createClient } from '@sanity/client'
import imageUrlBuilder from '@sanity/image-url'
import { SanityImageSource } from '@sanity/image-url/lib/types/types'

// Sanity client configuration
export const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2023-12-01',
  useCdn: process.env.NODE_ENV === 'production',
  // Use write token for studio operations, read token for frontend
  token: process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_READ_TOKEN,
})

// Image URL builder
const builder = imageUrlBuilder(client)

export function urlFor(source: SanityImageSource) {
  return builder.image(source)
}

// Type definitions for Sanity documents
export interface SanityModule {
  _id: string
  _type: 'module'
  title: string
  slug: { current: string }
  order: number
  timeline?: string
  video: {
    asset: {
      playbackId: string
      assetId: string
    }
  }
  idleVideo?: {
    asset: {
      playbackId: string
      assetId: string
    }
  }
  articleHeading?: string
  body: any[] // Portable Text blocks
  glossary?: Array<{
    id: string
    term: string
    definition: any[]
  }>
  footnotes?: Array<{
    id: string
    content: any[]
  }>
  excerpt?: string
  tabImage?: {
    asset: {
      url: string
    },
    crop?: any,
    hotspot?: any
  }
}

export interface SanityAboutPage {
  _id: string
  _type: 'aboutPage'
  title: string
  slug: { current: string }
  content: any[] // Portable Text blocks
}

export interface SanityLibraryPage {
  _id: string
  _type: 'libraryPage'
  title: string
  slug: { current: string }
  description?: any[] // Portable Text blocks
  sound?: Array<{
    title: string
    url: string
    description?: string
  }>
  books?: Array<{
    title: string
    url: string
    description?: string
  }>
}

export type SanityPage = SanityAboutPage | SanityLibraryPage

// GROQ Queries
export const MODULES_QUERY = `
  *[_type == "module"] | order(order asc) {
    _id,
    title,
    slug,
    order,
    timeline,
    tabImage {
      asset-> {
        url
      },
      crop,
      hotspot
    },
    video {
      asset-> {
        playbackId,
        assetId
      }
    },
    idleVideo {
      asset-> {
        playbackId,
        assetId
      }
    },
    articleHeading,
    body,
    glossary[] {
      id,
      term,
      definition
    },
    footnotes[] {
      id,
      content
    },
    excerpt
  }
`

export const MODULE_BY_SLUG_QUERY = `
  *[_type == "module" && slug.current == $slug][0] {
    _id,
    title,
    slug,
    order,
    timeline,
    tabImage {
      asset-> {
        url
      },
      crop,
      hotspot
    },
    video {
      asset-> {
        playbackId,
        assetId
      }
    },
    idleVideo {
      asset-> {
        playbackId,
        assetId
      }
    },
    articleHeading,
    body,
    glossary[] {
      id,
      term,
      definition
    },
    footnotes[] {
      id,
      content
    },
    excerpt
  }
`

export const CONTENT_PAGES_QUERY = `
  *[_type in ["aboutPage", "libraryPage"]] {
    _id,
    _type,
    title,
    slug,
    _type == "aboutPage" => {
      content
    },
    _type == "libraryPage" => {
      description,
      sound[] {
        title,
        url,
        description
      },
      books[] {
        title,
        url,
        description
      }
    }
  }
`

export const CONTENT_PAGE_BY_SLUG_QUERY = `
  *[_type in ["aboutPage", "libraryPage"] && slug.current == $slug][0] {
    _id,
    _type,
    title,
    slug,
    _type == "aboutPage" => {
      content
    },
    _type == "libraryPage" => {
      description,
      sound[] {
        title,
        url,
        description
      },
      books[] {
        title,
        url,
        description
      }
    }
  }
`

// Helper functions for fetching data
export async function getModules(): Promise<SanityModule[]> {
  return client.fetch(`
    *[_type == "module"] | order(order asc) {
      _id,
      title,
      slug,
      order,
      timeline,
      video,
      idleVideo,
      body,
      glossary,
      footnotes,
      excerpt,
      tabImage {
        asset {
          url
        },
        crop,
        hotspot
      }
    }
  `)
}

export async function getModuleBySlug(slug: string): Promise<SanityModule | null> {
  return await client.fetch(MODULE_BY_SLUG_QUERY, { slug })
}

export async function getContentPages(): Promise<SanityPage[]> {
  return await client.fetch(CONTENT_PAGES_QUERY)
}

export async function getContentPageBySlug(slug: string): Promise<SanityPage | null> {
  return await client.fetch(CONTENT_PAGE_BY_SLUG_QUERY, { slug })
} 