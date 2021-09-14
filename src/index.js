#!/usr/bin/env node

const glob = require("glob");
const fs = require("fs");
const axios = require("axios");
const { ManagementClient } = require("@kentico/kontent-management");
const { DeliveryClient } = require("@kentico/kontent-delivery");

require('dotenv').config()

const getAssetDataDataFromUrl = async (url) => {
  logInfo(`Downloading asset: ${url}`);

  const urlParts = url.split('/');

  const response = await axios.get(url, {
    responseType: 'arraybuffer',
  });

  logInfo(`Downloading asset completed: ${url}`);

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
  .option('ignoreExternalId', {
    alias: 'i',
    type: 'boolean',
    description: 'Ignores external id of assets - useful for the rerun of the same source files.'
  })
  .help()
  .argv;

const logInfo = (msg) => {
  if (argv.verbose) {
    console.info(`${new Date().toISOString()} ${msg}`);
  }
}

const mClient = new ManagementClient({
  projectId: argv.projectId, // id of your Kentico Kontent project
  apiKey: argv.managementKey, // Content management API token
});

glob(`${argv.folder}/*.json`, async (err, files) => { // read the folder or folders if you want: example json/**/*.json

  let missingArticles = [];
  if (argv.justMissing) {
    missingArticles = await findMissingArticles();
  }

  logInfo(`Starting generation at: ${new Date().toISOString()}`);

  if (err) {
    console.error("cannot read the folder, something goes wrong with glob", err);
    return;
  }

  logInfo(`Loading files: ${files}`);

  for (const file of files) {

    fs.readFile(file, 'utf8', async (err, data) => { // Read each file
      if (err) {
        console.error("cannot read the file, something goes wrong with the file", err);
      }

      logInfo(`Importing file:${file}`);

      const items = JSON.parse(data);

      for (const article of items) {

        if (argv.justMissing) {
          if (missingArticles.indexOf(article.articleNumber) < 0) {
            logInfo(`Skipping item: (${article.articleNumber}) ${article.title}`);
            continue;
          }
        }

        logInfo(`Importing item: (${article.articleNumber}) ${article.title}`);

        try {

          const assetData = await getAssetDataDataFromUrl(article.image.url);

          logInfo('Uploading binary...');
          const assetObject = await mClient.uploadBinaryFile().withData(assetData).toPromise();
          logInfo('Upload binary finished');

          logInfo('Add asset...');
          const asset = await mClient.addAsset()
            .withData({
              descriptions: [{
                language: {
                  codename: argv.language
                },
                description: `Image for article ${article.title}`
              }],
              external_id: (argv.ignoreExternalId) ? undefined : article.image.id,
              file_reference: {
                ...assetObject.data
              }
            })
            .toPromise();
          logInfo('Add asset finished');

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

          logInfo('Add language variant...');
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
          logInfo('Add language variant finished');

          logInfo('Publish variant...');
          await mClient
            .publishOrScheduleLanguageVariant()
            .byItemId(languageVariant.data.item.id)
            .byLanguageId(languageVariant.data.language.id)
            .withoutData()
            .toPromise();
          logInfo('Publish variant finished');


        } catch (error) {
          if (error && error.config && error.config.data) {
            delete error.config.data;
          }
          console.error(JSON.stringify(error, null, 2));
        }
      }
    });
  }
});

