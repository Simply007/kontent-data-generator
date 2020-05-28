#!/usr/bin/env node

const glob = require("glob");
const fs = require("fs");
const axios = require("axios");
const { ManagementClient } = require("@kentico/kontent-management");

require('dotenv').config()

const getAssetDataDataFromUrl = async (url, enableLog) => {
  if (enableLog) {
    console.log(`Downloading asset: ${url}`);
  }

  const urlParts = url.split('/');

  const response = await axios.get(url, {
    responseType: 'arraybuffer',
  });

  if (enableLog) {
    console.log(`Downloading asset completed: ${url}`);
  }

  return {
    binaryData: response.data,
    contentLength: response.headers["content-length"],
    contentType: response.headers["content-type"],
    filename: urlParts[urlParts.length - 1]
  }
}


const argv = require('yargs') // eslint-disable-line
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose logging'
  })
  .option('projectId', {
    alias: 'p',
    type: 'string',
    description: 'projectid to import environment var [KONTENT_PROJECT_ID] by default',
    default: process.env.KONTENT_PROJECT_ID
  })
  .option('managementKey', {
    alias: 'm',
    type: 'string',
    description: 'managementKey to environment var [KONTENT_DATA_FOLDER] by default',
    default: process.env.KONTENT_MANAGEMENT_KEY
  })
  .option('folder', {
    alias: 'f',
    type: 'string',
    description: 'Folder from where the *.json file will be loaded. environment var [KONTENT_DATA_FOLDER] by default. T- Types has to be already prepared in Kontent',
    default: process.env.KONTENT_DATA_FOLDER
  })
  .option('language', {
    alias: 'l',
    type: 'string',
    description: 'Kontent language [KONTENT_LANGUAGE] by default',
    default: process.env.KONTENT_LANGUAGE
  })
  .option('type', {
    alias: 't',
    type: 'string',
    description: 'Kontent type to import to environment var [KONTENT_TYPE] by default',
    default: process.env.KONTENT_TYPE
  })
  .help()
  .argv;

const client = new ManagementClient({
  projectId: argv.projectId, // id of your Kentico Kontent project
  apiKey: argv.managementKey, // Content management API token
});


glob(`${argv.folder}/*.json`, async (err, files) => { // read the folder or folders if you want: example json/**/*.json
  if (argv.verbose) {
    console.info(`Starting generation at: ${new Date().toISOString()}`)
  }

  if (err) {
    console.log("cannot read the folder, something goes wrong with glob", err);
  }
  if (argv.verbose) {
    console.info(`Loading files: ${files}`)
  }
  for (const file of files) {
    fs.readFile(file, 'utf8', async (err, data) => { // Read each file
      if (err) {
        console.error("cannot read the file, something goes wrong with the file", err);
      }
      if (argv.verbose) {
        console.info(`Importing file:${file}`)
      }

      const items = JSON.parse(data);

      for (const article of items) {
        if (argv.verbose) {
          console.info(`Importing item: (${article.articleNumber}) ${article.title}`)
        }

        try {

          const assetData = await getAssetDataDataFromUrl(article.image.url);
          const assetObject = await client.uploadBinaryFile().withData(assetData).toPromise();

          const asset = await client.addAsset()
            .withData({
              descriptions: [{
                language: {
                  codename: argv.language
                },
                description: `Image for article ${article.title}`
              }],
              external_id: article.image.id,
              file_reference: {
                ...assetObject.data
              }
            })
            .toPromise();


          const item = await client.addContentItem()
            .withData(
              {
                external_id: undefined,
                name: article.title,
                type: {
                  codename: argv.type
                },
                sitemap_locations: undefined
              }
            )
            .toPromise();

          const languageVariant = await client.upsertLanguageVariant()
            .byItemCodename(item.data.codename)
            .byLanguageCodename(argv.language)
            .withElementCodenames([
              {
                codename: 'title',
                value: article.title
              },
              {
                codename: 'content',
                value: article.content
              },
              {
                codename: 'image',
                value: [{
                  id: asset.data.id
                }]
              },
              {
                codename: 'article_number',
                value: article.articleNumber
              }
            ])
            .toPromise();

            await client
              .publishOrScheduleLanguageVariant()
              .byItemId(languageVariant.data.item.id)
              .byLanguageId(languageVariant.data.language.id)
              .withoutData()
              .toPromise();


        } catch (error) {
          console.error(JSON.stringify(error, null, 2));
        }
      }
    });
  }
});




