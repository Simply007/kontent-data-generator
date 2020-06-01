# Kontent data generator

Kentico Kontent data generator for: https://willit.build

Data in [/articles](/articles) are copied from <https://github.com/gatsbyjs/will-it-generate>.

Basically use data from [/articles](/articles) and import them to prepared project based on prepared content model in Kentico Kontent.

## Get started

1. Go to [app.kontent.ai](https://app.kontent.ai) and [create empty project](https://docs.kontent.ai/tutorials/set-up-kontent/projects/manage-projects#a-creating-projects)
1. Go to "Project Settings", select API keys and copy
   - Project ID
   - Management API key **require Business tier or higher or Trial account**
1. Install [Kontent Backup Manager](https://github.com/Kentico/kontent-backup-manager-js) and import data to newly created project from [`kontent-backup.zip`](./kontent-backup.zip) file (place appropriate values for `apiKey` and `projectId` arguments):
   - Alternatively no.1 use [Kontent Template manager](https://kentico.github.io/kontent-template-manager/import)
   - Alternatively no.2 create a content type with codename `article` with fiels
     - Title `title` text - required\*
     - Image `image` assets
     - Content `content` text
     - Article number `article_number` number
     - Slug `slug` URL slug - generated from title
1. Copy [.env.template](.env.template) and name it `.env` and set `KONTENT_PROJECT_ID`, `KONTENT_MANAGEMENT_KEY` from how many articles you want to generate and select folder by setting `KONTENT_DATA_FOLDER`. Leave `KONTENT_LANGUAGE` and `KONTENT_TYPE` as they are.
1. Run import (use `-v` is you want verbose output)

   ```sh
   npm start -- -v
   ```

This project then could be used in the `kontent-benchmark-site`.
 > If you want to send all output to the file (the logs could be quite long): `npm start 1> out.txt 2>&1 -- -v`
