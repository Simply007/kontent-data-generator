#!/usr/bin/env node

const glob = require("glob");
const fs = require("fs");
const axios = require("axios");
const { ManagementClient } = require("@kentico/kontent-management");
const { DeliveryClient } = require("@kentico/kontent-delivery");

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

const findMissingArticles = async () => {
  const dClient = new DeliveryClient({ projectId: argv.projectId })

  if (argv.verbose) {
    console.info(`Starting verifying.`);
  }

  const allItems = await dClient
    .itemsFeedAll()
    .languageParameter(argv.language)
    .type(argv.type)
    .toPromise()
    .then(result => result.items);

  if (allItems.length === 0) {
    console.log(`Specified project does not contains and item of type ${argv.type}`);
    return 1;
  };

  const folderSplit = argv.folder.split("/");
  const articleCount = Number(folderSplit[folderSplit.length - 1]);

  const missingArticles = [];
  for (let articleNumberToCheck = 1; articleNumberToCheck <= articleCount; articleNumberToCheck++) {
    const currentArticle = allItems
      .find(item => item.article_number.value === articleNumberToCheck);

    if (!currentArticle) {
      console.log(`Article not found: ${articleNumberToCheck}`)
      missingArticles.push(articleNumberToCheck);
      continue;
    }

    if (currentArticle.image.value.length !== 1) {
      console.log(`Article missing image: ${articleNumberToCheck}`)
      continue;
    }

    console.log(`Article OK: ${articleNumberToCheck}`);
  }

  return missingArticles;
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
    description: 'managementKey to environment var [KONTENT_MANAGEMENT_KEY] by default',
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
  .option('justMissing', {
    alias: 'j',
    type: 'boolean',
    description: 'Verify if the content item is in good shape - logs problems to the log and them import just faulty items.',
  })
  .help()
  .argv;



const mClient = new ManagementClient({
  projectId: argv.projectId, // id of your Kentico Kontent project
  apiKey: argv.managementKey, // Content management API token
});

glob(`${argv.folder}/*.json`, async (err, files) => { // read the folder or folders if you want: example json/**/*.json

  let missingArticles = [];
  if (argv.justMissing) {
    missingArticles = await findMissingArticles();
  }

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

        if (argv.justMissing) {
          if (missingArticles.indexOf(article.articleNumber) < 0) {
            if (argv.verbose) {
              console.info(`Skipping item: (${article.articleNumber}) ${article.title}`)
            }
            continue;
          }
        }


        if (argv.verbose) {
          console.info(`Importing item: (${article.articleNumber}) ${article.title}`)
        }

        try {

          const assetData = await getAssetDataDataFromUrl(article.image.url);
          const assetObject = await mClient.uploadBinaryFile().withData(assetData).toPromise();

          const asset = await mClient.addAsset()
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


          const item = await mClient.addContentItem()
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

          const languageVariant = await mClient.upsertLanguageVariant()
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

          await mClient
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

